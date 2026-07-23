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
  // Descrizione attività: la tendina con le voci della Leggenda resta come AIUTO, ma NON
  // blocca (showErrorMessage:false). Così il back office può incollare il codice attività
  // PER INTERO dal file di estrazione del committente (anche il dettaglio S-PR-003 A, …)
  // senza che Excel rifiuti l'incolla. Il gate autorevole è validaImport lato server, che
  // rifiuta solo le descrizioni davvero sconosciute. Blank ammesso (righe vuote).
  const validazioneDescr: ExcelJS.DataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`Leggenda!$B$2:$B$${attive.length + 1}`],
    showErrorMessage: false,
  };
  for (let r = 2; r <= righeDati + 1; r++) {
    const row = ws.getRow(r);
    row.getCell(colDescr).dataValidation = validazioneDescr;
    // UPPER+TRIM avvicina la chiave della Leggenda (che è l'upper della canonica).
    // INDIRECT("<col>"&ROW()) invece di un riferimento relativo (es. G2): la formula
    // punta SEMPRE alla DESCRIZIONE della propria riga fisica, indipendentemente da
    // taglia/incolla, inserimento/cancellazione di righe o riordino in Excel. Un
    // riferimento relativo, se l'utente riusa il file svuotandolo e re-incollando i
    // dati, si sfasa (il riferimento resta a una riga sbagliata e GRUPPO/COMMITTENTE
    // non si autocompilano più); INDIRECT+ROW() è immune perché si ricostruisce a ogni
    // ricalcolo dalla posizione della cella. Sempre avvolto in IFERROR (best-effort).
    const descrCorrente = `INDIRECT("${letteraDescr}"&ROW())`;
    row.getCell(colGruppo).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${descrCorrente})),Leggenda!$A:$D,3,FALSE),"")`,
    } as ExcelJS.CellFormulaValue;
    row.getCell(colCommittente).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${descrCorrente})),Leggenda!$A:$D,4,FALSE),"")`,
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
