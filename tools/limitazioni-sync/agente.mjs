// tools/limitazioni-sync/agente.mjs
// Orchestrazione: scarica i lavori -> per ogni file-master aggancia/scrive/aggiunge -> backup/salva -> log.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione, backupFile, salva } from './lib/excelIO.mjs';
import { rilevaColonne, colonnaMarker, risolviColonna } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { decidiScrittura } from './lib/scrittura.mjs';
import { decidiScritturaData } from './lib/dataCella.mjs';
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';
import { scanColonne } from './lib/scanColonne.mjs';
import { tick, inviaReport, baseUrlDaEndpoint } from './lib/apiAgente.mjs';

export const MARKER = 'AGGIUNTA APP';
export const MARKER_AUTOMAZIONE = 'SI';

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

/** Valore testuale dell'esito da scrivere, da esitoOk (true=positivo, false=negativo, null=non scrive). */
function valoreEsito(l, esitoPositivo, esitoNegativo) {
  if (l.esitoOk === true) return esitoPositivo;
  if (l.esitoOk === false) return esitoNegativo;
  return null; // non lavorato -> non scrive
}

/** Valore (non-esito, non-data) del campo mappato dal lavoro. */
function valoreCampo(l, campo) {
  switch (campo) {
    case 'esecutore': return l.esecutore;
    case 'sigillo': return l.sigillo;
    case 'matricola': return l.matricola;
    case 'via': return l.via;
    case 'pdr': return l.pdr;
    case 'nominativo': return l.nominativo;
    case 'comune': return l.comune;
    case 'saracinesca': return l.saracinesca;
    case 'note': return l.note;
    default: return null;
  }
}

export async function eseguiGiro({
  cartella, lavori, dryRun, stamp, mappatura, esitoPositivo, esitoNegativo,
}) {
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [] };
  const regole = (mappatura ?? []).filter((m) => m && m.abilitato);
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
      conflitti: [], colonneAssenti: [], righe: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) { report.file.push(fileReport); continue; } // non master -> ignora
      fileReport.master = true;

      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header); // SOLO aggancio (odl/matricola/comune/via)

      // risolvi una volta per file le colonne mappate (esclusa la regola marcatore).
      const colonneAssenti = new Set();
      const regoleScrittura = []; // { campo, idx }
      let regolaMarcatore = null;
      let regolaAutomazione = null;
      for (const regola of regole) {
        if (regola.campo === 'marcatore') { regolaMarcatore = regola; continue; }
        if (regola.campo === 'automazione') { regolaAutomazione = regola; continue; }
        const idx = risolviColonna(header, regola.colonna);
        if (idx < 0) { colonneAssenti.add(regola.colonna); continue; }
        regoleScrittura.push({ campo: regola.campo, idx });
      }
      fileReport.colonneAssenti = [...colonneAssenti];

      // indice della colonna marcatore (solo per le righe extra).
      let markerCol = -1;
      if (regolaMarcatore) {
        if (regolaMarcatore.auto) markerCol = colonnaMarker(header);
        else {
          markerCol = risolviColonna(header, regolaMarcatore.colonna);
          if (markerCol < 0) { colonneAssenti.add(regolaMarcatore.colonna); fileReport.colonneAssenti = [...colonneAssenti]; }
        }
      }

      // indice della colonna automazione: "SI" sulle righe che l'agente tocca (per nome).
      let automazioneCol = -1;
      if (regolaAutomazione) {
        automazioneCol = risolviColonna(header, regolaAutomazione.colonna);
        if (automazioneCol < 0) { colonneAssenti.add(regolaAutomazione.colonna); fileReport.colonneAssenti = [...colonneAssenti]; }
      }

      const comuneFile =
        (col.comune != null ? comunePrevalente(ws, rIntest, col.comune) : '') ||
        norm(path.basename(file, '.xlsx'));
      comuniConFile.add(comuneFile);

      // scrive una cella mappata di una riga (pianificata o extra). Ritorna true se ha toccato.
      const scriviCella = (row, regola, l) => {
        const cell = row.getCell(regola.idx + 1);
        if (regola.campo === 'data') {
          const d = decidiScritturaData(cell.value, l.data_esecuzione);
          if (d.azione === 'scrivi') { cell.value = d.valore; return true; }
          if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: row.number, campo: 'data', esistente: d.esistente, nuovo: l.data_esecuzione });
          }
          return false;
        }
        const valore = regola.campo === 'esito'
          ? valoreEsito(l, esitoPositivo, esitoNegativo)
          : valoreCampo(l, regola.campo);
        const d = decidiScrittura(cell.value, valore);
        if (d.azione === 'scrivi') { cell.value = d.valore; return true; }
        if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, campo: regola.campo, esistente: d.esistente, nuovo: d.valore });
        }
        return false;
      };

      // scrive "SI" nella colonna automazione (prudente: vuota->scrivi, uguale->salta, diversa->conflitto).
      const scriviAutomazione = (row) => {
        if (automazioneCol < 0) return;
        const cell = row.getCell(automazioneCol + 1);
        const d = decidiScrittura(cell.value, MARKER_AUTOMAZIONE);
        if (d.azione === 'scrivi') { cell.value = d.valore; }
        else if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, campo: 'automazione', esistente: d.esistente, nuovo: d.valore });
        }
      };

      // riga di dettaglio per lo storico: cosa ha toccato l'agente su questa riga.
      const rigaReport = (l, riga, tipo) => ({
        riga, tipo,
        comune: l.comune ?? '', odl: l.odl ?? '', matricola: l.matricola ?? '', via: l.via ?? '',
        esecutore: l.esecutore ?? '', esito: valoreEsito(l, esitoPositivo, esitoNegativo) ?? '',
        sigillo: l.sigillo ?? '', data: l.data_esecuzione ?? '',
        saracinesca: l.saracinesca ?? '', note: l.note ?? '',
      });

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);
        let toccata = false;
        for (const regola of regoleScrittura) {
          if (scriviCella(row, regola, hit.lavoro)) toccata = true;
        }
        if (toccata) {
          fileReport.aggiornate++;
          scriviAutomazione(row);
          fileReport.righe.push(rigaReport(hit.lavoro, row.number, 'aggiornata'));
        }
      }

      // 2) extra di questo comune (stessa logica/date-aware delle pianificate)
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      for (const l of extraComune) {
        idConsumati.add(l.id);
        const row = ws.addRow([]);
        // aggancio fields scritti sempre sulle righe extra (matricola e via per identificare la riga)
        if (col.matricola != null && l.matricola) row.getCell(col.matricola + 1).value = l.matricola;
        if (col.via != null && l.via) row.getCell(col.via + 1).value = l.via;
        // poi i campi mappati
        for (const regola of regoleScrittura) scriviCella(row, regola, l);
        // marcatore: solo extra, solo cella vuota.
        if (markerCol >= 0) {
          const mc = row.getCell(markerCol + 1);
          const d = decidiScrittura(mc.value, MARKER);
          if (d.azione === 'scrivi') mc.value = d.valore;
        }
        scriviAutomazione(row);
        fileReport.righe.push(rigaReport(l, row.number, 'extra'));
        fileReport.extraAggiunte++;
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

  // comuni dei lavori che non corrispondono a nessun file master (visibilità mismatch)
  report.comuniNonAgganciati = [...new Set(
    (lavori ?? []).map((l) => l.comune).filter(Boolean),
  )].filter((c) => !comuniConFile.has(norm(c)));

  return report;
}

