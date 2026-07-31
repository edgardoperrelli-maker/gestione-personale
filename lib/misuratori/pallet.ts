// PURA: il filtro per pallet del registro misuratori.
//
// Il pallet è un riferimento scritto dall'ufficio («3», «PLT-3», «2026-08/1»): l'elenco dei
// valori esce dalle righe caricate — il registro si carica intero, quindi qui non c'è il
// problema della tendina bugiarda della tabella ACEA — e il filtro è client-side come quello
// di stato. «Senza pallet» è un valore a sé: è la domanda vera dell'ufficio a fine giornata
// («cosa è ancora in cesta?»), non un caso degenere.

export type ConPallet = { pallet?: string | null };

/** Valore-sentinella del filtro «Senza pallet»: non può collidere con un numero scritto. */
export const SENZA_PALLET = '__senza__';

/** I pallet distinti delle righe, ordinati da numeri quando lo sono tutti (1, 2, 10 — non 1, 10, 2). */
export function valoriPallet(righe: readonly ConPallet[]): string[] {
  const valori = new Set<string>();
  for (const r of righe) {
    const v = String(r.pallet ?? '').trim();
    if (v !== '') valori.add(v);
  }
  const elenco = [...valori];
  return elenco.every((v) => /^\d+$/.test(v))
    ? elenco.sort((a, b) => Number(a) - Number(b))
    : elenco.sort((a, b) => a.localeCompare(b, 'it'));
}

/** Le righe che passano il filtro pallet ('' = tutte, SENZA_PALLET = senza assegnazione). */
export function filtraPerPallet<T extends ConPallet>(righe: readonly T[], filtro: string): T[] {
  if (filtro === '') return [...righe];
  if (filtro === SENZA_PALLET) {
    return righe.filter((r) => String(r.pallet ?? '').trim() === '');
  }
  return righe.filter((r) => String(r.pallet ?? '').trim() === filtro);
}
