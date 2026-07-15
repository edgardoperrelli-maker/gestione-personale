// tools/limitazioni-sync/lib/acea/risolviMaster.mjs
// Quali master l'export ACEA deve aggiornare, dato il target scelto dall'app.
// L'export/login/ricerca sono CONDIVISI: un solo giro Playwright, N master su cui riversarlo.
import fs from 'node:fs';
import path from 'node:path';
import { comuneDaFile, filtraFilePerComune } from '../comuni.mjs';

/** I master delle limitazioni massive = gli .xlsx della cartella (esclusi i temporanei di Excel). */
export function elencoMasterMassive(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  return fs
    .readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .sort()
    .map((f) => path.join(cartella, f));
}

/**
 * Master su cui riversare l'export, in base al target:
 *  - 'dunning' (o vuoto) → il master DUNNING: config `acea` radice, come da sempre.
 *  - '<COMUNE>'          → <cartella>/<COMUNE>.xlsx con le colonne del blocco `acea.massive`.
 *  - 'TUTTI'             → tutti i master della cartella limitazioni massive.
 *
 * Retro-compatibile: se il config porta ancora un blocco per-comune col suo masterPath
 * (es. `acea.zagarolo`, com'era prima del selettore) quel blocco VINCE e il comportamento
 * resta identico — un config non aggiornato non rompe l'agente.
 *
 * Ritorna [{ comune, a }] dove `a` è la config effettiva del master (radice + override).
 * Lista vuota = nessun master per quel target: il chiamante deve segnalarlo, MAI degradare
 * a "tutti" (un refuso scriverebbe su ogni master invece che su nessuno).
 */
export function risolviMaster({ acea, target, elencoFile }) {
  const t = String(target ?? 'dunning').trim();
  if (t === '' || t.toLowerCase() === 'dunning') return [{ comune: 'DUNNING', a: acea }];

  const legacy = acea?.[t.toLowerCase()];
  if (legacy && typeof legacy === 'object' && legacy.masterPath) {
    return [{ comune: comuneDaFile(legacy.masterPath), a: { ...acea, ...legacy } }];
  }

  const base = { ...acea, ...(acea?.massive ?? acea?.zagarolo ?? {}) };
  return filtraFilePerComune(elencoFile ?? [], t).map((f) => ({
    comune: comuneDaFile(f),
    a: { ...base, masterPath: f },
  }));
}
