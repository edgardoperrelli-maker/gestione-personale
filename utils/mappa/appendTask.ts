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
