// tipi.ts — type condivisi del modulo Assegnazione AI.
// Importa da qui (non dal monolite) nei componenti estratti.

export type RigaPianificabile = {
  id: string;
  file: string;
  riga: number;
  odl: string | null;
  matricola: string | null;
  indirizzo: string | null;
  comune: string | null;
  data: string;
  esecutore: string | null;
  scansionato_il: string;
};

export type FileConfig = {
  file: string;
  committente: string;
  attivita: string;
  template_id: string | null;
};

export type StoricoRiga = {
  data_pianificata: string;
  comune: string;
  file: string | null;
  staff_name: string | null;
  n_interventi: number;
  creato_il: string;
};

export type AceaEsitoRiga = {
  odl: string;
  operatore_acea: string | null;
  esito: string;
  motivo: string | null;
  dry_run: boolean;
  creato_il: string;
};

export type AceaEsiti = {
  ultimoRun: {
    giorno: string | null;
    dryRun: boolean;
    lavori: number;
    aggiornate: number;
    scartati: number;
    errore: string | null;
    creato_il: string;
  } | null;
  righe: AceaEsitoRiga[];
  riepilogo: Record<string, number>;
};
