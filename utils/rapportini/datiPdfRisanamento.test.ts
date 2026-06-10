import { describe, it, expect } from 'vitest';
import { datiPdfRisanamento } from './datiPdfRisanamento';

const voci = [
  { id: 'v1', via: 'Via Roma 1', comune: 'Roma' },
  { id: 'v2', via: 'Via Po 2', comune: 'Roma' },
];
const righe = [
  { voce_id: 'v1', matricola: 'M2', pdr: 'P2', nominativo: 'Bianchi', ordine: 2 },
  { voce_id: 'v1', matricola: 'M1', pdr: 'P1', nominativo: 'Rossi', ordine: 1 },
  { voce_id: 'v2', matricola: 'M3', pdr: 'P3', nominativo: 'Verdi', ordine: 1 },
];

describe('datiPdfRisanamento', () => {
  it('raggruppa per civico e ordina i misuratori per ordine', () => {
    const d = datiPdfRisanamento(voci as never, righe as never);
    expect(d.civici).toHaveLength(2);
    expect(d.civici[0].via).toBe('Via Roma 1');
    expect(d.civici[0].misuratori.map((m) => m.matricola)).toEqual(['M1', 'M2']);
    expect(d.civici[1].misuratori.map((m) => m.matricola)).toEqual(['M3']);
  });
  it('calcola i totali (punti gas = righe)', () => {
    const d = datiPdfRisanamento(voci as never, righe as never);
    expect(d.totaleMisuratori).toBe(3);
    expect(d.totaleCivici).toBe(2);
  });
  it('civico senza righe → misuratori vuoti', () => {
    const d = datiPdfRisanamento(voci as never, [] as never);
    expect(d.totaleMisuratori).toBe(0);
    expect(d.civici[0].misuratori).toEqual([]);
  });
  it('campi nulli → stringhe vuote', () => {
    const d = datiPdfRisanamento([{ id: 'v1', via: null, comune: null }] as never, [{ voce_id: 'v1', matricola: null, pdr: null, nominativo: null, ordine: 1 }] as never);
    expect(d.civici[0].misuratori[0]).toEqual({ matricola: '', pdr: '', nominativo: '' });
  });
});
