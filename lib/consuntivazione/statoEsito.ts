// PURA (client-safe): stato dell'esito per la Consuntivazione.
//
// Differenza VOLUTA rispetto a voceEsitoColore (flusso operatore): lì un negativo SENZA nota resta
// "neutro/da fare" per OBBLIGARE l'operatore a scrivere il motivo. In consuntivazione il back office
// è l'autorità e un esito SELEZIONATO — positivo o negativo (NO / NESSUN PASSAGGIO) — è già un esito.
// "Da esitare/da consuntivare" = SOLO l'assenza di esito (nessuna scelta nel rapportino).
import { voceEsitoColore, haEsitoNegativo } from '@/utils/rapportini/voceColore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type StatoEsitoConsuntivo = 'positivo' | 'negativo' | 'da_esitare';

export function statoEsitoConsuntivo(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): StatoEsitoConsuntivo {
  // Un negativo esplicito (NO / NESSUN PASSAGGIO / campo negativo) è un esito, con o senza nota.
  if (haEsitoNegativo(risposte, campi)) return 'negativo';
  if (voceEsitoColore(risposte, campi) === 'verde') return 'positivo';
  return 'da_esitare';
}

/** True se la voce ha un esito (positivo o negativo): condizione per poter esitare l'ordine. */
export function haEsitoConsuntivo(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  return statoEsitoConsuntivo(risposte, campi) !== 'da_esitare';
}
