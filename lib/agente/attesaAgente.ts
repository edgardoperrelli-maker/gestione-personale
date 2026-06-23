// PURO: stato di presentazione dell'attesa di un'azione che passa dal tick dell'agente.
// Serve a "chi lancia" la richiesta: dispatchedAt = istante del click; finché il risultato non
// arriva la UI resta in 'attesa'; oltre sogliaStalloMin (se impostata) → 'stallo' (solo presentazione,
// il polling continua). Azioni lunghe (es. Assegna su ACEA) usano sogliaStalloMin = null.
export type StatoAttesa = 'idle' | 'attesa' | 'stallo';

export function statoAttesa(
  inAttesa: boolean,
  dispatchedAtMs: number | null,
  nowMs: number,
  sogliaStalloMin: number | null,
): { stato: StatoAttesa; minuti: number | null } {
  if (!inAttesa) return { stato: 'idle', minuti: null };
  if (dispatchedAtMs == null) return { stato: 'attesa', minuti: null };
  const minuti = Math.max(0, Math.floor((nowMs - dispatchedAtMs) / 60_000));
  if (sogliaStalloMin != null && minuti >= sogliaStalloMin) return { stato: 'stallo', minuti };
  return { stato: 'attesa', minuti };
}
