// PURA: cosa è cambiato fra lo stato di approvazione delle voci che il tablet ha a schermo
// e quello che dice il server.
//
// L'operatore AcquaLatina scansiona la matricola ed è FERMO sul posto: finché l'ufficio non
// gliela assegna, la sua voce è sospesa e lui non può lavorare. Questa funzione decide quando
// dirgli «puoi andare» — e, cosa altrettanto importante, quando NON disturbarlo.

export type VoceStato = { id: string; approvazione_stato?: string | null };

/** Voci ancora sospese: finché ce n'è almeno una, ha senso continuare a chiedere al server. */
export function inAttesa<T extends VoceStato>(voci: T[]): T[] {
  return (voci ?? []).filter((v) => v.approvazione_stato === 'in_attesa');
}

export type Novita =
  /** Almeno una voce è passata da sospesa ad approvata: l'operatore può iniziare. */
  | { tipo: 'assegnate'; ids: string[] }
  /** Almeno una è stata rifiutata: va detto, ma non è un via libera. */
  | { tipo: 'rifiutate'; ids: string[] }
  | { tipo: 'nessuna' };

/**
 * Confronto fra lo stato a schermo e quello del server.
 *
 * Le approvazioni hanno la precedenza sui rifiuti: se nello stesso giro arrivano entrambi,
 * la notizia che sblocca il lavoro è quella che serve a chi è fermo davanti a un contatore.
 * Una voce sparita lato server non è una novità — è una voce cancellata dall'ufficio, e non
 * c'è niente da annunciare all'operatore.
 */
export function novitaAssegnazione(
  aSchermo: VoceStato[],
  dalServer: VoceStato[],
): Novita {
  const prima = new Map((aSchermo ?? []).map((v) => [v.id, v.approvazione_stato ?? null]));
  const assegnate: string[] = [];
  const rifiutate: string[] = [];

  for (const v of dalServer ?? []) {
    // Interessano solo le voci che il tablet vedeva SOSPESE: tutto il resto è già noto.
    if (prima.get(v.id) !== 'in_attesa') continue;
    if (v.approvazione_stato === 'approvato') assegnate.push(v.id);
    else if (v.approvazione_stato === 'rifiutato') rifiutate.push(v.id);
  }

  if (assegnate.length > 0) return { tipo: 'assegnate', ids: assegnate };
  if (rifiutate.length > 0) return { tipo: 'rifiutate', ids: rifiutate };
  return { tipo: 'nessuna' };
}
