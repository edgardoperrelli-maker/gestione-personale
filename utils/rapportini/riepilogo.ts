import { voceEsitoColore } from './voceColore';
import type { TemplateCampo } from './buildVoci';

export type StatoVoce = 'eseguito' | 'non_eseguito' | 'da_fare';

export interface LavorazioneConteggio {
  chiave: string;
  etichetta: string;
  count: number;
}

export interface RiepilogoRapportino {
  eseguiti: number;
  nonEseguiti: number;
  daFare: number;
  totali: number;
  lavorazioni: LavorazioneConteggio[];
}

/** Stato sintetico di una voce, derivato dall'unica fonte di verità `voceEsitoColore`. */
export function statoVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): StatoVoce {
  const colore = voceEsitoColore(risposte, campi);
  if (colore === 'verde') return 'eseguito';
  if (colore === 'rossa') return 'non_eseguito';
  return 'da_fare';
}

/** Riepilogo dell'intero rapportino: esiti + conteggio lavorazioni (crocette). */
export function riepilogoRapportino(
  voci: { risposte: Record<string, unknown> }[],
  campi: TemplateCampo[],
): RiepilogoRapportino {
  let eseguiti = 0;
  let nonEseguiti = 0;
  let daFare = 0;
  for (const v of voci) {
    const s = statoVoce(v.risposte, campi);
    if (s === 'eseguito') eseguiti += 1;
    else if (s === 'non_eseguito') nonEseguiti += 1;
    else daFare += 1;
  }
  const lavorazioni: LavorazioneConteggio[] = campi
    .filter((c) => c.tipo === 'crocetta')
    .map((c) => ({
      chiave: c.chiave,
      etichetta: c.etichetta,
      count: voci.filter((v) => v.risposte[c.chiave] === true).length,
    }))
    .filter((l) => l.count > 0);
  return { eseguiti, nonEseguiti, daFare, totali: voci.length, lavorazioni };
}
