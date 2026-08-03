import { BRAND_EXPORT } from '@/lib/brand';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATI_MISURATORE, STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import { formatItalian } from '@/utils/date-it';

export interface PdfFilters {
  dataInizio?: string;
  dataFine?: string;
  stato?: string;
  comune?: string;
  esecutore?: string;
  /** Filtro pallet attivo (registro AcquaLatina): il PDF di un pallet è la sua distinta. */
  pallet?: string;
  /** Filtro cesta attivo: il PDF di una cesta è l'elenco di cosa c'è dentro prima del pallet. */
  cesta?: string;
}

export interface PdfOpzioni {
  /** Titolo del documento: il PDF era cablato su «— ACEA» anche per l'altro registro. */
  titolo?: string;
  /** Colonna PDR (solo ACEA: un misuratore d'acqua non ha un punto di riconsegna gas). */
  mostraPdr?: boolean;
  /** Colonna Pallet: il riferimento con cui la riconsegna viaggia. */
  mostraPallet?: boolean;
  /** Colonna Cesta (solo AcquaLatina): il gradino prima del pallet, dichiarato dall'operatore. */
  mostraCesta?: boolean;
}

export function exportMisuratoriPdf(
  rows: MisuratoreRimosso[],
  filters: PdfFilters,
  opzioni: PdfOpzioni = {},
): void {
  // Sentence case (§4): era «Registro Misuratori Rimossi», il Title Case che il sistema vieta.
  const { titolo = 'Registro misuratori rimossi — ACEA', mostraPdr = true, mostraPallet = false, mostraCesta = false } = opzioni;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Intestazione: inchiostro di brand, non il nero di default di jsPDF.
  doc.setTextColor(...BRAND_EXPORT.inkRgb);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(titolo, 14, 18);

  // Filtri attivi
  const parts: string[] = [];
  if (filters.dataInizio || filters.dataFine) {
    parts.push(`Periodo: ${filters.dataInizio ?? '—'} / ${filters.dataFine ?? '—'}`);
  }
  if (filters.stato) {
    const statoLabel = (STATI_MISURATORE as readonly string[]).includes(filters.stato)
      ? STATO_LABEL[filters.stato as StatoMisuratore]
      : filters.stato;
    parts.push(`Stato: ${statoLabel}`);
  }
  if (filters.comune) parts.push(`Comune: ${filters.comune}`);
  if (filters.esecutore) parts.push(`Esecutore: ${filters.esecutore}`);
  if (filters.cesta) parts.push(`Cesta: ${filters.cesta}`);
  if (filters.pallet) parts.push(`Pallet: ${filters.pallet}`);

  doc.setTextColor(...BRAND_EXPORT.mutedRgb);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (parts.length) doc.text(parts.join('  ·  '), 14, 26);

  const printDate = new Date().toLocaleDateString('it-IT');
  doc.text(`Stampato: ${printDate}  ·  ${rows.length} righe`, 14, 32);

  /*
    Colonne per registro: la testa, la riga e le larghezze si costruiscono INSIEME, così una
    colonna condizionale non può sfalsare le altre (l'errore classico delle tre liste parallele).
  */
  type Colonna = { testa: string; valore: (r: MisuratoreRimosso) => string; larghezza?: number | 'auto' };
  const colonne: Colonna[] = [
    { testa: 'ODS/ODL', valore: (r) => r.odl ?? '', larghezza: 22 },
    { testa: 'Data', valore: (r) => formatItalian(r.data_esecuzione), larghezza: 20 },
    { testa: 'Esecutore', valore: (r) => r.esecutore ?? '', larghezza: 28 },
    { testa: 'Indirizzo', valore: (r) => r.indirizzo ?? '', larghezza: 45 },
    { testa: 'Comune', valore: (r) => r.comune ?? '', larghezza: 24 },
    { testa: 'Matricola', valore: (r) => r.matricola, larghezza: 26 },
    ...(mostraPdr ? [{ testa: 'PDR', valore: (r: MisuratoreRimosso) => r.pdr ?? '', larghezza: 20 } as Colonna] : []),
    // Cesta prima di Pallet, come in tabella: è l'ordine del ciclo fisico.
    ...(mostraCesta ? [{ testa: 'Cesta', valore: (r: MisuratoreRimosso) => r.cesta ?? '', larghezza: 16 } as Colonna] : []),
    ...(mostraPallet ? [{ testa: 'Pallet', valore: (r: MisuratoreRimosso) => r.pallet ?? '', larghezza: 18 } as Colonna] : []),
    { testa: 'Stato', valore: (r) => STATO_LABEL[r.stato], larghezza: 36 },
    { testa: 'Note', valore: (r) => r.note ?? '', larghezza: 'auto' },
  ];

  autoTable(doc, {
    startY: 38,
    head: [colonne.map((c) => c.testa)],
    body: rows.map((r) => colonne.map((c) => c.valore(r))),
    styles:     { fontSize: 7, cellPadding: 1.5, textColor: [...BRAND_EXPORT.inkRgb] },
    headStyles: { fillColor: [...BRAND_EXPORT.accentRgb], textColor: 255, fontStyle: 'bold' },
    // La zebra di BRAND: era 245,247,250 mentre gli altri due PDF di casa stavano a 246,249,251.
    alternateRowStyles: { fillColor: [...BRAND_EXPORT.zebraRgb] },
    columnStyles: Object.fromEntries(
      colonne.map((c, i) => [i, { cellWidth: c.larghezza ?? 'auto' }]),
    ),
  });

  // Footer "Pagina X di Y" — post-processing
  const pageCount = doc.getNumberOfPages();
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
