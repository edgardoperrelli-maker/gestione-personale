import { voceEsitoColore, esitoDichiarato } from './voceColore';
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

/**
 * Stato di una voce tenendo conto di com'è nata. È l'unica funzione che le viste devono usare:
 * lista, conteggi, PDF e gate dell'invio devono dire la stessa cosa sulla stessa voce.
 *
 * Una voce creata dal "+" è completa PER COSTRUZIONE — il suo template può non dichiarare affatto
 * il campo `eseguito` (i modelli `solo_manuale` del committente), e lì pretendere un esito la
 * lascerebbe per sempre «da fare».
 *
 * Ma «completa» non vuol dire «riuscita». Su AcquaLatina il "+" è una RICHIESTA di assegnazione:
 * la voce nasce senza esito e l'operatore la compila dopo, sul posto, e può compilarla NO. Dare
 * per eseguita una voce che dice NO è come non aver chiesto: il rapportino di PASTORELLI del
 * 04/08 mostrava «31 su 31, 0 non eseguiti» con dentro una VIA TUCCIA 2/AC marcata NO, motivo
 * «VALVOLA NON CHIUDE».
 *
 * Quindi: l'esito dichiarato, se c'è, vince sempre. La scorciatoia resta solo dove serviva
 * davvero, cioè quando un esito non è stato proprio chiesto.
 */
export function statoVoceEffettivo(
  voce: { risposte: Record<string, unknown>; manuale?: boolean | null },
  campi: TemplateCampo[],
): StatoVoce {
  const risposte = voce.risposte ?? {};
  if (voce.manuale && esitoDichiarato(risposte, campi) === 'nessuno') return 'eseguito';
  return statoVoce(risposte, campi);
}

/** Riepilogo dell'intero rapportino: esiti + conteggio lavorazioni (crocette). */
export function riepilogoRapportino(
  voci: { risposte: Record<string, unknown>; annullato?: boolean; bloccoPositivo?: unknown; manuale?: boolean; approvazione_stato?: string | null; campi?: TemplateCampo[] | null }[],
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
    // Le voci annullate — e quelle BLOCCATE perché l'ODL è già positivo altrove — non
    // contribuiscono a daFare: il rapportino rimane inviabile (all'invio il server le rimuove).
    if (v.annullato || v.bloccoPositivo) { annullati += 1; continue; }
    // Saracinesca sostituita (SI): conta su tutte le voci attive non annullate (task e manuali),
    // stessa `valoreSaracinesca` dell'export ACEA (tollerante a booleano `true` e stringa "SI").
    if (valoreSaracinesca(v.risposte['sostituzione_valvola'], v.risposte['sost_valvola']).toUpperCase() === 'SI') {
      saracinesche += 1;
    }
    // L'esito si valuta sui campi DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    // Le voci dal "+" contano come eseguite solo finché un esito non l'hanno: vedi statoVoceEffettivo.
    const s = statoVoceEffettivo(v, campiDiVoce(v, campi));
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
