// Mappa l'esito di una voce rapportino al patch dell'intervento.
// Import relativi (non @/) così è riusabile dallo script di sync via tsx senza config alias.
import { voceEsitoColore } from '../../utils/rapportini/voceColore';
import type { TemplateCampo } from '../../utils/rapportini/buildVoci';

export type PatchEsito = { esito: 'eseguito_positivo' | null; esito_motivo: string | null };

export type PatchInterventoLive =
  | { azione: 'completa'; esito: 'eseguito_positivo' | null; esito_motivo: string | null }
  | { azione: 'riapri' };

/**
 * Patch "live" per la propagazione a ogni autosave voce (la voce è lo specchio
 * dell'intervento):
 * - voce con esito (verde/rossa) → 'completa' (chiudi l'intervento);
 * - voce neutra (azzerata) → 'riapri' (riporta l'intervento a "Da fare").
 */
export function patchInterventoLiveDaVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): PatchInterventoLive {
  const patch = esitoInterventoDaVoce(risposte, campi);
  if (patch) return { azione: 'completa', esito: patch.esito, esito_motivo: patch.esito_motivo };
  return { azione: 'riapri' };
}

/**
 * verde → Fatto (eseguito_positivo); rossa → Non fatto (esito null + nota libera);
 * neutro → null (la voce non ha ancora un esito → non chiudere l'intervento).
 */
export function esitoInterventoDaVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): PatchEsito | null {
  const colore = voceEsitoColore(risposte, campi);
  if (colore === 'verde') return { esito: 'eseguito_positivo', esito_motivo: null };
  if (colore === 'rossa') {
    const nota = typeof risposte?.note === 'string' ? risposte.note.trim() : '';
    return { esito: null, esito_motivo: nota || null };
  }
  return null;
}
