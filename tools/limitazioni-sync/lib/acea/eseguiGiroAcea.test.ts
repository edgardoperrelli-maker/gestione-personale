// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eseguiGiroAcea } from './eseguiGiroAcea.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-giro-'));
afterEach(() => { /* i file restano in tmp, ok per i test */ });

async function scriviXlsx(file: string, foglio: string, rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(foglio);
  rows.forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(file);
}

function cfg(masterPath: string) {
  return {
    acea: {
      masterPath, foglio: 'PIANIFICAZIONE',
      export: { foglio: null, colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' },
      masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
    },
  };
}

describe('eseguiGiroAcea', () => {
  it('scarica (driver finto), aggiorna il master e ritorna un report compatibile', async () => {
    const masterPath = path.join(dir, 'master.xlsx');
    const exportPath = path.join(dir, 'export.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Esecutore'],
      [957276080, 'Intervento Richiesto', 'CIARALLO'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    const report = await eseguiGiroAcea({
      cfg: cfg(masterPath), stamp: '20260620-1000',
      driver: async () => exportPath, nowMs: 1000,
    });

    expect(report.tipo).toBe('acea-stato');
    expect(report.lavori).toBe(1);
    expect(report.file[0].aggiornate).toBe(1);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('CIARALLO');
  });

  it('se il lock è attivo, salta senza scrivere', async () => {
    const masterPath = path.join(dir, 'master2.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [['Ordine', 'Stato Operazione'], [1, 'x']]);
    fs.writeFileSync(path.join(dir, 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const report = await eseguiGiroAcea({ cfg: cfg(masterPath), stamp: 's', driver: async () => { throw new Error('non deve essere chiamato'); }, nowMs: 2000 });
    expect(report.saltato).toBe(true);
  });
});
