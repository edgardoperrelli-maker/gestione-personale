import type { TemplateCampo } from './buildVoci';

/** Valore di una tendina che indica di per sé "non fatto". */
const NEG_SELECT = /^(no|assente|negativ\w*|ko)$/i;

/** Campo il cui NOME indica un esito negativo (assente / non eseguito / negativo / ko). */
const NEG_NAME = /assent|non[\s_-]*eseguit|negativ|\bko\b/i;

function nomeNegativo(c: TemplateCampo): boolean {
  return NEG_NAME.test(`${c.chiave} ${c.etichetta}`);
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
        if (nomeNegativo(c)) return 'rossa';
        positivo = true;
      }
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s !== '') {
        // Valore negativo esplicito (NO / negativo / ko) → esito negativo.
        if (NEG_SELECT.test(s)) return 'rossa';
        // Tendina su un campo "negativo" (Assente / Non eseguito) valorizzata "SI" → esito negativo.
        if (nomeNegativo(c)) return 'rossa';
        positivo = true;
      }
    }
  }
  return positivo ? 'verde' : 'neutro';
}
