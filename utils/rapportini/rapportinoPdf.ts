// utils/rapportini/rapportinoPdf.ts
import type { DatiRiepilogoPdf, RigaPdf } from './datiRiepilogoPdf';

type RGB = [number, number, number];
type ColStyle = { cellWidth?: number; halign?: 'left' | 'center' | 'right'; fontStyle?: 'bold' | 'normal'; textColor?: RGB };

const INK: RGB = [26, 35, 48];
const MUTED: RGB = [91, 103, 117];
const CYAN: RGB = [10, 143, 176];
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [194, 38, 31];
const AMBER: RGB = [180, 132, 36];
const LINE: RGB = [227, 232, 238];
const ML = 12;
const MR = 12;

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
  doc.text('RAPPORTINO GIORNALIERO · PLENZICH S.P.A.', ML, 14);
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(dati.staffName || 'Operatore', ML, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Data lavori', pageW - MR, 13, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(dati.dataLabel, pageW - MR, 19, { align: 'right' });

  // ── Riquadri statistici (sinistra) ──
  const yTop = 29;
  const boxH = 17;
  const boxGap = 4;
  const statsW = 112;
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
    doc.roundedRect(x, yTop, boxW, boxH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...b.c);
    doc.text(String(b.v), x + boxW / 2, yTop + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(b.l, x + boxW / 2, yTop + 13.5, { align: 'center' });
  });

  // ── Barre "Lavorazioni svolte" (destra) ──
  if (dati.lavorazioni.length > 0) {
    const barsX = ML + statsW + 12;
    const barsW = pageW - MR - barsX;
    const maxCount = Math.max(...dati.lavorazioni.map((l) => l.count), 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('LAVORAZIONI SVOLTE', barsX, yTop);
    let by = yTop + 4;
    const labelW = 50;
    const trackX = barsX + labelW;
    const trackW = Math.max(20, barsW - labelW - 10);
    for (const l of dati.lavorazioni) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(l.etichetta.length > 30 ? `${l.etichetta.slice(0, 29)}…` : l.etichetta, barsX, by + 2.4);
      doc.setFillColor(238, 241, 245);
      doc.roundedRect(trackX, by, trackW, 3, 1.5, 1.5, 'F');
      const w = Math.max(2, (l.count / maxCount) * trackW);
      doc.setFillColor(...CYAN);
      doc.roundedRect(trackX, by, w, 3, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MUTED);
      doc.text(String(l.count), pageW - MR, by + 2.4, { align: 'right' });
      by += 5.2;
    }
  }
  let y = yTop + boxH + 8;

  // ── Tabelle con colonne dinamiche (anagrafica template + campi) ──
  const head = ['#', ...dati.colonne.map((c) => c.etichetta)];
  const columnStyles: Record<string, ColStyle> = {
    0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: MUTED },
  };
  dati.colonne.forEach((c, k) => {
    if (c.crocetta) columnStyles[String(k + 1)] = { halign: 'center', cellWidth: 12 };
  });

  const rigaToBody = (r: RigaPdf): string[] => [String(r.n), ...r.valori];

  const drawSezione = (titolo: string, colore: RGB, righe: RigaPdf[], startY: number): number => {
    let ys = startY;
    if (ys > pageH - 24) { doc.addPage(); ys = 16; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colore);
    doc.text(`${titolo} (${righe.length})`, ML, ys);
    autoTable(doc, {
      startY: ys + 2,
      head: [head],
      body: righe.map(rigaToBody),
      theme: 'striped',
      headStyles: { fillColor: colore, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.3, textColor: INK, overflow: 'linebreak', valign: 'middle' },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles,
      margin: { left: ML, right: MR },
    });
    return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? ys;
  };

  if (dati.eseguiti.length > 0) y = drawSezione('Eseguiti', GREEN, dati.eseguiti, y) + 7;
  if (dati.nonEseguiti.length > 0) y = drawSezione('Non eseguiti', RED, dati.nonEseguiti, y) + 7;
  // Interventi ancora senza esito (non compilati / template senza `eseguito`): mostrati comunque,
  // così il PDF non resta mai vuoto e riporta tutti gli interventi con i loro dati.
  if (dati.daFare.length > 0) drawSezione('Da eseguire', AMBER, dati.daFare, y);

  // ── Piè di pagina su ogni pagina ──
  const ts = timestampLabel();
  const totPag = doc.getNumberOfPages();
  for (let p = 1; p <= totPag; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 10, pageW - MR, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('GestiLab Cantieri · Plenzich S.p.A.', ML, pageH - 6);
    doc.text(`Generato il ${ts} · Pagina ${p} di ${totPag}`, pageW - MR, pageH - 6, { align: 'right' });
  }

  return doc.output('blob');
}
