import type { OperatorBase, RouteResult, ScheduleEntry, Task } from '@/utils/routing/types';

/** Sottoinsieme di una entry di distribuzione che la funzione legge e aggiorna. */
export type RoutableEntry = {
  tasks: Task[];
  km: number;
  polyline: Array<{ lat: number; lng: number }>;
  base: OperatorBase | null;
  schedule?: ScheduleEntry[];
};

/** Firma compatibile con `optimizeRouteByFascia`. */
export type OptimizeFn = (tasks: Task[], base?: OperatorBase) => RouteResult;

/**
 * Rimuove il task `taskId` dall'operatore in posizione `opIdx`, ricalcolando SOLO la sua
 * rotta. Se l'operatore resta senza task, azzera la rotta (km 0, polyline/schedule vuoti).
 * Funzione pura: non muta l'input. Difensivo: indice fuori range o task assente → ritorna
 * la distribuzione originale invariata (stesso riferimento).
 */
export function removeTaskFromOperator<E extends RoutableEntry>(
  distribution: E[],
  opIdx: number,
  taskId: string,
  optimize: OptimizeFn,
): E[] {
  if (opIdx < 0 || opIdx >= distribution.length) return distribution;
  const idx = distribution[opIdx].tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return distribution;
  const next = distribution.map((entry) => ({ ...entry, tasks: [...entry.tasks] })) as E[];
  const target = next[opIdx];
  target.tasks.splice(idx, 1);
  if (target.tasks.length >= 1) {
    const res = optimize(target.tasks, target.base ?? undefined);
    next[opIdx] = {
      ...target,
      tasks: res.orderedTasks,
      km: res.totalDistanceKm,
      polyline: res.polyline,
      schedule: res.schedule,
    } as E;
  } else {
    next[opIdx] = { ...target, tasks: [], km: 0, polyline: [], schedule: [] } as E;
  }
  return next;
}

/**
 * Aggiunge `task` all'operatore in posizione `toIdx`, ricalcolando SOLO la sua
 * rotta e lasciando intatte tutte le altre entry. Funzione pura: non muta l'input.
 * Difensivo: indice fuori range → ritorna la distribuzione originale invariata.
 */
export function appendTaskToOperator<E extends RoutableEntry>(
  distribution: E[],
  toIdx: number,
  task: Task,
  optimize: OptimizeFn,
): E[] {
  if (toIdx < 0 || toIdx >= distribution.length) return distribution;
  const next = distribution.map((entry) => ({ ...entry, tasks: [...entry.tasks] })) as E[];
  const target = next[toIdx];
  const tasks = [...target.tasks, task];
  const res = optimize(tasks, target.base ?? undefined);
  next[toIdx] = {
    ...target,
    tasks: res.orderedTasks,
    km: res.totalDistanceKm,
    polyline: res.polyline,
    schedule: res.schedule,
  } as E;
  return next;
}
