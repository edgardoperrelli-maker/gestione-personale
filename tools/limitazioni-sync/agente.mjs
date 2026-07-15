// tools/limitazioni-sync/agente.mjs
// Orchestrazione: scarica i lavori -> per ogni file-master aggancia/scrive/aggiunge -> backup/salva -> log.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione, backupFile } from './lib/excelIO.mjs';
import { applicaModificheXlsx } from './lib/acea/applicaModificheXlsx.mjs';
import { verificaModificaEsterna, registraScrittura } from './lib/sincronizzazioneWatch.mjs';
import { rilevaColonne, colonnaMarker, risolviColonna } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { TUTTI, normalizzaComune, filtraFilePerComune } from './lib/comuni.mjs';
// niente Playwright qui: risolviMaster tocca solo fs/path (eseguiGiroAcea resta a import dinamico).
import { risolviMaster, elencoMasterMassive } from './lib/acea/risolviMaster.mjs';
import { decidiScrittura, cellaEsitoNegativa, cellaEsitoDaSovrascrivere } from './lib/scrittura.mjs';
import { decidiScritturaData, giornoDa, aDataExcel } from './lib/dataCella.mjs';
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';
import { scanColonne } from './lib/scanColonne.mjs';
import { tick, inviaReport, inviaPianificabili, baseUrlDaEndpoint } from './lib/apiAgente.mjs';
import { estraiPianificabili } from './lib/pianificabili.mjs';
import { mappaRigheMaster, trovaIntestazioneAcea } from './lib/acea/leggiMasterAcea.mjs';
import { mappaMasterSnapshot } from './lib/acea/masterSnapshot.mjs';

export const MARKER = 'AGGIUNTA APP';
export const MARKER_AUTOMAZIONE = 'SI';

// Colonne riscritte in blocco quando `forza` scatta (la data ha il suo ramo dedicato in scriviCella).
// Upgrade POSITIVO → l'intervento a file viene sostituito per intero: anche esecutore/sigillo/
// saracinesca seguono il lavoro vincente (es. negativo di CIARALLO 01/07 → positivo di PASTORELLI
// 14/07: tutti i dati devono diventare quelli del positivo). Refresh NEGATIVO → solo esito/note:
// le colonne compilate a mano restano protette.
const CAMPI_FORZA_POSITIVO = new Set(['esito', 'note', 'esecutore', 'sigillo', 'saracinesca']);
const CAMPI_FORZA_NEGATIVO = new Set(['esito', 'note']);

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

/** Foglio "master" del workbook: il primo i cui header (entro le prime righe) sono riconosciuti
 *  come master (ORDINE+MATRICOLA). Robusto a fogli pivot/extra messi DAVANTI al master
 *  (es. una tabella pivot salvata come primo foglio del file). Fallback: il primo foglio. */
function foglioMaster(wb) {
  for (const ws of wb.worksheets) {
    if (trovaRigaIntestazione(ws) >= 0) return ws;
  }
  return wb.worksheets[0];
}

