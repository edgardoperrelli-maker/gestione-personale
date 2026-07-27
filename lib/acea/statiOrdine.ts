// lib/acea/statiOrdine.ts
// PURA: stati dell'ordine ACEA e loro significato operativo.
//
// Nell'export "Descrizione Stato Ordine" e "Stato Operazione" sono lo STESSO campo in due
// codifiche, con corrispondenza 1:1 verificata su 5.293 righe:
//
//   COMP  completato            3.303   chiuso
//   DAPI  Intervento Richiesto  1.574   aperto, da pianificare
//   ANNL  Annullato               208   eliminato dal registro
//   RICE  Ricevuto                173   aperto
//   ASGN  Assegnato                28   aperto
//   SOSP  Sospensione               7   aperto — si pianifica come un intervento normale
//
// Qui si usa il codice (`Stato Operazione`): è stabile, la descrizione è testo localizzato.

/** Stati in cui l'ordine è ancora da lavorare: entrano nel backlog e sono pianificabili. */
export const STATI_APERTI = ['DAPI', 'RICE', 'ASGN', 'SOSP'] as const;

export const STATO_COMPLETATO = 'COMP';
export const STATO_ANNULLATO = 'ANNL';

const APERTI = new Set<string>(STATI_APERTI);

/** Maiuscolo, senza spazi esterni. '' se assente. */
export function normalizzaStato(stato: string | null | undefined): string {
  return String(stato ?? '').trim().toUpperCase();
}

/**
 * true se l'ordine è ancora da lavorare.
 *
 * `SOSP` è incluso per decisione esplicita: sono ordini congelati da ACEA ma con lavoro attaccato
 * (nell'export erano tutti e 7 già assegnati a nostri operatori), e vanno pianificati come gli
 * altri invece di finire in un limbo che nessuno guarda.
 */
export function isAperto(stato: string | null | undefined): boolean {
  return APERTI.has(normalizzaStato(stato));
}

export function isCompletato(stato: string | null | undefined): boolean {
  return normalizzaStato(stato) === STATO_COMPLETATO;
}

/** Gli annullati vengono rimossi dal registro all'import (con segnalazione se erano pianificati). */
export function isAnnullato(stato: string | null | undefined): boolean {
  return normalizzaStato(stato) === STATO_ANNULLATO;
}
