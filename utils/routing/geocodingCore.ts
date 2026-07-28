// Core di geocoding runtime-agnostico: provider (Nominatim/Photon), normalizzazione
// e rate-limit. NESSUNA dipendenza Supabase/React → usabile sia client che server.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';
const USER_AGENT = 'gestione-personale-app';

export type Coordinates = { lat: number; lng: number };
type NominatimResult = { lat: string; lon: string };
type PhotonResponse = { features?: Array<{ geometry?: { coordinates?: number[] } }> };

/*
  Rate limit: UNA CODA PER PROVIDER, non una sola per tutti.

  Il limite di 1 richiesta al secondo è di Nominatim, e vale PER SERVIZIO: è la sua usage policy,
  legata al suo IP e alle sue macchine. Photon è un altro servizio, su un altro host, con un'altra
  policy — metterlo in fila dietro Nominatim non rispetta niente, paga soltanto una penale che
  nessuno ha chiesto. Su un indirizzo che arriva fino a Photon erano due secondi di attesa buttati.

  Le pause restano un secondo su entrambe le code: la fretta qui si paga con un IP limitato, che è
  molto peggio della lentezza. Il guadagno viene dal NON sommarle, non dall'accorciarle.

  Seconda cosa, ed è la più importante: **la pausa la paga il PROSSIMO, non chi ha appena finito.**
  Prima la promessa restituita si risolveva solo dopo il secondo di attesa, quindi chi aspettava un
  indirizzo pagava anche la pausa che serviva a proteggere la chiamata SUCCESSIVA — e sull'ultima
  della cascata quella pausa non proteggeva proprio niente. Ora la coda avanza dopo la pausa, ma
  il chiamante riceve la risposta appena c'è. La distanza fra due richieste allo stesso provider
  resta di un secondo pieno, che è il vincolo vero.
*/
const RATE_LIMIT_MS = 1000;
const code = new Map<string, Promise<unknown>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Accoda `operazione` sulla coda di `provider` e la esegue quando tocca a lei.
 *
 * Esportata perché il comportamento delle code è una cosa che si deve poter verificare: che due
 * chiamate allo stesso provider restino distanziate, che due provider diversi non si aspettino a
 * vicenda, e che una chiamata fallita non pianti la coda per tutte quelle dopo.
 */
export function inCoda<T>(
  provider: string,
  operazione: () => Promise<T>,
  pausaMs: number = RATE_LIMIT_MS,
): Promise<T> {
  const precedente = code.get(provider) ?? Promise.resolve();
  const eseguito = precedente.then(operazione);
  // `then(pausa, pausa)`: anche una chiamata ANDATA MALE deve far scattare l'attesa e lasciare la
  // coda pulita. Senza il ramo d'errore, un fetch che esplode propagherebbe il rifiuto lungo tutta
  // la catena e ogni richiesta successiva a quel provider morirebbe con l'errore della prima.
  const pausa = () => delay(pausaMs);
  code.set(provider, eseguito.then(pausa, pausa));
  return eseguito;
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
async function fetchNominatim(params: URLSearchParams): Promise<Coordinates | null> {
  try {
    return await inCoda('nominatim', async () => {
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
    return await inCoda('photon', async () => {
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
 * Nessuna cache: la cache (client o server) è gestita dai wrapper.
 *
 * Rate-limit 1/sec PER PROVIDER: i passaggi restano in sequenza — il secondo si fa solo se il
 * primo non ha risposto — ma quando la cascata passa da Nominatim a Photon non paga l'attesa
 * dell'altro servizio. Sul registro ACEA la cascata arriva spesso in fondo, ed è lì che si vede.
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
