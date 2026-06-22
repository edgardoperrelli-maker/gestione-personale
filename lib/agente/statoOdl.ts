// lib/agente/statoOdl.ts
// PURO: classificazione dello "stato odl" ACEA per decidere l'assegnabilità su ACEA.

/** Stati ordine NON assegnabili su ACEA → esclusi dalla lista passata al driver. */
export const STATI_NON_ASSEGNABILI = ['completo', 'da richiedere'];

function normStato(s: string | null | undefined): string {
  // NFD + strip accenti (coerente con normNome lato agente, spec §3); \s copre l'NBSP.
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Vero se la cella di stato contiene (per nome normalizzato) uno degli stati della lista. */
export function matchStato(cella: string | null | undefined, lista: readonly string[]): boolean {
  const c = normStato(cella);
  if (!c) return false;
  return lista.some((s) => c.includes(normStato(s)));
}

/** Vero se l'ordine NON è assegnabile su ACEA (completo / da richiedere). */
export function isNonAssegnabile(cella: string | null | undefined, lista: readonly string[] = STATI_NON_ASSEGNABILI): boolean {
  return matchStato(cella, lista);
}
