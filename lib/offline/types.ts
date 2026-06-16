/** Tipi del data layer offline (condivisi tra logica pura e adapter IndexedDB). */

export type OutboxType = 'voce' | 'foto' | 'agenda' | 'manuale' | 'invia';
export type OutboxStato = 'in_attesa' | 'in_invio' | 'errore' | 'bloccato';

// `taskId` (chiave stabile della voce, opzionale per retro-compatibilità con item già in coda):
// permette al server di riagganciare il salvataggio anche se l'`id` della voce è ruotato per
// una rigenerazione del rapportino dall'ufficio (delete+insert → id nuovi).
export type PayloadVoce = { voceId: string; risposte: Record<string, unknown>; taskId?: string };
export type PayloadFoto = { voceId: string; chiave: string; blobId: string; clientKey: string };
export type PayloadAgenda = {
  interventoId: string;
  azione: 'fatto' | 'non_fatto';
  causale?: string | null;
  motivo?: string | null;
};
export type PayloadManuale = {
  richiestaId: string;
  committente: string;
  anagrafica: Record<string, unknown>;
  risposte: Record<string, unknown>;
  note?: string | null;
  parentVoceId?: string | null;
  fotoBlobRefs: Array<{ chiave: string; blobId: string }>;
};
export type PayloadInvia = Record<string, never>;

export type OutboxItem =
  | { id: string; type: 'voce'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadVoce }
  | { id: string; type: 'foto'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadFoto }
  | { id: string; type: 'agenda'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadAgenda }
  | { id: string; type: 'manuale'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadManuale }
  | { id: string; type: 'invia'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadInvia };

export type SnapshotRapportino = { token: string; tipo: 'rapportino'; aggiornatoIl: number; dati: unknown };
export type SnapshotAgenda = { token: string; tipo: 'agenda'; aggiornatoIl: number; dati: unknown };
export type Snapshot = SnapshotRapportino | SnapshotAgenda;

export type LavoroVoce = {
  chiave: string;
  token: string;
  voceId: string;
  /** Chiave stabile della voce (sopravvive alle rigenerazioni del rapportino). Opzionale: i record salvati prima dell'introduzione non l'hanno. */
  taskId?: string;
  risposte: Record<string, unknown>;
  aggiornatoIl: number;
};

/** Stato del badge di salvataggio lato form (estende i casi UI). */
export type SaveStateOffline = 'idle' | 'saving' | 'saved' | 'error' | 'queued' | 'bloccato';
