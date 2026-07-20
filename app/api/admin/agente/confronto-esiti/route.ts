// GET /api/admin/agente/confronto-esiti?storico=1 — confronto on-demand tra i positivi del
// nostro DB e lo stato del portale ACEA (acea_portale_snapshot, consegnato dall'agente a ogni
// "Aggiorna stato ODL"). Solo lettura, nessuna scrittura. Logica pura e decisioni di design in
// lib/agente/confrontoEsitiAcea.ts. Default: finestra corrente (agente_config.finestra_giorni);
// con ?storico=1 confronta tutto lo storico dei positivi.
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  confrontaEsiti,
  type FontePositivoDb,
  type PositivoDb,
  type SnapshotRow,
} from '@/lib/agente/confrontoEsitiAcea';
import { normOdl } from '@/lib/interventi/odlPositivi';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

/** Ambito del confronto: solo il gruppo attività DUNNING (decisione utente 20/07 — gli ODL
 *  delle massive e i lavori senza ODS reale, cioè ordini ancora da creare, restano fuori). */
const GRUPPO_AMBITO = 'DUNNING';

export const runtime = 'nodejs';

const PAGE = 1000;
const CHUNK_IN = 200;
// Valori reali a DB: 'SI' (normalizzazione MAIUSCOLO); le varianti sono cintura di sicurezza.
const SI_VARIANTS = ['SI', 'Si', 'si', 'SÌ', 'sì'];

