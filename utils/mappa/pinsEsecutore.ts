// utils/mappa/pinsEsecutore.ts
// Alla riapertura di un piano salvato l'app deve "ricordare" gli assegnatari: ogni task resta
// inchiodato al suo operatore (pin esecutore), così "Distribuisci/Assegna" non ridistribuisce i
// task già assegnati e l'assegnazione resta fedele al master/file. Puro: niente effetti.

/** Mappa ogni task della distribuzione al suo operatore: { taskId: staffId }. */
export function pinsFromDistribution(
  distribution: Array<{ staffId: string; tasks?: Array<{ id: string }> }>,
): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const d of distribution ?? []) {
    if (!d?.staffId) continue;
    for (const t of d.tasks ?? []) {
      if (t?.id) pins[t.id] = d.staffId;
    }
  }
  return pins;
}
