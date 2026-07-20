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
  type PositivoDb,
  type SnapshotRow,
} from '@/lib/agente/confrontoEsitiAcea';
import { normOdl } from '@/lib/interventi/odlPositivi';

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

type VoceSiRow = { odl: string | null; rapportini: { data: string | null } | { data: string | null }[] | null };
type IntPosRow = { odl: string | null; data: string | null };
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
    // falsi "mancanti" su lavori vecchi); la finestra filtra solo la direzione DB→ACEA.
    const intPositivi = await tutteLePagine<IntPosRow>((from, to) =>
      supabaseAdmin
        .from('interventi')
        .select('odl, data')
        .eq('committente', 'acea')
        .eq('esito', 'eseguito_positivo')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    const vociSi = await tutteLePagine<VoceSiRow>((from, to) =>
      supabaseAdmin
        .from('rapportino_voci')
        .select('odl, rapportini!inner(data)')
        .in('risposte->>eseguito', SI_VARIANTS)
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    const odlInterventi = await tutteLePagine<{ odl: string | null; committente: string | null }>((from, to) =>
      supabaseAdmin
        .from('interventi')
        .select('odl, committente')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );

    // odl(norm) → { odl grezzo, data più recente } dai due canali (intervento positivo, voce SI).
    // Le voci SI valgono solo se l'ODL è riconducibile ad ACEA (in interventi ACEA o nel
    // portale stesso): esclude i flussi non ACEA (es. P.I.) senza perdere i positivi veri.
    const odlAceaNoti = new Set<string>();
    for (const s of snapshot) { const k = normOdl(s.odl); if (k) odlAceaNoti.add(k); }
    // (le righe di intPositivi sono già committente acea)
    const posTutti = new Map<string, PositivoDb>();
    const registra = (odlRaw: string | null, data: string | null) => {
      const k = normOdl(odlRaw);
      if (!k) return;
      const cur = posTutti.get(k);
      if (!cur) posTutti.set(k, { odl: String(odlRaw).trim(), data });
      else if ((data ?? '') > (cur.data ?? '')) cur.data = data;
    };
    for (const r of intPositivi) registra(r.odl, r.data);
    const odlTuttiInterventi = new Set<string>();
    const odlAceaInterventi = new Set<string>();
    for (const r of odlInterventi) {
      const k = normOdl(r.odl);
      if (!k) continue;
      odlTuttiInterventi.add(k);
      if (r.committente === 'acea') odlAceaInterventi.add(k);
    }
    for (const v of vociSi) {
      const k = normOdl(v.odl);
      if (!k) continue;
      if (!odlAceaNoti.has(k) && !odlAceaInterventi.has(k)) continue;
      registra(v.odl, dataRapportino(v));
    }

    const cutoff = new Date(Date.now() - finestraGiorni * 86400000).toISOString().slice(0, 10);
    const positiviDb = [...posTutti.values()].filter((p) => storico || (p.data ?? '') >= cutoff);
    const positiviDbTutti = new Set(posTutti.keys());
    const odlConosciuti = new Set<string>([...odlTuttiInterventi, ...positiviDbTutti]);

    const confronto = confrontaEsiti({ positiviDb, snapshot, positiviDbTutti, odlConosciuti });

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
