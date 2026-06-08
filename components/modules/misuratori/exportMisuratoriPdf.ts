import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';

export interface PdfFilters {
  dataInizio?: string;
  dataFine?: string;
  stato?: string;
  comune?: string;
  esecutore?: string;
}

export function exportMisuratoriPdf(rows: MisuratoreRimosso[], filters: PdfFilters): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Intestazione
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Registro Misuratori Rimossi — ACEA', 14, 18);

  // Filtri attivi
  const parts: string[] = [];
  if (filters.dataInizio || filters.dataFine) {
    parts.push(`Periodo: ${filters.dataInizio ?? '—'} / ${filters.dataFine ?? '—'}`);
  }
  if (filters.stato) {
    parts.push(`Stato: ${STATO_LABEL[filters.stato as StatoMisuratore] ?? filters.stato}`);
  }
  if (filters.comune) parts.push(`Comune: ${filters.comune}`);
  if (filters.esecutore) parts.push(`Esecutore: ${filters.esecutore}`);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (parts.length) doc.text(parts.join('  ·  '), 14, 26);

  const printDate = new Date().toLocaleDateString('it-IT');
  doc.text(`Stampato: ${printDate}  ·  ${rows.length} righe`, 14, 32);

  // Tabella
  autoTable(doc, {
    startY: 38,
    head: [['ODS/ODL', 'Data', 'Esecutore', 'Indirizzo', 'Comune', 'Matricola', 'PDR', 'Stato', 'Note']],
    body: rows.map(r => [
      r.odl ?? '',
      r.data_esecuzione,
      r.esecutore ?? '',
      r.indirizzo ?? '',
      r.comune ?? '',
      r.matricola,
      r.pdr ?? '',
      STATO_LABEL[r.stato],
      r.note ?? '',
    ]),
    styles:     { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 28 },
      3: { cellWidth: 45 },
      4: { cellWidth: 24 },
      5: { cellWidth: 26 },
      6: { cellWidth: 20 },
      7: { cellWidth: 36 },
      8: { cellWidth: 'auto' },
    },
  });

  // Footer "Pagina X di Y" — post-processing
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' }
    );
  }

  doc.save(`misuratori-rimossi-${new Date().toISOString().slice(0, 10)}.pdf`);
}