type QueryPagina<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Scarica tutte le righe a pagine di PAGE (PostgREST tronca a ~1000 per richiesta). */
async function tutteLePagine<T>(query: QueryPagina<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type VoceSiRow = { odl: string | null; attivita: string | null; rapportini: { data: string | null } | { data: string | null }[] | null };
type IntPosRow = { odl: string | null; data: string | null; gruppo_attivita: string | null };
type IntStatoRow = { odl: string | null; stato: string; esito: string | null; data: string | null };

function dataRapportino(r: VoceSiRow): string | null {
  const rap = Array.isArray(r.rapportini) ? (r.rapportini[0] ?? null) : r.rapportini;
  return rap?.data ?? null;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const storico = ['1', 'true'].includes(String(searchParams.get('storico') ?? '').toLowerCase());

    const { data: cfg } = await supabaseAdmin
      .from('agente_config').select('finestra_giorni').eq('id', 1).maybeSingle();
    const finestraGiorni = (cfg as { finestra_giorni: number | null } | null)?.finestra_giorni ?? 60;

    const snapshot = await tutteLePagine<SnapshotRow>((from, to) =>
      supabaseAdmin
        .from('acea_portale_snapshot')
        .select('odl, stato_norm, causa_scostamento, run_id, raccolto_at, operatore')
        .order('odl', { ascending: true })
        .range(from, to),
    );
    if (snapshot.length === 0) {
      return NextResponse.json(
        { vuoto: true, motivo: 'Nessuno snapshot del portale: lancia prima "Aggiorna stato ODL".' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const aggiornatoAl = snapshot.reduce<string | null>(
      (max, r) => (String(r.raccolto_at ?? '') > String(max ?? '') ? r.raccolto_at : max),
      null,
    );

    // Positivi DB su TUTTO lo storico (servono comunque alla direzione ACEA→DB per evitare
    // falsi "mancanti" su lavori vecchi); la finestra e l'AMBITO Dunning filtrano solo
    // l'insieme verificato della direzione DB→ACEA.
    const intPositivi = await tutteLePagine<IntPosRow>((from, to) =>
      supabaseAdmin
        .from('interventi')
        .select('odl, data, gruppo_attivita')
        .eq('committente', 'acea')
        .eq('esito', 'eseguito_positivo')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    const vociSi = await tutteLePagine<VoceSiRow>((from, to) =>
      supabaseAdmin
        .from('rapportino_voci')
        .select('odl, attivita, rapportini!inner(data)')
        .in('risposte->>eseguito', SI_VARIANTS)
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    const odlInterventi = await tutteLePagine<{ odl: string | null; committente: string | null; gruppo_attivita: string | null }>((from, to) =>
      supabaseAdmin
        .from('interventi')
        .select('odl, committente, gruppo_attivita')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );

    // Tassonomia (best-effort): risolve il gruppo delle VOCI dalla loro attività, per
    // riconoscere come Dunning anche le voci SI mai materializzate in interventi.
    let indiceTassonomia: Map<string, TassonomiaRiga> | null = null;
    try {
      indiceTassonomia = buildTassonomiaIndex(await caricaTassonomia());
    } catch {
      indiceTassonomia = null;
    }
    const gruppoVoce = (attivita: string | null): string | null =>
      indiceTassonomia ? (risolviGruppo('acea', attivita, indiceTassonomia)?.gruppo ?? null) : null;

    const odlAceaNoti = new Set<string>();
    for (const s of snapshot) { const k = normOdl(s.odl); if (k) odlAceaNoti.add(k); }
    const odlTuttiInterventi = new Set<string>();
    const odlAceaInterventi = new Set<string>();
    const odlDunningNoti = new Set<string>(); // odl con almeno una riga interventi in ambito
    for (const r of odlInterventi) {
      const k = normOdl(r.odl);
      if (!k) continue;
      odlTuttiInterventi.add(k);
      if (r.committente === 'acea') {
        odlAceaInterventi.add(k);
        if (r.gruppo_attivita === GRUPPO_AMBITO) odlDunningNoti.add(k);
      }
    }

    // Due mappe: TUTTI i positivi (anti falsi-mancanti) e i positivi in AMBITO (verificati),
    // con la fonte per la doppia conferma (intervento chiuso / voce rapportino / entrambi).
    const posTutti = new Map<string, PositivoDb>();
    const posAmbito = new Map<string, PositivoDb>();
    const registra = (mappa: Map<string, PositivoDb>, odlRaw: string | null, data: string | null, fonte: FontePositivoDb) => {
      const k = normOdl(odlRaw);
      if (!k) return;
      const cur = mappa.get(k);
      if (!cur) {
        mappa.set(k, { odl: String(odlRaw).trim(), data, fonte });
      } else {
        if ((data ?? '') > (cur.data ?? '')) cur.data = data;
        if (cur.fonte !== fonte) cur.fonte = 'entrambi';
      }
    };
    for (const r of intPositivi) {
      registra(posTutti, r.odl, r.data, 'intervento');
      if (r.gruppo_attivita === GRUPPO_AMBITO) registra(posAmbito, r.odl, r.data, 'intervento');
    }
    for (const v of vociSi) {
      const k = normOdl(v.odl);
      if (!k) continue;
      // riconducibile ad ACEA (in interventi ACEA o nel portale): esclude i flussi non ACEA
      if (!odlAceaNoti.has(k) && !odlAceaInterventi.has(k)) continue;
      registra(posTutti, v.odl, dataRapportino(v), 'voce');
      // in ambito se l'ODL è noto come Dunning in interventi o la voce risolve al gruppo Dunning
      if (odlDunningNoti.has(k) || gruppoVoce(v.attivita) === GRUPPO_AMBITO) {
        registra(posAmbito, v.odl, dataRapportino(v), 'voce');
      }
    }

    const cutoff = new Date(Date.now() - finestraGiorni * 86400000).toISOString().slice(0, 10);
    const positiviDb = [...posAmbito.values()].filter((p) => storico || (p.data ?? '') >= cutoff);
    const positiviDbTutti = new Set(posTutti.keys());
    const odlConosciuti = new Set<string>([...odlDunningNoti, ...posAmbito.keys()]);
    const odlFuoriAmbito = new Set<string>(
      [...odlTuttiInterventi, ...positiviDbTutti].filter((k) => !odlConosciuti.has(k)),
    );

    const confronto = confrontaEsiti({ positiviDb, snapshot, positiviDbTutti, odlConosciuti, odlFuoriAmbito });

    // Arricchimento "mancanti": cosa dice il nostro DB per quegli ODL (negativo/aperto/annullato).
    const mancantiOdl = confronto.aceaVersoDb.mancanti.map((m) => m.odl);
    const statoDbByOdl = new Map<string, { statoDb: string; ultimaData: string | null }>();
    for (let i = 0; i < mancantiOdl.length; i += CHUNK_IN) {
      const blocco = mancantiOdl.slice(i, i + CHUNK_IN);
      const { data: rows } = await supabaseAdmin
        .from('interventi')
        .select('odl, stato, esito, data')
        .in('odl', blocco);
      for (const r of (rows ?? []) as IntStatoRow[]) {
        const k = normOdl(r.odl);
        if (!k) continue;
        const cur = statoDbByOdl.get(k) ?? { statoDb: '', ultimaData: null };
        const negativo = r.stato === 'completato' && r.esito !== 'eseguito_positivo';
        const aperto = r.stato !== 'completato' && r.stato !== 'annullato';
        // priorità del racconto: negativo > aperto > annullato
        const label = negativo ? 'esitato negativo' : aperto ? 'ancora aperto' : 'annullato';
        const rank = (s: string) => (s === 'esitato negativo' ? 3 : s === 'ancora aperto' ? 2 : s === 'annullato' ? 1 : 0);
        if (rank(label) > rank(cur.statoDb)) cur.statoDb = label;
        if ((r.data ?? '') > (cur.ultimaData ?? '')) cur.ultimaData = r.data;
        statoDbByOdl.set(k, cur);
      }
    }
    const mancanti = confronto.aceaVersoDb.mancanti.map((m) => ({
      ...m,
      statoDb: statoDbByOdl.get(normOdl(m.odl))?.statoDb ?? null,
      ultimaData: statoDbByOdl.get(normOdl(m.odl))?.ultimaData ?? null,
    }));

    return NextResponse.json(
      {
        aggiornatoAl,
        finestraGiorni,
        storico,
        dbVersoAcea: confronto.dbVersoAcea,
        aceaVersoDb: { ...confronto.aceaVersoDb, mancanti },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore confronto esiti.' },
      { status: 500 },
    );
  }
}
