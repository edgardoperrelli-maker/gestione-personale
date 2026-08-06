// lib/acea/saracinesche.ts
// PURA: il ciclo delle saracinesche, tutto derivato. Nessuna tabella nuova.
//
// La regola è una sola: dove risulta una saracinesca sostituita, deve esistere un ordine ACEA che
// la registri — altrimenti il lavoro è stato fatto e non verrà mai pagato (91,12 € l'una).
//
// Oggi quel collegamento vive in una colonna del master compilata a mano. Qui si deriva: la
// dichiarazione arriva dal rapportino dell'operatore, l'ordine dal registro, e i due si agganciano
// per impianto o per matricola. Se l'ordine c'è la richiesta è partita; se non c'è, va chiesta.
//
// Attenzione ai due insiemi, che NON si sommano:
//   - le DICHIARAZIONI (dai rapportini) si dividono fra coperte e da richiedere;
//   - gli ORDINI di sostituzione aperti nel registro sono quelli da esitare.
// Un ordine aperto può stare su un impianto senza dichiarazione, e viceversa. Tenerli separati è
// il motivo per cui i tre numeri non tornano mai come 791 = 80 + 634 + qualcosa.

import { normalizzaMatricola } from './parseTestoOrdine';

/**
 * Riconosce l'attività di sostituzione saracinesca da `Operazione testo breve`.
 *
 * Solo da lì: `Chiave testo standard` vale `AUCHIFO` sia sulle saracinesche sia sulle limitazioni
 * massive, e il marcatore nel testo dell'ordine non aiuta — 173 delle 267 saracinesche usano
 * `LIM_MAS_MATR_`, il marcatore delle massive.
 */
/*
  Qui viveva `saracinescaContemplata`, che escludeva dal ciclo le dichiarazioni sulle RIMOZIONI.

  L'argomento era fisico e sembrava chiuderla: su una rimozione — misuratore per morosità, allaccio
  abusivo — il misuratore viene portato via, quindi non resta niente su cui montare una valvola, e
  i SI dichiarati là dovevano essere spunte sbagliate. Ritirata il 2026-08-06, verificato con
  l'ufficio: ACEA quelle sostituzioni le accetta come interventi e le liquida.

  Vale la pena tenerne memoria perché l'errore non era nel ragionamento ma nella domanda. «Su
  questa attività la valvola si può sostituire?» è una domanda tecnica; quella che decide se una
  riga entra in un elenco da fatturare è «il committente la paga?», e la risposta a quella non sta
  nel catalogo delle attività — sta in chi vede gli esiti. Finché il filtro è rimasto, 13
  dichiarazioni sono state escluse dalla vista saracinesche E dalla Produzione economica: 1.184 €
  che non comparivano da nessuna parte, nemmeno come problema.
*/

/**
 * I frammenti che riconoscono un'attività di sostituzione.
 *
 * Esportati perché servono in DUE posti: questo predicato e il filtro SQL che seleziona gli ordini
 * di sostituzione senza scaricare tutto il registro. Ricopiarli avrebbe voluto dire due elenchi
 * che prima o poi divergono, e una query che seleziona un insieme diverso da quello che il codice
 * poi riconosce.
 */
export const FRAMMENTI_SARACINESCA = ['SARACINESC', 'VALVOL'] as const;

export function isAttivitaSaracinesca(attivita: string | null | undefined): boolean {
  const s = String(attivita ?? '').toUpperCase();
  return FRAMMENTI_SARACINESCA.some((k) => s.includes(k));
}

/** Un misuratore, come lo si conosce da una delle due parti. */
export type Misuratore = {
  impianto: string | null;
  /** Grezza: la normalizzazione la fa questo modulo, così le due parti usano la stessa. */
  matricola: string | null;
};

/**
 * Chiavi di aggancio di un misuratore: impianto e matricola, entrambe quando ci sono.
 *
 * Due misuratori si considerano lo stesso se condividono ALMENO una chiave. Serve perché le due
 * parti non sono simmetriche: il registro ha quasi sempre l'impianto, il rapportino spesso solo la
 * matricola. Pretendere che coincidano entrambe perderebbe la maggior parte degli aggancî.
 */
export function chiaviAggancio(m: Misuratore): string[] {
  const out: string[] = [];
  const imp = String(m.impianto ?? '').trim();
  if (imp !== '') out.push(`I:${imp}`);
  const mat = normalizzaMatricola(m.matricola);
  if (mat) out.push(`M:${mat}`);
  return out;
}

export type Famiglia = 'dunning' | 'massive';

