// Performance operatori (admin_plus): logica pura, modello "client-row".
// I dati grezzi (già risolti coi nomi e con la TASSONOMIA reale committente →
// gruppo attività → descrizione attività) sono caricati una volta dal server e
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
  committente: string;      // valore raw ('acea' / 'lim_massive' / …), label via labelCommittente
  gruppo: string;           // gruppo attività dalla tassonomia (GRUPPO_NON_CENSITO se sconosciuta)
  attivita: string;         // descrizione attività canonica dalla tassonomia (o free-text originale)
  valvola: boolean;         // includeva sostituzione saracinesca
  esito: string;
}

/** Gruppo assegnato alle attività non presenti in tassonomia. */
export const GRUPPO_NON_CENSITO = 'Non censita';

// Filtri multi-selezione: array vuoto = "tutti"; altrimenti match per inclusione (OR interno,
// AND tra filtri diversi). Le date restano un intervallo singolo.
export interface PerfFilters {
  dateFrom: string;
  dateTo: string;
  staffIds: string[];
  territorioIds: string[];
  committenti: string[];
  gruppi: string[];
  attivita: string[];
  soloValvola: boolean;
}

export interface SelectOption { value: string; label: string }

export const emptyFilters = (dateFrom = '', dateTo = ''): PerfFilters => ({
  dateFrom, dateTo, staffIds: [], territorioIds: [], committenti: [], gruppi: [], attivita: [], soloValvola: false,
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

// ---- Etichette ----
const COMMITTENTE_LABELS: Record<string, string> = {
  acea: 'Acea',
  italgas: 'Italgas',
  acqualatina: 'Acqualatina',
  lim_massive: 'Acea · lim. massive',
  altro: 'Altro',
};
export function labelCommittente(raw: string | null | undefined): string {
  const c = (raw ?? '').trim();
  if (!c) return '—';
  return COMMITTENTE_LABELS[c.toLowerCase()] ?? c;
}

const ESITO_LABELS: Record<string, string> = {
  eseguito_positivo: 'Eseguito positivo',
  accesso_negato: 'Accesso negato',
  contatore_non_trovato: 'Contatore non trovato',
  dati_ubicazione_insufficienti: 'Dati ubicazione insufficienti',
  accesso_a_vuoto: 'Accesso a vuoto',
  rinviato: 'Rinviato',
};
export function labelEsito(esito: string | null | undefined): string {
  const e = (esito ?? '').trim();
  if (!e) return 'Non eseguito';
  return ESITO_LABELS[e] ?? e;
}

/** Positivo = 'eseguito_positivo'. Tutto il resto (causali KO, esito assente) è negativo,
 *  come in torreView/confronto-esiti: le righe qui sono già tutte stato='completato'. */
export function esitoPositivo(r: Pick<ClientRow, 'esito'>): boolean {
  return r.esito === 'eseguito_positivo';
}

// ---- Filtro puro (applicato per-grafico lato client) ----
export function filterRows(rows: ClientRow[], f: PerfFilters): ClientRow[] {
  return rows.filter((r) => {
    if (f.dateFrom && r.data < f.dateFrom) return false;
    if (f.dateTo && r.data > f.dateTo) return false;
    if (f.staffIds.length && !f.staffIds.includes(r.staffId)) return false;
    if (f.territorioIds.length && !f.territorioIds.includes(r.territorioId)) return false;
    if (f.committenti.length && !f.committenti.includes(r.committente)) return false;
    if (f.gruppi.length && !f.gruppi.includes(r.gruppo)) return false;
    if (f.attivita.length && !f.attivita.includes(r.attivita)) return false;
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

// ---- Esiti positivi/negativi (grafico principale) ----
export interface EsitiGiornoDatum { giorno: string; label: string; positivi: number; negativi: number }
export interface EsitiTotali { positivi: number; negativi: number; totale: number; pct: number }

function pctPositivi(positivi: number, totale: number): number {
  return totale ? Math.round((positivi / totale) * 100) : 0;
}

/** Serie giornaliera positivi/negativi + totali del periodo filtrato. */
export function buildEsiti(rows: ClientRow[]): { data: EsitiGiornoDatum[]; tot: EsitiTotali } {
  const perDay = new Map<string, { positivi: number; negativi: number }>();
  let positivi = 0;
  for (const r of rows) {
    const g = r.data.slice(0, 10);
    let d = perDay.get(g);
    if (!d) { d = { positivi: 0, negativi: 0 }; perDay.set(g, d); }
    if (esitoPositivo(r)) { d.positivi += 1; positivi += 1; }
    else d.negativi += 1;
  }
  const data = Array.from(perDay.keys()).sort().map((g) => {
    const d = perDay.get(g)!;
    return { giorno: g, label: dayLabel(g), positivi: d.positivi, negativi: d.negativi };
  });
  const totale = rows.length;
  return { data, tot: { positivi, negativi: totale - positivi, totale, pct: pctPositivi(positivi, totale) } };
}

export interface EsitiOperatore { id: string; name: string; positivi: number; negativi: number; totale: number; pct: number }
const UNKNOWN_OP = 'Sconosciuto';

/** Riepilogo esiti per operatore, ordinato per volume decrescente. */
export function buildEsitiOperatori(rows: ClientRow[]): EsitiOperatore[] {
  const map = new Map<string, EsitiOperatore>();
  for (const r of rows) {
    const id = r.staffId || UNKNOWN_OP;
    let op = map.get(id);
    if (!op) { op = { id, name: r.operatore || UNKNOWN_OP, positivi: 0, negativi: 0, totale: 0, pct: 0 }; map.set(id, op); }
    op.totale += 1;
    if (esitoPositivo(r)) op.positivi += 1; else op.negativi += 1;
  }
  const out = Array.from(map.values());
  for (const op of out) op.pct = pctPositivi(op.positivi, op.totale);
  return out.sort((a, b) => b.totale - a.totale);
}

// ---- Confronto operatori (volumi per gruppo attività) ----
export interface ConfrontoOperator {
  id: string;
  name: string;
  total: number;
  valvole: number;
  byGruppo: Record<string, number>;
}
export function buildConfronto(rows: ClientRow[]): ConfrontoOperator[] {
  const map = new Map<string, ConfrontoOperator>();
  for (const r of rows) {
    const id = r.staffId || UNKNOWN_OP;
    let op = map.get(id);
    if (!op) { op = { id, name: r.operatore || UNKNOWN_OP, total: 0, valvole: 0, byGruppo: {} }; map.set(id, op); }
    op.total += 1;
    op.byGruppo[r.gruppo] = (op.byGruppo[r.gruppo] ?? 0) + 1;
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
    perGruppo: distrib(rows, (r) => r.gruppo),
    perCommittente: distrib(rows, (r) => labelCommittente(r.committente)),
    perTerritorio: distrib(rows, (r) => r.territorio || 'Senza territorio'),
  };
}

// ---- Produzione giornaliera: colonne impilate per gruppo attività ----
export interface GiornalieraDatum { giorno: string; label: string; total: number; [gruppo: string]: number | string }
export function buildGiornaliera(rows: ClientRow[]): { data: GiornalieraDatum[]; gruppi: string[] } {
  const perDay = new Map<string, Map<string, number>>();
  const gruppoTot = new Map<string, number>();
  for (const r of rows) {
    const g = r.data.slice(0, 10);
    if (!perDay.has(g)) perDay.set(g, new Map());
    const dm = perDay.get(g)!;
    dm.set(r.gruppo, (dm.get(r.gruppo) ?? 0) + 1);
    gruppoTot.set(r.gruppo, (gruppoTot.get(r.gruppo) ?? 0) + 1);
  }
  const gruppi = Array.from(gruppoTot.entries()).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const data: GiornalieraDatum[] = Array.from(perDay.keys()).sort().map((g) => {
    const dm = perDay.get(g)!;
    const row: GiornalieraDatum = { giorno: g, label: dayLabel(g), total: 0 };
    let total = 0;
    for (const m of gruppi) { const n = dm.get(m) ?? 0; row[m] = n; total += n; }
    row.total = total;
    return row;
  });
  return { data, gruppi };
}

// ---- Dettaglio operatore ----
export interface DettaglioRow {
  id: string;
  giorno: string;
  gruppo: string;
  attivita: string;
  committente: string;
  territorio: string;
  esito: string;
  positivo: boolean;
  valvola: boolean;
}
export function buildDettaglio(rows: ClientRow[]): DettaglioRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      giorno: r.data.slice(0, 10),
      gruppo: r.gruppo,
      attivita: r.attivita || '—',
      committente: labelCommittente(r.committente),
      territorio: r.territorio || 'Senza territorio',
      esito: labelEsito(r.esito),
      positivo: esitoPositivo(r),
      valvola: r.valvola,
    }))
    .sort((a, b) => (a.giorno < b.giorno ? 1 : a.giorno > b.giorno ? -1 : 0));
}
