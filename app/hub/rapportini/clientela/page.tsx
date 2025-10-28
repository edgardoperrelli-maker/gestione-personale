'use client';

import { useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

/** Indici colonne ATTGIORN (0-based) */
const COL = {
  A_DATE: 0,
  L_ATTIVITA: 11,
  M_CODICE: 12,
  M_ATTIVITA_OUT: 12,
  N_PDR: 13,
  P_MATRICOLA: 15,
  Q_COMUNE: 16,
  R_CAP: 17,
  T_VIA: 19,
  U_ORA: 20,
  B_OPERATORE: 1,   // "RISORSA"
  O_NOMINATIVO: 14, // nominativo per template
  BG_RECAPITO: 58,
  BI_ACCESSIBILITA: 60,
};

type SaveTarget = 'download' | 'sharepoint' | 'supabase';
export const dynamic = 'force-dynamic';

export default function RapportinoClientelaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('Nessun file caricato');
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

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    const attSheetName =
      wb.SheetNames.find(s => s.toUpperCase().includes('DETTAGLIO RISORSE INTERNE')) ??
      wb.SheetNames.find(s => s.toUpperCase().includes('ATTGIORN')) ??
      wb.SheetNames[0];

    const ws = wb.Sheets[attSheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false }) as any[][];
    setRawRows(rows);

    // header "RISORSA"
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

  const filteredRows = useMemo(() => {
    if (!rawRows.length) return [];
    function normalizeDate(x: any) {
      if (!x) return '';
      const s = String(x);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      return s;
    }

    const wantDate = dateStr;
    const out: any[][] = [];
    const seenPdr = new Set<string>();

    for (const r of rawRows) {
      const d = normalizeDate(r[COL.A_DATE]);
      if (d !== wantDate) continue;

      const att = (r[COL.L_ATTIVITA] ?? '').toString().trim();
      if (att === 'UT I51 CAMBIO DA DIAGNOSTICA') continue;

      const codice = (r[COL.M_CODICE] ?? '').toString().trim();
      const pdr = (r[COL.N_PDR] ?? '').toString().trim();

      if (codice === 'S-AI-051') {
        if (seenPdr.has(pdr)) continue;
        if (pdr) seenPdr.add(pdr);
      }
      out.push(r);
    }
    return out;
  }, [rawRows, dateStr]);

  async function onGenerate() {
    try {
      setBusy(true); setErr(null); setMsg(null);
      if (!file) throw new Error('Seleziona il file ATTGIORN.');
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) throw new Error('Data non valida (DD/MM/YYYY).');
      if (!filteredRows.length) throw new Error('Nessuna riga dopo i filtri per la data.');

      const tplRes = await fetch('/templates/RAPPORTINO_ATT_CLIENTELA.xlsx');
      if (!tplRes.ok) throw new Error('Template non trovato.');
      const tplBuf = await tplRes.arrayBuffer();
      const tplWb = new ExcelJS.Workbook();
      await tplWb.xlsx.load(tplBuf);

      const base = tplWb.worksheets[0];
      if (!base) throw new Error('Foglio template non valido.');
      base.name = '__TEMPLATE__';

      const useCombined = selectedOps.length === 0;
      const targets = useCombined ? ['RAPPORTINO'] : selectedOps;
      const perOp: Record<string, any[][]> = {};

      for (const op of targets) {
        const opName = sanitizeSheetName(op).slice(0, 31);
        const rowsForOp = useCombined ? filteredRows : filteredRows.filter(r => safeStr(r[COL.B_OPERATORE]) === op);
        perOp[opName] = rowsForOp;
        if (!rowsForOp.length) continue;

        const ws = cloneFromTemplate(base, opName, tplWb);
        ws.getCell('B2').value = dateStr;
        ws.getCell('B4').value = useCombined ? '' : opName;

       // INTESTAZIONI RIGA 6 (A–O)
const hrow = ws.getRow(6);
[
  'NOMINATIVO','MATRICOLA','PDR','VIA','COMUNE','CAP',
  'RECAPITO',"ATTIVITA'",'ACCESSIBILITA\'','FASCIA ORARIA',
  'ATT/CESS','CAMBIO','MINI BAG','RG STOP','ASSENTE'
].forEach((t, i) => { hrow.getCell(i+1).value = t; });
hrow.commit();

// i dati partono dalla riga 7
let rowIdx = 7;
        for (const r of rowsForOp) {
          const nominativo = safeStr(r[COL.O_NOMINATIVO]);
          const matricola  = safeStr(r[COL.P_MATRICOLA]);
          const pdrRaw     = safeStr(r[COL.N_PDR]);
          const via        = safeStr(r[COL.T_VIA]);
          const comune     = safeStr(r[COL.Q_COMUNE]);
          const cap        = safeStr(r[COL.R_CAP]);
          const recapito   = safeStr(r[COL.BG_RECAPITO]);
          const attivita   = safeStr(r[COL.M_ATTIVITA_OUT]);
          const access     = safeStr(r[COL.BI_ACCESSIBILITA]);
          const oraTxt     = toHHMM(r[COL.U_ORA]);

const rr = ws.getRow(rowIdx++);
rr.getCell(1).value  = nominativo;
rr.getCell(2).value  = matricola;
rr.getCell(3).value  = pdrRaw ? `00${pdrRaw}` : '';
rr.getCell(4).value  = via;
rr.getCell(5).value  = comune;
rr.getCell(6).value  = cap;
rr.getCell(7).value  = recapito;
rr.getCell(8).value  = attivita;   // L
rr.getCell(9).value  = access;
rr.getCell(10).value = oraTxt;
rr.getCell(11).value = '';         // ATT/CESS
rr.getCell(12).value = '';         // CAMBIO
rr.getCell(13).value = '';         // MINI BAG
rr.getCell(14).value = '';         // RG STOP
rr.getCell(15).value = '';         // ASSENTE
rr.commit();

        }

        for (let c = 1; c <= 15; c++) {
          let maxLen = 8;
          for (let r = 7; r < rowIdx; r++) {
            const v = ws.getRow(r).getCell(c).value as any;
            const s = v == null ? '' : String(v.text ?? v);
            maxLen = Math.max(maxLen, s.length + 2);
          }
          ws.getColumn(c).width = Math.min(60, maxLen);
        }
      }

      const outName = `RAPPORTINI_${dateStr.replaceAll('/','-')}.xlsx`;

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
      const buf = await tplWb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fd = new FormData();
      fd.append('file', new File([blob], outName, { type: blob.type }));
      fd.append('filename', outName);
      fd.append('target', saveTarget);
      fd.append('path', pathInput || '');

      const res = await fetch('/api/rapportini/save', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore salvataggio');
      setMsg(saveTarget === 'supabase' ? `Salvato su Supabase: ${data.path}` : 'SharePoint non configurato');
    } catch (e: any) {
      setErr(e?.message || 'Errore inatteso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Genera Rapportino Clientela</h1>

        <div className="rounded-2xl border p-6 shadow-sm space-y-6">
          <section className="space-y-2">
            <label className="block text-sm font-medium">File origine (ATTGIORN)</label>
            <input type="file" accept=".xlsx,.xls" onChange={onPick} className="block w-full rounded border p-2" />
            <p className="text-sm opacity-70">Selezionato: {fileName}</p>
          </section>

          <section className="space-y-2">
            <label className="block text-sm font-medium">Data (DD/MM/YYYY)</label>
            <input
              type="text"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="block w-48 rounded border p-2"
            />
          </section>

          <section className="space-y-2">
            <label className="block text-sm font-medium">Operatori (multi)</label>

            <div className="flex justify-end">
              <button type="button" className="rounded-2xl border px-3 py-1 text-xs" onClick={() => setSelectedOps([])}>
                Deseleziona tutti
              </button>
            </div>

            <OperatorEditor
              operators={operators}
              onAdd={addOperatorManually}
              onRemove={removeOperator}
              selected={selectedOps}
              onToggle={toggleSelected}
            />
            <p className="text-xs opacity-70">Se non selezioni alcun operatore, verrà creato un unico foglio “RAPPORTINO”.</p>
          </section>

          <section className="space-y-2">
            <label className="block text-sm font-medium">Dove salvare</label>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex gap-6">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="saveTarget" checked={saveTarget === 'download'} onChange={() => setSaveTarget('download')} />
                  Download
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="saveTarget" checked={saveTarget === 'sharepoint'} onChange={() => setSaveTarget('sharepoint')} />
                  SharePoint
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="saveTarget" checked={saveTarget === 'supabase'} onChange={() => setSaveTarget('supabase')} />
                  Supabase Storage
                </label>
              </div>

              {(saveTarget === 'sharepoint' || saveTarget === 'supabase') && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs opacity-70">Percorso</span>
                  <input
                    type="text"
                    placeholder="es. 2025/10"
                    className="rounded border p-2 flex-1"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="flex gap-3">
            <button onClick={onGenerate} disabled={busy || !file} className="rounded-2xl bg-black text-white px-4 py-2 disabled:opacity-50">
              {busy ? 'Generazione…' : 'Genera'}
            </button>
            <button
              onClick={() => { setFile(null); setFileName('Nessun file caricato'); setRawRows([]); setErr(null); setMsg(null); }}
              className="rounded-2xl border px-4 py-2"
            >
              Annulla
            </button>
          </section>

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {msg && <div className="text-green-700 text-sm">{msg}</div>}
        </div>
      </main>
    </AuthGate>
  );
}

/* ---------- Helpers ---------- */
function safeStr(v: any) {
  if (v == null) return '';
  return String(v).trim();
}

function toHHMM(v: any) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})(:?)(\d{0,2})$/);
  if (m1) {
    const hh = m1[1].padStart(2, '0');
    const mm = (m1[3] || '00').padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const m2 = s.match(/^(\d{1,2})[.:](\d{2})$/);
  if (m2) return `${m2[1].padStart(2,'0')}:${m2[2]}`;
  return s;
}

