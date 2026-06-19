import 'server-only';
import path from 'path';
import { readFile } from 'fs/promises';
import ExcelJS from 'exceljs';
import { resolveInfoCampi, valoreInfo, coordinateFromRaw, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { campiEsportabili, type TemplateCampo } from '@/utils/rapportini/buildVoci';
import { colonneVisibili, type VoceColonne } from '@/utils/rapportini/colonneVisibili';
import { mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { preparaBanda, posizionaBanda } from './bandaRapportino';

/**
 * Export Excel dinamico dei rapportini compilati (lato server).
 *
 * Le colonne sono determinate da `info_snapshot` del rapportino:
 *   - Campi anagrafici (in ordine dal template) → ORDINE → campi compilabili
 * Snapshot info vuoto → fallback agli 11 campi storici nell'ordine canonico.
 *
 * Il template viene letto dal filesystem (NON via fetch — gira server-side).
 */

const HEADER_ROW = 6;
const DATA_START_ROW = 7;

/** Voce di rapportino così come arriva dalla tabella `rapportino_voci`. */
export interface RapportinoVoce {
  ordine?: number | null;
  nominativo?: string | null;
  matricola?: string | null;
  pdr?: string | null;
  odl?: string | null;
  via?: string | null;
  comune?: string | null;
  cap?: string | null;
  recapito?: string | null;
  attivita?: string | null;
  accessibilita?: string | null;
  fascia_oraria?: string | null;
  risposte?: Record<string, unknown> | null;
  raw_json?: unknown;
}

/** Rapportino dalla tabella `rapportini`. */
export interface RapportinoRow {
  staff_name?: string | null;
  data?: string | null;
  campi_snapshot?: unknown;
  info_snapshot?: unknown;
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
 * Builder Excel dinamico: colonne = info del template (in ordine) + ORDINE +
 * campi compilabili. Snapshot info vuoto → fallback agli 11 campi storici.
 */
export async function buildRapportinoXlsx(
  rapportino: RapportinoRow,
  voci: RapportinoVoce[],
): Promise<Buffer> {
  const wb = await loadTemplate();
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Foglio template non valido in Rapportino.xlsx.');
  const stiliBanda = preparaBanda(ws);

  const vociC = voci.map((v) => ({ ...v, coordinate: coordinateFromRaw(v.raw_json) }));
  const info = resolveInfoCampi((rapportino.info_snapshot ?? []) as TemplateInfoCampo[]);
  const campi = (Array.isArray(rapportino.campi_snapshot) ? rapportino.campi_snapshot : []) as TemplateCampo[];
  const campiOrd = campiEsportabili(campi).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const { info: infoVis, campi: campiVis } = vociC.length > 0
    ? colonneVisibili(info, campiOrd, vociC as unknown as VoceColonne[])
    : { info, campi: campiOrd };

  ws.getCell('B2').value = toDDMMYYYY(rapportino.data);
  ws.getCell('B4').value = safeStr(rapportino.staff_name);

  const headers = [...infoVis.map((c) => c.etichetta), 'ORDINE', ...campiVis.map((c) => c.etichetta), 'NUOVO'];
  const hrow = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => { hrow.getCell(i + 1).value = label; });
  for (let c = headers.length + 1; c <= 26; c++) hrow.getCell(c).value = null; // pulisci celle residue
  hrow.commit();

  const ordered = [...vociC].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  let rowIdx = DATA_START_ROW;
  for (const v of ordered) {
    const rr = ws.getRow(rowIdx);
    const ordine = v.ordine ?? rowIdx - HEADER_ROW;
    const risposte = (v.risposte ?? {}) as Record<string, unknown>;
    const nuovo = Boolean((v.raw_json as { _nuovo?: unknown } | null | undefined)?._nuovo);
    let col = 1;
    for (const c of infoVis) {
      const val = valoreInfo(v as VoceInfo, c.chiave);
      if (c.chiave === 'coordinate' && val) {
        rr.getCell(col).value = { text: val, hyperlink: mapsUrlFromCoordinate(val) } as ExcelJS.CellHyperlinkValue;
      } else {
        rr.getCell(col).value = val;
      }
      if (c.chiave === 'fascia_oraria') rr.getCell(col).numFmt = '@';
      col++;
    }
    rr.getCell(col).value = ordine; col++;
    for (const campo of campiVis) {
      const raw = risposte[campo.chiave];
      rr.getCell(col).value = raw === true ? 'X' : raw == null ? '' : String(raw);
      col++;
    }
    // Badge "NUOVO" (ultima colonna): testo + evidenziazione riga per spotting a colpo d'occhio.
    rr.getCell(col).value = nuovo ? 'NUOVO' : '';
    if (nuovo) {
      for (let c = 1; c <= col; c++) {
        rr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CC' } };
      }
      const badge = rr.getCell(col);
      badge.font = { bold: true, color: { argb: 'FF7A5B00' } };
      badge.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD54A' } };
    }
    rr.commit();
    rowIdx++;
  }

  // Banda "INTERVENTI CON NOTE" dinamica: scende sotto l'ultima voce in overflow.
  posizionaBanda(ws, rowIdx - DATA_START_ROW, stiliBanda);

  const totalCols = infoVis.length + 1 + campiVis.length + 1;
  for (let c = 1; c <= totalCols; c++) {
    let maxLen = 8;
    for (let r = HEADER_ROW; r < rowIdx; r++) {
      const val = ws.getRow(r).getCell(c).value as unknown;
      const s = val == null ? '' : String((val as { text?: unknown })?.text ?? val);
      maxLen = Math.max(maxLen, s.length + 2);
    }
    ws.getColumn(c).width = Math.min(60, maxLen);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
