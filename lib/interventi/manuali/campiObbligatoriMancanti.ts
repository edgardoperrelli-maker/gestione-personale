import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** True se il valore del campo è "vuoto" ai fini dell'obbligatorietà. */
function valoreMancante(campo: TemplateCampo, v: unknown): boolean {
  if (campo.tipo === 'crocetta') return v !== true;
  if (campo.tipo === 'numero') return v == null || (typeof v === 'string' && v.trim() === '');
  // testo / select (default): manca se non è una stringa non vuota
  return !(typeof v === 'string' && v.trim() !== '');
}

/** Etichette dei campi NON-foto con `obbligatoria === true` rimasti vuoti. */
export function campiObbligatoriMancanti(
  campi: TemplateCampo[],
  risposte: Record<string, unknown>,
): string[] {
  return campi
    .filter((c) => c.tipo !== 'foto' && c.obbligatoria === true)
    .filter((c) => valoreMancante(c, risposte[c.chiave]))
    .map((c) => c.etichetta);
}
