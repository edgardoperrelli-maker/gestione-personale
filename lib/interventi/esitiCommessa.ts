// Catalogo esiti per commessa (gemello di utils/rapportini/infoCampi.ts).
// L'enum DB `interventi.esito` resta il superset: qui si sceglie QUALI esiti
// mostrare per ogni committente e con quale etichetta. Niente cablato su Acea
// nella UI/API: tutto passa da questo modulo.

import type { EsitoIntervento } from './statoInterventi';

export type Committente = 'acea' | 'italgas' | 'altro';

export interface EsitoConfig {
  chiave: EsitoIntervento;
  etichetta: string;
  richiedeMotivo: boolean;
}

/** Esito "positivo" associato al pulsante Fatto. */
const OK: EsitoConfig = { chiave: 'eseguito_positivo', etichetta: 'Eseguito', richiedeMotivo: false };

/** Catalogo etichette/regole di tutte le causali KO note (superset enum DB). */
const CAUSALI: Record<Exclude<EsitoIntervento, 'eseguito_positivo'>, EsitoConfig> = {
  accesso_negato: { chiave: 'accesso_negato', etichetta: 'Accesso negato', richiedeMotivo: true },
  contatore_non_trovato: { chiave: 'contatore_non_trovato', etichetta: 'Contatore non trovato', richiedeMotivo: true },
  dati_ubicazione_insufficienti: { chiave: 'dati_ubicazione_insufficienti', etichetta: 'Dati ubicazione insufficienti', richiedeMotivo: true },
  accesso_a_vuoto: { chiave: 'accesso_a_vuoto', etichetta: 'Accesso a vuoto', richiedeMotivo: true },
  rinviato: { chiave: 'rinviato', etichetta: 'Rinviato', richiedeMotivo: true },
};

type CausaleKey = keyof typeof CAUSALI;

/** Causali mostrate per ogni commessa. Le commesse non Acea usano il set default. */
const DEFAULT_CAUSALI: CausaleKey[] = ['accesso_negato', 'accesso_a_vuoto', 'rinviato'];

const PER_COMMESSA: Record<Committente, CausaleKey[]> = {
  acea: ['accesso_negato', 'contatore_non_trovato', 'dati_ubicazione_insufficienti', 'accesso_a_vuoto', 'rinviato'],
  italgas: DEFAULT_CAUSALI,
  altro: DEFAULT_CAUSALI,
};

function isCommittente(value: string): value is Committente {
  return value === 'acea' || value === 'italgas' || value === 'altro';
}

/**
 * Esiti disponibili per una commessa: `ok` (Fatto) + `causali` (Non fatto).
 * Committente sconosciuto/assente → fallback al set default.
 */
export function esitiPerCommessa(committente: string | null | undefined): {
  ok: EsitoConfig;
  causali: EsitoConfig[];
} {
  const key = (committente ?? '').toLowerCase();
  const causaliKeys = isCommittente(key) ? PER_COMMESSA[key] : DEFAULT_CAUSALI;
  return { ok: OK, causali: causaliKeys.map((c) => CAUSALI[c]) };
}

/** True se la chiave è una causale valida per quella commessa. */
export function causaleValida(committente: string | null | undefined, chiave: string): boolean {
  return esitiPerCommessa(committente).causali.some((c) => c.chiave === chiave);
}
