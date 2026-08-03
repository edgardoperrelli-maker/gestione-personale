// lib/acea/pianificazione.ts
// PURA: decide cosa fare per ogni ordine selezionato quando si assegna operatore e giorno.
//
// Tre esiti possibili, e nessuna scrittura silenziosa: chi pianifica deve sapere quali righe non
// sono state toccate e perché — in Excel una riga saltata sparisce senza dire niente, ed è uno
// dei modi in cui il master si disallinea dalla realtà.

import type { Famiglia } from './famiglia';

export type OrdineDaPianificare = {
  odl: string;
  numero_operazione: string;
  /** `acea_ordini.id`, per il collegamento intervento ↔ ordine. */
  ordine_id?: string | null;
  aperto: boolean;
  attivita: string | null;
  comune: string | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  matricola: string | null;
  /*
    L'anagrafica del punto e dell'utente, che l'intervento si porta dietro fino al rapportino.

    Non è decorazione della tabella: sono i tre campi che l'operatore legge sul posto —
    il codice con cui il committente identifica la fornitura, chi ci abita, il numero da
    chiamare se non risponde nessuno. Prima non arrivavano: la pianificazione dal registro
    creava l'intervento senza, e il rapportino nasceva monco (le 25 righe del 03/08).

    Tutti nullable e vuoti su ACEA — il suo export non porta l'anagrafica dell'utente, e il
    suo impianto sull'intervento arriva già per altre strade.
  */
  impianto?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
  /**
   * `true` se l'ordine è un'attivazione (riapertura `RIAT`/`REVO`).
   *
   * Serve al venerdì e al sabato, che accettano solo quelle. Passata come booleano già deciso e
   * non come codice SLA: la definizione di «riapertura» sta in `scadenza.ts` (`eRiapertura`) ed è
   * la stessa che decide la scadenza a un giorno — averne due copie significherebbe poterle far
   * divergere, e la seconda si accorgerebbe con settimane di ritardo.
   */
  riapertura?: boolean;
  /**
   * Famiglia della riga. Serve a due cose: alle route per il cancello del tabellone
   * (`controllaAssegnazioni` filtra gli assegnabili sull'attività della famiglia), e QUI per il
   * venerdì e il sabato — la regola «solo attivazioni» è del SOLO dunning: le limitazioni massive
   * (dec. 38) e AcquaLatina (campagna per conto suo, i codici SLA di ACEA non la riguardano) sono
   * esenti. Assente = dunning, cioè la regola piena: si sbaglia per difetto.
   */
  famiglia?: Famiglia;
};

/** Intervento già esistente sulla stessa unità di lavoro (qualunque data). */
export type InterventoEsistente = {
  id: string;
  odl: string;
  data: string;
  staff_id: string | null;
  stato: string;
  /**
   * Esito registrato (`eseguito_positivo` = lavoro fatto). La distinzione è tutta qui: nel
   * dunning `completato` significa «uscita chiusa dall'operatore», e la maggior parte delle
   * uscite si chiude a vuoto (utente assente, contatore inaccessibile) con esito nullo — l'ordine
   * su ACEA resta aperto e la squadra ci deve TORNARE. Solo il positivo chiude l'unità per
   * sempre: è l'invariante «ODL positivo = definitivamente chiuso», la stessa dell'indice unique
   * e dello sweep.
   */
  esito?: string | null;
  /** Matricola dell'intervento: serve al confronto quando l'unità è `odl_matricola`. */
  matricola?: string | null;
};

export type MotivoSalto = 'ordine_chiuso' | 'gia_completato' | 'solo_attivazioni' | 'giorno_occupato';

export type AzionePianifica =
  | { tipo: 'crea'; ordine: OrdineDaPianificare }
  | {
      tipo: 'aggiorna';
      ordine: OrdineDaPianificare;
      interventoId: string;
      /** Stato precedente, per l'annullamento dell'operazione. */
      prima: { data: string; staff_id: string | null };
    }
  | { tipo: 'salta'; ordine: OrdineDaPianificare; motivo: MotivoSalto };

export type PianoPianificazione = {
  azioni: AzionePianifica[];
  /** Conteggi pronti per il messaggio di esito. */
  creati: number;
  aggiornati: number;
  saltati: number;
};

