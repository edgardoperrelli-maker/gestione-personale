import { BRAND_EXPORT } from '@/lib/brand';
import type { DatiPdfRisanamento } from './datiPdfRisanamento';

type RGB = [number, number, number];
const INK: RGB = BRAND_EXPORT.inkRgb;
const MUTED: RGB = BRAND_EXPORT.mutedRgb;
const CYAN: RGB = BRAND_EXPORT.accentRgb;
const LINE: RGB = BRAND_EXPORT.lineRgb;
const ML = 12;
const MR = 12;

/** Nome file: Risanamento_<Operatore>_<YYYY-MM-DD>.pdf */
export function nomeFilePdfRisanamento(staffName: string, dataIso: string): string {
  const staff = (staffName || 'operatore')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'operatore';
  return `Risanamento_${staff}_${dataIso.slice(0, 10)}.pdf`;
}

function timestampLabel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function generaPdfRisanamentoBlob(
  dati: DatiPdfRisanamento,
  meta: { staffName: string; dataLabel: string },
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297

  // ── Intestazione ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...CYAN);
  doc.text('RAPPORTINO RISANAMENTO · PLENZICH S.P.A.', ML, 14);
  doc.setFontSize(16); doc.setTextColor(...INK);
  doc.text(meta.staffName || 'Operatore', ML, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text('Data lavori', pageW - MR, 13, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
  doc.text(meta.dataLabel, pageW - MR, 19, { align: 'right' });

  // ── Riga totali ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...CYAN);
  doc.text(`${dati.totaleMisuratori} punti gas · ${dati.totaleCivici} civici`, ML, 30);

  let y = 36;

  // ── Per ogni civico: banda + tabella misuratori ──
  for (const civico of dati.civici) {
    if (y > pageH - 30) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
    const titolo = [civico.via, civico.comune].filter(Boolean).join(' · ') || 'Civico';
    doc.text(titolo, ML, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`${civico.misuratori.length} misuratori`, pageW - MR, y, { align: 'right' });
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Matricola', 'PDR', 'Nominativo']],
      body: civico.misuratori.map((m, i) => [String(i + 1), m.matricola, m.pdr, m.nominativo]),
      theme: 'striped',
      headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles: { 0: { cellWidth: 8, halign: 'center', textColor: MUTED } },
      margin: { left: ML, right: MR },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  }

  // ── Footer su ogni pagina ──
  const ts = timestampLabel();
  const totPag = doc.getNumberOfPages();
  for (let p = 1; p <= totPag; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    doc.line(ML, pageH - 10, pageW - MR, pageH - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text('GestiLab Cantieri · Plenzich S.p.A.', ML, pageH - 6);
    doc.text(`Generato il ${ts} · Pagina ${p} di ${totPag}`, pageW - MR, pageH - 6, { align: 'right' });
  }

  return doc.output('blob');
}
