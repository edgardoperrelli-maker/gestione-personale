// lib/acea/scriviFoglio.ts
// Da layout + righe a workbook xlsx. Nessun accesso al database: solo exceljs.
//
// Sta in un modulo suo perché i due export lo condividono, e perché un file che deve funzionare
// quando tutto il resto è spento va provato davvero — il test lo riapre e ne rilegge le celle.

import ExcelJS from 'exceljs';
import { costruisciFoglio, type Campo } from './fogliExport';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Formato data del master: quello che l'ufficio si aspetta di leggere. */
const FORMATO_DATA = 'dd/mm/yyyy';

/**
 * Foglio unico con intestazione in grassetto, riga bloccata e filtro automatico.
 *
 * Il congelamento e il filtro non sono decorazione: un master di duemila righe senza intestazione
 * fissa non si legge, ed erano le prime due cose che si rifacevano a mano ogni volta.
 */
export function scriviFoglio<T>(
  nomeFoglio: string,
  campi: readonly Campo<T>[],
  righe: readonly T[],
): ExcelJS.Workbook {
  const { intestazione, corpo } = costruisciFoglio(campi, righe);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nomeFoglio, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = campi.map((c, i) => ({ header: intestazione[i], width: c.larghezza }));
  ws.getRow(1).font = { bold: true };

  for (const riga of corpo) {
    const r = ws.addRow(riga);
    // Una data va formattata, altrimenti Excel la mostra come numero seriale.
    r.eachCell((cell) => {
      if (cell.value instanceof Date) cell.numFmt = FORMATO_DATA;
    });
  }

  if (intestazione.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: intestazione.length } };
  }
  return wb;
}

/** Intestazioni HTTP per servire un xlsx come allegato. */
export function intestazioniXlsx(nomeFile: string, byteLength: number): Record<string, string> {
  return {
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="${nomeFile}"`,
    'Content-Length': String(byteLength),
  };
}
