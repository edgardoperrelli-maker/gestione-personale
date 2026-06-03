// Mappa l'esito di una voce rapportino al patch dell'intervento.
// Import relativi (non @/) così è riusabile dallo script di sync via tsx senza config alias.
import { voceEsitoColore } from '../../utils/rapportini/voceColore';
import type { TemplateCampo } from '../../utils/rapportini/buildVoci';

export type PatchEsito = { esito: 'eseguito_positivo' | null; esito_motivo: string | null };

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
