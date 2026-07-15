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

// crea ZAGAROLO.xlsx con colonna saracinesca aggiuntiva (adiacente, senza buchi)
async function creaFileSaracinesca(file: string) {
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
  h.getCell(68).value = 'saracinesca';  // BP (adiacente, nessun buco)
  const r2 = ws.getRow(2);
  r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
  await wb.xlsx.writeFile(file);
}

// crea ZAGAROLO.xlsx con colonne AUTOMAZIONE (marcatore "SI") e NOTE (nota sui negativi).
async function creaFileAutomazione(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';        // F  odl
  h.getCell(9).value = 'MATRICOLA';     // I  matricola
  h.getCell(58).value = 'INDIRIZZO';    // BF via
  h.getCell(64).value = 'Località';     // BL comune
  h.getCell(65).value = 'Esecutore';    // BM
  h.getCell(67).value = 'esito';        // BO
  h.getCell(68).value = 'AUTOMAZIONE';  // BP
  h.getCell(69).value = 'NOTE';         // BQ
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
    expect(giornoDa(ultima.getCell(66).value)).toBe('2026-06-04');    // BN: data extra come data Excel
    expect(ultima.getCell(71).value).toBe(MARKER);                    // BS marker (auto, prima vuota dopo le note)
    // marcatore SOLO sugli extra: la riga 2 pianificata non ha il marcatore
    expect(ws.getRow(2).getCell(71).value ?? '').toBe('');
    // report coerente
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.file[0].extraAggiunte).toBe(1);
    expect(fs.existsSync(path.join(dir, '_backup', 'ZAGAROLO__20260616-2100.xlsx'))).toBe(true);
  });

  it('anti-duplicato: un manuale con matricola GIÀ nel file (riga agganciata per ODL) NON crea una riga doppia, scrive su quella esistente', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-dedup-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file); // riga 2: ODL 912231020 + matricola 20000020750 (colonne esito/esecutore/sigillo vuote)

    // Stesso contatore lavorato due volte nella finestra: un intervento ODL (K) e un manuale (J)
    // senza ODL. J è più recente → vince la chiave comune|matricola; K resta sul byOdl e aggancia la
    // riga 2 per ODL. Prima del fix, J non veniva "consumato" e finiva APPESO come riga doppia.
    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'k', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: false },
        { id: 'j', odl: '', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-19', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: true },
      ],
      dryRun: false,
      stamp: '20260620-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // NESSUNA riga aggiunta: restano solo le 2 righe originali (intestazione + 2 dati)
    expect(ws.rowCount).toBe(3);
    // la riga esistente è stata compilata (dall'intervento ODL), non duplicata
    expect(ws.getRow(2).getCell(9).value).toBe('20000020750');
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    // nessuna riga oltre la 3 con quella matricola (nessun doppione)
    expect(ws.getRow(4).getCell(9).value ?? '').toBe('');
    // report: 0 extra aggiunte + il manuale tracciato come redirezione su riga esistente
    expect(report.file[0].extraAggiunte).toBe(0);
    expect(
      report.file[0].righe.some(
        (r: { tipo: string; matricola: string }) => r.tipo === 'extra-esistente' && r.matricola === '20000020750',
      ),
    ).toBe(true);
  });

  it('anti-duplicato + upgrade: manuale POSITIVO con matricola già nel file (riga agente "No") SOVRASCRIVE, niente doppione', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-dedup-upg-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // riga 2 = scritta dall'agente IERI col negativo (AUTOMAZIONE valorizzata, NOTE "nessun passaggio")
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      const ws0 = wb0.worksheets[0];
      ws0.getRow(2).getCell(67).value = 'No';               // BO esito
      ws0.getRow(2).getCell(69).value = 'nessun passaggio'; // BQ note
      ws0.getRow(2).getCell(68).value = 'SI + esito';       // BP automazione (= riga dell'agente)
      await wb0.xlsx.writeFile(file);
    }

    // K = intervento ODL negativo (aggancia la riga 2 per ODL); J = manuale POSITIVO più recente sulla
    // stessa matricola (vince la chiave comune|matricola, resta non consumato → arriva alla deduplica).
    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'k', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-17', esito: 'No', esitoOk: false,
          note: 'nessun passaggio', manuale: false },
        { id: 'j', odl: '', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          note: '', manuale: true },
      ],
      dryRun: false,
      stamp: '20260620-2200',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // NESSUN doppione (restano le 2 righe originali) + la riga esistente è stata UPGRADATA a positivo
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');                 // No → eseguito (positivo vince)
    expect(String(ws.getRow(2).getCell(69).value ?? '').trim()).toBe('');    // nota "nessun passaggio" pulita
    expect(String(ws.getRow(2).getCell(68).value ?? '').startsWith('SI')).toBe(true);
    expect(report.file[0].extraAggiunte).toBe(0);
    const upg = report.file[0].righe.find(
      (r: { tipo: string; matricola: string }) => r.tipo === 'upgrade' && r.matricola === '20000020750',
    );
    expect(upg).toBeTruthy();
    expect(upg.esitoPrecedente).toBe('No');
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

  it('campo saracinesca mappato -> scrive il valore nella colonna', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-sar-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileSaracinesca(file);

    await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: 'NO', manuale: false },
      ],
      dryRun: false,
      stamp: '20260617-0900',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'saracinesca', colonna: 'saracinesca', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(68).value).toBe('NO');      // BP saracinesca
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito'); // BO esito invariato
  });

  it('automazione: SI sulle righe toccate (pianificate+extra), vuoto sulle non agganciate; nota sui negativi; report.righe popolato', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-auto-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', saracinesca: '', note: '', manuale: false },
        { id: 'b', odl: '', matricola: '202315612361', comune: 'ZAGAROLO', via: 'VIA Y 2',
          esecutore: 'PASTORELLI', data_esecuzione: '2026-06-04', esito: 'No', esitoOk: false,
          sigillo: '', saracinesca: '', note: 'Cane in giardino', manuale: true },
      ],
      dryRun: false,
      stamp: '20260617-1000',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 pianificata lavorata -> AUTOMAZIONE "SI + <colonne completate>", esito scritto, NOTE vuota (positivo)
    expect(ws.getRow(2).getCell(68).value).toBe('SI + esito');
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    expect(ws.getRow(2).getCell(69).value ?? '').toBe('');
    // riga 3 NON agganciata -> AUTOMAZIONE vuota
    expect(ws.getRow(3).getCell(68).value ?? '').toBe('');
    // extra negativa -> AUTOMAZIONE "SI + <colonne>", esito "No", NOTE scritta
    const ultima = ws.getRow(ws.rowCount);
    expect(ultima.getCell(68).value).toBe('SI + esito + NOTE');
    expect(ultima.getCell(67).value).toBe('No');
    expect(ultima.getCell(69).value).toBe('Cane in giardino');
    // report.righe: una "aggiornata" + una "extra"
    const righe = report.file[0].righe;
    expect(righe.map((r: { tipo: string }) => r.tipo).sort()).toEqual(['aggiornata', 'extra']);
    expect(righe.find((r: { tipo: string }) => r.tipo === 'extra').note).toBe('Cane in giardino');
    expect(righe.find((r: { tipo: string }) => r.tipo === 'aggiornata').matricola).toBe('20000020750');
  });

  it('riga parziale (campo già a mano): completa i mancanti e scrive PARZIALE (colonne completate)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-parz-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // pre-compila a mano l'Esecutore sulla riga 2 (resta vuoto l'esito) -> riga parziale
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      wb0.worksheets[0].getRow(2).getCell(65).value = 'CIARALLO';
      await wb0.xlsx.writeFile(file);
    }

    await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
      ],
      dryRun: false,
      stamp: '20260617-1100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');           // esito mancante completato
    expect(ws.getRow(2).getCell(65).value).toBe('CIARALLO');           // esecutore a mano intatto
    expect(ws.getRow(2).getCell(68).value).toBe('PARZIALE + esito');   // marcatore parziale con la colonna completata
  });

  it('conflitto: il record riporta odl e matricola (riferimento stabile, non solo la riga)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-conf-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // pre-compila esecutore con un valore DIVERSO -> genera un conflitto su quella cella
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      wb0.worksheets[0].getRow(2).getCell(65).value = 'ROSSI';
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
      ],
      dryRun: false,
      stamp: '20260617-1200',
      mappatura: [{ campo: 'esecutore', colonna: 'Esecutore', abilitato: true }],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const conf = report.file[0].conflitti.find((c: { campo: string }) => c.campo === 'esecutore');
    expect(conf).toBeTruthy();
    expect(conf.odl).toBe('912231020');
    expect(conf.matricola).toBe('20000020750');
    expect(conf.esistente).toBe('ROSSI');
    expect(conf.nuovo).toBe('CIARALLO');
  });
});

