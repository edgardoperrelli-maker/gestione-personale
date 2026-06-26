// Genera un PDF "RAPPORTINO MANUTENZIONE" (facsimile del modulo cartaceo Plenzich)
// popolato con i dati di una chiamata P.I. Ritorna un Blob, condivisibile come un
// rapportino normale (condividiOScarica). jsPDF importato dinamicamente (client bundle).

export type DatiRapportinoPI = {
  bollato?: string;
  dataInizio?: string;
  dataFine?: string;
  oraInizio?: string;
  oraFine?: string;
  indirizzo?: string;
  comune?: string;
  assistenteItg?: string;
  assistenteDitta?: string;
  descrizione?: string;
};

export function nomeFileRapportinoPI(bollato: string | undefined, dataIso: string): string {
  const b = (bollato || 'PI').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'PI';
  return `Rapportino_${b}_${(dataIso || '').slice(0, 10)}.pdf`;
}

export async function generaRapportinoManutenzionePdfBlob(d: DatiRapportinoPI): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const L = 8;
  const R = 202;
  const W = R - L; // 194
  doc.setLineWidth(0.2);
  doc.setDrawColor(40);

  const box = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h);
  const lab = (x: number, y: number, t: string, size = 6.5) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(90);
    doc.text(t, x, y);
  };
  const val = (x: number, y: number, t: string, size = 9) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(20);
    doc.text(t || '', x, y);
  };
  // campo etichettato dentro un box
  const field = (x: number, y: number, w: number, h: number, label: string, value?: string) => {
    box(x, y, w, h); lab(x + 1.5, y + 3.2, label); val(x + 1.5, y + h - 2.2, value ?? '');
  };
  const siNo = (x: number, y: number, w: number, label: string) => {
    box(x, y, w, 6);
    lab(x + 1.5, y + 3.8, label, 6.5);
    const sx = x + w - 22;
    box(sx, y + 1.2, 3.6, 3.6); doc.setFontSize(5.5); doc.setTextColor(90); doc.text('SI', sx + 4.4, y + 4);
    box(sx + 9, y + 1.2, 3.6, 3.6); doc.text('NO', sx + 13.4, y + 4);
  };

  let y = 8;

  // ── Intestazione ──
  const hH = 16;
  box(L, y, W, hH);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
  doc.text('PLENZICH S.p.A.', L + 3, y + 7);
  doc.setFontSize(13);
  doc.text('RAPPORTINO MANUTENZIONE', L + W / 2, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text('Ed. 0 Rev.0 12/06/2019', R - 3, y + 4, { align: 'right' });
  lab(R - 42, y + 11, 'FAX/BOLLATO/IG');
  val(R - 42, y + 14.5, d.bollato ?? '', 10);
  y += hH;

  // ── Riga date/ore ──
  const r1 = 11;
  const c4 = W / 4;
  field(L, y, c4, r1, 'DATA INIZIO LAVORI', d.dataInizio);
  field(L + c4, y, c4, r1, 'ORA INIZIO', d.oraInizio);
  field(L + 2 * c4, y, c4, r1, 'ORA FINE', d.oraFine);
  field(L + 3 * c4, y, W - 3 * c4, r1, 'DATA FINE LAVORI', d.dataFine);
  y += r1;

  // ── Indirizzo + comune ──
  const r2 = 11;
  field(L, y, W * 0.72, r2, 'INDIRIZZO', d.indirizzo);
  field(L + W * 0.72, y, W * 0.28, r2, 'COMUNE / CIV.', d.comune);
  y += r2;

  // ── Assistenti / firme ──
  const r3 = 10;
  field(L, y, W * 0.5, r3, 'ASSISTENTE ITG', d.assistenteItg);
  field(L + W * 0.5, y, W * 0.5, r3, 'ASSISTENTE/I DITTA', d.assistenteDitta);
  y += r3;
  const r4 = 9;
  const c4b = W / 4;
  field(L, y, c4b, r4, 'D.L.');
  field(L + c4b, y, c4b, r4, 'COORD. SICUREZZA');
  field(L + 2 * c4b, y, c4b, r4, 'A.D.L./REFERENTE ITG');
  field(L + 3 * c4b, y, W - 3 * c4b, r4, 'SALDATORE/I');
  y += r4;

  // ── Corpo: schizzo (sx) + sezioni tecniche (dx) ──
  const bodyTop = y;
  const bodyH = 150;
  const leftW = W * 0.6;
  const rightX = L + leftW;
  const rightW = W - leftW;

  // Schizzo tecnico lavoro
  box(L, bodyTop, leftW, bodyH);
  lab(L + 2, bodyTop + 4, 'SCHIZZO TECNICO LAVORO', 7);
  // checkbox "eseguito sul retro"
  box(L + leftW - 24, bodyTop + 1.5, 3.4, 3.4);
  lab(L + leftW - 19, bodyTop + 4.2, 'ESEGUITO SUL RETRO', 5.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20);
  const testo = (d.descrizione ?? '').toUpperCase();
  const linee = doc.splitTextToSize(testo, leftW - 6);
  doc.text(linee, L + 3, bodyTop + 11);

  // Colonna destra: sezioni tecniche (modulo vuoto, da compilare a mano se serve)
  let ry = bodyTop;
  const rb = (h: number) => { ry += h; };
  // TUBAZIONE POSATA
  box(rightX, ry, rightW, 22); lab(rightX + 2, ry + 4, 'TUBAZIONE POSATA', 6.5);
  for (let i = 0; i < 4; i++) { lab(rightX + 2, ry + 9 + i * 3.5, 'PE ____ ml      ACC ____ ml', 6); }
  rb(22);
  // UTILIZZO CESTELLO
  box(rightX, ry, rightW, 8); lab(rightX + 2, ry + 3.5, 'UTILIZZO CESTELLO', 6.5);
  lab(rightX + 2, ry + 6.6, 'fino a 4h  SI [ ]  NO [ ]   h. eccedenti ____', 6);
  rb(8);
  // PONTEGGIO
  box(rightX, ry, rightW, 8); lab(rightX + 2, ry + 3.5, 'PONTEGGIO', 6.5);
  lab(rightX + 2, ry + 6.6, 'Altezza ______   Larghezza ______', 6);
  rb(8);
  // PDR rows
  for (const t of ['SPOSTAMENTO PDR', 'NUOVO PDR', 'ANNULLAMENTO PDR', 'NUOVA PRESA', 'TAGLIO PRESA', 'RIALLACCIO PRESA']) {
    siNo(rightX, ry, rightW, t); rb(6);
  }
  // FORNITURE
  box(rightX, ry, rightW, 6); lab(rightX + 2, ry + 3.8, 'FORNITURE', 6.5); rb(6);
  for (const t of ['MENSOLA', 'FLESSIBILE', 'VALVOLE  DN:', 'GRU  m³:', 'DIELETTRICO  DN:']) {
    siNo(rightX, ry, rightW, t); rb(6);
  }
  // CONTRATTO
  box(rightX, ry, rightW, 7); lab(rightX + 2, ry + 4.4, 'CONTRATTO N°: ____   TIB [ ] MM [ ] SP [ ]', 6); rb(7);
  // STOP systems
  for (const t of ['MICROSTOP  DN:', 'STOPSYSTEM  DN:', 'INTROBAG  DN:', 'MINISTOP  DN:']) {
    siNo(rightX, ry, rightW, t); rb(6);
  }
  y = bodyTop + bodyH;

  // ── Aspetti sicurezza ──
  const s1 = 12;
  box(L, y, W, s1);
  lab(L + 2, y + 3.5, 'ASPETTI RELATIVI ALLA SICUREZZA', 6.5);
  lab(L + 2, y + 7.5, 'DPI UTILIZZATI  SI [ ]  NO [ ]        DPI IN BUONO STATO  SI [ ]  NO [ ]', 6.2);
  lab(L + 2, y + 10.6, 'TUTTE LE ATTREZZATURE PRESENTI  SI [ ]  NO [ ]     ATTREZZATURE IN BUONO STATO  SI [ ]  NO [ ]', 6.2);
  y += s1;

  // ── Note ──
  const nH = 14;
  box(L, y, W, nH);
  lab(L + 2, y + 3.5, 'NOTE: descrivere il tipo di intervento ed elencare i materiali', 6.2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20);
  doc.text(doc.splitTextToSize((d.descrizione ?? '').toUpperCase(), W - 6), L + 3, y + 8);
  y += nH;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(120);
  doc.text('Pagina 1 di 1', R, y + 5, { align: 'right' });

  return doc.output('blob');
}
