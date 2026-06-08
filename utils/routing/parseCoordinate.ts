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

/** Bande Italia (non si sovrappongono): lat ~35–48, lng ~6–19 — per riconoscere coordinate invertite. */
function inItalyLat(v: number): boolean { return v >= 35 && v <= 48; }
function inItalyLng(v: number): boolean { return v >= 6 && v <= 19; }

/**
 * Coordinata committente da DUE colonne (lat, lng).
 * Accetta numeri o stringhe con virgola decimale all'italiana.
 * Auto-corregge l'ordine: se i valori sono palesemente invertiti (il "lat" cade in banda
 * longitudine e il "lng" in banda latitudine — coordinate italiane, bande non sovrapposte), li scambia.
 * Ritorna "lat, lng" (sempre col PUNTO) oppure null se non valida.
 */
export function parseLatLng(lat: unknown, lng: unknown): string | null {
  let la = toNum(lat);
  let ln = toNum(lng);
  if (la == null || ln == null) return null;
  if (inItalyLng(la) && inItalyLat(ln)) {
    [la, ln] = [ln, la];
  }
  if (la === 0 && ln === 0) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return `${fmt(la)}, ${fmt(ln)}`;
}
