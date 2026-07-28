// lib/acea/tipi.ts
// Forma di una riga del registro ACEA, come esce dal parsing dell'export.
// Rispecchia le colonne di `acea_ordini` (migration 20260727090000).

import type { Famiglia } from './famiglia';

/** Una riga dell'export già interpretata: campi ACEA + i derivati calcolati in ingestione. */
export type RigaOrdineAcea = {
  // identità
  odl: string;
  numero_operazione: string;

  // provenienza
  contratto: string | null;
  fornitore: string | null;

  // classificazione
  tipo_ordine: string | null;
  famiglia: Famiglia;
  denominazione: string | null;
  attivita: string | null;
  chiave_testo: string | null;
  testo_ordine: string | null;

  // stato
  stato: string;
  stato_desc: string | null;
  aperto: boolean;

  // date
  data_creazione: string;
  cardine_dal: string | null;
  cardine_al: string | null;
  data_completamento: string | null;
  chiusura_tecnica: string | null;
  scadenza: string | null;

  // operatore assegnato su ACEA
  cid: string | null;
  operatore_cognome: string | null;
  operatore_nome: string | null;

  // esito ACEA
  causale: string | null;
  causale_desc: string | null;
  esito_positivo: boolean | null;
  testo_conferma: string | null;

  // localizzazione
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  frazione: string | null;
  sede_tecnica: string | null;
  sede_tecnica_desc: string | null;

  // misuratore
  impianto: string | null;
  matricola: string | null;
  matricola_norm: string | null;
  origine_misuratore: 'colonna' | 'testo' | null;
  sospetto_troncamento: boolean;

  // economia
  valore_netto: number | null;
  documento_acquisto: string | null;
  posizione_documento: string | null;
  documento_chiusura: string | null;
  wbs: string | null;
  escludi_consuntivazione: boolean;
  odm_riferimento: string | null;
  odm_operazione_riferimento: string | null;

  // organizzazione
  codice_sla: string | null;
  priorita: string | null;
  priorita_testo: string | null;
  centro_lavoro: string | null;
  tam: string | null;
  direttore_operativo: string | null;
  avviso: string | null;
  codice_accesso: string | null;

  // integrità
  riga_hash: string;
};

/** Avviso non bloccante emerso durante il parsing di una riga. */
export type AvvisoRiga = {
  odl: string;
  numero_operazione: string;
  tipo: 'tipo_ordine_ignoto' | 'sospetto_troncamento' | 'misuratore_assente' | 'stato_ignoto';
  dettaglio: string;
  /**
   * In quale dei due registri e` finita la riga.
   *
   * Serve a poterci ANDARE: un avviso che dice «6 righe da controllare» senza dire quali, e senza
   * un modo di raggiungerle, e` un numero che si legge e si dimentica. Le due viste sono separate,
   * quindi senza famiglia il link non saprebbe dove mandare.
   */
  famiglia: 'dunning' | 'massive';
};
