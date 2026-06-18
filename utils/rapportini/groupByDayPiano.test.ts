import { describe, it, expect } from 'vitest';
import { groupByDayPiano } from './groupByDayPiano';
import type { RapRiepilogo } from './groupByDay';

const rap = (o: Partial<RapRiepilogo> & { id: string; piano_id: string; data: string }): RapRiepilogo => ({
  staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  territorio: null, piano_creato_at: null, ...o,
});

describe('groupByDayPiano', () => {
  it('crea una card per (data, piano_id) e ordina i giorni con oggi in cima', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-19', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'SUD', piano_creato_at: '2026-06-18T10:00:00Z' }),
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out.map((g) => g.data)).toEqual(['2026-06-18', '2026-06-19']);
    // dentro il 18: NORD prima di SUD (alfabetico)
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p3', 'p2']);
    expect(out[0].piani[0]).toMatchObject({ piano_id: 'p3', territorio: 'NORD', creato_at: '2026-06-18T08:00:00Z' });
  });

  it('due piani stesso territorio/giorno → due card ordinate per creato_at', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'late', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T14:00:00Z' }),
      rap({ id: 'b', piano_id: 'early', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['early', 'late']);
  });

  it('"senza territorio" va in fondo nel giorno', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: null, piano_creato_at: '2026-06-18T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p2', 'p1']);
  });
});
