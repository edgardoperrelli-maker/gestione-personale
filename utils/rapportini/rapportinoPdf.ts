// utils/rapportini/rapportinoPdf.ts
//
// Il rapportino esce da qui e finisce su WhatsApp: il primo a leggerlo è il capisquadra, dal
// telefono, e solo dopo l'ufficio dal PC. Da questo discende tutta la forma del documento.
//
// DUE LIVELLI IN UN FILE SOLO
//  · LIVELLO CAMPO (A4 portrait, pagina 1) — quello che si apre in chat. Portrait perché i
//    visualizzatori adattano il PDF alla larghezza dello schermo: su un telefono in verticale una
//    pagina da 210 mm rende il testo il 41% più grande di una da 297. Sopra le quantità di
//    produzione, sotto gli interventi identificati da ODS/ODL, impianto e indirizzo.
//  · LIVELLO UFFICIO (A4 landscape, in coda) — la tabella completa, nessun dato perso.
//
// Il difetto che questa forma corregge: la versione precedente stampava fino a 21 colonne
// dinamiche su un landscape da 273 mm utili, cioè ~13 mm a colonna. Sotto quella soglia
// `splitTextToSize` spezza le parole a metà, e i rapportini reali uscivano con
// «VIA FRAN CESCO D OMENICO GUERRA ZZI 52» e motivi illeggibili come
// «CHIA MAT O PIU VOLT E AN CHE AL C ELLU LAR E».
import { BRAND_EXPORT } from '@/lib/brand';
import type { RowInput } from 'jspdf-autotable';
import type { ColonnaPdf, DatiRiepilogoPdf, RigaPdf } from './datiRiepilogoPdf';

type RGB = [number, number, number];
type Doc = import('jspdf').jsPDF;
type AutoTable = typeof import('jspdf-autotable').default;

const INK: RGB = BRAND_EXPORT.inkRgb;
const MUTED: RGB = BRAND_EXPORT.mutedRgb;
const CYAN: RGB = BRAND_EXPORT.accentRgb;
const LINE: RGB = BRAND_EXPORT.lineRgb;
const ZEBRA: RGB = BRAND_EXPORT.zebraRgb;
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [194, 38, 31];
const AMBER: RGB = [180, 132, 36];
const WHITE: RGB = [255, 255, 255];
/** Fondo tenue dei riquadri non colorati e delle righe nota. */
const WASH: RGB = [241, 245, 248];
const ML = 12;
const MR = 12;
/** Larghezza utile in portrait: 210 - margini. */
const W = 210 - ML - MR;

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

