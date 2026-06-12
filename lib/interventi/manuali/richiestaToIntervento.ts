// PURA: dai dati correnti di una richiesta manuale approvata, costruisce il record
// per la tabella canonica `interventi`. Speculare a lib/interventi/taskToIntervento.ts,
// ma origine='manuale' e created_from_mappa=false. L'I/O (insert) sta nella route.
import type { CommittenteManuale, DatiInterventoManuale } from './types';

export type ContextInterventoManuale = {
  committente: CommittenteManuale;
  data: string;
  staff_id: string;
  piano_id?: string | null;
  territorio_id?: string | null;
};

export type InterventoManualeRecord = {
  committente: string;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  fascia_oraria: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  data: string;
  staff_id: string;
  stato: 'assegnato';
  piano_id: string | null;
  territorio_id: string | null;
  origine: 'manuale';
  created_from_mappa: false;
};

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/** Parsa "lat, lng" → [lat, lng] numerici, altrimenti [null, null]. */
function parseCoord(raw: string | null | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const m = raw.split(',').map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return [null, null];
  return [m[0], m[1]];
}

export function richiestaToIntervento(
  dati: DatiInterventoManuale,
  ctx: ContextInterventoManuale,
): InterventoManualeRecord {
  const a = dati.anagrafica;
  const [lat, lng] = parseCoord(a.coordinate);
  return {
    committente: ctx.committente,
    odl: trimOrNull(a.odl),
    pdr: trimOrNull(a.pdr),
    nominativo: trimOrNull(a.nominativo),
    indirizzo: trimOrNull(a.via),
    comune: trimOrNull(a.comune),
    cap: trimOrNull(a.cap),
    lat,
    lng,
    fascia_oraria: trimOrNull(a.fascia_oraria),
    matricola_contatore: trimOrNull(a.matricola),
    intervento_tipo: trimOrNull(a.attivita),
    data: ctx.data,
    staff_id: ctx.staff_id,
    stato: 'assegnato',
    piano_id: ctx.piano_id ?? null,
    territorio_id: ctx.territorio_id ?? null,
    origine: 'manuale',
    created_from_mappa: false,
  };
}
