// PURA: unicità del modello del "+" per committente (modulo Azioni operatori).
// Regola: al più UN template solo_manuale ATTIVO e non riservato per ciascun
// committente — altrimenti l'instradamento della modale "+" diventa una lotteria
// (dipendeva dall'ordine di ritorno della query). L'invariante è garantito anche
// a livello DB dall'indice unico parziale rapportino_template_plus_univoco.

export type ModelloPlusRow = {
  id: string;
  nome?: string | null;
  committente?: string | null;
  active?: boolean | null;
  solo_manuale?: boolean | null;
  riservato_pi?: boolean | null;
};

export type CandidatoModelloPlus = {
  /** id del template in salvataggio (null/undefined per una creazione). */
  id?: string | null;
  committente?: string | null;
  active?: boolean | null;
  solo_manuale?: boolean | null;
  riservato_pi?: boolean | null;
};

/**
 * Ritorna il template già esistente in conflitto col candidato (stesso committente,
 * entrambi manuali attivi non riservati), o null se il salvataggio è lecito.
 */
export function modelloPlusInConflitto<T extends ModelloPlusRow>(
  templates: T[],
  candidato: CandidatoModelloPlus,
): T | null {
  const concorre =
    Boolean(candidato.solo_manuale) &&
    candidato.active !== false &&
    !candidato.riservato_pi &&
    Boolean(candidato.committente);
  if (!concorre) return null;
  return (
    templates.find(
      (t) =>
        t.id !== candidato.id &&
        Boolean(t.solo_manuale) &&
        t.active !== false &&
        !t.riservato_pi &&
        t.committente === candidato.committente,
    ) ?? null
  );
}
