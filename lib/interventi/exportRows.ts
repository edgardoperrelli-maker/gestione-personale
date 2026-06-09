// Mappa una riga `interventi` alla riga dell'export Excel del Live.
import { labelStato } from './interventiView';

export type InterventoExport = {
  data: string;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  odl: string | null;
  nominativo: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
  chiuso_at: string | null;
};

export type RigaExport = {
  data: string; operatore: string; stato: string; esito: string; motivo: string;
  odl: string; nominativo: string; pdr: string; matricola: string;
  indirizzo: string; comune: string; cap: string; attivita: string; fascia: string; chiuso: string;
};

const ESITO_LABELS: Record<string, string> = {
  eseguito_positivo: 'Eseguito positivo',
  accesso_negato: 'Accesso negato',
  contatore_non_trovato: 'Contatore non trovato',
  dati_ubicazione_insufficienti: 'Dati ubicazione insufficienti',
  accesso_a_vuoto: 'Accesso a vuoto',
  rinviato: 'Rinviato',
};

function labelEsito(e: string | null): string {
  if (!e) return '';
  return ESITO_LABELS[e] ?? e;
}

/** HH:MM in fuso Europe/Rome dell'orario di chiusura; '' se assente. */
function oraRoma(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export function buildRigaExport(it: InterventoExport, staffById: Map<string, string>): RigaExport {
  return {
    data: it.data,
    operatore: it.staff_id ? (staffById.get(it.staff_id) ?? it.staff_id) : 'Non assegnato',
    stato: labelStato(it.stato),
    esito: labelEsito(it.esito),
    motivo: it.esito_motivo ?? '',
    odl: it.odl ?? '',
    nominativo: it.nominativo ?? '',
    pdr: it.pdr ?? '',
    matricola: it.matricola_contatore ?? '',
    indirizzo: it.indirizzo ?? '',
    comune: it.comune ?? '',
    cap: it.cap ?? '',
    attivita: it.intervento_tipo ?? '',
    fascia: it.fascia_oraria ?? '',
    chiuso: oraRoma(it.chiuso_at),
  };
}
