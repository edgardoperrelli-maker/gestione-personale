'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// lettere -> indici 0-based
const COL = {
  A_DATE: 92,        // CO
  B_OPERATORE: 95,   // CR
  O_NOMINATIVO: 52,  // BA
  P_MATRICOLA: 10,   // K
  N_PDR: 13,         // N — DESCRIZIONE PDR/IMPIANTO
  ODS: 3,            // D — ODSIN
  T_VIA: 54,         // BC
  Q_COMUNE: 72,      // BU
  R_CAP: 62,         // BK
  BG_RECAPITO: 74,   // BW
  ACCESSIBILITA_CA: 78, // CA
  FASCIA_ORARIA: 93,    // 95
  L_ATTIVITA: 11,    // L   — tipologia servizio
  NOTE_CT: 97           // CT
} as const;


/** Mappatura attivitÃ  di output da colonna M (se serve normalizzare) */
const ATTIVITA_MAP: Record<string, string> = {
  'S-AI-051': 'Sostituzione misuratore',
  'S-AI-052': 'Verifica misuratore',
  // aggiungi altre mappature se richieste
};

// ──────────────────────────────────────────────────────────────────────────────
// ALLEGATO 10 — Funzioni per la generazione automatica
// ──────────────────────────────────────────────────────────────────────────────

/** Rileva il territorio dal CAP.
 *  Lazio:   00000–04999
 *  Firenze: 50000–59999
 *  Default: lazio se non riconosciuto
 */
function detectTerritory(cap: string): 'lazio' | 'firenze' {
  const prefix = parseInt(cap.trim().slice(0, 2), 10);
  if (!isNaN(prefix) && prefix >= 50 && prefix <= 59) return 'firenze';
  return 'lazio';
}

/**
 * Sostituisce il valore visualizzato di ogni MERGEFIELD con il nome dato.
 *
 * Approccio: ricerca sequenziale per finestre strette — nessuna regex [\s\S]
 * che attraversi i confini delle textbox e moltiplichi il documento.
 *
 * Per ogni occorrenza di "MERGEFIELD <fieldName>" nel documento:
 *  1. Cerca fldCharType="separate" entro 3000 caratteri
 *  2. Cerca il primo <w:t> entro 500 caratteri dal separate
 *  3. Sostituisce solo il contenuto tra > e </w:t>
 */
function replaceMergeField(xml: string, fieldName: string, value: string): string {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let result = xml;
  let searchFrom = 0;

  while (true) {
    const instrIdx = result.indexOf(`MERGEFIELD ${fieldName}`, searchFrom);
    if (instrIdx < 0) break;

    // fldCharType="separate" deve essere entro 3000 chars
    const sepIdx = result.indexOf('fldCharType="separate"', instrIdx);
    if (sepIdx < 0 || sepIdx > instrIdx + 3000) { searchFrom = instrIdx + 1; continue; }

    // <w:t deve essere entro 500 chars dal separate
    const tStart = result.indexOf('<w:t', sepIdx);
    if (tStart < 0 || tStart > sepIdx + 500) { searchFrom = instrIdx + 1; continue; }

    const tTagEnd = result.indexOf('>', tStart) + 1;

    // </w:t> deve essere entro 300 chars
    const tClose = result.indexOf('</w:t>', tTagEnd);
    if (tClose < 0 || tClose > tTagEnd + 300) { searchFrom = instrIdx + 1; continue; }

    result = result.slice(0, tTagEnd) + escaped + result.slice(tClose);
    searchFrom = tTagEnd + escaped.length;
  }

  return result;
}

interface Allegato10Fields {
  NOME_UTENTE:  string;
  STRADA:       string;
  ODS:          string;
  NOME_LOCALITA:string;
  PDR:          string;
  NUMERO_SERIE: string;
  ESECUTORE:    string;
  DATA:         string;
  RECAPITO:     string;
}

// ─── Cache template (caricato una sola volta per sessione) ───────────────────
interface TemplateCache {
  zip: JSZip;
  xml: string;
}
let _lazioCache: TemplateCache | null = null;
let _firenzeCache: TemplateCache | null = null;

async function getLazioTemplate(): Promise<TemplateCache> {
  if (_lazioCache) return _lazioCache;
  const res = await fetch('/templates/ALLEGATO_10_LAZIO.docx');
  if (!res.ok) throw new Error('Template ALLEGATO_10_LAZIO.docx non trovato in /public/templates/');
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  _lazioCache = { zip, xml };
  return _lazioCache;
}

async function getFirenzeTemplate(): Promise<TemplateCache> {
  if (_firenzeCache) return _firenzeCache;
  const res = await fetch('/templates/ALLEGATO_10_FIRENZE.docx');
  if (!res.ok) throw new Error('Template ALLEGATO_10_FIRENZE.docx non trovato in /public/templates/');
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  _firenzeCache = { zip, xml };
  return _firenzeCache;
}

