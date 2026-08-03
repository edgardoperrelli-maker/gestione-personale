// PURA: slice per il donut "composizione per voce" della vista dirigenziale.
// Le righe saracinesca hanno kpi null → in perVoce collassano dentro NON_RISOLTA: qui vengono
// estratte come fetta a sé (da perAttivita, chiave 'SOSTITUZIONE SARACINESCA'), lasciando in
// NON_RISOLTA solo l'eventuale residuo davvero non classificato.

import { ETICHETTA_VISTA, type VistaCommittente } from './committente';
import type { Aggregato, ProduzioneAggregata } from './aggregaProduzione';

const SARA_KEY = 'SOSTITUZIONE SARACINESCA';

/**
 * Prefisso dei gruppi che sono una COMMESSA e non una voce ACEA (vedi `gruppoVoce` in load.ts):
 * le commesse senza tassonomia di voce si raggruppano per sé stesse.
 */
export const PREFISSO_COMMESSA = 'COMMESSA:';

export const VOCE_LABEL: Record<string, string> = {
  EL: 'Limitazioni (EL)',
  ES: 'Sospensioni (ES)',
  ERC: 'Rimozione contatori (ERC)',
  ERA: 'Rimozione abusi (ERA)',
  SARACINESCA: 'Saracinesche',
  NON_RISOLTA: 'Non classificata',
};

/**
 * Etichetta di un gruppo «per voce», comprese le fette che sono una commessa intera.
 *
 * Esportata perché la stessa chiave compare anche nella tabella operativa della pagina: usarla in
 * un posto solo lasciava a schermo la chiave tecnica «COMMESSA:acqualatina».
 */
export function etichettaVoce(chiave: string): string {
  if (chiave.startsWith(PREFISSO_COMMESSA)) {
    const c = chiave.slice(PREFISSO_COMMESSA.length) as VistaCommittente;
    return ETICHETTA_VISTA[c] ?? c;
  }
  return VOCE_LABEL[chiave] ?? chiave;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function composizionePerVoce(p: ProduzioneAggregata): Aggregato[] {
  const sara = p.perAttivita.find((a) => a.chiave === SARA_KEY);
  const out: Aggregato[] = [];
  for (const v of p.perVoce) {
    if (v.chiave === 'NON_RISOLTA' && sara) {
      out.push({ chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: sara.conteggio, valore: sara.valore });
      const resto = {
        chiave: 'NON_RISOLTA',
        label: VOCE_LABEL.NON_RISOLTA,
        conteggio: v.conteggio - sara.conteggio,
        valore: round2(v.valore - sara.valore),
      };
      if (resto.conteggio > 0) out.push(resto);
    } else {
      out.push({ ...v, label: etichettaVoce(v.chiave) });
    }
  }
  return out;
}
