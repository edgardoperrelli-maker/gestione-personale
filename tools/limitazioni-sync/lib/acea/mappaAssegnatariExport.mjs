// tools/limitazioni-sync/lib/acea/mappaAssegnatariExport.mjs
// PURO: dato l'export ACEA (righe { ordine, operatore }) costruisce la mappa odl→assegnatario e
// decide se un ODL è GIÀ assegnato alla risorsa giusta. Il confronto è per COGNOME (primo token),
// coerente col driver (assegnaInterventi seleziona per cognome). Nessun side-effect, niente I/O.
import { norm } from '../match.mjs';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';

/** Cognome = primo token, in maiuscolo. */
const cognome = (s) => String(s ?? '').trim().split(/\s+/)[0].toUpperCase();

/** Map<odl(norm), operatoreGrezzo> dalle righe export. Salta righe senza odl o senza operatore;
 *  a parità di ODL tiene la prima (stabile). */
export function costruisciMappaAssegnatari(righeExport) {
  const m = new Map();
  for (const r of righeExport ?? []) {
    const odl = norm(r?.ordine);
    const op = String(r?.operatore ?? '').trim();
    if (!odl || !op) continue;
    if (!m.has(odl)) m.set(odl, op);
  }
  return m;
}

/** true se, secondo l'export, l'ODL è già assegnato alla STESSA risorsa che vogliamo (per cognome). */
export function preassegnatoGiusto(odl, operatoreVoluto, mappa, operatoriCfg) {
  if (!mappa) return false;
  const attuale = mappa.get(norm(odl));
  if (!attuale) return false;
  const cAtt = cognome(risolviNomeOperatore(attuale, operatoriCfg));
  const cVol = cognome(risolviNomeOperatore(operatoreVoluto, operatoriCfg));
  return !!cAtt && cAtt === cVol;
}
