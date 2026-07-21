// lib/interventi/storico/filtri.ts
// PURA: parsing e validazione dei filtri della consultazione storico.

export type SiNoFiltro = 'SI' | 'NO' | null;

export type FiltriStorico = {
  q: string;
  data: string | null;
  dal: string | null;
  al: string | null;
  /** Multi-selezione: vuoto = tutti. Parametro ripetuto (?esecutore=a&esecutore=b). */
  esecutori: string[];
  /** Gruppi attività della tassonomia (es. 'DUNNING'): vuoto = tutti. */
  gruppi: string[];
  /** Committenti ('acea'|'italgas'|'altro'; lim_massive equivale ad acea): vuoto = tutti. */
  committenti: string[];
  comune: string;
  eseguito: SiNoFiltro;
  sostValvola: SiNoFiltro;
  miniBag: SiNoFiltro;
  rgStop: SiNoFiltro;
  page: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function iso(v: string | null): string | null {
  return v && ISO.test(v) ? v : null;
}
function siNoParam(v: string | null): SiNoFiltro {
  return v === 'SI' || v === 'NO' ? v : null;
}
/** Parametro ripetuto → lista trimmata, senza vuoti né duplicati. */
function listaParam(params: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  for (const v of params.getAll(key)) {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Rimuove SOLO i caratteri strutturali del filtro PostgREST .or()/.ilike()
 * (virgole/parentesi/%/*). I valori viaggiano come parametri del client Supabase JS
 * (non SQL concatenato), quindi apostrofi e ';' sono volutamente mantenuti (es. "Sant'Angelo"). */
export function puliziaQ(q: string | null | undefined): string {
  return (q ?? '').replace(/[,()%*]/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseFiltriStorico(params: URLSearchParams): FiltriStorico {
  const pageNum = Number.parseInt(params.get('page') ?? '0', 10);
  return {
    q: (params.get('q') ?? '').trim(),
    data: iso(params.get('data')),
    dal: iso(params.get('dal')),
    al: iso(params.get('al')),
    esecutori: listaParam(params, 'esecutore'),
    gruppi: listaParam(params, 'gruppo'),
    committenti: listaParam(params, 'committente'),
    comune: (params.get('comune') ?? '').trim(),
    eseguito: siNoParam(params.get('eseguito')),
    sostValvola: siNoParam(params.get('sostValvola')),
    miniBag: siNoParam(params.get('miniBag')),
    rgStop: siNoParam(params.get('rgStop')),
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 0,
  };
}

/** Vincolo data da applicare alla query.
 * - con `q`: tutto lo storico (nessun vincolo data);
 * - con dal/al: range;
 * - con `data`: giorno singolo;
 * - senza nulla: nessun vincolo → INTERO DB. */
export function risolviFinestra(
  f: FiltriStorico,
): { eq: string | null; gte: string | null; lte: string | null } {
  if (f.q) return { eq: null, gte: null, lte: null };
  if (f.dal || f.al) return { eq: null, gte: f.dal, lte: f.al };
  if (f.data) return { eq: f.data, gte: null, lte: null };
  return { eq: null, gte: null, lte: null };
}

/** True se nessun filtro è attivo (→ contatore/export sull'intero DB). */
export function nessunFiltro(f: FiltriStorico): boolean {
  return (
    !f.q && !f.data && !f.dal && !f.al && f.esecutori.length === 0 &&
    f.gruppi.length === 0 && f.committenti.length === 0 && f.comune.trim() === '' &&
    !f.eseguito && !f.sostValvola && !f.miniBag && !f.rgStop
  );
}
