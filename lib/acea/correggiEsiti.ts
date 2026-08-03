/*
  PURA: quali interventi vanno corretti perché ACEA li ha contabilizzati POSITIVI.

  Il caso reale: l'operatore chiude la voce come non riuscita — si è sbagliato, o ha esitato
  prima di finire — e l'export del Cruscotto invece dice che quell'ordine ACEA l'ha pagato.
  Se ACEA lo remunera, il lavoro c'è stato: il nostro «no» è un errore di compilazione, e
  lasciarlo lì costa due volte — la produzione economica perde soldi già incassati, e il KPI
  dell'operatore lo punisce per una spunta sbagliata.

  La regola è ASIMMETRICA di proposito, ed è la stessa scelta del 15/07 (allora viveva
  nell'agente dei file, che stiamo spegnendo):

    ACEA positivo + noi non-positivo  →  si corregge il nostro.
    ACEA negativo o muto + noi positivo  →  NON si tocca niente.

  Il verso opposto non si automatizza perché «ACEA non l'ha ancora contabilizzato» e «ACEA
  dice che non è stato fatto» sono indistinguibili nell'export, e il secondo è raro mentre il
  primo è la normalità di ogni fine mese. Cancellare un positivo nostro su quel dubbio
  vorrebbe dire cancellare lavoro fatto in attesa di pagamento.

  Solo interventi COMPLETATI: uno ancora aperto non è un esito sbagliato, è un lavoro che
  deve ancora succedere — e scrivergli sopra un positivo lo chiuderebbe senza che nessuno
  ci sia andato.
*/

/** L'esito con cui il registro rappresenta un lavoro riuscito. */
export const ESITO_POSITIVO = 'eseguito_positivo';

export type OrdineEsitato = {
  odl: string;
  /** `true` = ACEA l'ha contabilizzato positivo. `false`/`null` = non lo dice. */
  esito_positivo: boolean | null;
};

export type InterventoDaCorreggere = {
  id: string;
  odl: string | null;
  stato: string | null;
  esito: string | null;
};

export type CorrezioneEsito = {
  id: string;
  odl: string;
  /** L'esito che aveva prima: serve a raccontare la correzione, non solo a contarla. */
  esitoPrima: string | null;
};

/**
 * Gli interventi da portare a positivo perché l'export ACEA li dà per contabilizzati.
 *
 * Un ODL può avere più interventi (più operazioni, o riaperture): si correggono TUTTI quelli
 * completati e non positivi, perché l'export parla dell'ordine e non della singola uscita.
 */
export function correzioniDaImport(
  dalFile: readonly OrdineEsitato[],
  interventi: readonly InterventoDaCorreggere[],
): CorrezioneEsito[] {
  const positiviAcea = new Set<string>();
  for (const r of dalFile) {
    const odl = String(r.odl ?? '').trim();
    if (odl && r.esito_positivo === true) positiviAcea.add(odl);
  }
  if (positiviAcea.size === 0) return [];

  const out: CorrezioneEsito[] = [];
  for (const i of interventi) {
    const odl = String(i.odl ?? '').trim();
    if (!odl || !positiviAcea.has(odl)) continue;
    if (i.stato !== 'completato') continue;      // non ancora lavorato: non è un errore di esito
    if (i.esito === ESITO_POSITIVO) continue;    // già a posto
    out.push({ id: i.id, odl, esitoPrima: i.esito });
  }
  return out;
}
