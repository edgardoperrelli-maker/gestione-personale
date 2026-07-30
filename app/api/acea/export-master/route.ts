import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  buildRigaLimMassive, valoreSaracinesca, type RigaDb,
} from '@/lib/limitazione/exportLimMassive';
import { COMMITTENTI_ACEA } from '@/lib/acea/vociRapportino';
import { caricaOrdiniSostituzione } from '@/lib/acea/caricaSaracinesche';
import { chiaviAggancio, type Famiglia } from '@/lib/acea/saracinesche';
import { nomeFileMaster, schemaMaster, type RigaMaster } from '@/lib/acea/fogliExport';
import { intestazioniXlsx, scriviFoglio } from '@/lib/acea/scriviFoglio';

export const runtime = 'nodejs';

const PAGE = 1000;
const CHUNK = 200;

/**
 * GET /api/acea/export-master?famiglia=dunning|massive[&comune=LABICO]
 *
 * Il master rigenerato dal registro, nel layout del file che stiamo spegnendo. È la via d'uscita
 * promessa: il giorno in cui serve una verifica manuale, o semplicemente la rassicurazione di
 * riavere il file com'era, lo si scarica invece di tenere in vita una sincronizzazione che si
 * rompe.
 *
 * I valori di esito, saracinesca, sigillo e note passano dalla STESSA funzione pura che alimenta
 * l'agente (`buildRigaLimMassive`): il file rigenerato dice quello che il file scritto dall'agente
 * direbbe, senza una seconda interpretazione che col tempo divergerebbe.
 *
 * `Odl saracinesca` — la colonna che l'ufficio compilava a mano — qui è derivata: è l'ordine di
 * sostituzione che insiste sullo stesso impianto o sulla stessa matricola.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const f = searchParams.get('famiglia');
  if (f !== 'dunning' && f !== 'massive') {
    return NextResponse.json({ error: 'Parametro famiglia obbligatorio (dunning|massive).' }, { status: 400 });
  }
  const famiglia: Famiglia = f;
  const comune = (searchParams.get('comune') ?? '').trim() || null;

  try {
    // ---- 1. Le righe del master sono gli ordini del registro -------------------------------
    type OrdineRow = {
      odl: string; numero_operazione: string; impianto: string | null; matricola: string | null;
      via: string | null; civico: string | null; cap: string | null; comune: string | null;
      attivita: string | null; stato: string | null;
    };
    const ordini: OrdineRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let q = supabaseAdmin
        .from('acea_ordini')
        .select('odl, numero_operazione, impianto, matricola, via, civico, cap, comune, attivita, stato')
        .eq('famiglia', famiglia);
      if (comune) q = q.eq('comune', comune);
      const { data, error } = await q
        .order('comune', { ascending: true })
        .order('odl', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as OrdineRow[];
      ordini.push(...rows);
      if (rows.length < PAGE) break;
    }
    if (ordini.length === 0) {
      return NextResponse.json(
        { error: `Nessun ordine ${famiglia}${comune ? ` per ${comune}` : ''} nel registro: carica un export ACEA.` },
        { status: 404 },
      );
    }

    // ---- 2. Indirizzo verificato dall'ufficio, quando c'è -----------------------------------
    const impianti = [...new Set(ordini.map((o) => o.impianto).filter((i): i is string => !!i))];
    const verificato = new Map<string, string>();
    for (let i = 0; i < impianti.length; i += CHUNK) {
      const { data } = await supabaseAdmin
        .from('acea_impianti')
        .select('impianto, indirizzo_verificato')
        .in('impianto', impianti.slice(i, i + CHUNK));
      for (const r of (data ?? []) as Array<{ impianto: string; indirizzo_verificato: string | null }>) {
        if (r.indirizzo_verificato) verificato.set(r.impianto, r.indirizzo_verificato);
      }
    }

    // ---- 3. Pianificazione ed esecuzione dal nostro lato ------------------------------------
    const odlUnici = [...new Set(ordini.map((o) => o.odl))];
    type InterventoRow = {
      id: string; odl: string | null; matricola_contatore: string | null; comune: string | null;
      indirizzo: string | null; esito: string | null; esito_motivo: string | null;
      stato: string | null; data: string | null; committente: string | null; origine: string | null;
      staff_id: string | null; pdr: string | null; nominativo: string | null;
      lat: number | null; lng: number | null;
    };
    const interventi: InterventoRow[] = [];
    for (let i = 0; i < odlUnici.length; i += CHUNK) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl, matricola_contatore, comune, indirizzo, esito, esito_motivo, stato, data, committente, origine, staff_id, pdr, nominativo, lat, lng')
        .in('committente', [...COMMITTENTI_ACEA])
        .in('odl', odlUnici.slice(i, i + CHUNK));
      if (error) throw error;
      interventi.push(...((data ?? []) as InterventoRow[]));
    }

    // Un ODL può avere più interventi (riassegnazioni): vale il completato, altrimenti il più
    // recente. È la riga che il master mostrerebbe.
    const perOdl = new Map<string, InterventoRow>();
    for (const i of interventi) {
      if (!i.odl || i.stato === 'annullato') continue;
      const gia = perOdl.get(i.odl);
      const meglio =
        !gia
        || (i.stato === 'completato' && gia.stato !== 'completato')
        || (i.stato === gia.stato && String(i.data ?? '') > String(gia.data ?? ''));
      if (meglio) perOdl.set(i.odl, i);
    }

    const nomi = new Map<string, string>();
    const staffIds = [...new Set([...perOdl.values()].map((i) => i.staff_id).filter((s): s is string => !!s))];
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      const { data } = await supabaseAdmin
        .from('staff').select('id, display_name').in('id', staffIds.slice(i, i + CHUNK));
      for (const s of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
        nomi.set(String(s.id), s.display_name ?? '');
      }
    }

    // Voci del rapportino: sigillo, saracinesca, note, categoria dell'esito.
    const ids = [...perOdl.values()].map((i) => i.id);
    const sigillo = new Map<string, string>();
    const saracinesca = new Map<string, string>();
    const note = new Map<string, string>();
    const eseguito = new Map<string, string>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', ids.slice(i, i + CHUNK));
      for (const v of (data ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>) {
        const k = v.intervento_id;
        if (!k) continue;
        const testo = (chiave: string) =>
          typeof v.risposte?.[chiave] === 'string' ? (v.risposte[chiave] as string) : '';
        if (testo('sigillo') && !sigillo.has(k)) sigillo.set(k, testo('sigillo'));
        const sar = valoreSaracinesca(v.risposte?.['sostituzione_valvola'], v.risposte?.['sost_valvola']);
        if (sar && !saracinesca.has(k)) saracinesca.set(k, sar);
        if (testo('note').trim() && !note.has(k)) note.set(k, testo('note'));
        if (testo('eseguito').trim() && !eseguito.has(k)) eseguito.set(k, testo('eseguito'));
      }
    }

    // ---- 4. `Odl saracinesca`, derivato: l'ordine di sostituzione sullo stesso misuratore ----
    const sostPerChiave = new Map<string, string>();
    for (const o of await caricaOrdiniSostituzione(supabaseAdmin)) {
      for (const k of chiaviAggancio(o)) if (!sostPerChiave.has(k)) sostPerChiave.set(k, o.odl);
    }

    // ---- 5. Righe del foglio ----------------------------------------------------------------
    const righe: RigaMaster[] = ordini.map((o) => {
      const int = perOdl.get(o.odl) ?? null;
      const lm = int
        ? buildRigaLimMassive({
            id: int.id, odl: int.odl, matricola_contatore: int.matricola_contatore,
            comune: int.comune, indirizzo: int.indirizzo, esito: int.esito,
            esito_motivo: int.esito_motivo, stato: int.stato, data: int.data,
            committente: int.committente, origine: int.origine,
            display_name: int.staff_id ? (nomi.get(int.staff_id) ?? null) : null,
            sigillo: sigillo.get(int.id) ?? null, pdr: int.pdr, nominativo: int.nominativo,
            saracinesca: saracinesca.get(int.id) ?? null, note: note.get(int.id) ?? null,
            eseguito_voce: eseguito.get(int.id) ?? null,
          } satisfies RigaDb)
        : null;

      const indirizzoAcea = [o.via, o.civico].filter(Boolean).join(' ') || null;
      return {
        odl: o.odl,
        numero_operazione: o.numero_operazione,
        impianto: o.impianto,
        matricola: o.matricola,
        // L'indirizzo verificato dall'ufficio vince su quello ACEA: è la ragione per cui la
        // colonna esiste, e sul master si è sempre corretto a mano.
        indirizzo: (o.impianto ? verificato.get(o.impianto) : null) ?? indirizzoAcea,
        via: o.via,
        civico: o.civico,
        cap: o.cap,
        comune: o.comune,
        lat: int?.lat ?? null,
        lng: int?.lng ?? null,
        attivita: o.attivita,
        stato: o.stato,
        esecutore: lm?.esecutore || null,
        data_prevista: int?.data ?? null,
        esito: lm?.esitoTesto ?? lm?.esito ?? null,
        saracinesca: lm?.saracinesca || null,
        sigillo: lm?.sigillo || null,
        note: lm?.note || null,
        odl_saracinesca:
          chiaviAggancio(o).map((k) => sostPerChiave.get(k)).find(Boolean) ?? null,
        // AUTOMAZIONE significa «questo valore l'ha messo l'automazione»: qui vale dove un esito
        // dal nostro lato c'è davvero.
        automazione: Boolean(lm?.esito),
      };
    });

    const schema = schemaMaster(famiglia);
    const wb = scriviFoglio(schema.foglio, schema.campi, righe);
    const buf = await wb.xlsx.writeBuffer();
    const nome = nomeFileMaster(famiglia, comune, new Date().toLocaleDateString('sv-SE'));
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: intestazioniXlsx(nome, (buf as unknown as { byteLength: number }).byteLength),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore export master.' },
      { status: 500 },
    );
  }
}
