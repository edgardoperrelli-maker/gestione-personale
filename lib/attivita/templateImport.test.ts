import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTemplateImport, COLONNE_TEMPLATE } from './templateImport';
import type { TassonomiaRiga } from './tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE', attivo: true },
  { committente: 'italgas', descrizione: 'RITIRATA', descrizioneNorm: 'RITIRATA', gruppo: 'X', attivo: false },
];

async function carica(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('buildTemplateImport', () => {
  it('due fogli: Interventi e Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Interventi', 'Leggenda']);
  });
  it('header del foglio Interventi = COLONNE_TEMPLATE', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Interventi')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header).toEqual([...COLONNE_TEMPLATE]);
  });
  it('la colonna GRUPPO ha la formula di lookup sulla Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
    const cell = ws.getRow(2).getCell(idxGruppo);
    expect(String((cell.value as { formula?: string })?.formula ?? '')).toContain('VLOOKUP');
  });
  it('la colonna DESCRIZIONE ATTIVITÀ è solo-tendina (list dalla Leggenda, errore stop)', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxDescr = COLONNE_TEMPLATE.indexOf('DESCRIZIONE ATTIVITÀ') + 1;
    for (const r of [2, 6]) {
      const dv = ws.getRow(r).getCell(idxDescr).dataValidation;
      expect(dv?.type).toBe('list');
      expect(dv?.errorStyle).toBe('stop');
      expect(dv?.showErrorMessage).toBe(true);
      // 2 attive in TASSONOMIA → elenco B2:B3 della Leggenda.
      expect(String(dv?.formulae?.[0] ?? '')).toBe('Leggenda!$B$2:$B$3');
    }
  });

  it('la Leggenda contiene solo righe attive, con chiave upper in colonna A', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Leggenda')!;
    const valori: string[] = [];
    for (let r = 2; r <= ws.rowCount; r++) valori.push(String(ws.getRow(r).getCell(2).value ?? ''));
    expect(valori).toContain('Limitazione Massiva su Impianto');
    expect(valori).toContain('BONIFICHE');
    expect(valori).not.toContain('RITIRATA');
    expect(String(ws.getRow(2).getCell(1).value)).toBe(String(ws.getRow(2).getCell(2).value).toUpperCase());
  });
});
