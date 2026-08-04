/*
  PURA: quale attività scrivere sugli interventi ACEA, presa dall'export del Cruscotto.

  Il caso reale — impianti 4000551740, 4003925044, 4000145731, 4003852681, 4004372214.
  L'ODL nasce come rimozione misuratore per morosità, l'ufficio pianifica il giro col testo di
  quel giorno, e `interventi.intervento_tipo` fotografa quel testo alla nascita dell'intervento.
  Poi il cliente paga: ACEA riapre l'ordine e l'operazione diventa «Riattivazione fornitura».
  L'export lo dice, il nostro intervento no — e nessuno lo riallinea, perché la rigenerazione del
  piano preserva gli interventi in stato terminale e non ha un ramo di UPDATE
  (`planInterventiForPiano`, `ensureInterventiForPiano`).

  Il registro «Misuratori Rimossi» decide su `intervento_tipo` (`isRimozioneTipo`): con l'attività
  ferma alla pianificazione, cinque riaperture sono entrate a magazzino come rimozioni, con la
  matricola di un contatore che non è mai stato staccato.

  Stessa asimmetria di `correggiEsiti` ("il positivo di ACEA vince"): sull'ATTIVITÀ il file di
  ACEA è la fonte e il nostro campo la copia, perché l'operazione dell'ordine è un dato di SAP —
  noi non la decidiamo, la riceviamo. L'esito e la matricola restano nostri: quelli li scrive chi
  è andato sul posto.

  Tre cancelli, tutti nel verso "non indovinare":
   • un ODL le cui operazioni nel file dichiarano attività DIVERSE non si allinea (non sappiamo
     quale delle due riguardi la nostra uscita);
   • un'attività che la tassonomia non conosce non si scrive (mai testo grezzo a storage: la
     forma canonica è ciò che i gruppi e i flussi leggono);
   • si tocca il solo committente `acea`.

  Perché `lim_massive` resta fuori: è un CANALE, non il catalogo DUNNING. La sua canonica unica
  («LIMITAZIONI MASSIVE») è una scelta deliberata — migration 20260722140000, alias di scrittura
  in `aliasAttivita.ts` — e nell'export gli stessi ODL portano il testo dell'ordine tecnico
  (es. «Sostituzione saracinesca o valvola»): riallinearli spezzerebbe il gruppo del modulo per
  86 interventi già lavorati. È la stessa esclusione del backfill di tassonomia (spec §4.5).
*/

import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

/** L'unico committente riallineabile dall'export: vedi il commento sopra su `lim_massive`. */
export const COMMITTENTE_ALLINEABILE = 'acea';

/** Una riga dell'export, ridotta a ciò che serve qui: l'ordine e la sua operazione. */
export type OrdineAttivita = {
  odl: string;
  /** "Operazione testo breve" del Cruscotto — la colonna da cui nasce `intervento_tipo`. */
  attivita: string | null;
};

export type InterventoDaAllineare = {
  id: string;
  odl: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  gruppo_attivita: string | null;
};

export type AllineamentoAttivita = {
  id: string;
  odl: string;
  /** Forma CANONICA di tassonomia, non il testo grezzo del file. */
  intervento_tipo: string;
  gruppo_attivita: string;
  /** Quello che c'era prima: serve a raccontare la correzione, non solo a contarla. */
  tipoPrima: string | null;
};

/**
 * Gli interventi da riallineare all'attività dichiarata dall'export ACEA.
 *
 * Un ODL può avere più interventi (più uscite, o riaperture): si allineano TUTTI, perché
 * l'export parla dell'ordine e non della singola uscita — come in `correzioniDaImport`.
 */
export function allineamentiDaImport(
  dalFile: readonly OrdineAttivita[],
  interventi: readonly InterventoDaAllineare[],
  indice: Map<string, TassonomiaRiga>,
): AllineamentoAttivita[] {
  // 1) ODL → riga di tassonomia, solo dove il file è UNIVOCO e la descrizione è a catalogo.
  //    `null` marca l'ODL come ambiguo: una seconda operazione con attività diversa lo spegne
  //    per sempre, anche se la prima aveva risolto.
  const perOdl = new Map<string, TassonomiaRiga | null>();
  for (const r of dalFile) {
    const odl = String(r.odl ?? '').trim();
    if (!odl) continue;
    const ris = risolviGruppo(COMMITTENTE_ALLINEABILE, r.attivita, indice, { allinea: 'scrittura' });
    if (!ris) { perOdl.set(odl, null); continue; }          // sconosciuta o vuota → si sta fermi
    if (!perOdl.has(odl)) { perOdl.set(odl, ris); continue; }
    const gia = perOdl.get(odl);
    if (gia && gia.descrizioneNorm !== ris.descrizioneNorm) perOdl.set(odl, null); // ambiguo
  }
  if (perOdl.size === 0) return [];

  const out: AllineamentoAttivita[] = [];
  for (const i of interventi) {
    if (i.committente !== COMMITTENTE_ALLINEABILE) continue;
    const odl = String(i.odl ?? '').trim();
    if (!odl) continue;
    const ris = perOdl.get(odl);
    if (!ris) continue;
    if (i.intervento_tipo === ris.descrizione && i.gruppo_attivita === ris.gruppo) continue; // già a posto
    out.push({
      id: i.id,
      odl,
      intervento_tipo: ris.descrizione,
      gruppo_attivita: ris.gruppo,
      tipoPrima: i.intervento_tipo,
    });
  }
  return out;
}
