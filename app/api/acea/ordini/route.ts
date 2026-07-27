import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  COLONNE_ELENCO, COLONNE_TESTO,
  leggiFiltri, soglieScadenza, intervalloPagina, espressioneRicerca,
} from '@/lib/acea/filtriOrdini';
import { partiRoma } from '@/lib/agente/orarioRoma';

export const runtime = 'nodejs';

/** Colonne del registro esposte alla tabella. Non `select('*')`: il payload viaggia a ogni pagina. */
const COLONNE = [
  'odl', 'numero_operazione', 'famiglia', 'tipo_ordine', 'attivita', 'denominazione',
  'stato', 'stato_desc', 'aperto',
  'data_creazione', 'cardine_al', 'scadenza', 'data_completamento',
  'operatore_cognome', 'operatore_nome',
  'causale', 'causale_desc', 'esito_positivo',
  'via', 'civico', 'cap', 'comune', 'provincia',
  'impianto', 'matricola', 'matricola_norm', 'sospetto_troncamento',
  'valore_netto', 'escludi_consuntivazione', 'codice_sla', 'priorita_testo',
  'testo_ordine', 'centro_lavoro',
].join(', ');

type OrdineRow = Record<string, unknown> & { odl: string; numero_operazione: string };

/**
 * GET /api/acea/ordini — registro filtrato e paginato.
 *
 * Query: famiglia, stato (tutti|aperti|chiusi), scadenza (tutte|scaduti|in_scadenza|senza_scadenza),
 * entroGiorni, cerca, pagina, perPagina, più i filtri di colonna:
 * - a elenco, ripetibili (`comune=ROMA&comune=TIVOLI`): comune, attivita, stato_desc,
 *   operatore_cognome — in OR fra i valori della stessa colonna, in AND fra colonne diverse;
 * - a testo «contiene»: odl, matricola_norm, impianto, via.
 *
 * I filtri di colonna si applicano QUI e non sul client: la tabella carica 300 righe per volta su
 * un registro da 5.000+, quindi filtrare il caricato mostrerebbe un sottoinsieme di un
 * sottoinsieme, con un conteggio che non corrisponde a niente.
 *
 * Ogni riga porta la PIANIFICAZIONE agganciata (esecutore e giorno dagli `interventi`): il
 * registro resta lo specchio immutabile di ACEA, il nostro lavoro vive altrove e si unisce qui
 * in lettura — è il "riporto" che prima l'agente scriveva dentro il file master.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const f = leggiFiltri(searchParams);
    // "oggi" nel fuso di lavoro, non in UTC: alle 01:00 di Roma d'estate UTC è ancora ieri, e
    // un ordine in scadenza oggi risulterebbe scaduto.
    const oggi = partiRoma(new Date()).oggi;

    let q = supabaseAdmin.from('acea_ordini').select(COLONNE, { count: 'exact' });

    if (f.famiglia) q = q.eq('famiglia', f.famiglia);
    if (f.stato === 'aperti') q = q.eq('aperto', true);
    if (f.stato === 'chiusi') q = q.eq('aperto', false);

    // Filtri di colonna. `in` per le spunte (un valore solo resta un `in` di uno: stesso piano di
    // esecuzione di `eq` su Postgres), `ilike` per il «contiene».
    for (const c of COLONNE_ELENCO) {
      const valori = f.elenchi[c];
      if (valori.length > 0) q = q.in(c, valori);
    }
    for (const c of COLONNE_TESTO) {
      const t = f.testi[c];
      if (t) q = q.ilike(c, `*${t}*`);
    }

    const soglie = soglieScadenza(f, oggi);
    if (soglie.tipo === 'scaduti') q = q.lt('scadenza', soglie.prima);
    else if (soglie.tipo === 'in_scadenza') q = q.gte('scadenza', soglie.da).lte('scadenza', soglie.a);
    else if (soglie.tipo === 'senza_scadenza') q = q.is('scadenza', null);

    const ricerca = espressioneRicerca(f);
    if (ricerca) q = q.or(ricerca);

    const { da, a } = intervalloPagina(f);
    const { data, error, count } = await q
      .order('scadenza', { ascending: true, nullsFirst: false })
      .order('data_creazione', { ascending: true })
      .order('odl', { ascending: true })
      .order('numero_operazione', { ascending: true })
      .range(da, a);
    if (error) throw error;

    const righe = (data ?? []) as unknown as OrdineRow[];

    // Pianificazione: solo per gli ODL della pagina corrente (non per tutto il registro).
    const odlPagina = [...new Set(righe.map((r) => r.odl))];
    const pianificazione = new Map<string, { data: string | null; staff_id: string | null; stato: string | null }>();
    if (odlPagina.length > 0) {
      for (let i = 0; i < odlPagina.length; i += 200) {
        const blocco = odlPagina.slice(i, i + 200);
        const { data: interventi, error: eInt } = await supabaseAdmin
          .from('interventi')
          .select('odl, data, staff_id, stato')
          .in('odl', blocco)
          .in('committente', ['acea', 'lim_massive'])
          .order('data', { ascending: false });
        if (eInt) throw eInt;
        for (const it of (interventi ?? []) as Array<{ odl: string | null; data: string | null; staff_id: string | null; stato: string | null }>) {
          // Più interventi sullo stesso ODL: vince il più recente (l'ordinamento è discendente).
          if (it.odl && !pianificazione.has(it.odl)) {
            pianificazione.set(it.odl, { data: it.data, staff_id: it.staff_id, stato: it.stato });
          }
        }
      }
    }

    // Nomi operatore: staff_id → display_name, per non mostrare uuid in tabella.
    const staffIds = [...new Set([...pianificazione.values()].map((p) => p.staff_id).filter(Boolean))] as string[];
    const nomi = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staff } = await supabaseAdmin.from('staff').select('id, display_name').in('id', staffIds);
      for (const s of (staff ?? []) as Array<{ id: string; display_name: string }>) nomi.set(s.id, s.display_name);
    }

    const conPianificazione = righe.map((r) => {
      const p = pianificazione.get(r.odl);
      return {
        ...r,
        pianificato_il: p?.data ?? null,
        pianificato_a: p?.staff_id ? (nomi.get(p.staff_id) ?? p.staff_id) : null,
        stato_intervento: p?.stato ?? null,
      };
    });

    return NextResponse.json(
      {
        righe: conPianificazione,
        totale: count ?? conPianificazione.length,
        pagina: f.pagina,
        perPagina: f.perPagina,
        oggi,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura registro ACEA.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/acea/ordini — i contatori di testa del modulo.
 *
 * Query separata dai filtri perché sono i numeri che il modulo mostra in apertura, sempre gli
 * stessi e indipendenti da cosa l'utente sta filtrando. POST e non GET solo per non confondersi
 * con la lista sullo stesso path: non riceve corpo.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const oggi = partiRoma(new Date()).oggi;
    const conta = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count, error } = await build(base());
      if (error) throw error;
      return count ?? 0;
    };
    function base() {
      return supabaseAdmin.from('acea_ordini').select('odl', { count: 'exact', head: true });
    }

    const [apertiDunning, apertiMassive, scaduti, inScadenza, senzaMisuratore] = await Promise.all([
      conta((q) => q.eq('famiglia', 'dunning').eq('aperto', true)),
      conta((q) => q.eq('famiglia', 'massive').eq('aperto', true)),
      conta((q) => q.eq('aperto', true).lt('scadenza', oggi)),
      conta((q) => q.eq('aperto', true).gte('scadenza', oggi)
        .lte('scadenza', new Date(Date.parse(`${oggi}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10))),
      conta((q) => q.is('impianto', null).is('matricola', null)),
    ]);

    const { data: ultimo } = await supabaseAdmin
      .from('acea_import')
      .select('caricato_il, righe_totali, finestra_dal, finestra_al')
      .order('caricato_il', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      { oggi, apertiDunning, apertiMassive, scaduti, inScadenza, senzaMisuratore, ultimoImport: ultimo ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore riepilogo ACEA.' },
      { status: 500 },
    );
  }
}
