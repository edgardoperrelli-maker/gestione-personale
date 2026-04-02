export interface Task {
  id: string;
  odl: string;
  indirizzo: string;
  cap: string;
  citta: string;
  priorita: number;
  fascia_oraria: string;
  lat?: number;
  lng?: number;
  requiresTwoOperators?: boolean;
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