export type ArgomentiPianifica = {
  ordini: readonly OrdineDaPianificare[];
  /** Interventi esistenti sugli ODL selezionati (tutti, non solo quelli del giorno). */
  esistenti: readonly InterventoEsistente[];
  /** Giorno di lavoro assegnato, 'YYYY-MM-DD'. */
  data: string;
  staffId: string;
  /** `true` se quel giorno accetta solo attivazioni (venerdì e sabato). */
  soloAttivazioni?: boolean;
  /**
   * Unità su cui si confrontano ordini e interventi esistenti. `odl` (default, ACEA: più
   * operazioni dello stesso ordine sono lo stesso passaggio sul posto) o `odl_matricola`
   * (AcquaLatina: un ordine copre più contatori, ognuno si pianifica per conto suo — con la
   * chiave sul solo ODL, pianificare il secondo contatore SPOSTEREBBE l'intervento del primo).
   */
  unita?: 'odl' | 'odl_matricola';
};

/**
 * Piano di pianificazione.
 *
 * Invarianti rispettate:
 *  - un ordine ACEA già chiuso (COMP/ANNL) non si pianifica: non c'è più niente da fare;
 *  - un ODL con un ESITO POSITIVO non si ripianifica: «ODL positivo = definitivamente chiuso».
 *    Un'uscita chiusa a vuoto (completato senza esito positivo) invece NON blocca: l'ordine su
 *    ACEA è ancora aperto e la prossima uscita è esattamente il lavoro da pianificare — è il
 *    caso normale del dunning, che sullo stesso ODL torna anche sei volte;
 *  - il lavoro registrato non si tocca: un intervento completato non è MAI candidato allo
 *    spostamento — stessa regola di `spostamento_completato` nel motore rapportini. Si crea
 *    un'uscita nuova, la vecchia resta con la sua data e il suo operatore;
 *  - un giorno che ha già un'uscita registrata su quell'unità non si riusa: crearcene o
 *    spostarcene una violerebbe l'unique `(committente, odl, data)` — meglio un rifiuto che si
 *    legge di un errore 500;
 *  - un ODL con un intervento aperto viene SPOSTATO (data e operatore), non duplicato: due
 *    interventi aperti sullo stesso ODL manderebbero due squadre allo stesso indirizzo;
 *  - il venerdì e il sabato il DUNNING manda solo le ATTIVAZIONI: hanno un giorno di cardine
 *    contrattuale e non possono aspettare il lunedì, il resto del dunning sì. Le limitazioni
 *    MASSIVE sono ESENTI per decisione esplicita (dec. 38): sono campagne per paese e si
 *    pianificano anche in quei giorni.
 */