/** Saracinesca dichiarata sostituita in un rapportino. */
export type Dichiarazione = Misuratore & {
  /**
   * ODL dell'intervento su cui è stata dichiarata (la limitazione, non la sostituzione).
   *
   * `null` sulle limitazioni massive aperte a mano dal «+», che un ordine ACEA non ce l'hanno per
   * costruzione: sono 803 su dati reali, e sono lavoro fatto esattamente come le altre. È il
   * motivo per cui questo campo è nullable — pretendere l'ODL qui significava perderle tutte.
   */
  odl: string | null;
  /** L'intervento da cui viene la dichiarazione: l'unica chiave che c'è sempre, anche senza ODL. */
  intervento_id: string;
  /** Famiglia dell'ordine su cui si è intervenuti: è quella che il filtro delle fogliette usa. */
  famiglia: Famiglia | null;
  data: string | null;
  operatore: string | null;
  comune: string | null;
  /** Serve alla richiesta ad ACEA: senza indirizzo il punto non è identificabile. */
  indirizzo: string | null;
  cap: string | null;
};

/** Ordine ACEA di sostituzione saracinesca presente nel registro. */
export type OrdineSostituzione = Misuratore & {
  odl: string;
  numero_operazione: string;
  /** Famiglia propria dell'ordine (le sostituzioni sono ASTR, quindi massive). */
  famiglia: Famiglia | null;
  aperto: boolean;
  stato: string;
  data_creazione: string | null;
  comune: string | null;
};

export type StatoDichiarazione = 'coperta' | 'da_richiedere';

export type DichiarazioneClassificata = Dichiarazione & {
  stato: StatoDichiarazione;
  /** ODL di sostituzione che la copre, se ce n'è uno. */
  odl_sostituzione: string | null;
  /** true se l'ordine che la copre è ancora aperto: fatta, ordinata, non ancora esitata. */
  sostituzione_aperta: boolean;
};

/*
  Qui c'era `famiglia_vista`: l'ordine di sostituzione si mostrava sotto la famiglia del LAVORO che
  lo aveva generato, non sotto la propria — così una sostituzione nata da un dunning si cercava fra
  i dunning. Ritirata il 2026-08-06.

  Il motivo: gli ordini di sostituzione sono tutti `massive`, ed è ACEA a classificarli così (sono
  manutenzioni straordinarie). Il rimappaggio era una finzione a costo zero finché il ramo dunning
  restava fermo — oggi la copertura là è zero su 141 — ma sarebbe diventato due numeri diversi per
  la stessa cosa il giorno in cui quelle 141 vengono chieste e ACEA le apre come massive: la card
  dunning ne avrebbe contate N, la tabella dunning zero. «Da esitare» è un concetto massive, su
  entrambe le superfici, e ora lo è per costruzione invece che per promessa.
*/
export type OrdineAperto = OrdineSostituzione & {
  /**
   * ODL dell'intervento su cui la saracinesca era stata dichiarata, se agganciato.
   *
   * Resta perché è informazione vera e utile — dice da quale lavoro nasce quella sostituzione — e
   * a differenza della famiglia non pretende di spostare la riga sotto un'altra vista.
   */
  odl_dichiarazione: string | null;
};

export type EsitoSaracinesche = {
  /** Dichiarazioni distinte per misuratore: il totale del lavoro svolto. */
  fatte: number;
  /** Dichiarazioni con un ordine di sostituzione, aperto o chiuso. */
  coperte: number;
  /** Dichiarazioni senza alcun ordine: da chiedere ad ACEA, sono i soldi a rischio. */
  daRichiedere: number;
  /** Ordini di sostituzione aperti nel registro: da esitare. Conta ORDINI, non dichiarazioni. */
  daEsitare: number;
  dichiarazioni: DichiarazioneClassificata[];
  ordiniAperti: OrdineAperto[];
};

/**
 * Deduplica le dichiarazioni per misuratore.
 *
 * Un misuratore su cui si è intervenuti più volte produce più voci di rapportino, ma la saracinesca
 * è una sola e si paga una sola volta. Senza impianto né matricola si ripiega sull'ODL: perdere la
 * dichiarazione sarebbe peggio che contarla su una chiave debole.
 */
function chiaveDedup(d: Dichiarazione): string {
  const imp = String(d.impianto ?? '').trim();
  if (imp !== '') return `I:${imp}`;
  const mat = normalizzaMatricola(d.matricola);
  if (mat) return `M:${mat}`;
  // Ultimo ripiego: l'ODL se c'è, altrimenti l'intervento — che c'è sempre. Prima qui si dava per
  // scontato l'ODL, e su una dichiarazione senza ordine sarebbe esploso invece di contarla.
  const odl = String(d.odl ?? '').trim().toUpperCase();
  return odl !== '' ? `O:${odl}` : `X:${d.intervento_id}`;
}

