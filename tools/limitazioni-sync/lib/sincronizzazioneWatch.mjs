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
  };
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
