// lib/interventi/storico/filtri.ts
// PURA: parsing e validazione dei filtri della consultazione storico.
import { COMMITTENTE_OPZIONI, STATI_INTERVENTI, STATI_MANUALI, ESITO_LABELS } from './types';

export type FiltriStorico = {
  q: string;
  data: string | null;
  dal: string | null;
  al: string | null;
  esecutore: string | null;
  comune: string;
  committente: string | null;
  stato: string | null;
  esito: string | null;
  page: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COMMITTENTI = new Set(COMMITTENTE_OPZIONI.map((o) => o.value));
const STATI = new Set<string>([...STATI_INTERVENTI, ...STATI_MANUALI]);
const ESITI = new Set(Object.keys(ESITO_LABELS));

function iso(v: string | null): string | null {
  return v && ISO.test(v) ? v : null;
}
function trimOrNull(v: string | null): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Rimuove i caratteri che romperebbero un filtro `.or()/.ilike()` PostgREST. */
export function puliziaQ(q: string | null | undefined): string {
  // Rimuove SOLO i caratteri strutturali del filtro PostgREST .or()/.ilike() (virgole/parentesi/%/*). I valori viaggiano come parametri del client Supabase JS (non SQL concatenato), quindi apostrofi e ';' sono volutamente mantenuti (es. "Sant'Angelo").
  return (q ?? '').replace(/[,()%*]/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseFiltriStorico(params: URLSearchParams, _oggi: string): FiltriStorico {
  const committenteRaw = params.get('committente') ?? '';
  const statoRaw = params.get('stato') ?? '';
  const esitoRaw = params.get('esito') ?? '';
  const pageNum = Number.parseInt(params.get('page') ?? '0', 10);
  return {
    q: (params.get('q') ?? '').trim(),
    data: iso(params.get('data')),
    dal: iso(params.get('dal')),
    al: iso(params.get('al')),
    esecutore: trimOrNull(params.get('esecutore')),
    comune: (params.get('comune') ?? '').trim(),
    committente: COMMITTENTI.has(committenteRaw) ? committenteRaw : null,
    stato: STATI.has(statoRaw) ? statoRaw : null,
    esito: ESITI.has(esitoRaw) ? esitoRaw : null,
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 0,
  };
}

/** Vincolo data da applicare alla query: con `q` si cerca su tutto lo storico. */
export function risolviFinestra(
  f: FiltriStorico,
  oggi: string,
): { eq: string | null; gte: string | null; lte: string | null } {
  if (f.q) return { eq: null, gte: null, lte: null }; // con q attiva si cerca su tutto lo storico (nessun vincolo data)
  if (f.dal || f.al) return { eq: null, gte: f.dal, lte: f.al };
  return { eq: f.data ?? oggi, gte: null, lte: null };
}

/** Interroga `interventi` se nessun filtro stato esclusivo dei manuali lo impedisce. */
export function interrogaInterventi(f: FiltriStorico): boolean {
  return f.stato == null || (STATI_INTERVENTI as readonly string[]).includes(f.stato);
}

/** Interroga `interventi_manuali` solo se i filtri non li escludono. */
export function interrogaManuali(f: FiltriStorico): boolean {
  if (f.esito) return false;
  return f.stato == null || (STATI_MANUALI as readonly string[]).includes(f.stato);
}