/** Estrae il contenuto del <w:body> escludendo il <w:sectPr> finale. */
function extractBodyContent(xml: string): string {
  const bodyStart = xml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd = xml.lastIndexOf('</w:body>');
  const body = xml.slice(bodyStart, bodyEnd);
  const lastSect = body.lastIndexOf('<w:sectPr');
  return lastSect >= 0 ? body.slice(0, lastSect) : body;
}

/** Ricostruisce un docx completo da una lista di XML compilati + il template. */
async function buildCombinedDocx(
  filledXmls: string[],
  templateCache: TemplateCache
): Promise<Uint8Array> {
  const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const { zip: templateZip, xml: templateXml } = templateCache;

  // Estrae il sectPr originale (mantiene layout/margini del template)
  const bodyOuter = templateXml.slice(
    templateXml.indexOf('<w:body>'),
    templateXml.lastIndexOf('</w:body>') + '</w:body>'.length
  );
  const lastSectIdx = bodyOuter.lastIndexOf('<w:sectPr');
  const sectPr = lastSectIdx >= 0
    ? bodyOuter.slice(lastSectIdx, bodyOuter.lastIndexOf('</w:body>'))
    : '';

  // Concatena i body con page break
  const combinedBody = filledXmls.map(extractBodyContent).join(PAGE_BREAK);

  // Ricostruisce il documento completo
  const bodyStart = templateXml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd = templateXml.lastIndexOf('</w:body>');
  const combinedXml =
    templateXml.slice(0, bodyStart) +
    combinedBody +
    sectPr +
    templateXml.slice(bodyEnd);

  // Clona il template zip e sostituisce solo document.xml
  const outputZip = new JSZip();
  const files = templateZip.files;
  await Promise.all(
    Object.keys(files).map(async (filename) => {
      const file = files[filename];
      if (file.dir) return;
      if (filename === 'word/document.xml') {
        outputZip.file(filename, combinedXml);
      } else {
        const content = await file.async('uint8array');
        outputZip.file(filename, content);
      }
    })
  );

  return outputZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Compila i campi Lazio su una stringa XML (nessun I/O). */
function fillLazioXml(templateXml: string, fields: Allegato10Fields): string {
  let xml = templateXml;
  for (const [field, value] of Object.entries(fields)) {
    xml = replaceMergeField(xml, field, value);
  }
  return xml;
}

/** Compila i campi Firenze sostituendo i placeholder {{...}}. */
function fillFirenzeXml(templateXml: string, fields: Allegato10Fields): string {
  const placeholderMap: Record<string, string> = {
    '{{NOME_UTENTE}}':   fields.NOME_UTENTE,
    '{{STRADA}}':        fields.STRADA,
    '{{NOME_LOCALITA}}': fields.NOME_LOCALITA,
    '{{RECAPITO}}':      fields.RECAPITO,
    '{{PDR}}':           fields.PDR,
    '{{ODS}}':           fields.ODS,
    '{{DATA}}':          fields.DATA,
    '{{NUMERO_SERIE}}':  fields.NUMERO_SERIE,
    '{{ESECUTORE}}':     fields.ESECUTORE,
  };
  let xml = templateXml;
  for (const [placeholder, value] of Object.entries(placeholderMap)) {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    xml = xml.replaceAll(placeholder, escaped);
  }
  return xml;
}

/** Costruisce i campi Allegato 10 a partire da una riga Excel e dalla data selezionata. */
function buildAllegato10Fields(r: any[], dateStr: string): Allegato10Fields {
  const pdrRaw = String(r[COL.N_PDR] ?? '').trim();
  return {
    NOME_UTENTE:   String(r[COL.O_NOMINATIVO] ?? '').trim(),
    STRADA:        String(r[COL.T_VIA] ?? '').trim(),
    ODS:           String(r[COL.ODS] ?? '').trim(),
    NOME_LOCALITA: String(r[COL.Q_COMUNE] ?? '').trim(),
    PDR:           pdrRaw,
    NUMERO_SERIE:  String(r[COL.P_MATRICOLA] ?? '').trim(),
    ESECUTORE:     String(r[COL.B_OPERATORE] ?? '').trim(),
    DATA:          dateStr,
    RECAPITO:      String(r[COL.BG_RECAPITO] ?? '').trim(),
  };
}

/** Combina più documenti docx in uno solo tramite API endpoint */
async function mergeMultipleDocx(documents: Uint8Array[]): Promise<Uint8Array> {
  if (documents.length === 0) return new Uint8Array();
  if (documents.length === 1) return documents[0];

  // Converti i documenti in base64 per l'API
  const docsBase64 = documents.map(doc => Buffer.from(doc).toString('base64'));

  const res = await fetch('/api/merge-docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: docsBase64 }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error?.error || 'Errore durante il merge dei documenti');
  }

  const { document: mergedBase64 } = await res.json();
  return new Uint8Array(Buffer.from(mergedBase64, 'base64'));
}

export const dynamic = 'force-dynamic';
// Rileva la colonna data cercando lâ€™header "DATA" o la colonna con piÃ¹ valori validi
function countMatches(rows: any[][], col: number, want: string, scan = 300): number {
  if (col == null) return 0;
  let n = 0;
  for (let r = 1; r < Math.min(rows.length, scan); r++) {
    if (normalizeDateCell(rows[r]?.[col]) === want) n++;
  }
  return n;
}

function normalizeDMY(v: any): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return normalizeDateCell(v);
  const s = String(v).trim().split(' ')[0].replace(/[-.]/g,'/');
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2,'0'), mm = m[2].padStart(2,'0');
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

