// lib/agente/territorioRiepilogo.ts
// Territorio "macro" da usare nel Riepilogo rapportini.
//
// I piani creati dall'Assegnazione AI sono uno PER COMUNE (territorio del piano =
// nome del comune, es. ZAGAROLO/ROMA/CAVE), perché l'assegnazione lavora a livello
// di comune. A livello operativo (pianificazione) il comune è l'informazione giusta,
// ma nel Riepilogo l'ufficio ragiona per MACRO-territorio (ACEA, FIRENZE, …).
// Oggi l'Assegnazione AI produce solo piani del flusso ACEA → si raggruppano tutti
// sotto "ACEA". Se in futuro l'AI gestirà altri appalti, qui andrà mappato file→macro.

export const TERRITORIO_MACRO_AI = 'ACEA';

export function territorioRiepilogo(opts: {
  aiCreato: boolean;
  pianoTerritorio: string | null;
}): string | null {
  if (opts.aiCreato) return TERRITORIO_MACRO_AI;
  return opts.pianoTerritorio ?? null;
}
