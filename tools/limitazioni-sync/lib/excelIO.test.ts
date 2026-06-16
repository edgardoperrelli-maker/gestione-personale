// tools/limitazioni-sync/lib/excelIO.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { caricaWorkbook, trovaRigaIntestazione, backupFile } from './excelIO.mjs';

async function creaFixture(file: string, headerRowIndex: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  // righe spazzatura sopra l'intestazione
  for (let r = 1; r < headerRowIndex; r++) ws.getRow(r).getCell(1).value = 'junk';
  const h = ws.getRow(headerRowIndex);
  h.getCell(6).value = 'ORDINE';        // F (idx0 5)
  h.getCell(9).value = 'MATRICOLA';     // I (idx0 8)
  h.getCell(67).value = 'esito';        // BO (idx0 66)
  h.getCell(69).value = 'sigillo posato'; // BQ (idx0 68)
  await wb.xlsx.writeFile(file);
}

describe('excelIO', () => {
  it('trova la riga di intestazione e fa il backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFixture(file, 3); // intestazione in riga 3

    const wb = await caricaWorkbook(file);
    const ws = wb.worksheets[0];
    expect(trovaRigaIntestazione(ws)).toBe(3);

    const dest = backupFile(file, '20260616-2100');
    expect(fs.existsSync(dest)).toBe(true);
    expect(path.basename(dest)).toBe('ZAGAROLO__20260616-2100.xlsx');
  });
});
