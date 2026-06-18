import { addGiorni } from './scadenza';

/** Ordina date YYYY-MM-DD: oggi primo, poi futuri asc, poi passati desc. */
export function ordinaGiorni(giorni: string[], oggi: string): string[] {
  const futuri = giorni.filter((g) => g > oggi).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const passati = giorni.filter((g) => g < oggi).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const haOggi = giorni.filter((g) => g === oggi);
  return [...haOggi, ...futuri, ...passati];
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
