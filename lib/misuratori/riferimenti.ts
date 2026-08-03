// PURA: i filtri per riferimento di magazzino del registro misuratori.
//
// I riferimenti sono DUE, e sono i due gradini del ciclo fisico: la CESTA in cui l'operatore
// scarica il contatore la sera, e il PALLET su cui la cesta finisce quando è piena. Stessa
// natura — un riferimento scritto a mano («3», «PLT-3», «2026-08/1»), non una quantità —
// quindi stesse regole di elenco e di filtro, con il campo come parametro. Erano funzioni sole
// per il pallet: duplicarle per la cesta avrebbe fatto divergere due gemelle alla prima
// modifica.
//
// L'elenco dei valori esce dalle righe caricate — il registro si carica intero, quindi qui non
// c'è il problema della tendina bugiarda della tabella ACEA — e il filtro è client-side come
// quello di stato. «Senza» è un valore a sé: è la domanda vera dell'ufficio a fine giornata
// («cosa è ancora in furgone?», «cosa è ancora in cesta?»), non un caso degenere.

/** I due riferimenti di magazzino, in ordine di ciclo fisico. */
export type CampoRiferimento = 'cesta' | 'pallet';

export type ConRiferimento = { cesta?: string | null; pallet?: string | null };

/** Valore-sentinella del filtro «Senza …»: non può collidere con un riferimento scritto. */
export const SENZA_RIFERIMENTO = '__senza__';

const letto = (r: ConRiferimento, campo: CampoRiferimento): string => String(r[campo] ?? '').trim();

/** I riferimenti distinti delle righe, ordinati da numeri quando lo sono tutti (1, 2, 10 — non 1, 10, 2). */
export function valoriRiferimento(
  righe: readonly ConRiferimento[],
  campo: CampoRiferimento = 'pallet',
): string[] {
  const valori = new Set<string>();
  for (const r of righe) {
    const v = letto(r, campo);
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
  campo: CampoRiferimento = 'pallet',
): T[] {
  if (filtro === '') return [...righe];
  if (filtro === SENZA_RIFERIMENTO) return righe.filter((r) => letto(r, campo) === '');
  return righe.filter((r) => letto(r, campo) === filtro);
}
