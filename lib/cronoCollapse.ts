const KEY = 'crono:collapsedTerritori';

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
