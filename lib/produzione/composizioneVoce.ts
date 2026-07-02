// PURA: slice per il donut "composizione per voce" della vista dirigenziale.
// Le righe con voce non derivata dal testo (kpi null) collassano in perVoce dentro NON_RISOLTA: qui
// vengono estratte come fette a sé le attività note che NON hanno (e strutturalmente non possono
// avere) una voce KPI — saracinesche e riattivazioni/revoche di limitazioni/sospensioni per morosità
// risolta: nel contratto ACEA la premialità EL/ES/ERC/ERA remunera l'azione (limitare/sospendere/
// rimuovere), non il suo annullamento — lasciando in NON_RISOLTA solo l'eventuale residuo davvero
// non ricondotto a nessuna attività nota.

import type { Aggregato, ProduzioneAggregata } from './aggregaProduzione';

const SARA_KEYS = ['SOSTITUZIONE SARACINESCA'];
const RIATTIVAZIONE_KEYS = ['RIATTIVAZIONE UTENZA', 'REVOCA DISTACCO RIATTIVAZIONE'];

export const VOCE_LABEL: Record<string, string> = {
  EL: 'Limitazioni (EL)',
  ES: 'Sospensioni (ES)',
  ERC: 'Rimozione contatori (ERC)',
  ERA: 'Rimozione abusi (ERA)',
  SARACINESCA: 'Saracinesche',
  RIATTIVAZIONE: 'Riattivazioni/Revoche',
  NON_RISOLTA: 'Non classificata',
};

/** Fette estratte da NON_RISOLTA (chiave attività in perAttivita → nuova voce), in ordine di slice. */
const FETTE_ESTRATTE: Array<{ chiave: string; attivitaKeys: string[] }> = [
  { chiave: 'SARACINESCA', attivitaKeys: SARA_KEYS },
  { chiave: 'RIATTIVAZIONE', attivitaKeys: RIATTIVAZIONE_KEYS },
];

/** Chiavi attività (perAttivita/attivitaKey) note come "non KPI per struttura di contratto": usata
 *  anche fuori da questo modulo per tenere allineato l'export di dettaglio "Non classificata" alla
 *  stessa definizione di questo donut (niente doppio conteggio con etichette diverse). */
export const ATTIVITA_NON_KPI_KEYS: string[] = [...SARA_KEYS, ...RIATTIVAZIONE_KEYS];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sommaPerAttivita(perAttivita: Aggregato[], attivitaKeys: string[]): { conteggio: number; valore: number } | null {
  let conteggio = 0;
  let valore = 0;
  for (const a of perAttivita) {
    if (!attivitaKeys.includes(a.chiave)) continue;
    conteggio += a.conteggio;
    valore += a.valore;
  }
  return conteggio > 0 ? { conteggio, valore: round2(valore) } : null;
}

export function composizionePerVoce(p: ProduzioneAggregata): Aggregato[] {
  const out: Aggregato[] = [];
  for (const v of p.perVoce) {
    if (v.chiave !== 'NON_RISOLTA') {
      out.push({ ...v, label: VOCE_LABEL[v.chiave] ?? v.chiave });
      continue;
    }
    let restoConteggio = v.conteggio;
    let restoValore = v.valore;
    for (const fetta of FETTE_ESTRATTE) {
      const somma = sommaPerAttivita(p.perAttivita, fetta.attivitaKeys);
      if (!somma) continue;
      out.push({ chiave: fetta.chiave, label: VOCE_LABEL[fetta.chiave], conteggio: somma.conteggio, valore: somma.valore });
      restoConteggio -= somma.conteggio;
      restoValore = round2(restoValore - somma.valore);
    }
    if (restoConteggio > 0) {
      out.push({ chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: restoConteggio, valore: restoValore });
    }
  }
  return out;
}
