// tools/limitazioni-sync/lib/statiOdl.mjs
// PURE: classificazione dello "stato odl"/"Stato Operazione" del master ACEA.
import { normNome } from './colonne.mjs';

/** Stati che indicano un ordine CHIUSO → escluso dalla pianificazione. */
export const STATI_CHIUSI = ['completato', 'annullato'];

/** Vero se la cella di stato contiene (per nome normalizzato) uno degli stati della lista. */
export function matchStato(cella, lista) {
  const c = normNome(cella);
  if (!c) return false;
  return (lista ?? []).some((s) => c.includes(normNome(s)));
}

/** Vero se lo stato indica un ordine chiuso (completato/annullato). */
export function isChiuso(cella, lista = STATI_CHIUSI) {
  return matchStato(cella, lista);
}