function eqDateLoose(cell: any, wantDDMMYYYY: string): boolean {
  return normalizeDMY(cell) === wantDDMMYYYY;
}

function detectDateColHeader(rows: any[][]): number | null {
  if (!rows.length) return null;
  const header = rows[0] || [];
  for (let c = 0; c < Math.min(header.length, 200); c++) {
    const h = String(header[c] ?? '').trim().toUpperCase();
    if (h === 'DATA' || h === 'DATA APPUNTAMENTO' || h === 'DATA LAVORO' || h === 'DATA INTERVENTO') return c;
  }
  return null;
}

/** Scelta robusta della colonna data.
 *  PrioritÃ : CO (COL.A_DATE) -> header noto -> colonna con piÃ¹ match alla data voluta.
 */
function pickDateCol(rows: any[][], want: string): number {
  const cols = Math.min(rows[0]?.length ?? 0, 200);
  const pref = COL.A_DATE; // CO = 92

  const count = (col: number, scan = 500) => {
    if (col == null) return 0;
    let n = 0;
    for (let r = 1; r < Math.min(rows.length, scan); r++) {
      if (eqDateLoose(rows[r]?.[col], want)) n++;
    }
    return n;
  };

  if (pref < cols && count(pref) > 0) return pref;

  const byHeader = detectDateColHeader(rows);
  if (byHeader != null && count(byHeader) > 0) return byHeader;

  let bestCol = 0, best = -1;
  for (let c = 0; c < cols; c++) {
    const n = count(c);
    if (n > best) { best = n; bestCol = c; }
  }
  return best > 0 ? bestCol : (pref < cols ? pref : 0);
}
function guessDataStartRow(rows: any[][]): number {
  // se nelle prime 10 righe trovi "RISORSA" in COL.B_OPERATORE, parti dalla successiva
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const v = String(rows[i]?.[COL.B_OPERATORE] ?? '').trim().toUpperCase();
    if (v === 'RISORSA') return i + 1;
  }
  // altrimenti dalla riga 1
  return 1;
}



function looksLikeDate(v: any): boolean {
  if (v == null || v === '') return false;
  if (typeof v === 'number') return true; // seriale Excel
  const s = String(v).trim();
  const t = s.split(' ')[0].replace(/-/g,'/'); // rimuovi orario, normalizza -
  return /^\d{2}\/\d{2}\/\d{2,4}$/.test(t) || /^\d{4}\/\d{2}\/\d{2}$/.test(t);
}

function normalizeDateCell(v: any): string {
  if (v == null || v === '') return '';

  // Excel seriale -> DD/MM/YYYY
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth() + 1).padStart(2,'0');
    const yyyy = String(d.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  // Stringa: rimuovi l'orario e normalizza separatori
  let s = String(v).trim().split(' ')[0].replace(/[-.]/g, '/');

  // yyyy/m/d  -> dd/mm/yyyy
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2,'0');
    const dd = m[3].padStart(2,'0');
    return `${dd}/${mm}/${yyyy}`;
  }

  // d/m/yy(yy) -> dd/mm/yyyy  [giorno-mese-prima, come nel master]
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2,'0');
    const mm = m[2].padStart(2,'0');
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // giÃ  DD/MM/YYYY o altro non riconosciuto
  return s;
}
// Excel seriale -> yyyy,mm,dd in UTC
function fromExcelSerial(n: number) {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// prova a leggere qualsiasi cella come {y,m,d}
function parseDateAny(v: any): { y:number, m:number, d:number } | null {
  if (v == null || v === '') return null;

  if (typeof v === 'number') {
    // numeri molto grandi o piccoli non sono date plausibili
    if (v > 200000 || v < 10000) return null;
    return fromExcelSerial(v);
  }

  const s0 = String(v).trim();
  if (!s0) return null;
  const s = s0.split(' ')[0].replace(/[-.]/g,'/'); // togli orario e normalizza

  // yyyy/m/d
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  // d/m/yy(yy)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? +(`20${m[3]}`) : +m[3];
    return { y, m: mo, d };
  }

  return null;
}

// voglio matchare DD/MM/YYYY
function parseWanted(wantDDMMYYYY: string): { y:number, m:number, d:number } {
  const [dd, mm, yyyy] = wantDDMMYYYY.split('/').map(n => +n);
  return { y: yyyy, m: mm, d: dd };
}

function eqDateCell(cell: any, wantObj: {y:number,m:number,d:number}): boolean {
  const p = parseDateAny(cell);
  if (!p) return false;
  return p.y === wantObj.y && p.m === wantObj.m && p.d === wantObj.d;
}

