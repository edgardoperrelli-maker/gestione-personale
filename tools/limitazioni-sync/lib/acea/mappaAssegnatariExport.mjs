// tools/limitazioni-sync/lib/acea/mappaAssegnatariExport.mjs
// PURO: dato l'export ACEA (righe { ordine, operatore }) costruisce la mappa odl→assegnatario e
// decide se un ODL è GIÀ assegnato alla risorsa giusta. Il confronto è per COGNOME INTERO (anche
// composto), coerente con cognomeDa di assegnaInterventi.mjs. Nessun side-effect, niente I/O.
import { norm } from '../match.mjs';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';

/** Cognome normalizzato: spazi compattati, maiuscolo. NON spezza al primo token, così il cognome
 *  composto resta intero ("DE SANTIS") e non si confonde con altri "DE ...". */
const cognome = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Due cognomi combaciano se uguali, o se uno è prefisso dell'altro su confine di parola: copre sia
 *  il cognome composto ("DE SANTIS") sia l'export che porta anche il nome ("SIKORA FRANCO" combacia
 *  con "SIKORA"). Su confine di parola per evitare falsi positivi tipo "DE LUCA" vs "DE SANTIS". */
function cognomiCombaciano(a, b) {
  if (!a || !b) return false;
  const piu = a.length >= b.length ? a : b;
  const meno = a.length >= b.length ? b : a;
  return piu === meno || piu.startsWith(meno + ' ');
}

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
  return cognomiCombaciano(cAtt, cVol);
}
