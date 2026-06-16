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

const norm = (s) => String(s ?? '').trim().toLowerCase();

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

/** Un file è "master limitazioni" solo se ha la firma minima di colonne. */
export function isFileMaster(headerRow) {
  const c = rilevaColonne(headerRow);
  return ['odl', 'matricola', 'esito', 'sigillo'].every((k) => k in c);
}

/** Indice (0-based) della colonna marcatore "AGGIUNTA APP": prima colonna con intestazione
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
