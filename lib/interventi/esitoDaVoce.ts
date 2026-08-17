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

export type DecisioneEsito =
  | { scrivi: true }
  | { scrivi: false; motivo: string };

/**
 * Se l'esito che arriva da una voce può davvero essere scritto sull'intervento.
 *
 * IL POSITIVO VINCE SEMPRE. È la stessa invariante dell'indice
 * `interventi_odl_matr_positivo_unico_idx` e del salto `gia_completato` di
 * `pianoPianificazione` — «ODL positivo = definitivamente chiuso» — ma applicata dove mancava:
 * la propagazione voce → intervento, che scriveva `esito` alla cieca.
 *
 * Serve perché un intervento può ritrovarsi con PIÙ voci addosso: succede quando la
 * pianificazione lo sposta su un altro operatore o un altro giorno e la voce di prima resta
 * indietro. Le due voci sono lo specchio dello STESSO intervento, quindi scrivono a turno sulla
 * stessa riga e l'ultima cancella la prima.
 *
 * Non in astratto:
 *  - ODL 12384609, 14/08/2026: LIBERATORI chiude «SI» alle 13:18, PRATESI «NO» alle 13:27 sul
 *    medesimo intervento. Vince il NO, su un lavoro che era stato fatto.
 *  - ODL 12378907: la voce del 12/08 («NESSUN PASSAGGIO», rimasta indietro) e quella del 13/08
 *    («SI») condividono l'intervento `a9c9a53c`. Bastava un salvataggio sulla voce vecchia per
 *    riaprire un ordine già chiuso eseguito.
 *
 * La regola distingue il DOPPIONE dall'AUTOCORREZIONE, che è il motivo per cui non basta un
 * `.neq('esito', 'eseguito_positivo')` in coda all'update:
 *  - l'intervento ha UNA voce sola → chi scrive è il proprietario di quell'esito, e correggersi
 *    (verde → rossa, un positivo messo per sbaglio) deve continuare a funzionare;
 *  - l'intervento ha PIÙ voci ed è già positivo → chi declassa è per forza una voce diversa da
 *    quella che il lavoro l'ha fatto, e non ha titolo per smentirla.
 *
 * Non tocca la correzione d'ufficio dallo storico, che passa da un'altra strada e DEVE poter
 * declassare: il positivo sbagliato in consuntivazione si corregge da lì (04/08/2026), ed è la
 * riapertura che `idsDaRiaprire` sa poi propagare al registro.
 */
export function decisioneScritturaEsito(
  esitoNuovo: 'eseguito_positivo' | null,
  esitoAttuale: string | null | undefined,
  vociDellIntervento: number,
): DecisioneEsito {
  if (esitoNuovo === 'eseguito_positivo') return { scrivi: true };
  if (esitoAttuale !== 'eseguito_positivo') return { scrivi: true };
  if (vociDellIntervento <= 1) return { scrivi: true };
  return {
    scrivi: false,
    motivo: `intervento già eseguito positivo e condiviso da ${vociDellIntervento} voci: il positivo non si declassa da una voce che non è la sua`,
  };
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
