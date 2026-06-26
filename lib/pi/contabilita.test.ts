import { describe, it, expect } from 'vitest';
import { valoreRiga, totaleContabilita } from './contabilita';

describe('valoreRiga', () => {
  it('riproduce un valore tipo Excel (2 × 89.66 = 179.32)', () => {
    expect(valoreRiga(2, 89.66)).toBe(179.32);
  });
  it('metri con decimali (24.4 × 32.00 = 780.80)', () => {
    expect(valoreRiga(24.4, 32.0)).toBe(780.8);
  });
  it('input non finiti → 0', () => {
    expect(valoreRiga(NaN, 10)).toBe(0);
    expect(valoreRiga(2, NaN)).toBe(0);
  });
});

describe('totaleContabilita', () => {
  it('somma le righe arrotondando a 2 decimali', () => {
    const righe = [
      { quantita: 2, prezzo_snapshot: 89.66 }, // 179.32
      { quantita: 1, prezzo_snapshot: 110.43 }, // 110.43
      { quantita: 1, prezzo_snapshot: 0.5 }, // 0.50 oneri
    ];
    expect(totaleContabilita(righe)).toBe(290.25);
  });
  it('lista vuota → 0', () => {
    expect(totaleContabilita([])).toBe(0);
  });
});
