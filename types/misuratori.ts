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
   * Numero del pallet di riferimento: assegnato in blocco quando la cesta si riempie, è il
   * riferimento con cui la riconsegna viaggia. `null` = ancora in cesta.
   */
  pallet?: string | null;
  /**
   * Numero della cesta di magazzino (solo registro AcquaLatina): lo dichiara l'OPERATORE
   * all'invio del rapportino, quando scarica i contatori. È il gradino prima del pallet.
   * `null` = ancora da scaricare (e infatti si accompagna a `da_consegnare_deposito`).
   */
  cesta?: string | null;
  stato: StatoMisuratore;
  note: string | null;
  created_at: string;
  updated_at: string;
}
