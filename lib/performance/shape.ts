// Performance operatori (admin_plus): logica pura, modello "client-row".
// I dati grezzi (già risolti coi nomi) sono caricati una volta dal server e
// filtrati/aggregati lato client, in modo che ogni grafico abbia i suoi filtri.
// Niente import server-only qui → testabile con vitest.

// ---- Riga lato client (un intervento completato, con nomi risolti) ----
export interface ClientRow {
  id: string;
  staffId: string;          // id operatore ('' se assente)
  operatore: string;        // nome risolto
  data: string;             // ISO aaaa-mm-gg
  territorioId: string;     // id territorio ('' se assente)
  territorio: string;       // nome risolto
  committente: string;      // es. 'acea' / 'lim_massive'
  intervento_tipo: string;  // free-text (per macro + dettaglio)
  valvola: boolean;         // includeva sostituzione saracinesca
  esito: string;
}

export interface PerfFilters {
  dateFrom: string;
  dateTo: string;
  staffId: string;
  territorioId: string;
  committente: string;
  macro: string;
  soloValvola: boolean;
}

export interface SelectOption { value: string; label: string }

export const emptyFilters = (dateFrom = '', dateTo = ''): PerfFilters => ({
  dateFrom, dateTo, staffId: '', territorioId: '', committente: '', macro: '', soloValvola: false,
});

// ---- Date (formato italiano, no timezone bug) ----
export function formatItDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function dayLabel(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
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

// ---- Filtro puro (applicato per-grafico lato client) ----
export function filterRows(rows: ClientRow[], f: PerfFilters): ClientRow[] {
  return rows.filter((r) => {
    if (f.dateFrom && r.data < f.dateFrom) return false;
    if (f.dateTo && r.data > f.dateTo) return false;
    if (f.staffId && r.staffId !== f.staffId) return false;
    if (f.territorioId && r.territorioId !== f.territorioId) return false;
    if (f.committente && r.committente !== f.committente) return false;
    if (f.macro && normalizeMacroAttivita(r.intervento_tipo) !== f.macro) return false;
    if (f.soloValvola && !r.valvola) return false;
    return true;
  });
}

export interface Totali { totale: number; valvole: number }
export function totali(rows: ClientRow[]): Totali {
  let valvole = 0;
  for (const r of rows) if (r.valvola) valvole += 1;
  return { totale: rows.length, valvole };
}

// ---- Confronto operatori ----
export interface ConfrontoOperator {
  id: string;
  name: string;
  total: number;
  valvole: number;
  byMacro: Record<string, number>;
}
const UNKNOWN_OP = 'Sconosciuto';
export function buildConfronto(rows: ClientRow[]): ConfrontoOperator[] {
  const map = new Map<string, ConfrontoOperator>();
  for (const r of rows) {
    const id = r.staffId || UNKNOWN_OP;
    let op = map.get(id);
    if (!op) { op = { id, name: r.operatore || UNKNOWN_OP, total: 0, valvole: 0, byMacro: {} }; map.set(id, op); }
    op.total += 1;
    const macro = normalizeMacroAttivita(r.intervento_tipo);
    op.byMacro[macro] = (op.byMacro[macro] ?? 0) + 1;
    if (r.valvola) op.valvole += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ---- Distribuzioni ----
export interface DistribuzioneSlice { chiave: string; n: number }
function distrib(rows: ClientRow[], key: (r: ClientRow) => string): DistribuzioneSlice[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return Array.from(m, ([chiave, n]) => ({ chiave, n })).sort((a, b) => b.n - a.n);
}
export function buildDistribuzioni(rows: ClientRow[]) {
  return {
    perMacro: distrib(rows, (r) => normalizeMacroAttivita(r.intervento_tipo)),
    perCommittente: distrib(rows, (r) => r.committente || '—'),
    perTerritorio: distrib(rows, (r) => r.territorio || 'Senza territorio'),
  };
}

// ---- Produzione giornaliera: colonne impilate per macro ----
export interface GiornalieraDatum { giorno: string; label: string; total: number; [macro: string]: number | string }
export function buildGiornaliera(rows: ClientRow[]): { data: GiornalieraDatum[]; macros: string[] } {
  const perDay = new Map<string, Map<string, number>>();
  const macroTot = new Map<string, number>();
  for (const r of rows) {
    const g = r.data.slice(0, 10);
    const macro = normalizeMacroAttivita(r.intervento_tipo);
    if (!perDay.has(g)) perDay.set(g, new Map());
    const dm = perDay.get(g)!;
    dm.set(macro, (dm.get(macro) ?? 0) + 1);
    macroTot.set(macro, (macroTot.get(macro) ?? 0) + 1);
  }
  const macros = Array.from(macroTot.entries()).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const data: GiornalieraDatum[] = Array.from(perDay.keys()).sort().map((g) => {
    const dm = perDay.get(g)!;
    const row: GiornalieraDatum = { giorno: g, label: dayLabel(g), total: 0 };
    let total = 0;
    for (const m of macros) { const n = dm.get(m) ?? 0; row[m] = n; total += n; }
    row.total = total;
    return row;
  });
  return { data, macros };
}

// ---- Dettaglio operatore ----
export interface DettaglioRow {
  id: string;
  giorno: string;
  intervento_tipo: string;
  macro: string;
  committente: string;
  territorio: string;
  esito: string;
  valvola: boolean;
}
export function buildDettaglio(rows: ClientRow[]): DettaglioRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      giorno: r.data.slice(0, 10),
      intervento_tipo: (r.intervento_tipo ?? '').trim() || '—',
      macro: normalizeMacroAttivita(r.intervento_tipo),
      committente: r.committente || '—',
      territorio: r.territorio || 'Senza territorio',
      esito: (r.esito ?? '').trim() || '—',
      valvola: r.valvola,
    }))
    .sort((a, b) => (a.giorno < b.giorno ? 1 : a.giorno > b.giorno ? -1 : 0));
}
