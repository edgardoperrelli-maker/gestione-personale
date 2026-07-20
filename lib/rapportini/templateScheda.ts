/**
 * Validazione dei modelli manuali (+): il committente è obbligatorio perché instrada
 * la modale "+" dell'operatore. (Le schede classici/manuali dell'editor storico sono
 * state rimosse col modulo Template rapportini → Azioni operatori.)
 * Ritorna il messaggio d'errore, oppure `null` se va bene (classico o manuale con committente).
 */
export function erroreCommittenteManuale(input: {
  solo_manuale?: boolean | null;
  committente?: string | null;
}): string | null {
  if (input.solo_manuale && !input.committente) {
    return 'Per i template manuali il committente è obbligatorio';
  }
  return null;
}
