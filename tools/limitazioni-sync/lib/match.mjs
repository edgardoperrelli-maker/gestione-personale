// tools/limitazioni-sync/lib/match.mjs
// PURE: normalizzazione e aggancio tra le righe del file e i lavori dall'app.

/** Normalizza odl/matricola per il confronto: stringa, maiuscolo, senza spazi. */
export function norm(v) {
  return String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
}

/**
 * Confronta due lavori con la STESSA chiave (odl o comune|matricola) e ritorna il vincitore.
 * Regola: vince SEMPRE il positivo (esitoOk===true); a parità di esito vince la data più
 * recente; a parità piena tiene il primo (stabile). Così l'intervento positivo fatto oggi
 * batte il "No / nessun passaggio" del giorno prima, a prescindere dall'ordine di arrivo.
 */
export function vinceLavoro(a, b) {
  const pa = a?.esitoOk === true;
  const pb = b?.esitoOk === true;
  if (pa !== pb) return pa ? a : b; // positivo batte sempre non-positivo
  const da = String(a?.data_esecuzione ?? '');
  const db = String(b?.data_esecuzione ?? '');
  if (da !== db) return db > da ? b : a; // stesso esito: più recente
  return a; // parità piena: stabile
}

/**
 * Indice dei lavori per odl e per (comune|matricola).
 * A parità di chiave NON tiene l'ultimo inserito (fragile), ma il VINCITORE (vedi vinceLavoro).
 * `perdenti` = id dei lavori superati da un vincitore sulla stessa chiave: vanno pre-marcati
 * "consumati" così un perdente non riaffiora come riga extra.
 */
export function buildIndice(lavori) {
  const byOdl = new Map();
  const byComuneMatricola = new Map();
  const perdenti = new Set();
  const inserisci = (mappa, k, l) => {
    const cur = mappa.get(k);
    if (!cur) { mappa.set(k, l); return; }
    const vinc = vinceLavoro(cur, l);
    const perso = vinc === cur ? l : cur;
    if (perso?.id != null) perdenti.add(perso.id);
    mappa.set(k, vinc);
  };
  for (const l of lavori ?? []) {
    if (l.odl) inserisci(byOdl, norm(l.odl), l);
    if (l.matricola) inserisci(byComuneMatricola, norm(l.comune) + '|' + norm(l.matricola), l);
  }
  return { byOdl, byComuneMatricola, perdenti };
}

/** Aggancia una riga del file: prima per ODL, poi per matricola nel comune del file. */
export function agganciaRiga(rigaFile, indice, comuneFile) {
  const perOdl = rigaFile.odl ? indice.byOdl.get(norm(rigaFile.odl)) : undefined;
  if (perOdl) return { lavoro: perOdl, via: 'odl' };
  const perMat = rigaFile.matricola
    ? indice.byComuneMatricola.get(norm(comuneFile) + '|' + norm(rigaFile.matricola))
    : undefined;
  if (perMat) return { lavoro: perMat, via: 'matricola' };
  return null;
}

/** Extra = lavori manuali non ancora "consumati" da nessuna riga di alcun file. */
export function trovaExtra(lavori, idConsumati) {
  return (lavori ?? []).filter((l) => l.manuale && !idConsumati.has(l.id));
}
