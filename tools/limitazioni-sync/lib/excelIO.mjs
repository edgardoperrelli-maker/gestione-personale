// tools/limitazioni-sync/lib/excelIO.mjs
// I/O Excel con exceljs: caricamento, ricerca intestazione, backup, salvataggio.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { isFileMaster } from './colonne.mjs';

export async function caricaWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Riga di intestazione (1-based) nei primi `maxScan` righe cercando la firma master; -1 se assente.
 *  exceljs: `row.values` è 1-based con [0] vuoto → slice(1) per allineare agli indici 0-based. */
export function trovaRigaIntestazione(ws, maxScan = 10) {
  const limite = Math.min(maxScan, ws.rowCount);
  for (let r = 1; r <= limite; r++) {
    const valori = ws.getRow(r).values;
    const arr = Array.isArray(valori) ? valori.slice(1) : [];
    if (isFileMaster(arr)) return r;
  }
  return -1;
}

/** Copia di backup datata in <cartella>/_backup/<nome>__<stamp>.xlsx. */
export function backupFile(file, stamp) {
  const dir = path.join(path.dirname(file), '_backup');
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  const dest = path.join(dir, `${base}__${stamp}.xlsx`);
  fs.copyFileSync(file, dest);
  return dest;
}

export async function salva(wb, file) {
  await wb.xlsx.writeFile(file);
}
