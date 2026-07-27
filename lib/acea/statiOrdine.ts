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

/** Stati aperti VISTI finora. Non è l'elenco di ciò che è aperto: vedi `isAperto`. */
export const STATI_APERTI = ['DAPI', 'RICE', 'ASGN', 'SOSP'] as const;

export const STATO_COMPLETATO = 'COMP';
export const STATO_ANNULLATO = 'ANNL';

const APERTI = new Set<string>(STATI_APERTI);
const NOTI = new Set<string>([...STATI_APERTI, STATO_COMPLETATO, STATO_ANNULLATO]);

/** Maiuscolo, senza spazi esterni. '' se assente. */
export function normalizzaStato(stato: string | null | undefined): string {
  return String(stato ?? '').trim().toUpperCase();
}

/** true se il codice è fra quelli osservati nell'export di riferimento. */
export function isStatoNoto(stato: string | null | undefined): boolean {
  return NOTI.has(normalizzaStato(stato));
}

/** true se lo stato è fra gli aperti già noti: distingue il nuovo dal consueto. */
export function isApertoNoto(stato: string | null | undefined): boolean {
  return APERTI.has(normalizzaStato(stato));
}

/**
 * true se l'ordine è ancora da lavorare.
 *
 * La regola è per ESCLUSIONE — aperto = tutto ciò che non è completato né annullato — e non per
 * appartenenza alla lista degli aperti noti. È una prudenza pagata sul campo: il 27/07/2026 il
 * Cruscotto mostrava 4 ordini in stato «Iniziato», che nell'export di riferimento del 26/07 non
 * esisteva. Con la regola per appartenenza sarebbero stati trattati come chiusi e sarebbero
 * spariti dal backlog senza che nessuno se ne accorgesse.
 *
 * Sbagliare per eccesso si vede: l'ordine compare nella tabella e qualcuno lo guarda. Sbagliare
 * per difetto è invisibile. Gli stati nuovi restano comunque segnalati all'import via
 * `isStatoNoto`, così l'elenco si aggiorna sapendo cosa è cambiato.
 *
 * `SOSP` è aperto per decisione esplicita: sono ordini congelati da ACEA ma con lavoro attaccato
 * (nell'export erano tutti e 7 già assegnati a nostri operatori), e vanno pianificati come gli
 * altri invece di finire in un limbo che nessuno guarda.
 */
export function isAperto(stato: string | null | undefined): boolean {
  const s = normalizzaStato(stato);
  // Uno stato assente non è «aperto»: è una riga malformata, che si segnala altrove.
  if (s === '') return false;
  return s !== STATO_COMPLETATO && s !== STATO_ANNULLATO;
}

export function isCompletato(stato: string | null | undefined): boolean {
  return normalizzaStato(stato) === STATO_COMPLETATO;
}

/** Gli annullati vengono rimossi dal registro all'import (con segnalazione se erano pianificati). */
export function isAnnullato(stato: string | null | undefined): boolean {
  return normalizzaStato(stato) === STATO_ANNULLATO;
}
