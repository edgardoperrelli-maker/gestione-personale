// tools/limitazioni-sync/lib/scanColonne.mjs
// Legge le intestazioni grezze dei file della cartella -> [{ nome, isMaster, colonne }].
// Stessa selezione file di eseguiGiro; try/catch per-file (un file rotto non blocca gli altri).
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione } from './excelIO.mjs';
import { isFileMaster } from './colonne.mjs';

/** Intestazioni grezze (stringhe) della riga r1 1-based di un worksheet. */
function intestazioniGrezze(ws, r1) {
  const valori = ws.getRow(r1).values;
  const arr = Array.isArray(valori) ? valori.slice(1) : [];
  return arr.map((v) => (v == null ? '' : String(v)));
}

/** [{ nome, isMaster, colonne[] }] per i file *.xlsx selezionabili della cartella. */
export async function scanColonne(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  let voci;
  try {
    voci = fs.readdirSync(cartella, { withFileTypes: true });
  } catch {
    return [];
  }
  const nomi = voci
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.xlsx') && !d.name.startsWith('~$'))
    .map((d) => d.name);

  const out = [];
  for (const nome of nomi) {
    const file = path.join(cartella, nome);
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) {
        out.push({ nome, isMaster: false, colonne: [] });
        continue;
      }
      const colonne = intestazioniGrezze(ws, rIntest);
      out.push({ nome, isMaster: isFileMaster(colonne), colonne });
    } catch {
      out.push({ nome, isMaster: false, colonne: [] });
    }
  }
  return out;
}
