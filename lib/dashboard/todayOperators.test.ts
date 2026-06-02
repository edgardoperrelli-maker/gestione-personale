import { describe, it, expect } from 'vitest';
import { selectTodayOperators, type TodayAssignmentRow } from './todayOperators';

function r(p: Partial<TodayAssignmentRow>): TodayAssignmentRow {
  return { staffId: 's1', displayName: 'Mario', territoryName: 'Roma', lat: 41.9, lng: 12.5, ...p };
}

describe('selectTodayOperators', () => {
  it('produce un marker per operatore con coordinate', () => {
    const out = selectTodayOperators([r({})]);
    expect(out).toEqual([{ staffId: 's1', name: 'Mario', territory: 'Roma', lat: 41.9, lng: 12.5 }]);
  });

  it('deduplica per staffId (più assegnazioni stesso operatore)', () => {
    const out = selectTodayOperators([
      r({ staffId: 's1', territoryName: 'Roma' }),
      r({ staffId: 's1', territoryName: 'Roma Sud' }),
      r({ staffId: 's2', displayName: 'Lucia' }),
    ]);
    expect(out.map((m) => m.staffId)).toEqual(['s1', 's2']);
    expect(out[0].territory).toBe('Roma'); // prima occorrenza
  });

  it('scarta operatori senza coordinate valide', () => {
    const out = selectTodayOperators([
      r({ staffId: 's1', lat: null }),
      r({ staffId: 's2', lng: null }),
      r({ staffId: 's3', lat: Number.NaN }),
      r({ staffId: 's4', displayName: 'Ok' }),
    ]);
    expect(out.map((m) => m.staffId)).toEqual(['s4']);
  });

  it('gestisce elenco vuoto', () => {
    expect(selectTodayOperators([])).toEqual([]);
  });
});
