import type { LavoroVoce } from './types';
import { isPlaceholderFoto } from './fotoPlaceholder';

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

/**
 * Risolve i SOLI campi foto ancora a `blob-locale:` (segnaposto) col path reale già scritto
 * in `dbLavoro` dal sync. Mirato: tocca solo i valori che nel componente sono ancora placeholder
 * (non sovrascrive altri campi → niente rischio di perdere modifiche in corso). Non muta gli input.
 */
export function risolviFotoPlaceholder<T extends { id: string; risposte: Record<string, unknown> }>(
  voci: T[],
  lavori: LavoroVoce[],
): T[] {
  if (lavori.length === 0) return voci;
  const perVoce = new Map(lavori.map((l) => [l.voceId, l.risposte]));
  return voci.map((v) => {
    const lav = perVoce.get(v.id);
    if (!lav) return v;
    let cambiato = false;
    const risposte: Record<string, unknown> = { ...v.risposte };
    for (const [chiave, valore] of Object.entries(v.risposte)) {
      const reale = lav[chiave];
      if (isPlaceholderFoto(valore) && typeof reale === 'string' && !isPlaceholderFoto(reale)) {
        risposte[chiave] = reale;
        cambiato = true;
      }
    }
    return cambiato ? { ...v, risposte } : v;
  });
}
