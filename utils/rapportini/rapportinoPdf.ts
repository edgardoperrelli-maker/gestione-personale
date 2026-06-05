// utils/rapportini/rapportinoPdf.ts
import type { DatiRiepilogoPdf, RigaRiepilogo } from './datiRiepilogoPdf';

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

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();   // 297
  const pageH = doc.internal.pageSize.getHeight();  // 210

  // ── Intestazione ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...CYAN);
  doc.text('RAPPORTINO GIORNALIERO · PLENZICH S.P.A.', ML, 15);
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text(dati.staffName || 'Operatore', ML, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Data lavori', pageW - MR, 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(dati.dataLabel, pageW - MR, 20, { align: 'right' });

  // ── Riquadri statistici (sinistra) ──
  const y0 = 30;
  const boxH = 18;
  const boxGap = 4;
  const statsW = 116;
  const boxW = (statsW - boxGap * 2) / 3;
  const boxes: { v: number; l: string; c: RGB }[] = [
    { v: dati.stats.totali, l: 'INTERVENTI', c: CYAN },
    { v: dati.stats.eseguiti, l: 'ESEGUITI', c: GREEN },
    { v: dati.stats.nonEseguiti, l: 'NON ESEGUITI', c: RED },
  ];
  boxes.forEach((b, i) => {
    const x = ML + i * (boxW + boxGap);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y0, boxW, boxH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...b.c);
    doc.text(String(b.v), x + boxW / 2, y0 + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(b.l, x + boxW / 2, y0 + 14, { align: 'center' });
  });

  // ── Barre "Lavorazioni svolte" (destra) ──
  if (dati.lavorazioni.length > 0) {
    const barsX = ML + statsW + 12;
    const barsW = pageW - MR - barsX;
    const maxCount = Math.max(...dati.lavorazioni.map((l) => l.count), 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('LAVORAZIONI SVOLTE', barsX, y0);
    let by = y0 + 4;
    const labelW = 48;
    const trackX = barsX + labelW;
    const trackW = Math.max(20, barsW - labelW - 10);
    for (const l of dati.lavorazioni) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(l.etichetta.length > 28 ? `${l.etichetta.slice(0, 27)}…` : l.etichetta, barsX, by + 2.5);
      doc.setFillColor(238, 241, 245);
      doc.roundedRect(trackX, by, trackW, 3.2, 1.6, 1.6, 'F');
      const w = Math.max(2, (l.count / maxCount) * trackW);
      doc.setFillColor(...CYAN);
      doc.roundedRect(trackX, by, w, 3.2, 1.6, 1.6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MUTED);
      doc.text(String(l.count), pageW - MR, by + 2.5, { align: 'right' });
      by += 5.5;
    }
  }
  let y = y0 + boxH + 9;

  // ── Tabelle Eseguiti / Non eseguiti con colonne template ──
  const headFisse = ['#', 'Cliente', 'PDR', 'Indirizzo', 'Attività'];
  const head = [...headFisse, ...dati.colonne.map((c) => c.etichetta)];

  const rigaToBody = (r: RigaRiepilogo): string[] => [
    String(r.n), r.nominativo, r.pdr, r.indirizzo, r.attivita, ...r.campi,
  ];

  const drawSezione = (titolo: string, colore: RGB, righe: RigaRiepilogo[], startY: number): number => {
    let ys = startY;
    if (ys > pageH - 26) { doc.addPage(); ys = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colore);
    doc.text(`${titolo} (${righe.length})`, ML, ys);
    autoTable(doc, {
      startY: ys + 2,
      head: [head],
      body: righe.map(rigaToBody),
      theme: 'striped',
      headStyles: { fillColor: colore, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: MUTED, fontStyle: 'bold' },
        1: { cellWidth: 33 },
        2: { cellWidth: 22 },
        3: { cellWidth: 40 },
        4: { cellWidth: 26 },
      },
      margin: { left: ML, right: MR },
    });
    return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? ys;
  };

  if (dati.eseguiti.length > 0) y = drawSezione('Eseguiti', GREEN, dati.eseguiti, y) + 8;
  if (dati.nonEseguiti.length > 0) y = drawSezione('Non eseguiti', RED, dati.nonEseguiti, y) + 8;

  // ── Piè di pagina su ogni pagina ──
  const ts = timestampLabel();
  const totPag = doc.getNumberOfPages();
  for (let p = 1; p <= totPag; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 11, pageW - MR, pageH - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('GestiLab Cantieri · Plenzich S.p.A.', ML, pageH - 7);
    doc.text(`Generato il ${ts} · Pagina ${p} di ${totPag}`, pageW - MR, pageH - 7, { align: 'right' });
  }

  return doc.output('blob');
}
