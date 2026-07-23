import type { TemplateCampo } from './buildVoci';

/** Valore di una tendina che indica di per sé "non fatto" (incl. "NESSUN PASSAGGIO" dei template ACEA). */
const NEG_SELECT = /^(no|assente|negativ\w*|ko|nessun[\s_-]*passagg\w*)$/i;

/**
 * Esito negativo "auto-esplicativo": il valore stesso spiega il motivo (es. "NESSUN PASSAGGIO"),
 * quindi la nota NON è obbligatoria → la voce è subito rossa (non resta neutra in attesa di nota).
 */
const NEG_SELECT_SENZA_NOTA = /^nessun[\s_-]*passagg\w*$/i;

/** Campo il cui NOME indica un esito negativo (assente / non eseguito / negativo / ko). */
const NEG_NAME = /assent|non[\s_-]*eseguit|negativ|\bko\b/i;

/**
 * Campo SELECT che rappresenta l'ESITO dell'intervento (Eseguito / Esito): solo qui un valore
 * "NO" / "NESSUN PASSAGGIO" significa esito negativo. Su select secondari (es. "Sostituzione
 * valvola", SI/NO) il "NO" è un attributo della lavorazione, non l'esito della voce: non deve
 * rendere la voce negativa né disattivare le foto obbligatorie.
 */
const ESITO_SELECT_NAME = /esegu|esito/i;

/** Pattern per i campi "note": obbligatori SOLO con esito negativo. */
const NOTE_FIELD = /^note/i;

function nomeNegativo(c: TemplateCampo): boolean {
  return NEG_NAME.test(`${c.chiave} ${c.etichetta}`);
}

/** True se il SELECT rappresenta l'ESITO della voce (Eseguito / Esito): l'unico su cui "NO" è un esito negativo. */
export function isEsitoSelect(c: TemplateCampo): boolean {
  return ESITO_SELECT_NAME.test(`${c.chiave} ${c.etichetta}`);
}

/**
 * Con esito negativo le note sono obbligatorie.
 * Ritorna true se:
 *  - il template non ha campi "note" (nessun obbligo), oppure
 *  - tutti i campi note presenti sono compilati (non vuoti).
 * Con esito POSITIVO questa funzione non viene mai chiamata → note sempre facoltative.
 */
function noteCompilate(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  const campiNote = campi.filter(
    (c) => c.tipo === 'testo' && NOTE_FIELD.test(`${c.chiave} ${c.etichetta}`),
  );
  if (campiNote.length === 0) return true;
  return campiNote.every((c) => {
    const v = risposte[c.chiave];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/** True se un campo "negativo" (crocetta o select) è valorizzato → esito negativo. */
export function haEsitoNegativo(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): boolean {
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true && nomeNegativo(c)) return true;
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      // Valore negativo (NO / NESSUN PASSAGGIO) → conta solo sul campo esito; nome negativo
      // (Assente / Non eseguito) → conta sempre, indipendentemente dal valore.
      if (s !== '' && (nomeNegativo(c) || (isEsitoSelect(c) && NEG_SELECT.test(s)))) return true;
    }
  }
  return false;
}

export function voceEsitoColore(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): 'verde' | 'rossa' | 'neutro' {
  let positivo = false;
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true) {
        // Crocetta spuntata su un campo "negativo" (Assente / Non eseguito) → esito negativo.
        // Note obbligatorie: se assenti la voce resta "da fare" (neutro) fino a compilazione.
        if (nomeNegativo(c)) return noteCompilate(risposte, campi) ? 'rossa' : 'neutro';
        positivo = true;
      }
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s !== '') {
        // Valore negativo esplicito (NO / NESSUN PASSAGGIO) → esito negativo SOLO sul campo esito
        // (Eseguito / Esito). Su select secondari (es. Sostituzione valvola) il "NO" non è un esito.
        if (isEsitoSelect(c) && NEG_SELECT.test(s)) {
          // "NESSUN PASSAGGIO" è auto-esplicativo: rossa diretta, nota non obbligatoria.
          if (NEG_SELECT_SENZA_NOTA.test(s)) return 'rossa';
          return noteCompilate(risposte, campi) ? 'rossa' : 'neutro';
        }
        // Tendina su un campo "negativo" (Assente / Non eseguito) valorizzata "SI" → esito negativo.
        if (nomeNegativo(c)) return noteCompilate(risposte, campi) ? 'rossa' : 'neutro';
        positivo = true;
      }
    }
  }
  return positivo ? 'verde' : 'neutro';
}
