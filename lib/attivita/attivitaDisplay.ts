// PURA: forma di VISUALIZZAZIONE unificata di `intervento_tipo`.
// Collassa le famiglie di codici italgas al codice nudo (es. "S-PR-003 A" → "S-PR-003",
// "DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO" → "DIS00N") SOLO per la UI: lo storage e
// l'export conservano il dettaglio (import dal file committente + riconciliazione).
// Ogni altra descrizione (Dunning, Bonifiche, singoli S-AI-050/DIS001, …) resta invariata.

/** Le 11 famiglie di codici collassate a display (migration 20260722190000 / 20260723090000). */
const FAMIGLIE_CODICE_NUDO = new Set([
  'DIS00N', 'S-AI-022', 'S-MR-002', 'S-MR-003',
  'S-PR-001', 'S-PR-003', 'S-PR-004', 'S-PR-007', 'S-PR-009', 'S-PR-019', 'S-PR-077',
]);

/** Etichetta unificata per la UI: codice nudo per le famiglie collassate, testo invariato altrimenti. */
export function attivitaUnificataDisplay(interventoTipo: string | null | undefined): string {
  const s = String(interventoTipo ?? '').trim();
  if (!s) return s;
  const base = s.match(/^(DIS[0-9N]+|S-[A-Z]+-\d+)/i)?.[1]?.toUpperCase();
  return base && FAMIGLIE_CODICE_NUDO.has(base) ? base : s;
}
