// tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggiornaStatoXlsx } from './aggiornaStatoXlsx.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-xlsx-'));

async function creaMaster(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('PIANIFICAZIONE');
  ws.addRow(['Ordine', 'Stato Operazione', 'Esecutore', 'Automazione']);
  ws.addRow([957276080, 'Intervento Richiesto', 'CIARALLO', '']);
  ws.addRow([957289327, 'Ricevuto', 'PRATESI', '']);
  ws.autoFilter = 'A1:D3';
  await wb.xlsx.writeFile(file);
}

describe('aggiornaStatoXlsx', () => {
  it("aggiorna Stato Operazione per Ordine, preserva le altre celle e l'AutoFiltro", async () => {
    const file = path.join(dir, 'master.xlsx');
    await creaMaster(file);

    let backupChiamato = false;
    const rep = await aggiornaStatoXlsx(
      file,
      [
        { ordine: '957276080', stato: 'completato' }, // cambia
        { ordine: '957289327', stato: 'Ricevuto' }, // invariata
        { ordine: '111', stato: 'x' }, // non agganciata
      ],
      {
        foglio: 'PIANIFICAZIONE',
        masterColonnaOdl: 'Ordine',
        masterColonnaStato: 'Stato Operazione',
        masterColonnaAutomazione: 'Automazione',
        backup: () => { backupChiamato = true; },
      },
    );

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    expect(rep.invariate).toBe(1);
    expect(rep.nonAgganciate).toEqual(['111']);
    expect(backupChiamato).toBe(true);
    expect(rep.righe[0]).toMatchObject({ odl: '957276080', esito: 'completato', note: 'era: Intervento Richiesto' });

    // rilettura: stato aggiornato, Esecutore intatto, marcatore Automazione scritto
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('PIANIFICAZIONE')!;
    expect(ws.getRow(2).getCell(2).value).toBe('completato');
    expect(ws.getRow(2).getCell(3).value).toBe('CIARALLO');
    expect(ws.getRow(2).getCell(4).value).toBe('SI + Stato Operazione');
    expect(ws.getRow(3).getCell(4).value ?? '').toBe(''); // riga invariata: Automazione non toccata

    // AutoFiltro preservato
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const s1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(/<autoFilter/.test(s1)).toBe(true);
  });

  it('nessuna modifica → non chiama il backup e non altera il file', async () => {
    const file = path.join(dir, 'nochange.xlsx');
    await creaMaster(file);
    const prima = fs.readFileSync(file);
    let backupChiamato = false;
    const rep = await aggiornaStatoXlsx(
      file,
      [{ ordine: '957289327', stato: 'Ricevuto' }], // già uguale
      { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione', backup: () => { backupChiamato = true; } },
    );
    expect(rep.aggiornate).toBe(0);
    expect(backupChiamato).toBe(false);
    expect(fs.readFileSync(file).equals(prima)).toBe(true);
  });

  it('daChiedere: scrive "DA CHIEDERE" su Ordine non in export con stato vuoto, lascia i pieni', async () => {
    const file = path.join(dir, 'dachiedere.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']);
    ws.addRow([957276080, '']);        // in export -> aggiorna
    ws.addRow([888, '']);              // NON in export + vuoto -> DA CHIEDERE
    ws.addRow([999, 'gia presente']);  // NON in export + pieno -> invariato
    await wb.xlsx.writeFile(file);

    const rep = await aggiornaStatoXlsx(
      file,
      [{ ordine: '957276080', stato: 'completato' }],
      { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione', daChiedere: true },
    );

    expect(rep.aggiornate).toBe(1);
    expect(rep.daChiedere).toBe(1);

    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    const w = chk.getWorksheet('PIANIFICAZIONE')!;
    expect(w.getRow(2).getCell(2).value).toBe('completato');
    expect(w.getRow(3).getCell(2).value).toBe('DA CHIEDERE');
    expect(w.getRow(4).getCell(2).value).toBe('gia presente');
  });

  it('erroreColonne=true se mancano le colonne', async () => {
    const file = path.join(dir, 'nomatch.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Pippo', 'Pluto']);
    await wb.xlsx.writeFile(file);
    const rep = await aggiornaStatoXlsx(file, [{ ordine: '1', stato: 'x' }], {
      foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
    });
    expect(rep.erroreColonne).toBe(true);
  });

  // --- BLINDATURA 1: intestazione rilevata in modo dinamico (non solo riga 1) ---
  it('trova l’intestazione anche se NON è sulla riga 1 (riga-titolo sopra)', async () => {
    const file = path.join(dir, 'header-riga2.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['LIMITAZIONI CON ORDINE — pianificazione']);            // riga 1: titolo
    ws.addRow(['Ordine', 'Stato Operazione', 'Esecutore', 'Automazione']); // riga 2: intestazione
    ws.addRow([957276080, 'Intervento Richiesto', 'CIARALLO', '']);    // riga 3: dati
    await wb.xlsx.writeFile(file);

    const rep = await aggiornaStatoXlsx(file, [{ ordine: '957276080', stato: 'completato' }], {
      foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
      masterColonnaAutomazione: 'Automazione',
    });

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);

    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    const w = chk.getWorksheet('PIANIFICAZIONE')!;
    expect(w.getRow(3).getCell(2).value).toBe('completato');       // stato aggiornato
    expect(w.getRow(3).getCell(3).value).toBe('CIARALLO');         // altra cella intatta
    expect(w.getRow(3).getCell(4).value).toBe('SI + Stato Operazione'); // marcatore
  });

  // --- BLINDATURA 2: ODL duplicato nell'export (multi-operazione) → vince lo stato più avanzato ---
  it('ODL duplicato con stati diversi: vince il più avanzato, NON "Intervento Richiesto" (anche se ultimo)', async () => {
    const file = path.join(dir, 'dup.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']);
    ws.addRow([957276080, 'Intervento Richiesto']);
    await wb.xlsx.writeFile(file);

    // stesso ordine due volte; "Intervento Richiesto" è l'ULTIMA riga: con last-wins vincerebbe (errato)
    const rep = await aggiornaStatoXlsx(file, [
      { ordine: '957276080', stato: 'completato' },
      { ordine: '957276080', stato: 'Intervento Richiesto' },
    ], { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });

    expect(rep.aggiornate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
  });

  it('ODL duplicato: l’ordine delle righe export non conta (determinismo)', async () => {
    const file = path.join(dir, 'dup2.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']);
    ws.addRow([957276080, 'Intervento Richiesto']);
    await wb.xlsx.writeFile(file);

    const rep = await aggiornaStatoXlsx(file, [
      { ordine: '957276080', stato: 'Intervento Richiesto' },
      { ordine: '957276080', stato: 'completato' },
    ], { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });

    expect(rep.aggiornate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
  });

  it('ODL duplicato: uno stato sconosciuto vince comunque su "Intervento Richiesto"', async () => {
    const file = path.join(dir, 'dup3.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']);
    ws.addRow([957276080, 'Intervento Richiesto']);
    await wb.xlsx.writeFile(file);

    const rep = await aggiornaStatoXlsx(file, [
      { ordine: '957276080', stato: 'Stato Nuovo ACEA' }, // sconosciuto → comunque oltre "richiesto"
      { ordine: '957276080', stato: 'Intervento Richiesto' },
    ], { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });

    expect(rep.aggiornate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('Stato Nuovo ACEA');
  });
});
