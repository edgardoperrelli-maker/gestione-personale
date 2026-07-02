import { describe, expect, it } from 'vitest';
import { aggregaPersonale, SOGLIA_DEDICATO, type RigaLavoro } from './aggregaPersonale';

const r = (p: Partial<RigaLavoro>): RigaLavoro => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', acea: true, ...p,
});

describe('aggregaPersonale', () => {
  it('insieme vuoto → zero giornate, nessun operatore', () => {
    const p = aggregaPersonale([], []);
    expect(p.totaleGiornate).toBe(0);
    expect(p.operatoriAttivi).toBe(0);
    expect(p.perOperatore).toEqual([]);
    expect(p.perGiorno).toEqual([]);
  });

  it('giornata piena ACEA → frazione 1', () => {
    const p = aggregaPersonale([r({}), r({})], [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 100 }]);
    expect(p.totaleGiornate).toBe(1);
    expect(p.perOperatore[0]).toMatchObject({ chiave: 's1', giornate: 1, interventiAcea: 2, valore: 100, resa: 100 });
  });

  it('giornata mista → frazione proporzionale sui LAVORATI (2 ACEA su 10 → 0,2)', () => {
    const righe = [
      ...Array.from({ length: 2 }, () => r({ acea: true })),
      ...Array.from({ length: 8 }, () => r({ acea: false })),
    ];
    const p = aggregaPersonale(righe, []);
    expect(p.perOperatore[0].giornate).toBe(0.2);
    expect(p.perOperatore[0].interventiAcea).toBe(2);
  });

  it('giorno senza interventi ACEA → non conta (né giornate né perGiorno)', () => {
    const p = aggregaPersonale([r({ acea: false })], []);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
  });

  it('perGiorno separa dedicati (frazione ≥ 0,8) da saturazione', () => {
    const righe = [
      // s1 il 01/06: 1 su 1 ACEA → frazione 1 (dedicato)
      r({ staffId: 's1', data: '2026-06-01', acea: true }),
      // s2 il 01/06: 1 ACEA su 4 → frazione 0,25 (saturazione)
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
    ];
    const p = aggregaPersonale(righe, []);
    expect(p.perGiorno).toEqual([{ data: '2026-06-01', dedicate: 1, saturazione: 0.25, operatori: 2 }]);
    expect(SOGLIA_DEDICATO).toBe(0.8);
  });

  it('resa = valore/giornate; null se giornate 0; ordinamento per valore desc', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-02' }),
    ];
    const p = aggregaPersonale(righe, [
      { chiave: 's1', label: 'ROSSI', conteggio: 1, valore: 50 },
      { chiave: 's2', label: 'VERDI', conteggio: 2, valore: 300 },
    ]);
    expect(p.perOperatore.map((o) => o.chiave)).toEqual(['s2', 's1']);
    expect(p.perOperatore[0].resa).toBe(150); // 300 € / 2 giornate
    expect(p.perOperatore[1].resa).toBe(50);
  });

  it('righe senza staffId o senza data vengono scartate', () => {
    const p = aggregaPersonale([r({ staffId: '' }), r({ data: '' })], []);
    expect(p.totaleGiornate).toBe(0);
  });
});
