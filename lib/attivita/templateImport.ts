// PURA: builder del template di import (spec §5): 2 fogli. GRUPPO e COMMITTENTE nel file
// sono "di conforto" e NON compilabili a mano: formule VLOOKUP sulla Leggenda (si svuotano
// se la descrizione è sbagliata) su celle bloccate dalla protezione del foglio — il
// committente del singolo intervento lo deriva comunque il server dalla tassonomia
// (taskToIntervento). Tutte le altre colonne restano libere (COMUNE/territorio compreso).
// Colonne allineate a quelle già in uso nel template statico della mappa (detectFormat),
// con la colonna attività rinominata in DESCRIZIONE ATTIVITÀ + GRUPPO ATTIVITA' e
// COMMITTENTE (formule) + foglio Leggenda dal DB. Nessuna riga d'esempio: un upload
// accidentale degli esempi creerebbe task finti, i valori validi sono in Leggenda.
import ExcelJS from 'exceljs';
import type { TassonomiaRiga } from './tassonomia';
import { COLONNE_TEMPLATE, FOGLIO_TEMPLATE } from './templateColonne';

export { COLONNE_TEMPLATE } from './templateColonne';

/** Colonne derivate dalla Leggenda: formula + cella bloccata (non compilabili a mano). */
const COLONNE_BLOCCATE = ["GRUPPO ATTIVITA'", 'COMMITTENTE'] as const;

const RIGHE_DEFAULT = 300;

export async function buildTemplateImport(
  tassonomia: TassonomiaRiga[],
  righeDati: number = RIGHE_DEFAULT,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const attive = (tassonomia ?? []).filter((t) => t.attivo);

  const ws = wb.addWorksheet(FOGLIO_TEMPLATE);
  ws.addRow([...COLONNE_TEMPLATE]);
  ws.getRow(1).font = { bold: true };
  const colDescr = COLONNE_TEMPLATE.indexOf('DESCRIZIONE ATTIVITÀ') + 1;
  const colGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
  const colCommittente = COLONNE_TEMPLATE.indexOf('COMMITTENTE') + 1;
  const idxBloccate = new Set(COLONNE_BLOCCATE.map((c) => COLONNE_TEMPLATE.indexOf(c) + 1));
  const letteraDescr = ws.getColumn(colDescr).letter;
  // Descrizione attività NON compilabile a mano: solo la tendina con le canoniche della
  // Leggenda (errorStyle stop = Excel rifiuta il testo libero). Blank ammesso (righe vuote).
  const validazioneDescr: ExcelJS.DataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`Leggenda!$B$2:$B$${attive.length + 1}`],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Attività non valida',
    error: 'Scegli l\'attività dalla tendina: il testo libero non è ammesso. I valori validi sono nel foglio Leggenda.',
  };
  for (let r = 2; r <= righeDati + 1; r++) {
    const row = ws.getRow(r);
    row.getCell(colDescr).dataValidation = validazioneDescr;
    // UPPER+TRIM avvicina la chiave della Leggenda (che è l'upper della canonica).
    row.getCell(colGruppo).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${letteraDescr}${r})),Leggenda!$A:$D,3,FALSE),"")`,
    } as ExcelJS.CellFormulaValue;
    row.getCell(colCommittente).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${letteraDescr}${r})),Leggenda!$A:$D,4,FALSE),"")`,
    } as ExcelJS.CellFormulaValue;
    // Protezione foglio: di default le celle sono "locked" → sblocca tutte le colonne
    // compilabili (COMUNE/territorio, esecutore, ecc.); restano bloccate SOLO le derivate.
    for (let c = 1; c <= COLONNE_TEMPLATE.length; c++) {
      if (!idxBloccate.has(c)) row.getCell(c).protection = { locked: false };
    }
  }
  ws.columns.forEach((c) => { c.width = 22; });
  // Protezione senza password: impedisce la compilazione manuale di GRUPPO/COMMITTENTE
  // (celle locked) lasciando libere le altre; niente segreti, è solo anti-errore.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    sort: true,
    autoFilter: true,
  });

  const wl = wb.addWorksheet('Leggenda');
  wl.addRow(['CHIAVE', 'DESCRIZIONE ATTIVITÀ', 'GRUPPO', 'COMMITTENTE']);
  wl.getRow(1).font = { bold: true };
  for (const t of attive) {
    wl.addRow([t.descrizione.toUpperCase(), t.descrizione, t.gruppo, t.committente.toUpperCase()]);
  }
  wl.columns.forEach((c) => { c.width = 40; });
  // La Leggenda è generata dal DB: tutta in sola lettura (alterarla falserebbe i lookup).
  await wl.protect('', { selectLockedCells: true, selectUnlockedCells: true });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
