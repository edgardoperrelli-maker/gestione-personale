const KEY = 'crono:collapsedTerritori';

/**
 * Chiave riservata dentro lo STESSO insieme persistito dei territori.
 * Semantica invertita rispetto alle altre: se è presente, il blocco assenze è
 * APERTO. Serve così perché le assenze nascono riassunte (default = assente
 * dall'insieme = riassunto), mentre i territori nascono espansi.
 * Non può collidere con un id territorio, che è un UUID.
 */
export const ASSENZE_APERTE_KEY = '__assenze:aperte__';

/**
 * Chiave riservata: presente = sabato e domenica ESTESI come gli altri giorni.
 * Semantica invertita come le assenze: il weekend nasce ridotto a una striscia
 * (all'accesso la settimana lavorativa si prende tutta la piega) e chi ci lavora
 * lo riapre, con la scelta persistita.
 * Non può collidere con un id territorio, che è un UUID.
 */
export const WEEKEND_APERTO_KEY = '__weekend:aperto__';

/** Parsing puro e robusto del valore localStorage → array di chiavi territorio. */
export function parseCollapsed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function loadCollapsed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseCollapsed(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveCollapsed(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* ignora errori quota/privacy */
  }
}
