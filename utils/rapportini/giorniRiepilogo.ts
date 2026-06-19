import { addGiorni } from './scadenza';

/** Ordina date YYYY-MM-DD in ordine DECRESCENTE (giorni più recenti/futuri in cima).
 *  Così una pianificazione per un giorno futuro appare SOPRA, senza incastrarsi tra oggi e ieri.
 *  (Il parametro `oggi` resta per compatibilità coi chiamanti; le etichette Oggi/Ieri/Domani
 *   sono gestite a parte da `etichettaRelativaGiorno`.) */
export function ordinaGiorni(giorni: string[], _oggi?: string): string[] {
  return [...giorni].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** 'oggi' | 'domani' | 'ieri' | null rispetto a `oggi` (YYYY-MM-DD). */
export function etichettaRelativaGiorno(
  data: string,
  oggi: string,
): 'oggi' | 'domani' | 'ieri' | null {
  if (data === oggi) return 'oggi';
  if (data === addGiorni(oggi, 1)) return 'domani';
  if (data === addGiorni(oggi, -1)) return 'ieri';
  return null;
}
