// Tipi condivisi per le richieste di intervento manuale.
import type { InfoChiave } from '@/utils/rapportini/infoCampi';

export const STATI_RICHIESTA = ['in_attesa', 'approvato', 'rifiutato', 'auto_liberi', 'annullato'] as const;
export type StatoRichiesta = (typeof STATI_RICHIESTA)[number];

export const CORSIE_RICHIESTA = ['normale', 'liberi'] as const;
export type CorsiaRichiesta = (typeof CORSIE_RICHIESTA)[number];

export type CommittenteManuale = 'acea' | 'italgas' | 'altro' | 'lim_massive';

/** Anagrafica compilata dall'operatore: sottoinsieme delle chiavi info, tutte string. */
export type AnagraficaManuale = Partial<Record<InfoChiave, string>>;

/** Payload "dati" di una richiesta: anagrafica (info_campi) + risposte (campi template). */
export type DatiInterventoManuale = {
  committente: CommittenteManuale;
  anagrafica: AnagraficaManuale;
  risposte: Record<string, unknown>;
};

/** Riga di richiesta come letta dal DB (camel dei campi usati da UI/route). */
export type RigaRichiesta = {
  id: string;
  rapportino_id: string | null;
  voce_id: string | null;
  intervento_id: string | null;
  staff_id: string | null;
  staff_name: string | null;
  committente: CommittenteManuale;
  data: string | null;
  stato: StatoRichiesta;
  corsia: CorsiaRichiesta;
  dati_operatore: Record<string, unknown>;
  dati_correnti: Record<string, unknown>;
  note: string | null;
  motivo_rifiuto: string | null;
  created_at: string;
  /** uuid del backoffice che ha approvato/rifiutato (null finché in attesa). */
  deciso_da?: string | null;
  /** Nome del backoffice approvatore, risolto lato server dalla GET. */
  deciso_da_name?: string | null;
  /** Timestamp della decisione (approvazione/rifiuto). */
  deciso_at?: string | null;
};
