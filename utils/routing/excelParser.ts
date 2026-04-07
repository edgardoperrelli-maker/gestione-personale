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

/** Indici fissi per il formato ATTGIORN — Dettaglio Risorse Interne */
const ATTGIORN_COL = {
  OPERATORE: 1,       // B  — RISORSA
  ATTIVITA: 11,       // L
  CODICE: 12,         // M  — codice (S-AI-051, ecc.)
  PDR: 13,            // N
  NOMINATIVO: 14,     // O
  MATRICOLA: 15,      // P
  COMUNE: 16,         // Q
  CAP: 17,            // R
  VIA: 19,            // T
  ORA: 20,            // U  — fascia oraria
  RECAPITO: 58,       // BG
  ACCESSIBILITA: 60,  // BI
} as const;

/** Indici fissi per il formato "Rapportini / Massiva" (~95 colonne) */
const MASSIVA_COL = {
  VIA: 54,        // BC
  CAP: 62,        // BK
  COMUNE: 72,     // BU
  PDR: 13,        // N — DESCRIZIONE PDR/IMPIANTO
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
  odl: number | null;
  odsin: number | null;
  fascia: number | null;
  operatore: number | null;
  nominativo: number | null;
  matricola: number | null;
  recapito: number | null;
  accessibilita: number | null;
  attivita: number | null;
  codice: number | null;
};

function detectFormat(headerRow: unknown[]): ColMap | null {
  const headers = headerRow.map(normalizeHeader);
  const ncols = headers.length;
  const odl = findCol(headers, [/^codice[_\s]*odl$/, /^odl$/]);
  const odsin = findCol(headers, [/^odsin$/, /^codice$/, /^codice\s+odsin$/, /^id$/]);

  // ── Formato ATTGIORN: presenza "risorsa" in col B (indice 1) ──────────────
  if (/^risorsa$/i.test(headers[ATTGIORN_COL.OPERATORE] ?? '') ||
      (headers[ATTGIORN_COL.VIA] && /^via$/i.test(headers[ATTGIORN_COL.VIA]))) {
    return {
      via: ATTGIORN_COL.VIA,
      cap: ATTGIORN_COL.CAP,
      comune: ATTGIORN_COL.COMUNE,
      pdR: ATTGIORN_COL.PDR,
      odl,
      odsin,
      fascia: ATTGIORN_COL.ORA,
      operatore: ATTGIORN_COL.OPERATORE,
      nominativo: ATTGIORN_COL.NOMINATIVO,
      matricola: ATTGIORN_COL.MATRICOLA,
      recapito: ATTGIORN_COL.RECAPITO,
      accessibilita: ATTGIORN_COL.ACCESSIBILITA,
      attivita: ATTGIORN_COL.ATTIVITA,
      codice: ATTGIORN_COL.CODICE,
    };
  }

  // ── Formato "Massiva/Rapportini": >80 colonne, colonna BC=via ───────────
  if (ncols >= MASSIVA_MIN_COLS) {
    const via = MASSIVA_COL.VIA;
    if (headers[via] && /via|indirizzo|strada/i.test(headers[via] || '')) {
      return {
        via,
        cap: MASSIVA_COL.CAP,
        comune: MASSIVA_COL.COMUNE,
        pdR: MASSIVA_COL.PDR,
        odl,
        odsin,
        fascia: MASSIVA_COL.FASCIA,
        operatore: MASSIVA_COL.NOMINATIVO,
        nominativo: null,
        matricola: null,
        recapito: null,
        accessibilita: null,
        attivita: null,
        codice: null,
      };
    }
    // anche senza header corrispondente usiamo gli indici fissi se ncols > 80
    return {
      via: MASSIVA_COL.VIA,
      cap: MASSIVA_COL.CAP,
      comune: MASSIVA_COL.COMUNE,
      pdR: MASSIVA_COL.PDR,
      odl,
      odsin,
      fascia: MASSIVA_COL.FASCIA,
      operatore: MASSIVA_COL.NOMINATIVO,
      nominativo: null,
      matricola: null,
      recapito: null,
      accessibilita: null,
      attivita: null,
      codice: null,
    };
  }

  // ── Formato "Export Dati / Geocall": header leggibili ───────────────────
  const via = findCol(headers, [/^indirizzo$/, /^via$/, /^indirizzo.*/]);
  if (via === null) return null;

  return {
    via,
    cap: findCol(headers, [/^cap$/, /^c\.a\.p\.?$/]),
    comune: findCol(headers, [/^comune$/, /^citt[aà]$/, /^localit/]),
    pdR: findCol(headers, [/^pdr/, /^pdr\s*\//, /^punto.di.rec/]),
    odl,
    odsin,
    fascia: findCol(headers, [/^fascia/, /^slot/, /^orario/]),
    operatore: findCol(headers, [/^nominativo$/, /^operatore$/, /^risorsa$/, /^nome.*/]),
    nominativo: null,
    matricola: null,
    recapito: null,
    accessibilita: null,
    attivita: null,
    codice: null,
  };
}

// ─── Riga dati di partenza ───────────────────────────────────────────────────

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const headers = (rows[i] as unknown[]).map(normalizeHeader);
    // header row del formato "ATTGIORN": contiene "risorsa" nella col B (indice 1)
    if (/^risorsa$/i.test(headers[ATTGIORN_COL.OPERATORE] ?? '')) return i;
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

function extractOdsin(v: unknown): string | undefined {
  const digits = String(v ?? '').replace(/\D/g, '');
  const match = digits.match(/200\d{8}/);
  return match?.[0];
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

  // Cerca il foglio "Dettaglio Risorse Interne" per ATTGIORN, altrimenti il primo
  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes('DETTAGLIO RISORSE INTERNE')) ??
    wb.SheetNames.find((s) => s.toUpperCase().includes('ATTGIORN')) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
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

    const odl = colMap.odl != null ? str(row[colMap.odl]) : (colMap.pdR != null ? str(row[colMap.pdR]) : '');
    const odsin =
      (colMap.odsin != null ? extractOdsin(row[colMap.odsin]) : undefined) ??
      extractOdsin(odl) ??
      (colMap.pdR != null ? extractOdsin(row[colMap.pdR]) : undefined);

    const task: Task & { _operatore?: string } = {
      id: `row-${i}`,
      odl,
      odsin,
      indirizzo,
      cap,
      citta,
      priorita: 0,
      fascia_oraria: colMap.fascia != null ? str(row[colMap.fascia]) : '',
      nominativo: colMap.nominativo != null ? str(row[colMap.nominativo]) : undefined,
      matricola: colMap.matricola != null ? str(row[colMap.matricola]) : undefined,
      recapito: colMap.recapito != null ? str(row[colMap.recapito]) : undefined,
      accessibilita: colMap.accessibilita != null ? str(row[colMap.accessibilita]) : undefined,
      attivita: colMap.attivita != null ? str(row[colMap.attivita]) : undefined,
      codice: colMap.codice != null ? str(row[colMap.codice]) : undefined,
    };
    if (operatore) task._operatore = operatore;
    tasks.push(task);
  }

  return tasks;
}
