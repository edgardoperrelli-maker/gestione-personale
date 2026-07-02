import { describe, expect, it } from 'vitest';
import { aggregaEsiti, type RigaEsito } from './aggregaEsiti';

const r = (p: Partial<RigaEsito>): RigaEsito => ({ staffId: 's1', operatore: 'ROSSI', esitoOk: true, ...p });

describe('aggregaEsiti', () => {
  it('insieme vuoto → nessun operatore', () => {
    expect(aggregaEsiti([], [])).toEqual([]);
  });

  it('conta positivi/negativi/non lavorati sull\'assegnato', () => {
    const righe = [
      r({ esitoOk: true }),
      r({ esitoOk: true }),
      r({ esitoOk: false }),
      r({ esitoOk: null }),
    ];
    const out = aggregaEsiti(righe, [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 500 }]);
    expect(out).toEqual([
      { chiave: 's1', label: 'ROSSI', assegnati: 4, positivi: 2, negativi: 1, nonLavorati: 1, valore: 500 },
    ]);
  });

  it('operatore senza € produzione → valore 0', () => {
    const out = aggregaEsiti([r({ esitoOk: null })], []);
    expect(out[0].valore).toBe(0);
    expect(out[0].nonLavorati).toBe(1);
  });

  it('ordina per assegnati desc, poi valore desc', () => {
    const righe = [
      r({ staffId: 'a', operatore: 'A' }),
      r({ staffId: 'b', operatore: 'B' }),
      r({ staffId: 'b', operatore: 'B' }),
      r({ staffId: 'c', operatore: 'C' }),
    ];
    const out = aggregaEsiti(righe, [
      { chiave: 'a', label: 'A', conteggio: 1, valore: 10 },
      { chiave: 'c', label: 'C', conteggio: 1, valore: 99 },
    ]);
    expect(out.map((o) => o.chiave)).toEqual(['b', 'c', 'a']);
  });

  it('righe senza staffId vengono scartate', () => {
    expect(aggregaEsiti([r({ staffId: '' })], [])).toEqual([]);
  });
});
