import { describe, it, expect } from 'vitest';
import { parseRegole, buildRuleRows, buildLockRows } from './rulePayload';

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

describe('buildLockRows con manuali_liberi', () => {
  it('senza manualiLiberi: righe lucchetto storiche con manuali_liberi=false (default)', () => {
    expect(buildLockRows('p1', { s1: true, s2: false })).toEqual([
      { piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false },
      { piano_id: 'p1', staff_id: 's2', aperto: false, manuali_liberi: false },
    ]);
  });

  it('unisce le chiavi di aperto e manualiLiberi', () => {
    const rows = buildLockRows('p1', { s1: false }, { s1: true, s2: true });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's1', aperto: false, manuali_liberi: true });
    // s2 ha solo la corsia liberi → aperto torna al default true
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's2', aperto: true, manuali_liberi: true });
    expect(rows).toHaveLength(2);
  });

  it('manuali_liberi default false quando lo staff non è nella mappa liberi', () => {
    const rows = buildLockRows('p1', { s1: true }, { s2: true });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's2', aperto: true, manuali_liberi: true });
  });

  it('manualiLiberi non-oggetto è ignorata (back-compat)', () => {
    expect(buildLockRows('p1', { s1: true }, null)).toEqual([
      { piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false },
    ]);
  });

  it('entrambe vuote → nessuna riga', () => {
    expect(buildLockRows('p1', {}, {})).toEqual([]);
  });
});
