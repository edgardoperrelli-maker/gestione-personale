import type { LavoroVoce } from './types';

/**
 * Reidratazione: sovrascrive le `risposte` di ogni voce con la versione locale
 * (`lavoro`) se presente. L'operatore è l'unico editor del suo token → la copia
 * locale è la più recente. Non muta gli input.
 */
export function mergeLavoro<T extends { id: string; risposte: Record<string, unknown> }>(
  voci: T[],
  lavori: LavoroVoce[],
): T[] {
  if (lavori.length === 0) return voci;
  const perVoce = new Map(lavori.map((l) => [l.voceId, l.risposte]));
  return voci.map((v) => (perVoce.has(v.id) ? { ...v, risposte: perVoce.get(v.id)! } : v));
}
