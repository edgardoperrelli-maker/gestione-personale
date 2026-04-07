import { haversine } from './distance';
import type { OperatorBase, RouteResult, Task } from './types';

/**
 * Distanza Haversine tra due punti geografici.
 * @param lat1 Latitudine A
 * @param lng1 Longitudine A
 * @param lat2 Latitudine B
 * @param lng2 Longitudine B
 * @returns Distanza in km
 */
function distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversine(lat1, lng1, lat2, lng2);
}

/**
 * Calcola la distanza totale di un percorso come somma di distanze consecutive.
 * I task senza coordinate vengono ignorati nel calcolo.
 * @param tasks Sequenza ordinata di task
 * @returns Distanza totale in km
 */
function calculateTotalDistance(tasks: Task[]): number {
  let total = 0;
  for (let i = 0; i < tasks.length - 1; i++) {
    const a = tasks[i];
    const b = tasks[i + 1];
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
    total += distance(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

/**
 * Algoritmo greedy nearest-neighbor: dal punto di partenza sceglie sempre
 * il task non ancora visitato più vicino.
 * I task senza coordinate vengono accodati in fondo (ordine originale).
 * @param tasks Task da ordinare (devono avere lat/lng per essere ordinati)
 * @param startPoint Coordinate di partenza
 * @returns Sequenza ottimizzata
 */
function nearestNeighbor(
  tasks: Task[],
  startPoint: { lat: number; lng: number }
): Task[] {
  const withCoords = tasks.filter((t) => t.lat != null && t.lng != null);
  const withoutCoords = tasks.filter((t) => t.lat == null || t.lng == null);

  const unvisited = [...withCoords];
  const ordered: Task[] = [];
  let curLat = startPoint.lat;
  let curLng = startPoint.lng;

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const t = unvisited[i];
      const d = distance(curLat, curLng, t.lat!, t.lng!);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = unvisited.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = next.lat!;
    curLng = next.lng!;
  }

  return [...ordered, ...withoutCoords];
}

/**
 * Miglioramento 2-opt: prova a invertire sotto-sequenze per ridurre la distanza totale.
 * Non modifica il task in posizione 0. Max 3 passaggi completi O(n²).
 * @param tasks Sequenza da migliorare
 * @returns Sequenza migliorata
 */
function twoOpt(tasks: Task[]): Task[] {
  if (tasks.length < 4) return tasks;

  let route = [...tasks];
  const MAX_PASSES = 3;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;

    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[j];
        const d = j + 1 < route.length ? route[j + 1] : null;

        if (
          a.lat == null || a.lng == null ||
          b.lat == null || b.lng == null ||
          c.lat == null || c.lng == null
        ) continue;

        const before =
          distance(a.lat, a.lng, b.lat, b.lng) +
          (d && d.lat != null && d.lng != null
            ? distance(c.lat, c.lng, d.lat, d.lng)
            : 0);
        const after =
          distance(a.lat, a.lng, c.lat, c.lng) +
          (d && d.lat != null && d.lng != null
            ? distance(b.lat, b.lng, d.lat, d.lng)
            : 0);

        if (after < before - 1e-10) {
          // Inverti il segmento [i, j]
          const reversed = route.slice(i, j + 1).reverse();
          route = [...route.slice(0, i), ...reversed, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return route;
}

/**
 * Calcola il centroide geografico di un insieme di task con coordinate.
 * @param tasks Lista di task
 * @returns Centroide {lat, lng} oppure null se nessun task ha coordinate
 */
function centroid(tasks: Task[]): { lat: number; lng: number } | null {
  const pts = tasks.filter((t) => t.lat != null && t.lng != null);
  if (!pts.length) return null;
  const sumLat = pts.reduce((s, t) => s + t.lat!, 0);
  const sumLng = pts.reduce((s, t) => s + t.lng!, 0);
  return { lat: sumLat / pts.length, lng: sumLng / pts.length };
}

/**
 * Estrae i minuti dall'inizio della giornata da una stringa fascia_oraria.
 * Stringa vuota o non parsabile → Infinity (gruppo va in fondo).
 */
function fasciaToMin(s: string | undefined | null): number {
  if (!s) return Infinity;
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Ottimizza il percorso rispettando i gruppi di fascia oraria.
 *
 * Flusso:
 *   1. Raggruppa i task per fascia (08:xx → bucket "480", 14:xx → "840", vuoto → Infinity)
 *   2. Ordina i bucket per valore crescente (Infinity = ultimo)
 *   3. Ottimizza geograficamente l'interno di ogni bucket con nearestNeighbor + twoOpt
 *   4. Il punto di partenza del bucket N+1 = ultimo task con coordinate del bucket N
 *   5. Calcola distanza totale e polyline dell'intero percorso
 */
export function optimizeRouteByFascia(tasks: Task[], base?: OperatorBase): RouteResult {
  if (!tasks.length) {
    return { orderedTasks: [], totalDistanceKm: 0, polyline: [] };
  }

  // 1. Raggruppa per fascia
  const groupMap = new Map<number, Task[]>();
  for (const t of tasks) {
    const key = fasciaToMin(t.fascia_oraria);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  // 2. Ordina i bucket per fascia crescente (Infinity = ultimo)
  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
    if (a === Infinity) return 1;
    if (b === Infinity) return -1;
    return a - b;
  });

  // 3. Ottimizza ogni bucket e concatena
  const allOrdered: Task[] = [];
  let curStart: { lat: number; lng: number } | null = base ?? null;

  for (const key of sortedKeys) {
    const grp = groupMap.get(key)!;

    let groupStart = curStart;
    if (!groupStart) {
      const first = grp.find((t) => t.lat != null && t.lng != null);
      if (first) groupStart = { lat: first.lat!, lng: first.lng! };
    }

    const greedy = groupStart ? nearestNeighbor(grp, groupStart) : grp;
    const optimized = twoOpt(greedy);
    allOrdered.push(...optimized);

    // Punto di partenza del prossimo bucket = ultimo task con coordinate
    const lastWithCoords = [...optimized].reverse().find((t) => t.lat != null && t.lng != null);
    curStart = lastWithCoords ? { lat: lastWithCoords.lat!, lng: lastWithCoords.lng! } : curStart;
  }

  // 4. Distanza totale
  const rawDist = calculateTotalDistance(allOrdered);
  const totalDistanceKm = Math.round(rawDist * 100) / 100;

  // 5. Polyline
  const polyline: Array<{ lat: number; lng: number }> = [];
  if (base) polyline.push({ lat: base.lat, lng: base.lng });
  for (const t of allOrdered) {
    if (t.lat != null && t.lng != null) polyline.push({ lat: t.lat, lng: t.lng });
  }

  return { orderedTasks: allOrdered, totalDistanceKm, polyline };
}

/**
 * Punto di ingresso principale: ottimizza il percorso per una lista di task.
 *
 * Flusso:
 *   1. Determina punto di partenza (base → centroide → tasks[0])
 *   2. nearestNeighbor greedy
 *   3. miglioramento 2-opt
 *   4. calcola distanza totale e componi RouteResult
 *
 * I task con requiresTwoOperators sono inclusi normalmente nella route;
 * la gestione del secondo operatore avviene fuori da questo modulo.
 *
 * @param tasks Lista di task da ottimizzare (devono già avere lat/lng se disponibili)
 * @param base  Posizione di partenza dell'operatore (opzionale)
 * @returns     RouteResult con sequenza ottimizzata, distanza e polyline
 *
 * TODO: insertTask(route, newTask) → cheapest insertion
 * TODO: recalculate(partialRoute, completedIndex, newTasks)
 */
export function optimizeRoute(tasks: Task[], base?: OperatorBase): RouteResult {
  if (!tasks.length) {
    return { orderedTasks: [], totalDistanceKm: 0, polyline: [] };
  }

  // Punto di partenza: base → centroide → primo task con coordinate
  let start: { lat: number; lng: number } | null = base ?? null;
  if (!start) {
    start = centroid(tasks);
  }
  if (!start) {
    const first = tasks.find((t) => t.lat != null && t.lng != null);
    start = first ? { lat: first.lat!, lng: first.lng! } : { lat: 0, lng: 0 };
  }

  const greedy = nearestNeighbor(tasks, start);
  const optimized = twoOpt(greedy);

  const rawDist = calculateTotalDistance(optimized);
  const totalDistanceKm = Math.round(rawDist * 100) / 100;

  const polyline: Array<{ lat: number; lng: number }> = [];
  if (base) polyline.push({ lat: base.lat, lng: base.lng });
  for (const t of optimized) {
    if (t.lat != null && t.lng != null) {
      polyline.push({ lat: t.lat, lng: t.lng });
    }
  }

  return { orderedTasks: optimized, totalDistanceKm, polyline };
}