function normalizeOperatorName(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}


export default function RapportinoMassivaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('Nessun file MASSIVA');
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  });
  const [operators, setOperators] = useState<string[]>([]);
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [useCombined, setUseCombined] = useState(false);
  const [allegato10ActiveCodes, setAllegato10ActiveCodes] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/admin/allegato10-codici')
      .then(r => r.json())
      .then(({ codici }: { codici: Array<{ codice: string; genera_allegato: boolean }> }) => {
        setAllegato10ActiveCodes(
          (codici ?? []).filter(c => c.genera_allegato).map(c => c.codice)
        );
      })
      .catch(() => {});
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    // MASSIVA: prioritÃ  a "SHEET1", poi eventuali fogli conosciuti, poi il primo
    const attSheetName =
      wb.SheetNames.find(s => s.toUpperCase().includes('SHEET1')) ??
      wb.SheetNames.find(s => s.toUpperCase().includes('DETTAGLIO RISORSE INTERNE')) ??
      wb.SheetNames.find(s => s.toUpperCase().includes('ATTGIORN')) ??
      wb.SheetNames[0];

    const ws = wb.Sheets[attSheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true }) as any[][];

    setRawRows(rows);

    // Auto-discovery codici servizio
    const codiciFile = [...new Set(
      (rows ?? [])
        .slice(1) // salta header
        .map((r: any[]) => String(r[COL.L_ATTIVITA] ?? '').trim())
        .filter(c => c.length > 0)
    )];
    if (codiciFile.length > 0) {
      fetch('/api/admin/allegato10-codici', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codici: codiciFile }),
      }).catch(() => {});
    }

    // header "RISORSA" in colonna B
    let start = 1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const v = String(rows[i]?.[COL.B_OPERATORE] ?? '').trim();
      if (/^risorsa$/i.test(v)) { start = i + 1; break; }
    }

    const ops = new Set<string>();
    for (let i = start; i < rows.length; i++) {
      const val = normalizeOperatorName(rows[i]?.[COL.B_OPERATORE]);
      if (val) ops.add(val);
    }
    const opList = Array.from(ops).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    setOperators(opList);
    setSelectedOps([]);

if (opList.length === 0) {
  setErr(`Nessun operatore trovato nella colonna CR (n. 96) sul foglio "${attSheetName}".`);
}

  }

  function addOperatorManually(op: string) {
    const v = normalizeOperatorName(op);
    if (!v) return;
    setOperators(prev => (prev.includes(v) ? prev : [...prev, v]));
  }
  function removeOperator(op: string) {
    setOperators(prev => prev.filter(x => x !== op));
    setSelectedOps(prev => prev.filter(x => x !== op));
  }
  function toggleSelected(op: string) {
    setSelectedOps(prev => (prev.includes(op) ? prev.filter(x => x !== op) : [...prev, op]));
  }
  function selectAllToggle() {
    setSelectedOps(prev =>
      prev.length === operators.length ? [] : operators
    );
  }
// ritorna la colonna con piÃ¹ match esatti alla data voluta (DD/MM/YYYY), cercando tra tutte
function findBestDateColAcrossAll(rows: any[][], want: string): number | null {
  if (!rows.length) return null;
  const cols = Math.min(rows[0]?.length ?? 0, 200);
  let bestCol: number | null = null, best = 0;
  for (let c = 0; c < cols; c++) {
    let n = 0;
    for (let r = 1; r < rows.length; r++) {
      if (eqDateLoose(rows[r]?.[c], want)) n++;
    }
    if (n > best) { best = n; bestCol = c; }
  }
  return best > 0 ? bestCol : null;
}
function rowHasDate(row: any[], want: string): boolean {
  if (!row) return false;
  for (let c = 0; c < Math.min(row.length, 200); c++) {
    if (eqDateLoose(row[c], want)) return true;
  }
  return false;
}
function rowHasWantedDate(row: any[], wantObj: {y:number,m:number,d:number}): boolean {
  if (!row) return false;
  for (let c = 0; c < Math.min(row.length, 200); c++) {
    if (eqDateCell(row[c], wantObj)) return true;
  }
  return false;
}

