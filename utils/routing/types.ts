export interface Task {
  id: string;
  odl: string;
  odsin?: string;
  indirizzo: string;
  cap: string;
  citta: string;
  priorita: number;
  fascia_oraria: string;
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
}

export interface OperatorBase {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Sequenza ottimizzata, oggetti Task completi */
  orderedTasks: Task[];
  /** Distanza totale Haversine in km, 2 decimali */
  totalDistanceKm: number;
  /** Coordinate per Leaflet/MapLibre — include il punto base se fornito */
  polyline: Array<{ lat: number; lng: number }>;
}
