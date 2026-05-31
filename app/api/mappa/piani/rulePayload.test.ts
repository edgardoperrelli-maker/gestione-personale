import { describe, it, expect } from 'vitest';
import { parseRegole, buildRuleRows } from './rulePayload';

describe('parseRegole', () => {
  it('accetta regola valida', () => {
    const r = parseRegole([{ staffId: 's', filtroCap: ['00044'], maxInterventi: 10, ordine: 0 }]);
    expect(r[0].staffId).toBe('s');
    expect(r[0].filtroOds).toEqual([]);
  });
  it('scarta regole senza alcun filtro', () => { expect(parseRegole([{ staffId: 's' }])).toEqual([]); });
  it('scarta regole senza staffId', () => { expect(parseRegole([{ filtroCap: ['1'] }])).toEqual([]); });
});

describe('buildRuleRows', () => {
  it('mappa camelCase → snake_case con piano_id', () => {
    const rows = buildRuleRows('PIANO1', parseRegole([{ staffId: 's', staffName: 'S', filtroCap: ['1'], ordine: 2 }]));
    expect(rows[0]).toMatchObject({ piano_id: 'PIANO1', staff_id: 's', filtro_cap: ['1'], ordine: 2 });
  });
});
