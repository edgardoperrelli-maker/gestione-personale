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

/**
 * Voci da RIPARARE (recupero del bug pre-fix): quelle dove il server (`vociServer`, dai props)
 * ha ancora un placeholder foto `blob-locale:` MA il telefono (`dbLavoro`) ha già il path reale.
 * Re-inviando queste voci col valore di dbLavoro, la foto si ricollega sul server.
 * Ritorna gli id delle voci da re-inviare.
 */
export function vociDaRiparare<T extends { id: string; risposte: Record<string, unknown> }>(
  vociServer: T[],
  lavori: LavoroVoce[],
): string[] {
  if (lavori.length === 0) return [];
  const perVoce = new Map(lavori.map((l) => [l.voceId, l.risposte]));
  const out: string[] = [];
  for (const v of vociServer) {
    const lav = perVoce.get(v.id);
    if (!lav) continue;
    const serve = Object.entries(v.risposte).some(([chiave, valore]) => {
      const reale = lav[chiave];
      return isPlaceholderFoto(valore) && typeof reale === 'string' && !isPlaceholderFoto(reale);
    });
    if (serve) out.push(v.id);
  }
  return out;
}
