// PURA (client-safe): stato dell'esito per la Consuntivazione.
//
// Un esito SELEZIONATO — positivo o negativo (NO / NESSUN PASSAGGIO / campo negativo) — è già un
// esito: "da esitare/da consuntivare" = SOLO l'assenza di esito. MA, come nel flusso operatore, un
// negativo generico ("NO") richiede la NOTA col motivo per poter chiudere l'ordine; "NESSUN
// PASSAGGIO" è auto-esplicativo e non la richiede. Questa regola sul motivo la incapsula già
// voceEsitoColore: 'rossa' = negativo COMPLETO, 'neutro' = negativo in attesa di nota (o nessun esito).
import { voceEsitoColore, haEsitoNegativo } from '@/utils/rapportini/voceColore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type StatoEsitoConsuntivo = 'positivo' | 'negativo' | 'da_esitare';

/** Etichetta dell'esito SCELTO (per il badge): un negativo è "negativo" anche se manca la nota. */
export function statoEsitoConsuntivo(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): StatoEsitoConsuntivo {
  if (haEsitoNegativo(risposte, campi)) return 'negativo';
  if (voceEsitoColore(risposte, campi) === 'verde') return 'positivo';
  return 'da_esitare';
}

/** True se l'ordine è ESITABILE: positivo, oppure negativo COMPLETO (nota presente quando serve). */
export function esitabileConsuntivo(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  const c = voceEsitoColore(risposte, campi);
  return c === 'verde' || c === 'rossa';
}

/** True quando è stato scelto un negativo ma manca la NOTA obbligatoria col motivo (blocca l'esito). */
export function notaNegativoMancante(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  return statoEsitoConsuntivo(risposte, campi) === 'negativo' && !esitabileConsuntivo(risposte, campi);
}
