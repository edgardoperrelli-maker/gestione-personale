/** Stato di geocodifica derivato dal risultato del geocoder. */
export function statoDaRisultatoGeocode(coords: { lat: number; lng: number } | null): 'ok' | 'failed' {
  return coords ? 'ok' : 'failed';
}

export type GeocodeProgress = {
  processati: number;
  ok: number;
  falliti: number;
  restanti: number;
};

/** Riepilogo leggibile dell'avanzamento della geocodifica. */
export function formatGeocodeProgress(p: GeocodeProgress): string {
  return `${p.ok} ok, ${p.falliti} da correggere · ${p.restanti} rimasti`;
}
