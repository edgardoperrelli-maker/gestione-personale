/** Normalizza un valore-foto (string | string[] | altro) in una lista di path non vuoti. */
export function comeArrayFoto(v: unknown): string[] {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }
  return [];
}
