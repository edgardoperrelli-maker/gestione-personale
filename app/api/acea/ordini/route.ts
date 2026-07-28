import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  COLONNE_ELENCO, COLONNE_TESTO,
  leggiFiltri, soglieScadenza, intervalloPagina, espressioneRicerca,
  filtriPianificazioneAttivi, type FiltriOrdini, type FiltriPianificazione,
} from '@/lib/acea/filtriOrdini';
import { partiRoma } from '@/lib/agente/orarioRoma';

export const runtime = 'nodejs';

/** I due committenti che alimentano questo registro. */
const COMMITTENTI = ['acea', 'lim_massive'];

/** Pagina delle scansioni interne (chiavi, interventi): non esce dal server, può essere ampia. */
const PAGINA_SCAN = 1000;

/** Colonne del registro esposte alla tabella. Non `select('*')`: il payload viaggia a ogni pagina. */
const COLONNE = [
  'odl', 'numero_operazione', 'famiglia', 'tipo_ordine', 'attivita', 'denominazione',
  'stato', 'stato_desc', 'aperto',
  'data_creazione', 'cardine_al', 'scadenza', 'data_completamento',
  'operatore_cognome', 'operatore_nome',
  'causale', 'causale_desc', 'esito_positivo',
  'via', 'civico', 'cap', 'comune', 'provincia', 'microarea', 'microarea_stimata',
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
/** La query sul registro con tutti i criteri ACEA e l'ordinamento canonico. */
function queryRegistro(selezione: string, f: FiltriOrdini, oggi: string) {
  let q = supabaseAdmin.from('acea_ordini').select(selezione, { count: 'exact' });

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

  // L'ordinamento è TOTALE (la coppia odl+operazione è unica): senza, due pagine successive
  // potrebbero ripetere o saltare righe, perché Postgres non garantisce un ordine stabile fra
  // query diverse a parità di chiave di ordinamento.
  return q
    .order('scadenza', { ascending: true, nullsFirst: false })
    .order('data_creazione', { ascending: true })
    .order('odl', { ascending: true })
    .order('numero_operazione', { ascending: true });
}

type Chiave = { odl: string; numero_operazione: string };

/** Tutte le chiavi che passano i criteri ACEA, nell'ordine della tabella. */
async function scansionaChiavi(f: FiltriOrdini, oggi: string): Promise<Chiave[]> {
  const chiavi: Chiave[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await queryRegistro('odl, numero_operazione', f, oggi)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as unknown as Chiave[];
    chiavi.push(...blocco);
    if (blocco.length < PAGINA_SCAN) break;
  }
  return chiavi;
}

type VoceIntervento = { odl: string | null; data: string | null; staff_id: string | null; stato: string | null };

/** Tutti gli interventi delle due famiglie: `odl` → chi e quando. Serve al predicato, non al display. */
async function indicePianificazione(): Promise<Map<string, { staff: Set<string>; giorni: Set<string> }>> {
  const indice = new Map<string, { staff: Set<string>; giorni: Set<string> }>();
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('odl, data, staff_id')
      .in('committente', COMMITTENTI)
      .order('odl', { ascending: true })
      .order('data', { ascending: true })
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as VoceIntervento[];
    for (const it of blocco) {
      if (!it.odl) continue;
      const v = indice.get(it.odl) ?? { staff: new Set<string>(), giorni: new Set<string>() };
      if (it.staff_id) v.staff.add(it.staff_id);
      if (it.data) v.giorni.add(it.data);
      indice.set(it.odl, v);
    }
    if (blocco.length < PAGINA_SCAN) break;
  }
  return indice;
}

/**
 * Il predicato dei due filtri di pianificazione, per un singolo ODL.
 *
 * Dentro la stessa colonna i criteri sono in OR (le spunte di un AutoFiltro lo sono sempre: gli
 * ordini di ROSSI **oppure** quelli non assegnati); fra colonne diverse sono in AND, come per ogni
 * altra colonna della tabella.
 */
