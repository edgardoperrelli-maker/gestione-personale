import { describe, it, expect } from 'vitest';
import { chiaveOdl, chiaveRiga, righeNuoveMaster } from './righeNuoveMaster';

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

  /** Catalogo costruito con la STESSA funzione che usa la route: se la chiave cambia, il
   *  test cambia con lei invece di restare verde su una chiave che non esiste più. */
  const catalogoDa = (...righe: Array<{ odl: string; matricola?: string }>) =>
    new Set(righe.map(chiaveRiga));

  // Il caso che ha raddoppiato il master AcquaLatina: stesso file ricaricato.
  it('stesso file ricaricato: nessuna riga nuova, tutte scartate', () => {
    const catalogo = catalogoDa(R('A1'), R('A2'), R('A3'));
    const e = righeNuoveMaster([R('A1'), R('A2'), R('A3')], catalogo);
    expect(e.nuove).toEqual([]);
    expect(e.giaPresenti).toBe(3);
  });

  it('file aggiornato: entrano SOLO gli ordini nuovi', () => {
    const catalogo = catalogoDa(R('A1'), R('A2'));
    const e = righeNuoveMaster([R('A1'), R('A2'), R('A3'), R('A4')], catalogo);
    expect(e.nuove.map((r) => r.odl)).toEqual(['A3', 'A4']);
    expect(e.giaPresenti).toBe(2);
  });

  it('il confronto è normalizzato: " a1 " è già presente se a catalogo c’è A1', () => {
    const e = righeNuoveMaster([R(' a1 ')], catalogoDa(R('A1')));
    expect(e.nuove).toEqual([]);
    expect(e.giaPresenti).toBe(1);
  });

  // IL CASO CONDOMINIO. Su AcquaLatina 109 ODL coprono da 2 a 5 contatori: sul master di
  // Terracina sono 133 righe. Una dedup sul solo ODL le chiamerebbe «ripetute nel file» e
  // le butterebbe — e quei contatori sparirebbero dal censimento, lasciando l'operatore
  // che ne cerca uno davanti a «non censito».
  it('stesso ODL con matricole diverse: sono contatori distinti, entrano tutti', () => {
    const e = righeNuoveMaster([R('A1', 'M1'), R('A1', 'M2'), R('A1', 'M3'), R('A2')], new Set());
    expect(e.nuove.map((r) => `${r.odl}/${r.matricola}`)).toEqual(['A1/M1', 'A1/M2', 'A1/M3', 'A2/']);
    expect(e.doppieNelFile).toBe(0);
    expect(e.giaPresenti).toBe(0);
  });

  it('una matricola nuova sotto un ODL già a catalogo entra: è un contatore in più', () => {
    const e = righeNuoveMaster([R('A1', 'M1'), R('A1', 'M2')], catalogoDa(R('A1', 'M1')));
    expect(e.nuove.map((r) => r.matricola)).toEqual(['M2']);
    expect(e.giaPresenti).toBe(1);
  });

  it('righe ripetute DENTRO il file: stesso ODL E stessa matricola, entra la prima', () => {
    const e = righeNuoveMaster([R('A1', 'M1'), R('A1', 'M1'), R('A2')], new Set());
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1', 'A2']);
    expect(e.doppieNelFile).toBe(1);
    expect(e.giaPresenti).toBe(0);
  });

  it('senza matricola la chiave resta l’ODL: i committenti che non ce l’hanno non cambiano', () => {
    const e = righeNuoveMaster([R('A1'), R('A1'), R('A2')], catalogoDa(R('A2')));
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1']);
    expect(e.doppieNelFile).toBe(1);
    expect(e.giaPresenti).toBe(1);
  });

  it('righe senza ODL non contano da nessuna parte', () => {
    // La chiave composta non è MAI vuota (contiene il separatore): il controllo di riga
    // indicizzabile deve restare sull'ODL, o una riga con la sola matricola passerebbe.
    const e = righeNuoveMaster([R(''), R('  '), R('', 'M9'), R('A1')], new Set());
    expect(e.nuove.map((r) => r.odl)).toEqual(['A1']);
    expect(e.giaPresenti).toBe(0);
    expect(e.doppieNelFile).toBe(0);
  });

  it('una riga già a catalogo NON viene aggiornata: si scarta e basta', () => {
    // Scelta esplicita: un file ricaricato per sbaglio non deve sovrascrivere in silenzio
    // dati che qualcuno aveva sistemato a mano.
    const e = righeNuoveMaster([R('A1', 'M1')], catalogoDa(R('A1', 'M1')));
    expect(e.nuove).toEqual([]);
  });
});

describe('chiaveRiga', () => {
  it('distingue i contatori dello stesso ordine', () => {
    expect(chiaveRiga(R('A1', 'M1'))).not.toBe(chiaveRiga(R('A1', 'M2')));
  });
  it('normalizza entrambi i campi', () => {
    expect(chiaveRiga({ odl: ' a1 ', matricola: ' m 1 ' })).toBe(chiaveRiga({ odl: 'A1', matricola: 'M1' }));
  });
  it('senza matricola degenera nell’ODL', () => {
    expect(chiaveRiga({ odl: 'A1' })).toBe(chiaveRiga({ odl: 'A1', matricola: null }));
  });
});
