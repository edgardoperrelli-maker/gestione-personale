// tools/limitazioni-sync/lib/pianificabili.mjs
// PURE: filtra le righe del file "pianificabili" (data target + esecutore presente + esito vuoto).
import { giornoDa } from './dataCella.mjs';

const t = (v) => String(v ?? '').trim();

export function estraiPianificabili(righe, dataTarget) {
  const target = giornoDa(dataTarget) || t(dataTarget);
  const out = [];
  for (const r of righe ?? []) {
    const data = giornoDa(r.dataRaw);
    if (!data || data !== target) continue;
    if (!t(r.esecutore)) continue;
    if (t(r.esitoRaw)) continue;
    out.push({
      riga: r.riga,
      odl: t(r.odl), matricola: t(r.matricola), indirizzo: t(r.indirizzo),
      comune: t(r.comune), data, esecutore: t(r.esecutore),
    });
  }
  return out;
}
