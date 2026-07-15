// tools/limitazioni-sync/lib/sincronizzazioneWatch.mjs
// Osservabilità del "clobber" di sync: rileva quando un master su cartella SharePoint
// (sincronizzata da OneDrive) è stato SOVRASCRITTO tra un giro dell'agente e il successivo.
//
// Motivo: i master condivisi (es. ZAGAROLO.xlsx) vengono aperti in Excel da più persone in
// ufficio. Quando un collega salva, la sua versione scende dal server e cancella la scrittura
// dell'agente. Il codice dell'agente scrive correttamente su disco, ma il lavoro va perso in
// SILENZIO. Questo helper registra mtime+size di ciò che l'agente scrive e, al giro dopo,
// segnala se il file è cambiato nel frattempo — così il report lo rende VISIBILE.
//
// Stato locale (NON nella cartella sincronizzata): tools/limitazioni-sync/.sync-watch.json.
// Il default è sovrascrivibile con la env LIMSYNC_WATCH_STATE (letta a ogni chiamata): la usa
// vitest.config.ts per puntare i test a uno stato temporaneo, così i test dei writer non
// inquinano (né azzerano per race) le baseline REALI — è già successo: run vitest del 14/07
// ha riempito lo stato reale di path fixture e perso la baseline di ZAGAROLO.xlsx.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.sync-watch.json');
const statePathDefault = () => process.env.LIMSYNC_WATCH_STATE || DEFAULT_STATE;

function leggiStato(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {}; // primo giro o file assente/illeggibile → nessuna baseline
  }
}

function salvaStato(statePath, stato) {
  try {
    // Scrittura ATOMICA (tmp + rename nella stessa cartella): un lettore concorrente non vede
    // mai un JSON mezzo scritto (la race leggiStato→{}→salvataggio azzerava le baseline).
    // Qui è lecita: questo è lo stato LOCALE dell'agente, non un master SharePoint (dove il
    // temp+rename è vietato perché genera copie di conflitto).
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(stato, null, 2), 'utf8');
    fs.renameSync(tmp, statePath);
  } catch {
    /* best-effort: l'osservabilità non deve mai far fallire un giro */
  }
}

/** mtime in ms interi + size del file, o null se non leggibile. */
function stat(masterPath) {
  try {
    const st = fs.statSync(masterPath);
    return { mtimeMs: Math.round(st.mtimeMs), size: st.size };
  } catch {
    return null;
  }
}

/**
 * Confronta lo stato attuale del master con l'ultima scrittura registrata dall'agente.
 * Va chiamato PRIMA che il writer sovrascriva il file (legge la versione ancora su disco).
 * @returns null se non c'è baseline o il file è invariato; altrimenti un avviso di clobber.
 *
 * ATTENZIONE a come si legge l'avviso: "il file è cambiato" NON significa "il lavoro dell'agente
 * è andato perso". Sono due scenari diversi e solo `mtimeIndietro` li separa (vedi sotto).
 */
export function verificaModificaEsterna(masterPath, { statePath = statePathDefault() } = {}) {
  const attuale = stat(masterPath);
  if (!attuale) return null;
  const prec = leggiStato(statePath)[masterPath];
  if (!prec) return null; // nessuna scrittura precedente da confrontare
  if (prec.mtimeMs === attuale.mtimeMs && prec.size === attuale.size) return null; // invariato

  return {
    masterPath,
    precedente: { mtimeMs: prec.mtimeMs, size: prec.size, stamp: prec.stamp ?? null },
    attuale: { mtimeMs: attuale.mtimeMs, size: attuale.size, mtimeIso: new Date(attuale.mtimeMs).toISOString() },
    // SharePoint normalizza gli mtime al secondo intero: un mtime .000 è quasi certamente
    // una versione ridiscesa dal server (clobber), non un edit locale.
    probabileServer: attuale.mtimeMs % 1000 === 0,
    // IL discriminante fra i due scenari, che il solo "è cambiato" confonde:
    //  - false → il file è stato risalvato DOPO la scrittura dell'agente: è l'ufficio che lavora sul
    //    master condiviso. Excel entra in co-authoring e FONDE cella per cella, le celle dell'agente
    //    sopravvivono. Verificato su DUNNING il 15/07: 28/28 celle vive dopo 3 salvataggi dell'ufficio,
    //    coi valori dell'agente traslati insieme alle righe inserite a mano. Fisiologico.
    //  - true → è ridisceso dal server un file PIÙ VECCHIO della scrittura dell'agente: le due versioni
    //    sono divergenti e il lavoro dell'agente rischia di non salire MAI (caso ZAGAROLO 14-15/07,
    //    sync "in sospeso" per 19h). Questo sì che va guardato: si riconcilia aprendo il file in Excel
    //    su questo PC (il co-authoring fonde) — mai spostando/cancellando il locale.
    mtimeIndietro: attuale.mtimeMs < prec.mtimeMs,
  };
}

/**
 * Racconta un avviso di clobber col livello giusto. Unico posto in cui si decide il testo, così i
 * due writer (giro cartella e giro ACEA) non possono divergere.
 *
 * Perché non è tutto un WARN: sul master condiviso l'ufficio salva di continuo in orario di lavoro,
 * e ogni salvataggio faceva gridare "SOVRASCRITTA" anche quando le celle dell'agente erano tutte
 * vive (misurato su DUNNING il 15/07: 28/28). Un allarme che grida al lupo a ogni salvataggio
 * legittimo si smette di leggerlo — e quello è l'unico allarme che copre la divergenza vera.
 */
export function segnalaClobber(nomeFile, avviso, log = console) {
  if (!avviso) return;
  const quando = avviso.attuale.mtimeIso;
  const dalServer = avviso.probabileServer ? ', versione dal server' : '';
  if (avviso.mtimeIndietro) {
    log.error(
      `[lim-sync] ⚠ ${nomeFile}: DIVERGENZA — è ricomparsa una versione PRECEDENTE alla scrittura` +
      ` dell'agente (ora mtime ${quando}${dalServer}). Il lavoro dell'agente rischia di non salire mai:` +
      ` apri il file in Excel su questo PC per farlo riconciliare (MAI spostarlo o cancellarlo).`,
    );
    return;
  }
  log.log(
    `[lim-sync] ${nomeFile}: risalvato da altri dopo la scrittura dell'agente (ora mtime ${quando}${dalServer}).` +
    ` Normale sul master condiviso: il co-authoring fonde le celle e il giro successivo riscrive comunque.`,
  );
}

/**
 * Registra mtime+size della versione appena scritta dall'agente, come baseline per il giro dopo.
 * Va chiamato SUBITO DOPO la scrittura del master. Best-effort: non lancia mai.
 */
export function registraScrittura(masterPath, { statePath = statePathDefault(), nowIso = new Date().toISOString() } = {}) {
  const attuale = stat(masterPath);
  if (!attuale) return;
  const stato = leggiStato(statePath);
  stato[masterPath] = { mtimeMs: attuale.mtimeMs, size: attuale.size, stamp: nowIso };
  salvaStato(statePath, stato);
}