async function makePdfs(perOp: Record<string, any[][]>, dateStr: string) {
  const zip = new JSZip();

for (const [opName, rowsAll] of Object.entries(perOp)) {
  const rows = rowsAll.slice(0, 33); // max 33 righe
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const marginX = 32;


  // intestazione con firma app
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Generato automaticamente da Gestione Personale Plenzich App', marginX, 20);

  // intestazione principale
  doc.setFontSize(10);
  doc.setTextColor(0);
  let y = 40;
  doc.text('PREPOSTO:', marginX, y);
  doc.text(`DATA: ${dateStr}    ANTINCENDIO:`, 250, y);
  y += 16;
  doc.text('SQUADRA PRIMO SOCCORSO:', marginX, y);
  y += 16;
  doc.text(`RISORSA ${opName}    CAPO SQUADRA: AMMINISTRATORE`, marginX, y);
  y += 18;


    // Intestazioni
   // Intestazioni ufficiali
const head = [[
  'NOMINATIVO', 'MATRICOLA', 'PDR', 'VIA', 'COMUNE', 'CAP',
  'RECAPITO', "ATTIVITA'", 'ACCESSIBILITA\'', 'FASCIA ORARIA',
  'ATT/CESS', 'CAMBIO', 'MINI BAG', 'RG STOP', 'ASSENTE'
]];

// Dati (max 33 righe)
const body = rows.slice(0, 33).map(r => ([
  safeStr(r[COL.O_NOMINATIVO]),
  safeStr(r[COL.P_MATRICOLA]),
  (safeStr(r[COL.N_PDR]) ? `00${safeStr(r[COL.N_PDR])}` : ''),
  safeStr(r[COL.T_VIA]),
  safeStr(r[COL.Q_COMUNE]),
  safeStr(r[COL.R_CAP]),
  safeStr(r[COL.BG_RECAPITO]),
  safeStr(r[COL.L_ATTIVITA]),  // colonna L del file origine
  safeStr(r[COL.BI_ACCESSIBILITA]),
  toHHMM(r[COL.U_ORA]),
  '',        // ATT/CESS
  '',        // CAMBIO
  '',        // MINI BAG
  '',        // RG STOP
  ''         // ASSENTE
]));

const pageWidth = doc.internal.pageSize.getWidth();
const tableW = pageWidth - marginX * 2;

// larghezze "di riferimento" per 15 colonne (A–O)
const baseW = [110,72,120,160,78,48,96,70,78,78,70,70,70,62,60];
// scala per farle entrare esattamente in pagina
const totalBase = baseW.reduce((a,b)=>a+b,0);
const scale = tableW / totalBase;
const scaled = baseW.map(v => Math.floor(v * scale));
// correggi l’arrotondamento sull’ultima colonna
scaled[14] += tableW - scaled.slice(0,14).reduce((a,b)=>a+b,0);

autoTable(doc, {
  head,
  body,
  startY: y,
  margin: { left: marginX, right: marginX },
  tableWidth: tableW,          // fit-to-page
  pageBreak: 'avoid',
  styles: {
    fontSize: 7,
    cellPadding: 2,
    overflow: 'ellipsize',     // niente a capo
    valign: 'middle',
    lineWidth: 0.3,
    lineColor: [0,0,0],
  },
  headStyles: {
    fillColor: [213,157,203],
    textColor: 0,
    halign: 'center',
    lineWidth: 0.3,
    lineColor: [0,0,0],
  },
  columnStyles: {
    0:{cellWidth:scaled[0]},  1:{cellWidth:scaled[1]},  2:{cellWidth:scaled[2]},
    3:{cellWidth:scaled[3]},  4:{cellWidth:scaled[4]},  5:{cellWidth:scaled[5]},
    6:{cellWidth:scaled[6]},  7:{cellWidth:scaled[7]},  8:{cellWidth:scaled[8]},
    9:{cellWidth:scaled[9]}, 10:{cellWidth:scaled[10]},11:{cellWidth:scaled[11]},
   12:{cellWidth:scaled[12]},13:{cellWidth:scaled[13]},14:{cellWidth:scaled[14]},
  },
});



    // Sezione finale
    const last = (doc as any).lastAutoTable?.finalY || y;
    doc.setFontSize(10);
    doc.text('INTERVENTI CON NOTE', marginX, last + 20);

    // Salva nel pacchetto ZIP
    const pdfBlob = doc.output('blob');
    const arrBuf = await pdfBlob.arrayBuffer();
    const safe = opName.replace(/[\\/:*?"<>|]/g, ' ');
    zip.file(`${safe}.pdf`, arrBuf);
  }

  const zipBuf = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBuf);
  a.download = `rapportini_pdf_${dateStr.replaceAll('/','-')}.zip`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}


function sanitizeSheetName(s: string) {
  return s.replace(/[:\\/?*\[\]]/g, ' ');
}

function OperatorEditor({
  operators, onAdd, onRemove, selected, onToggle,
}: {
  operators: string[];
  onAdd: (op: string) => void;
  onRemove: (op: string) => void;
  selected: string[];
  onToggle: (op: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Aggiungi operatore"
          className="rounded border p-2 flex-1"
        />
        <button type="button" className="rounded-2xl border px-4 py-2" onClick={() => { onAdd(value); setValue(''); }}>
          Aggiungi
        </button>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2">
        {operators.map((op) => (
          <li key={op} className="flex items-center justify-between rounded border p-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(op)} onChange={() => onToggle(op)} />
              {op}
            </label>
            <button className="text-xs opacity-70 hover:opacity-100" onClick={() => onRemove(op)}>
              Rimuovi
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cloneFromTemplate(base: ExcelJS.Worksheet, name: string, wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(name, {
    views: base.views,
    properties: base.properties,
    pageSetup: base.pageSetup,
    headerFooter: base.headerFooter,
  });

  const maxCols = Math.max(...base.columns.map((c) => (c?.number || 0)));
  for (let c = 1; c <= maxCols; c++) {
    const bc = base.getColumn(c);
    ws.getColumn(c).width = bc.width;
    ws.getColumn(c).hidden = bc.hidden;
  }

  for (let r = 1; r <= base.rowCount; r++) {
    const br = base.getRow(r);
    const wr = ws.getRow(r);
    wr.height = br.height;
    for (let c = 1; c <= maxCols; c++) {
      const bc = br.getCell(c);
      const wc = wr.getCell(c);
      wc.value = bc.value;
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