/** Unica casa del cast: `lastAutoTable` esiste a runtime ma non è nei tipi di jsPDF. */
function finalY(doc: Doc, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

function font(doc: Doc, style: 'normal' | 'bold', size: number, color: RGB): void {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

/**
 * jsPDF non ha la spaziatura fra lettere: le etichette maiuscole piccole si disegnano carattere
 * per carattere. Senza respiro «NON ESEGUITI» a 6pt è un blocco nero illeggibile sul telefono.
 */
function tracked(doc: Doc, testo: string, x: number, y: number, sp = 0.4): void {
  let cx = x;
  for (const ch of testo) {
    doc.text(ch, cx, y);
    cx += doc.getTextWidth(ch) + sp;
  }
}

function trackedW(doc: Doc, testo: string, sp = 0.4): number {
  return doc.getTextWidth(testo) + sp * Math.max(0, testo.length - 1);
}

/**
 * Logo come costante base64 già presente in `lib/og/brandLogo.ts` (auto-generato da
 * `scripts/gen-brand-logo-datauri.mjs`): nessun fetch, quindi funziona offline, nel guscio
 * nativo e nei test in Node, dove non esistono né rete né DOM.
 * Import dinamico perché il modulo pesa ~28 KB: viaggia nello stesso chunk lazy di jsPDF.
 */
async function logoBrand(): Promise<{ uri: string; w: number; h: number } | null> {
  try {
    const m = await import('@/lib/og/brandLogo');
    return { uri: m.BRAND_LOGO_DATA_URI, w: m.BRAND_LOGO_W, h: m.BRAND_LOGO_H };
  } catch {
    return null;
  }
}

/* ────────────────────────────  LIVELLO CAMPO  ──────────────────────────── */

function intestazioneCampo(doc: Doc, dati: DatiRiepilogoPdf, logo: Awaited<ReturnType<typeof logoBrand>>): number {
  const yBase = 13;
  const logoW = 22;
  if (logo) {
    // Un dettaglio grafico non può togliere il rapportino a chi è in cantiere: il chiamante ha
    // un solo catch che porta il bottone in errore SENZA produrre il PDF (CondividiPdfButton).
    try {
      doc.addImage(logo.uri, 'PNG', ML, yBase - 4.5, logoW, (logoW * logo.h) / logo.w);
    } catch {
      font(doc, 'bold', 8, CYAN);
      doc.text('PLENZICH S.P.A.', ML, yBase + 1);
    }
  } else {
    font(doc, 'bold', 8, CYAN);
    doc.text('PLENZICH S.P.A.', ML, yBase + 1);
  }

  const xTesto = ML + logoW + 4;
  font(doc, 'bold', 15.5, INK);
  doc.text(dati.staffName || 'Operatore', xTesto, yBase + 1.6);
  const committenti = (dati.committenti ?? []).filter(Boolean);
  if (committenti.length > 0) {
    font(doc, 'normal', 7, MUTED);
    doc.text(committenti.join('  ·  '), xTesto, yBase + 6);
  }

  font(doc, 'bold', 11, INK);
  doc.text(dati.dataLabel, ML + W, yBase + 1.6, { align: 'right' });
  font(doc, 'normal', 6.4, MUTED);
  doc.text('RAPPORTINO GIORNALIERO', ML + W, yBase + 6, { align: 'right' });

  const yRiga = yBase + 10.5;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(ML, yRiga, ML + W, yRiga);
  return yRiga + 6;
}

/**
 * I riquadri si contano dalle LISTE, non da `stats`: ogni voce finisce in esattamente una delle
 * tre liste, quindi la somma torna sempre e il lettore non trova mai una sezione «Senza esito (8)»
 * che nessun numero in testa aveva annunciato. `stats` resta la fonte condivisa con l'app, ma su
 * un rapportino con voci annullate divergerebbe dalle righe davvero stampate qui sotto.
 */
function riquadriEsiti(doc: Doc, dati: DatiRiepilogoPdf, y: number): number {
  const nEseguiti = dati.eseguiti.length;
  const nNonEseguiti = dati.nonEseguiti.length;
  const nSenzaEsito = dati.daFare.length;
  const riquadri: { v: number; l: string; c: RGB; pieno: boolean }[] = [
    { v: nEseguiti + nNonEseguiti + nSenzaEsito, l: 'INTERVENTI', c: INK, pieno: false },
    { v: nEseguiti, l: 'ESEGUITI', c: GREEN, pieno: true },
    { v: nNonEseguiti, l: 'NON ESEGUITI', c: RED, pieno: nNonEseguiti > 0 },
  ];
  // Il quarto riquadro compare solo quando c'è davvero qualcosa da segnalare: uno zero fisso è
  // rumore che l'occhio impara a saltare, e allora smette di vederlo anche quando zero non è.
  if (nSenzaEsito > 0) riquadri.push({ v: nSenzaEsito, l: 'SENZA ESITO', c: AMBER, pieno: true });

  const gap = 3.5;
  const h = 17;
  const w = (W - gap * (riquadri.length - 1)) / riquadri.length;
  riquadri.forEach((b, i) => {
    const x = ML + i * (w + gap);
    doc.setFillColor(...(b.pieno ? b.c : WASH));
    doc.roundedRect(x, y, w, h, 1.8, 1.8, 'F');
    font(doc, 'bold', 18, b.pieno ? WHITE : INK);
    doc.text(String(b.v), x + w / 2, y + 10.2, { align: 'center' });
    font(doc, 'bold', 6, b.pieno ? WHITE : MUTED);
    tracked(doc, b.l, x + (w - trackedW(doc, b.l)) / 2, y + 14.4);
  });
  return y + h + 5;
}

/**
 * Le LAVORAZIONI — mini bag, RG stop, sostituzione valvola e compagnia — sono le quantità che
 * il capisquadra cerca per prime, perché sono quelle che vanno a produzione. Stanno in card
 * accanto ai riquadri esiti, non in una riga di testo più in basso.
 *
 * Card e non semplici riquadri a larghezza fissa perché le etichette arrivano dal template e
 * possono essere lunghe (nei rapportini reali: «MINIBAG/RG STOP BONIFICA SEMPLICE»): l'etichetta
 * va a capo dentro la card e l'altezza si adatta alla più alta della riga. Massimo quattro per
 * riga: sotto i ~45 mm l'etichetta si spezzerebbe in troppe righe.
 */
function cardLavorazioni(doc: Doc, dati: DatiRiepilogoPdf, y: number): number {
  const voci = dati.lavorazioni;
  if (voci.length === 0) return y;

  const gap = 3.5;
  const padSx = 5;
  const padDx = 5;
  const maxCard = 58;

  // Ogni card è larga quanto la sua etichetta, non quanto una cella di griglia: con due sole
  // lavorazioni due card stirate a mezza pagina si leggono come riquadri rimasti a metà.
  font(doc, 'bold', 5.7, MUTED);
  const etichette = voci.map((v) => doc.splitTextToSize(v.etichetta.toUpperCase(), maxCard - padSx - padDx) as string[]);
  const larghezze = etichette.map((righe, i) => {
    const wLab = righe.reduce((m, r) => Math.max(m, trackedW(doc, r, 0.3)), 0);
    font(doc, 'bold', 15, CYAN);
    const wNum = doc.getTextWidth(String(voci[i].count));
    font(doc, 'bold', 5.7, MUTED);
    return Math.max(24, Math.max(wLab, wNum) + padSx + padDx);
  });
  const maxRighe = etichette.reduce((m, e) => Math.max(m, e.length), 1);
  const h = 13 + (maxRighe - 1) * 2.6;

  let cy = y;
  let cx = ML;
  voci.forEach((v, i) => {
    if (cx + larghezze[i] > ML + W && cx > ML) {
      cx = ML;
      cy += h + gap;
    }
    doc.setFillColor(...WASH);
    doc.roundedRect(cx, cy, larghezze[i], h, 1.8, 1.8, 'F');
    // Barretta cyan a sinistra: distingue a colpo d'occhio le lavorazioni dai riquadri esiti,
    // che sono pieni di colore, senza aggiungere un quinto colore alla pagina.
    doc.setFillColor(...CYAN);
    doc.roundedRect(cx, cy, 1.6, h, 0.8, 0.8, 'F');
    font(doc, 'bold', 15, CYAN);
    doc.text(String(v.count), cx + padSx, cy + 8.6);
    font(doc, 'bold', 5.7, MUTED);
    etichette[i].forEach((riga, k) => {
      tracked(doc, riga, cx + padSx, cy + 11.6 + k * 2.6, 0.3);
    });
    cx += larghezze[i] + gap;
  });
  return cy + h + 5;
}

/**
 * Le ATTIVITÀ, in linea con a capo automatico. Restano testo e non card perché sono molte di più
 * (fino a sette in un giro misto) e non sono la quantità che si cerca per prima: sono il dettaglio
 * di che tipo di lavoro ha prodotto quei numeri.
 */
function bloccoProduzione(doc: Doc, dati: DatiRiepilogoPdf, y: number): number {
  const voci = dati.attivita ?? [];
  if (voci.length === 0) return y;

  font(doc, 'bold', 6.2, MUTED);
  tracked(doc, 'ATTIVITÀ', ML, y);
  let cy = y + 4.2;
  let cx = ML;
  for (const v of voci) {
    font(doc, 'normal', 8.5, INK);
    const wEtichetta = doc.getTextWidth(v.etichetta);
    font(doc, 'bold', 10, INK);
    const larghezza = wEtichetta + 2.5 + doc.getTextWidth(String(v.count)) + 7;
    if (cx + larghezza > ML + W) {
      cx = ML;
      cy += 6.2;
    }
    font(doc, 'normal', 8.5, INK);
    doc.text(v.etichetta, cx, cy);
    font(doc, 'bold', 10, INK);
    doc.text(String(v.count), cx + wEtichetta + 2.5, cy);
    cx += larghezza;
  }
  return cy + 5.5;
}

/** Indice della colonna anagrafica richiesta, o -1. Le colonne sono dinamiche per template. */
function idxInfo(colonne: ColonnaPdf[], chiave: string): number {
  return colonne.findIndex((c) => c.info === chiave);
}

/** Valore di una colonna per una riga, stringa vuota se la colonna non esiste. */
function valoreDi(riga: RigaPdf, idx: number): string {
  return idx >= 0 ? (riga.valori[idx] ?? '').trim() : '';
}

/**
 * Il MOTIVO di un intervento non eseguito: il template a volte ha un campo dedicato
 * («MOTIVO NON ESEGUITO»), a volte lo affida alla nota — ed è coerente col dominio, perché
 * `voceColore` pretende la nota proprio quando l'esito è negativo. Si guarda prima il campo
 * dedicato, poi si ripiega sulla nota.
 */
function idxMotivo(colonne: ColonnaPdf[]): number {
  return colonne.findIndex((c) => !c.info && /motiv/i.test(`${c.campo ?? ''} ${c.etichetta}`));
}

/**
 * Motivo da mostrare per un intervento non eseguito: campo dedicato, poi nota, poi il VALORE
 * dell'esito. L'ultimo passaggio serve ai negativi auto-esplicativi come «NESSUN PASSAGGIO»,
 * che per `voceColore` non pretendono nota proprio perché il valore è già la spiegazione: senza
 * questo ripiego la colonna MOTIVO resterebbe bianca sull'unico intervento che spiega sé stesso.
 * Un secco "NO" invece non spiega niente e non vale la pena stamparlo.
 */
function motivoDiRiga(colonne: ColonnaPdf[], riga: RigaPdf, iMotivo: number): string {
  const dedicato = valoreDi(riga, iMotivo);
  if (dedicato) return dedicato;
  if (riga.nota) return riga.nota;
  const iEsito = colonne.findIndex((c) => !c.info && c.esito);
  const esito = valoreDi(riga, iEsito);
  return /^(no|x)$/i.test(esito) ? '' : esito;
}

/** Lavorazioni marcate su una riga: le colonne che rendono "X", esclusi esito e note. */
function lavorazioniDiRiga(colonne: ColonnaPdf[], riga: RigaPdf): string {
  return colonne
    .map((c, k) => (!c.info && !c.esito && !c.nota && (riga.valori[k] ?? '').trim() === 'X' ? c.etichetta : ''))
    .filter(Boolean)
    .join(' · ');
}

const TITOLO_SEZIONE: Record<string, string> = {
  eseguito: 'ESEGUITI',
  non_eseguito: 'NON ESEGUITI',
  da_fare: 'SENZA ESITO',
};

/**
 * La lista del livello CAMPO. Colonne derivate per NOME dall'anagrafica del template, mai
 * per posizione: ogni committente configura le sue, e una colonna assente si salta invece di
 * stampare un vuoto. Le note vanno in una riga a tutta larghezza sotto l'intervento — in
 * colonna erano loro a mandare a capo la riga e a sfalsare la griglia.
 */
function tabellaCampo(doc: Doc, autoTable: AutoTable, dati: DatiRiepilogoPdf, yIniziale: number): void {
  const cols = dati.colonne;
  const iOdl = idxInfo(cols, 'odl');
  const iMatricola = idxInfo(cols, 'matricola');
  const iPdr = idxInfo(cols, 'pdr');
  const iVia = idxInfo(cols, 'via');
  const iComune = idxInfo(cols, 'comune');
  const iMotivo = idxMotivo(cols);

  // Larghezze desiderate delle sole colonne presenti, poi normalizzate alla pagina: se il
  // template non ha l'ODS/ODL, quei millimetri tornano all'indirizzo invece di restare bianchi.
  const desiderate: { testa: string; w: number; valore: (r: RigaPdf, stato: string) => string; halign?: 'center' }[] = [];
  desiderate.push({ testa: '#', w: 8, halign: 'center', valore: (r) => String(r.n) });
  if (iOdl >= 0) desiderate.push({ testa: 'ODS/ODL', w: 25, valore: (r) => valoreDi(r, iOdl) || '—' });
  if (iMatricola >= 0 || iPdr >= 0) {
    desiderate.push({
      testa: iPdr >= 0 ? 'MATRICOLA / PDR' : 'MATRICOLA',
      w: 36,
      valore: (r) => {
        const m = valoreDi(r, iMatricola) || '—';
        const p = valoreDi(r, iPdr);
        return p ? `${m}\n${p}` : m;
      },
    });
  }
  if (iVia >= 0 || iComune >= 0) {
    desiderate.push({
      testa: 'INDIRIZZO',
      w: 62,
      valore: (r) => [valoreDi(r, iVia), valoreDi(r, iComune)].filter(Boolean).join('\n'),
    });
  }
  desiderate.push({
    testa: '',
    w: 49,
    valore: (r, stato) => (stato === 'eseguito' ? lavorazioniDiRiga(cols, r) : motivoDiRiga(cols, r, iMotivo)),
  });

  const somma = desiderate.reduce((a, c) => a + c.w, 0);
  const scala = W / somma;
  const larghezze = desiderate.map((c) => c.w * scala);

  let y = yIniziale;
  for (const stato of ['eseguito', 'non_eseguito', 'da_fare'] as const) {
    const righe = stato === 'eseguito' ? dati.eseguiti : stato === 'non_eseguito' ? dati.nonEseguiti : dati.daFare;
    if (righe.length === 0) continue;
    const colore = stato === 'eseguito' ? GREEN : stato === 'non_eseguito' ? RED : AMBER;

    if (y > 297 - 42) {
      doc.addPage('a4', 'portrait');
      y = 18;
    }
    doc.setFillColor(...colore);
    doc.rect(ML, y - 4, 2.2, 6, 'F');
    font(doc, 'bold', 8, colore);
    tracked(doc, `${TITOLO_SEZIONE[stato]}  ${righe.length}`, ML + 5, y + 0.5);
    y += 3.5;

    const teste = desiderate.map((c) => (c.testa === '' ? (stato === 'eseguito' ? 'LAVORAZIONI' : 'MOTIVO') : c.testa));
    const body: RowInput[] = [];
    for (const r of righe) {
      body.push(desiderate.map((c) => c.valore(r, stato)));
      // La riga nota si stampa se c'è e se non ripete già il motivo appena scritto in colonna.
      const motivo = stato === 'eseguito' ? '' : motivoDiRiga(cols, r, iMotivo);
      if (r.nota && r.nota !== motivo) {
        body.push([
          {
            content: `NOTA   ${r.nota}`,
            colSpan: teste.length,
            // halign esplicito: una cella con colSpan eredita lo stile della colonna 0, che è
            // centrata per il numero riga — senza questo la nota finirebbe al centro.
            styles: { fontSize: 7, fontStyle: 'italic', textColor: MUTED, halign: 'left', fillColor: WASH },
          },
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [teste],
      body,
      theme: 'plain',
      // Una riga non si spezza mai a cavallo di due pagine: spezzandola, la coda arrivava in
      // cima alla pagina dopo senza il suo intervento, e si leggeva come un testo di nessuno.
      rowPageBreak: 'avoid',
      margin: { left: ML, right: MR },
      tableWidth: W,
      styles: {
        font: 'helvetica', fontSize: 7.8, cellPadding: 1.1, textColor: INK,
        overflow: 'linebreak', valign: 'middle', lineWidth: 0,
      },
      headStyles: {
        fontStyle: 'bold', fontSize: 6.2, textColor: WHITE, fillColor: INK,
        cellPadding: { top: 1.3, bottom: 1.3, left: 1.1, right: 1.1 },
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: Object.fromEntries(
        desiderate.map((c, i) => [
          i,
          {
            cellWidth: larghezze[i],
            ...(c.halign ? { halign: c.halign, fontStyle: 'bold' as const, textColor: MUTED, fontSize: 6.8 } : {}),
            ...(i === 1 ? { fontStyle: 'bold' as const } : {}),
            ...(i === desiderate.length - 1 && stato !== 'eseguito'
              ? { textColor: RED, fontStyle: 'bold' as const, fontSize: 6.9 }
              : {}),
          },
        ]),
      ),
      didDrawCell: (d) => {
        // Filetto di esito sul bordo sinistro: dice a colpo d'occhio dove finisce una sezione,
        // anche quando la tabella impagina e il titolo colorato è rimasto sulla pagina prima.
        if (d.section === 'body' && d.column.index === 0) {
          doc.setFillColor(...colore);
          doc.rect(d.cell.x, d.cell.y, 1.1, d.cell.height, 'F');
        }
      },
    });
    y = finalY(doc, y) + 5;
  }
}

/* ────────────────────────────  LIVELLO UFFICIO  ──────────────────────────── */

/**
 * La tabella completa, in landscape e in coda. Tre misure le restituiscono la larghezza che le
 * serve: si potano le colonne vuote su TUTTE le righe, le colonne che contengono solo una "X"
 * vengono strette a 7 mm con l'intestazione ruotata, e il resto lo distribuisce autoTable in
 * proporzione al contenuto reale.
 */
function tabellaUfficio(doc: Doc, autoTable: AutoTable, dati: DatiRiepilogoPdf): void {
  // La pagina landscape va aperta PRIMA della tabella: autoTable dimensiona le colonne sulla
  // pagina corrente, e su una portrait le calcolerebbe su 210 mm per poi disegnarle su 297.
  doc.addPage('a4', 'landscape');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  font(doc, 'bold', 6.2, MUTED);
  tracked(doc, 'DETTAGLIO COMPLETO · TUTTI I CAMPI DEL RAPPORTINO', ML, 14);
  font(doc, 'bold', 12, INK);
  doc.text(`${dati.staffName || 'Operatore'} · ${dati.dataLabel}`, ML, 20);

  let y = 26;

  for (const stato of ['eseguito', 'non_eseguito', 'da_fare'] as const) {
    const righe = stato === 'eseguito' ? dati.eseguiti : stato === 'non_eseguito' ? dati.nonEseguiti : dati.daFare;
    if (righe.length === 0) continue;
    const colore = stato === 'eseguito' ? GREEN : stato === 'non_eseguito' ? RED : AMBER;

    // La potatura è PER SEZIONE, non sull'intero rapportino: «MOTIVO NON ESEGUITO» è vuota per
    // definizione fra gli eseguiti, e le lavorazioni lo sono fra i non eseguiti. Potando in
    // globale sopravviverebbero entrambe in tutte e due le tabelle, portandosi via i millimetri
    // che servono agli indirizzi proprio dove non hanno niente da dire.
    const largh = (k: number) => righe.reduce((m, r) => Math.max(m, (r.valori[k] ?? '').length), 0);
    const cols = dati.colonne.map((c, k) => ({ c, k, len: largh(k) })).filter(({ len }) => len > 0);
    if (cols.length === 0) continue;

    // "Stretta" si decide dal CONTENUTO, non dal tipo: anche i select che rendono "X" (la
    // saracinesca su "SI") stanno in due caratteri, e col criterio del tipo resterebbero larghi.
    const strette = new Set<number>();
    cols.forEach(({ len }, i) => {
      if (len <= 2) strette.add(i + 1);
    });

    // Altezza della testa: autoTable calcola l'ingombro sul testo ORIZZONTALE, quindi un'etichetta
    // ruotata uscirebbe dalla cella. La si misura a mano sul font della testa.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    const altezzaTesta = cols.reduce(
      (m, { c }, i) => (strette.has(i + 1) ? Math.max(m, doc.getTextWidth(c.etichetta) + 3) : m),
      10,
    );
    const teste = ['#', ...cols.map(({ c }) => c.etichetta)];

    if (y > pageH - 30) {
      doc.addPage('a4', 'landscape');
      y = 18;
    }
    font(doc, 'bold', 10, colore);
    doc.text(`${TITOLO_SEZIONE[stato]} (${righe.length})`, ML, y);

    autoTable(doc, {
      startY: y + 2,
      head: [teste],
      body: righe.map((r) => [String(r.n), ...cols.map(({ k }) => r.valori[k] ?? '')]),
      theme: 'striped',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      margin: { left: ML, right: MR },
      styles: {
        font: 'helvetica', fontSize: 7, cellPadding: 1.3, textColor: INK,
        overflow: 'linebreak', valign: 'middle',
      },
      headStyles: {
        fillColor: colore, textColor: WHITE, fontStyle: 'bold', fontSize: 6.2,
        minCellHeight: altezzaTesta, valign: 'bottom',
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: MUTED },
        ...Object.fromEntries(
          cols.map((_, i) => [i + 1, strette.has(i + 1) ? { cellWidth: 7, halign: 'center' as const } : { cellWidth: 'auto' as const }]),
        ),
      },
      didParseCell: (d) => {
        // Si svuota il testo della testa e lo si ridisegna ruotato in didDrawCell: sopprimere il
        // disegno con `willDrawCell → false` toglierebbe anche fondo e bordi, cioè la barra
        // colorata di sezione, che è l'elemento identitario di tutti i PDF di casa.
        if (d.section === 'head' && strette.has(d.column.index)) d.cell.text = [];
      },
      didDrawCell: (d) => {
        if (d.section !== 'head' || !strette.has(d.column.index)) return;
        const etichetta = teste[d.column.index] ?? '';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...WHITE);
        doc.text(etichetta, d.cell.x + d.cell.width / 2 + 1.2, d.cell.y + d.cell.height - 1.5, { angle: 90 });
      },
    });
    y = finalY(doc, y) + 7;
  }
  void pageW;
}

/* ────────────────────────────  PIÈ DI PAGINA  ──────────────────────────── */

/**
 * Le misure si rileggono DENTRO il ciclo, dopo `setPage`: `pageSize` è un getter sulla pagina
 * corrente, e con due orientamenti nello stesso file un valore letto una volta sola manderebbe
 * il piede della pagina landscape a metà foglio.
 */
function piePagina(doc: Doc): void {
  const ts = timestampLabel();
  const totPag = doc.getNumberOfPages();
  for (let p = 1; p <= totPag; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(ML, h - 10, w - MR, h - 10);
    font(doc, 'normal', 8, MUTED);
    doc.text('GestiLab Cantieri · Plenzich S.p.A.', ML, h - 6);
    doc.text(`Generato il ${ts} · Pagina ${p} di ${totPag}`, w - MR, h - 6, { align: 'right' });
  }
}

export async function generaRiepilogoPdfBlob(dati: DatiRiepilogoPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const logo = await logoBrand();

  // NON passare `compress: true`: senza compressione il testo resta ricercabile nei byte grezzi
  // del PDF, ed è l'unico modo che i test hanno di verificare che il contenuto sia davvero finito
  // nel documento (vitest gira in Node, senza un renderer PDF).
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let y = intestazioneCampo(doc, dati, logo);
  y = riquadriEsiti(doc, dati, y);
  y = cardLavorazioni(doc, dati, y);
  y = bloccoProduzione(doc, dati, y);
  tabellaCampo(doc, autoTable, dati, y);

  tabellaUfficio(doc, autoTable, dati);

  piePagina(doc);
  return doc.output('blob');
}
