import { describe, expect, it } from 'vitest';
import { aggregaProduzione, type RigaProduzione } from './aggregaProduzione';

const base: RigaProduzione = {
  odl: '1',
  voce: 10,
  kpi: 'EL',
  data: '2026-06-01',
  staffId: 's1',
  operatore: 'ROSSI',
  territorioId: 't1',
  territorio: 'Roma',
  valore: 10,
};
const riga = (o: Partial<RigaProduzione>): RigaProduzione => ({ ...base, ...o });

describe('aggregaProduzione', () => {
  it('insieme vuoto → totali a zero, niente gruppi', () => {
    const a = aggregaProduzione([]);
    expect(a.totale).toEqual({ conteggio: 0, valore: 0 });
    expect(a.perVoce).toEqual([]);
    expect(a.perOperatore).toEqual([]);
    expect(a.perTerritorio).toEqual([]);
    expect(a.perGiorno).toEqual([]);
    expect(a.nonRisolte).toBe(0);
  });

  it('somma conteggio e valore totali', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', valore: 10 }),
      riga({ odl: '2', valore: 5.5 }),
    ]);
    expect(a.totale).toEqual({ conteggio: 2, valore: 15.5 });
  });

  it('aggrega per voce in ordine EL/ES/ERC/ERA, includendo solo le voci presenti', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', voce: 11, kpi: 'ES', valore: 5 }),
      riga({ odl: '2', voce: 10, kpi: 'EL', valore: 10 }),
      riga({ odl: '3', voce: 10, kpi: 'EL', valore: 10 }),
    ]);
    expect(a.perVoce.map((v) => v.chiave)).toEqual(['EL', 'ES']);
    expect(a.perVoce[0]).toMatchObject({ chiave: 'EL', conteggio: 2, valore: 20 });
    expect(a.perVoce[1]).toMatchObject({ chiave: 'ES', conteggio: 1, valore: 5 });
  });

  it('le voci non risolte finiscono in NON_RISOLTA (in coda) e in nonRisolte', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', voce: 10, kpi: 'EL', valore: 10 }),
      riga({ odl: '2', voce: null, kpi: null, valore: 0 }),
      riga({ odl: '3', voce: null, kpi: null, valore: 0 }),
    ]);
    expect(a.perVoce.map((v) => v.chiave)).toEqual(['EL', 'NON_RISOLTA']);
    expect(a.perVoce[1]).toMatchObject({ chiave: 'NON_RISOLTA', conteggio: 2, valore: 0 });
    expect(a.nonRisolte).toBe(2);
  });

  it('aggrega per operatore (label = nome) ordinato per valore desc', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', staffId: 's1', operatore: 'ROSSI', valore: 5 }),
      riga({ odl: '2', staffId: 's2', operatore: 'VERDI', valore: 30 }),
      riga({ odl: '3', staffId: 's1', operatore: 'ROSSI', valore: 5 }),
    ]);
    expect(a.perOperatore.map((o) => o.label)).toEqual(['VERDI', 'ROSSI']);
    expect(a.perOperatore[1]).toMatchObject({ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 10 });
  });

  it('aggrega per giorno ordinato per data crescente', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', data: '2026-06-03', valore: 1 }),
      riga({ odl: '2', data: '2026-06-01', valore: 2 }),
      riga({ odl: '3', data: '2026-06-01', valore: 3 }),
    ]);
    expect(a.perGiorno.map((g) => g.chiave)).toEqual(['2026-06-01', '2026-06-03']);
    expect(a.perGiorno[0]).toMatchObject({ chiave: '2026-06-01', conteggio: 2, valore: 5 });
  });
});
