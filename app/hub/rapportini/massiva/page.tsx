'use client';

import { useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

// lettere -> indici 0-based
const COL = {
  A_DATE: 92,        // CO
  B_OPERATORE: 95,   // CR
  O_NOMINATIVO: 52,  // BA
  P_MATRICOLA: 10,   // K
  N_PDR: 12,         // M
  T_VIA: 54,         // BC
  Q_COMUNE: 72,      // BU
  R_CAP: 62,         // BK
  BG_RECAPITO: 74,   // BW
  ACCESSIBILITA_CA: 78, // CA
  FASCIA_ORARIA: 93,    // 95   <-- VIRGOLA QUI
  NOTE_CT: 97           // CT
} as const;


/** Mappatura attività di output da colonna M (se serve normalizzare) */
const ATTIVITA_MAP: Record<string, string> = {
  'S-AI-051': 'Sostituzione misuratore',
  'S-AI-052': 'Verifica misuratore',
  // aggiungi altre mappature se richieste
};

type SaveTarget = 'download' | 'sharepoint' | 'supabase';
export const dynamic = 'force-dynamic';
// Rileva la colonna data cercando l’header "DATA" o la colonna con più valori validi
function detectDateCol(rows: any[][], searchRows = 150): number {
  if (!rows.length) return 0;
  const header = rows[0] || [];
  // 1) prova con intestazioni
  for (let c = 0; c < Math.min(header.length, 200); c++) {
    const h = String(header[c] ?? '').trim().toUpperCase();
    if (h === 'DATA' || h === 'DATA APPUNTAMENTO' || h === 'DATA LAVORO' || h === 'DATA INTERVENTO') return c;
  }
  // 2) prova euristica: colonna con più match di date
  const cols = Math.min(rows[0]?.length ?? 0, 200);
  let bestCol = 0, bestScore = -1;
  for (let c = 0; c < cols; c++) {
    let score = 0;
    for (let r = 1; r < Math.min(rows.length, searchRows); r++) {
      const v = rows[r]?.[c];
      if (looksLikeDate(v)) score++;
    }
    if (score > bestScore) { bestScore = score; bestCol = c; }
  }
  return bestCol;
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
  if (typeof v === 'number') {
    // seriale Excel -> DD/MM/YYYY
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yyyy = String(d.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }
  let s = String(v).trim();
  s = s.split(' ')[0].replace(/-/g,'/'); // togli orario e normalizza separatore
  // yyyy/mm/dd -> dd/mm/yyyy
  let m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // dd/mm/yy -> dd/mm/yyyy
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/20${m[3]}`;
  return s; // già dd/mm/yyyy
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
  const [saveTarget, setSaveTarget] = useState<SaveTarget>('download');
  const [pathInput, setPathInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [useCombined, setUseCombined] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    // MASSIVA: priorità a "SHEET1", poi eventuali fogli conosciuti, poi il primo
    const attSheetName =
      wb.SheetNames.find(s => s.toUpperCase().includes('SHEET1')) ??
      wb.SheetNames.find(s => s.toUpperCase().includes('DETTAGLIO RISORSE INTERNE')) ??
      wb.SheetNames.find(s => s.toUpperCase().includes('ATTGIORN')) ??
      wb.SheetNames[0];

    const ws = wb.Sheets[attSheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false }) as any[][];
    setRawRows(rows);

    // header "RISORSA" in colonna B
    let start = 1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const v = String(rows[i]?.[COL.B_OPERATORE] ?? '').trim();
      if (/^risorsa$/i.test(v)) { start = i + 1; break; }
    }

    const ops = new Set<string>();
    for (let i = start; i < rows.length; i++) {
      const val = String(rows[i]?.[COL.B_OPERATORE] ?? '').trim();
      if (val) ops.add(val);
    }
    const opList = Array.from(ops).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    setOperators(opList);
    setSelectedOps([]);

    if (opList.length === 0) {
      setErr(`Nessun operatore trovato in colonna B sul foglio "${attSheetName}".`);
    }
  }

  function addOperatorManually(op: string) {
    const v = op.trim();
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

const filteredRows = useMemo(() => {
  if (!rawRows.length) return [];
  const dateCol = detectDateCol(rawRows); // auto-detect
  const want = normalizeDateCell(dateStr);

  const out: any[][] = [];
  const seenPdr = new Set<string>();

  for (let i = 1; i < rawRows.length; i++) { // salta header
    const r = rawRows[i];
    const d = normalizeDateCell(r?.[dateCol]);
    if (d !== want) continue;

// Escludi righe con L="UT I51 CAMBIO DA DIAGNOSTICA"
const lIdx = (COL as any).L_ATTIVITA as number | undefined;
if (typeof lIdx === 'number') {
  const lval = String(r?.[lIdx] ?? '').trim().toUpperCase();
  if (lval === 'UT I51 CAMBIO DA DIAGNOSTICA') continue;
}


    // Deduplica su N (PDR) solo dove M="S-AI-051"
const pdrKey = String(r[COL.N_PDR] ?? '').trim();
// se vuoi comunque evitare duplicati di PDR, lascia le 2 righe seguenti:
// if (pdrKey && seenPdr.has(pdrKey)) continue;
// if (pdrKey) seenPdr.add(pdrKey);
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

      const tplRes = await fetch('/templates/RAPPORTINO_ATT_CLIENTELA.xlsx');
      if (!tplRes.ok) throw new Error('Template non trovato.');
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
  : filteredRows.filter(r => safeStr(r[COL.B_OPERATORE]) === op);

// NOTE: raccogli da CT
const notes: Array<{nom:string; via:string; note:string}> = [];

// Ordina per Fascia oraria A→Z
const rowsSorted = rowsForOp.slice().sort((a, b) =>
  safeStr(a[COL.FASCIA_ORARIA]).localeCompare(safeStr(b[COL.FASCIA_ORARIA]), 'it', { sensitivity: 'base' })
);
perOp[opName] = rowsSorted;
if (!rowsSorted.length) continue;

const ws = cloneFromTemplate(base, opName, tplWb);
ws.getCell('B2').value = dateStr;
ws.getCell('B4').value = useCombined ? '' : opName;
// Header riga 6 (A..N)
const hdr = [
  'Nominativo','Matricola','PDR','Via','Comune','CAP','Recapito',
  'Attività','Accessibilità','Fascia oraria','Cambio','Mini bag','RG stop','Assente'
];
['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].forEach((col, i) => {
  ws.getCell(`${col}6`).value = hdr[i];
});

let rowIdx = 7;
for (const r of rowsSorted) {   // <-- usa rowsSorted
  const nominativo = safeStr(r[COL.O_NOMINATIVO]);
  const matricola  = safeStr(r[COL.P_MATRICOLA]);
  const pdrRaw     = safeStr(r[COL.N_PDR]);
  const via        = safeStr(r[COL.T_VIA]);
  const comune     = safeStr(r[COL.Q_COMUNE]);
  const cap        = safeStr(r[COL.R_CAP]);
  const recapito   = safeStr(r[COL.BG_RECAPITO]);
  const attivita   = 'S-AI-049';
  const access     = safeStr(r[COL.ACCESSIBILITA_CA]); // CA
  const fascia     = safeStr(r[COL.FASCIA_ORARIA]);    // 95

  const pdr = pdrRaw ? `00${pdrRaw}` : '';

  ws.getCell(`A${rowIdx}`).value = nominativo;
  ws.getCell(`B${rowIdx}`).value = matricola;
  ws.getCell(`C${rowIdx}`).value = pdr;
  ws.getCell(`D${rowIdx}`).value = via;
  ws.getCell(`E${rowIdx}`).value = comune;
  ws.getCell(`F${rowIdx}`).value = cap;
  ws.getCell(`G${rowIdx}`).value = recapito;
  ws.getCell(`H${rowIdx}`).value = attivita;
  ws.getCell(`I${rowIdx}`).value = access;   // Accessibilità (CA)
  ws.getCell(`J${rowIdx}`).value = fascia;   // Fascia oraria (95)

  // accumulate NOTE da CT
  const noteText = safeStr(r[COL.NOTE_CT]);
  if (noteText) notes.push({ nom: nominativo, via, note: noteText });

  rowIdx++;
}
// --- NOTE in fondo, righe 31..35, colonne A..C ---
const NOTE_START = 31, NOTE_END = 37; // note A31:C37
const maxNotes = Math.min(notes.length, NOTE_END - NOTE_START + 1);
for (let i = 0; i < maxNotes; i++) {
  const rr = NOTE_START + i;
  ws.getCell(`A${rr}`).value = notes[i].nom;
  ws.getCell(`B${rr}`).value = notes[i].via;
  ws.getCell(`C${rr}`).value = notes[i].note;
}
// bordi griglia per l’area note A31:C35
for (let r = NOTE_START; r <= NOTE_END; r++) {
  for (const c of ['A','B','C'] as const) {
    const cell = ws.getCell(`${c}${r}`);
    cell.border = {
      top: {style:'thin'}, left:{style:'thin'},
      bottom:{style:'thin'}, right:{style:'thin'}
    };
  }
}

// area di stampa: A1:O35 in orizzontale e adatta in larghezza
ws.pageSetup.orientation = 'landscape';
ws.pageSetup.fitToPage = true;
ws.pageSetup.fitToWidth = 1;
ws.pageSetup.fitToHeight = 0;
(ws as any).pageSetup.printArea = 'A1:O37';

      }

      // rimuovi foglio base se è ancora presente
      if (tplWb.worksheets.length > 1) {
        const idx = tplWb.worksheets.findIndex(w => w.name === baseName);
        if (idx >= 0) tplWb.removeWorksheet(idx + 1);
      }

      if (saveTarget === 'download') {
        const buf = await tplWb.xlsx.writeBuffer();

        // XLSX
        {
          const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = outName;
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(a.href);
          a.remove();
        }

        // ZIP PDF
        await makePdfs(perOp, dateStr);

        setMsg(`File generato: ${outName} + PDF`);
        return;
      }

      // altri target
      const baseMsg = 'Salvataggio non implementato in questa build.';
      setMsg(baseMsg);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Errore generazione.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Genera Rapportino Massiva</h1>

        <div className="rounded-2xl border p-4 mb-4">
          <div className="mb-2 text-sm text-gray-700">
            Carica il file MASSIVA (.xlsx, .xls, .xlsm). Seleziona la data. Filtra operatori. Genera file Excel e ZIP di PDF.
          </div>
          <div className="flex items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.xlsm" onChange={onPick} />
            <span className="text-sm text-gray-600">{fileName}</span>
            {file && (
              <button
                type="button"
                className="rounded-2xl border px-3 py-1 text-sm"
                onClick={() => { setFile(null); setFileName('Nessun file MASSIVA'); setRawRows([]); setErr(null); setMsg(null); }}
              >
                Rimuovi
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl border p-4">
            <label className="block text-sm font-medium mb-1">Data (DD/MM/YYYY)</label>
            <input
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              placeholder="gg/mm/aaaa"
              className="rounded border p-2 w-full"
            />
            <div className="mt-3 text-xs text-gray-600">
              Filtra le righe del file per la data inserita.
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <label className="block text-sm font-medium mb-1">Modalità output</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useCombined} onChange={(e) => setUseCombined(e.target.checked)} />
                Singolo foglio “RAPPORTINO” con tutti gli operatori
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


        <div className="rounded-2xl border p-4 mb-4">
          <label className="block text-sm font-medium mb-2">Destinazione</label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={saveTarget === 'download'}
                onChange={() => setSaveTarget('download')}
              /> Download locale
            </label>
            <label className="flex items-center gap-2 text-sm opacity-60">
              <input type="radio" disabled /> SharePoint (non attivo)
            </label>
            <label className="flex items-center gap-2 text-sm opacity-60">
              <input type="radio" disabled /> Supabase (non attivo)
            </label>
          </div>

          {saveTarget !== 'download' && (
            <div className="mt-3">
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Percorso/cartella di destinazione"
                className="rounded border p-2 w-full"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            onClick={onGenerate}
            className="rounded-2xl border px-4 py-2"
          >
            {busy ? 'Elaboro...' : 'Genera file'}
          </button>
          {msg && <span className="text-green-700 text-sm">{msg}</span>}
          {err && <span className="text-red-700 text-sm">{err}</span>}
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
    <div className="rounded-2xl border p-4 mb-4">
<div className="flex items-center gap-2 mb-3">
  <input
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="Aggiungi operatore"
    className="rounded border p-2 flex-1"
    disabled={disabled}
  />
  <button
    type="button"
    className="rounded-2xl border px-4 py-2"
    onClick={() => { if (!disabled) { onAdd(value); setValue(''); } }}
    disabled={disabled}
  >
    Aggiungi
  </button>
  <button
    type="button"
    className="rounded-2xl border px-4 py-2"
    onClick={onSelectAll}
    disabled={disabled || operators.length === 0}
  >
    {selectedOps.length === operators.length && operators.length > 0
      ? 'Deseleziona tutti'
      : 'Seleziona tutti'}
  </button>
</div>

      <ul className="grid sm:grid-cols-2 gap-2">
        {operators.map((op) => (
          <li key={op} className="flex items-center justify-between rounded border px-3 py-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedOps.includes(op)}
                onChange={() => onToggle(op)}
                disabled={disabled}
              />
              <span>{op}</span>
            </label>
            <button
              type="button"
              className="text-xs text-red-700"
              onClick={() => onRemove(op)}
              disabled={disabled}
            >
              rimuovi
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------ Helpers: cloneFromTemplate + PDF ZIP ------------ */
async function makePdfs(perOp: Record<string, any[][]>, dateStr: string) {
  const zip = new JSZip();

  for (const [sheetName, rows] of Object.entries(perOp)) {
    if (!rows.length) continue;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const title = `Rapportino ${sheetName === 'RAPPORTINO' ? '' : sheetName} - ${dateStr}`;
    doc.setFontSize(12);
    doc.text('Generato automaticamente da SmartRapportini', 40, 30); // richiesta: testo al posto del logo
    doc.setFontSize(14);
    doc.text(title.trim(), 40, 55);

// 15 colonne totali (A..O): 10 dati + 5 vuote per allinearsi al template
// A..N = 14 colonne con intestazioni; O opzionale per allineare larghezza
// ==== A..O con larghezza identica all'Excel (una pagina) ====
const head = [[
  'Nominativo','Matricola','PDR','Via','Comune','CAP','Recapito',
  'Attività','Accessibilità','Fascia oraria','Cambio','Mini bag','RG stop','Assente',''
]];

const MAX_BODY_ROWS = 31; // righe 7..37
const body = rows.slice(0, MAX_BODY_ROWS).map(r => ([
  String(r[COL.O_NOMINATIVO] ?? ''),
  String(r[COL.P_MATRICOLA] ?? ''),
  r[COL.N_PDR] ? `00${r[COL.N_PDR]}` : '',
  String(r[COL.T_VIA] ?? ''),
  String(r[COL.Q_COMUNE] ?? ''),
  String(r[COL.R_CAP] ?? ''),
  String(r[COL.BG_RECAPITO] ?? ''),
  'S-AI-049',
  String(r[COL.ACCESSIBILITA_CA] ?? ''),
  String(r[COL.FASCIA_ORARIA] ?? ''), // CP
  '', '', '', '', ''                  // K..O
]));

// larghezza pagina = colonne Excel; ripartizione pesata
const left = 20, right = 20;
const pageW = doc.internal.pageSize.getWidth();
const tableW = pageW - left - right;

// pesi colonne A..O ~ proporzioni Excel (Via più larga)
const weights = [12,10,12,22,10,6,11,7,10,10,5,5,5,5,2];
const sumW = weights.reduce((a,b)=>a+b,0);
const cw = weights.map(w => (tableW * w) / sumW);

autoTable(doc, {
  head, body,
  startY: 70,
  margin: { left, right, top: 20, bottom: 20 },
  theme: 'grid',
  styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.4, overflow: 'hidden' }, // no a capo
  headStyles: { fontSize: 7 },
  tableWidth: tableW,
  columnStyles: Object.fromEntries(cw.map((w,i)=>[i,{cellWidth:w}])),
  didParseCell: (data) => {
    if (Array.isArray(data.cell.text) && data.cell.text.length) {
      data.cell.text = [String(data.cell.text[0]).replace(/\s*\n+\s*/g, ' ')];
    }
  },
});



// NOTE per il PDF: max 5 righe, una per CT non vuoto
const notes = rows
  .map(r => ({
    nom: String(r[COL.O_NOMINATIVO] ?? ''),
    via: String(r[COL.T_VIA] ?? ''),
    note: String(r[COL.NOTE_CT] ?? '')
  }))
  .filter(x => x.note);

const notesBody = notes.slice(0, 5).map(n => [n.nom, n.via, n.note]);
if (notesBody.length) {
  autoTable(doc, {
    head: [['Nominativo', 'Via', 'Note']],
    body: notesBody,
    startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : 90,
    styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.5, overflow: 'linebreak' },
    margin: { left: 40, right: 40 },
    theme: 'grid',
  });
}

    const pdfBuf = doc.output('arraybuffer');
    zip.file(`${sheetName || 'RAPPORTINO'}_${dateStr.replaceAll('/','-')}.pdf`, pdfBuf);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `RAPPORTINI_${dateStr.replaceAll('/','-')}_PDF.zip`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

function cloneFromTemplate(base: ExcelJS.Worksheet, name: string, wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(name);

  // copia colonne
  ws.columns = base.columns?.map((c) => ({
    key: c.key,
    width: c.width,
    outlineLevel: c.outlineLevel,
    style: JSON.parse(JSON.stringify(c.style || {})),
  })) ?? [];

  // limitiamo a 33 righe come richiesto in precedenti specifiche
  const maxRows = 37;
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
