export type CommittenteFiltro = 'tutti' | 'acea' | 'italgas' | 'altro';
export type StatoFiltro =
  | 'tutti' | 'da_assegnare' | 'assegnato' | 'in_viaggio'
  | 'sul_posto' | 'in_esecuzione' | 'completato' | 'annullato';
export type GeocodeFiltro = 'tutti' | 'ok' | 'failed' | 'pending';

export type InterventiFilters = {
  data: string;
  committente: CommittenteFiltro;
  stato: StatoFiltro;
  geocode: GeocodeFiltro;
};

const COMMITTENTI: string[] = ['acea', 'italgas', 'altro'];
const STATI: string[] = [
  'da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione', 'completato', 'annullato',
];
const GEOCODI: string[] = ['ok', 'failed', 'pending'];

/**
 * Normalizza i search param della lista interventi. Puro: riceve `oggi`
 * (YYYY-MM-DD) come argomento per essere deterministico/testabile.
 */
export function parseInterventiFilters(
  sp: { data?: string; committente?: string; stato?: string; geocode?: string },
  oggi: string,
): InterventiFilters {
  const data = typeof sp.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : oggi;
  const committente = COMMITTENTI.includes(sp.committente ?? '') ? (sp.committente as CommittenteFiltro) : 'tutti';
  const stato = STATI.includes(sp.stato ?? '') ? (sp.stato as StatoFiltro) : 'tutti';
  const geocode = GEOCODI.includes(sp.geocode ?? '') ? (sp.geocode as GeocodeFiltro) : 'tutti';
  return { data, committente, stato, geocode };
}

const STATO_LABELS: Record<string, string> = {
  da_assegnare: 'Da assegnare',
  assegnato: 'Assegnato',
  in_viaggio: 'In viaggio',
  sul_posto: 'Sul posto',
  in_esecuzione: 'In esecuzione',
  completato: 'Completato',
  annullato: 'Annullato',
};

export function labelStato(stato: string | null | undefined): string {
  if (!stato) return '—';
  return STATO_LABELS[stato] ?? stato;
}

export type GeocodeBadge = { label: string; tone: 'success' | 'danger' | 'muted' };

export function badgeGeocode(status: string | null | undefined): GeocodeBadge {
  if (status === 'ok') return { label: 'Geocodificato', tone: 'success' };
  if (status === 'failed') return { label: 'Da correggere', tone: 'danger' };
  return { label: 'In attesa', tone: 'muted' };
}

export type InterventoRow = {
  id: string;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  committente: string | null;
  stato: string | null;
  geocode_status: string | null;
  nominativo: string | null;
  fascia_oraria: string | null;
  staff_id: string | null;
};
