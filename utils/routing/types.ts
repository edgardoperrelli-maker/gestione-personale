export interface Task {
  id: string;
  odl: string;
  pdr?: string;
  indirizzo: string;
  cap: string;
  citta: string;
  priorita: number;
  /** Ordine di riga nel file sorgente (master/Excel): determina l'ordine delle voci nel rapportino. */
  ordine?: number;
  fascia_oraria: string;
  durata_min?: number;
  lat?: number;
  lng?: number;
  /** Coordinata committente "lat, lng" letta dal file (separata da lat/lng del geocoding). */
  coordinate?: string;
  requiresTwoOperators?: boolean;
  // Campi ATTGIORN
  nominativo?: string;
  matricola?: string;
  recapito?: string;
  accessibilita?: string;
  attivita?: string;
  /** Colonna GRUPPO ATTIVITA' del template import (solo check di coerenza; il server la ricalcola). */
  gruppoFile?: string;
  codice?: string;
  isAppointment?: boolean;
  appointmentId?: string;
  appointmentDate?: string;
  // Stato operativo (popolato solo quando il Task viene da un intervento del giorno)
  stato?: string;
  esito?: string | null;
  /** Marcato annullato dall'ufficio in pianificazione (non da fare; voce rossa nel rapportino). */
  annullato?: boolean;
  /** Nota informativa dall'ufficio per l'operatore (sola lettura lato operatore). */
  note?: string;
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
