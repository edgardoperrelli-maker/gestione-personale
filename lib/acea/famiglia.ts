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
 * L'attività di TABELLONE che rende un operatore assegnabile, famiglia per famiglia.
 *
 * Il criterio degli assegnabili è lo stesso per tutt'e due le viste — «chi quel giorno ha in
 * cronoprogramma l'attività di QUESTA commessa» — ma l'attività non è la stessa: il dunning ha
 * «DUNNING», le limitazioni massive hanno «LIMITAZIONI MASSIVE» (verificato in produzione, con
 * righe di tabellone reali su entrambe). Un solo filtro per tutt'e due avrebbe mostrato ai
 * pianificatori delle massive l'elenco di chi fa dunning — cioè nessuno dei loro.
 *
 * `frammenti`: il match è per NOME e mai per uuid (l'id è un dato di produzione, cablarlo
 * legherebbe il codice a un database). Basta che il nome contenga il frammento: «MASSIV» prende
 * «LIMITAZIONI MASSIVE» oggi e un eventuale «ACEA MASSIVE» domani.
 *
 * `etichetta`: come la si nomina nei messaggi («Nessuno su … in tabellone», i motivi di rifiuto
 * del server, la guida). Una sola fonte, così menu, errori e documentazione dicono la stessa cosa.
 */
export const ATTIVITA_TABELLONE: Record<Famiglia, { frammenti: string[]; etichetta: string }> = {
  dunning: { frammenti: ['DUNNING'], etichetta: 'DUNNING' },
  massive: { frammenti: ['MASSIV'], etichetta: 'LIMITAZIONI MASSIVE' },
};

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
