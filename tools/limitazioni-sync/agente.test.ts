// tools/limitazioni-sync/agente.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eseguiGiro, MARKER } from './agente.mjs';
import { giornoDa } from './lib/dataCella.mjs';

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
  const r2 = ws.getRow(2);
  r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
  const r3 = ws.getRow(3);
  r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
  await wb.xlsx.writeFile(file);
}

// mappa di default per i test: i 4 campi classici (per nome) + marcatore auto.
const MAPPATURA = [
  { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
  { campo: 'data', colonna: 'data prevista', abilitato: true },
  { campo: 'esito', colonna: 'esito', abilitato: true },
  { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
  { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
];

function giro(dir: string) {
  return eseguiGiro({
    cartella: dir,
    lavori: [
      { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
        esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
        sigillo: 'AA728566', manuale: false },
      { id: 'b', odl: '', matricola: '202315612361', comune: 'ZAGAROLO', via: 'VIA Y 2',
        esecutore: 'PASTORELLI', data_esecuzione: '2026-06-04', esito: 'No', esitoOk: false,
        sigillo: '', manuale: true },
    ],
    dryRun: false,
    stamp: '20260616-2100',
    mappatura: MAPPATURA,
    esitoPositivo: 'eseguito',
    esitoNegativo: 'No',
  });
}

describe('eseguiGiro (guidato dalla mappatura)', () => {
  it('scrive per nome-colonna, applica i testi esito da esitoOk, data come vera Date, marcatore solo sugli extra', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-e2e-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const report = await giro(dir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 compilata
    expect(ws.getRow(2).getCell(65).value).toBe('CIARALLO');          // BM esecutore
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-06-03'); // BN data -> vera Date
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');          // BO esito = esitoPositivo (esitoOk=true)
    expect(ws.getRow(2).getCell(69).value).toBe('AA728566');          // BQ sigillo
    // riga 3 NON lavorata -> resta vuota
    expect(ws.getRow(3).getCell(67).value ?? '').toBe('');
    // extra (id b): esito = esitoNegativo (esitoOk=false) + marcatore in coda
    const ultima = ws.getRow(ws.rowCount);
    expect(ultima.getCell(9).value).toBe('202315612361');
    expect(ultima.getCell(67).value).toBe('No');
    expect(ultima.getCell(71).value).toBe(MARKER);                    // BS marker (auto, prima vuota dopo le note)
    // marcatore SOLO sugli extra: la riga 2 pianificata non ha il marcatore
    expect(ws.getRow(2).getCell(71).value ?? '').toBe('');
    // report coerente
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.file[0].extraAggiunte).toBe(1);
    expect(fs.existsSync(path.join(dir, '_backup', 'ZAGAROLO__20260616-2100.xlsx'))).toBe(true);
  });

  it('regola con colonna assente -> salta e la segnala nel report (mai scrive in coda)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-miss-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: false },
      ],
      dryRun: false,
      stamp: '20260616-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'pdr', colonna: 'PDR INESISTENTE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    expect(report.file[0].colonneAssenti).toContain('PDR INESISTENTE');
    // l'esecutore (colonna presente) e' stato scritto
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    expect(wb.worksheets[0].getRow(2).getCell(65).value).toBe('CIARALLO');
  });

  it('regola disabilitata -> non scrive quel campo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-off-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: false },
      ],
      dryRun: false,
      stamp: '20260616-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: false },
        { campo: 'esito', colonna: 'esito', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(65).value ?? '').toBe('');     // esecutore OFF -> vuoto
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');   // esito ON -> scritto
  });
});
