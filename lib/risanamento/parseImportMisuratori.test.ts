import { describe, it, expect } from 'vitest';
import { parseImportMisuratori } from './parseImportMisuratori';

describe('parseImportMisuratori', () => {
  const header = ['Indirizzo', 'Civico', 'Comune', 'CAP', 'PDR', 'Matricola', 'Nominativo'];

  it('mappa le colonne e produce i record', () => {
    const rows = [
      header,
      ['Via Mario Rossi', '24', 'Napoli', '80100', 'PDR1', 'MAT1', 'Mario Rossi'],
      ['Via Mario Rossi', '24', 'Napoli', '80100', 'PDR2', 'MAT2', 'Anna Bianchi'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.totale).toBe(2);
    expect(res.scartate).toBe(0);
    expect(res.records).toEqual([
      { indirizzo: 'Via Mario Rossi', civico: '24', comune: 'Napoli', cap: '80100', pdr: 'PDR1', matricola: 'MAT1', nominativo: 'Mario Rossi', odl: '' },
      { indirizzo: 'Via Mario Rossi', civico: '24', comune: 'Napoli', cap: '80100', pdr: 'PDR2', matricola: 'MAT2', nominativo: 'Anna Bianchi', odl: '' },
    ]);
  });

  it('riconosce la colonna ODS/ODL', () => {
    const rows = [
      ['Ods/odl', 'Matricola', 'PDR', 'Nominativo', 'Indirizzo', 'Comune', 'CAP'],
      ['912228701', '202015209996', '4000169806', '', 'COLLE DELLE CASETTE 16', 'ZAGAROLO', '00039'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0].odl).toBe('912228701');
    expect(res.records[0].matricola).toBe('202015209996');
  });

  // Le estrazioni ACEA per comune (ZAGAROLO.xlsx, LABICO.xlsx, ...) intestano l'ODL "Ordine",
  // non "Ods/odl": senza questo alias l'import entra con odl vuoto, che e' proprio il campo che
  // serve al "+" lim_massive per agganciare la riga del master.
  it('riconosce la colonna "Ordine" delle estrazioni ACEA per comune', () => {
    const rows = [
      ['Ordine', 'Impianto', 'matricola', 'Indirizzo', 'Long', 'Lat', 'cap', 'Località'],
      ['912350788', '4004130614', '202415625500', 'CIRCONVALLAZIONE GIOVANNI FALCONE 1', '', '', '00030', 'LABICO'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0].odl).toBe('912350788');
    expect(res.records[0].matricola).toBe('202415625500');
    expect(res.records[0].comune).toBe('LABICO');
    expect(res.records[0].cap).toBe('00030');
    expect(res.records[0].indirizzo).toBe('CIRCONVALLAZIONE GIOVANNI FALCONE 1');
  });

  // Guard: l'alias "Ordine" deve essere ancorato. Un pattern lasco (es. /ordin/) matcherebbe
  // "Coordinate"/"Coordinata" delle estrazioni con geolocalizzazione, riempiendo l'odl di spazzatura.
  it('non scambia "Coordinate" per la colonna Ordine', () => {
    const rows = [
      ['Matricola', 'Coordinate', 'Coordinata X'],
      ['MAT1', '41.81,12.84', '12.84'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0].odl).toBe('');
  });

  it('scarta le righe senza matricola e le conta', () => {
    const rows = [
      header,
      ['Via X', '1', 'Napoli', '', '', 'MATX', 'Tizio'],
      ['Via Y', '2', 'Napoli', '', 'PDRY', '', 'Caio'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.totale).toBe(2);
    expect(res.scartate).toBe(1);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].matricola).toBe('MATX');
  });

  it('riconosce gli header indipendentemente da maiuscole/spazi/accenti', () => {
    const rows = [
      ['  MATRICOLA ', 'p.d.r.', 'Nominativo', 'VIA', 'N. Civico', 'Città', 'C.A.P.'],
      ['MAT9', 'PDR9', 'Nome9', 'Via Z', '9', 'Napoli', '80120'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0]).toEqual({
      matricola: 'MAT9', pdr: 'PDR9', nominativo: 'Nome9',
      indirizzo: 'Via Z', civico: '9', comune: 'Napoli', cap: '80120', odl: '',
    });
  });

  it('campi opzionali assenti → stringa vuota', () => {
    const rows = [
      ['Matricola', 'Indirizzo', 'Civico'],
      ['MAT1', 'Via A', '3'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0]).toEqual({
      matricola: 'MAT1', indirizzo: 'Via A', civico: '3',
      comune: '', cap: '', pdr: '', nominativo: '', odl: '',
    });
  });

  it('lancia se manca la colonna matricola', () => {
    const rows = [['Indirizzo', 'Civico', 'PDR'], ['Via A', '1', 'PDR1']];
    expect(() => parseImportMisuratori(rows)).toThrowError(/matricola/i);
  });

  it('file vuoto o solo header → nessun record', () => {
    expect(parseImportMisuratori([]).records).toEqual([]);
    expect(parseImportMisuratori([['Matricola']]).records).toEqual([]);
  });

  it('converte valori numerici (da Excel) in stringa', () => {
    const rows = [['Matricola', 'CAP'], [12345678, 80100]];
    const res = parseImportMisuratori(rows);
    expect(res.records[0].matricola).toBe('12345678');
    expect(res.records[0].cap).toBe('80100');
  });
});
