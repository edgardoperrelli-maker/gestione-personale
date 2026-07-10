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

  // --- BLINDATURA 3: intestazioni master con casing diverso da config (file rigenerato in Excel) ---
  it('trova le colonne anche se il casing dell’intestazione differisce da config (ORDINE vs Ordine)', async () => {
    const file = path.join(dir, 'header-casing.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Foglio1');
    ws.addRow(['Ordine', 'stato odl']);              // file: casing "reale" ZAGAROLO
    ws.addRow([957276080, 'Ricevuto']);
    await wb.xlsx.writeFile(file);

    // config chiede "ORDINE" (maiuscolo): deve agganciare comunque
    const rep = await aggiornaStatoXlsx(file, [{ ordine: '957276080', stato: 'completato' }], {
      foglio: 'Foglio1', masterColonnaOdl: 'ORDINE', masterColonnaStato: 'stato odl',
    });

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('Foglio1')!.getRow(2).getCell(2).value).toBe('completato');
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

  // --- SARACINESCA (dal nostro DB): riempi-vuote, indipendente dallo stato, integra Automazione ---
  it('saracinesca: riempie la cella vuota per ODL agganciato, indipendentemente dal cambio stato', async () => {
    const file = path.join(dir, 'saracinesca-riempi.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '']); // stato NON cambia in questo giro
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file,
      [{ ordine: '957276080', stato: 'Ricevuto' }], // stato invariato
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(1);
    expect(rep.aggiornate).toBe(0); // lo stato NON è cambiato
    expect(rep.invariate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI');
  });

  it('saracinesca: cella già "SI" → salta senza riscrivere (idempotente)', async () => {
    const file = path.join(dir, 'saracinesca-idempotente.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'SI']);
    await wb.xlsx.writeFile(file);
    const prima = fs.readFileSync(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(0);
    expect(rep.conflitti).toEqual([]);
    expect(fs.readFileSync(file).equals(prima)).toBe(true);
  });

  it('saracinesca: cella con valore DIVERSO già presente → conflitto, mai sovrascritta', async () => {
    const file = path.join(dir, 'saracinesca-conflitto.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'NO']); // compilato a mano diversamente
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(0);
    expect(rep.conflitti).toEqual([{ riga: 2, odl: '957276080', campo: 'saracinesca', esistente: 'NO', nuovo: 'SI' }]);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('NO'); // NON sovrascritta
  });

  it('saracinesca + stato cambiano sulla STESSA riga: entrambe scritte, Automazione compone i due tag', async () => {
    const file = path.join(dir, 'saracinesca-e-stato.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Automazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '', '']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'completato' }], // stato CAMBIA
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaAutomazione: 'Automazione', masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.aggiornate).toBe(1);
    expect(rep.saracinescaScritte).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    const w = chk.getWorksheet('PIANIFICAZIONE')!;
    expect(w.getRow(2).getCell(2).value).toBe('completato');
    expect(w.getRow(2).getCell(3).value).toBe('SI + Stato Operazione + Saracinesca');
    expect(w.getRow(2).getCell(4).value).toBe('SI');
    // report.righe: una SOLA riga (tipo acea-stato), non una entry duplicata per la saracinesca
    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0].tipo).toBe('acea-stato');
  });

  it('saracinesca: integra il tag "Saracinesca" senza perdere un tag "Stato Operazione" già scritto in un giro precedente', async () => {
    const file = path.join(dir, 'saracinesca-integra.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Automazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'SI + Stato Operazione', '']); // già marcata da un giro precedente
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }], // stato invariato in QUESTO giro
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaAutomazione: 'Automazione', masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI + Stato Operazione + Saracinesca');
  });

  it('saracinesca: colonna assente dal master → soft-skip, nessun errore, lo stato si aggiorna comunque', async () => {
    const file = path.join(dir, 'saracinesca-assente.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']); // NESSUNA colonna Saracinesca
    ws.addRow([957276080, 'Ricevuto']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'completato' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    expect(rep.saracinescaScritte).toBe(0);
  });

  it('automazione: se Stato cambia e la cella ha già un tag ESTRANEO (non "SI + Stato Operazione"), lo preserva e aggiunge il nuovo tag', async () => {
    const file = path.join(dir, 'automazione-preserva-estraneo.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Automazione']);
    ws.addRow([957276080, 'Ricevuto', 'SI + Nota manuale']); // contenuto estraneo pre-esistente
    await wb.xlsx.writeFile(file);

    const rep = await aggiornaStatoXlsx(
      file,
      [{ ordine: '957276080', stato: 'completato' }], // stato CAMBIA, saracinesca non coinvolta
      { foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione', masterColonnaAutomazione: 'Automazione' },
    );

    expect(rep.aggiornate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    const w = chk.getWorksheet('PIANIFICAZIONE')!;
    expect(w.getRow(2).getCell(2).value).toBe('completato');
    // il tag estraneo "Nota manuale" NON deve andare perso, e "Stato Operazione" va aggiunto
    expect(w.getRow(2).getCell(3).value).toBe('SI + Nota manuale + Stato Operazione');
  });
});
