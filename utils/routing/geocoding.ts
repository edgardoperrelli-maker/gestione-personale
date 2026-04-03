import type { Task } from './types';
import { getCachedCoords, saveResolvedCoords } from './geocodingCache';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';
const USER_AGENT = 'gestione-personale-app';
const RATE_LIMIT_MS = 1000;

type Coordinates = { lat: number; lng: number };
type NominatimResult = { lat: string; lon: string };
type PhotonResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: number[];
    };
  }>;
};

const cache = new Map<string, Coordinates>();

let queue: Promise<void> = Promise.resolve();

function buildCacheKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLocationField(value: string): string {
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

function normalizeAddress(value: string): string {
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

function getInMemoryCoords(rawKey: string, normalizedKey: string): Coordinates | null {
  return cache.get(rawKey) ?? cache.get(normalizedKey) ?? null;
}

function saveInMemoryCoords(rawKey: string, normalizedKey: string, coords: Coordinates): void {
  cache.set(rawKey, coords);
  if (normalizedKey !== rawKey) {
    cache.set(normalizedKey, coords);
  }
}

function runSerial<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    try {
      return await operation();
    } finally {
      await delay(RATE_LIMIT_MS);
    }
  });

  queue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function fetchNominatim(params: URLSearchParams): Promise<Coordinates | null> {
  try {
    return await runSerial(async () => {
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT },
      });

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
    const params = new URLSearchParams({
      q: query,
      limit: '1',
    });

    return await runSerial(async () => {
      const response = await fetch(`${PHOTON_URL}?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT },
      });

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

async function persistResolvedCoords(
  rawAddress: string,
  normalizedAddress: string,
  cap: string,
  citta: string,
  coords: Coordinates,
): Promise<void> {
  await saveResolvedCoords(rawAddress, cap, citta, coords.lat, coords.lng);
  if (normalizedAddress !== rawAddress) {
    await saveResolvedCoords(normalizedAddress, cap, citta, coords.lat, coords.lng);
  }
}

export async function geocodeTask(task: Task): Promise<Task> {
  try {
    if (task.lat !== undefined && task.lng !== undefined) return task;

    const rawAddress = task.indirizzo;
    const normalizedAddress = normalizeAddress(task.indirizzo);
    const normalizedCap = normalizeLocationField(task.cap);
    const normalizedCity = normalizeLocationField(task.citta);
    const rawKey = buildCacheKey(rawAddress, normalizedCap, normalizedCity);
    const normalizedKey = buildCacheKey(normalizedAddress, normalizedCap, normalizedCity);

    const memoryCoords = getInMemoryCoords(rawKey, normalizedKey);
    if (memoryCoords) {
      return { ...task, lat: memoryCoords.lat, lng: memoryCoords.lng };
    }

    const rawCachedCoords = await getCachedCoords(rawAddress, normalizedCap, normalizedCity);
    if (rawCachedCoords) {
      saveInMemoryCoords(rawKey, normalizedKey, rawCachedCoords);
      return { ...task, lat: rawCachedCoords.lat, lng: rawCachedCoords.lng };
    }

    if (normalizedAddress !== rawAddress) {
      const normalizedCachedCoords = await getCachedCoords(normalizedAddress, normalizedCap, normalizedCity);
      if (normalizedCachedCoords) {
        saveInMemoryCoords(rawKey, normalizedKey, normalizedCachedCoords);
        return { ...task, lat: normalizedCachedCoords.lat, lng: normalizedCachedCoords.lng };
      }
    }

    if (!normalizedAddress) return task;

    const nominatimStructured = await fetchNominatim(
      new URLSearchParams({
        street: normalizedAddress,
        city: normalizedCity,
        postalcode: normalizedCap,
        countrycodes: 'it',
        format: 'jsonv2',
        limit: '1',
      }),
    );

    if (nominatimStructured) {
      saveInMemoryCoords(rawKey, normalizedKey, nominatimStructured);
      await persistResolvedCoords(rawAddress, normalizedAddress, normalizedCap, normalizedCity, nominatimStructured);
      return { ...task, lat: nominatimStructured.lat, lng: nominatimStructured.lng };
    }

    const nominatimWithCap = await fetchNominatim(
      new URLSearchParams({
        q: buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap),
        countrycodes: 'it',
        format: 'jsonv2',
        limit: '1',
      }),
    );

    if (nominatimWithCap) {
      saveInMemoryCoords(rawKey, normalizedKey, nominatimWithCap);
      await persistResolvedCoords(rawAddress, normalizedAddress, normalizedCap, normalizedCity, nominatimWithCap);
      return { ...task, lat: nominatimWithCap.lat, lng: nominatimWithCap.lng };
    }

    const nominatimWithoutCap = await fetchNominatim(
      new URLSearchParams({
        q: buildFreeTextQuery(normalizedAddress, normalizedCity),
        countrycodes: 'it',
        format: 'jsonv2',
        limit: '1',
      }),
    );

    if (nominatimWithoutCap) {
      saveInMemoryCoords(rawKey, normalizedKey, nominatimWithoutCap);
      await persistResolvedCoords(rawAddress, normalizedAddress, normalizedCap, normalizedCity, nominatimWithoutCap);
      return { ...task, lat: nominatimWithoutCap.lat, lng: nominatimWithoutCap.lng };
    }

    const photonWithCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap));
    if (photonWithCap) {
      saveInMemoryCoords(rawKey, normalizedKey, photonWithCap);
      await persistResolvedCoords(rawAddress, normalizedAddress, normalizedCap, normalizedCity, photonWithCap);
      return { ...task, lat: photonWithCap.lat, lng: photonWithCap.lng };
    }

    const photonWithoutCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity));
    if (photonWithoutCap) {
      saveInMemoryCoords(rawKey, normalizedKey, photonWithoutCap);
      await persistResolvedCoords(rawAddress, normalizedAddress, normalizedCap, normalizedCity, photonWithoutCap);
      return { ...task, lat: photonWithoutCap.lat, lng: photonWithoutCap.lng };
    }

    return task;
  } catch (error) {
    console.error(`[geocoding] Impossibile geocodificare "${task.indirizzo}, ${task.cap} ${task.citta}":`, error);
    return task;
  }
}

export async function geocodeBatch(tasks: Task[]): Promise<Task[]> {
  const results: Task[] = [];
  for (const task of tasks) {
    results.push(await geocodeTask(task));
  }
  return results;
}
