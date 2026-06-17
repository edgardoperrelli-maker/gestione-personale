// tools/limitazioni-sync/lib/colonne.mjs
// PURE: rilevamento delle colonne del file ACEA per intestazione (robusto a spostamenti).

const ALIAS = {
  odl: ['ordine'],
  matricola: ['matricola'],
  via: ['indirizzo'],
  comune: ['località', 'localita'],
  esecutore: ['esecutore'],
  data: ['data prevista', 'data'],
  esito: ['esito'],
  sigillo: ['sigillo posato', 'sigillo'],
};

/** Norma robusta per nome-colonna: NFD (toglie accenti), NBSP->spazio, collapse spazi, trim, lowercase.
 *  Stessa funzione per lo scan dei menu e per la scrittura guidata dalla mappa. */
export function normNome(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const norm = normNome;

/** headerRow: array di valori della riga di intestazione. Ritorna { chiave: indice0based }. */
export function rilevaColonne(headerRow) {
  const cols = {};
  const cells = (headerRow ?? []).map(norm);
  for (const [chiave, alias] of Object.entries(ALIAS)) {
    let idx = -1;
    for (const a of alias) {
      idx = cells.indexOf(a);
      if (idx >= 0) break;
    }
    if (idx >= 0) cols[chiave] = idx;
  }
  return cols;
}

/** Un file e'“master limitazioni” se ha SOLO ORDINE+MATRICOLA
 *  (esito/sigillo ora sono campi mappabili). */
export function isFileMaster(headerRow) {
  const c = rilevaColonne(headerRow);
  return ['odl', 'matricola'].every((k) => k in c);
}

/** Indice 0-based della colonna con intestazione = nome (per normNome, primo match); -1 se assente. */
export function risolviColonna(headers, nome) {
  const target = normNome(nome);
  if (!target) return -1;
  const cells = (headers ?? []).map(normNome);
  return cells.indexOf(target);
}

/** Indice (0-based) della colonna marcatore: prima colonna con intestazione
 *  vuota dopo l'ultima colonna nota; fallback = lunghezza riga (nuova colonna in coda). */
export function colonnaMarker(headerRow) {
  const cells = (headerRow ?? []).map(norm);
  const noti = rilevaColonne(headerRow);
  const valori = Object.values(noti);
  const maxNoto = valori.length ? Math.max(...valori) : -1;
  for (let i = maxNoto + 1; i < cells.length; i++) {
    if (cells[i] === '') return i;
  }
  return cells.length;
}
