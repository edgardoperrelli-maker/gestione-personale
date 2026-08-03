import { voceEsitoColore, haEsitoNegativo, esitoDichiarato } from './voceColore';
import type { TemplateCampo } from './buildVoci';

/** Pattern per i campi "note" (obbligatori solo con esito negativo). */
const NOTE_FIELD = /^note/i;

/** Un campo è "nota" se è di tipo testo e il nome inizia per "note". */
export function isCampoNota(c: TemplateCampo): boolean {
  return c.tipo === 'testo' && NOTE_FIELD.test(`${c.chiave} ${c.etichetta}`);
}

export type MotivoIncompleto = 'senza_esito' | 'nota_mancante' | 'matricola_mancante';

/**
 * Perché una voce è incompleta (resta "da fare"). `null` se completa (verde o rossa).
 * - `'nota_mancante'`: esito negativo presente ma la nota obbligatoria non è compilata.
 * - `'matricola_mancante'`: esito POSITIVO dichiarato ma la matricola obbligatoria è vuota.
 * - `'senza_esito'`: nessun esito messo.
 *
 * La distinzione fra gli ultimi due è il motivo per cui esiste `esitoDichiarato`: dire «senza
 * esito» a chi l'esito l'ha appena messo lo manda a cercare il campo sbagliato.
 * Riusa `haEsitoNegativo` (unica fonte di verità in voceColore).
 */
export function motivoVoceIncompleta(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): MotivoIncompleto | null {
  if (voceEsitoColore(risposte, campi) !== 'neutro') return null;
  if (haEsitoNegativo(risposte, campi)) return 'nota_mancante';
  return esitoDichiarato(risposte, campi) === 'positivo' ? 'matricola_mancante' : 'senza_esito';
}