/**
 * I tre stati del ciclo, tutti derivati.
 *
 * Fra più dichiarazioni sullo stesso misuratore si tiene la più vecchia: è quella che stabilisce da
 * quando il lavoro è a credito, ed è il dato che serve quando si va a chiedere l'ordine ad ACEA.
 *
 * Il filtro per famiglia si applica DOPO l'aggancio, mai prima: filtrare gli ordini a monte
 * mostrerebbe come «da richiedere» saracinesche che un ordine ce l'hanno — solo, di un'altra
 * famiglia. Sarebbe un errore da 91 € l'uno, moltiplicato per centinaia.
 */
export function statiSaracinesche(args: {
  dichiarazioni: readonly Dichiarazione[];
  ordini: readonly OrdineSostituzione[];
  /** Restringe le liste e i conteggi a una famiglia. Assente = tutte. */
  famiglia?: Famiglia | null;
}): EsitoSaracinesche {
  // Indice degli ordini per chiave. Un ordine aperto batte uno chiuso nella copertura: se sullo
  // stesso misuratore c'è sia un ordine esitato sia uno ancora aperto, quello che chiede
  // un'azione è l'aperto.
  const perChiave = new Map<string, OrdineSostituzione>();
  for (const o of args.ordini) {
    for (const k of chiaviAggancio(o)) {
      const gia = perChiave.get(k);
      if (!gia || (o.aperto && !gia.aperto)) perChiave.set(k, o);
    }
  }

  const unaPerMisuratore = new Map<string, Dichiarazione>();
  for (const d of args.dichiarazioni) {
    const k = chiaveDedup(d);
    const gia = unaPerMisuratore.get(k);
    if (!gia) { unaPerMisuratore.set(k, d); continue; }
    const primaDi = (a: string | null, b: string | null) =>
      String(a ?? '￿').localeCompare(String(b ?? '￿')) < 0;
    if (primaDi(d.data, gia.data)) unaPerMisuratore.set(k, d);
  }

  const tutte: DichiarazioneClassificata[] = [];
  // Rotta inversa ordine → dichiarazione, per dare all'ordine la famiglia del lavoro che lo ha
  // generato: è sotto quella che chi filtra si aspetta di trovarlo.
  const dichPerOdlSost = new Map<string, DichiarazioneClassificata>();
  for (const d of unaPerMisuratore.values()) {
    const ordine = chiaviAggancio(d).map((k) => perChiave.get(k)).find(Boolean) ?? null;
    const classificata: DichiarazioneClassificata = {
      ...d,
      stato: ordine ? 'coperta' : 'da_richiedere',
      odl_sostituzione: ordine?.odl ?? null,
      sostituzione_aperta: ordine?.aperto === true,
    };
    tutte.push(classificata);
    if (ordine && !dichPerOdlSost.has(ordine.odl)) dichPerOdlSost.set(ordine.odl, classificata);
  }

  // Ordinamento stabile per la vista: prima le più vecchie, che sono a credito da più tempo.
  // Lo spareggio passa per l'intervento e non per l'ODL: quello può mancare, l'intervento no.
  tutte.sort(
    (a, b) =>
      String(a.data ?? '￿').localeCompare(String(b.data ?? '￿')) ||
      String(a.odl ?? '').localeCompare(String(b.odl ?? '')) ||
      a.intervento_id.localeCompare(b.intervento_id),
  );

  const apertiTutti: OrdineAperto[] = args.ordini
    .filter((o) => o.aperto)
    .map((o) => ({ ...o, odl_dichiarazione: dichPerOdlSost.get(o.odl)?.odl ?? null }))
    .sort(
      (a, b) =>
        String(a.data_creazione ?? '￿').localeCompare(String(b.data_creazione ?? '￿')) ||
        a.odl.localeCompare(b.odl),
    );

  const f = args.famiglia ?? null;
  const dichiarazioni = f ? tutte.filter((d) => d.famiglia === f) : tutte;
  const ordiniAperti = f ? apertiTutti.filter((o) => o.famiglia === f) : apertiTutti;

  const coperte = dichiarazioni.filter((d) => d.stato === 'coperta').length;
  return {
    fatte: dichiarazioni.length,
    coperte,
    daRichiedere: dichiarazioni.length - coperte,
    daEsitare: ordiniAperti.length,
    dichiarazioni,
    ordiniAperti,
  };
}

/** Tariffa di listino della sostituzione saracinesca, per stimare quanto vale il non richiesto. */
export const TARIFFA_SARACINESCA = 91.12;

/** Valore in euro delle saracinesche da richiedere: la cifra che rende la vista urgente. */
export function valoreDaRichiedere(n: number): number {
  return Math.round(n * TARIFFA_SARACINESCA * 100) / 100;
}
