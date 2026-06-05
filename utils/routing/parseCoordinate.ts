/** Cella (numero o stringa con virgola/punto decimale) → numero finito, o null. */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Arrotonda a 7 decimali (~1cm) e rimuove il rumore float. */
function fmt(n: number): string {
  return String(Math.round(n * 1e7) / 1e7);
}

/**
 * Coordinata committente da DUE colonne (lat, lng).
 * Accetta numeri o stringhe con virgola decimale all'italiana.
 * Ritorna "lat, lng" (sempre col PUNTO) oppure null se non valida.
 */
export function parseLatLng(lat: unknown, lng: unknown): string | null {
  const la = toNum(lat);
  const ln = toNum(lng);
  if (la == null || ln == null) return null;
  if (la === 0 && ln === 0) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return `${fmt(la)}, ${fmt(ln)}`;
}
