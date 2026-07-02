import { describe, expect, it } from 'vitest';
import { aggregaPersonale, giornoSettimana, SOGLIA_DEDICATO, type RigaLavoro } from './aggregaPersonale';
import type { Aggregato } from './aggregaProduzione';

// 2026-06-01 = lunedì, 2026-06-05 = venerdì, 2026-06-06 = SABATO, 2026-06-07 = DOMENICA.
const r = (p: Partial<RigaLavoro>): RigaLavoro => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', acea: true, ...p,
});
const ZERO = { valoreFeriale: 0, sabatoValore: 0 };
const agg = (
  righe: RigaLavoro[],
  euro: Aggregato[] = [],
  euroFer: Aggregato[] = euro,
  extra: { valoreFeriale: number; sabatoValore: number } = ZERO,
) => aggregaPersonale(righe, euro, euroFer, extra);

describe('giornoSettimana', () => {
  it('riconosce lunedì/sabato/domenica in UTC', () => {
    expect(giornoSettimana('2026-06-01')).toBe(1);
    expect(giornoSettimana('2026-06-06')).toBe(6);
    expect(giornoSettimana('2026-06-07')).toBe(0);
  });
});

describe('aggregaPersonale', () => {
  it('insieme vuoto → zero giornate, nessun operatore, sabato a zero', () => {
    const p = agg([]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.operatoriAttivi).toBe(0);
    expect(p.perOperatore).toEqual([]);
    expect(p.perGiorno).toEqual([]);
    expect(p.sabato).toEqual({ giornate: 0, valore: 0 });
    expect(p.valoreFeriale).toBe(0);
  });

  it('giornata piena ACEA feriale → frazione 1', () => {
    const p = agg([r({}), r({})], [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 100 }]);
    expect(p.totaleGiornate).toBe(1);
    expect(p.perOperatore[0]).toMatchObject({ chiave: 's1', giornate: 1, interventiAcea: 2, valore: 100 });
  });

  it('giornata mista → frazione proporzionale sui LAVORATI (2 ACEA su 10 → 0,2)', () => {
    const righe = [
      ...Array.from({ length: 2 }, () => r({ acea: true })),
      ...Array.from({ length: 8 }, () => r({ acea: false })),
    ];
    const p = agg(righe);
    expect(p.perOperatore[0].giornate).toBe(0.2);
    expect(p.perOperatore[0].interventiAcea).toBe(2);
  });

  it('giorno senza interventi ACEA → non conta (né giornate né perGiorno)', () => {
    const p = agg([r({ acea: false })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
  });

  it('SABATO → frazione in sabato.giornate, fuori da giornate/perGiorno/perOperatore', () => {
    const p = agg([r({ data: '2026-06-06' })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
    expect(p.perOperatore).toEqual([]); // operatore solo-sabato non è "attivo" feriale
    expect(p.sabato.giornate).toBe(1);
  });

  it('DOMENICA → scartata ovunque (nemmeno nel sabato)', () => {
    const p = agg([r({ data: '2026-06-07' })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.sabato.giornate).toBe(0);
    expect(p.perOperatore).toEqual([]);
  });

  it('sabato misto: solo la frazione ACEA finisce nel sabato', () => {
    const p = agg([r({ data: '2026-06-06', acea: true }), r({ data: '2026-06-06', acea: false })]);
    expect(p.sabato.giornate).toBe(0.5);
  });

  it('perGiorno separa dedicati (frazione ≥ 0,8) da saturazione', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
    ];
    const p = agg(righe);
    expect(p.perGiorno).toEqual([{ data: '2026-06-01', dedicate: 1, saturazione: 0.25, operatori: 2 }]);
    expect(SOGLIA_DEDICATO).toBe(0.8);
  });

  it('resa = valoreFeriale/giornate; valore resta il TOTALE; ordinamento per valore desc', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-02' }),
    ];
    const p = agg(
      righe,
      [
        { chiave: 's1', label: 'ROSSI', conteggio: 1, valore: 50 },
        { chiave: 's2', label: 'VERDI', conteggio: 2, valore: 300 },
      ],
      [
        { chiave: 's1', label: 'ROSSI', conteggio: 0, valore: 40 },
        { chiave: 's2', label: 'VERDI', conteggio: 0, valore: 200 },
      ],
    );
    expect(p.perOperatore.map((o) => o.chiave)).toEqual(['s2', 's1']);
    expect(p.perOperatore[0]).toMatchObject({ valore: 300, valoreFeriale: 200, resa: 100 }); // 200 € feriali / 2 gg
    expect(p.perOperatore[1]).toMatchObject({ valore: 50, valoreFeriale: 40, resa: 40 });
  });

  it('valoreFeriale e sabato.valore arrivano da extra, arrotondati a 2 decimali', () => {
    const p = agg([r({})], [], [], { valoreFeriale: 100.005, sabatoValore: 9.999 });
    expect(p.valoreFeriale).toBe(100.01);
    expect(p.sabato.valore).toBe(10);
  });

  it('righe senza staffId o senza data vengono scartate', () => {
    const p = agg([r({ staffId: '' }), r({ data: '' })]);
    expect(p.totaleGiornate).toBe(0);
  });
});
