import { describe, it, expect } from 'vitest';
import { groupRapportiniByDay, type RapRiepilogo } from './groupByDay';

const r = (over: Partial<RapRiepilogo>): RapRiepilogo => ({
  id: 'x', staff_id: 's', staff_name: 'N', token: 't', stato: 'in_corso', data: '2026-06-01',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  piano_id: 'p1', territorio: 'ACEA', ...over,
});

describe('groupRapportiniByDay', () => {
  it('raggruppa per giorno (desc) e per piano, preservando l\'ordine operatori', () => {
    const out = groupRapportiniByDay([
      r({ id: '1', data: '2026-06-01', piano_id: 'p1', territorio: 'ACEA' }),
      r({ id: '2', data: '2026-06-01', piano_id: 'p1', territorio: 'ACEA' }),
      r({ id: '3', data: '2026-06-01', piano_id: 'p2', territorio: 'PERUGIA' }),
      r({ id: '4', data: '2026-05-30', piano_id: 'p3', territorio: 'FIRENZE' }),
    ]);
    expect(out.map((g) => g.data)).toEqual(['2026-06-01', '2026-05-30']);
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p1', 'p2']);
    expect(out[0].piani[0].operatori.map((o) => o.id)).toEqual(['1', '2']);
    expect(out[1].piani).toHaveLength(1);
  });
  it('lista vuota → []', () => {
    expect(groupRapportiniByDay([])).toEqual([]);
  });
});