const filteredRows = useMemo(() => {
  if (!rawRows.length) return [];
  const wantStr = normalizeDateCell(dateStr);        // es. 05/11/2025
  const wantObj = parseWanted(wantStr);
  const startRow = guessDataStartRow(rawRows);

  // 1) prioritÃ : colonna preferita/best
  let dateCol = pickDateCol(rawRows, wantStr);
  let out: any[][] = [];
  for (let i = startRow; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!eqDateCell(r?.[dateCol], wantObj)) continue;

    const lIdx = (COL as any).L_ATTIVITA as number | undefined;
    if (typeof lIdx === 'number') {
      const lval = String(r?.[lIdx] ?? '').trim().toUpperCase();
      if (lval === 'UT I51 CAMBIO DA DIAGNOSTICA') continue;
    }
    out.push(r);
  }
  if (out.length > 0) return out;

  // 2) fallback: colonna con piÃ¹ match reali
  const best = findBestDateColAcrossAll(rawRows, wantStr);
  if (best != null && best !== dateCol) {
    dateCol = best;
    out = [];
    for (let i = startRow; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (!eqDateCell(r?.[dateCol], wantObj)) continue;

      const lIdx = (COL as any).L_ATTIVITA as number | undefined;
      if (typeof lIdx === 'number') {
        const lval = String(r?.[lIdx] ?? '').trim().toUpperCase();
        if (lval === 'UT I51 CAMBIO DA DIAGNOSTICA') continue;
      }
      out.push(r);
    }
    if (out.length > 0) return out;
  }

  // 3) fallback finale: cerca la data in QUALSIASI colonna della riga
  out = [];
  for (let i = startRow; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!rowHasWantedDate(r, wantObj)) continue;

    const lIdx = (COL as any).L_ATTIVITA as number | undefined;
    if (typeof lIdx === 'number') {
      const lval = String(r?.[lIdx] ?? '').trim().toUpperCase();
      if (lval === 'UT I51 CAMBIO DA DIAGNOSTICA') continue;
    }
    out.push(r);
  }
  return out;
}, [rawRows, dateStr]);

  function safeStr(v: any) { return String(v ?? '').trim(); }

  function attivitaOut(codeOrText: string) {
    const s = safeStr(codeOrText);
    return ATTIVITA_MAP[s] ?? s;
  }

  function sanitizeSheetName(name: string) {
    return name.replace(/[:\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function onGenerate() {
    try {
      setBusy(true); setErr(null); setMsg(null);
      if (!file) throw new Error('Seleziona il file MASSIVA.');
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) throw new Error('Data non valida (DD/MM/YYYY).');
      if (!filteredRows.length) throw new Error('Nessuna riga dopo i filtri per la data.');
      if (!useCombined && selectedOps.length === 0) {
        throw new Error('Seleziona almeno un operatore o attiva il foglio unico.');
      }

      const tplRes = await fetch('/templates/Rapportino.xlsx');
      if (!tplRes.ok) throw new Error('Template Rapportino.xlsx non trovato in /public/templates/.');
      const tplBuf = await tplRes.arrayBuffer();
      const tplWb = new ExcelJS.Workbook();
      await tplWb.xlsx.load(tplBuf);

      // Base worksheet del template
      const base = tplWb.worksheets[0];
      const baseName = base.name;
      const wbName = 'RAPPORTINI';
      const dateSlug = dateStr.replaceAll('/','-');
      const outName = `RAPPORTINI_${dateSlug}.xlsx`;

      // Determina target: singoli operatori o foglio unico
      const targets = useCombined ? ['RAPPORTINO'] : selectedOps;
      const perOp: Record<string, any[][]> = {};

      for (const op of targets) {
        const opName = sanitizeSheetName(op).slice(0, 31);
const rowsForOp = useCombined
  ? filteredRows
  : filteredRows.filter(r => normalizeOperatorName(r[COL.B_OPERATORE]) === op);

// NOTE: raccogli da CT
const notes: Array<{nom:string; via:string; note:string}> = [];

// Ordina per Fascia oraria Aâ†’Z
const rowsSorted = rowsForOp.slice().sort((a, b) =>
  safeStr(a[COL.FASCIA_ORARIA]).localeCompare(safeStr(b[COL.FASCIA_ORARIA]), 'it', { sensitivity: 'base' })
);
perOp[opName] = rowsSorted;
if (!rowsSorted.length) continue;

const ws = cloneFromTemplate(base, opName, tplWb);
ws.getCell('B2').value = dateStr;
ws.getCell('B4').value = useCombined ? '' : opName;

// Header riga 6 (A..Q) — allineato al template Rapportino.xlsx
const hdr = [
  'NOMINATIVO','MATRICOLA','PDR','ODSIN','VIA','COMUNE','CAP',
  'RECAPITO','ATTIVITA','ACCESSIBILITA','FASCIA ORARIA','ORDINE',
  'ATT/CESS','CAMBIO','MINI BAG','RG STOP','ASSENTE'
];
['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q'].forEach((col, i) => {
  ws.getCell(`${col}6`).value = hdr[i];
});

// Deduplica per PDR: se stesso PDR su righe diverse, si visita una sola volta
const seenPdrExcel = new Set<string>();
const rowsDeduped = rowsSorted.filter(r => {
  const pdr = safeStr(r[COL.N_PDR]);
  if (!pdr) return true;
  if (seenPdrExcel.has(pdr)) return false;
  seenPdrExcel.add(pdr);
  return true;
});

let rowIdx = 7;
for (const r of rowsDeduped) {
  const nominativo = safeStr(r[COL.O_NOMINATIVO]);
  const matricola  = safeStr(r[COL.P_MATRICOLA]);
  const pdrRaw     = safeStr(r[COL.N_PDR]);
  const ods        = safeStr(r[COL.ODS]);
  const via        = safeStr(r[COL.T_VIA]);
  const comune     = safeStr(r[COL.Q_COMUNE]);
  const cap        = safeStr(r[COL.R_CAP]);
  const recapito   = safeStr(r[COL.BG_RECAPITO]);
  const attivita   = safeStr(r[COL.L_ATTIVITA]) || 'S-AI-049';
  const access     = safeStr(r[COL.ACCESSIBILITA_CA]);
  const fascia     = safeStr(r[COL.FASCIA_ORARIA]);
  const pdr        = pdrRaw;
  const ordine     = rowIdx - 6; // numero progressivo 1-based

  ws.getCell(`A${rowIdx}`).value = nominativo;
  ws.getCell(`B${rowIdx}`).value = matricola;
  ws.getCell(`C${rowIdx}`).value = pdr;
  ws.getCell(`D${rowIdx}`).value = ods;          // ODSIN
  ws.getCell(`E${rowIdx}`).value = via;
  ws.getCell(`F${rowIdx}`).value = comune;
  ws.getCell(`G${rowIdx}`).value = cap;
  ws.getCell(`H${rowIdx}`).value = recapito;
  ws.getCell(`I${rowIdx}`).value = attivita;
  ws.getCell(`J${rowIdx}`).value = access;
  ws.getCell(`K${rowIdx}`).value = fascia;
  ws.getCell(`K${rowIdx}`).numFmt = '@';
  ws.getCell(`L${rowIdx}`).value = ordine;

  // accumulate NOTE da CT
  const noteText = safeStr(r[COL.NOTE_CT]);
  if (noteText) notes.push({ nom: nominativo, via, note: noteText });

  rowIdx++;
}

// --- NOTE in fondo, righe 36+ (riga 35 = "INTERVENTI CON NOTE" dal template) ---
const NOTE_START = 36;
const NOTE_END   = 41;
const maxNotes = Math.min(notes.length, NOTE_END - NOTE_START + 1);
for (let i = 0; i < maxNotes; i++) {
  const rr = NOTE_START + i;
  ws.getCell(`A${rr}`).value = notes[i].nom;
  ws.getCell(`B${rr}`).value = notes[i].via;
  ws.getCell(`C${rr}`).value = notes[i].note;
}
for (let r = NOTE_START; r <= NOTE_END; r++) {
  for (const c of ['A','B','C'] as const) {
    ws.getCell(`${c}${r}`).border = {
      top: {style:'thin'}, left:{style:'thin'},
      bottom:{style:'thin'}, right:{style:'thin'},
    };
  }
}

ws.pageSetup.orientation = 'landscape';
ws.pageSetup.fitToPage = true;
ws.pageSetup.fitToWidth = 1;
ws.pageSetup.fitToHeight = 0;
(ws as any).pageSetup.printArea = `A1:Q${NOTE_END}`;

      }

      // rimuovi foglio base se Ã¨ ancora presente
      if (tplWb.worksheets.length > 1) {
        const idx = tplWb.worksheets.findIndex(w => w.name === baseName);
        if (idx >= 0) tplWb.removeWorksheet(idx + 1);
      }

      // ── Scrivi xlsx nel buffer ──
      const xlsxBuf = await tplWb.xlsx.writeBuffer();

      // ── Crea ZIP con xlsx + Allegato 10 per ogni riga ──
      const outputZip = new JSZip();
      const dateSlugZip = dateStr.replaceAll('/', '-');
      const zipName = `RAPPORTINI_${dateSlugZip}.zip`;

      // Aggiungi il rapportino Excel
      outputZip.file(outName, xlsxBuf);

      // ── Allegato 10: genera un .docx per ogni riga, combinati per operatore ──
      const allegato10Errors: string[] = [];
      const processedRows = useCombined
        ? filteredRows
        : filteredRows.filter(r =>
            selectedOps.includes(normalizeOperatorName(r[COL.B_OPERATORE]))
          );

      // Raggruppa per operatore (deduplicando per PDR dentro ogni gruppo)
      const rowsByOperator: Record<string, any[]> = {};
      const seenPdrByOp: Record<string, Set<string>> = {};
      for (const r of processedRows) {
        const op = normalizeOperatorName(r[COL.B_OPERATORE]);
        if (!rowsByOperator[op]) { rowsByOperator[op] = []; seenPdrByOp[op] = new Set(); }
        const pdr = safeStr(r[COL.N_PDR]);
        if (pdr && seenPdrByOp[op].has(pdr)) continue;
        if (pdr) seenPdrByOp[op].add(pdr);
        rowsByOperator[op].push(r);
      }

      // Pre-carica i template (una sola volta, in parallelo se servono entrambi)
      const needsLazio   = processedRows.some(r => detectTerritory(String(r[COL.R_CAP] ?? '')) === 'lazio');
      const needsFirenze = processedRows.some(r => detectTerritory(String(r[COL.R_CAP] ?? '')) === 'firenze');

      const [lazioTpl, firenzeTpl] = await Promise.all([
        needsLazio   ? getLazioTemplate()   : Promise.resolve(null),
        needsFirenze ? getFirenzeTemplate() : Promise.resolve(null),
      ]);

      // Per ogni operatore, genera XML per ogni riga e combina in un unico docx
      for (const [operatorName, rows] of Object.entries(rowsByOperator)) {
        const filledByTerritory: Record<'lazio' | 'firenze', string[]> = {
          lazio: [], firenze: [],
        };

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx];
          try {
            const fields     = buildAllegato10Fields(r, dateStr);
            const codiceRiga = safeStr(r[COL.L_ATTIVITA]) || 'S-AI-049';
            const shouldGenerate = allegato10ActiveCodes.length === 0 ||
              allegato10ActiveCodes.some(c => codiceRiga.toUpperCase().startsWith(c.toUpperCase()));

            if (shouldGenerate) {
              const territory  = detectTerritory(String(r[COL.R_CAP] ?? '').trim());

              if (territory === 'lazio' && lazioTpl) {
                filledByTerritory.lazio.push(fillLazioXml(lazioTpl.xml, fields));
              } else if (territory === 'firenze' && firenzeTpl) {
                filledByTerritory.firenze.push(fillFirenzeXml(firenzeTpl.xml, fields));
              }
            }
          } catch (err: any) {
            allegato10Errors.push(`${operatorName} riga ${idx + 1}: ${err?.message ?? err}`);
          }
        }

        const safeOpName = operatorName
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '_')
          .slice(0, 30);

        if (filledByTerritory.lazio.length > 0 && lazioTpl) {
          try {
            const docx = await buildCombinedDocx(filledByTerritory.lazio, lazioTpl);
            outputZip.file(`allegato10/${safeOpName}_Allegato10_LAZIO.docx`, docx);
          } catch (err: any) {
            allegato10Errors.push(`${operatorName} merge Lazio: ${err?.message ?? err}`);
          }
        }

        if (filledByTerritory.firenze.length > 0 && firenzeTpl) {
          try {
            const docx = await buildCombinedDocx(filledByTerritory.firenze, firenzeTpl);
            outputZip.file(`allegato10/${safeOpName}_Allegato10_FIRENZE.docx`, docx);
          } catch (err: any) {
            allegato10Errors.push(`${operatorName} merge Firenze: ${err?.message ?? err}`);
          }
        }
      }

      // ── Download ZIP ──
      const zipBlob = await outputZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();

      const errNote = allegato10Errors.length
        ? ` (⚠️ ${allegato10Errors.length} Allegato 10 non generati: ${allegato10Errors[0]})`
        : '';
      setMsg(`ZIP generato: ${zipName} — ${processedRows.length} Allegati 10${errNote}`);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Errore generazione.');
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = useCombined ? operators.length : selectedOps.length;
  const canGenerate = !!file && filteredRows.length > 0 && (useCombined || selectedOps.length > 0) && !busy;

  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <section className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
              >
                Rapportini · Massiva
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
                  Genera rapportino massivo
                </h1>
                <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--brand-text-muted)' }}>
                  Carica il file MASSIVA, filtra le righe per data e scegli se produrre un foglio unico oppure file separati per operatore in formato Excel.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-primary-soft)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>File</div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  {file ? 'Caricato' : 'In attesa'}
                </div>
              </div>
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>Operatori</div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>{selectedCount}</div>
              </div>
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>Righe filtrate</div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>{filteredRows.length}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>1. File sorgente</h2>
                  <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                    Formati supportati: `.xlsx`, `.xls`, `.xlsm`.
                  </p>
                </div>

                <div
                  className="rounded-[24px] border border-dashed p-5"
                  style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <div className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                        {file ? fileName : 'Nessun file MASSIVA selezionato'}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Il sistema legge il foglio principale e propone automaticamente gli operatori trovati.
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id="massiva-file-input"
                        type="file"
                        accept=".xlsx,.xls,.xlsm"
                        onChange={onPick}
                        className="hidden"
                      />
                      <label
                        htmlFor="massiva-file-input"
                        className="inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-white transition"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {file ? 'Sostituisci file' : 'Carica file'}
                      </label>
                      {file && (
                        <button
                          type="button"
                          className="rounded-2xl border px-4 py-2 text-sm font-medium transition hover:bg-black/5"
                          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
                          onClick={() => { setFile(null); setFileName('Nessun file MASSIVA'); setRawRows([]); setErr(null); setMsg(null); }}
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>2. Data di lavoro</h2>
                    <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                      Il filtro applica la data a tutte le righe del file importato.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>
                      Data (DD/MM/YYYY)
                    </label>
                    <input
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      placeholder="gg/mm/aaaa"
                      className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
                      style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>3. Modalita output</h2>
                    <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                      Scegli se produrre un foglio unico o mantenere la divisione per operatore.
                    </p>
                  </div>

                  <label
                    className="flex items-start gap-3 rounded-2xl border p-4 transition"
                    style={{
                      borderColor: useCombined ? 'var(--brand-primary)' : 'var(--brand-border)',
                      backgroundColor: useCombined ? 'var(--brand-primary-soft)' : 'white',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useCombined}
                      onChange={(e) => setUseCombined(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                        Foglio unico &quot;RAPPORTINO&quot;
                      </div>
                      <div className="text-sm leading-6" style={{ color: 'var(--brand-text-muted)' }}>
                        Un solo foglio con tutte le righe filtrate, senza selezione manuale operatori.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <OperatorPicker
              operators={operators}
              selectedOps={selectedOps}
              onToggle={toggleSelected}
              onAdd={addOperatorManually}
              onRemove={removeOperator}
              onSelectAll={selectAllToggle}
              disabled={useCombined}
            />
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>5. Riepilogo operativo</h2>
                  <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                    Controlla i dati prima di scaricare il file Excel.
                  </p>
                </div>

                <div className="space-y-3 text-sm" style={{ color: 'var(--brand-text-main)' }}>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>File sorgente</span>
                    <span className="font-semibold">{file ? 'Pronto' : 'Assente'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>Data selezionata</span>
                    <span className="font-semibold">{dateStr}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>Operatori coinvolti</span>
                    <span className="font-semibold">{selectedCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>Righe utili</span>
                    <span className="font-semibold">{filteredRows.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>Output</span>
                    <span className="font-semibold">Excel</span>
                  </div>
                </div>

                {msg && (
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#166534' }}>
                    {msg}
                  </div>
                )}
                {err && (
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
                    {err}
                  </div>
                )}

                <button
                  disabled={!canGenerate}
                  onClick={onGenerate}
                  className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {busy ? 'Elaborazione in corso...' : 'Download'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </AuthGate>
  );
}

/* ------------ Component: OperatorPicker ------------ */
function OperatorPicker({
  operators,
  selectedOps,
  onToggle,
  onAdd,
  onRemove,
  onSelectAll,
  disabled,
}: {
  operators: string[];
  selectedOps: string[];
  onToggle: (op: string) => void;
  onAdd: (op: string) => void;
  onRemove: (op: string) => void;
  onSelectAll: () => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  return (
    <section className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>4. Selezione operatori</h2>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              {disabled
                ? 'Modalita foglio unico attiva: la selezione manuale e momentaneamente disabilitata.'
                : 'Aggiungi manualmente operatori oppure seleziona quelli letti dal file.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
            >
              Totali: {operators.length}
            </span>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: selectedOps.length ? '#ECFDF3' : '#F8FAFC', color: selectedOps.length ? '#166534' : 'var(--brand-text-muted)' }}
            >
              Selezionati: {selectedOps.length}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Aggiungi operatore"
            className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
              onClick={() => { if (!disabled) { onAdd(value); setValue(''); } }}
              disabled={disabled}
            >
              Aggiungi
            </button>
            <button
              type="button"
              className="rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
              onClick={onSelectAll}
              disabled={disabled || operators.length === 0}
            >
              {selectedOps.length === operators.length && operators.length > 0 ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>
        </div>

        {operators.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
            Nessun operatore disponibile. Carica un file oppure aggiungi un nominativo manualmente.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {operators.map((op) => {
              const active = selectedOps.includes(op);

              return (
                <li
                  key={op}
                  className="rounded-2xl border p-4 transition"
                  style={{
                    borderColor: active ? 'var(--brand-primary)' : 'var(--brand-border)',
                    backgroundColor: active ? 'var(--brand-primary-soft)' : 'white',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => onToggle(op)}
                        disabled={disabled}
                        className="mt-1 h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <div className="min-w-0">
                        <div
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold"
                          style={{ color: 'var(--brand-text-main)' }}
                          title={normalizeOperatorName(op)}
                        >
                          {normalizeOperatorName(op)}
                        </div>
                        <div className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                          {active ? 'Incluso nella generazione' : 'Non selezionato'}
                        </div>
                      </div>
                    </label>

                    <button
                      type="button"
                      className="text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
                      style={{ color: '#B91C1C' }}
                      onClick={() => onRemove(op)}
                      disabled={disabled}
                    >
                      Rimuovi
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------ Helpers: cloneFromTemplate ------------ */
function cloneFromTemplate(base: ExcelJS.Worksheet, name: string, wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(name);

  // copia colonne
  ws.columns = base.columns?.map((c) => ({
    key: c.key,
    width: c.width,
    outlineLevel: c.outlineLevel,
    style: JSON.parse(JSON.stringify(c.style || {})),
  })) ?? [];

  // copia tutte le righe dal template
  const maxRows = base.rowCount || 71;
  for (let r = 1; r <= maxRows; r++) {
    const wr = ws.getRow(r);
    const br = base.getRow(r);
    // celle
    for (let col = 1; col <= (base.columnCount || 20); col++) {
      const wc = wr.getCell(col);
      const bc = br.getCell(col);
      // @ts-ignore
      wc.style = JSON.parse(JSON.stringify(bc.style || {}));
      wc.protection = bc.protection;
      wc.numFmt = bc.numFmt;
    }
    wr.commit();
  }

  // @ts-ignore
  const merges: string[] = (base as any).model?.merges || [];
  for (const m of merges) ws.mergeCells(m);

  return ws;
}