/** Scrive il report in <cartella>/_log/<stamp>.json. */
function scriviLog(cartella, stamp, report) {
  const dir = path.join(cartella, '_log');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2), 'utf8');
}

/** Legge la data ISO dell'ultimo scan (YYYY-MM-DD) dal file stamp; null se assente. */
function leggiStampScan(cfgPath) {
  const stampPath = path.join(path.dirname(cfgPath), 'scanColonne.stamp');
  try {
    return fs.readFileSync(stampPath, 'utf8').trim().slice(0, 10);
  } catch {
    return null;
  }
}

/** Aggiorna il file stamp con la data odierna. */
function aggiornaStampScan(cfgPath, oggi) {
  const stampPath = path.join(path.dirname(cfgPath), 'scanColonne.stamp');
  fs.writeFileSync(stampPath, oggi, 'utf8');
}

async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const baseUrl = baseUrlDaEndpoint(cfg.endpointUrl);
  const oggi = new Date().toISOString().slice(0, 10);

  // 1) Throttle scan: apri i file Excel SOLO se e' un giorno nuovo (o primo avvio).
  //    Evita 24 aperture OneDrive al giorno sulle stesse intestazioni.
  const ultimoScan = leggiStampScan(cfgPath);
  const scanNeeded = ultimoScan !== oggi;

  let files = [];
  if (scanNeeded) {
    try {
      files = await scanColonne(cfg.cartella);
      aggiornaStampScan(cfgPath, oggi);
    } catch (e) {
      console.error(`[lim-sync] scanColonne fallito (best-effort): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 2) Heartbeat + invio colonne (vuote se non e' un giorno nuovo): l'app decide se girare.
  let ris = await tick({ baseUrl, exportKey: cfg.exportKey, files });

  // 2b) "Aggiorna tabella": l'app chiede un re-scan delle colonne e non abbiamo gia' scansionato oggi.
  if (ris.forzaScan && !scanNeeded) {
    try {
      files = await scanColonne(cfg.cartella);
      aggiornaStampScan(cfgPath, oggi);
      // secondo tick: upserta le colonne fresche; l'app azzera forza_scan.
      ris = await tick({ baseUrl, exportKey: cfg.exportKey, files });
      console.log(`[lim-sync] re-scan colonne forzato: ${files.length} file.`);
    } catch (e) {
      console.error(`[lim-sync] re-scan forzato fallito: ${e instanceof Error ? e.message : e}`);
    }
  }

  const { eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo } = ris;

  if (!eseguiOra) {
    console.log(`[lim-sync] tick: in attesa (eseguiOra=false). Scan: ${scanNeeded ? `${files.length} file` : 'throttled'}.`);
    return;
  }

  // 3) E' il momento: scarica i lavori della finestra ed esegui il giro.
  const now = new Date();
  const { from, to } = finestra(oggi, finestraGiorni ?? 15);
  const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({
    cartella: cfg.cartella, lavori, dryRun: !!dryRun, stamp,
    mappatura, esitoPositivo, esitoNegativo,
  });

  try {
    scriviLog(cfg.cartella, stamp, report);
  } catch (e) {
    console.error(`[lim-sync] impossibile scrivere il log: ${e instanceof Error ? e.message : e}`);
  }

  // 4) Feedback all'app.
  try {
    await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
  } catch (e) {
    console.error(`[lim-sync] inviaReport fallito: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`[${stamp}] lavori=${lavori.length} dryRun=${!!dryRun}`);
  console.log(JSON.stringify(report, null, 2));
}

// Esegui main() solo se invocato direttamente (non quando importato nei test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
