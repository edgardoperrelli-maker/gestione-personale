import { describe, it, expect } from 'vitest';
import { optimizeRouteByFascia } from './optimizer';
import type { Task } from './types';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over };
}

describe('optimizeRouteByFascia · schedule', () => {
  it('ritorna uno schedule con un entry per task allineato a orderedTasks', () => {
    const tasks = [
      task('a', { lat: 41.90, lng: 12.50, fascia_oraria: '08:00-12:00' }),
      task('b', { lat: 41.91, lng: 12.51, fascia_oraria: '08:00-12:00' }),
    ];
    const res = optimizeRouteByFascia(tasks, { lat: 41.9, lng: 12.5 });
    expect(res.schedule).toBeDefined();
    expect(res.schedule!.length).toBe(res.orderedTasks.length);
    expect(res.schedule!.map((s) => s.taskId)).toEqual(res.orderedTasks.map((t) => t.id));
    expect(res.schedule!.every((s) => typeof s.etaMin === 'number')).toBe(true);
  });

  it('lista vuota → schedule vuoto', () => {
    const res = optimizeRouteByFascia([]);
    expect(res.schedule).toEqual([]);
  });

  it('raggruppa le ore intere (8-12) come fascia mattutina, non in fondo', () => {
    // task con fascia "8-12" (ore intere) deve precedere quello senza fascia
    const tasks = [
      task('senza', { lat: 41.90, lng: 12.50, fascia_oraria: '' }),
      task('mattina', { lat: 41.90, lng: 12.50, fascia_oraria: '8-12' }),
    ];
    const res = optimizeRouteByFascia(tasks, { lat: 41.9, lng: 12.5 });
    expect(res.orderedTasks[0].id).toBe('mattina');
  });
});
