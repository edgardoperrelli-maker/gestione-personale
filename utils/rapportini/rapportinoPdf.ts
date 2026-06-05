// utils/rapportini/rapportinoPdf.ts
import type { DatiRiepilogoPdf } from './datiRiepilogoPdf';

type RGB = [number, number, number];
const INK: RGB = [26, 35, 48];
const MUTED: RGB = [91, 103, 117];
const CYAN: RGB = [10, 143, 176];
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [194, 38, 31];
const LINE: RGB = [227, 232, 238];
const ML = 14;
const MR = 14;

/** Nome file: Rapportino_<Operatore>_<YYYY-MM-DD>.pdf */
export function nomeFilePdf(staffName: string, dataIso: string): string {
  const staff = (staffName || 'operatore')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'operatore';
  return `Rapportino_${staff}_${dataIso.slice(0, 10)}.pdf`;
}

function timestampLabel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function generaRiepilogoPdfBlob(dati: DatiRiepilogoPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297
  const contentW = pageW - ML - MR;

  // ── Intestazione ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...CYAN);
  doc.text('RAPPORTINO GIORNALIERO · PLENZICH S.P.A.', ML, 16);
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(dati.staffName || 'Operatore', ML, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Data lavori', pageW - MR, 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(dati.dataLabel, pageW - MR, 21, { align: 'right' });

  // ── 3 riquadri statistici ──
  let y = 32;
  const gap = 4;
  const boxW = (contentW - gap * 2) / 3;
  const boxH = 20;
  const boxes: { v: number; l: string; c: RGB }[] = [
    { v: dati.stats.totali, l: 'INTERVENTI', c: CYAN },
    { v: dati.stats.eseguiti, l: 'ESEGUITI', c: GREEN },
    { v: dati.stats.nonEseguiti, l: 'NON ESEGUITI', c: RED },
  ];
  boxes.forEach((b, i) => {
    const x = ML + i * (boxW + gap);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...b.c);
    doc.text(String(b.v), x + boxW / 2, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(b.l, x + boxW / 2, y + 16, { align: 'center' });
  });
  y += boxH + 8;

  // ── Barre "Lavorazioni svolte" ──
  if (dati.lavorazioni.length > 0) {
    const maxCount = Math.max(...dati.lavorazioni.map((l) => l.count), 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('LAVORAZIONI SVOLTE', ML, y);
    y += 5;
    const labelW = 42;
    const trackX = ML + labelW;
    const trackW = contentW - labelW - 12;
    for (const l of dati.lavorazioni) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(l.etichetta, ML, y + 3);
      doc.setFillColor(238, 241, 245);
      doc.roundedRect(trackX, y, trackW, 4, 2, 2, 'F');
      const w = Math.max(2, (l.count / maxCount) * trackW);
      doc.setFillColor(...CYAN);
      doc.roundedRect(trackX, y, w, 4, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MUTED);
      doc.text(String(l.count), pageW - MR, y + 3, { align: 'right' });
      y += 7;
    }
    y += 3;
  }

  // ── Sezione con titolo colorato + tabella ──
  const drawSezione = (titolo: string, colore: RGB, head: string[], body: string[][], startY: number): number => {
    let y0 = startY;
    if (y0 > pageH - 30) { doc.addPage(); y0 = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colore);
    doc.text(titolo, ML, y0);
    autoTable(doc, {
      startY: y0 + 2,
      head: [head],
      body,
      theme: 'striped',
      headStyles: { fillColor: colore, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: INK },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center', textColor: MUTED, fontStyle: 'bold' } },
      margin: { left: ML, right: MR },
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  if (dati.eseguiti.length > 0) {
    y = drawSezione(
      `Eseguiti (${dati.stats.eseguiti})`, GREEN,
      ['#', 'Cliente', 'PDR', 'Indirizzo', 'Attivita'],
      dati.eseguiti.map((r) => [String(r.n), r.nominativo, r.pdr, r.indirizzo, r.attivita]),
      y,
    ) + 8;
  }
  if (dati.nonEseguiti.length > 0) {
    y = drawSezione(
      `Non eseguiti (${dati.stats.nonEseguiti})`, RED,
      ['#', 'Cliente', 'PDR', 'Indirizzo', 'Motivo'],
      dati.nonEseguiti.map((r) => [String(r.n), r.nominativo, r.pdr, r.indirizzo, r.motivo ?? '']),
      y,
    ) + 8;
  }

  // ── Pie di pagina su ogni pagina ──
  const ts = timestampLabel();
  const totPag = doc.getNumberOfPages();
  for (let p = 1; p <= totPag; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 12, pageW - MR, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('GestiLab Cantieri · Plenzich S.p.A.', ML, pageH - 8);
    doc.text(`Generato il ${ts} · Pagina ${p} di ${totPag}`, pageW - MR, pageH - 8, { align: 'right' });
  }

  return doc.output('blob');
}
