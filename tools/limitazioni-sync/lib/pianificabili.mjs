// tools/limitazioni-sync/lib/pianificabili.mjs
// PURE: filtra le righe del giorno (data target + esecutore presente + esito vuoto + stato non chiuso)
// e propaga `statoOdl` per il filtro di assegnazione a valle.
import { giornoDa } from './dataCella.mjs';
import { isChiuso } from './statiOdl.mjs';

const t = (v) => String(v ?? '').trim();

export function estraiPianificabili(righe, dataTarget) {
  const target = giornoDa(dataTarget) || t(dataTarget);
  const out = [];
  for (const r of righe ?? []) {
    const data = giornoDa(r.dataRaw);
    if (!data || data !== target) continue;
    if (!t(r.esecutore)) continue;
    if (t(r.esitoRaw)) continue;
    if (isChiuso(r.statoRaw)) continue; // ordine chiuso (completato/annullato) → non pianificabile
    out.push({
      riga: r.riga,
      odl: t(r.odl), matricola: t(r.matricola), indirizzo: t(r.indirizzo),
      comune: t(r.comune), data, esecutore: t(r.esecutore),
      attivita: t(r.attivita), // attività per riga → sale fino al rapportino (override del DUNNING)
      statoOdl: t(r.statoRaw),
    });
  }
  return out;
}
