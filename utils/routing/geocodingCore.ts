// Core di geocoding runtime-agnostico: provider (Nominatim/Photon), normalizzazione
// e rate-limit. NESSUNA dipendenza Supabase/React → usabile sia client che server.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';
const USER_AGENT = 'gestione-personale-app';
const RATE_LIMIT_MS = 1000;

export type Coordinates = { lat: number; lng: number };
type NominatimResult = { lat: string; lon: string };
type PhotonResponse = { features?: Array<{ geometry?: { coordinates?: number[] } }> };

let queue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
export function normalizeLocationField(value: string): string {
  return collapseSpaces(value);
}
function expandSafeStreetAbbreviation(value: string): string {
  return value
    .replace(/^V\.(?=\s)/i, 'VIA')
    .replace(/^VLE\.?(?=\s)/i, 'VIALE')
    .replace(/^(?:PZA\.?|P\.?\s*ZZA\.?)(?=\s)/i, 'PIAZZA')
    .replace(/^C\.?\s*SO\.?(?=\s)/i, 'CORSO')
    .replace(/^LGO\.?(?=\s)/i, 'LARGO');
}
export function normalizeAddress(value: string): string {
  const collapsed = collapseSpaces(value);
  const expanded = expandSafeStreetAbbreviation(collapsed);
  return collapseSpaces(expanded.replace(/[.,;:]+/g, ' '));
}
function buildFreeTextQuery(indirizzo: string, citta: string, cap?: string): string {
  const location = cap ? `${cap} ${citta}`.trim() : citta;
  return [indirizzo, location, 'Italia'].filter(Boolean).join(', ');
}
function isValidCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function parseNominatimResponse(data: NominatimResult[]): Coordinates | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number.parseFloat(data[0].lat);
  const lng = Number.parseFloat(data[0].lon);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}
function parsePhotonResponse(data: PhotonResponse): Coordinates | null {
  const coordinates = data.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}
function runSerial<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    try {
      return await operation();
    } finally {
      await delay(RATE_LIMIT_MS);
    }
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}
async function fetchNominatim(params: URLSearchParams): Promise<Coordinates | null> {
  try {
    return await runSerial(async () => {
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) {
        console.warn(`[geocoding] Nominatim HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as NominatimResult[];
      return parseNominatimResponse(data);
    });
  } catch (error) {
    console.warn('[geocoding] Nominatim request failed:', error);
    return null;
  }
}
async function fetchPhoton(query: string): Promise<Coordinates | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: '1' });
    return await runSerial(async () => {
      const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) {
        console.warn(`[geocoding] Photon HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as PhotonResponse;
      return parsePhotonResponse(data);
    });
  } catch (error) {
    console.warn('[geocoding] Photon request failed:', error);
    return null;
  }
}

/**
 * Risolve le coordinate di un indirizzo interrogando i provider in cascata
 * (Nominatim strutturato → free-text con/senza CAP → Photon con/senza CAP).
 * Nessuna cache: la cache (client o server) è gestita dai wrapper. Rate-limit 1/sec.
 */
export async function resolveCoordsFromProviders(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<Coordinates | null> {
  const normalizedAddress = normalizeAddress(indirizzo);
  const normalizedCap = normalizeLocationField(cap);
  const normalizedCity = normalizeLocationField(citta);
  if (!normalizedAddress) return null;

  const structured = await fetchNominatim(
    new URLSearchParams({
      street: normalizedAddress,
      city: normalizedCity,
      postalcode: normalizedCap,
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (structured) return structured;

  const withCap = await fetchNominatim(
    new URLSearchParams({
      q: buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap),
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (withCap) return withCap;

  const withoutCap = await fetchNominatim(
    new URLSearchParams({
      q: buildFreeTextQuery(normalizedAddress, normalizedCity),
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (withoutCap) return withoutCap;

  const photonWithCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap));
  if (photonWithCap) return photonWithCap;

  const photonWithoutCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity));
  if (photonWithoutCap) return photonWithoutCap;

  return null;
}
