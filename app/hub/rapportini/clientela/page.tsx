'use client';

import { useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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

export const dynamic = 'force-dynamic';
function onlyHHMM(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  // prendi tutte le occorrenze HH:MM
  const hits = Array.from(s.matchAll(/\b(\d{1,2}):(\d{2})\b/g)).map(m => {
    const h = String(m[1]).padStart(2,'0');
    const mm = m[2];
    return `${h}:${mm}`;
  });
  if (hits.length === 0) return '';
  // se c'Ã¨ un range tieni "HH:MM-HH:MM", altrimenti singolo
  return hits.length >= 2 ? `${hits[0]}-${hits[1]}` : hits[0];
}

function normalizeOperatorName(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

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
      const val = normalizeOperatorName(rows[i]?.[COL.B_OPERATORE]);
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
    setSelectedOps(prev => (prev.length === operators.length ? [] : operators));
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
      if (!useCombined && selectedOps.length === 0) {
        throw new Error('Seleziona almeno un operatore o attiva il foglio unico.');
      }

      const tplRes = await fetch('/templates/Rapportino.xlsx');
      if (!tplRes.ok) throw new Error('Template Rapportino.xlsx non trovato in /public/templates/.');
      const tplBuf = await tplRes.arrayBuffer();
      const tplWb = new ExcelJS.Workbook();
      await tplWb.xlsx.load(tplBuf);

      const base = tplWb.worksheets[0];
      if (!base) throw new Error('Foglio template non valido.');
      base.name = '__TEMPLATE__';

      const targets = useCombined ? ['RAPPORTINO'] : selectedOps;

      for (const op of targets) {
        const opName = sanitizeSheetName(op).slice(0, 31);
        const rowsForOp = useCombined ? filteredRows : filteredRows.filter(r => normalizeOperatorName(r[COL.B_OPERATORE]) === op);
        if (!rowsForOp.length) continue;

        const ws = cloneFromTemplate(base, opName, tplWb);
        ws.getCell('B2').value = dateStr;
        ws.getCell('B4').value = useCombined ? '' : opName;

       // INTESTAZIONI RIGA 6 (A–Q) — allineato al template Rapportino.xlsx
const hrow = ws.getRow(6);
[
  'NOMINATIVO','MATRICOLA','PDR','ODSIN','VIA','COMUNE','CAP',
  'RECAPITO','ATTIVITA','ACCESSIBILITA','FASCIA ORARIA','ORDINE',
  'ATT/CESS','CAMBIO','MINI BAG','RG STOP','ASSENTE'
].forEach((t, i) => { hrow.getCell(i+1).value = t; });
hrow.commit();

// i dati partono dalla riga 7
let rowIdx = 7;
const sorted = rowsForOp
  .slice(0, 33)
  .sort((a,b) => hhmmToMin(onlyHHMM(a[COL.U_ORA])) - hhmmToMin(onlyHHMM(b[COL.U_ORA])));
for (const r of sorted) {
  const nominativo = safeStr(r[COL.O_NOMINATIVO]);
  const matricola  = safeStr(r[COL.P_MATRICOLA]);
  const pdrRaw     = safeStr(r[COL.N_PDR]);
  const via        = safeStr(r[COL.T_VIA]);
  const comune     = safeStr(r[COL.Q_COMUNE]);
  const cap        = safeStr(r[COL.R_CAP]);
  const recapito   = safeStr(r[COL.BG_RECAPITO]);
  const attivita   = safeStr(r[COL.L_ATTIVITA]);    // <â€” L, non M
  const access     = safeStr(r[COL.BI_ACCESSIBILITA]);
  const oraTxt     = onlyHHMM(r[COL.U_ORA]);

  const rr = ws.getRow(rowIdx);
  const ordine = rowIdx - 6;  // ORDINE progressivo
  rr.getCell(1).value  = nominativo;
  rr.getCell(2).value  = matricola;
  rr.getCell(3).value  = pdrRaw ? `00${pdrRaw}` : '';
  rr.getCell(4).value  = '';            // ODSIN — non disponibile in clientela
  rr.getCell(5).value  = via;
  rr.getCell(6).value  = comune;
  rr.getCell(7).value  = cap;
  rr.getCell(8).value  = recapito;
  rr.getCell(9).value  = attivita;
  rr.getCell(10).value = access;
  rr.getCell(11).value = oraTxt;       // FASCIA ORARIA
  rr.getCell(11).numFmt = '@';
  rr.getCell(12).value = ordine;       // ORDINE progressivo
  rr.getCell(13).value = '';           // ATT/CESS
  rr.getCell(14).value = '';           // CAMBIO
  rr.getCell(15).value = '';           // MINI BAG
  rr.getCell(16).value = '';           // RG STOP
  rr.getCell(17).value = '';           // ASSENTE
  rr.commit();
  rowIdx++;
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
      const buf = await tplWb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
      setMsg(`File generato: ${outName}`);
    } catch (e: any) {
      setErr(e?.message || 'Errore inatteso');
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
                Rapportini · Clientela
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
                  Genera rapportino clientela
                </h1>
                <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--brand-text-muted)' }}>
                  Carica il file ATTGIORN, filtra le righe per data e scegli se produrre un foglio unico oppure file separati per operatore in formato Excel.
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
                    Formati supportati: `.xlsx`, `.xls`.
                  </p>
                </div>

                <div
                  className="rounded-[24px] border border-dashed p-5"
                  style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <div className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                        {file ? fileName : 'Nessun file ATTGIORN selezionato'}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Il sistema legge il foglio ATTGIORN e propone automaticamente gli operatori trovati.
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id="clientela-file-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={onPick}
                        className="hidden"
                      />
                      <label
                        htmlFor="clientela-file-input"
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
                          onClick={() => { setFile(null); setFileName('Nessun file caricato'); setRawRows([]); setErr(null); setMsg(null); }}
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
                      type="text"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      placeholder="DD/MM/YYYY"
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

            <OperatorEditor
              operators={operators}
              onAdd={addOperatorManually}
              onRemove={removeOperator}
              selected={selectedOps}
              onToggle={toggleSelected}
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

                {err && (
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
                    {err}
                  </div>
                )}
                {msg && (
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#166534' }}>
                    {msg}
                  </div>
                )}

                <button
                  onClick={onGenerate}
                  disabled={!canGenerate}
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

/* ---------- Helpers ---------- */
function safeStr(v: any) {
  if (v == null) return '';
  return String(v).trim();
}
function hhmmToMin(s: string) {
  if (!s) return 24 * 60 + 1;          // vuoti in fondo
  const m = /^(\d{2}):(\d{2})/.exec(s);
  if (!m) return 24 * 60 + 1;
  return parseInt(m[1],10) * 60 + parseInt(m[2],10);
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

function sanitizeSheetName(s: string) {
  return s.replace(/[:\\/?*\[\]]/g, ' ');
}

function OperatorEditor({
  operators, onAdd, onRemove, selected, onToggle, onSelectAll, disabled,
}: {
  operators: string[];
  onAdd: (op: string) => void;
  onRemove: (op: string) => void;
  selected: string[];
  onToggle: (op: string) => void;
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
              style={{ backgroundColor: selected.length ? '#ECFDF3' : '#F8FAFC', color: selected.length ? '#166534' : 'var(--brand-text-muted)' }}
            >
              Selezionati: {selected.length}
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
              {selected.length === operators.length && operators.length > 0 ? 'Deseleziona tutti' : 'Seleziona tutti'}
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
              const active = selected.includes(op);
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
                      className="text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
                      style={{ color: '#B91C1C' }}
                      onClick={() => onRemove(op)}
                      disabled={disabled}
                      type="button"
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

