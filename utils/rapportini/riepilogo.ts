import { voceEsitoColore } from './voceColore';
import type { TemplateCampo } from './buildVoci';
import { campiDiVoce, unioneCampi } from './campiDiVoce';
import { valoreSaracinesca } from '@/lib/limitazione/exportLimMassive';

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
  /** Saracinesche (valvole) sostituite: voci attive con `sostituzione_valvola`/`sost_valvola` = SI.
   *  Stessa fonte di verità dell'export ACEA (`valoreSaracinesca`, tollerante a booleano/stringa). */
  saracinesche: number;
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
  voci: { risposte: Record<string, unknown>; annullato?: boolean; manuale?: boolean; approvazione_stato?: string | null; campi?: TemplateCampo[] | null }[],
  campi: TemplateCampo[],
): RiepilogoRapportino {
  // Le voci RIFIUTATE dall'ufficio sono SCARTATE: non sono interventi validi e non entrano in
  // alcun conteggio, nemmeno nei totali (diverso da `annullato`, che resta nei totali).
  const attive = voci.filter((v) => v.approvazione_stato !== 'rifiutato');
  let eseguiti = 0;
  let nonEseguiti = 0;
  let daFare = 0;
  let annullati = 0;
  let saracinesche = 0;
  for (const v of attive) {
    // Le voci annullate non contribuiscono a daFare: il rapportino rimane inviabile
    if (v.annullato) { annullati += 1; continue; }
    // Saracinesca sostituita (SI): conta su tutte le voci attive non annullate (task e manuali),
    // stessa `valoreSaracinesca` dell'export ACEA (tollerante a booleano `true` e stringa "SI").
    if (valoreSaracinesca(v.risposte['sostituzione_valvola'], v.risposte['sost_valvola']).toUpperCase() === 'SI') {
      saracinesche += 1;
    }
    // Voci create dal "+" (manuali): già complete con esito e foto → contano come eseguite, mai "da fare".
    if (v.manuale) { eseguiti += 1; continue; }
    // L'esito si valuta sui campi DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    const s = statoVoce(v.risposte, campiDiVoce(v, campi));
    if (s === 'eseguito') eseguiti += 1;
    else if (s === 'non_eseguito') nonEseguiti += 1;
    else daFare += 1;
  }
  // Le lavorazioni contano su TUTTE le crocette presenti nel rapportino (voci miste incluse).
  const lavorazioni: LavorazioneConteggio[] = unioneCampi(campi, attive.map((v) => v.campi))
    .filter((c) => c.tipo === 'crocetta')
    .map((c) => ({
      chiave: c.chiave,
      etichetta: c.etichetta,
      count: attive.filter((v) => v.risposte[c.chiave] === true).length,
    }))
    .filter((l) => l.count > 0);
  return { eseguiti, nonEseguiti, daFare, annullati, totali: attive.length, saracinesche, lavorazioni };
}
