import { describe, it, expect } from 'vitest';
import { appendTaskToOperator, removeTaskFromOperator, moveAllTasksToOperator, moveTaskToOperator, ensureOperatorInDistribution, alignAndAppendTask, type RoutableEntry, type OptimizeFn } from './appendTask';
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

describe('moveAllTasksToOperator', () => {
  const completato = (id: string): Task => ({ ...task(id), stato: 'completato' });

  it('sposta tutti i task non-completati da from a to e ricalcola entrambe le rotte', () => {
    const dist = [entry('A', [task('a1'), task('a2')]), entry('B', [task('b1')])];
    const out = moveAllTasksToOperator(dist, 0, 1, fakeOptimize);
    expect(out[0].tasks).toEqual([]);
    expect(out[0].km).toBe(0);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b1', 'a1', 'a2']);
    expect(out[1].km).toBe(3);
  });

  it('lascia i completati sulla sorgente', () => {
    const dist = [entry('A', [task('a1'), completato('a2')]), entry('B', [])];
    const out = moveAllTasksToOperator(dist, 0, 1, fakeOptimize);
    expect(out[0].tasks.map((t) => t.id)).toEqual(['a2']);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['a1']);
  });

  it('niente da spostare (solo completati o vuoto) → stesso riferimento', () => {
    const soloCompletati = [entry('A', [completato('a1')]), entry('B', [])];
    expect(moveAllTasksToOperator(soloCompletati, 0, 1, fakeOptimize)).toBe(soloCompletati);
    const vuoto = [entry('A', []), entry('B', [])];
    expect(moveAllTasksToOperator(vuoto, 0, 1, fakeOptimize)).toBe(vuoto);
  });

  it('from === to o indici fuori range → stesso riferimento', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [])];
    expect(moveAllTasksToOperator(dist, 0, 0, fakeOptimize)).toBe(dist);
    expect(moveAllTasksToOperator(dist, 5, 1, fakeOptimize)).toBe(dist);
    expect(moveAllTasksToOperator(dist, 0, 5, fakeOptimize)).toBe(dist);
  });

  it('non muta input e preserva le entry non coinvolte', () => {
    const dist = [entry('A', [task('a1')]), entry('B', []), entry('C', [task('c1')])];
    const snap = JSON.parse(JSON.stringify(dist));
    const out = moveAllTasksToOperator(dist, 0, 1, fakeOptimize);
    expect(dist).toEqual(snap);
    expect(out[2]).toEqual(dist[2]);
  });
});

describe('moveTaskToOperator', () => {
  it('sposta il task e ricalcola entrambe le rotte', () => {
    const dist = [entry('A', [task('a1'), task('a2')]), entry('B', [task('b1')])];
    const out = moveTaskToOperator(dist, 'a1', 0, 1, fakeOptimize);
    expect(out[0].tasks.map((t) => t.id)).toEqual(['a2']);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b1', 'a1']);
    expect(out[1].km).toBe(2);
  });

  it('sorgente svuotata → rotta azzerata', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [])];
    const out = moveTaskToOperator(dist, 'a1', 0, 1, fakeOptimize);
    expect(out[0].tasks).toEqual([]);
    expect(out[0].km).toBe(0);
  });

  it('from===to / fuori range / task assente → stesso riferimento', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [])];
    expect(moveTaskToOperator(dist, 'a1', 0, 0, fakeOptimize)).toBe(dist);
    expect(moveTaskToOperator(dist, 'a1', 5, 1, fakeOptimize)).toBe(dist);
    expect(moveTaskToOperator(dist, 'zzz', 0, 1, fakeOptimize)).toBe(dist);
  });

  it('non muta input', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [])];
    const snap = JSON.parse(JSON.stringify(dist));
    moveTaskToOperator(dist, 'a1', 0, 1, fakeOptimize);
    expect(dist).toEqual(snap);
  });
});

describe('ensureOperatorInDistribution', () => {
  it('operatore già presente → stessa distribuzione e indice esistente', () => {
    const dist = [entry('A', []), entry('B', [])];
    const res = ensureOperatorInDistribution(dist, 'B', () => { throw new Error('non deve creare'); });
    expect(res.distribution).toBe(dist);
    expect(res.idx).toBe(1);
  });

  it('operatore assente → appende il gruppo creato dalla factory in coda', () => {
    const dist = [entry('A', [task('a1')])];
    const res = ensureOperatorInDistribution(dist, 'C', () => entry('C', []));
    expect(res.idx).toBe(1);
    expect(res.distribution).toHaveLength(2);
    expect(res.distribution[1].staffId).toBe('C');
    expect(dist).toHaveLength(1);
  });
});

describe('alignAndAppendTask', () => {
  const makeEmpty = (staffId: string): Entry => entry(staffId, []);

  it("operatore NUOVO (assente dalla distribuzione): riceve solo il task, gli altri restano INTATTI (niente ridistribuzione)", () => {
    const dist = [entry('A', [task('a1'), task('a2')]), entry('B', [task('b1')])];
    const out = alignAndAppendTask(['A', 'B', 'C'], dist, 'C', task('c1'), fakeOptimize, makeEmpty);
    expect(out.map((e) => e.staffId)).toEqual(['A', 'B', 'C']);
    expect(out[0]).toEqual(dist[0]);            // A intatto
    expect(out[1]).toEqual(dist[1]);            // B intatto
    expect(out[2].tasks.map((t) => t.id)).toEqual(['c1']); // C solo il nuovo
  });

  it("operatore ESISTENTE: i suoi task esistenti + il nuovo; gli altri intatti", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const out = alignAndAppendTask(['A', 'B'], dist, 'A', task('a2'), fakeOptimize, makeEmpty);
    expect(out[0].tasks.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(out[1]).toEqual(dist[1]);
  });

  it("ALLINEA a selectedOps: operatori selezionati senza gruppo ricevono un gruppo VUOTO (no crash al salvataggio per-indice)", () => {
    const dist = [entry('A', [task('a1')])];
    // selectedOps = [A, X, B] ma distribuzione ha solo A → X e B vanno riempiti, in ordine.
    const out = alignAndAppendTask(['A', 'X', 'B'], dist, 'B', task('b1'), fakeOptimize, makeEmpty);
    expect(out.map((e) => e.staffId)).toEqual(['A', 'X', 'B']);
    expect(out[0]).toEqual(dist[0]);            // A intatto
    expect(out[1].tasks).toEqual([]);           // X gruppo vuoto allineato
    expect(out[2].tasks.map((t) => t.id)).toEqual(['b1']); // B (target) con il task
  });

  it('non muta input (purezza)', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const snap = JSON.parse(JSON.stringify(dist));
    alignAndAppendTask(['A', 'B', 'C'], dist, 'C', task('c1'), fakeOptimize, makeEmpty);
    expect(dist).toEqual(snap);
  });

  it("ricalcola la rotta del solo target (km dal fakeOptimize)", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1'), task('b2')])];
    const out = alignAndAppendTask(['A', 'B'], dist, 'B', task('b3'), fakeOptimize, makeEmpty);
    expect(out[1].km).toBe(3);                  // B ricalcolato (3 task)
    expect(out[0].km).toBe(dist[0].km);         // A invariato
  });
});
