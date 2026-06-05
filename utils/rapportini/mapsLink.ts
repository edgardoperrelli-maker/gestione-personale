const BASE = 'https://www.google.com/maps/search/?api=1&query=';

/** URL Google Maps verso il punto esatto. `coord` è già "lat, lng" normalizzata. */
export function mapsUrlFromCoordinate(coord: string): string {
  return BASE + encodeURIComponent(coord.replace(/\s+/g, ''));
}

/** URL Google Maps di ricerca per indirizzo (via, comune, cap). */
export function mapsUrlFromAddress(
  via?: string | null,
  comune?: string | null,
  cap?: string | null,
): string {
  const q = [via, cap, comune].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  return BASE + encodeURIComponent(q);
}
