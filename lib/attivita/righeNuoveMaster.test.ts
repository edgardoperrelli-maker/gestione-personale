import { describe, it, expect } from 'vitest';
import { chiaveOdl, righeNuoveMaster } from './righeNuoveMaster';

const R = (odl: string, matricola = '') => ({ odl, matricola });

describe('chiaveOdl', () => {
  it('tollera spazi e maiuscole', () => {
    expect(chiaveOdl(' 12379532 ')).toBe('12379532');
    expect(chiaveOdl('od l-1')).toBe('ODL-1');
  });

  it('NON toglie gli zeri iniziali: su alcuni committenti sono significativi', () => {
    expect(chiaveOdl('00123')).not.toBe(chiaveOdl('123'));
  });

  it('vuoto e nullo danno chiave vuota', () => {
    expect(chiaveOdl('')).toBe('');
    expect(chiaveOdl(null)).toBe('');
    expect(chiaveOdl(undefined)).toBe('');
  });
});

describe('righeNuoveMaster', () => {
  it('catalogo vuoto: passa tutto', () => {
    const e = righeNuoveMaster([R('A1'), R('A2')], new Set());
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1', 'A2']);
    expect(e.giaPresenti).toBe(0);
  });

  // Il caso che ha raddoppiato il master AcquaLatina: stesso file ricaricato.
  it('stesso file ricaricato: nessuna riga nuova, tutte scartate', () => {
    const catalogo = new Set(['A1', 'A2', 'A3']);
    const e = righeNuoveMaster([R('A1'), R('A2'), R('A3')], catalogo);
    expect(e.nuove).toEqual([]);
    expect(e.giaPresenti).toBe(3);
  });

  it('file aggiornato: entrano SOLO gli ordini nuovi', () => {
    const catalogo = new Set(['A1', 'A2']);
    const e = righeNuoveMaster([R('A1'), R('A2'), R('A3'), R('A4')], catalogo);
    expect(e.nuove.map((r) => r.odl)).toEqual(['A3', 'A4']);
    expect(e.giaPresenti).toBe(2);
  });

  it('il confronto è normalizzato: " a1 " è già presente se a catalogo c’è A1', () => {
    const e = righeNuoveMaster([R(' a1 ')], new Set(['A1']));
    expect(e.nuove).toEqual([]);
    expect(e.giaPresenti).toBe(1);
  });

  it('righe ripetute DENTRO il file: entra la prima, le altre si contano a parte', () => {
    const e = righeNuoveMaster([R('A1', 'M1'), R('A1', 'M2'), R('A2')], new Set());
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1', 'A2']);
    expect(e.nuove[0].matricola).toBe('M1');
    expect(e.doppieNelFile).toBe(1);
    expect(e.giaPresenti).toBe(0);
  });

  it('righe senza ODL non contano da nessuna parte', () => {
    const e = righeNuoveMaster([R(''), R('  '), R('A1')], new Set());
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1']);
    expect(e.giaPresenti).toBe(0);
    expect(e.doppieNelFile).toBe(0);
  });

  it('una riga già a catalogo NON viene aggiornata: si scarta e basta', () => {
    // Scelta esplicita: un file ricaricato per sbaglio non deve sovrascrivere in silenzio
    // dati che qualcuno aveva sistemato a mano.
    const e = righeNuoveMaster([R('A1', 'MATRICOLA-CORRETTA')], new Set(['A1']));
    expect(e.nuove).toEqual([]);
  });
});