export function pianoPianificazione({
  ordini, esistenti, data, staffId, soloAttivazioni = false, unita = 'odl',
}: ArgomentiPianifica): PianoPianificazione {
  // Matricola normalizzata per la chiave composta: il registro e `interventi` possono differire
  // per maiuscole o separatori, e una chiave che non coincide duplica l'intervento.
  const normMatr = (m: string | null | undefined): string =>
    String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const chiave = (odl: string, matricola: string | null | undefined): string =>
    unita === 'odl_matricola' ? `${odl}#${normMatr(matricola)}` : odl;

  const perUnita = new Map<string, InterventoEsistente[]>();
  for (const i of esistenti) {
    const k = chiave(i.odl, i.matricola);
    const lista = perUnita.get(k) ?? [];
    lista.push(i);
    perUnita.set(k, lista);
  }

  const azioni: AzionePianifica[] = [];
  /** Unità già decise in QUESTA chiamata: la seconda riga della stessa unità non ripete. */
  const decise = new Set<string>();
  for (const o of ordini) {
    if (!o.aperto) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'ordine_chiuso' });
      continue;
    }
    // Prima di guardare gli interventi: su un giorno di sole attivazioni una limitazione di
    // dunning non ci va, nemmeno per SPOSTARCI un intervento che esiste già. Massive e
    // AcquaLatina passano: la regola è del dunning, non del giorno.
    if (soloAttivazioni && (o.famiglia ?? 'dunning') === 'dunning' && o.riapertura !== true) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'solo_attivazioni' });
      continue;
    }
    const k = chiave(o.odl, o.matricola);
    /*
      Più operazioni della stessa unità nella stessa chiamata sono righe diverse in griglia ma LO
      STESSO passaggio sul posto: la prima riga decide, le successive non aggiungono niente. Senza
      questo cancello uscivano due `crea` identiche — e la seconda INSERT esplodeva sull'unique
      `(committente, odl, data)` a scrittura già iniziata.
    */
    if (decise.has(k)) continue;
    const suOdl = perUnita.get(k) ?? [];
    // Il POSITIVO chiude l'unità per sempre. Il solo stato `completato` no: è un'uscita chiusa,
    // non un lavoro riuscito — e con l'ordine ancora aperto la squadra ci deve tornare.
    if (suOdl.some((i) => i.stato !== 'annullato' && i.esito === 'eseguito_positivo')) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'gia_completato' });
      continue;
    }
    // Fra gli aperti si sposta il più recente: è quello che qualcuno ha in mano adesso.
    // I completati non sono candidati: il lavoro registrato non si tocca.
    const aperto = [...suOdl]
      .filter((i) => i.stato !== 'annullato' && i.stato !== 'completato')
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    // Il giorno scelto è già occupato da un ALTRO intervento dell'unità (un'uscita registrata,
    // un annullato, un secondo aperto): scriverci violerebbe l'unique `(committente, odl, data)`.
    // Gli annullati qui CONTANO — per la pianificazione non esistono, ma la riga in tabella c'è
    // e l'indice unique la vede.
    const giornoOccupato = suOdl.some((i) => i.data === data && i.id !== aperto?.id);
    if (aperto) {
      // Già su questo giorno e questo operatore: nessuna scrittura, ma non è un "salto" da
      // segnalare come problema — si conta come aggiornamento a vuoto solo se qualcosa cambia.
      if (aperto.data === data && aperto.staff_id === staffId) continue;
      // Il cancello vale solo se la data CAMBIA: a data invariata (cambio del solo esecutore)
      // l'UPDATE non tocca la tupla dell'unique, e il giorno «occupato» — per forza una riga di
      // un altro committente, o un'altra matricola normalizzata — non ha niente da dire.
      if (aperto.data !== data && giornoOccupato) {
        azioni.push({ tipo: 'salta', ordine: o, motivo: 'giorno_occupato' });
        continue;
      }
      decise.add(k);
      azioni.push({
        tipo: 'aggiorna',
        ordine: o,
        interventoId: aperto.id,
        prima: { data: aperto.data, staff_id: aperto.staff_id },
      });
      continue;
    }
    if (giornoOccupato) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'giorno_occupato' });
      continue;
    }
    decise.add(k);
    azioni.push({ tipo: 'crea', ordine: o });
  }

  return {
    azioni,
    creati: azioni.filter((a) => a.tipo === 'crea').length,
    aggiornati: azioni.filter((a) => a.tipo === 'aggiorna').length,
    saltati: azioni.filter((a) => a.tipo === 'salta').length,
  };
}

/**
 * Etichetta leggibile del motivo di salto, per il messaggio all'utente.
 *
 * La famiglia serve a UNA frase, e non è un dettaglio: «ordine già chiuso su ACEA» su una riga
 * AcquaLatina nomina un committente che con quella commessa non c'entra, e manda a cercare la
 * causa dove non c'è (è successo il 03/08, sulle 12 righe di via Tuccia). Lì la chiusura la
 * scriviamo noi, e la si scrive per UN motivo solo: il lavoro è stato fatto.
 */
export function etichettaMotivo(m: MotivoSalto, famiglia: Famiglia = 'dunning'): string {
  if (m === 'ordine_chiuso') {
    return famiglia === 'acqualatina'
      ? 'riga già chiusa: contatore sostituito, non si ripianifica'
      : 'ordine già chiuso su ACEA';
  }
  if (m === 'solo_attivazioni') return 'non è un’attivazione: venerdì e sabato passano solo quelle';
  if (m === 'giorno_occupato') {
    // Su AcquaLatina l'unità è ODL+matricola: «su questo ODL» manderebbe a cercare il conflitto
    // sull'ordine intero, che in un condominio sono fino a cinque contatori diversi.
    return famiglia === 'acqualatina'
      ? 'quel giorno c’è già un’uscita su questo contatore'
      : 'quel giorno è già occupato su questo ODL';
  }
  return 'già eseguito con esito positivo: non si ripianifica';
}
