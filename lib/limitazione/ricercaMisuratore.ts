// lib/limitazione/ricercaMisuratore.ts
// PURA: la REGOLA con cui una matricola cercata diventa «trovato» o «forse intendevi».
//
// Vive in un posto solo perché la stessa decisione la prendono in due: il server
// (`/api/r/[token]/cerca-limitazione`) e il campo offline (`cercaCensimentoLocale`, sulla cache
// del censimento). Due copie della regola sarebbero due comportamenti diversi a seconda del
// segnale — e il segnale, in campo, non è una scelta.

import type { CensitoMisuratore } from './autofillAnagrafica';
import { matricoleSimili, normMatricola } from './matricoleSimili';

export type EsitoRicercaMisuratore =
  | { trovato: true; misuratore: CensitoMisuratore }
  /** `ambigui`: i suggerimenti SONO la matricola cercata, su ordini diversi — si sceglie
   *  l'indirizzo, non si corregge un refuso. Cambia la frase che l'operatore legge. */
  | { trovato: false; ambigui: boolean; suggerimenti: CensitoMisuratore[] };

/** I candidati la cui matricola è ESATTAMENTE quella cercata (maiuscole e trattini indifferenti). */
export function esattiPerMatricola(
  q: string,
  candidati: readonly CensitoMisuratore[],
): CensitoMisuratore[] {
  const n = normMatricola(q);
  if (n === '') return [];
  return candidati.filter((c) => normMatricola(c.matricola) === n);
}

/**
 * L'esito della ricerca su un insieme di candidati.
 *
 * UN esatto → trovato, e il "+" nasce compilato (ODL compreso: è tutto il punto).
 *
 * PIÙ esatti → NON trovato: i candidati diventano i suggerimenti, e sceglie l'operatore. È il caso
 * delle matricole troncate dall'export — cinque ordini di RIANO condividono lo stesso troncone
 * `SETA07122500517` a cinque indirizzi diversi. Sceglierne uno noi vorrebbe dire scrivere un ODL
 * a caso su un lavoro fatto: l'indirizzo lo sa chi è sul posto, e il suggerimento glielo mostra.
 *
 * Nessun esatto → i simili, con la vicinanza già ordinata da `matricoleSimili` (che riconosce
 * anche il troncone: il valore del registro è un prefisso di quello letto sul contatore).
 */
export function decidiRicercaMisuratore(
  q: string,
  candidati: readonly CensitoMisuratore[],
  max = 8,
): EsitoRicercaMisuratore {
  const v = q.trim();
  if (!v) return { trovato: false, ambigui: false, suggerimenti: [] };
  const esatti = esattiPerMatricola(v, candidati);
  if (esatti.length === 1) return { trovato: true, misuratore: esatti[0] };
  if (esatti.length > 1) return { trovato: false, ambigui: true, suggerimenti: esatti.slice(0, max) };
  return { trovato: false, ambigui: false, suggerimenti: matricoleSimili(v, [...candidati], max) };
}

/** Identità di un censito fra fonti diverse: l'ODL, o la matricola quando l'ODL non c'è. */
export const chiaveCensito = (m: CensitoMisuratore): string =>
  String(m.odl ?? '').trim() || `matricola:${normMatricola(m.matricola)}`;

/** Unione ordinata senza doppioni: a parità di ODL vince chi arriva prima. */
export function unisciCensiti(...gruppi: readonly (readonly CensitoMisuratore[])[]): CensitoMisuratore[] {
  const viste = new Set<string>();
  const out: CensitoMisuratore[] = [];
  for (const g of gruppi) {
    for (const m of g) {
      const k = chiaveCensito(m);
      if (viste.has(k)) continue;
      viste.add(k);
      out.push(m);
    }
  }
  return out;
}

/**
 * La stessa decisione con DUE fonti: una VIVA (il registro `acea_ordini`, che si aggiorna a ogni
 * import) e una CONGELATA (`limitazione_misuratori_ref`, i master SharePoint dell'agente, fermi a
 * ZAGAROLO e LABICO).
 *
 * Se la viva ha l'esatto, decide lei: la congelata non entra nemmeno in ballottaggio. Non è una
 * preferenza di stile — su 59 matricole con un ordine ancora APERTO nel registro l'ODL del master
 * è un altro numero, e unire le due fonti trasformerebbe quei misuratori in «due esatti», cioè
 * un'ambiguità inventata da noi su contatori che oggi si trovano al primo colpo. Il numero di
 * adesso è quello della fonte viva; l'altra serve dove la viva non arriva — ed è quello il ramo
 * in cui si uniscono.
 */
export function decidiConFonteViva(
  q: string,
  viva: readonly CensitoMisuratore[],
  congelata: readonly CensitoMisuratore[],
  max = 8,
): EsitoRicercaMisuratore {
  const candidati = esattiPerMatricola(q, viva).length > 0 ? [...viva] : unisciCensiti(viva, congelata);
  return decidiRicercaMisuratore(q, candidati, max);
}
