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
 * Stile riga a tema neon: fondo soft + colore pieno saturo per barra/etichetta.
 * Usa gli esadecimali neon già impiegati nel progetto (Live: blu #38bdf8 "in corso",
 * verde #22c55e "Fatto") + arancione neon #fb923c. Solo gli stati con evidenza
 * richiesta; gli altri restano neutri.
 */
export const STATO_ROW_TINT: Partial<Record<StatoMisuratore, { bg: string; accent: string }>> = {
  scaricato_deposito:       { bg: 'rgba(251, 146, 60, 0.18)', accent: '#fb923c' }, // arancione neon
  in_consegna_committente:  { bg: 'rgba(56, 189, 248, 0.18)', accent: '#38bdf8' }, // blu neon (sky)
  consegnato_committente:   { bg: 'rgba(34, 197, 94, 0.18)',  accent: '#22c55e' }, // verde neon
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
