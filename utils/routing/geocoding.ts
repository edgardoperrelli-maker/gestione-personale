import type { Task } from './types';
import { getCachedCoords, saveResolvedCoords } from './geocodingCache';
import {
  resolveCoordsFromProviders,
  normalizeAddress,
  normalizeLocationField,
  type Coordinates,
} from './geocodingCore';

const cache = new Map<string, Coordinates>();

function buildCacheKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}
function getInMemoryCoords(rawKey: string, normalizedKey: string): Coordinates | null {
  return cache.get(rawKey) ?? cache.get(normalizedKey) ?? null;
}
function saveInMemoryCoords(rawKey: string, normalizedKey: string, coords: Coordinates): void {
  cache.set(rawKey, coords);
  if (normalizedKey !== rawKey) cache.set(normalizedKey, coords);
}

export async function geocodeTask(task: Task): Promise<Task> {
  try {
    if (task.lat != null && task.lng != null) return task;

    const rawAddress = task.indirizzo;
    const normalizedAddress = normalizeAddress(task.indirizzo);
    const normalizedCap = normalizeLocationField(task.cap);
    const normalizedCity = normalizeLocationField(task.citta);
    const rawKey = buildCacheKey(rawAddress, normalizedCap, normalizedCity);
    const normalizedKey = buildCacheKey(normalizedAddress, normalizedCap, normalizedCity);

    const memoryCoords = getInMemoryCoords(rawKey, normalizedKey);
    if (memoryCoords) return { ...task, lat: memoryCoords.lat, lng: memoryCoords.lng };

    const rawCached = await getCachedCoords(rawAddress, normalizedCap, normalizedCity);
    if (rawCached) {
      saveInMemoryCoords(rawKey, normalizedKey, rawCached);
      return { ...task, lat: rawCached.lat, lng: rawCached.lng };
    }

    if (normalizedAddress !== rawAddress) {
      const normCached = await getCachedCoords(normalizedAddress, normalizedCap, normalizedCity);
      if (normCached) {
        saveInMemoryCoords(rawKey, normalizedKey, normCached);
        return { ...task, lat: normCached.lat, lng: normCached.lng };
      }
    }

    const coords = await resolveCoordsFromProviders(task.indirizzo, task.cap, task.citta);
    if (coords) {
      saveInMemoryCoords(rawKey, normalizedKey, coords);
      await saveResolvedCoords(rawAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
      if (normalizedAddress !== rawAddress) {
        await saveResolvedCoords(normalizedAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
      }
      return { ...task, lat: coords.lat, lng: coords.lng };
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
