import type { CensitoMisuratore } from './autofillAnagrafica';
import { decidiRicercaMisuratore, type EsitoRicercaMisuratore } from './ricercaMisuratore';

export type EsitoCensimentoLocale = EsitoRicercaMisuratore;

/**
 * Ricerca OFFLINE nella cache del censimento, specchio della logica server di
 * /cerca-limitazione: la regola è la stessa e sta in `decidiRicercaMisuratore` — un esatto
 * compila, più esatti (matricole troncate dall'export) si fanno scegliere, nessuno propone i
 * simili. Pura: nessun accesso a rete/IndexedDB.
 */
export function cercaCensimentoLocale(q: string, righe: CensitoMisuratore[]): EsitoCensimentoLocale {
  return decidiRicercaMisuratore(q, righe);
}
