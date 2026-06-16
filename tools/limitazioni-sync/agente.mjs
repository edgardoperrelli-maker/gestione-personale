// tools/limitazioni-sync/agente.mjs
// Orchestrazione: scarica i lavori → per ogni file-master aggancia/scrive/aggiunge → backup/salva → log.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione, backupFile, salva } from './lib/excelIO.mjs';
import { rilevaColonne, colonnaMarker } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { decidiScrittura } from './lib/scrittura.mjs';
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';

export const MARKER = 'AGGIUNTA APP';

/** Comune prevalente fra le righe dati (per agganciare le matricole al comune giusto). */
function comunePrevalente(ws, rIntest, colComune) {
  const conteggio = new Map();
  for (let r = rIntest + 1; r <= ws.rowCount; r++) {
    const v = norm(ws.getRow(r).getCell(colComune + 1).value);
    if (v) conteggio.set(v, (conteggio.get(v) ?? 0) + 1);
  }
  let best = '';
  let n = -1;
  for (const [k, c] of conteggio) if (c > n) { best = k; n = c; }
  return best;
}

export async function eseguiGiro({ cartella, lavori, dryRun, stamp }) {
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [] };
  const indice = buildIndice(lavori);
  const idConsumati = new Set();
  const comuniConFile = new Set();

  if (!fs.existsSync(cartella)) {
    report.erroreGlobale = `Cartella non trovata: ${cartella}`;
    return report;
  }

  const files = fs
    .readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));

  for (const file of files) {
    const fileReport = {
      file: path.basename(file), master: false, aggiornate: 0, extraAggiunte: 0,
      conflitti: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) { report.file.push(fileReport); continue; } // non master → ignora
      fileReport.master = true;

      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header);
      const comuneFile =
        (col.comune != null ? comunePrevalente(ws, rIntest, col.comune) : '') ||
        norm(path.basename(file, '.xlsx'));
      comuniConFile.add(comuneFile);

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);
        const campi = [
          ['esecutore', hit.lavoro.esecutore],
          ['data', hit.lavoro.data_esecuzione],
          ['esito', hit.lavoro.esito],
          ['sigillo', hit.lavoro.sigillo],
        ];
        let toccata = false;
        for (const [chiave, valore] of campi) {
          if (col[chiave] == null) continue;
          const cell = row.getCell(col[chiave] + 1);
          const d = decidiScrittura(cell.value, valore);
          if (d.azione === 'scrivi') { cell.value = d.valore; toccata = true; }
          else if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: chiave, esistente: d.esistente, nuovo: d.valore });
          }
        }
        if (toccata) fileReport.aggiornate++;
      }

      // 2) extra di questo comune
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      if (extraComune.length) {
        const markerCol = colonnaMarker(header);
        for (const l of extraComune) {
          idConsumati.add(l.id);
          const row = ws.addRow([]);
          const set = (c, v) => { if (c != null && v) row.getCell(c + 1).value = v; };
          set(col.matricola, l.matricola);
          set(col.via, l.via);
          set(col.esecutore, l.esecutore);
          set(col.data, l.data_esecuzione);
          set(col.esito, l.esito);
          set(col.sigillo, l.sigillo);
          row.getCell(markerCol + 1).value = MARKER;
          fileReport.extraAggiunte++;
        }
      }

      if (!dryRun && (fileReport.aggiornate > 0 || fileReport.extraAggiunte > 0)) {
        backupFile(file, stamp);
        await salva(wb, file);
      }
    } catch (e) {
      fileReport.saltato = true;
      fileReport.errore = e instanceof Error ? e.message : String(e);
    }
    report.file.push(fileReport);
  }

  // extra di comuni senza file
  report.extraNonCollocate = trovaExtra(lavori, idConsumati)
    .filter((l) => !comuniConFile.has(norm(l.comune)))
    .map((l) => ({ id: l.id, comune: l.comune, matricola: l.matricola, esecutore: l.esecutore }));

  return report;
}

/** Scrive il report in <cartella>/_log/<stamp>.json. */
function scriviLog(cartella, stamp, report) {
  const dir = path.join(cartella, '_log');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const now = new Date();
  const oggi = now.toISOString().slice(0, 10);
  const { from, to } = finestra(oggi, cfg.finestraGiorni ?? 15);
  const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({ cartella: cfg.cartella, lavori, dryRun: !!cfg.dryRun, stamp });
  try {
    scriviLog(cfg.cartella, stamp, report);
  } catch (e) {
    console.error(`[lim-sync] impossibile scrivere il log: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`[${stamp}] lavori=${lavori.length} dryRun=${!!cfg.dryRun}`);
  console.log(JSON.stringify(report, null, 2));
}

// Esegui main() solo se invocato direttamente (non quando importato nei test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
