export type PlanningPhase = 1 | 2 | 3 | 4 | 5 | 6;

export interface PlanningPhaseInput {
  /** modale setup confermato */
  setupDone: boolean;
  /** piano riaperto dal registro */
  isEditMode: boolean;
  /** allTasks.length (excel + template) */
  totalTasks: number;
  /** appuntamenti filtrati per giorno */
  appointmentCount: number;
  /** task con lat/lng valide */
  geocoded: number;
  /** geocodifica in corso */
  isGeocoding: boolean;
  /** distribution !== null */
  hasDistribution: boolean;
  /** !!currentPianoId (piano salvato) */
  currentPianoId: boolean;
}

export interface PhaseMeta { id: PlanningPhase; key: string; label: string; }

export const PLANNING_PHASES: PhaseMeta[] = [
  { id: 1, key: 'setup',        label: 'Setup' },
  { id: 2, key: 'interventi',   label: 'Interventi' },
  { id: 3, key: 'geocodifica',  label: 'Geocodifica' },
  { id: 4, key: 'operatori',    label: 'Operatori' },
  { id: 5, key: 'distribuzione',label: 'Distribuzione' },
  { id: 6, key: 'conferma',     label: 'Conferma' },
];

/**
 * Fase corrente DERIVATA dallo state esistente: pura orientazione visiva,
 * non è una nuova fonte di verità e non altera alcun comportamento.
 * Pensata per il flusso principale Excel / interventi-del-giorno.
 */
export function computePlanningPhase(s: PlanningPhaseInput): PlanningPhase {
  if (!s.setupDone && !s.isEditMode) return 1;
  if (s.hasDistribution && s.currentPianoId) return 6;
  if (s.hasDistribution) return 5;
  if (s.totalTasks === 0 && s.appointmentCount === 0) return 2;
  if (s.totalTasks > 0 && (s.isGeocoding || s.geocoded < s.totalTasks)) return 3;
  return 4;
}
