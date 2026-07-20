// PURA: builder del template di import (spec §5): 2 fogli. Il GRUPPO nel file è "di conforto"
// (formula VLOOKUP sulla Leggenda, si svuota se la descrizione è sbagliata); la verità
// resta la validazione server (validaImport).
// Colonne allineate a quelle già in uso nel template statico della mappa (detectFormat),
// con la sola colonna attività rinominata in DESCRIZIONE ATTIVITÀ + nuova GRUPPO ATTIVITA'
// (formula) + foglio Leggenda dal DB. Nessuna riga d'esempio: un upload accidentale degli
// esempi creerebbe task finti, i valori validi sono in Leggenda.
import ExcelJS from 'exceljs';
import type { TassonomiaRiga } from './tassonomia';

export const COLONNE_TEMPLATE = [
  'CO', 'MATRICOLA', 'ODS/ODL', 'Indirizzo', 'CAP', 'COMUNE',
  'DESCRIZIONE ATTIVITÀ', "GRUPPO ATTIVITA'",
  'Esecutore', 'Fascia Appuntamento/Blocco', 'PdR / Impianto', 'Nominativo',
  'Tempo Esecuzione', 'Num Risorse', 'Lat', 'Long', 'Note per operatore',
] as const;

const RIGHE_DEFAULT = 300;

export async function buildTemplateImport(
  tassonomia: TassonomiaRiga[],
  righeDati: number = RIGHE_DEFAULT,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Interventi');
  ws.addRow([...COLONNE_TEMPLATE]);
  ws.getRow(1).font = { bold: true };
  const colDescr = COLONNE_TEMPLATE.indexOf('DESCRIZIONE ATTIVITÀ') + 1;
  const colGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
  const letteraDescr = ws.getColumn(colDescr).letter;
  for (let r = 2; r <= righeDati + 1; r++) {
    // UPPER+TRIM avvicina la chiave della Leggenda (che è l'upper della canonica).
    ws.getRow(r).getCell(colGruppo).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${letteraDescr}${r})),Leggenda!$A:$C,3,FALSE),"")`,
    } as ExcelJS.CellFormulaValue;
  }
  ws.columns.forEach((c) => { c.width = 22; });

  const attive = (tassonomia ?? []).filter((t) => t.attivo);
  const wl = wb.addWorksheet('Leggenda');
  wl.addRow(['CHIAVE', 'DESCRIZIONE ATTIVITÀ', 'GRUPPO', 'COMMITTENTE']);
  wl.getRow(1).font = { bold: true };
  for (const t of attive) {
    wl.addRow([t.descrizione.toUpperCase(), t.descrizione, t.gruppo, t.committente.toUpperCase()]);
  }
  wl.columns.forEach((c) => { c.width = 40; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
