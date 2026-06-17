// lib/interventi/storico/types.ts
// Tipi e costanti condivisi della consultazione "Storico interventi".

/** Forma unificata di una riga storica (programmato o manuale non promosso). */
export type RigaStorico = {
  id: string;
  origine: 'programmato' | 'manuale';
  committente: string | null;
  data: string | null; // YYYY-MM-DD
  odl: string | null;
  pdr: string | null;
  matricola: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  attivita: string | null;
  fascia_oraria: string | null;
  esecutoreId: string | null;
  esecutoreNome: string | null;
  stato: string | null;
  statoLabel: string;
  esito: string | null;
  esitoLabel: string;
  motivo: string | null;
};

/** Riga grezza letta da `interventi`. */
export type InterventoStoricoRow = {
  id: string;
  origine: string | null;
  committente: string | null;
  data: string | null;
  odl: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
  staff_id: string | null;
  stato: string | null;
  esito: string | null;
  esito_motivo: string | null;
};

/** Riga grezza letta da `interventi_manuali` (non promossa: intervento_id NULL). */
export type ManualeStoricoRow = {
  id: string;
  committente: string | null;
  data: string | null;
  staff_id: string | null;
  staff_name: string | null;
  stato: string | null;
  motivo_rifiuto: string | null;
  dati_correnti: Record<string, unknown> | null;
  dati_operatore: Record<string, unknown> | null;
};

export const COMMITTENTE_OPZIONI: { value: string; label: string }[] = [
  { value: 'acea', label: 'Acea' },
  { value: 'italgas', label: 'Italgas' },
  { value: 'altro', label: 'Altro' },
  { value: 'lim_massive', label: 'Lim. massive' },
];

/** Stati possibili sulla tabella `interventi`. */
export const STATI_INTERVENTI = [
  'da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione', 'completato', 'annullato',
] as const;

/** Stati possibili su `interventi_manuali` non promossi. */
export const STATI_MANUALI = ['in_attesa', 'rifiutato', 'annullato'] as const;

export const STATO_LABELS: Record<string, string> = {
  da_assegnare: 'Da assegnare',
  assegnato: 'Assegnato',
  in_viaggio: 'In viaggio',
  sul_posto: 'Sul posto',
  in_esecuzione: 'In esecuzione',
  completato: 'Completato',
  annullato: 'Annullato',
  in_attesa: 'In attesa (manuale)',
  rifiutato: 'Rifiutato (manuale)',
};

export const STATO_OPZIONI: { value: string; label: string }[] = [
  { value: 'da_assegnare', label: 'Da assegnare' },
  { value: 'assegnato', label: 'Assegnato' },
  { value: 'in_viaggio', label: 'In viaggio' },
  { value: 'sul_posto', label: 'Sul posto' },
  { value: 'in_esecuzione', label: 'In esecuzione' },
  { value: 'completato', label: 'Completato' },
  { value: 'annullato', label: 'Annullato' },
  { value: 'in_attesa', label: 'In attesa (manuale)' },
  { value: 'rifiutato', label: 'Rifiutato (manuale)' },
];

export const ESITO_LABELS: Record<string, string> = {
  eseguito_positivo: 'Eseguito positivo',
  accesso_negato: 'Accesso negato',
  contatore_non_trovato: 'Contatore non trovato',
  dati_ubicazione_insufficienti: 'Dati ubicazione insufficienti',
  accesso_a_vuoto: 'Accesso a vuoto',
  rinviato: 'Rinviato',
};

export const ESITO_OPZIONI: { value: string; label: string }[] =
  Object.entries(ESITO_LABELS).map(([value, label]) => ({ value, label }));

/** Risposta dell'endpoint storico. */
export type RispostaStorico = {
  righe: RigaStorico[];
  total: number;
  troncato: boolean;
  pageSize: number;
};
