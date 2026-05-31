import 'server-only';
import path from 'path';
import { readFile } from 'fs/promises';
import ExcelJS from 'exceljs';
import { risposteToStandardRow } from '@/utils/rapportini/excelMapping';

/**
 * Export Excel "Standard" dei rapportini compilati (lato server).
 *
 * Replica fedelmente il layout prodotto dalla pagina admin
 * `app/hub/rapportini/clientela/page.tsx`:
 *   - Header: B2 = data (DD/MM/YYYY), B4 = staff_name
 *   - Intestazioni colonne A–Q sulla riga 6
 *   - Dati a partire dalla riga 7
 *   - Colonne (1-based):
 *       A(1)  NOMINATIVO     B(2)  MATRICOLA   C(3)  PDR
 *       D(4)  ODSIN          E(5)  VIA         F(6)  COMUNE
 *       G(7)  CAP            H(8)  RECAPITO    I(9)  ATTIVITA
 *       J(10) ACCESSIBILITA  K(11) FASCIA ORARIA (formato testo '@')
 *       L(12) ORDINE         M(13) ATT/CESS    N(14) CAMBIO
 *       O(15) MINI BAG       P(16) RG STOP     Q(17) ASSENTE
 *   - Nota (campo Standard `note`): scritta in colonna R(18) per riga,
 *     così da non alterare il blocco A–Q replicato da clientela.
 *
 * Il template viene letto dal filesystem (NON via fetch — gira server-side).
 */

const HEADER_ROW = 6;
const DATA_START_ROW = 7;

const HEADERS = [
  'NOMINATIVO',
  'MATRICOLA',
  'PDR',
  'ODSIN',
  'VIA',
  'COMUNE',
  'CAP',
  'RECAPITO',
  'ATTIVITA',
  'ACCESSIBILITA',
  'FASCIA ORARIA',
  'ORDINE',
  'ATT/CESS',
  'CAMBIO',
  'MINI BAG',
  'RG STOP',
  'ASSENTE',
] as const;

/** Chiavi del template "Standard" (vedi migrazione rapportini interattivi). */
export const STANDARD_KEYS = ['att_cess', 'cambio', 'mini_bag', 'rg_stop', 'assente', 'note'] as const;

/** Voce di rapportino così come arriva dalla tabella `rapportino_voci`. */
export interface RapportinoVoce {
  ordine?: number | null;
  nominativo?: string | null;
  matricola?: string | null;
  pdr?: string | null;
  odsin?: string | null;
  via?: string | null;
  comune?: string | null;
  cap?: string | null;
  recapito?: string | null;
  attivita?: string | null;
  accessibilita?: string | null;
  fascia_oraria?: string | null;
  risposte?: Record<string, unknown> | null;
}

/** Rapportino dalla tabella `rapportini`. */
export interface RapportinoRow {
  staff_name?: string | null;
  data?: string | null;
  campi_snapshot?: unknown;
}

function safeStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Converte una data ISO (YYYY-MM-DD) o qualsiasi formato noto in DD/MM/YYYY. */
export function toDDMMYYYY(value: unknown): string {
  const s = safeStr(value);
  if (!s) return '';
  // già DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // ISO YYYY-MM-DD (eventuale orario in coda)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

/** Carica il workbook template da public/templates/Rapportino.xlsx (filesystem). */
export async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const filePath = path.join(process.cwd(), 'public', 'templates', 'Rapportino.xlsx');
  const buffer = await readFile(filePath);
  const wb = new ExcelJS.Workbook();
  // ExcelJS accetta sia Buffer che ArrayBuffer; convertiamo per tipi puliti.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

/**
 * True se il `campi_snapshot` corrisponde al template "Standard"
 * (l'insieme delle chiavi coincide con STANDARD_KEYS).
 */
export function isStandardSnapshot(campiSnapshot: unknown): boolean {
  if (!Array.isArray(campiSnapshot)) return false;
  const chiavi = campiSnapshot
    .map((c) => (c && typeof c === 'object' ? safeStr((c as { chiave?: unknown }).chiave) : ''))
    .filter(Boolean)
    .sort();
  if (chiavi.length === 0) return false;
  const standard = [...STANDARD_KEYS].sort();
  if (chiavi.length !== standard.length) return false;
  return chiavi.every((k, i) => k === standard[i]);
}

/**
 * Costruisce il workbook Excel "Standard" per un rapportino a partire dai dati DB.
 * Restituisce un Buffer pronto per il download.
 */
export async function buildRapportinoStandardXlsx(
  rapportino: RapportinoRow,
  voci: RapportinoVoce[],
): Promise<Buffer> {
  const wb = await loadTemplate();
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Foglio template non valido in Rapportino.xlsx.');

  // Header
  ws.getCell('B2').value = toDDMMYYYY(rapportino.data);
  ws.getCell('B4').value = safeStr(rapportino.staff_name);

  // Intestazioni colonne A–Q sulla riga 6 (allineato a clientela)
  const hrow = ws.getRow(HEADER_ROW);
  HEADERS.forEach((label, i) => {
    hrow.getCell(i + 1).value = label;
  });
  hrow.commit();

  // Dati a partire dalla riga 7, ordinati per `ordine`
  const ordered = [...voci].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));

  let rowIdx = DATA_START_ROW;
  for (const v of ordered) {
    const std = risposteToStandardRow(v.risposte ?? {});
    const rr = ws.getRow(rowIdx);
    const ordine = v.ordine ?? rowIdx - HEADER_ROW;

    rr.getCell(1).value = safeStr(v.nominativo); // A NOMINATIVO
    rr.getCell(2).value = safeStr(v.matricola); // B MATRICOLA
    rr.getCell(3).value = safeStr(v.pdr); // C PDR
    rr.getCell(4).value = safeStr(v.odsin); // D ODSIN
    rr.getCell(5).value = safeStr(v.via); // E VIA
    rr.getCell(6).value = safeStr(v.comune); // F COMUNE
    rr.getCell(7).value = safeStr(v.cap); // G CAP
    rr.getCell(8).value = safeStr(v.recapito); // H RECAPITO
    rr.getCell(9).value = safeStr(v.attivita); // I ATTIVITA
    rr.getCell(10).value = safeStr(v.accessibilita); // J ACCESSIBILITA
    rr.getCell(11).value = safeStr(v.fascia_oraria); // K FASCIA ORARIA
    rr.getCell(11).numFmt = '@';
    rr.getCell(12).value = ordine; // L ORDINE
    rr.getCell(13).value = std.att_cess; // M ATT/CESS
    rr.getCell(14).value = std.cambio; // N CAMBIO
    rr.getCell(15).value = std.mini_bag; // O MINI BAG
    rr.getCell(16).value = std.rg_stop; // P RG STOP
    rr.getCell(17).value = std.assente; // Q ASSENTE
    // Nota in colonna R (fuori dal blocco A–Q replicato da clientela)
    if (std.note) rr.getCell(18).value = std.note;
    rr.commit();
    rowIdx++;
  }

  // Auto-larghezza colonne A–R (in linea con clientela, esteso a R per la nota)
  for (let c = 1; c <= 18; c++) {
    let maxLen = 8;
    for (let r = DATA_START_ROW; r < rowIdx; r++) {
      const v = ws.getRow(r).getCell(c).value as unknown;
      const s = v == null ? '' : String((v as { text?: unknown })?.text ?? v);
      maxLen = Math.max(maxLen, s.length + 2);
    }
    ws.getColumn(c).width = Math.min(60, maxLen);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/**
 * Fallback generico per template NON standard.
 * Costruisce un xlsx minimale: intestazioni anagrafiche fisse + una colonna
 * per ogni campo del template (etichetta), valorizzata dalle `risposte`.
 */
export async function buildRapportinoGenericXlsx(
  rapportino: RapportinoRow,
  voci: RapportinoVoce[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rapportino');

  ws.getCell('B2').value = toDDMMYYYY(rapportino.data);
  ws.getCell('B4').value = safeStr(rapportino.staff_name);

  const campi = Array.isArray(rapportino.campi_snapshot)
    ? (rapportino.campi_snapshot as Array<{ chiave?: unknown; etichetta?: unknown }>)
    : [];

  const baseHeaders = [
    'NOMINATIVO',
    'MATRICOLA',
    'PDR',
    'ODSIN',
    'VIA',
    'COMUNE',
    'CAP',
    'RECAPITO',
    'ATTIVITA',
    'ACCESSIBILITA',
    'FASCIA ORARIA',
    'ORDINE',
  ];
  const campoLabels = campi.map((c) => safeStr(c.etichetta) || safeStr(c.chiave));
  const campoKeys = campi.map((c) => safeStr(c.chiave));

  const hrow = ws.getRow(HEADER_ROW);
  [...baseHeaders, ...campoLabels].forEach((label, i) => {
    hrow.getCell(i + 1).value = label;
  });
  hrow.commit();

  const ordered = [...voci].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  let rowIdx = DATA_START_ROW;
  for (const v of ordered) {
    const rr = ws.getRow(rowIdx);
    const ordine = v.ordine ?? rowIdx - HEADER_ROW;
    const baseVals = [
      safeStr(v.nominativo),
      safeStr(v.matricola),
      safeStr(v.pdr),
      safeStr(v.odsin),
      safeStr(v.via),
      safeStr(v.comune),
      safeStr(v.cap),
      safeStr(v.recapito),
      safeStr(v.attivita),
      safeStr(v.accessibilita),
      safeStr(v.fascia_oraria),
      ordine,
    ];
    baseVals.forEach((val, i) => {
      rr.getCell(i + 1).value = val as ExcelJS.CellValue;
    });
    const risposte = v.risposte ?? {};
    campoKeys.forEach((key, i) => {
      const raw = risposte[key];
      const val = raw === true ? 'X' : raw == null ? '' : String(raw);
      rr.getCell(baseHeaders.length + i + 1).value = val;
    });
    rr.commit();
    rowIdx++;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
