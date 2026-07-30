import { describe, it, expect } from 'vitest';
import { parseMasterUpload, trovaHeaderMaster } from './masterUpload';

describe('trovaHeaderMaster', () => {
  it("trova l'header anche dopo righe di preambolo", () => {
    const rows = [
      ['LIMITAZIONI MASSIVE — COMUNE DI LABICO'],
      [],
      ['Ordine', 'Matricola misuratore', 'Indirizzo', 'Località', 'Operazione testo breve'],
      ['912000001', 'M1', 'VIA ROMA 1', 'LABICO', 'Limitazione'],
    ];
    expect(trovaHeaderMaster(rows)).toBe(2);
  });
  it('preferisce la riga con ODL + almeno un altro campo a quella col solo ODL', () => {
    const rows = [
      ['Ordine'],
      ['Ordine', 'Matricola'],
    ];
    expect(trovaHeaderMaster(rows)).toBe(1);
  });
  it('senza colonna ODL: -1', () => {
    expect(trovaHeaderMaster([['Matricola', 'Indirizzo']])).toBe(-1);
  });
  it('"Coordinate" NON è la colonna ordine', () => {
    expect(trovaHeaderMaster([['Coordinate', 'Matricola']])).toBe(-1);
  });
});

describe('parseMasterUpload', () => {
  it('mappa le colonne per nome (accenti/maiuscole indifferenti) e scarta le righe senza ODL', () => {
    const out = parseMasterUpload([
      ['ORDINE', 'MATRICOLA', 'INDIRIZZO', 'C.A.P.', 'LOCALITÀ', 'OPERAZIONE'],
      [' 912000001 ', ' M1 ', 'VIA ROMA 1', '00030', 'LABICO', 'Limitazione'],
      ['', 'M2', 'VIA MILANO 2', '00060', 'RIANO', ''],
      [],
    ]);
    expect(out.righe).toEqual([
      { odl: '912000001', matricola: 'M1', indirizzo: 'VIA ROMA 1', cap: '00030', comune: 'LABICO', operazione: 'Limitazione' },
    ]);
    expect(out.totale).toBe(2);
    expect(out.scartate).toBe(1);
  });
  it('campi assenti nel file → stringa vuota (li riempiranno le altre fonti, se possono)', () => {
    const out = parseMasterUpload([
      ['Ordine', 'Matricola'],
      ['1', 'M1'],
    ]);
    expect(out.righe[0]).toEqual({ odl: '1', matricola: 'M1', indirizzo: '', cap: '', comune: '', operazione: '' });
  });
  it('"DESCRIZIONE ATTIVITÀ" vale come operazione, "Descrizione Stato Ordine" no', () => {
    const out = parseMasterUpload([
      ['Ordine', 'Descrizione Stato Ordine', 'DESCRIZIONE ATTIVITÀ'],
      ['1', 'CHIUSO', 'Sospensione'],
    ]);
    expect(out.righe[0].operazione).toBe('Sospensione');
  });
  it('senza colonna ODL lancia', () => {
    expect(() => parseMasterUpload([['Matricola'], ['M1']])).toThrow(/ODL\/ORDINE/);
  });
});
