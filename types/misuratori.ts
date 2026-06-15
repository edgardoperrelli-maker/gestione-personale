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

export const STATO_COLOR: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:   'bg-gray-100 text-gray-600',
  scaricato_deposito:       'bg-amber-100 text-amber-700',
  verificato_deposito:      'bg-blue-100 text-blue-700',
  in_consegna_committente:  'bg-orange-100 text-orange-700',
  consegnato_committente:   'bg-green-100 text-green-700',
};

/**
 * Tinta di sfondo riga a tema neon Aurea (OKLCH ad alta croma → resa "fluo" sul
 * navy, non smorta). Solo gli stati con evidenza richiesta; gli altri restano neutri.
 */
export const STATO_ROW_TINT: Partial<Record<StatoMisuratore, string>> = {
  scaricato_deposito:       'oklch(0.80 0.20 60 / 0.22)',   // arancione fluo
  in_consegna_committente:  'oklch(0.80 0.16 215 / 0.22)',  // blu neon (brand primary)
  consegnato_committente:   'oklch(0.74 0.21 145 / 0.22)',  // verde neon (brand green)
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
  stato: StatoMisuratore;
  note: string | null;
  created_at: string;
  updated_at: string;
}
