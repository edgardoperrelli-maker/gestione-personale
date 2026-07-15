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

  it('include nel report il portaleSnapshot (ODL→stato) dell\'intero export per il SAL', async () => {
    const masterPath = path.join(dir, 'master_snap.xlsx');
    const exportPath = path.join(dir, 'export_snap.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'Intervento Richiesto'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
      [111222333, 'assegnato'],
    ]);

    const report = await eseguiGiroAcea({
      cfg: cfg(masterPath), stamp: 's', driver: async () => exportPath, nowMs: 5000,
    });

    expect(Array.isArray(report.portaleSnapshot)).toBe(true);
    expect(report.portaleSnapshot).toHaveLength(2);
    expect(report.portaleSnapshot).toContainEqual({ odl: '957276080', stato: 'completato', operatore: undefined });
  });

  it('se il lock è attivo, salta senza scrivere', async () => {
    const masterPath = path.join(dir, 'master2.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [['Ordine', 'Stato Operazione'], [1, 'x']]);
    fs.writeFileSync(path.join(dir, 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const report = await eseguiGiroAcea({ cfg: cfg(masterPath), stamp: 's', driver: async () => { throw new Error('non deve essere chiamato'); }, nowMs: 2000 });
    expect(report.saltato).toBe(true);
  });

  it('DUNNING: scrive la Saracinesca dal nostro DB (best-effort, indipendente dallo stato)', async () => {
    const masterPath = path.join(dir, 'master_sara.xlsx');
    const exportPath = path.join(dir, 'export_sara.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Ricevuto', ''], // stato invariato in questo giro, ma la saracinesca va scritta
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'Ricevuto'],
    ]);

    const fetchSaracinesche = async () => [{ odl: '957276080', saracinesca: 'SI' }];
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 700000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(report.saracinescaScritte).toBe(1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI');
  });

  it('DUNNING: fetch saracinesche fallito → best-effort, il giro stato completa comunque', async () => {
    const masterPath = path.join(dir, 'master_sara_err.xlsx');
    const exportPath = path.join(dir, 'export_sara_err.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Intervento Richiesto', ''],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    const fetchSaracinesche = async () => { throw new Error('rete giù'); };
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 701000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(report.erroreGlobale).toBeUndefined();
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.saracinescaScritte).toBe(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
  });

  it('target zagarolo: NON chiama fetchSaracinesche (la saracinesca di ZAGAROLO arriva dal giro cartella)', async () => {
    const masterPath = path.join(dir, 'master_zag.xlsx');
    const exportPath = path.join(dir, 'export_zag.xlsx');
    await scriviXlsx(masterPath, 'Foglio1', [
      ['ORDINE', 'stato odl'],
      [957276080, 'Ricevuto'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    let chiamato = false;
    const fetchSaracinesche = async () => { chiamato = true; return []; };
    const cfgZag = cfg(masterPath);
    cfgZag.acea.zagarolo = {
      masterPath, foglio: 'Foglio1', masterColonnaOdl: 'ORDINE', masterColonnaStato: 'stato odl',
      masterColonnaSaracinesca: 'saracinesca',
    };
    await eseguiGiroAcea({
      cfg: cfgZag, target: 'zagarolo', stamp: 's', driver: async () => exportPath, nowMs: 702000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(chiamato).toBe(false);
  });

  it('osservabilità: se il master è stato sovrascritto dopo l\'ultima scrittura dell\'agente, il report include clobberPrecedente', async () => {
    const subdir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-clobber-'));
    const masterPath = path.join(subdir, 'master.xlsx');
    const exportPath = path.join(subdir, 'export.xlsx');
    const statePath = path.join(subdir, '.sync-watch.json');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Esecutore'],
      [957276080, 'Intervento Richiesto', 'CIARALLO'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    // Giro 1: aggiorna il master e registra la baseline. Nessun clobber possibile (prima volta).
    const r1 = await eseguiGiroAcea({
      cfg: cfg(masterPath), stamp: 'g1', driver: async () => exportPath, nowMs: 800000, statePath,
    });
    expect(r1.clobberPrecedente).toBeUndefined();

    // Un altro editor (collega su SharePoint) sostituisce il file con una versione diversa (size cambia).
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Esecutore'],
      [957276080, 'Ricevuto', 'CIARALLO'],
      [111222333, 'assegnato', 'ALTRO'],
      [444555666, 'assegnato', 'ALTRO'],
    ]);

    // Giro 2: il master risulta modificato dall'esterno dopo la scrittura dell'agente → clobber segnalato.
    const r2 = await eseguiGiroAcea({
      cfg: cfg(masterPath), stamp: 'g2', driver: async () => exportPath, nowMs: 801000, statePath,
    });
    expect(r2.clobberPrecedente).toBeTruthy();
    expect(r2.clobberPrecedente.masterPath).toBe(masterPath);
  });

  it('senza baseUrl/exportKey (main() non li passa ancora) → NON chiama fetchSaracinesche, nessun errore', async () => {
    const masterPath = path.join(dir, 'master_nobase.xlsx');
    const exportPath = path.join(dir, 'export_nobase.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Ricevuto', ''],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    let chiamato = false;
    const fetchSaracinesche = async () => { chiamato = true; return []; };
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 703000, fetchSaracinesche,
    });

    expect(chiamato).toBe(false);
    expect(report.file[0].aggiornate).toBe(1);
  });

  // --- Limitazioni massive per comune: il comune È il nome del file ---------------------------

  /** Cartella limitazioni massive con LABICO.xlsx + ZAGAROLO.xlsx e l'export FUORI (come in reale,
   *  che sta nella cartella download). Ritorna anche una cfg col blocco `massive`. */
  async function scenarioComuni(nome: string) {
    const cart = fs.mkdtempSync(path.join(os.tmpdir(), `acea-${nome}-`));
    const fuori = fs.mkdtempSync(path.join(os.tmpdir(), `acea-${nome}-dl-`));
    const labico = path.join(cart, 'LABICO.xlsx');
    const zagarolo = path.join(cart, 'ZAGAROLO.xlsx');
    const exportPath = path.join(fuori, 'export.xlsx');
    await scriviXlsx(labico, 'Foglio1', [['ORDINE', 'stato odl'], [912350788, 'Intervento Richiesto']]);
    await scriviXlsx(zagarolo, 'Foglio1', [['ORDINE', 'stato odl'], [912214968, 'Intervento Richiesto']]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [912350788, 'completato'],
      [912214968, 'Sospensione'],
    ]);
    const c = cfg(path.join(fuori, 'dunning.xlsx')) as Record<string, unknown> & { acea: Record<string, unknown> };
    c.cartella = cart;
    c.acea.massive = { foglio: 'Foglio1', masterColonnaOdl: 'ORDINE', masterColonnaStato: 'stato odl' };
    return { cart, labico, zagarolo, exportPath, c };
  }

  async function statoOdl(file: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    return wb.getWorksheet('Foglio1')!.getRow(2).getCell(2).value;
  }

  it('TUTTI: UN SOLO export (una sola sessione ACEA) riversato su ogni master della cartella', async () => {
    const { labico, zagarolo, exportPath, c } = await scenarioComuni('tutti');
    let chiamateDriver = 0;
    const report = await eseguiGiroAcea({
      cfg: c, target: 'TUTTI', stamp: 's',
      driver: async () => { chiamateDriver++; return exportPath; },
      nowMs: 800000,
    });

    // ACEA è lenta: moltiplicare gli export per comune moltiplicherebbe i fallimenti.
    expect(chiamateDriver).toBe(1);
    expect(report.file.map((f: { file: string }) => f.file).sort()).toEqual(['LABICO.xlsx', 'ZAGAROLO.xlsx']);
    expect(report.file.every((f: { aggiornate: number }) => f.aggiornate === 1)).toBe(true);
    expect(await statoOdl(labico)).toBe('completato');
    expect(await statoOdl(zagarolo)).toBe('Sospensione');
  });

  it('TUTTI: "non agganciate" = ODL assenti da OGNI master, non da uno solo', async () => {
    // Regressione: per-master, l'ODL di Labico risulterebbe "non agganciato" su ZAGAROLO.xlsx
    // (e viceversa) e il report griderebbe al lupo su righe in realtà collocate.
    const { exportPath, c } = await scenarioComuni('inter');
    const report = await eseguiGiroAcea({
      cfg: c, target: 'TUTTI', stamp: 's', driver: async () => exportPath, nowMs: 801000,
    });
    expect(report.extraNonCollocate).toEqual([]);
  });

  it('un comune: aggiorna solo il suo master, gli altri non li tocca', async () => {
    const { labico, zagarolo, exportPath, c } = await scenarioComuni('uno');
    const primaZag = await statoOdl(zagarolo);
    const report = await eseguiGiroAcea({
      cfg: c, target: 'LABICO', stamp: 's', driver: async () => exportPath, nowMs: 802000,
    });

    expect(report.file).toHaveLength(1);
    expect(report.file[0].file).toBe('LABICO.xlsx');
    expect(await statoOdl(labico)).toBe('completato');
    expect(await statoOdl(zagarolo)).toBe(primaZag); // intatto
    // l'ODL di Zagarolo non ha riga in LABICO.xlsx: giustamente non agganciato
    expect(report.extraNonCollocate).toEqual([{ odl: '912214968' }]);
  });

  it('comune senza file in cartella → errore esplicito, nessuna scrittura (mai degradare a "tutti")', async () => {
    const { labico, zagarolo, exportPath, c } = await scenarioComuni('assente');
    const primaLab = await statoOdl(labico);
    const primaZag = await statoOdl(zagarolo);
    const report = await eseguiGiroAcea({
      cfg: c, target: 'PALESTRINA', stamp: 's', driver: async () => exportPath, nowMs: 803000,
    });

    expect(report.erroreGlobale).toMatch(/PALESTRINA/);
    expect(await statoOdl(labico)).toBe(primaLab);
    expect(await statoOdl(zagarolo)).toBe(primaZag);
  });

  it('TUTTI: un .xlsx che master non è viene saltato, gli altri si aggiornano lo stesso', async () => {
    const { cart, labico, exportPath, c } = await scenarioComuni('intruso');
    // capita: qualcuno lascia un'estrazione nella cartella dei master
    await scriviXlsx(path.join(cart, 'ESTRAZIONE VARIA.xlsx'), 'Foglio1', [['Pippo', 'Pluto'], ['a', 'b']]);
    const report = await eseguiGiroAcea({
      cfg: c, target: 'TUTTI', stamp: 's', driver: async () => exportPath, nowMs: 804000,
    });

    const intruso = report.file.find((f: { file: string }) => f.file === 'ESTRAZIONE VARIA.xlsx');
    expect(intruso.saltato).toBe(true);
    expect(intruso.errore).toMatch(/colonne/i);
    expect(report.erroreGlobale).toBeUndefined();
    expect(await statoOdl(labico)).toBe('completato'); // il giro è proseguito
  });
});
