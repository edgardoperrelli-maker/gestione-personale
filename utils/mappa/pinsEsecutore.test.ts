// utils/mappa/pinsEsecutore.test.ts
import { describe, it, expect } from 'vitest';
import { pinsFromDistribution } from './pinsEsecutore';

describe('pinsFromDistribution', () => {
  it('distribuzione vuota → nessun pin', () => {
    expect(pinsFromDistribution([])).toEqual({});
  });

  it('mappa ogni task al suo operatore (staffId)', () => {
    const dist = [
      { staffId: 's1', tasks: [{ id: 't1' }, { id: 't2' }] },
      { staffId: 's2', tasks: [{ id: 't3' }] },
    ];
    expect(pinsFromDistribution(dist)).toEqual({ t1: 's1', t2: 's1', t3: 's2' });
  });

  it('salta le entry senza staffId e i task senza id', () => {
    const dist = [
      { staffId: '', tasks: [{ id: 't1' }] },
      { staffId: 's2', tasks: [{ id: '' }, { id: 't4' }] },
    ];
    expect(pinsFromDistribution(dist)).toEqual({ t4: 's2' });
  });

  it('gestisce tasks mancante/nullo senza errori', () => {
    const dist = [{ staffId: 's1', tasks: undefined as unknown as Array<{ id: string }> }];
    expect(pinsFromDistribution(dist)).toEqual({});
  });
});
