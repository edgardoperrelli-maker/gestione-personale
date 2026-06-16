import { idOutboxManuale } from './ids';
import type { OutboxItem, PayloadManuale } from './types';

/** Costruisce l'elemento outbox canonico per una richiesta manuale ("+"). */
export function costruisciManualeOutbox(
  token: string,
  payload: PayloadManuale,
  now: number,
): Extract<OutboxItem, { type: 'manuale' }> {
  return {
    id: idOutboxManuale(token, payload.richiestaId),
    type: 'manuale',
    token,
    createdAt: now,
    tentativi: 0,
    stato: 'in_attesa',
    payload,
  };
}
