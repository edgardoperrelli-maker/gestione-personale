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
  annullati: number;
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
  voci: { risposte: Record<string, unknown>; annullato?: boolean; manuale?: boolean }[],
  campi: TemplateCampo[],
): RiepilogoRapportino {
  let eseguiti = 0;
  let nonEseguiti = 0;
  let daFare = 0;
  let annullati = 0;
  for (const v of voci) {
    // Le voci annullate non contribuiscono a daFare: il rapportino rimane inviabile
    if (v.annullato) { annullati += 1; continue; }
    // Voci create dal "+" (manuali): già complete con esito e foto → contano come eseguite, mai "da fare".
    if (v.manuale) { eseguiti += 1; continue; }
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
  return { eseguiti, nonEseguiti, daFare, annullati, totali: voci.length, lavorazioni };
}
