// tools/limitazioni-sync/lib/acea/parseExport.mjs
// PURE (+ thin I/O): legge l'export ACEA → righe { ordine, stato }.
import ExcelJS from 'exceljs';
import { risolviColonna } from '../colonne.mjs';
import { norm } from '../match.mjs';

/** Testo da una cella exceljs (rich text / formula / hyperlink / data / scalare). */
export function valoreCella(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('result' in v) return v.result ?? '';
  }
  return v;
}

/** Riga intestazione (1-based, entro le prime 10) che contiene TUTTE le `nomi`. */
export function trovaHeader(ws, nomi) {
  const max = Math.min(10, ws.rowCount);
  for (let r = 1; r <= max; r++) {
    const header = (ws.getRow(r).values || []).slice(1).map((c) => {
      const t = valoreCella(c);
      return t == null ? '' : String(t);
    });
    const idx = {};
    let ok = true;
    for (const n of nomi) {
      const i = risolviColonna(header, n);
      if (i < 0) { ok = false; break; }
      idx[n] = i;
    }
    if (ok) return { riga: r, idx };
  }
  return { riga: -1, idx: {} };
}

/** Righe { ordine, stato } dal foglio export. Se si passa `colonnaOperatore` (opzionale), ogni riga
 *  porta anche `operatore` (cognome + eventuale `colonnaOperatoreNome`); se la colonna manca
 *  nell'header → `operatore: ''` (degradazione morbida, nessun errore). Le colonne OBBLIGATORIE per
 *  l'aggancio dell'header restano solo [colonnaOdl, colonnaStato], così il giro stato non cambia. */
export function estraiRigheExport(ws, { colonnaOdl, colonnaStato, colonnaOperatore, colonnaOperatoreNome }) {
  const { riga, idx } = trovaHeader(ws, [colonnaOdl, colonnaStato]);
  if (riga < 0) return { righe: [], erroreColonne: true };
  const leggiOperatore = colonnaOperatore != null;
  let idxOp = -1;
  let idxOpNome = -1;
  if (leggiOperatore) {
    const header = (ws.getRow(riga).values || []).slice(1).map((c) => {
      const t = valoreCella(c);
      return t == null ? '' : String(t);
    });
    idxOp = risolviColonna(header, colonnaOperatore);
    idxOpNome = colonnaOperatoreNome ? risolviColonna(header, colonnaOperatoreNome) : -1;
  }
  const righe = [];
  for (let r = riga + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ordine = norm(valoreCella(row.getCell(idx[colonnaOdl] + 1).value));
    if (!ordine) continue;
    const stato = String(valoreCella(row.getCell(idx[colonnaStato] + 1).value) ?? '').trim();
    if (!leggiOperatore) {
      righe.push({ ordine, stato });
      continue;
    }
    const cognome = idxOp >= 0 ? String(valoreCella(row.getCell(idxOp + 1).value) ?? '').trim() : '';
    const nome = idxOpNome >= 0 ? String(valoreCella(row.getCell(idxOpNome + 1).value) ?? '').trim() : '';
    const operatore = [cognome, nome].filter(Boolean).join(' ').trim();
    righe.push({ ordine, stato, operatore });
  }
  return { righe, erroreColonne: false };
}

/** Carica il file scaricato e ne estrae le righe. */
export async function parseExport(file, { foglio, colonnaOdl, colonnaStato, colonnaOperatore, colonnaOperatoreNome }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = (foglio && wb.getWorksheet(foglio)) || wb.worksheets[0];
  return estraiRigheExport(ws, { colonnaOdl, colonnaStato, colonnaOperatore, colonnaOperatoreNome });
}
