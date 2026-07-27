// lib/acea/pianificazione.ts
// PURA: decide cosa fare per ogni ordine selezionato quando si assegna operatore e giorno.
//
// Tre esiti possibili, e nessuna scrittura silenziosa: chi pianifica deve sapere quali righe non
// sono state toccate e perché — in Excel una riga saltata sparisce senza dire niente, ed è uno
// dei modi in cui il master si disallinea dalla realtà.

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
};

/** Intervento già esistente sullo stesso ODL (qualunque data). */
export type InterventoEsistente = {
  id: string;
  odl: string;
  data: string;
  staff_id: string | null;
  stato: string;
};

export type MotivoSalto = 'ordine_chiuso' | 'gia_completato';

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
 *    manderebbero due squadre allo stesso indirizzo.
 */
export function pianoPianificazione({
  ordini, esistenti, data, staffId,
}: ArgomentiPianifica): PianoPianificazione {
  const perOdl = new Map<string, InterventoEsistente[]>();
  for (const i of esistenti) {
    const lista = perOdl.get(i.odl) ?? [];
    lista.push(i);
    perOdl.set(i.odl, lista);
  }

  const azioni: AzionePianifica[] = [];
  for (const o of ordini) {
    if (!o.aperto) {
      azioni.push({ tipo: 'salta', ordine: o, motivo: 'ordine_chiuso' });
      continue;
    }
    const suOdl = perOdl.get(o.odl) ?? [];
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
  return m === 'ordine_chiuso'
    ? 'ordine già chiuso su ACEA'
    : 'intervento già completato: non si sposta';
}
