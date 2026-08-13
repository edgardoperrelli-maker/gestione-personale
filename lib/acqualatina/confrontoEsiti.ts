// PURA: il confronto fra gli esiti registrati sul SITO AcquaLatina e il nostro registro.
//
// Il sito è dove l'ufficio registra a mano gli interventi fatti (l'export è il file
// «5ESECUZIONI_…», foglio Esecuzione); il registro è `acqualatina_ordini`, chiuso dai nostri
// rapportini. Sono due mani dello stesso lavoro, e questo confronto trova dove una delle due
// non ha ancora scritto: SOLO lettura, nessuna delle due parti corregge l'altra — il sito non
// è raggiungibile da qui, e il registro si corregge dagli interventi (riconciliazione).
//
// La regola degli esiti è del committente, riferita dall'utente (04/08/2026): «eseguito è
// sempre positivo» — anche l'anomalia («EFFETTUATO - CONTATORE GUASTO») è lavoro fatto, non
// una mezza esecuzione. Ma «valorizzato» non vuol dire «eseguito»: il file porta anche i
// «NON ESEGUITO - …», e leggerli come lavoro fatto è ciò che accusava di anomalia le righe
// PIÙ allineate che ci fossero (vedi `classificaEsitoSito`).

import { normHeader } from '@/lib/attivita/masterUpload';

/** Una riga del file ESECUZIONI, già ridotta alle colonne che contano. */
export type RigaEsecuzione = {
  /** «Codice Esterno dell'OdL»: lo stesso numero che il registro chiama `odl`. */
  odl: string;
  /** «Codice Cliente»: l'impianto, per il controllo incrociato d'identità. */
  impianto: string;
  esito: string;
  dataFine: string;
};

/** Lo stato per-ODL del registro, come serve al confronto (una voce per riga di registro). */
export type RigaRegistroPerConfronto = {
  odl: string;
  aperto: boolean;
  esito_positivo: boolean | null;
  stato_desc: string | null;
  data_completamento: string | null;
  impianto: string | null;
  nominativo: string | null;
  comune: string | null;
};

export type VoceDaChiudere = {
  odl: string;
  esitoSito: string;
  dataSito: string;
  nominativo: string | null;
  comune: string | null;
  statoNostro: string;
};

export type VoceMancanteSito = {
  odl: string;
  chiusaIl: string | null;
  nominativo: string | null;
  comune: string | null;
};

export type ImpiantoDifforme = {
  odl: string;
  impiantoSito: string;
  impiantoRegistro: string;
};

export type ConfrontoEsiti = {
  /** Sito e registro dicono la stessa cosa: eseguito da tutt'e due, o non eseguito da tutt'e due. */
  allineati: number;
  /**
   * Il sito ha un esito, noi no — o ne abbiamo uno che lo contraddice. Manca (o non combacia)
   * il NOSTRO esito: un rapportino da fare, o una consuntivazione da correggere.
   */
  daChiudereDaNoi: VoceDaChiudere[];
  /**
   * ODL con un intervento IN CORSO oggi: il sito li dà già per fatti (la squadra registra
   * live dal campo), il nostro rapportino arriva a fine giornata. NON stanno in nessuna
   * coda — metterli in «manca il nostro esito» mentre gli operatori lavorano creava solo
   * confusione in ufficio (decisione utente 04/08): si contano e basta, senza elenco.
   */
  inLavorazioneOggi: number;
  /** Registro chiuso positivo, sito senza l'ODL o senza un esito POSITIVO: manca la registrazione sul sito. */
  mancantiSulSito: VoceMancanteSito[];
  /**
   * Chiusi da noi OGGI e non ancora sul sito: non sono una mancanza, la giornata non è
   * finita — la registrazione arriva a fine turno. Contati e basta, fuori dalla coda,
   * per la stessa ragione di `inLavorazioneOggi`.
   */
  chiusiOggi: number;
  /** Righe del file senza esito: gli ODL che il sito stesso dà ancora da fare. */
  nonEsitatiSito: number;
  /** ODL del file che il registro non conosce: o master mai caricato, o ODL di un altro lotto. */
  sconosciuti: string[];
  /** «Codice Cliente» del sito diverso dall'impianto a registro: identità da verificare. */
  impiantiDifformi: ImpiantoDifforme[];
  totaleFile: number;
};

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Cosa dice una delle due mani su un ODL. Tre casi, gli stessi da una parte e dall'altra: è
 * averli in comune che rende il confronto un'uguaglianza invece di una scala di eccezioni.
 */
export type Verdetto = 'assente' | 'positivo' | 'negativo';