export async function eseguiGiro({
  cartella, lavori, dryRun, stamp, mappatura, esitoPositivo, esitoNegativo, comune,
}) {
  const comuneFiltro = normalizzaComune(comune);
  const filtroAttivo = comuneFiltro !== TUTTI;
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [], comune: comuneFiltro };
  const regole = (mappatura ?? []).filter((m) => m && m.abilitato);
  const indice = buildIndice(lavori);
  // i perdenti per chiave (es. il "No" superato dal positivo) non devono riaffiorare come extra
  const idConsumati = new Set(indice.perdenti);
  const comuniConFile = new Set();

  if (!fs.existsSync(cartella)) {
    report.erroreGlobale = `Cartella non trovata: ${cartella}`;
    return report;
  }

  // Filtro comune: vale SOLO per il lancio manuale ("Esegui ora" con un comune scelto). Il giro
  // schedulato non lo passa → TUTTI i comuni, come da sempre.
  const files = filtraFilePerComune(
    fs
      .readdirSync(cartella)
      .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
      .map((f) => path.join(cartella, f)),
    comuneFiltro,
  );
  if (filtroAttivo && files.length === 0) {
    report.erroreGlobale = `Nessun file master per il comune "${comuneFiltro}" in ${cartella}`;
    return report;
  }

  for (const file of files) {
    const fileReport = {
      file: path.basename(file), master: false, aggiornate: 0, extraAggiunte: 0,
      conflitti: [], colonneAssenti: [], righe: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = foglioMaster(wb);
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

      // change-set per la scrittura CHIRURGICA (al posto di salva() exceljs, che corrompe l'xlsx
      // e perde l'AutoFiltro). Ogni scrittura sotto viene registrata; a fine file si applica con
      // applicaModificheXlsx. Righe oltre maxRigaOriginale = righe nuove (extra) → append.
      const modifiche = [];
      const maxRigaOriginale = ws.rowCount;
      // indice matricola → riga ORIGINALE del file (prima occorrenza). Serve a NON duplicare un
      // intervento manuale la cui matricola è già fisicamente presente nel file (anche se quella
      // riga è stata agganciata per ODL ad un ALTRO lavoro): in quel caso si scrive sulla riga
      // esistente invece di aggiungerne una nuova.
      const righePerMatricola = new Map();
      const registra = (row, idx, valore) => {
        modifiche.push({ riga: row.number, col: idx, valore, tipo: valore instanceof Date ? 'date' : 'str' });
      };

      // scrive una cella mappata di una riga (pianificata o extra). Ritorna true se ha toccato.
      // ritorna { scritto, eraPieno }: scritto=ha riempito la cella; eraPieno=la cella aveva già un valore (compilato a mano).
      // forza=true → riscrive le colonne del set CAMPI_FORZA_* (vedi in testa al modulo):
      //   upgrade POSITIVO → TUTTI i dati di lavorazione (esito, note→pulita, esecutore, sigillo,
      //   saracinesca) + data (ramo dedicato sotto): la riga deve diventare quella del positivo;
      //   refresh NEGATIVO → solo esito/note/data, le altre colonne a mano restano protette.
      const scriviCella = (row, regola, l, forza = false, refreshData = false) => {
        const cell = row.getCell(regola.idx + 1);
        const eraPieno = String(cell.value ?? '').trim() !== '';
        if (regola.campo === 'data') {
          // Refresh data: sulle righe DELL'AGENTE (refreshData) o in upgrade (forza) la data del
          // file deve riflettere la data di ESECUZIONE, sovrascrivendo l'eventuale data PIANIFICATA
          // già presente (es. 26/06 pianificata vs 24/06 eseguita). Idempotente: riscrive SOLO se
          // il GIORNO cambia, così i giri ripetuti non producono write/conflitti/marcatori inutili.
          // refresh:true → è una correzione, NON entra nel marcatore (vedi sito di chiamata).
          if (forza || refreshData) {
            const g = giornoDa(l.data_esecuzione);
            if (!g) return { scritto: false, eraPieno };
            if (giornoDa(cell.value) === g) return { scritto: false, eraPieno };
            const dv = aDataExcel(g);
            cell.value = dv;
            registra(row, regola.idx, dv);
            return { scritto: true, eraPieno, refresh: true };
          }
          const d = decidiScritturaData(cell.value, l.data_esecuzione);
          if (d.azione === 'scrivi') { cell.value = d.valore; registra(row, regola.idx, d.valore); return { scritto: true, eraPieno }; }
          if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: row.number, odl: l.odl ?? '', matricola: l.matricola ?? '', via: l.via ?? '', campo: 'data', esistente: d.esistente, nuovo: l.data_esecuzione });
          }
          return { scritto: false, eraPieno };
        }
        const valore = regola.campo === 'esito'
          ? valoreEsito(l, esitoPositivo, esitoNegativo)
          : valoreCampo(l, regola.campo);
        // set dei campi forzati in base all'esito del lavoro (positivo=tutto, negativo=esito/note).
        // Idempotente: se la cella è GIÀ uguale al valore forzato non riscrive (niente write/backup a
        // vuoto sui giri ripetuti; essenziale nel refresh negativo→negativo, dove l'esito resta "No").
        const campiForza = l.esitoOk === true ? CAMPI_FORZA_POSITIVO : CAMPI_FORZA_NEGATIVO;
        if (forza && campiForza.has(regola.campo)) {
          const v = valore == null ? '' : String(valore).trim();
          // Solo la NOTA viene svuotata quando il vincente non ha valore (la nota del negativo
          // non deve restare sul positivo). Per gli altri campi un valore VUOTO non cancella il
          // dato a file (es. positivo senza sigillo: il sigillo compilato a mano resta).
          if (v === '' && regola.campo !== 'note') return { scritto: false, eraPieno };
          const nv = v === '' ? null : v;
          if (String(cell.value ?? '').trim() === v) return { scritto: false, eraPieno };
          cell.value = nv;
          registra(row, regola.idx, nv);
          return { scritto: v !== '', eraPieno }; // cella svuotata → non conta nel marcatore
        }
        const d = decidiScrittura(cell.value, valore);
        if (d.azione === 'scrivi') { cell.value = d.valore; registra(row, regola.idx, d.valore); return { scritto: true, eraPieno }; }
        if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, odl: l.odl ?? '', matricola: l.matricola ?? '', via: l.via ?? '', campo: regola.campo, esistente: d.esistente, nuovo: d.valore });
        }
        return { scritto: false, eraPieno };
      };

      // scrive il marcatore nella colonna automazione (prudente: vuota->scrivi, uguale->salta, diversa->conflitto).
      const scriviAutomazione = (row, valore, l, forza = false) => {
        if (automazioneCol < 0) return;
        const cell = row.getCell(automazioneCol + 1);
        if (forza) { cell.value = valore; registra(row, automazioneCol, valore); return; }
        const d = decidiScrittura(cell.value, valore);
        if (d.azione === 'scrivi') { cell.value = d.valore; registra(row, automazioneCol, d.valore); }
        else if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, odl: l?.odl ?? '', matricola: l?.matricola ?? '', via: l?.via ?? '', campo: 'automazione', esistente: d.esistente, nuovo: d.valore });
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

      // colonne esito/note/esecutore/sigillo/saracinesca (per rilevare l'upgrade e tracciare ciò che viene sovrascritto)
      const regolaEsito = regoleScrittura.find((r) => r.campo === 'esito');
      const regolaNote = regoleScrittura.find((r) => r.campo === 'note');
      const regolaEsecutore = regoleScrittura.find((r) => r.campo === 'esecutore');
      const regolaSigillo = regoleScrittura.find((r) => r.campo === 'sigillo');
      const regolaSaracinesca = regoleScrittura.find((r) => r.campo === 'saracinesca');
      const testoCella = (riga, regola) => (regola ? String(riga.getCell(regola.idx + 1).value ?? '').trim() : '');

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (matricola) {
          const k = norm(matricola);
          if (k && !righePerMatricola.has(k)) righePerMatricola.set(k, row);
        }
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);

        // forza = sovrascrittura dei campi CAMPI_FORZA_* + data. Scatta in base all'esito del lavoro:
        //   • POSITIVO → vince SEMPRE: sovrascrive QUALSIASI esito già a file diverso dal positivo
        //     (il "No" canonico ma anche un testo libero scritto a mano, es. "NO PASSAGGIO"), anche
        //     su righe a mano, e riscrive TUTTI i dati di lavorazione (esito/note/data + esecutore/
        //     sigillo/saracinesca): la riga deve diventare quella del positivo. Cella esito vuota →
        //     policy normale riempi-vuote.
        //   • NEGATIVO → è il VINCITORE di chiave, cioè il più recente (vedi vinceLavoro); sovrascrive SOLO
        //     un negativo canonico ("No") più vecchio già a file, e solo esito/note/data: più negativi
        //     sullo stesso intervento senza un positivo → conta solo il più recente. Testi liberi/positivi
        //     a file e le altre colonne a mano NON vengono mai toccati da un negativo.
        const autoEsistente = automazioneCol >= 0 ? String(row.getCell(automazioneCol + 1).value ?? '').trim() : '';
        const rigaDellAgente = autoEsistente !== '';
        const esitoCella = regolaEsito ? row.getCell(regolaEsito.idx + 1).value : null;
        const forza = hit.lavoro.esitoOk === true
          ? cellaEsitoDaSovrascrivere(esitoCella, esitoPositivo)
          : hit.lavoro.esitoOk === false && cellaEsitoNegativa(esitoCella, esitoNegativo);

        // traccia ciò che l'upgrade sovrascrive (per storico/eventuale ripristino), letto PRIMA della scrittura
        const upgradePositivo = forza && hit.lavoro.esitoOk === true;
        const esitoPrecedente = forza ? String(esitoCella ?? '').trim() : '';
        const notaPrecedente = forza ? testoCella(row, regolaNote) : '';
        const esecutorePrecedente = upgradePositivo ? testoCella(row, regolaEsecutore) : '';
        const sigilloPrecedente = upgradePositivo ? testoCella(row, regolaSigillo) : '';
        const saracinescaPrecedente = upgradePositivo ? testoCella(row, regolaSaracinesca) : '';

        // Sulle righe DELL'AGENTE la data segue l'esecuzione (sovrascrive la pianificata), MA
        // solo se data ed esito vengono dalla STESSA esecuzione. Se la riga conserva un esito a
        // file (es. "eseguito") DIVERSO da quello del lavoro agganciato (es. un NEGATIVO acea
        // agganciato per ODL), l'esito resta in conflitto/preservato: NON spostare la data al
        // negativo, altrimenti resterebbe "eseguito" con la data del ricontrollo (riga fantasma).
        const esitoCellaTxt = String(esitoCella ?? '').trim().toUpperCase();
        const esitoNuovoTxt = String(valoreEsito(hit.lavoro, esitoPositivo, esitoNegativo) ?? '').trim().toUpperCase();
        const esitoInConflitto = !forza && esitoCellaTxt !== '' && esitoNuovoTxt !== '' && esitoCellaTxt !== esitoNuovoTxt;
        const refreshData = rigaDellAgente && !esitoInConflitto;

        let toccata = false;
        const completate = []; // intestazioni delle colonne scritte dall'agente
        let pieneAMano = 0;    // quante colonne mappate erano già compilate a mano
        let soloRefresh = false; // ha rinfrescato la data ma senza nuove colonne completate
        for (const regola of regoleScrittura) {
          const { scritto, eraPieno, refresh } = scriviCella(row, regola, hit.lavoro, forza, refreshData);
          if (scritto) {
            toccata = true;
            // il refresh-data è una correzione: non è una "colonna completata", non entra nel marcatore
            if (refresh) soloRefresh = true;
            else completate.push(String(header[regola.idx] ?? regola.colonna));
          }
          if (eraPieno && !refresh) pieneAMano++;
        }
        if (toccata) {
          fileReport.aggiornate++;
          // marcatore = "<SI|PARZIALE> + <colonne scritte>". L'upgrade è un refresh completo
          // dell'agente sulla SUA riga → sempre "SI" (mai PARZIALE).
          const parziale = !forza && pieneAMano > 0;
          // Ricompone il marcatore SOLO se ci sono NUOVE colonne completate: un puro refresh della
          // data su una riga già dell'agente non deve riscrivere né azzerare il marcatore esistente.
          if (completate.length > 0) {
            const valoreAuto = `${parziale ? 'PARZIALE' : 'SI'} + ${completate.join(' + ')}`;
            scriviAutomazione(row, valoreAuto, hit.lavoro, forza);
          }
          const tipo = forza
            ? (hit.lavoro.esitoOk === true ? 'upgrade' : 'refresh-negativo')
            : (completate.length === 0 && soloRefresh ? 'refresh-data' : (parziale ? 'parziale' : 'aggiornata'));
          const rep = rigaReport(hit.lavoro, row.number, tipo);
          if (forza) { rep.esitoPrecedente = esitoPrecedente; rep.notaPrecedente = notaPrecedente; }
          if (upgradePositivo) {
            rep.esecutorePrecedente = esecutorePrecedente;
            rep.sigilloPrecedente = sigilloPrecedente;
            rep.saracinescaPrecedente = saracinescaPrecedente;
          }
          fileReport.righe.push(rep);
        }
      }

      // 2) extra di questo comune (stessa logica/date-aware delle pianificate)
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      for (const l of extraComune) {
        idConsumati.add(l.id);

        // ANTI-DUPLICATO: se la matricola è già una riga del file, NON aggiungere una riga nuova
        // (era il bug del "doppio intervento": un manuale senza ODL appeso accanto alla riga che
        // ha già quella matricola + un ODL). Si scrive sulla riga esistente con la solita policy.
        const rigaEsistente = l.matricola ? righePerMatricola.get(norm(l.matricola)) : null;
        if (rigaEsistente) {
          // REGOLA: il positivo SOVRASCRIVE SEMPRE qualsiasi esito non-positivo già a file (mai il
          // contrario) e riscrive TUTTI i dati di lavorazione (CAMPI_FORZA_POSITIVO + data); in
          // assenza di positivo, il negativo più recente (vincitore di chiave) sovrascrive SOLO
          // un negativo canonico più vecchio già a file, limitato a esito/note/data.
          // Come sul ramo pianificato: vale anche su righe a mano.
          const esitoCella = regolaEsito ? rigaEsistente.getCell(regolaEsito.idx + 1).value : null;
          const forza = l.esitoOk === true
            ? cellaEsitoDaSovrascrivere(esitoCella, esitoPositivo)
            : l.esitoOk === false && cellaEsitoNegativa(esitoCella, esitoNegativo);
          const upgradePositivo = forza && l.esitoOk === true;
          const esitoPrecedente = forza ? String(esitoCella ?? '').trim() : '';
          const notaPrecedente = forza ? testoCella(rigaEsistente, regolaNote) : '';
          const esecutorePrecedente = upgradePositivo ? testoCella(rigaEsistente, regolaEsecutore) : '';
          const sigilloPrecedente = upgradePositivo ? testoCella(rigaEsistente, regolaSigillo) : '';
          const saracinescaPrecedente = upgradePositivo ? testoCella(rigaEsistente, regolaSaracinesca) : '';

          let toccata = false;
          const completate = [];
          for (const regola of regoleScrittura) {
            const { scritto } = scriviCella(rigaEsistente, regola, l, forza);
            if (scritto) { toccata = true; completate.push(String(header[regola.idx] ?? regola.colonna)); }
          }
          if (toccata) {
            if (completate.length > 0) {
              scriviAutomazione(rigaEsistente, `SI + ${completate.join(' + ')}`, l, forza);
            }
            fileReport.aggiornate++;
          }
          const rep = rigaReport(l, rigaEsistente.number, forza ? (l.esitoOk === true ? 'upgrade' : 'refresh-negativo') : 'extra-esistente');
          if (forza) { rep.esitoPrecedente = esitoPrecedente; rep.notaPrecedente = notaPrecedente; }
          if (upgradePositivo) {
            rep.esecutorePrecedente = esecutorePrecedente;
            rep.sigilloPrecedente = sigilloPrecedente;
            rep.saracinescaPrecedente = saracinescaPrecedente;
          }
          fileReport.righe.push(rep);
          continue;
        }

        const row = ws.addRow([]);
        // aggancio fields scritti sempre sulle righe extra (matricola e via per identificare la riga)
        if (col.matricola != null && l.matricola) { row.getCell(col.matricola + 1).value = l.matricola; registra(row, col.matricola, l.matricola); }
        if (col.via != null && l.via) { row.getCell(col.via + 1).value = l.via; registra(row, col.via, l.via); }
        // poi i campi mappati (riga nuova: tutto completato dall'agente)
        const completateExtra = [];
        for (const regola of regoleScrittura) {
          const { scritto } = scriviCella(row, regola, l);
          if (scritto) completateExtra.push(String(header[regola.idx] ?? regola.colonna));
        }
        // marcatore: solo extra, solo cella vuota.
        if (markerCol >= 0) {
          const mc = row.getCell(markerCol + 1);
          const d = decidiScrittura(mc.value, MARKER);
          if (d.azione === 'scrivi') { mc.value = d.valore; registra(row, markerCol, d.valore); }
        }
        scriviAutomazione(row, completateExtra.length > 0 ? `SI + ${completateExtra.join(' + ')}` : MARKER_AUTOMAZIONE, l);
        fileReport.righe.push(rigaReport(l, row.number, 'extra'));
        fileReport.extraAggiunte++;
      }

      if (!dryRun && (fileReport.aggiornate > 0 || fileReport.extraAggiunte > 0)) {
        // Osservabilità: il file è cambiato tra l'ultima scrittura dell'agente e ora? (clobber SharePoint)
        // Va letto PRIMA di sovrascrivere. Best-effort: non deve mai bloccare la scrittura.
        const avvisoClobber = verificaModificaEsterna(file);
        if (avvisoClobber) {
          fileReport.clobberPrecedente = avvisoClobber;
          console.error(`[lim-sync] ⚠ ${path.basename(file)}: la scrittura precedente dell'agente è stata SOVRASCRITTA` +
            ` (ora mtime ${avvisoClobber.attuale.mtimeIso}${avvisoClobber.probabileServer ? ', versione dal server' : ''}).` +
            ` Probabile file aperto/salvato da altri su SharePoint.`);
        }
        backupFile(file, stamp);
        // scrittura CHIRURGICA: applica il change-set senza ri-serializzare tutto il file.
        const aggiornamenti = modifiche.filter((m) => m.riga <= maxRigaOriginale);
        const perNuova = new Map();
        for (const m of modifiche) {
          if (m.riga <= maxRigaOriginale) continue;
          if (!perNuova.has(m.riga)) perNuova.set(m.riga, []);
          perNuova.get(m.riga).push({ col: m.col, valore: m.valore, tipo: m.tipo });
        }
        const nuoveRighe = [...perNuova.keys()].sort((a, b) => a - b).map((k) => perNuova.get(k));
        await applicaModificheXlsx(file, { foglio: ws.name, aggiornamenti, nuoveRighe });
        // registra la versione appena scritta come baseline per il prossimo giro.
        registraScrittura(file, { nowIso: new Date().toISOString() });
      }
    } catch (e) {
      fileReport.saltato = true;
      fileReport.errore = e instanceof Error ? e.message : String(e);
    }
    report.file.push(fileReport);
  }

  // Con un filtro comune attivo questi due campi vanno valutati SOLO sui lavori dei comuni lavorati:
  // altrimenti il report griderebbe che tutti gli ALTRI comuni non hanno un file master, quando
  // semplicemente non li abbiamo lavorati. (I lavori restano tutti: l'aggancio per ODL deve poter
  // pescare anche righe col comune scritto male, es. "ZAGAROLA".)
  const lavoriValutabili = filtroAttivo
    ? (lavori ?? []).filter((l) => comuniConFile.has(norm(l.comune)))
    : (lavori ?? []);

  // extra di comuni senza file
  report.extraNonCollocate = trovaExtra(lavoriValutabili, idConsumati)
    .filter((l) => !comuniConFile.has(norm(l.comune)))
    .map((l) => ({ id: l.id, comune: l.comune, matricola: l.matricola, esecutore: l.esecutore }));

  // comuni dei lavori che non corrispondono a nessun file master (visibilità mismatch)
  report.comuniNonAgganciati = [...new Set(
    lavoriValutabili.map((l) => l.comune).filter(Boolean),
  )].filter((c) => !comuniConFile.has(norm(c)));

  return report;
}

