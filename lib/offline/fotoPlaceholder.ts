const PREFISSO = 'blob-locale:';

/** Valore-placeholder per una foto non ancora caricata su storage (riferisce un blob locale). */
export function placeholderFoto(blobId: string): string {
  return `${PREFISSO}${blobId}`;
}

/** True se il valore di una risposta è un placeholder foto (blob locale non ancora caricato). */
export function isPlaceholderFoto(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFISSO) && v.length > PREFISSO.length;
}

/** Estrae il blobId da un placeholder, o null se non è un placeholder. */
export function blobIdDaPlaceholder(v: unknown): string | null {
  return isPlaceholderFoto(v) ? v.slice(PREFISSO.length) : null;
}
