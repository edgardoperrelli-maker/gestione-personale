/** Le due schede dell'editor template: classici (pianificati) e interventi manuali. */
export type SchedaTemplate = 'classici' | 'manuali';

/** Riga minima per lo smistamento (solo il flag che discrimina). */
export interface TemplateSchedaRow {
  solo_manuale?: boolean | null;
}

/** Scheda di appartenenza di un template. `solo_manuale` falsy ⇒ classico (default storico). */
export function schedaDiTemplate(t: TemplateSchedaRow): SchedaTemplate {
  return t.solo_manuale ? 'manuali' : 'classici';
}

/** Filtra i template per la scheda indicata. Non muta l'array di input. */
export function filtraTemplatePerScheda<T extends TemplateSchedaRow>(
  templates: T[],
  scheda: SchedaTemplate,
): T[] {
  return templates.filter((t) => schedaDiTemplate(t) === scheda);
}

/**
 * Validazione specifica della scheda Manuali: il committente è obbligatorio.
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
