// PURA: slice per il donut "composizione per voce" della vista dirigenziale.
// Le righe saracinesca hanno kpi null → in perVoce collassano dentro NON_RISOLTA: qui vengono
// estratte come fetta a sé (da perAttivita, chiave 'SOSTITUZIONE SARACINESCA'), lasciando in
// NON_RISOLTA solo l'eventuale residuo davvero non classificato.

import type { Aggregato, ProduzioneAggregata } from './aggregaProduzione';

const SARA_KEY = 'SOSTITUZIONE SARACINESCA';

export const VOCE_LABEL: Record<string, string> = {
  EL: 'Limitazioni (EL)',
  ES: 'Sospensioni (ES)',
  ERC: 'Rimozione contatori (ERC)',
  ERA: 'Rimozione abusi (ERA)',
  SARACINESCA: 'Saracinesche',
  NON_RISOLTA: 'Non classificata',
};

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
      out.push({ ...v, label: VOCE_LABEL[v.chiave] ?? v.chiave });
    }
  }
  return out;
}
