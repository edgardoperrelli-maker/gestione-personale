// tools/limitazioni-sync/lib/scanColonne.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { scanColonne } from './scanColonne.mjs';

async function creaMaster(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';
  h.getCell(9).value = 'MATRICOLA';
  h.getCell(65).value = 'Esecutore';
  h.getCell(67).value = 'esito';
  await wb.xlsx.writeFile(file);
}

async function creaEstraneo(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(1).value = 'Data';
  h.getCell(2).value = 'Note';
  await wb.xlsx.writeFile(file);
}

describe('scanColonne', () => {
  it('ritorna le intestazioni grezze dei file master e marca isMaster', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-scan-'));
    await creaMaster(path.join(dir, 'ZAGAROLO.xlsx'));
    await creaEstraneo(path.join(dir, 'ALTRO.xlsx'));

    const out = await scanColonne(dir);
    const zaga = out.find((f) => f.nome === 'ZAGAROLO.xlsx');
    expect(zaga).toBeTruthy();
    expect(zaga!.isMaster).toBe(true);
    expect(zaga!.colonne).toContain('ORDINE');
    expect(zaga!.colonne).toContain('MATRICOLA');
    expect(zaga!.colonne).toContain('esito');

    const altro = out.find((f) => f.nome === 'ALTRO.xlsx');
    expect(altro!.isMaster).toBe(false);
  });

  it('ignora ~$ e cartelle _backup/_log; cartella assente → []', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-scan2-'));
    await creaMaster(path.join(dir, 'ZAGAROLO.xlsx'));
    fs.writeFileSync(path.join(dir, '~$ZAGAROLO.xlsx'), 'lock');
    fs.mkdirSync(path.join(dir, '_backup'));
    await creaMaster(path.join(dir, '_backup', 'OLD.xlsx'));
    fs.mkdirSync(path.join(dir, '_log'));

    const out = await scanColonne(dir);
    expect(out.map((f) => f.nome)).toEqual(['ZAGAROLO.xlsx']);

    expect(await scanColonne(path.join(dir, 'non-esiste'))).toEqual([]);
  });
});
