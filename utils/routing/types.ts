export interface Task {
  id: string;
  odl: string;
  pdr?: string;
  indirizzo: string;
  cap: string;
  citta: string;
  priorita: number;
  fascia_oraria: string;
  durata_min?: number;
  lat?: number;
  lng?: number;
  requiresTwoOperators?: boolean;
  // Campi ATTGIORN
  nominativo?: string;
  matricola?: string;
  recapito?: string;
  accessibilita?: string;
  attivita?: string;
  codice?: string;
  isAppointment?: boolean;
  appointmentId?: string;
  appointmentDate?: string;
  // Stato operativo (popolato solo quando il Task viene da un intervento del giorno)
  stato?: string;
  esito?: string | null;
}

export interface OperatorBase {
  lat: number;
  lng: number;
}

export type ScheduleEntry = {
  /** id del Task a cui si riferisce (allineato a orderedTasks). */
  taskId: string;
  /** Orario stimato di arrivo, in minuti da mezzanotte (es. 480 = 08:00). */
  etaMin: number;
  /** true se l'arrivo supera la fine della finestra oraria del task. */
  inRitardo: boolean;
};

export interface RouteResult {
  /** Sequenza ottimizzata, oggetti Task completi */
  orderedTasks: Task[];
  /** Distanza totale Haversine in km, 2 decimali */
  totalDistanceKm: number;
  /** Coordinate per Leaflet/MapLibre — include il punto base se fornito */
  polyline: Array<{ lat: number; lng: number }>;
  /** ETA per tappa (presente solo nei percorsi col motore tempi). */
  schedule?: ScheduleEntry[];
}
