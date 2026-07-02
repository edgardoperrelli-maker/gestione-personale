import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookNonClassificate } from './exportNonClassificate';
import type { InterventoNonClassificato } from './nonClassificate';

const righe: InterventoNonClassificato[] = [
  {
    odl: 'o2', data: '2026-06-02', operatore: 'VERDI', territorio: 'Roma', committente: 'acea',
    comune: 'ROMA', descrizioneGrezza: 'Riattivazione fornitura', attivitaCanonica: 'Riattivazione utenza', valore: 28.81,
  },
  {
    odl: 'o1', data: '2026-06-01', operatore: 'ROSSI', territorio: 'Roma', committente: 'acea',
    comune: 'ROMA', descrizioneGrezza: 'Regolarizzazione flusso idrico', attivitaCanonica: 'Riattivazione utenza', valore: 28.81,
  },
];

describe('buildWorkbookNonClassificate', () => {
  it('produce un xlsx con intestazione, righe ordinate per descrizione e riga totale', async () => {
    const buf = await buildWorkbookNonClassificate(righe, '2026-06-01', '2026-06-30');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);

    const ws = wb.getWorksheet('Non classificate');
    expect(ws).toBeDefined();
    expect(String(ws!.getCell('A1').value)).toContain('Interventi non classificati');
    expect(String(ws!.getCell('A2').value)).toContain('2 interventi');

    // riga 4 = prima intestazione colonne, riga 5 = prima riga dati: ordinata per descrizione grezza
    // ("Regolarizzazione..." < "Riattivazione..." alfabeticamente)
    expect(ws!.getCell('A4').value).toBe('ODL');
    expect(ws!.getCell('G4').value).toBe('Descrizione attività');
    expect(ws!.getCell('G5').value).toBe('Regolarizzazione flusso idrico');
    expect(ws!.getCell('A5').value).toBe('o1');
    expect(ws!.getCell('G6').value).toBe('Riattivazione fornitura');
    expect(ws!.getCell('I5').value).toBe(28.81);

    // riga totale
    const totRow = ws!.getRow(7);
    expect(totRow.getCell(8).value).toBe('TOTALE');
    expect(totRow.getCell(9).value).toBeCloseTo(57.62, 2);
  });

  it('gestisce l’elenco vuoto senza errori', async () => {
    const buf = await buildWorkbookNonClassificate([], '2026-06-01', '2026-06-30');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const ws = wb.getWorksheet('Non classificate');
    expect(String(ws!.getCell('A2').value)).toContain('0 interventi');
  });
});
