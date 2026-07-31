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
  /** Matricola dell'intervento: serve al confronto quando l'unità è `odl_matricola`. */
  matricola?: string | null;
};

export type MotivoSalto = 'ordine_chiuso' | 'gia_completato' | 'solo_attivazioni';

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
 *  - un ODL con un intervento GIÀ COMPLETATO non si sposta — stessa regola di
 *    `spostamento_completato` nel motore rapportini: il lavoro registrato non si tocca;
 *  - un ODL con un intervento aperto viene SPOSTATO (data e operatore), non duplicato: due
 *    interventi sullo stesso ODL violerebbero l'unique `(committente, odl, data)` e, peggio,
 *    manderebbero due squadre allo stesso indirizzo;
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
    const suOdl = perUnita.get(chiave(o.odl, o.matricola)) ?? [];
    if (suOdl.some((i) => i.stato === 'completato')) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'gia_completato' });
      continue;
    }
    // Fra gli aperti si sposta il più recente: è quello che qualcuno ha in mano adesso.
    const aperto = [...suOdl]
      .filter((i) => i.stato !== 'annullato')
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    if (aperto) {
      // Già su questo giorno e questo operatore: nessuna scrittura, ma non è un "salto" da
      // segnalare come problema — si conta come aggiornamento a vuoto solo se qualcosa cambia.
      if (aperto.data === data && aperto.staff_id === staffId) continue;
      azioni.push({
        tipo: 'aggiorna',
        ordine: o,
        interventoId: aperto.id,
        prima: { data: aperto.data, staff_id: aperto.staff_id },
      });
      continue;
    }
    azioni.push({ tipo: 'crea', ordine: o });
  }

  return {
    azioni,
    creati: azioni.filter((a) => a.tipo === 'crea').length,
    aggiornati: azioni.filter((a) => a.tipo === 'aggiorna').length,
    saltati: azioni.filter((a) => a.tipo === 'salta').length,
  };
}

/** Etichetta leggibile del motivo di salto, per il messaggio all'utente. */
export function etichettaMotivo(m: MotivoSalto): string {
  if (m === 'ordine_chiuso') return 'ordine già chiuso su ACEA';
  if (m === 'solo_attivazioni') return 'non è un’attivazione: venerdì e sabato passano solo quelle';
  return 'intervento già completato: non si sposta';
}
