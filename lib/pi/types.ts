// Tipi condivisi del modulo Pronto Intervento (P.I.).
// Spec: docs/superpowers/specs/2026-06-26-pronto-intervento-campo-design.md

/** Foglia territoriale (appalto P.I.). */
export type PiArea = {
  codice: string;
  label: string;
  attiva: boolean;
  ordine: number;
};

/** Stato calcolato di un link P.I. rispetto alla finestra di validità. */
export type PiTokenStato = 'non_attivo' | 'valido' | 'scaduto' | 'revocato';

/** Riga `pi_token` come letta dal DB (campi usati da route/UI). */
export type PiTokenRow = {
  id: string;
  area_codice: string;
  template_id: string | null;
  campi_snapshot: unknown[];
  valido_dal: string;
  valido_al: string;
  token: string;
  note: string | null;
  revocato_at: string | null;
};

/** Operatore reperibile risolto (dal cronoprogramma) per una data. */
export type ReperibileRef = { staffId: string; nome: string };

/** Riga di listino `pi_articoli`. */
export type PiArticolo = {
  area_codice: string;
  codice: string;
  descrizione: string | null;
  unita_misura: string | null;
  prezzo_unitario: number;
  attivo: boolean;
  ordine: number;
};

/** Riga di contabilità `pi_contabilita_righe` (valore = colonna generata in DB). */
export type PiContabilitaRiga = {
  id: string;
  intervento_id: string | null;
  area_codice: string;
  articolo_codice: string;
  quantita: number;
  prezzo_snapshot: number;
  unita_misura: string | null;
  valore: number;
};
