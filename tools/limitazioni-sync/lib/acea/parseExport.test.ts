// tools/limitazioni-sync/lib/acea/parseExport.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { estraiRigheExport, trovaHeader, valoreCella } from './parseExport.mjs';

function ws(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('X');
  rows.forEach((r) => sheet.addRow(r));
  return sheet;
}

describe('valoreCella', () => {
  it('estrae testo da rich text e formula', () => {
    expect(valoreCella({ richText: [{ text: 'A' }, { text: 'B' }] })).toBe('AB');
    expect(valoreCella({ result: 'R', formula: 'X' })).toBe('R');
    expect(valoreCella(null)).toBe('');
    expect(valoreCella(957)).toBe(957);
  });
});

describe('trovaHeader', () => {
  it('trova la riga intestazione che contiene tutte le colonne', () => {
    const sheet = ws([['x'], ['Ordine', 'Stato Operazione'], ['957', 'completato']]);
    const { riga, idx } = trovaHeader(sheet, ['Ordine', 'Stato Operazione']);
    expect(riga).toBe(2);
    expect(idx['Ordine']).toBe(0);
    expect(idx['Stato Operazione']).toBe(1);
  });
  it('riga=-1 se manca una colonna', () => {
    const sheet = ws([['Ordine', 'Altro']]);
    expect(trovaHeader(sheet, ['Ordine', 'Stato Operazione']).riga).toBe(-1);
  });
});

describe('estraiRigheExport', () => {
  it('estrae { ordine, stato } normalizzando l\'ODL e saltando le righe senza ordine', () => {
    const sheet = ws([
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
      [' 957289327 ', 'Ricevuto'],
      ['', 'Intervento Richiesto'],
    ]);
    const { righe, erroreColonne } = estraiRigheExport(sheet, { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' });
    expect(erroreColonne).toBe(false);
    expect(righe).toEqual([
      { ordine: '957276080', stato: 'completato' },
      { ordine: '957289327', stato: 'Ricevuto' },
    ]);
  });
  it('erroreColonne=true se le colonne non ci sono', () => {
    const sheet = ws([['Pippo', 'Pluto'], ['1', '2']]);
    expect(estraiRigheExport(sheet, { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' }).erroreColonne).toBe(true);
  });
  it('legge la colonna operatore (cognome + nome) quando richiesta', () => {
    const sheet = ws([
      ['Ordine', 'Stato Operazione', 'Cognome C.I.D.', 'Nome C.I.D.'],
      ['957364267', 'completato', 'SIKORA', 'FRANCO'],
      ['957362111', 'Ricevuto', 'DIONISI', ''],
      ['957999999', 'completato', '', ''],
    ]);
    const { righe } = estraiRigheExport(sheet, {
      colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione',
      colonnaOperatore: 'Cognome C.I.D.', colonnaOperatoreNome: 'Nome C.I.D.',
    });
    expect(righe).toEqual([
      { ordine: '957364267', stato: 'completato', operatore: 'SIKORA FRANCO' },
      { ordine: '957362111', stato: 'Ricevuto', operatore: 'DIONISI' },
      { ordine: '957999999', stato: 'completato', operatore: '' },
    ]);
  });
  it('colonna operatore assente nell\'header → operatore vuoto (degradazione morbida)', () => {
    const sheet = ws([['Ordine', 'Stato Operazione'], ['957364267', 'completato']]);
    const { righe, erroreColonne } = estraiRigheExport(sheet, {
      colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione', colonnaOperatore: 'Cognome C.I.D.',
    });
    expect(erroreColonne).toBe(false);
    expect(righe).toEqual([{ ordine: '957364267', stato: 'completato', operatore: '' }]);
  });
});
