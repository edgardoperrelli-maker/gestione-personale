const R = 6371; // Earth radius in km

/**
 * Calcola la distanza Haversine tra due punti geografici.
 * @param lat1 Latitudine punto A (gradi decimali)
 * @param lng1 Longitudine punto A (gradi decimali)
 * @param lat2 Latitudine punto B (gradi decimali)
 * @param lng2 Longitudine punto B (gradi decimali)
 * @returns Distanza in chilometri
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
