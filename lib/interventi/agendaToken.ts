import { randomBytes } from 'node:crypto';

/** Token pubblico per l'agenda operatore: 64 caratteri hex (32 byte di entropia). */
export function generaAgendaToken(): string {
  return randomBytes(32).toString('hex');
}
