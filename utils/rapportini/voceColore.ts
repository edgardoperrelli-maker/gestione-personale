import type { TemplateCampo } from './buildVoci';

const NEG_SELECT = /^(no|assente|negativ\w*|ko)$/i;

export function voceEsitoColore(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): 'verde' | 'rossa' | 'neutro' {
  let positivo = false;
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true) {
        if (/assent/i.test(`${c.chiave} ${c.etichetta}`)) return 'rossa';
        positivo = true;
      }
    } else if (c.tipo === 'select') {
      if (typeof v === 'string' && v.trim() !== '') {
        if (NEG_SELECT.test(v.trim())) return 'rossa';
        positivo = true;
      }
    }
  }
  return positivo ? 'verde' : 'neutro';
}
