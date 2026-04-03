import type { Task } from './types';
import { getCachedCoords } from './geocodingCache';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'gestione-personale-app';
const RATE_LIMIT_MS = 1000;

/** Cache in-memory: chiave → {lat, lng} */
const cache = new Map<string, { lat: number; lng: number }>();

/** Coda seriale per rispettare il rate limit Nominatim (1 req/s) */
let queue = Promise.resolve();

function cacheKey(task: Task): string {
  return `${task.indirizzo}, ${task.cap} ${task.citta}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocodifica un singolo task tramite Nominatim.
 * Usa cache in-memory; se l'indirizzo non viene trovato restituisce il task invariato
 * (lat/lng restano undefined) e logga l'errore.
 * @param task Task da geocodificare
 * @returns Task con lat/lng popolati se trovato, altrimenti task invariato
 */
export async function geocodeTask(task: Task): Promise<Task> {
  if (task.lat !== undefined && task.lng !== undefined) return task;

  const key = cacheKey(task);
  if (cache.has(key)) {
    const cached = cache.get(key)!;
    return { ...task, lat: cached.lat, lng: cached.lng };
  }

  const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
    queue = queue.then(async () => {
      try {
        // ── Nominatim (tentativo primario) ──────────────────────────────────
        const params = new URLSearchParams({
          q: key,
          format: 'json',
          limit: '1',
        });
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
          headers: { 'User-Agent': USER_AGENT },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Array<{ lat: string; lon: string }>;
        if (!data.length) throw new Error('Nessun risultato');
        const coord = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        cache.set(key, coord);
        resolve(coord);
      } catch (err) {
        // ── Nominatim fallito → fallback a cache DB ─────────────────────────
        console.error(`[geocoding] Impossibile geocodificare "${key}":`, err);
        const dbCoord = await getCachedCoords(task.indirizzo, task.cap, task.citta);
        if (dbCoord) {
          cache.set(key, dbCoord); // scalda in-memory per sessione
          resolve(dbCoord);
        } else {
          resolve(null);
        }
      } finally {
        await delay(RATE_LIMIT_MS);
      }
    });
  });

  if (!result) return task;
  return { ...task, lat: result.lat, lng: result.lng };
}

/**
 * Geocodifica una lista di task in sequenza rispettando il rate limit.
 * I task già geocodificati (lat/lng presenti) vengono saltati.
 * @param tasks Lista di task da geocodificare
 * @returns Lista di task con lat/lng popolati ove disponibile
 */
export async function geocodeBatch(tasks: Task[]): Promise<Task[]> {
  const results: Task[] = [];
  for (const task of tasks) {
    results.push(await geocodeTask(task));
  }
  return results;
}
