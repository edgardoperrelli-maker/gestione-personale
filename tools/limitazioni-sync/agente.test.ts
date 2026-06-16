// tools/limitazioni-sync/agente.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eseguiGiro } from './agente.mjs';

// crea ZAGAROLO.xlsx con intestazione ACEA (riga 1) + 2 righe pianificate
async function creaFile(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';        // F  odl
  h.getCell(9).value = 'MATRICOLA';     // I  matricola
  h.getCell(58).value = 'INDIRIZZO';    // BF via
  h.getCell(64).value = 'Località';     // BL comune
  h.getCell(65).value = 'Esecutore';    // BM
  h.getCell(66).value = 'data prevista';// BN
  h.getCell(67).value = 'esito';        // BO
  h.getCell(69).value = 'sigillo posato';// BQ
  h.getCell(70).value = 'stato odl';    // BR
  // riga 2: ODL che verrà lavorato
  const r2 = ws.getRow(2);
  r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
  // riga 3: ODL non lavorato (deve restare vuoto)
  const r3 = ws.getRow(3);
  r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
  await wb.xlsx.writeFile(file);
}

describe('eseguiGiro', () => {
  it('compila la riga lavorata, lascia vuota la non lavorata, aggiunge l\'extra', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-e2e-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const lavori = [
      { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
        esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esito_motivo: null,
        sigillo: 'AA728566', manuale: false },
      { id: 'b', odl: '', matricola: '202315612361', comune: 'ZAGAROLO', via: 'VIA Y 2',
        esecutore: 'PASTORELLI', data_esecuzione: '2026-06-04', esito: 'No', esito_motivo: 'Nessun passaggio',
        sigillo: '', manuale: true },
    ];

    const report = await eseguiGiro({ cartella: dir, lavori, dryRun: false, stamp: '20260616-2100' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 compilata
    expect(ws.getRow(2).getCell(65).value).toBe('CIARALLO');   // BM
    expect(ws.getRow(2).getCell(66).value).toBe('2026-06-03'); // BN
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');   // BO
    expect(ws.getRow(2).getCell(69).value).toBe('AA728566');   // BQ
    // riga 3 NON lavorata → resta vuota
    expect(ws.getRow(3).getCell(67).value ?? '').toBe('');
    // extra (id b) aggiunta in fondo con marcatore
    const ultima = ws.getRow(ws.rowCount);
    expect(ultima.getCell(9).value).toBe('202315612361');      // matricola
    expect(ultima.getCell(67).value).toBe('No');               // esito
    expect(ultima.getCell(71).value).toBe('AGGIUNTA APP');     // BS marker (idx0 70 → cell 71)
    // report coerente
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.file[0].extraAggiunte).toBe(1);
    // backup creato
    expect(fs.existsSync(path.join(dir, '_backup', 'ZAGAROLO__20260616-2100.xlsx'))).toBe(true);
  });
});
