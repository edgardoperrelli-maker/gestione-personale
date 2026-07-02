import 'server-only';
import ExcelJS from 'exceljs';
import type { InterventoNonClassificato } from './nonClassificate';

// Export dedicato agli interventi "Non classificata" (voce KPI non derivata dall'attività): un
// elenco di riga per riga, con il testo GREZZO dell'attività, pensato per la riclassificazione
// manuale (associare ciascun intervento alla voce/attività corretta), non per la dashboard.

const NAVY = 'FF0F2749';
const WHITE = 'FFFFFFFF';
const EUR = '#,##0.00\\ "€"';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function intestazione(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  row.height = 18;
}

export async function buildWorkbookNonClassificate(
  righe: InterventoNonClassificato[],
  from: string,
  to: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestione Personale';
  wb.created = new Date();

  const ws = wb.addWorksheet('Non classificate', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 14 }, // ODL
    { width: 12 }, // Data
    { width: 18 }, // Territorio
    { width: 24 }, // Operatore
    { width: 14 }, // Committente
    { width: 16 }, // Comune
    { width: 42 }, // Descrizione attività (grezza)
    { width: 28 }, // Attività canonica attuale
    { width: 14 }, // Valore €
  ];

  ws.mergeCells('A1:I1');
  const t = ws.getCell('A1');
  t.value = 'Interventi non classificati — Produzione economica ACEA';
  t.font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.mergeCells('A2:I2');
  const totale = round2(righe.reduce((s, r) => s + r.valore, 0));
  const sub = ws.getCell('A2');
  sub.value = `Periodo ${from} → ${to} · ${righe.length} interventi · ${totale.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`;
  sub.font = { size: 10, color: { argb: 'FF64748B' } };
  ws.addRow([]);

  intestazione(
    ws.addRow(['ODL', 'Data', 'Territorio', 'Operatore', 'Committente', 'Comune', 'Descrizione attività', 'Attività canonica (attuale)', 'Valore €']),
  );

  // Ordinate per testo grezzo: raggruppa le causali uguali, utile per riclassificarle a blocchi.
  const ordinate = [...righe].sort(
    (a, b) => a.descrizioneGrezza.localeCompare(b.descrizioneGrezza) || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0),
  );
  for (const r of ordinate) {
    const row = ws.addRow([r.odl, r.data, r.territorio, r.operatore, r.committente, r.comune, r.descrizioneGrezza, r.attivitaCanonica, r.valore]);
    row.getCell(9).numFmt = EUR;
  }

  const tot = ws.addRow(['', '', '', '', '', '', '', 'TOTALE', totale]);
  tot.eachCell((c, col) => {
    c.font = { bold: true };
    if (col === 9) c.numFmt = EUR;
  });

  return wb.xlsx.writeBuffer();
}
