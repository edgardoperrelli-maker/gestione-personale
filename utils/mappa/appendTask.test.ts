import { describe, it, expect } from 'vitest';
import { appendTaskToOperator, removeTaskFromOperator, type RoutableEntry, type OptimizeFn } from './appendTask';
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

describe('removeTaskFromOperator', () => {
  it("rimuove dal giusto operatore e ricalcola la sua rotta", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1'), task('b2')])];
    const out = removeTaskFromOperator(dist, 1, 'b1', fakeOptimize);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b2']);
    expect(out[1].km).toBe(1);
  });

  it('operatore senza più task → rotta azzerata', () => {
    const dist = [entry('A', [task('a1')])];
    const out = removeTaskFromOperator(dist, 0, 'a1', fakeOptimize);
    expect(out[0].tasks).toEqual([]);
    expect(out[0].km).toBe(0);
    expect(out[0].polyline).toEqual([]);
    expect(out[0].schedule).toEqual([]);
  });

  it('preserva intatte le altre entry', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1'), task('b2')])];
    const out = removeTaskFromOperator(dist, 1, 'b1', fakeOptimize);
    expect(out[0]).toEqual(dist[0]);
  });

  it('non muta input (purezza)', () => {
    const dist = [entry('A', [task('a1'), task('a2')])];
    const snap = JSON.parse(JSON.stringify(dist));
    removeTaskFromOperator(dist, 0, 'a1', fakeOptimize);
    expect(dist).toEqual(snap);
  });

  it('indice fuori range o task assente → stesso riferimento', () => {
    const dist = [entry('A', [task('a1')])];
    expect(removeTaskFromOperator(dist, 5, 'a1', fakeOptimize)).toBe(dist);
    expect(removeTaskFromOperator(dist, 0, 'zzz', fakeOptimize)).toBe(dist);
  });
});
