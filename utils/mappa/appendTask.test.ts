import { describe, it, expect } from 'vitest';
import { appendTaskToOperator, type RoutableEntry, type OptimizeFn } from './appendTask';
import type { Task } from '@/utils/routing/types';

function task(id: string, lat?: number, lng?: number): Task {
  return { id, odl: '', indirizzo: `via ${id}`, cap: '00100', citta: 'Roma', priorita: 0, fascia_oraria: '', lat, lng };
}

// optimize deterministico fittizio: non riordina, km = numero task, polyline dai task con coordinate.
const fakeOptimize: OptimizeFn = (tasks) => ({
  orderedTasks: tasks,
  totalDistanceKm: tasks.length,
  polyline: tasks.filter((t) => t.lat != null && t.lng != null).map((t) => ({ lat: t.lat!, lng: t.lng! })),
  schedule: [],
});

type Entry = RoutableEntry & { op: string; staffId: string; color: string; startAddress: string | null };

function entry(staffId: string, tasks: Task[]): Entry {
  return { op: staffId, staffId, color: '#000', startAddress: null, base: null, tasks, km: 0, polyline: [], schedule: [] };
}

describe('appendTaskToOperator', () => {
  it("aggiunge il task all'operatore giusto e ricalcola la sua rotta", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const out = appendTaskToOperator(dist, 1, task('b2'), fakeOptimize);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b1', 'b2']);
    expect(out[1].km).toBe(2);
  });

  it('preserva intatte le altre entry', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const out = appendTaskToOperator(dist, 1, task('b2'), fakeOptimize);
    expect(out[0]).toEqual(dist[0]);
  });

  it('non muta input (purezza)', () => {
    const dist = [entry('A', [task('a1')])];
    const snap = JSON.parse(JSON.stringify(dist));
    appendTaskToOperator(dist, 0, task('a2'), fakeOptimize);
    expect(dist).toEqual(snap);
  });

  it('indice fuori range → distribuzione invariata (stesso riferimento)', () => {
    const dist = [entry('A', [task('a1')])];
    expect(appendTaskToOperator(dist, 5, task('x'), fakeOptimize)).toBe(dist);
    expect(appendTaskToOperator(dist, -1, task('x'), fakeOptimize)).toBe(dist);
  });

  it('conserva i campi extra della entry (color, startAddress, staffId)', () => {
    const dist = [entry('A', [task('a1')])];
    const out = appendTaskToOperator(dist, 0, task('a2'), fakeOptimize);
    expect(out[0]).toMatchObject({ op: 'A', staffId: 'A', color: '#000', startAddress: null });
  });
});
