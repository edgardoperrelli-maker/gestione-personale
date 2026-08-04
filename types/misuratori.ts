export const STATI_MISURATORE = [
  'da_consegnare_deposito',
  'scaricato_deposito',
  'verificato_deposito',
  'in_consegna_committente',
  'consegnato_committente',
] as const;

export type StatoMisuratore = (typeof STATI_MISURATORE)[number];

export const STATO_LABEL: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:   'Da consegnare deposito',
  scaricato_deposito:       'Scaricato deposito',
  verificato_deposito:      'Verificato deposito',
  in_consegna_committente:  'In consegna committente',
  consegnato_committente:   'Consegnato committente',
};

export interface MisuratoreRimosso {
  id: string;
  intervento_id: string | null;
  rapportino_id: string | null;
  odl: string | null;
  data_esecuzione: string;
  esecutore: string | null;
  indirizzo: string | null;
  comune: string | null;
  matricola: string;
  pdr: string | null;
  /**
   * Numero della cesta di magazzino: il contenitore numerato in cui i contatori smontati si
   * scaricano, ed è quello con cui la riconsegna al committente viaggia — cesta e pallet erano
   * due nomi della stessa cosa, dal 2026-08-04 il riferimento è UNO.
   * Su AcquaLatina la dichiara l'OPERATORE all'invio del rapportino; su ACEA la scrive l'ufficio.
   * `null` = non ancora scaricato (e su AcquaLatina si accompagna a `da_consegnare_deposito`).
   */
  cesta?: string | null;
  stato: StatoMisuratore;
  note: string | null;
  created_at: string;
  updated_at: string;
}
