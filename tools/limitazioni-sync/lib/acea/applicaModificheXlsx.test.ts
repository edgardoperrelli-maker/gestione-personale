// tools/limitazioni-sync/lib/acea/applicaModificheXlsx.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applicaModificheXlsx } from './applicaModificheXlsx.mjs';
import { giornoDa } from '../dataCella.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-appl-'));

async function creaMaster(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  ws.addRow(['ORDINE', 'Esecutore', 'data prevista', 'esito', 'note']);
  ws.addRow(['111', 'VECCHIO', null, '', 'da pulire']);
  ws.addRow(['222', '', null, '', '']);
  ws.autoFilter = 'A1:E3';
  await wb.xlsx.writeFile(file);
}

describe('applicaModificheXlsx', () => {
  it('aggiorna celle, scrive una data vera, svuota una cella, appende una riga ed estende AutoFiltro', async () => {
    const file = path.join(dir, 'm.xlsx');
    await creaMaster(file);

    let backupChiamato = false;
    const rep = await applicaModificheXlsx(
      file,
      {
        foglio: 'Foglio1',
        aggiornamenti: [
          { riga: 2, col: 1, valore: 'CIARALLO', tipo: 'str' },       // Esecutore
          { riga: 2, col: 2, valore: new Date(2026, 5, 8, 12), tipo: 'date' }, // data prevista
          { riga: 2, col: 3, valore: 'eseguito', tipo: 'str' },        // esito
          { riga: 2, col: 4, valore: '', tipo: 'str' },                // note -> svuota
        ],
        nuoveRighe: [
          [
            { col: 0, valore: '999', tipo: 'str' },
            { col: 1, valore: 'NUOVO', tipo: 'str' },
            { col: 2, valore: new Date(2026, 5, 20, 12), tipo: 'date' },
            { col: 3, valore: 'eseguito', tipo: 'str' },
          ],
        ],
      },
      { backup: () => { backupChiamato = true; } },
    );

    expect(rep.aggiornate).toBe(4);
    expect(rep.righeNuove).toBe(1);
    expect(backupChiamato).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Foglio1')!;
    expect(ws.getRow(2).getCell(2).value).toBe('CIARALLO');
    expect(giornoDa(ws.getRow(2).getCell(3).value)).toBe('2026-06-08'); // data vera
    expect(ws.getRow(2).getCell(4).value).toBe('eseguito');
    expect(ws.getRow(2).getCell(5).value ?? '').toBe('');               // svuotata

    // riga nuova
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(1).value).toBe('999');
    expect(last.getCell(2).value).toBe('NUOVO');
    expect(giornoDa(last.getCell(3).value)).toBe('2026-06-20');

    // AutoFiltro esteso all'ultima riga
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const s1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(s1).toMatch(/<autoFilter ref="A1:E4"/);
  });

  it('senza modifiche non scrive nulla', async () => {
    const file = path.join(dir, 'noop.xlsx');
    await creaMaster(file);
    const prima = fs.readFileSync(file);
    const rep = await applicaModificheXlsx(file, { foglio: 'Foglio1', aggiornamenti: [], nuoveRighe: [] }, {});
    expect(rep.aggiornate).toBe(0);
    expect(rep.righeNuove).toBe(0);
    expect(fs.readFileSync(file).equals(prima)).toBe(true);
  });
});