/**
 * Il verdetto del SITO, dalla colonna «Esito».
 *
 * Il vocabolario del file è chiuso e si legge da sé: «EFFETTUATO …» è lavoro fatto, «NON
 * ESEGUITO - …» è un'uscita a vuoto (valvola di chiusura guasta, nicchia non adeguata,
 * diametro non disponibile, utente assente), la cella vuota è l'ODL non ancora esitato.
 *
 * Si guarda il TESTO e non il «Codice Esito» (OK, MI, VC, NC, CD, UA) di proposito: le sigle
 * sono un elenco che il committente può allungare senza dirlo, e un codice nuovo cadrebbe in
 * silenzio dalla parte sbagliata. «NON ESEGUITO» invece si dichiara — e un'etichetta nuova che
 * non comincia così è, per il committente, un'esecuzione.
 */
export function classificaEsitoSito(esito: string): Verdetto {
  const e = norm(esito);
  if (e === '') return 'assente';
  return /^non\s+esegui/i.test(e) ? 'negativo' : 'positivo';
}

/**
 * Il verdetto del REGISTRO per un ODL, dalle sue righe (una per matricola).
 *
 * Il positivo vince sul negativo: un ODL multi-matricola con una riga chiusa eseguita è
 * lavoro fatto. Il negativo è `esito_positivo === false`, che vale sia per «CHIUSA — NON
 * ESEGUITA» (il NO definitivo) sia per «APERTA — NON ESEGUITA» (da ripassare): sono due code
 * diverse per noi, ma la stessa identica frase detta al sito — ci siamo andati, non si è
 * potuto fare. `null` è la riga mai lavorata.
 */
function verdettoRegistro(righe: readonly RigaRegistroPerConfronto[]): Verdetto {
  if (righe.some((r) => !r.aperto && r.esito_positivo === true)) return 'positivo';
  if (righe.some((r) => r.esito_positivo === false)) return 'negativo';
  return 'assente';
}

/**
 * Riduce il foglio Esecuzione a una riga per ODL.
 *
 * Il file ne porta di doppie (una per componente della squadra: stessa esecuzione, due
 * risorse): a parità di ODL vince la riga CON esito — quella senza è la stessa uscita vista
 * da un'estrazione parziale, non un'informazione in più.
 */
export function parseEsecuzioni(rows: readonly unknown[][]): { righe: RigaEsecuzione[]; totale: number } {
  const COLONNE = {
    odl: 'codiceesternodellodl',
    impianto: 'codicecliente',
    esito: 'esito',
    dataFine: 'datafineesecuzione',
  } as const;
  let idx: Partial<Record<keyof typeof COLONNE, number>> | null = null;
  let headerIdx = -1;
  const lim = Math.min(15, rows.length);
  for (let i = 0; i < lim && !idx; i++) {
    const trovate: Partial<Record<keyof typeof COLONNE, number>> = {};
    (rows[i] ?? []).forEach((h, col) => {
      const n = normHeader(h);
      (Object.keys(COLONNE) as Array<keyof typeof COLONNE>).forEach((c) => {
        if (trovate[c] === undefined && n === COLONNE[c]) trovate[c] = col;
      });
    });
    if (trovate.odl !== undefined && trovate.esito !== undefined) {
      idx = trovate;
      headerIdx = i;
    }
  }
  if (!idx) throw new Error('Colonne «Codice Esterno dell\'OdL» ed «Esito» non trovate nel file.');

  const perOdl = new Map<string, RigaEsecuzione>();
  let totale = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const odl = norm(row[idx.odl as number]);
    if (odl === '') continue;
    totale++;
    const riga: RigaEsecuzione = {
      odl,
      impianto: idx.impianto === undefined ? '' : norm(row[idx.impianto]),
      esito: norm(row[idx.esito as number]),
      dataFine: idx.dataFine === undefined ? '' : norm(row[idx.dataFine]),
    };
    const gia = perOdl.get(odl);
    if (!gia || (gia.esito === '' && riga.esito !== '')) perOdl.set(odl, riga);
  }
  return { righe: [...perOdl.values()], totale };
}

/** Com'è messa la riga da noi, nel racconto del report. */
function statoNostro(righe: readonly RigaRegistroPerConfronto[]): string {
  if (righe.some((r) => !r.aperto && r.esito_positivo === true)) return 'chiusa positiva';
  const desc = righe.find((r) => r.stato_desc)?.stato_desc;
  return desc ? desc.toLowerCase() : 'aperta';
}