describe('eseguiGiro: vince il positivo (upgrade negativo→positivo)', () => {
  it('il positivo sovrascrive il "No" sia sulla riga dell’agente sia su quella scritta a mano (nessun conflitto)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-upg-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // riga 2 = scritta dall'agente IERI col negativo (AUTOMAZIONE valorizzata, NOTE "nessun passaggio")
    // riga 3 = scritta A MANO ("No", AUTOMAZIONE vuota)
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      const ws0 = wb0.worksheets[0];
      ws0.getRow(2).getCell(67).value = 'No';                 // BO esito
      ws0.getRow(2).getCell(69).value = 'nessun passaggio';   // BQ note
      ws0.getRow(2).getCell(68).value = 'SI + esito';         // BP automazione (= riga dell'agente)
      ws0.getRow(3).getCell(67).value = 'No';                 // BO esito (manuale)
      // riga 3 AUTOMAZIONE (68) lasciata vuota = riga manuale
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        // stessa matricola/ODL: negativo del 17 + positivo del 18 → il positivo deve vincere (anche se inserito dopo)
        { id: 'neg', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-17', esito: 'No', esitoOk: false,
          sigillo: '', saracinesca: '', note: 'nessun passaggio', manuale: false },
        { id: 'pos', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
        // riga 3 (manuale): positivo
        { id: 'pos3', odl: '999999999', matricola: '11111111111', comune: 'ZAGAROLO', via: 'VIA Z 9',
          esecutore: 'ROSSI', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
      ],
      dryRun: false,
      stamp: '20260618-1530',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];

    // riga 2 (agente): upgrade a positivo, nota PULITA, marcatore rifatto "SI ..."
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    expect(String(ws.getRow(2).getCell(69).value ?? '').trim()).toBe('');
    expect(String(ws.getRow(2).getCell(68).value ?? '').startsWith('SI')).toBe(true);
    const upg = report.file[0].righe.find((r: { riga: number }) => r.riga === 2);
    expect(upg.tipo).toBe('upgrade');

    // riga 3 (manuale): il positivo SOVRASCRIVE comunque il "No" → eseguito, nessun conflitto
    expect(ws.getRow(3).getCell(67).value).toBe('eseguito');
    expect(report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 3 && c.campo === 'esito')).toBeFalsy();
    const upg3 = report.file[0].righe.find((r: { riga: number; tipo: string }) => r.riga === 3 && r.tipo === 'upgrade');
    expect(upg3).toBeTruthy();
    expect(upg3.esitoPrecedente).toBe('No');
  });

  it('il positivo sovrascrive ANCHE un esito manuale diverso dal negativo esatto (es. "NO PASSAGGIO"); il negativo non tocca i testi liberi', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-posqualsiasi-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      const ws0 = wb0.worksheets[0];
      ws0.getRow(2).getCell(67).value = 'NO PASSAGGIO';   // esito a mano, testo libero (≠ "No")
      ws0.getRow(2).getCell(69).value = 'citofono rotto'; // nota a mano
      ws0.getRow(3).getCell(67).value = 'chiuso';         // testo libero: il NEGATIVO non deve toccarlo
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'pos', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
        { id: 'neg', odl: '999999999', matricola: '11111111111', comune: 'ZAGAROLO', via: 'VIA Z 9',
          esecutore: 'ROSSI', data_esecuzione: '2026-06-18', esito: 'No', esitoOk: false,
          sigillo: '', saracinesca: '', note: 'assente', manuale: false },
      ],
      dryRun: false,
      stamp: '20260618-1600',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];

    // riga 2: il positivo sovrascrive il testo libero, nota pulita, tracciato come upgrade
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    expect(String(ws.getRow(2).getCell(69).value ?? '').trim()).toBe('');
    expect(report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 2 && c.campo === 'esito')).toBeFalsy();
    const upg = report.file[0].righe.find((r: { riga: number }) => r.riga === 2);
    expect(upg.tipo).toBe('upgrade');
    expect(upg.esitoPrecedente).toBe('NO PASSAGGIO');
    expect(upg.notaPrecedente).toBe('citofono rotto');

    // riga 3: il NEGATIVO non sovrascrive un testo libero → conflitto, cella intatta
    expect(ws.getRow(3).getCell(67).value).toBe('chiuso');
    expect(report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 3 && c.campo === 'esito')).toBeTruthy();
  });

  it('upgrade positivo: riscrive TUTTI i dati di lavorazione (esecutore/sigillo/saracinesca oltre a esito/note/data); il refresh negativo non tocca l’esecutore', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-upgtutto-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    {
      const wb0 = new ExcelJS.Workbook();
      const ws0 = wb0.addWorksheet('Foglio1');
      const h = ws0.getRow(1);
      h.getCell(6).value = 'ORDINE';         // F  odl
      h.getCell(9).value = 'MATRICOLA';      // I  matricola
      h.getCell(64).value = 'Località';      // BL comune
      h.getCell(65).value = 'Esecutore';     // BM
      h.getCell(66).value = 'data prevista'; // BN
      h.getCell(67).value = 'esito';         // BO
      h.getCell(68).value = 'sigillo posato';// BP
      h.getCell(69).value = 'saracinesca';   // BQ
      h.getCell(70).value = 'AUTOMAZIONE';   // BR
      h.getCell(71).value = 'NOTE';          // BS
      // riga 2: NEGATIVO del 01/07 di CIARALLO → il 14/07 arriva il POSITIVO di PASTORELLI
      const r2 = ws0.getRow(2);
      r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
      r2.getCell(65).value = 'CIARALLO'; r2.getCell(66).value = new Date(2026, 6, 1, 12);
      r2.getCell(67).value = 'No'; r2.getCell(68).value = 'AA000000'; r2.getCell(71).value = 'nessun passaggio';
      // riga 3: NEGATIVO di CIARALLO; arriva un NEGATIVO più recente di PASTORELLI → esecutore protetto
      const r3 = ws0.getRow(3);
      r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
      r3.getCell(65).value = 'CIARALLO'; r3.getCell(66).value = new Date(2026, 6, 1, 12);
      r3.getCell(67).value = 'No'; r3.getCell(71).value = 'assente';
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'pos', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'PASTORELLI', data_esecuzione: '2026-07-14', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA111111', saracinesca: 'SI', note: '', manuale: false },
        { id: 'neg', odl: '999999999', matricola: '11111111111', comune: 'ZAGAROLO', via: 'VIA Z 9',
          esecutore: 'PASTORELLI', data_esecuzione: '2026-07-14', esito: 'No', esitoOk: false,
          sigillo: '', saracinesca: '', note: 'citofono rotto', manuale: false },
      ],
      dryRun: false,
      stamp: '20260714-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'data', colonna: 'data prevista', abilitato: true },
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
        { campo: 'saracinesca', colonna: 'saracinesca', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];

    // riga 2: upgrade COMPLETO → tutti i dati del positivo, nessun conflitto
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    expect(ws.getRow(2).getCell(65).value).toBe('PASTORELLI');
    expect(ws.getRow(2).getCell(68).value).toBe('AA111111');
    expect(ws.getRow(2).getCell(69).value).toBe('SI');
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-07-14');
    expect(String(ws.getRow(2).getCell(71).value ?? '').trim()).toBe('');
    expect(report.file[0].conflitti.filter((c: { riga: number }) => c.riga === 2)).toEqual([]);
    const upg = report.file[0].righe.find((r: { riga: number }) => r.riga === 2);
    expect(upg.tipo).toBe('upgrade');
    expect(upg.esitoPrecedente).toBe('No');
    expect(upg.esecutorePrecedente).toBe('CIARALLO');
    expect(upg.sigilloPrecedente).toBe('AA000000');

    // riga 3: refresh NEGATIVO → nota/data aggiornate ma esecutore INTATTO (protetto)
    expect(ws.getRow(3).getCell(65).value).toBe('CIARALLO');
    expect(ws.getRow(3).getCell(67).value).toBe('No');
    expect(String(ws.getRow(3).getCell(71).value ?? '').trim()).toBe('citofono rotto');
  });

  it('refresh data: sulla riga dell’agente sovrascrive la data PIANIFICATA con quella di ESECUZIONE (idempotente, marcatore intatto); riga a mano protetta', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-rdata-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    {
      const wb0 = new ExcelJS.Workbook();
      const ws0 = wb0.addWorksheet('Foglio1');
      const h = ws0.getRow(1);
      h.getCell(6).value = 'ORDINE';
      h.getCell(9).value = 'MATRICOLA';
      h.getCell(64).value = 'Località';
      h.getCell(65).value = 'Esecutore';
      h.getCell(66).value = 'data prevista'; // BN
      h.getCell(67).value = 'esito';         // BO
      h.getCell(68).value = 'AUTOMAZIONE';   // BP
      // riga 2 = DELL'AGENTE: eseguito, ma "data prevista" è la data PIANIFICATA (futura) 26/06
      const r2 = ws0.getRow(2);
      r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
      r2.getCell(65).value = 'PASTORELLI'; r2.getCell(66).value = new Date(2026, 5, 26, 12); r2.getCell(67).value = 'eseguito';
      r2.getCell(68).value = 'SI + esito';
      // riga 3 = A MANO (AUTOMAZIONE vuota): data 20/06 da NON toccare
      const r3 = ws0.getRow(3);
      r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
      r3.getCell(65).value = 'ROSSI'; r3.getCell(66).value = new Date(2026, 5, 20, 12); r3.getCell(67).value = 'eseguito';
      await wb0.xlsx.writeFile(file);
    }

    const lavori = [
      { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
        esecutore: 'PASTORELLI', data_esecuzione: '2026-06-24', esito: 'eseguito', esitoOk: true, manuale: false },
      { id: 'b', odl: '999999999', matricola: '11111111111', comune: 'ZAGAROLO', via: 'VIA Z 9',
        esecutore: 'ROSSI', data_esecuzione: '2026-06-24', esito: 'eseguito', esitoOk: true, manuale: false },
    ];
    const mappatura = [
      { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
      { campo: 'data', colonna: 'data prevista', abilitato: true },
      { campo: 'esito', colonna: 'esito', abilitato: true },
      { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
    ];
    const opts = { cartella: dir, lavori, dryRun: false, stamp: '20260625-0800', mappatura, esitoPositivo: 'eseguito', esitoNegativo: 'No' };

    const report = await eseguiGiro(opts);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 (agente): data PIANIFICATA 26/06 → sovrascritta con ESECUZIONE 24/06
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-06-24');
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');          // esito invariato
    expect(ws.getRow(2).getCell(68).value).toBe('SI + esito');        // marcatore NON azzerato dal refresh
    // niente conflitto sulla data della riga dell'agente
    expect(report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 2 && c.campo === 'data')).toBeFalsy();
    const rd = report.file[0].righe.find((r: { riga: number }) => r.riga === 2);
    expect(rd.tipo).toBe('refresh-data');
    // riga 3 (a mano): data 20/06 PRESERVATA + conflitto segnalato
    expect(giornoDa(ws.getRow(3).getCell(66).value)).toBe('2026-06-20');
    const conf3 = report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 3 && c.campo === 'data');
    expect(conf3).toBeTruthy();
    expect(conf3.esistente).toBe('2026-06-20');

    // IDEMPOTENZA: secondo giro → la data è già 24/06, nessun aggiornamento
    const report2 = await eseguiGiro({ ...opts, stamp: '20260625-0900' });
    expect(report2.file[0].aggiornate).toBe(0);
  });

  it('refresh data NON sposta la data se l’esito a file (positivo) è in conflitto col lavoro agganciato (negativo) — niente riga fantasma', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-rdata2-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    {
      const wb0 = new ExcelJS.Workbook();
      const ws0 = wb0.addWorksheet('Foglio1');
      const h = ws0.getRow(1);
      h.getCell(6).value = 'ORDINE';
      h.getCell(9).value = 'MATRICOLA';
      h.getCell(64).value = 'Località';
      h.getCell(65).value = 'Esecutore';
      h.getCell(66).value = 'data prevista'; // BN
      h.getCell(67).value = 'esito';         // BO
      h.getCell(68).value = 'AUTOMAZIONE';   // BP
      // riga DELL'AGENTE: "eseguito" (positivo di un giorno PRECEDENTE), data 19/06
      const r2 = ws0.getRow(2);
      r2.getCell(6).value = '912229248'; r2.getCell(9).value = '201915088310'; r2.getCell(64).value = 'ZAGAROLO';
      r2.getCell(65).value = 'PASTORELLI'; r2.getCell(66).value = new Date(2026, 5, 19, 12); r2.getCell(67).value = 'eseguito';
      r2.getCell(68).value = 'SI + esito';
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      // il lavoro agganciato per ODL è un NEGATIVO del 22/06 (ricontrollo): NON deve trascinare la data
      lavori: [
        { id: 'neg', odl: '912229248', matricola: '201915088310', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'PASTORELLI', data_esecuzione: '2026-06-22', esito: 'No', esitoOk: false, manuale: false },
      ],
      dryRun: false,
      stamp: '20260625-1000',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'data', colonna: 'data prevista', abilitato: true },
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // la data NON si è spostata al 22/06 (resta 19/06) e l'esito positivo è preservato
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-06-19');
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    // nessuna riga "refresh-data" prodotta per questa riga
    expect(report.file[0].righe.find((r: { riga: number; tipo: string }) => r.riga === 2 && r.tipo === 'refresh-data')).toBeFalsy();
  });

  it('positivo senza ODL batte il negativo con ODL sullo stesso contatore: scrive "eseguito", niente conflitto né doppione (caso reale matricola 20121386035)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-posvince-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    // master con UNA riga = l'ordine ACEA del NEGATIVO (ODL 912231635 + matricola 20121386035), esito vuoto.
    {
      const wb0 = new ExcelJS.Workbook();
      const ws0 = wb0.addWorksheet('Foglio1');
      const h = ws0.getRow(1);
      h.getCell(6).value = 'ORDINE';         // F  odl
      h.getCell(9).value = 'MATRICOLA';      // I  matricola
      h.getCell(64).value = 'Località';      // BL comune
      h.getCell(65).value = 'Esecutore';     // BM
      h.getCell(66).value = 'data prevista'; // BN
      h.getCell(67).value = 'esito';         // BO
      const r2 = ws0.getRow(2);
      r2.getCell(6).value = '912231635'; r2.getCell(9).value = '20121386035'; r2.getCell(64).value = 'ZAGAROLO';
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        // NEGATIVO con l'ODL del master ("Nessun passaggio"); POSITIVO manuale più recente SENZA ODL.
        { id: 'neg', odl: '912231635', matricola: '20121386035', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-23', esito: 'No', esitoOk: false, manuale: false },
        { id: 'pos', odl: '', matricola: '20121386035', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-07-02', esito: 'eseguito', esitoOk: true, manuale: true },
      ],
      dryRun: false,
      stamp: '20260713-1000',
      // mappatura SENZA colonna automazione (come il master zagarolo): prima del fix il positivo
      // finiva in conflitto sull'esito "No" già scritto dal negativo.
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'data', colonna: 'data prevista', abilitato: true },
        { campo: 'esito', colonna: 'esito', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // la riga porta il POSITIVO, non il "No"
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-07-02');
    // nessun doppione appeso, nessun conflitto, nessun extra
    expect(ws.rowCount).toBe(2);
    expect(report.file[0].conflitti).toHaveLength(0);
    expect(report.file[0].extraAggiunte).toBe(0);
  });

  it('più negativi, nessun positivo: sovrascrive col più recente (nota aggiornata, niente conflitto, idempotente)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-negrecent-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // riga 2 = scritta dall'agente con un negativo PIÙ VECCHIO (nota "nessun passaggio")
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      const ws0 = wb0.worksheets[0];
      ws0.getRow(2).getCell(67).value = 'No';               // BO esito
      ws0.getRow(2).getCell(69).value = 'nessun passaggio'; // BQ note
      ws0.getRow(2).getCell(68).value = 'SI + esito';       // BP automazione
      await wb0.xlsx.writeFile(file);
    }

    const opts = {
      cartella: dir,
      // due negativi sullo stesso contatore, NESSUN positivo: vince il più recente (20/06)
      lavori: [
        { id: 'negOld', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-17', esito: 'No', esitoOk: false,
          note: 'nessun passaggio', manuale: false },
        { id: 'negNew', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-20', esito: 'No', esitoOk: false,
          note: 'inaccessibile', manuale: false },
      ],
      dryRun: false,
      stamp: '20260713-1200',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    };
    const report = await eseguiGiro(opts);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // esito resta "No", NOTA aggiornata al negativo più recente; nessun doppione, nessun conflitto
    expect(ws.getRow(2).getCell(67).value).toBe('No');
    expect(ws.getRow(2).getCell(69).value).toBe('inaccessibile');
    expect(ws.rowCount).toBe(3);
    expect(report.file[0].conflitti).toHaveLength(0);
    const ref = report.file[0].righe.find(
      (r: { riga: number; tipo: string }) => r.riga === 2 && r.tipo === 'refresh-negativo',
    );
    expect(ref).toBeTruthy();
    expect(ref.notaPrecedente).toBe('nessun passaggio');

    // IDEMPOTENZA: secondo giro → la nota è già quella recente, niente da riscrivere
    const report2 = await eseguiGiro({ ...opts, stamp: '20260713-1300' });
    expect(report2.file[0].aggiornate).toBe(0);
  });

  it('un negativo NON sovrascrive un positivo già a file (il positivo vince): resta in conflitto', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-negvspos-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFileAutomazione(file);
    // riga 2 = positivo già a file (scritto dall'agente)
    {
      const wb0 = new ExcelJS.Workbook();
      await wb0.xlsx.readFile(file);
      const ws0 = wb0.worksheets[0];
      ws0.getRow(2).getCell(67).value = 'eseguito';   // BO esito POSITIVO
      ws0.getRow(2).getCell(68).value = 'SI + esito'; // BP automazione
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'neg', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-20', esito: 'No', esitoOk: false,
          note: 'inaccessibile', manuale: false },
      ],
      dryRun: false,
      stamp: '20260713-1400',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // il positivo NON viene toccato dal negativo; il mismatch resta un conflitto
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');
    const conf = report.file[0].conflitti.find((c: { riga: number; campo: string }) => c.riga === 2 && c.campo === 'esito');
    expect(conf).toBeTruthy();
    expect(conf.esistente).toBe('eseguito');
    expect(conf.nuovo).toBe('No');
  });

  it('NON cancella sigillo/saracinesca compilati a mano sulla riga dell’agente (refresh ristretto a esito/note/data)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-upg2-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    {
      const wb0 = new ExcelJS.Workbook();
      const ws0 = wb0.addWorksheet('Foglio1');
      const h = ws0.getRow(1);
      h.getCell(6).value = 'ORDINE';
      h.getCell(9).value = 'MATRICOLA';
      h.getCell(64).value = 'Località';
      h.getCell(65).value = 'esito';          // BM
      h.getCell(66).value = 'sigillo posato'; // BN
      h.getCell(67).value = 'saracinesca';    // BO
      h.getCell(68).value = 'AUTOMAZIONE';    // BP
      h.getCell(69).value = 'NOTE';           // BQ
      const r2 = ws0.getRow(2);
      r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
      // ieri: l'agente scrive il negativo; l'ufficio completa A MANO sigillo + saracinesca SULLA riga dell'agente
      r2.getCell(65).value = 'No';
      r2.getCell(66).value = 'AA999999'; // sigillo a mano
      r2.getCell(67).value = 'SI';       // saracinesca a mano
      r2.getCell(68).value = 'SI + esito';
      r2.getCell(69).value = 'nessun passaggio';
      await wb0.xlsx.writeFile(file);
    }

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        // positivo di oggi SENZA sigillo/saracinesca (il caso tipico: 78%/80% dei positivi non li portano)
        { id: 'pos', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-18', esito: 'eseguito', esitoOk: true,
          sigillo: '', saracinesca: '', note: '', manuale: false },
      ],
      dryRun: false,
      stamp: '20260618-1600',
      mappatura: [
        { campo: 'esito', colonna: 'esito', abilitato: true },
        { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
        { campo: 'saracinesca', colonna: 'saracinesca', abilitato: true },
        { campo: 'note', colonna: 'NOTE', abilitato: true },
        { campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(65).value).toBe('eseguito');               // esito upgradato
    expect(String(ws.getRow(2).getCell(69).value ?? '').trim()).toBe('');  // nota pulita
    expect(ws.getRow(2).getCell(66).value).toBe('AA999999');               // SIGILLO a mano PRESERVATO
    expect(ws.getRow(2).getCell(67).value).toBe('SI');                     // SARACINESCA a mano PRESERVATA
    // lo storico dell'upgrade traccia lo stato precedente (per eventuale ripristino)
    const upg = report.file[0].righe.find((r: { tipo: string }) => r.tipo === 'upgrade');
    expect(upg.esitoPrecedente).toBe('No');
    expect(upg.notaPrecedente).toBe('nessun passaggio');
  });
});

