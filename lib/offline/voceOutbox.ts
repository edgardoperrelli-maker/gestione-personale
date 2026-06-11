import { idOutboxVoce } from './ids';
import type { OutboxItem, SaveStateOffline } from './types';

/** Costruisce l'elemento outbox canonico per il salvataggio di una voce. */
export function costruisciVoceOutbox(
  token: string,
  voceId: string,
  risposte: Record<string, unknown>,
  now: number,
): Extract<OutboxItem, { type: 'voce' }> {
  return {
    id: idOutboxVoce(token, voceId),
    type: 'voce',
    token,
    createdAt: now,
    tentativi: 0,
    stato: 'in_attesa',
    payload: { voceId, risposte },
  };
}

/**
 * Mappa lo stato dell'elemento outbox della voce nello stato del badge UI.
 * `errore` (rete) è mostrato come "in attesa di rete" (queued): l'errore vero per
 * l'operatore è solo `bloccato` (link scaduto, ecc.).
 */
export function statoBadgeDaOutbox(item: OutboxItem | undefined): SaveStateOffline {
  if (!item) return 'saved';
  switch (item.stato) {
    case 'in_invio': return 'saving';
    case 'bloccato': return 'bloccato';
    default: return 'queued';
  }
}