export function confrontaEsitiSito(
  file: readonly RigaEsecuzione[],
  registro: readonly RigaRegistroPerConfronto[],
  /** Gli ODL con un intervento della giornata ancora aperto: esclusi dalle code, solo contati. */
  inLavorazione: ReadonlySet<string> = new Set(),
  /** Il giorno della lettura (ISO): le chiusure di questo giorno non sono ancora «mancanti sul sito». */
  oggi: string | null = null,
): ConfrontoEsiti {
  const perOdlRegistro = new Map<string, RigaRegistroPerConfronto[]>();
  for (const r of registro) {
    const odl = norm(r.odl);
    if (odl === '') continue;
    perOdlRegistro.set(odl, [...(perOdlRegistro.get(odl) ?? []), r]);
  }

  let allineati = 0;
  let nonEsitatiSito = 0;
  let inLavorazioneOggi = 0;
  const daChiudereDaNoi: VoceDaChiudere[] = [];
  const sconosciuti: string[] = [];
  const impiantiDifformi: ImpiantoDifforme[] = [];
  const esitatiSito = new Set<string>();

  for (const f of file) {
    const righe = perOdlRegistro.get(f.odl);
    const sito = classificaEsitoSito(f.esito);
    /*
      Solo il POSITIVO segna l'ODL come registrato sul sito. Un «NON ESEGUITO» è un esito, ma
      non è la registrazione del nostro lavoro: se da noi la riga è chiusa eseguita, il sito è
      indietro di un aggiornamento — e deve finire nella coda inversa, «da registrare sul sito».
    */
    if (sito === 'positivo') esitatiSito.add(f.odl);
    if (!righe) {
      sconosciuti.push(f.odl);
      continue;
    }
    const impiantoRegistro = righe.find((r) => norm(r.impianto) !== '')?.impianto;
    if (f.impianto !== '' && impiantoRegistro && norm(impiantoRegistro) !== f.impianto) {
      impiantiDifformi.push({ odl: f.odl, impiantoSito: f.impianto, impiantoRegistro: norm(impiantoRegistro) });
    }
    if (sito === 'assente') {
      nonEsitatiSito++;
      continue;
    }
    const nostro = verdettoRegistro(righe);
    if (nostro === sito) {
      // Le due mani dicono la stessa cosa. Vale per il «fatto da tutt'e due» come per il «non
      // eseguito da tutt'e due»: era il secondo a mancare, e ogni «NON ESEGUITO» del file
      // finiva accusato come nostra dimenticanza proprio mentre l'esito nostro era corretto.
      allineati++;
      continue;
    }
    if (nostro === 'positivo') {
      // Noi eseguito, il sito no: il nostro esito non manca affatto. La coda giusta è quella
      // inversa qui sotto, che lo raccoglie da sé; elencarlo anche qui lo farebbe comparire
      // in due code opposte, ciascuna a chiedere all'altra mano di scrivere.
      continue;
    }
    if (inLavorazione.has(f.odl)) {
      inLavorazioneOggi++;
      continue;
    }
    daChiudereDaNoi.push({
      odl: f.odl,
      esitoSito: f.esito,
      dataSito: f.dataFine,
      nominativo: righe.find((r) => r.nominativo)?.nominativo ?? null,
      comune: righe.find((r) => r.comune)?.comune ?? null,
      statoNostro: statoNostro(righe),
    });
  }

  /*
    La direzione opposta: chiusi positivi da NOI che il sito non dà come effettuati. Tre modi
    di non darlo — l'ODL manca dal file, c'è senza esito, oppure c'è con un «NON ESEGUITO»
    che il nostro rapportino ha poi smentito. È la coda «da registrare sul sito» dell'ufficio.
  */
  const mancantiSulSito: VoceMancanteSito[] = [];
  let chiusiOggi = 0;
  for (const [odl, righe] of perOdlRegistro) {
    if (esitatiSito.has(odl)) continue;
    const chiusa = righe.find((r) => !r.aperto && r.esito_positivo === true);
    if (!chiusa) continue;
    if (oggi !== null && (chiusa.data_completamento ?? '') >= oggi) {
      chiusiOggi++;
      continue;
    }
    mancantiSulSito.push({
      odl,
      chiusaIl: chiusa.data_completamento,
      nominativo: righe.find((r) => r.nominativo)?.nominativo ?? null,
      comune: righe.find((r) => r.comune)?.comune ?? null,
    });
  }
  mancantiSulSito.sort((a, b) => (a.chiusaIl ?? '').localeCompare(b.chiusaIl ?? '') || a.odl.localeCompare(b.odl));
  daChiudereDaNoi.sort((a, b) => a.dataSito.localeCompare(b.dataSito) || a.odl.localeCompare(b.odl));

  return {
    allineati, daChiudereDaNoi, inLavorazioneOggi, mancantiSulSito, chiusiOggi,
    nonEsitatiSito, sconosciuti, impiantiDifformi, totaleFile: file.length,
  };
}