// Il COMUNE è il nome del file master. Il filtro serve al lancio manuale ("Esegui ora" su un solo
// comune); il giro schedulato non lo passa e deve continuare a fare TUTTI i comuni.
describe('eseguiGiro — filtro comune', () => {
  async function creaFileComune(file: string, comune: string, odl: string, matricola: string) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Foglio1');
    const h = ws.getRow(1);
    h.getCell(6).value = 'ORDINE';
    h.getCell(9).value = 'MATRICOLA';
    h.getCell(64).value = 'Località';
    h.getCell(67).value = 'esito';
    const r2 = ws.getRow(2);
    r2.getCell(6).value = odl; r2.getCell(9).value = matricola; r2.getCell(64).value = comune;
    await wb.xlsx.writeFile(file);
  }

  const LAVORI = [
    { id: 'z', odl: '912214968', matricola: '202115410195', comune: 'ZAGAROLO', via: 'VIA X 1',
      esecutore: 'DIONISI', data_esecuzione: '2026-07-15', esito: 'eseguito', esitoOk: true, manuale: false },
    { id: 'l', odl: '912350788', matricola: '202415625500', comune: 'LABICO', via: 'VIA Y 2',
      esecutore: 'PASTORELLI', data_esecuzione: '2026-07-16', esito: 'eseguito', esitoOk: true, manuale: false },
  ];

  async function scenario(nome: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `limsync-${nome}-`));
    const zag = path.join(dir, 'ZAGAROLO.xlsx');
    const lab = path.join(dir, 'LABICO.xlsx');
    await creaFileComune(zag, 'ZAGAROLO', '912214968', '202115410195');
    await creaFileComune(lab, 'LABICO', '912350788', '202415625500');
    return { dir, zag, lab };
  }

  const giroComune = (dir: string, comune?: string) => eseguiGiro({
    cartella: dir, lavori: LAVORI, dryRun: false, stamp: '20260715-2100',
    mappatura: [{ campo: 'esito', colonna: 'esito', abilitato: true }],
    esitoPositivo: 'eseguito', esitoNegativo: 'No', comune,
  });

  async function esitoDi(file: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    return wb.worksheets[0].getRow(2).getCell(67).value ?? '';
  }

  it('nessun comune (giro schedulato delle 21) → tutti i comuni, come da sempre', async () => {
    const { dir, zag, lab } = await scenario('tutti');
    const r = await giroComune(dir);
    expect(r.comune).toBe('TUTTI');
    expect(await esitoDi(zag)).toBe('eseguito');
    expect(await esitoDi(lab)).toBe('eseguito');
  });

  it('un comune → scrive solo il suo master, gli altri restano intatti', async () => {
    const { dir, zag, lab } = await scenario('uno');
    const r = await giroComune(dir, 'LABICO');
    expect(r.file.map((f: { file: string }) => f.file)).toEqual(['LABICO.xlsx']);
    expect(await esitoDi(lab)).toBe('eseguito');
    expect(await esitoDi(zag)).toBe('');
  });

  it('minuscolo/spazi dal menu → aggancia lo stesso il file', async () => {
    const { dir, lab } = await scenario('case');
    await giroComune(dir, ' labico ');
    expect(await esitoDi(lab)).toBe('eseguito');
  });

  it('col filtro attivo NON segnala gli altri comuni come "senza file master"', async () => {
    // Rumore da evitare: girando solo Labico, Zagarolo non è un mismatch — non l'abbiamo lavorato.
    const { dir } = await scenario('rumore');
    const r = await giroComune(dir, 'LABICO');
    expect(r.comuniNonAgganciati).toEqual([]);
    expect(r.extraNonCollocate).toEqual([]);
  });

  it('comune senza file master → errore esplicito e NESSUNA scrittura (mai degradare a tutti)', async () => {
    const { dir, zag, lab } = await scenario('assente');
    const r = await giroComune(dir, 'PALESTRINA');
    expect(r.erroreGlobale).toMatch(/PALESTRINA/);
    expect(r.file).toEqual([]);
    expect(await esitoDi(zag)).toBe('');
    expect(await esitoDi(lab)).toBe('');
  });
});
