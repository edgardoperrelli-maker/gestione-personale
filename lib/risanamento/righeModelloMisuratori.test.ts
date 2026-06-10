import { describe, it, expect } from 'vitest';
import { parseImportMisuratori } from './parseImportMisuratori';
import { righeModelloMisuratori } from './righeModelloMisuratori';

describe('righeModelloMisuratori', () => {
  it('intestazioni + 1 riga di esempio', () => {
    const r = righeModelloMisuratori();
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual(['Matricola', 'PDR', 'Nominativo', 'Indirizzo', 'Civico', 'Comune', 'CAP']);
  });
  it('round-trip: il modello è parsato senza errori e mappa tutte le colonne', () => {
    const res = parseImportMisuratori(righeModelloMisuratori());
    expect(res.records).toHaveLength(1);
    expect(res.scartate).toBe(0);
    expect(res.records[0]).toEqual({
      matricola: 'MAT123456', pdr: '00123456789', nominativo: 'Rossi Mario',
      indirizzo: 'Via Roma', civico: '12', comune: 'Firenze', cap: '50100',
    });
  });
});