function passaPianificazione(
  odl: string,
  p: FiltriPianificazione,
  indice: Map<string, { staff: Set<string>; giorni: Set<string> }>,
  staffScelti: Set<string>,
): boolean {
  const v = indice.get(odl);

  if (p.esecutori.length > 0 || p.senzaEsecutore) {
    const assegnatoAUnoScelto = v ? [...v.staff].some((s) => staffScelti.has(s)) : false;
    const nonAssegnato = !v || v.staff.size === 0;
    if (!(assegnatoAUnoScelto || (p.senzaEsecutore && nonAssegnato))) return false;
  }

  if (p.pianificazione === 'non_pianificati' && v && v.giorni.size > 0) return false;
  if (p.pianificazione === 'pianificati' && (!v || v.giorni.size === 0)) return false;
  if (p.giorno && !v?.giorni.has(p.giorno)) return false;

  return true;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const f = leggiFiltri(searchParams);
    // "oggi" nel fuso di lavoro, non in UTC: alle 01:00 di Roma d'estate UTC è ancora ieri, e
    // un ordine in scadenza oggi risulterebbe scaduto.
    const oggi = partiRoma(new Date()).oggi;
    const { da, a } = intervalloPagina(f);

    let righe: OrdineRow[];
    let totale: number;

    if (!filtriPianificazioneAttivi(f.pianificazione)) {
      // Percorso normale: una sola interrogazione paginata, il conteggio lo fa Postgres.
      const { data, error, count } = await queryRegistro(COLONNE, f, oggi).range(da, a);
      if (error) throw error;
      righe = (data ?? []) as unknown as OrdineRow[];
      totale = count ?? righe.length;
    } else {
      /*
        Percorso di INCROCIO, per i due filtri che non vivono nel registro.

        Esecutore e Data pianificata stanno in `interventi`: Postgres non può filtrarli dentro la
        query su `acea_ordini`, e passargli la lista degli ODL sarebbe una URL da decine di
        migliaia di caratteri. Quindi si scaricano le sole CHIAVI che passano i criteri ACEA
        (~5.300 coppie odl+operazione, una manciata di richieste su due colonne corte), si
        incrociano in memoria con gli interventi, e si impagina il risultato dell'incrocio.

        È l'unico modo per far dire la verità al conteggio: filtrare le 300 righe già scese
        mostrerebbe «12 di 871» quando i non pianificati sono 400. Si paga solo quando uno dei due
        filtri è acceso — la vista normale resta una query sola.
      */
      const [chiavi, indice] = await Promise.all([scansionaChiavi(f, oggi), indicePianificazione()]);

      // Nomi scelti → staff_id. Il filtro parla di persone, il registro di identificativi.
      const staffScelti = new Set<string>();
      if (f.pianificazione.esecutori.length > 0) {
        const { data: staff, error: eStaff } = await supabaseAdmin
          .from('staff')
          .select('id, display_name')
          .in('display_name', f.pianificazione.esecutori);
        if (eStaff) throw eStaff;
        for (const s of (staff ?? []) as Array<{ id: string }>) staffScelti.add(s.id);
      }

      const passate = chiavi.filter((k) => passaPianificazione(k.odl, f.pianificazione, indice, staffScelti));
      totale = passate.length;

      const pagina = passate.slice(da, a + 1);
      if (pagina.length === 0) {
        righe = [];
      } else {
        // Solo le righe della pagina: al massimo `perPagina` ODL, quindi un `in` corto.
        const { data, error } = await supabaseAdmin
          .from('acea_ordini')
          .select(COLONNE)
          .in('odl', [...new Set(pagina.map((k) => k.odl))]);
        if (error) throw error;
        const perChiave = new Map(
          ((data ?? []) as unknown as OrdineRow[]).map((r) => [`${r.odl}|${r.numero_operazione}`, r]),
        );
        // Riordinate come le chiavi: `in` non conserva l'ordine, e un ODL con più operazioni ne
        // riporta indietro anche di non richieste.
        righe = pagina
          .map((k) => perChiave.get(`${k.odl}|${k.numero_operazione}`))
          .filter((r): r is OrdineRow => Boolean(r));
      }
    }

    // Pianificazione da mostrare: solo per gli ODL della pagina corrente (non per tutto il
    // registro). Anche nel percorso di incrocio si rilegge da qui, perché serve pure lo `stato`
    // e l'intervento PIÙ RECENTE, che il predicato non guarda.
    const odlPagina = [...new Set(righe.map((r) => r.odl))];
    const pianificazione = new Map<string, { data: string | null; staff_id: string | null; stato: string | null }>();
    if (odlPagina.length > 0) {
      for (let i = 0; i < odlPagina.length; i += 200) {
        const blocco = odlPagina.slice(i, i + 200);
        const { data: interventi, error: eInt } = await supabaseAdmin
          .from('interventi')
          .select('odl, data, staff_id, stato')
          .in('odl', blocco)
          .in('committente', COMMITTENTI)
          .order('data', { ascending: false });
        if (eInt) throw eInt;
        for (const it of (interventi ?? []) as VoceIntervento[]) {
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
        totale,
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
      {
        oggi,
        // L'orologio del SERVER: l'età dell'ultimo import si calcolava su quello del browser, che
        // può essere sfasato di ore. Su un contatore il cui scopo è dire «questo dato è vecchio»,
        // un orologio sbagliato produce esattamente l'errore che il contatore dovrebbe impedire.
        adesso: new Date().toISOString(),
        apertiDunning, apertiMassive, scaduti, inScadenza, senzaMisuratore,
        ultimoImport: ultimo ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore riepilogo ACEA.' },
      { status: 500 },
    );
  }
}
