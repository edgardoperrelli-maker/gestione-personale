export type StatoPresa = {
  /** Testo "In gestione: …" o null se libera. */
  etichetta: string | null;
  miaPresa: boolean;
  presaDaAltro: boolean;
  mostraPrendi: boolean;
  mostraRilascia: boolean;
  mostraOverride: boolean;
};

/**
 * PURA: deriva etichetta e visibilità dei pulsanti per la presa in carico.
 * @param presoDa  uuid admin che la gestisce, o null
 * @param userId   uuid admin corrente
 * @param nomi     mappa uuid→nome admin (per mostrare il nome invece dell'uuid)
 */
export function statoPresaInCarico(
  presoDa: string | null,
  userId: string,
  nomi: Record<string, string>,
): StatoPresa {
  if (!presoDa) {
    return { etichetta: null, miaPresa: false, presaDaAltro: false, mostraPrendi: true, mostraRilascia: false, mostraOverride: false };
  }
  if (presoDa === userId) {
    return { etichetta: 'In gestione: tu', miaPresa: true, presaDaAltro: false, mostraPrendi: false, mostraRilascia: true, mostraOverride: false };
  }
  const nome = nomi[presoDa] ?? 'un altro operatore';
  return { etichetta: `In gestione: ${nome}`, miaPresa: false, presaDaAltro: true, mostraPrendi: false, mostraRilascia: false, mostraOverride: true };
}
