// PURA: costanti di dominio della commessa AcquaLatina (Terracina, dal 29/07/2026).
// Specchia `lib/acea/*` come libreria di dominio del modulo commessa.
//
// La commessa ha UNA sola attività — la sostituzione del misuratore — con due
// lavorazioni accessorie tracciate a crocetta nel rapportino: i CODOLI (compresi nel
// prezzo, servono al conteggio materiale) e la SARACINESCA (extra a prezzo proprio).

/** Codice committente della commessa: chiave runtime su interventi/tassonomia/flussi. */
export const COMMITTENTE_ACQUALATINA = 'acqualatina';

/** Unico gruppo attività della commessa (foglia del flowchart Azioni operatori). */
export const GRUPPO_SOSTITUZIONE_MISURATORI = 'SOSTITUZIONE MISURATORI';

/**
 * Descrizione canonica dell'unica attività, al SINGOLARE.
 *
 * Non è un dettaglio di stile: il gruppo è al plurale, la descrizione al singolare, e le due
 * cose NON sono intercambiabili. `risolviGruppo` cerca fra le DESCRIZIONI, quindi passargli
 * «SOSTITUZIONE MISURATORI» (il gruppo) restituisce null e il POST di un intervento manuale
 * risponde `attivita_sconosciuta`. Verificato sul prod: `attivita_tassonomia` ha una sola riga
 * acqualatina, `Sostituzione misuratore`.
 *
 * Su ACEA l'equivoco non si vede perché lì la descrizione è OMONIMA del gruppo
 * («LIMITAZIONI MASSIVE» è entrambe le cose), e il default per gruppo funziona per caso.
 */
export const ATTIVITA_SOSTITUZIONE_MISURATORE = 'Sostituzione misuratore';

/**
 * Calibro di capitolato quando la colonna CALIBRO del file di pianificazione è vuota.
 * L'ufficio lo pre-carica per i punti che fanno eccezione; il resto è DN15.
 */
export const CALIBRO_DEFAULT = 'DN15';

/** Calibro del punto: quello indicato dall'ufficio, altrimenti il default di capitolato. */
export function calibroConDefault(calibro: string | null | undefined): string {
  return String(calibro ?? '').trim() || CALIBRO_DEFAULT;
}

/** True se il committente risolto è AcquaLatina (confronto tollerante a case/spazi). */
export function isAcqualatina(committente: string | null | undefined): boolean {
  return String(committente ?? '').trim().toLowerCase() === COMMITTENTE_ACQUALATINA;
}
