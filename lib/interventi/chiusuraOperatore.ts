// Pianifica la chiusura di un intervento dall'agenda operatore (Fatto / Non fatto).
// Logica pura: valida lo stato di partenza e l'esito per commessa, e ritorna il
// patch da applicare. Nessun accesso al DB qui.

import type { StatoIntervento, EsitoIntervento } from './statoInterventi';
import { esitiPerCommessa } from './esitiCommessa';

export type AzioneOperatore = 'fatto' | 'non_fatto';

export type ChiusuraPatch = {
  stato: 'completato';
  esito: EsitoIntervento;
  esito_motivo: string | null;
};

/**
 * Calcola il patch di chiusura per i due pulsanti dell'agenda.
 * - `assegnato` → completato (chiusura diretta).
 * - `completato` → consentito per la ri-registrazione (reversibilità entro la
 *   giornata; il vincolo temporale è applicato dall'API).
 * - altri stati → rifiutato (l'operatore non li gestisce).
 */
export function pianificaChiusuraOperatore(args: {
  statoCorrente: StatoIntervento;
  committente: string | null | undefined;
  azione: AzioneOperatore;
  causale?: EsitoIntervento | null;
  motivo?: string | null;
}): { ok: true; patch: ChiusuraPatch } | { ok: false; errore: string } {
  const { statoCorrente, committente, azione, causale, motivo } = args;

  if (statoCorrente !== 'assegnato' && statoCorrente !== 'completato') {
    return { ok: false, errore: `Intervento non chiudibile dall'operatore (stato: ${statoCorrente})` };
  }

  const esiti = esitiPerCommessa(committente);

  if (azione === 'fatto') {
    return { ok: true, patch: { stato: 'completato', esito: esiti.ok.chiave, esito_motivo: null } };
  }

  // azione === 'non_fatto'
  if (!causale) return { ok: false, errore: 'Causale obbligatoria per "Non fatto"' };
  const conf = esiti.causali.find((c) => c.chiave === causale);
  if (!conf) return { ok: false, errore: `Causale non valida per la commessa: ${causale}` };
  if (conf.richiedeMotivo && !motivo?.trim()) {
    return { ok: false, errore: `Motivazione obbligatoria per "${conf.etichetta}"` };
  }
  return { ok: true, patch: { stato: 'completato', esito: causale, esito_motivo: motivo?.trim() || null } };
}
