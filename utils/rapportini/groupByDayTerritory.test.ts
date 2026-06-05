// utils/rapportini/groupByDayTerritory.test.ts
import { describe, it, expect } from 'vitest';
import { groupByDayTerritory } from './groupByDayTerritory';
import type { RapRiepilogo } from './groupByDay';

function rap(p: Partial<RapRiepilogo>): RapRiepilogo {
  return {
    id: 'r', staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
    data: '2026-06-04', expires_at: '', submitted_at: null, url: '',
    statoCalcolato: 'valido', nVoci: 0, piano_id: 'p1', territorio: 'CORCIANO',
    piano_creato_at: '2026-06-04T09:00:00Z', ...p,
  };
}

describe('groupByDayTerritory', () => {
  it('unisce due piani dello stesso territorio/giorno in un solo gruppo territorio', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', staff_id: 's1', piano_id: 'p1', piano_creato_at: '2026-06-04T09:00:00Z' }),
      rap({ id: 'b', staff_id: 's2', piano_id: 'p2', piano_creato_at: '2026-06-04T14:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].territori).toHaveLength(1);
    expect(out[0].territori[0].etichetta).toBe('CORCIANO');
    expect(out[0].territori[0].piani.map((p) => p.piano_id)).toEqual(['p1', 'p2']); // ordinati per creato_at
    expect(out[0].territori[0].nOperatori).toBe(2);
  });

  it('normalizza maiuscole/spazi del territorio', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', piano_id: 'p1', territorio: 'CORCIANO' }),
      rap({ id: 'b', piano_id: 'p2', territorio: 'corciano ' }),
    ]);
    expect(out[0].territori).toHaveLength(1);
  });

  it('territorio null/vuoto → gruppo "Senza territorio" separato e in fondo', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', piano_id: 'p1', territorio: null }),
      rap({ id: 'b', piano_id: 'p2', territorio: 'ALFA' }),
    ]);
    expect(out[0].territori.map((t) => t.etichetta)).toEqual(['ALFA', 'Senza territorio']);
  });

  it('ordina i giorni in modo decrescente', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', data: '2026-06-03' }),
      rap({ id: 'b', data: '2026-06-05' }),
    ]);
    expect(out.map((g) => g.data)).toEqual(['2026-06-05', '2026-06-03']);
  });
});
