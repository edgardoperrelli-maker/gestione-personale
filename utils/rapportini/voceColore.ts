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

/**
 * Con esito POSITIVO le MATRICOLE obbligatorie devono esserci: è il gemello di `noteCompilate`
 * sull'altro versante dell'esito.
 *
 * Il motivo per cui una matricola obbligatoria entra qui e un campo di testo obbligatorio no: la
 * matricola non è un dettaglio della lavorazione, è il VERBALE di che cosa è stato installato.
 * Una sostituzione senza il numero di ciò che si è montato non è una sostituzione completata —
 * è una sostituzione di cui non sappiamo il pezzo, e chiuderla in positivo significa chiudere
 * anche l'ordine nel registro e la riga a magazzino con un buco che nessuno riaprirà.
 *
 * Prima di questo gate l'obbligo scattava solo all'INVIO, cioè a fine giornata, lontano dal
 * posto: l'operatore scopriva a casa che gli mancava un numero che si legge solo sul contatore.
 * Qui la voce resta «da fare» finché il campo è vuoto, e la si vede rossa in lista mentre si è
 * ancora davanti all'impianto.
 */
export function matricoleObbligatorieCompilate(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): boolean {
  return campi
    .filter((c) => c.tipo === 'matricola' && c.obbligatoria === true)
    .every((c) => {
      const v = risposte[c.chiave];
      return typeof v === 'string' && v.trim().length > 0;
    });
}

/**
 * L'esito DICHIARATO nelle risposte, prima dei gate di completezza (nota, matricole).
 *
 * Serve a distinguere «non ha ancora un esito» da «ha un esito ma è incompleto», che per chi
 * legge la lista sono due cose diverse e prima si leggevano uguali. `voceEsitoColore` ci applica
 * sopra i gate; `motivoVoceIncompleta` lo usa per dire QUALE dei due casi è.
 */
export type EsitoDichiarato =
  | 'positivo'
  /** Negativo che pretende la nota col motivo. */
  | 'negativo'
  /** Negativo auto-esplicativo («NESSUN PASSAGGIO»): la nota non serve. */
  | 'negativo_esplicito'
  | 'nessuno';

export function esitoDichiarato(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): EsitoDichiarato {
  let positivo = false;
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true) {
        // Crocetta spuntata su un campo "negativo" (Assente / Non eseguito) → esito negativo.
        if (nomeNegativo(c)) return 'negativo';
        positivo = true;
      }
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s !== '') {
        // Valore negativo esplicito (NO / NESSUN PASSAGGIO) → esito negativo SOLO sul campo esito
        // (Eseguito / Esito). Su select secondari (es. Sostituzione valvola) il "NO" non è un esito.
        if (isEsitoSelect(c) && NEG_SELECT.test(s)) {
          return NEG_SELECT_SENZA_NOTA.test(s) ? 'negativo_esplicito' : 'negativo';
        }
        // Tendina su un campo "negativo" (Assente / Non eseguito) valorizzata "SI" → esito negativo.
        if (nomeNegativo(c)) return 'negativo';
        positivo = true;
      }
    }
  }
  return positivo ? 'positivo' : 'nessuno';
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
  const esito = esitoDichiarato(risposte, campi);
  // "NESSUN PASSAGGIO" è auto-esplicativo: rossa diretta, nota non obbligatoria.
  if (esito === 'negativo_esplicito') return 'rossa';
  // Note obbligatorie: se assenti la voce resta "da fare" (neutro) fino a compilazione.
  if (esito === 'negativo') return noteCompilate(risposte, campi) ? 'rossa' : 'neutro';
  if (esito === 'nessuno') return 'neutro';
  // POSITIVO: verde solo con le matricole obbligatorie compilate — un'installazione senza il
  // numero di ciò che si è installato non è un lavoro chiuso (vedi `matricoleObbligatorieCompilate`).
  return matricoleObbligatorieCompilate(risposte, campi) ? 'verde' : 'neutro';
}
