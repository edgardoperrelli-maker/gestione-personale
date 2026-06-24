// utils/rapportini/ordineVoci.test.ts
import { describe, it, expect } from 'vitest';
import { rankOrdineDaFile } from './ordineVoci';

describe('rankOrdineDaFile', () => {
  it('ordina per campo ordine esplicito', () => {
    const r = rankOrdineDaFile([{ id: 'a', ordine: 3 }, { id: 'b', ordine: 1 }, { id: 'c', ordine: 2 }]);
    expect(r).toEqual({ b: 1, c: 2, a: 3 });
  });

  it('senza ordine, usa il numero di riga dall id row-N', () => {
    const r = rankOrdineDaFile([{ id: 'row-5' }, { id: 'row-2' }, { id: 'row-10' }]);
    expect(r).toEqual({ 'row-2': 1, 'row-5': 2, 'row-10': 3 });
  });

  it('usa l indice dagli id template tpl-<ts>-<idx>', () => {
    const r = rankOrdineDaFile([{ id: 'tpl-1718-2' }, { id: 'tpl-1718-0' }, { id: 'tpl-1718-1' }]);
    expect(r).toEqual({ 'tpl-1718-0': 1, 'tpl-1718-1': 2, 'tpl-1718-2': 3 });
  });

  it('i task senza chiave (manuali) vanno in coda, in ordine originale', () => {
    const r = rankOrdineDaFile([{ id: 'manual-9' }, { id: 'row-3' }, { id: 'manual-8' }, { id: 'row-1' }]);
    // row-1, row-3 davanti (per riga); poi i manual nell ordine in cui compaiono
    expect(r).toEqual({ 'row-1': 1, 'row-3': 2, 'manual-9': 3, 'manual-8': 4 });
  });

  it('ordine esplicito ha la precedenza sull id', () => {
    const r = rankOrdineDaFile([{ id: 'row-99', ordine: 1 }, { id: 'row-1', ordine: 2 }]);
    expect(r).toEqual({ 'row-99': 1, 'row-1': 2 });
  });

  it('lista vuota → mappa vuota', () => {
    expect(rankOrdineDaFile([])).toEqual({});
  });
});
