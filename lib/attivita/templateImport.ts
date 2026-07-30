// PURA: builder del template di import (spec §5): 2 fogli + MasterODL quando ci sono
// master attivi (scrivi l'ODS/ODL → si compilano MATRICOLA/Indirizzo/CAP/COMUNE/DESCRIZIONE;
// ODL sconosciuto → cella rossa, riga da compilare a mano). GRUPPO e COMMITTENTE nel file
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
import type { RigaMasterOdl } from './masterOdl';
import { COLONNE_TEMPLATE, FOGLIO_TEMPLATE } from './templateColonne';

export { COLONNE_TEMPLATE } from './templateColonne';

/** Colonne derivate dalla Leggenda: formula + cella bloccata (non compilabili a mano). */
const COLONNE_BLOCCATE = ["GRUPPO ATTIVITA'", 'COMMITTENTE'] as const;

/** Foglio di lookup per ODL (sola lettura). Nome senza spazi: entra nelle formule nudo. */
export const FOGLIO_MASTER_ODL = 'MasterODL';

/** Colonne del foglio MasterODL → colonne del template che si autocompilano dall'ODL.
 *  L'indice è la posizione (1-based) nel foglio MasterODL, usata dai VLOOKUP. */
const MASTER_ODL_COLONNE = [
  { header: 'ODL' },
  { header: 'DESCRIZIONE ATTIVITÀ', template: 'DESCRIZIONE ATTIVITÀ' },
  { header: 'MATRICOLA', template: 'MATRICOLA' },
  { header: 'INDIRIZZO', template: 'Indirizzo' },
  { header: 'CAP', template: 'CAP' },
  { header: 'COMUNE', template: 'COMUNE' },
] as const;

const RIGHE_DEFAULT = 300;

export async function buildTemplateImport(
  tassonomia: TassonomiaRiga[],
  righeDati: number = RIGHE_DEFAULT,
  masterOdl: RigaMasterOdl[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const attive = (tassonomia ?? []).filter((t) => t.attivo);
  const master = (masterOdl ?? []).filter((r) => String(r.odl ?? '').trim() !== '');

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
  // Autocompilazione da ODS/ODL (solo con almeno una riga master): le colonne derivabili
  // ricevono un VLOOKUP sul foglio MasterODL. Le celle restano LIBERE (non bloccate):
  // per un ODL fuori master ci si scrive sopra a mano e la formula sparisce solo lì.
  const colOdl = COLONNE_TEMPLATE.indexOf('ODS/ODL') + 1;
  const letteraOdl = ws.getColumn(colOdl).letter;
  // `&""` coercizza a testo un ODL digitato come numero (le chiavi del MasterODL sono testo).
  const odlCorrente = `TRIM(INDIRECT("${letteraOdl}"&ROW())&"")`;
  const colonneDaOdl = master.length === 0 ? [] : MASTER_ODL_COLONNE.flatMap((c, i) =>
    'template' in c ? [{ col: COLONNE_TEMPLATE.indexOf(c.template) + 1, vlookupN: i + 1 }] : []);
  for (let r = 2; r <= righeDati + 1; r++) {
    const row = ws.getRow(r);
    row.getCell(colDescr).dataValidation = validazioneDescr;
    // T(...) rende '' i buchi del master: VLOOKUP che atterra su una cella vuota
    // restituirebbe 0, e uno 0 in MATRICOLA/COMUNE sporcherebbe l'import.
    for (const { col, vlookupN } of colonneDaOdl) {
      row.getCell(col).value = {
        formula: `IFERROR(T(VLOOKUP(${odlCorrente},${FOGLIO_MASTER_ODL}!$A$2:$F$${master.length + 1},${vlookupN},FALSE)),"")`,
      } as ExcelJS.CellFormulaValue;
    }
    // L'ODL si digita come TESTO: senza il formato '@' Excel lo convertirebbe in numero
    // e il confronto testuale con le chiavi del MasterODL fallirebbe.
    if (master.length > 0) row.getCell(colOdl).numFmt = '@';
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
  if (master.length > 0) {
    // ODL scritto ma sconosciuto a TUTTI i master attivi → cella rossa: caso legittimo
    // (intervento fuori master), si compila il resto a mano; il gate resta validaImport.
    // COUNTIF su un defined name e non su un riferimento cross-foglio nudo: nelle
    // formattazioni condizionali le versioni meno recenti di Excel non lo accettano.
    ws.addConditionalFormatting({
      ref: `${letteraOdl}2:${letteraOdl}${righeDati + 1}`,
      rules: [{
        type: 'expression',
        priority: 1,
        formulae: [`AND(LEN(TRIM($${letteraOdl}2&""))>0,COUNTIF(MasterOdlChiavi,TRIM($${letteraOdl}2&""))=0)`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
          font: { color: { argb: 'FF9C0006' } },
        },
      }],
    });
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

  if (master.length > 0) {
    // Foglio di lookup ODL → dati (fonti: master caricati a mano + snapshot DUNNING
    // dell'agente, già fusi da costruisciMasterOdl). Sola lettura come la Leggenda.
    const wm = wb.addWorksheet(FOGLIO_MASTER_ODL);
    wm.addRow(MASTER_ODL_COLONNE.map((c) => c.header));
    wm.getRow(1).font = { bold: true };
    for (const r of master) {
      wm.addRow([r.odl, r.descrizione, r.matricola, r.indirizzo, r.cap, r.comune]);
    }
    wm.columns.forEach((c) => { c.width = 28; });
    await wm.protect('', { selectLockedCells: true, selectUnlockedCells: true });
    // Defined name per la formattazione condizionale (vedi sopra).
    wb.definedNames.add(`${FOGLIO_MASTER_ODL}!$A$2:$A$${master.length + 1}`, 'MasterOdlChiavi');
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
