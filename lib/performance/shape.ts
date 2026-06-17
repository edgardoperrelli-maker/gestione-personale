// Performance operatori (admin_plus): logica pura di shaping/aggregazione.
// Niente import server-only qui → testabile con vitest.

export type Granularity = 'day' | 'week' | 'month';

/** Riga intervento grezza (sottoinsieme di `interventi`) usata per l'aggregazione. */
export interface RawIntervento {
  id: string;
  staff_id: string | null;
  data: string; // ISO aaaa-mm-gg
  territorio_id: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  esito: string | null;
}

export interface PerfFilters {
  dateFrom: string;
  dateTo: string;
  staffId?: string;
  territorioId?: string;
  committente?: string;
  macroAttivita?: string;
}

// ---- Date (formato italiano, bucketing timezone-safe: nessun new Date(iso)) ----
function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}
export function formatItDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
export function pickGranularity(dateFrom: string, dateTo: string): Granularity {
  const a = Date.UTC(...parts(dateFrom));
  const b = Date.UTC(...parts(dateTo));
  const days = (b - a) / 86_400_000;
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}
function mondayISO(iso: string): string {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
export function periodKey(iso: string, g: Granularity): string {
  if (g === 'day') return iso.slice(0, 10);
  if (g === 'month') return iso.slice(0, 7);
  return mondayISO(iso);
}
function periodLabel(key: string, g: Granularity): string {
  if (g === 'month') { const [y, m] = key.split('-'); return `${m}/${y}`; }
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

// ---- Macro-attività: normalizzazione best-effort del free-text intervento_tipo ----
export const MACRO_ATTIVITA = [
  'Limitazioni',
  'Morosità / forniture',
  'Sospensioni',
  'Bonifiche',
  'Picarro',
  'Flusso idrico',
  'Sostituzioni / sonde',
  'Altro',
  'Non specificato',
] as const;
export type MacroAttivita = (typeof MACRO_ATTIVITA)[number];

export function normalizeMacroAttivita(tipo: string | null | undefined): MacroAttivita {
  const t = (tipo ?? '').toUpperCase().trim();
  if (!t) return 'Non specificato';
  if (t.includes('PICARRO')) return 'Picarro';
  if (t.includes('BONIFIC')) return 'Bonifiche';
  if (t.includes('SOSPENS')) return 'Sospensioni';
  if (
    t.includes('MOROSIT') || t.includes('DIS00') || t.includes('DISATTIVAZIONE') ||
    t.includes('RIATTIVAZIONE') || t.includes('RIAPERTURA') || t.includes('RIPRISTINO') ||
    t.includes('REVOCA') || t.includes('CESSATA')
  ) return 'Morosità / forniture';
  if (t.includes('LIMITAZ')) return 'Limitazioni';
  if (t.includes('FLUSSO') || t.includes('REGOLARIZZAZIONE')) return 'Flusso idrico';
  if (/\bS-[A-Z]{2}-\d/.test(t) || t.includes('SONDA') || t.includes('SOST')) return 'Sostituzioni / sonde';
  return 'Altro';
}

// ---- Output aggregati ----
export interface ConfrontoOperator {
  id: string;
  name: string;
  total: number;
  byMacro: Record<string, number>;
}
export interface AndamentoPoint { periodo: string; periodoLabel: string; n: number }
export interface DistribuzioneSlice { chiave: string; n: number }
export interface DettaglioRow {
  id: string;
  giorno: string;
  intervento_tipo: string;
  macro: string;
  committente: string;
  territorio: string;
  esito: string;
}
export interface SelectOption { value: string; label: string }

export interface PerformanceData {
  totale: number;
  confronto: ConfrontoOperator[];
  andamento: { granularity: Granularity; points: AndamentoPoint[] };
  perMacro: DistribuzioneSlice[];
  perCommittente: DistribuzioneSlice[];
  perTerritorio: DistribuzioneSlice[];
  dettaglio: { name: string; rows: DettaglioRow[] } | null;
}

const UNKNOWN_OP = 'Sconosciuto';
const NO_TERR = 'Senza territorio';

function sortSlices(map: Map<string, number>): DistribuzioneSlice[] {
  return Array.from(map, ([chiave, n]) => ({ chiave, n })).sort((a, b) => b.n - a.n);
}

/**
 * Aggrega le righe (già filtrate per stato/committente/territorio/operatore/date a monte)
 * applicando l'eventuale filtro macro-attività (post-normalizzazione) e producendo tutte le viste.
 */
export function aggregatePerformance(
  rows: RawIntervento[],
  staffName: Map<string, string>,
  territoryName: Map<string, string>,
  opts: { dateFrom: string; dateTo: string; macroAttivita?: string; selOperator?: string | null },
): PerformanceData {
  const filtered = opts.macroAttivita
    ? rows.filter((r) => normalizeMacroAttivita(r.intervento_tipo) === opts.macroAttivita)
    : rows;

  const perOp = new Map<string, ConfrontoOperator>();
  const perGiorno = new Map<string, number>();
  const perMacro = new Map<string, number>();
  const perComm = new Map<string, number>();
  const perTerr = new Map<string, number>();

  for (const r of filtered) {
    const opId = r.staff_id ?? UNKNOWN_OP;
    const macro = normalizeMacroAttivita(r.intervento_tipo);
    const comm = (r.committente ?? '').trim() || '—';
    const terr = (r.territorio_id && territoryName.get(r.territorio_id)) || NO_TERR;

    let op = perOp.get(opId);
    if (!op) {
      op = { id: opId, name: staffName.get(opId) ?? UNKNOWN_OP, total: 0, byMacro: {} };
      perOp.set(opId, op);
    }
    op.total += 1;
    op.byMacro[macro] = (op.byMacro[macro] ?? 0) + 1;

    perGiorno.set(r.data.slice(0, 10), (perGiorno.get(r.data.slice(0, 10)) ?? 0) + 1);
    perMacro.set(macro, (perMacro.get(macro) ?? 0) + 1);
    perComm.set(comm, (perComm.get(comm) ?? 0) + 1);
    perTerr.set(terr, (perTerr.get(terr) ?? 0) + 1);
  }

  const granularity = pickGranularity(opts.dateFrom, opts.dateTo);
  const bucket = new Map<string, number>();
  for (const [giorno, n] of perGiorno) {
    const key = periodKey(giorno, granularity);
    bucket.set(key, (bucket.get(key) ?? 0) + n);
  }
  const points = Array.from(bucket, ([periodo, n]) => ({ periodo, periodoLabel: periodLabel(periodo, granularity), n }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const confronto = Array.from(perOp.values()).sort((a, b) => b.total - a.total);

  let dettaglio: PerformanceData['dettaglio'] = null;
  if (opts.selOperator) {
    const rowsDet = filtered
      .filter((r) => (r.staff_id ?? UNKNOWN_OP) === opts.selOperator)
      .map((r) => ({
        id: r.id,
        giorno: r.data.slice(0, 10),
        intervento_tipo: (r.intervento_tipo ?? '').trim() || '—',
        macro: normalizeMacroAttivita(r.intervento_tipo),
        committente: (r.committente ?? '').trim() || '—',
        territorio: (r.territorio_id && territoryName.get(r.territorio_id)) || NO_TERR,
        esito: (r.esito ?? '').trim() || '—',
      }))
      .sort((a, b) => (a.giorno < b.giorno ? 1 : a.giorno > b.giorno ? -1 : 0));
    dettaglio = { name: staffName.get(opts.selOperator) ?? UNKNOWN_OP, rows: rowsDet };
  }

  return {
    totale: filtered.length,
    confronto,
    andamento: { granularity, points },
    perMacro: sortSlices(perMacro),
    perCommittente: sortSlices(perComm),
    perTerritorio: sortSlices(perTerr),
    dettaglio,
  };
}
