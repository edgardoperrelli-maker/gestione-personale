// PURA: il flusso (Azioni operatori) di un TASK di piano che non è (ancora) diventato intervento.
//
// La strada maestra resta l'intervento: `risolviFlussoPerGruppo(committente, gruppo_attivita)`.
// Ma un task può arrivare in rapportino senza intervento agganciato — import del file template
// ODL, aggancio per ODL/matricola non riuscito, intervento creato su un ALTRO piano — e in quel
// caso la voce restava senza flusso e finiva sul modulo di ripiego del rapportino: il modulo di
// un altro committente addosso a un lavoro che non è suo (ACEA con «MATRICOLA NUOVO MISURATORE»
// obbligatoria dal flusso AcquaLatina, 2026-08).
//
// Il dato però c'è già, sul task: `committente` quando l'inserimento lo chiede (il "+" della
// mappa e quello dell'operatore lo pretendono), e comunque `attivita`, che in tassonomia porta
// a un solo committente — le descrizioni attive non sono ambigue fra committenti, quindi
// l'attività da sola basta a classificare. Nessuna euristica sul territorio, nessun ripiego
// alfabetico: o il task si classifica coi suoi dati, o non ha flusso (e chi chiama lo segnala).
import { risolviGruppo, committenteEquivalente, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { risolviFlussoPerGruppo, type TemplateFlussoRow } from '@/lib/rapportini/flussiGruppo';

/** Il minimo di un task del piano che serve a classificarlo. */
export type TaskClassificabile = {
  committente?: string | null;
  attivita?: string | null;
  /** Alcuni ingressi lo scrivono già (voci ACEA, master ODL): se c'è, vince sulla tassonomia. */
  gruppo_attivita?: string | null;
};

export type ClassificazioneTask = { committente: string; gruppo: string };

/**
 * (committente, gruppo attività) di un task: i suoi campi dove ci sono, la tassonomia
 * dell'attività per il resto. `null` = task non classificabile (attività fuori catalogo o
 * assente), l'unico caso in cui la voce resta senza flusso.
 */
export function classificaTask(
  task: TaskClassificabile | null | undefined,
  index: Map<string, TassonomiaRiga>,
): ClassificazioneTask | null {
  const dichiarato = committenteEquivalente(task?.committente);
  const gruppoDichiarato = String(task?.gruppo_attivita ?? '').trim();
  if (dichiarato && dichiarato !== 'altro' && gruppoDichiarato) {
    return { committente: dichiarato, gruppo: gruppoDichiarato };
  }
  // `'altro'` sonda tutti i committenti di tassonomia: è così che un task senza committente
  // (import template ODL) risolve comunque. Gli alias in scrittura assorbono i typo del file.
  const riga = risolviGruppo(dichiarato || 'altro', task?.attivita, index, { allinea: 'scrittura' });
  if (!riga) {
    // Committente noto ma attività fuori catalogo: senza gruppo non c'è flusso da scegliere.
    return null;
  }
  return {
    committente: dichiarato && dichiarato !== 'altro' ? dichiarato : committenteEquivalente(riga.committente),
    gruppo: gruppoDichiarato || riga.gruppo,
  };
}

/**
 * Il flusso collegato al (committente, gruppo) del task, con la stessa regola di specificità
 * usata per gli interventi. `null` = task non classificabile o gruppo senza flusso collegato.
 */
export function risolviFlussoDaTask<T extends TemplateFlussoRow & { nome?: string | null }>(
  task: TaskClassificabile | null | undefined,
  index: Map<string, TassonomiaRiga>,
  flussi: T[],
): T | null {
  const c = classificaTask(task, index);
  if (!c) return null;
  return risolviFlussoPerGruppo(c.committente, c.gruppo, flussi);
}
