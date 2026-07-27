// lib/acea/famiglia.ts
// PURA: famiglia di commessa a partire da "Tipo di ordine" dell'export ACEA.
//
// Sostituisce il filtro manuale che oggi si fa in Excel per separare le attività di dunning da
// quelle delle limitazioni massive. La classificazione è deterministica (verificata sull'export):
//
//   ASTR  Manutenzione Straordinaria   2.759 righe  → massive (Limitazione Massiva + saracinesche)
//   ALIM  Limitazione Flusso           1.423        → dunning
//   AMOR  Interventi per morosità        625        → dunning
//   ARMO  Ripristino da morosità         433        → dunning (attivazioni RIAT/REVO)
//   AVUF  Verifiche da Ufficio            53        → dunning (sigilli manomessi, si consuntivano)

export type Famiglia = 'dunning' | 'massive';

export type EsitoFamiglia = {
  famiglia: Famiglia;
  /** false se il codice non è fra quelli noti: la riga entra comunque, ma va segnalata. */
  riconosciuto: boolean;
};

const MASSIVE = new Set(['ASTR']);
const DUNNING = new Set(['ALIM', 'AMOR', 'ARMO', 'AVUF']);

/**
 * Famiglia dal codice "Tipo di ordine".
 *
 * Un codice ignoto NON scarta la riga: cade su `dunning` con `riconosciuto: false`, così l'import
 * la registra e il riepilogo la segnala. Perdere silenziosamente un ordine perché ACEA ha
 * introdotto un codice nuovo sarebbe il modo peggiore di fallire.
 */
export function famigliaDaTipoOrdine(tipo: string | null | undefined): EsitoFamiglia {
  const t = String(tipo ?? '').trim().toUpperCase();
  if (MASSIVE.has(t)) return { famiglia: 'massive', riconosciuto: true };
  if (DUNNING.has(t)) return { famiglia: 'dunning', riconosciuto: true };
  return { famiglia: 'dunning', riconosciuto: false };
}
