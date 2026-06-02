import {
  resolveCoordsFromProviders,
  normalizeAddress,
  normalizeLocationField,
  type Coordinates,
} from '@/utils/routing/geocodingCore';
import { getCachedCoordsServer, saveResolvedCoordsServer } from '@/utils/routing/geocodingCacheServer';

/**
 * Geocodifica server-side di un indirizzo: cache DB (service role) → provider → salva in cache.
 * Torna {lat,lng} oppure null. Nessuna dipendenza dal browser.
 */
export async function geocodeIndirizzoServer(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<Coordinates | null> {
  const rawAddress = (indirizzo ?? '').trim();
  if (!rawAddress) return null;

  const normalizedAddress = normalizeAddress(rawAddress);
  const normalizedCap = normalizeLocationField(cap ?? '');
  const normalizedCity = normalizeLocationField(citta ?? '');

  const rawCached = await getCachedCoordsServer(rawAddress, normalizedCap, normalizedCity);
  if (rawCached) return rawCached;
  if (normalizedAddress !== rawAddress) {
    const normCached = await getCachedCoordsServer(normalizedAddress, normalizedCap, normalizedCity);
    if (normCached) return normCached;
  }

  const coords = await resolveCoordsFromProviders(rawAddress, normalizedCap, normalizedCity);
  if (!coords) return null;

  await saveResolvedCoordsServer(rawAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
  if (normalizedAddress !== rawAddress) {
    await saveResolvedCoordsServer(normalizedAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
  }
  return coords;
}
