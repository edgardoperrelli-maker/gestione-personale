import type ExcelJS from 'exceljs';

export const HEADER_ROW = 6;
export const DATA_START_ROW = 7;
export const TEMPLATE_BAND_ROW = 35;
export const BAND_LABEL = 'INTERVENTI CON NOTE';
export const LAST_COL = 17; // colonna Q

/**
 * Riga in cui posizionare la banda "INTERVENTI CON NOTE" dato il numero di
 * interventi scritti a partire dalla riga 7. Policy: resta alla riga 35 del
 * template finché gli interventi ci stanno (≤ 28), poi subito sotto l'ultimo.
 */
export function rigaBanda(dataCount: number): number {
  return Math.max(TEMPLATE_BAND_ROW, DATA_START_ROW + dataCount);
}

export interface StiliRapportino {
  banda: ExcelJS.Style[]; // stili A..Q della banda (riga 35 del template)
  dati: ExcelJS.Style[];  // stili A..Q di una riga dati (riga 7 del template)
}

function clonaStile(s: Partial<ExcelJS.Style> | undefined): ExcelJS.Style {
  return JSON.parse(JSON.stringify(s ?? {})) as ExcelJS.Style;
}

/**
 * Cattura gli stili della banda (riga 35) e di una riga dati (riga 7) dal foglio
 * appena clonato dal template, PRIMA che i dati vengano scritti (in overflow la
 * riga 35 verrebbe sovrascritta dagli interventi, perdendo lo stile della banda).
 */
export function catturaStili(ws: ExcelJS.Worksheet): StiliRapportino {
  const banda: ExcelJS.Style[] = [];
  const dati: ExcelJS.Style[] = [];
  for (let c = 1; c <= LAST_COL; c++) {
    banda.push(clonaStile(ws.getRow(TEMPLATE_BAND_ROW).getCell(c).style));
    dati.push(clonaStile(ws.getRow(DATA_START_ROW).getCell(c).style));
  }
  return { banda, dati };
}

/**
 * Posiziona la banda sotto gli interventi scritti.
 * - dataCount ≤ 28: la banda resta alla riga 35 del template (nessuna modifica).
 * - dataCount > 28: smonta il merge A35:Q35, ridà stile-dati alle righe 35..(6+dataCount)
 *   che ora contengono interventi (ripulendo l'eventuale testo "INTERVENTI CON NOTE"
 *   residuo nelle celle non scritte), e ridisegna la banda (merge A..Q + stile + label)
 *   alla prima riga libera dopo i dati.
 * Ritorna la riga della banda e la prima riga utile per le note.
 */
export function posizionaBanda(
  ws: ExcelJS.Worksheet,
  dataCount: number,
  stili: StiliRapportino,
): { bandRow: number; primaNota: number } {
  const bandRow = rigaBanda(dataCount);
  if (bandRow === TEMPLATE_BAND_ROW) {
    return { bandRow, primaNota: TEMPLATE_BAND_ROW + 1 };
  }
  // Overflow: la banda del template (riga 35) è coperta dai dati. Smontala e ricostruiscila sotto.
  try { ws.unMergeCells(`A${TEMPLATE_BAND_ROW}:Q${TEMPLATE_BAND_ROW}`); } catch { /* non mergiata: ok */ }
  const ultimaRigaDati = HEADER_ROW + dataCount; // 6 + dataCount
  for (let r = TEMPLATE_BAND_ROW; r <= ultimaRigaDati; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      if (typeof cell.value === 'string' && cell.value === BAND_LABEL) cell.value = null;
      cell.style = clonaStile(stili.dati[c - 1]);
    }
    row.commit();
  }
  const banda = ws.getRow(bandRow);
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = banda.getCell(c);
    cell.value = c === 1 ? BAND_LABEL : null;
    cell.style = clonaStile(stili.banda[c - 1]);
  }
  banda.commit();
  ws.mergeCells(`A${bandRow}:Q${bandRow}`);
  return { bandRow, primaNota: bandRow + 1 };
}
