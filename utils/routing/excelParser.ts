import * as XLSX from 'xlsx';
import type { Task } from './types';

// ─── Normalizzazione header ──────────────────────────────────────────────────

function normalizeHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cerca nella riga una colonna il cui header corrisponde ad uno dei pattern.
 * Restituisce l'indice 0-based o null se non trovato.
 */
function findCol(headers: string[], patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const idx = headers.findIndex((h) => p.test(h));
    if (idx !== -1) return idx;
  }
  return null;
}

// ─── Mappature conosciute ────────────────────────────────────────────────────

/** Indici fissi per il formato "Rapportini / Massiva" (~95 colonne) */
const MASSIVA_COL = {
  VIA: 54,        // BC
  CAP: 62,        // BK
  COMUNE: 72,     // BU
  PDR: 12,        // M
  FASCIA: 93,     // CQ
  NOMINATIVO: 52, // BA
  OPERATORE: 95,  // CR
} as const;

const MASSIVA_MIN_COLS = 80; // file "massiva" ha almeno 80 colonne

// ─── Rilevamento formato ─────────────────────────────────────────────────────

type ColMap = {
  via: number;
  cap: number | null;
  comune: number | null;
  pdR: number | null;
  fascia: number | null;
  operatore: number | null;
};

function detectFormat(headerRow: unknown[]): ColMap | null {
  const headers = headerRow.map(normalizeHeader);
  const ncols = headers.length;

  // ── Formato "Massiva/Rapportini": >80 colonne, colonna BC=via ───────────
  if (ncols >= MASSIVA_MIN_COLS) {
    const via = MASSIVA_COL.VIA;
    if (headers[via] && /via|indirizzo|strada/i.test(headers[via] || '')) {
      return {
        via,
        cap: MASSIVA_COL.CAP,
        comune: MASSIVA_COL.COMUNE,
        pdR: MASSIVA_COL.PDR,
        fascia: MASSIVA_COL.FASCIA,
        operatore: MASSIVA_COL.NOMINATIVO,
      };
    }
    // anche senza header corrispondente usiamo gli indici fissi se ncols > 80
    return {
      via: MASSIVA_COL.VIA,
      cap: MASSIVA_COL.CAP,
      comune: MASSIVA_COL.COMUNE,
      pdR: MASSIVA_COL.PDR,
      fascia: MASSIVA_COL.FASCIA,
      operatore: MASSIVA_COL.NOMINATIVO,
    };
  }

  // ── Formato "Export Dati / Geocall": header leggibili ───────────────────
  const via = findCol(headers, [/^indirizzo$/, /^via$/, /^indirizzo.*/]);
  if (via === null) return null;

  return {
    via,
    cap: findCol(headers, [/^cap$/, /^c\.a\.p\.?$/]),
    comune: findCol(headers, [/^comune$/, /^citt[aà]$/, /^localit/]),
    pdR: findCol(headers, [/^pdr/, /^pdr\s*\//, /^punto.di.rec/, /^odl$/, /^codice$/]),
    fascia: findCol(headers, [/^fascia/, /^slot/, /^orario/]),
    operatore: findCol(headers, [/^nominativo$/, /^operatore$/, /^risorsa$/, /^nome.*/]),
  };
}

// ─── Riga dati di partenza ───────────────────────────────────────────────────

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const headers = (rows[i] as unknown[]).map(normalizeHeader);
    // header row del formato "Export Dati": contiene "indirizzo"
    if (headers.some((h) => /^indirizzo$|^via$/.test(h))) return i;
    // header row del formato "Massiva": contiene "risorsa" nella col OPERATORE
    if (
      headers.length >= MASSIVA_MIN_COLS &&
      (headers[MASSIVA_COL.OPERATORE] === 'risorsa' ||
        headers[MASSIVA_COL.NOMINATIVO] === 'nominativo')
    )
      return i;
  }
  return 0;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

// ─── Export pubblico ─────────────────────────────────────────────────────────

/**
 * Legge un file Excel (.xlsx/.xls) e restituisce un array di Task
 * con indirizzo/CAP/città ma senza coordinate (da geocodificare).
 *
 * Supporta automaticamente:
 * - Formato "Export Dati / Geocall" (≤20 colonne, header leggibili)
 * - Formato "Rapportini / Massiva" (>80 colonne, indici fissi)
 *
 * Le righe prive di indirizzo vengono scartate.
 *
 * @param file File selezionato dall'utente
 * @returns Promise<Task[]>
 */
export async function parseExcelToTasks(file: File): Promise<Task[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  if (!rows.length) return [];

  // 1. Trova la riga header
  const headerRowIdx = findHeaderRow(rows);
  const headerRow = rows[headerRowIdx] as unknown[];

  // 2. Rileva il formato e mappa le colonne
  const colMap = detectFormat(headerRow);
  if (!colMap) {
    console.warn('[excelParser] Formato non riconosciuto — header riga', headerRowIdx, headerRow.slice(0, 15));
    return [];
  }

  // 3. Leggi le righe dati
  const tasks: Task[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];

    const indirizzo = str(row[colMap.via]);
    const citta = colMap.comune != null ? str(row[colMap.comune]) : '';
    const cap = colMap.cap != null ? str(row[colMap.cap]) : '';

    if (!indirizzo && !citta) continue;

    const operatore = colMap.operatore != null ? str(row[colMap.operatore]) : '';

    const task: Task & { _operatore?: string } = {
      id: `row-${i}`,
      odl: colMap.pdR != null ? str(row[colMap.pdR]) : '',
      indirizzo,
      cap,
      citta,
      priorita: 0,
      fascia_oraria: colMap.fascia != null ? str(row[colMap.fascia]) : '',
    };
    if (operatore) task._operatore = operatore;
    tasks.push(task);
  }

  return tasks;
}
