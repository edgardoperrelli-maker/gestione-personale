// tools/limitazioni-sync/lib/saluteSync.mjs
// Osservabilità: salute della sincronizzazione OneDrive sul PC dell'agente.
//
// Perché esiste: due incidenti reali in cui i master su SharePoint e la loro copia locale
// hanno divergito IN SILENZIO per settimane.
//   1. OneDrive spento → l'agente scriveva, ma i file restavano solo su disco.
//   2. 22/07/2026: un sync root "orfano" (cartella registrata in Explorer ma non più
//      sincronizzata dall'account) mostrava la commessa congelata a un mese prima, con
//      in più vecchie copie dei master scaricate in Download aperte dai Recenti di Excel.
// Questi controlli girano a ogni tick (costo ~1s: tasklist + 2 reg query + qualche readdir)
// e producono AVVISI testuali: console subito, report/feedback dell'app al primo giro.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Esegue un comando e ritorna stdout (utf8). Separata per poterla iniettare nei test. */
function execPredefinita(cmd) {
  return execSync(cmd, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Parser dell'output di `reg query ... /s`: righe chiave (HKEY_…) seguite dai valori
 *  "    Nome    REG_TIPO    dato". Le colonne sono separate da 3+ spazi: il NOME può
 *  contenere spazi singoli (nei Tenants il nome del valore È un path), il dato qualunque cosa. */
export function parseRegQuery(testo) {
  const chiavi = [];
  let corrente = null;
  for (const rigaRaw of String(testo ?? '').split(/\r?\n/)) {
    const riga = rigaRaw.trimEnd();
    if (!riga.trim()) continue;
    if (/^HKEY_/i.test(riga)) {
      corrente = { chiave: riga.trim(), valori: [] };
      chiavi.push(corrente);
      continue;
    }
    if (!corrente) continue;
    const m = riga.trim().match(/^(.*?)\s{3,}(REG_[A-Z_]+)(?:\s{3,}(.*))?$/);
    if (m) corrente.valori.push({ nome: m[1], tipo: m[2], dato: m[3] ?? '' });
  }
  return chiavi;
}

const normPath = (p) => String(p ?? '').replace(/[\\/]+$/, '').toLowerCase();
const normNs = (u) => String(u ?? '').replace(/\/+$/, '').toLowerCase();

/** Pura: dai fatti raccolti produce gli avvisi. Ogni avviso è una frase auto-contenuta
 *  pensata per il pannello agente (e per la console del PC-agente). */
export function analizzaSaluteSync({
  processoAttivo = null,      // boolean | null (null = non determinabile → silenzio)
  providers = [],             // sync root registrati in Explorer: { chiave, mountPoint, urlNamespace }
  mountAttivi = [],           // path DAVVERO sincronizzati dall'account (UserFolder + Tenants)
  esisteSuDisco = () => false,
  masters = [],               // nomi file .xlsx nella cartella di lavoro dell'agente
  downloads = [],             // nomi file nella cartella Download dell'utente
  oreSenzaLogEngine = null,   // età (ore) dell'ultimo log del motore di sync, null = ignota
  sogliaLogOre = 48,
} = {}) {
  const avvisi = [];

  if (processoAttivo === false) {
    avvisi.push(
      "OneDrive non è in esecuzione su questo PC: le scritture dell'agente restano solo locali "
      + 'e i file non ricevono gli aggiornamenti dal server. Riavviare OneDrive.',
    );
  }

  // Copie orfane: mount registrato in Explorer ma NON tra quelli attivi dell'account, ancora
  // presente su disco e che punta alla STESSA libreria di un mount attivo (una libreria
  // DIVERSA può essere una scorciatoia legittima → nessun allarme). Senza l'elenco dei mount
  // attivi il check si spegne: meglio nessun avviso che falsi allarmi a ogni tick.
  const attivi = new Set(mountAttivi.map(normPath));
  if (attivi.size > 0) {
    const nsAttivi = new Set(
      providers.filter((p) => attivi.has(normPath(p.mountPoint))).map((p) => normNs(p.urlNamespace)),
    );
    for (const p of providers) {
      const mp = p.mountPoint;
      if (!mp || attivi.has(normPath(mp))) continue;
      if (!nsAttivi.has(normNs(p.urlNamespace))) continue;
      let esiste = false;
      try { esiste = esisteSuDisco(mp); } catch { esiste = false; }
      if (!esiste) continue; // residuo già rimosso dal disco: inerte
      avvisi.push(
        `Copia locale scollegata dal server: "${mp}" non è più sincronizzata da OneDrive ma è la `
        + 'stessa libreria di una cartella attiva. Chi la apre vede dati VECCHI: eliminarla '
        + '(o ricollegarla da SharePoint con "Aggiungi collegamento a OneDrive").',
      );
    }
  }

  // Esche in Download: copie dei master scaricate a mano ("NOME.xlsx", "NOME (2).xlsx"):
  // aperte dai Recenti di Excel sembrano il master ma sono ferme al giorno del download.
  const nomiMaster = new Set(masters.map((m) => String(m).toLowerCase()));
  if (nomiMaster.size > 0) {
    for (const f of downloads) {
      if (!/\.xlsx$/i.test(f)) continue;
      const base = String(f).toLowerCase().replace(/\s*\(\d+\)(?=\.xlsx$)/, '');
      if (nomiMaster.has(base)) {
        avvisi.push(
          `Nella cartella Download c'è una copia di un file master ("${f}"): aprirla da lì mostra `
          + 'dati superati. Eliminarla e aprire il file dalla cartella sincronizzata.',
        );
      }
    }
  }

  // Motore fermo: processo vivo ma log di sync immobili da troppo. Proxy prudente (soglia
  // alta) del caso "OneDrive aperto ma incastrato": mai visto un motore sano zitto 2 giorni.
  if (processoAttivo === true && typeof oreSenzaLogEngine === 'number' && oreSenzaLogEngine > sogliaLogOre) {
    avvisi.push(
      `OneDrive è aperto ma il motore di sincronizzazione non scrive log da circa ${Math.round(oreSenzaLogEngine)} ore: `
      + "la sincronizzazione potrebbe essere bloccata (verificare l'icona OneDrive nella barra).",
    );
  }

  return avvisi;
}

/** Raccolta best-effort dei fatti + analisi. OGNI sonda è isolata nel suo try/catch e
 *  l'intera funzione non lancia mai: la salute è osservabilità, non deve MAI rompere il tick. */
export function controllaSaluteSync({
  cartella,
  execFn = execPredefinita,
  fsApi = fs,
  env = process.env,
  adessoMs = Date.now(),
  sogliaLogOre = 48,
} = {}) {
  try {
    let processoAttivo = null;
    try {
      processoAttivo = /onedrive\.exe/i.test(execFn('tasklist /FI "IMAGENAME eq OneDrive.exe" /NH'));
    } catch { processoAttivo = null; }

    let providers = [];
    try {
      providers = parseRegQuery(execFn('reg query "HKCU\\Software\\SyncEngines\\Providers\\OneDrive" /s'))
        .map((k) => ({
          chiave: k.chiave,
          mountPoint: k.valori.find((v) => v.nome === 'MountPoint')?.dato ?? '',
          urlNamespace: k.valori.find((v) => v.nome === 'UrlNamespace')?.dato ?? '',
        }))
        .filter((p) => p.mountPoint);
    } catch { providers = []; }

    let mountAttivi = [];
    try {
      for (const k of parseRegQuery(execFn('reg query "HKCU\\Software\\Microsoft\\OneDrive\\Accounts" /s'))) {
        for (const v of k.valori) {
          if (v.nome === 'UserFolder' && v.dato) mountAttivi.push(v.dato);
          // nei Tenants il NOME del valore è il path della libreria montata
          if (/\\Tenants\\/i.test(k.chiave) && /^[a-z]:\\/i.test(v.nome)) mountAttivi.push(v.nome);
        }
      }
    } catch { mountAttivi = []; }

    let masters = [];
    try {
      if (cartella && fsApi.existsSync(cartella)) {
        masters = fsApi.readdirSync(cartella).filter((f) => /\.xlsx$/i.test(f) && !String(f).startsWith('~$'));
      }
    } catch { masters = []; }

    let downloads = [];
    try {
      const dirDownload = env.USERPROFILE ? path.join(env.USERPROFILE, 'Downloads') : '';
      if (dirDownload && fsApi.existsSync(dirDownload)) downloads = fsApi.readdirSync(dirDownload);
    } catch { downloads = []; }

    let oreSenzaLogEngine = null;
    try {
      const dirLog = env.LOCALAPPDATA
        ? path.join(env.LOCALAPPDATA, 'Microsoft', 'OneDrive', 'logs', 'Business1')
        : '';
      if (dirLog && fsApi.existsSync(dirLog)) {
        let max = 0;
        for (const f of fsApi.readdirSync(dirLog)) {
          try {
            const s = fsApi.statSync(path.join(dirLog, f));
            if (s.mtimeMs > max) max = s.mtimeMs;
          } catch { /* singolo file illeggibile: ignora */ }
        }
        if (max > 0) oreSenzaLogEngine = (adessoMs - max) / 3_600_000;
      }
    } catch { oreSenzaLogEngine = null; }

    return analizzaSaluteSync({
      processoAttivo,
      providers,
      mountAttivi,
      esisteSuDisco: (p) => { try { return fsApi.existsSync(p); } catch { return false; } },
      masters,
      downloads,
      oreSenzaLogEngine,
      sogliaLogOre,
    });
  } catch {
    return [];
  }
}
