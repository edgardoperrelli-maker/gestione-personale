// tools/limitazioni-sync/lib/match.mjs
// PURE: normalizzazione e aggancio tra le righe del file e i lavori dall'app.

/** Normalizza odl/matricola per il confronto: stringa, maiuscolo, senza spazi. */
export function norm(v) {
  return String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
}

/** Indice dei lavori per odl e per (comune|matricola). */
export function buildIndice(lavori) {
  const byOdl = new Map();
  const byComuneMatricola = new Map();
  for (const l of lavori ?? []) {
    if (l.odl) {
      const k = norm(l.odl);
      if (byOdl.has(k)) console.warn(`[lim-sync] ODL duplicata nell'indice: ${l.odl}`);
      byOdl.set(k, l);
    }
    if (l.matricola) {
      const k = norm(l.comune) + '|' + norm(l.matricola);
      if (byComuneMatricola.has(k)) console.warn(`[lim-sync] matricola duplicata nell'indice: ${l.comune}|${l.matricola}`);
      byComuneMatricola.set(k, l);
    }
  }
  return { byOdl, byComuneMatricola };
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
