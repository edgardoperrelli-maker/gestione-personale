// lib/interventi/storico/normalizza.ts
// PURA: normalizzazione righe interventi/manuali → RigaStorico, label, ordinamento.
import { STATO_LABELS, ESITO_LABELS } from './types';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico } from './types';

const ANAG_KEYS = [
  'nominativo', 'matricola', 'pdr', 'odl', 'via', 'comune', 'cap', 'recapito', 'attivita', 'fascia_oraria',
] as const;
type AnagKey = (typeof ANAG_KEYS)[number];

function anagDi(d: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const a = (d as { anagrafica?: unknown } | null | undefined)?.anagrafica;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
}

/** Anagrafica di una riga manuale: dati_correnti vince su dati_operatore. */
export function anagraficaManuale(
  riga: { dati_correnti?: Record<string, unknown> | null; dati_operatore?: Record<string, unknown> | null },
): Record<AnagKey, string> {
  const corr = anagDi(riga.dati_correnti);
  const op = anagDi(riga.dati_operatore);
  const out = {} as Record<AnagKey, string>;
  for (const k of ANAG_KEYS) out[k] = String((corr[k] ?? op[k]) ?? '').trim();
  return out;
}

export function labelStatoStorico(stato: string | null | undefined): string {
  if (!stato) return '—';
  return STATO_LABELS[stato] ?? stato;
}

export function labelEsitoStorico(esito: string | null | undefined): string {
  if (!esito) return '—';
  return ESITO_LABELS[esito] ?? esito;
}

function nz(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

export function interventoToRigaStorico(row: InterventoStoricoRow, staffById: Map<string, string>): RigaStorico {
  const origine: RigaStorico['origine'] = row.origine === 'manuale' ? 'manuale' : 'programmato';
  return {
    id: row.id,
    origine,
    committente: row.committente,
    data: row.data,
    odl: row.odl,
    pdr: row.pdr,
    matricola: row.matricola_contatore,
    nominativo: row.nominativo,
    indirizzo: row.indirizzo,
    comune: row.comune,
    cap: row.cap,
    attivita: row.intervento_tipo,
    fascia_oraria: row.fascia_oraria,
    esecutoreId: row.staff_id,
    esecutoreNome: row.staff_id ? (staffById.get(row.staff_id) ?? null) : null,
    stato: row.stato,
    statoLabel: labelStatoStorico(row.stato),
    esito: row.esito,
    esitoLabel: labelEsitoStorico(row.esito),
    motivo: nz(row.esito_motivo),
  };
}

export function manualeToRigaStorico(row: ManualeStoricoRow, staffById: Map<string, string>): RigaStorico {
  const a = anagraficaManuale(row);
  return {
    id: row.id,
    origine: 'manuale',
    committente: row.committente,
    data: row.data,
    odl: nz(a.odl),
    pdr: nz(a.pdr),
    matricola: nz(a.matricola),
    nominativo: nz(a.nominativo),
    indirizzo: nz(a.via),
    comune: nz(a.comune),
    cap: nz(a.cap),
    attivita: nz(a.attivita),
    fascia_oraria: nz(a.fascia_oraria),
    esecutoreId: row.staff_id,
    esecutoreNome: nz(row.staff_name) ?? (row.staff_id ? (staffById.get(row.staff_id) ?? null) : null),
    stato: row.stato,
    statoLabel: labelStatoStorico(row.stato),
    esito: null,
    esitoLabel: '—',
    motivo: nz(row.motivo_rifiuto),
  };
}

export function ordinaRighe(righe: RigaStorico[]): RigaStorico[] {
  return [...righe].sort((a, b) => {
    const da = a.data ?? '';
    const db = b.data ?? '';
    if (da !== db) return db.localeCompare(da); // data desc
    const ca = (a.comune ?? '').toLowerCase();
    const cb = (b.comune ?? '').toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb); // comune asc
    const ia = (a.indirizzo ?? '').toLowerCase();
    const ib = (b.indirizzo ?? '').toLowerCase();
    if (ia !== ib) return ia.localeCompare(ib); // indirizzo asc
    return a.id.localeCompare(b.id); // tie-breaker deterministico
  });
}

/** Filtro in memoria per le righe manuali (q su anagrafica, comune contains). */
export function filtraManualiInMemoria(righe: RigaStorico[], q: string, comune: string): RigaStorico[] {
  const qq = q.trim().toLowerCase();
  const cc = comune.trim().toLowerCase();
  return righe.filter((r) => {
    if (qq) {
      const hay = `${r.odl ?? ''} ${r.indirizzo ?? ''} ${r.matricola ?? ''} ${r.pdr ?? ''} ${r.nominativo ?? ''}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    if (cc && !(r.comune ?? '').toLowerCase().includes(cc)) return false;
    return true;
  });
}

export function slicePagina<T>(righe: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return righe.slice(start, start + pageSize);
}