/** Scrive il report in <cartella>/_log/<stamp>.json. */
function scriviLog(cartella, stamp, report) {
  const dir = path.join(cartella, '_log');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2), 'utf8');
}

/** Legge dai file master le righe pianificabili del giorno e le invia all'app (no scrittura). */
async function leggiPianificabili({ baseUrl, exportKey, cartella, dataTarget }) {
  if (!fs.existsSync(cartella)) return;
  const files = fs.readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));
  for (const file of files) {
    try {
      const wb = await caricaWorkbook(file);
      const ws = foglioMaster(wb);
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) continue; // non master
      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header); // {odl,matricola,via,comune,esecutore,data,esito}
      const grezze = [];
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const cell = (i) => (i != null ? row.getCell(i + 1).value : null);
        grezze.push({
          riga: r,
          odl: cell(col.odl), matricola: cell(col.matricola),
          indirizzo: cell(col.via), comune: cell(col.comune), esecutore: cell(col.esecutore),
          dataRaw: cell(col.data), esitoRaw: cell(col.esito),
        });
      }
      const righe = estraiPianificabili(grezze, dataTarget);
      await inviaPianificabili({ baseUrl, exportKey, file: path.basename(file), data: dataTarget, righe });
      console.log(`[lim-sync] pianificabili ${path.basename(file)} ${dataTarget}: ${righe.length} righe.`);
    } catch (e) {
      console.error(`[lim-sync] leggiPianificabili ${path.basename(file)} fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** Legge le righe grezze di un master ACEA (colonne esplicite dal config). [] se assente. */
async function leggiGrezzeMaster(acea) {
  if (!acea?.masterPath || !fs.existsSync(acea.masterPath)) return [];
  const wb = await caricaWorkbook(acea.masterPath);
  const ws = acea.foglio ? (wb.getWorksheet(acea.foglio) ?? wb.worksheets[0]) : wb.worksheets[0];
  // Legge tutte le righe una volta e trova l'header per NOME colonna (Ordine), NON per isFileMaster:
  // nel DUNNING la matricola è "Matricola misuratore" e isFileMaster fallirebbe (header vuoto).
  const tutte = [];
  for (let r = 1; r <= ws.rowCount; r++) tutte.push((ws.getRow(r).values || []).slice(1));
  const colonne = {
    odl: acea.masterColonnaOdl, esecutore: acea.masterColonnaEsecutore, data: acea.masterColonnaData,
    matricola: acea.masterColonnaMatricola, indirizzo: acea.masterColonnaIndirizzo, comune: acea.masterColonnaComune,
    attivita: acea.masterColonnaAttivita, // colonna "Operazione testo breve" (B): attività specifica per riga
    stato: acea.masterColonnaStato,
    esito: acea.masterColonnaEsito, // ZAGAROLO "esito"
    saracinesca: acea.masterColonnaSaracinesca, // ZAGAROLO "saracinesca"
    odlSaracinesca: acea.masterColonnaOdlSaracinesca, // ZAGAROLO "Odl saracinesca"
  };
  const rIntest = trovaIntestazioneAcea(tutte, acea.masterColonnaOdl);
  const header = tutte[rIntest - 1] || [];
  const matrix = tutte.slice(rIntest);
  return mappaRigheMaster(matrix, header, colonne, rIntest + 1);
}

/** Invia all'app lo snapshot del master per l'audit a tre vie (acea_master_snapshot). Best-effort.
 *  Riusato per DUNNING e ZAGAROLO (limitazioni massive): foto corrente di TUTTE le righe del master. */
async function inviaMasterSnapshot({ baseUrl, exportKey, acea }) {
  if (!acea?.masterPath || !fs.existsSync(acea.masterPath)) return;
  try {
    const masterSnapshot = mappaMasterSnapshot(await leggiGrezzeMaster(acea));
    if (masterSnapshot.length === 0) return;
    await inviaReport({
      baseUrl, exportKey,
      report: { tipo: 'acea-master', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], masterSnapshot },
    });
  } catch (e) {
    console.error(`[lim-sync] invio masterSnapshot fallito: ${e instanceof Error ? e.message : e}`);
  }
}

/** Legge il master DUNNING (acea.masterPath) per colonne esplicite e invia le righe pianificabili. */
async function leggiMasterAceaDunning({ baseUrl, exportKey, acea, dataTarget }) {
  if (!acea?.masterPath || !fs.existsSync(acea.masterPath)) return;
  try {
    const grezze = await leggiGrezzeMaster(acea);
    const righe = estraiPianificabili(grezze, dataTarget);
    const file = path.basename(acea.masterPath);
    await inviaPianificabili({ baseUrl, exportKey, file, data: dataTarget, righe });
    console.log(`[lim-sync] pianificabili ACEA ${file} ${dataTarget}: ${righe.length} righe.`);

    // Snapshot MASTER per l'audit a tre vie della Produzione economica (riusa la stessa lettura).
    try {
      await inviaReport({
        baseUrl,
        exportKey,
        report: { tipo: 'acea-master', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], masterSnapshot: mappaMasterSnapshot(grezze) },
      });
    } catch (eSnap) {
      console.error(`[lim-sync] invio masterSnapshot fallito: ${eSnap instanceof Error ? eSnap.message : eSnap}`);
    }
  } catch (e) {
    console.error(`[lim-sync] leggiMasterAceaDunning fallito: ${e instanceof Error ? e.message : e}`);
  }
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
  //    La DECISIONE (eseguiOra) viene SOLO da questo tick: il forza_giro e' gia' consumato qui.
  const ris = await tick({ baseUrl, exportKey: cfg.exportKey, files });

  // 2b) "Aggiorna tabella": l'app chiede un re-scan e non abbiamo gia' scansionato oggi.
  //     Un SECONDO tick consegna SOLO le colonne fresche (l'app azzera forza_scan); NON deve
  //     toccare la decisione del primo tick, altrimenti "mangia" un giro forzato da Esegui ora.
  if (ris.forzaScan && !scanNeeded) {
    try {
      const colonne = await scanColonne(cfg.cartella);
      aggiornaStampScan(cfgPath, oggi);
      await tick({ baseUrl, exportKey: cfg.exportKey, files: colonne });
      console.log(`[lim-sync] re-scan colonne forzato: ${colonne.length} file.`);
    } catch (e) {
      console.error(`[lim-sync] re-scan forzato fallito: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Lettura "Assegnazione AI": l'app chiede di leggere un giorno specifico (one-shot).
  if (ris.pianificaData) {
    await leggiPianificabili({ baseUrl, exportKey: cfg.exportKey, cartella: cfg.cartella, dataTarget: ris.pianificaData });
    // master DUNNING (cartella diversa, colonne esplicite): letto solo se configurato.
    if (cfg.acea?.masterPath) {
      await leggiMasterAceaDunning({ baseUrl, exportKey: cfg.exportKey, acea: cfg.acea, dataTarget: ris.pianificaData });
    }
  }

  // Giro ACEA on-demand: indipendente da eseguiOra. Playwright caricato solo qui (import dinamico).
  if (ris.aceaStato) {
    const now = new Date();
    const aceaTarget = ris.aceaTarget ?? 'dunning';
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-' + aceaTarget;
    try {
      const { eseguiGiroAcea } = await import('./lib/acea/eseguiGiroAcea.mjs');
      const report = await eseguiGiroAcea({ cfg, stamp, target: aceaTarget, baseUrl, exportKey: cfg.exportKey });
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      // Il target può valere PIÙ master (es. 'TUTTI'): i conteggi si sommano su tutti i file scritti.
      const masterScritti = report.file ?? [];
      const aggiornateTot = masterScritti.reduce((s, f) => s + (f.aggiornate ?? 0), 0);
      console.log(`[lim-sync] giro ACEA (${aceaTarget}): master=${masterScritti.length} aggiornate=${aggiornateTot} saracinesca=${report.saracinescaScritte ?? 0} da-chiedere=${report.daChiedere ?? 0} non-agganciate=${report.extraNonCollocate?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
      // Snapshot MASTER di OGNI master del target (audit a tre vie): DUNNING o i comuni delle massive.
      // L'app fa upsert per ODL, quindi più snapshot in sequenza non si sovrascrivono a vicenda.
      for (const { a } of risolviMaster({ acea: cfg.acea, target: aceaTarget, elencoFile: elencoMasterMassive(cfg.cartella) })) {
        await inviaMasterSnapshot({ baseUrl, exportKey: cfg.exportKey, acea: a });
      }
    } catch (e) {
      console.error(`[lim-sync] giro ACEA fallito: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Giro ASSEGNAZIONE su ACEA on-demand: indipendente da eseguiOra. Playwright via import dinamico.
  if (ris.aceaAssegna && ris.aceaAssegnaData) {
    const now = new Date();
    const dryRun = ris.aceaAssegnaDry !== false;
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-assegna';
    try {
      const { eseguiGiroAceaAssegna } = await import('./lib/acea/eseguiGiroAceaAssegna.mjs');
      const report = await eseguiGiroAceaAssegna({
        cfg, stamp, data: ris.aceaAssegnaData, dryRun,
        baseUrl, exportKey: cfg.exportKey,
      });
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      const nProc = report.righe?.length ?? 0;
      const etichetta = dryRun ? `simulate=${nProc}` : `assegnate=${report.file?.[0]?.aggiornate ?? 0}`;
      console.log(`[lim-sync] giro ACEA assegna (${dryRun ? 'PROVA' : 'REALE'}) ${ris.aceaAssegnaData}: ${etichetta} scartate=${report.scartati?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
    } catch (e) {
      console.error(`[lim-sync] giro ACEA assegna fallito: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Giro "Leggi SAL" on-demand: indipendente da eseguiOra. Nessun Playwright (solo lettura file
  // dalla cartella CONTABILITA').
  if (ris.aceaSal) {
    const now = new Date();
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-sal';
    try {
      const { leggiSal } = await import('./lib/acea/leggiSal.mjs');
      const salFiles = await leggiSal(cfg.acea?.salPath ?? '');
      const report = { tipo: 'acea-sal', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], salFiles };
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      const righeTot = salFiles.reduce((s, f) => s + f.righe.length, 0);
      console.log(`[lim-sync] giro Leggi SAL: file=${salFiles.length} righe=${righeTot}`);
    } catch (e) {
      console.error(`[lim-sync] giro Leggi SAL fallito: ${e instanceof Error ? e.message : e}`);
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
    // scelto nella UI accanto a "Esegui ora"; assente sul giro schedulato → tutti i comuni.
    comune: ris.syncComune,
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
