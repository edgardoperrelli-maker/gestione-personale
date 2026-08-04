// PURA: il filtro per riferimento di magazzino del registro misuratori.
//
// Il riferimento è UNO e si chiama CESTA: il contenitore numerato in cui i contatori smontati
// si scaricano e con cui la riconsegna al committente viaggia. Per qualche giorno ne sono
// esistiti due — cesta e pallet, come due gradini di un ciclo che il magazzino non fa — e
// queste funzioni prendevano il campo come parametro per non divergere. Fusi i due nomi
// (2026-08-04), il parametro è sparito con loro: un solo campo, nessuna scelta da passare.
//
// L'elenco dei valori esce dalle righe caricate — il registro si carica intero, quindi qui non
// c'è il problema della tendina bugiarda della tabella ACEA — e il filtro è client-side come
// quello di stato. «Senza» è un valore a sé: è la domanda vera dell'ufficio a fine giornata
// («cosa è ancora in furgone?»), non un caso degenere.

export type ConRiferimento = { cesta?: string | null };

/** Valore-sentinella del filtro «Senza cesta»: non può collidere con un riferimento scritto. */
export const SENZA_RIFERIMENTO = '__senza__';

const letto = (r: ConRiferimento): string => String(r.cesta ?? '').trim();

/** Le ceste distinte delle righe, ordinate da numeri quando lo sono tutte (1, 2, 10 — non 1, 10, 2). */
export function valoriRiferimento(righe: readonly ConRiferimento[]): string[] {
  const valori = new Set<string>();
  for (const r of righe) {
    const v = letto(r);
    if (v !== '') valori.add(v);
  }
  const elenco = [...valori];
  return elenco.every((v) => /^\d+$/.test(v))
    ? elenco.sort((a, b) => Number(a) - Number(b))
    : elenco.sort((a, b) => a.localeCompare(b, 'it'));
}

/** Le righe che passano il filtro ('' = tutte, SENZA_RIFERIMENTO = senza assegnazione). */
export function filtraPerRiferimento<T extends ConRiferimento>(
  righe: readonly T[],
  filtro: string,
): T[] {
  if (filtro === '') return [...righe];
  if (filtro === SENZA_RIFERIMENTO) return righe.filter((r) => letto(r) === '');
  return righe.filter((r) => letto(r) === filtro);
}
