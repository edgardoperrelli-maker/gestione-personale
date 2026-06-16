import { matricoleSimili } from './matricoleSimili';
import type { CensitoMisuratore } from './autofillAnagrafica';

export type EsitoCensimentoLocale =
  | { trovato: true; misuratore: CensitoMisuratore }
  | { trovato: false; suggerimenti: CensitoMisuratore[] };

/**
 * Ricerca OFFLINE nella cache del censimento, specchio della logica server di
 * /cerca-limitazione: match ESATTO sulla matricola → trovato; altrimenti i simili
 * (riusa `matricoleSimili`). Pura: nessun accesso a rete/IndexedDB.
 */
export function cercaCensimentoLocale(q: string, righe: CensitoMisuratore[]): EsitoCensimentoLocale {
  const v = q.trim();
  if (!v) return { trovato: false, suggerimenti: [] };
  const esatto = righe.find((r) => r.matricola === v);
  if (esatto) return { trovato: true, misuratore: esatto };
  return { trovato: false, suggerimenti: matricoleSimili(v, righe, 8) };
}
