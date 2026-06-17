// lib/interventi/storico/filtri.ts
// PURA: parsing e validazione dei filtri della consultazione storico.

export type FiltriStorico = {
  q: string;
  data: string | null;
  dal: string | null;
  al: string | null;
  esecutore: string | null;
  comune: string;
  page: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function iso(v: string | null): string | null {
  return v && ISO.test(v) ? v : null;
}
function trimOrNull(v: string | null): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
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
    esecutore: trimOrNull(params.get('esecutore')),
    comune: (params.get('comune') ?? '').trim(),
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 0,
  };
}

/** Vincolo data da applicare alla query: con `q` si cerca su tutto lo storico. */
export function risolviFinestra(
  f: FiltriStorico,
  oggi: string,
): { eq: string | null; gte: string | null; lte: string | null } {
  if (f.q) return { eq: null, gte: null, lte: null }; // con q attiva: tutto lo storico (nessun vincolo data)
  if (f.dal || f.al) return { eq: null, gte: f.dal, lte: f.al };
  return { eq: f.data ?? oggi, gte: null, lte: null };
}
