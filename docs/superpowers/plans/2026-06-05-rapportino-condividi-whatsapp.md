# Condivisione PDF riepilogo rapportino su WhatsApp — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'operatore, dopo l'invio del rapportino su `/r/[token]`, di generare nel browser un PDF di riepilogo (layout "Concept C") e condividerlo su WhatsApp con un tocco, senza alcun servizio a pagamento.

**Architecture:** Tutto client-side. Una funzione **pura** trasforma le voci nei dati del PDF; un builder usa **jsPDF** (import dinamico) per produrre un `Blob`; un helper condivide via **Web Share API** con fallback al download. Un pulsante nel box "inviato" di `RapportinoLista` orchestra il tutto. Nessun endpoint, nessuna scrittura su filesystem, nessuna nuova dipendenza.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, `jspdf` + `jspdf-autotable` (già presenti), vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-rapportino-condividi-whatsapp-design.md`

---

## File structure

```
Nuovi:
  utils/rapportini/datiRiepilogoPdf.ts        # PURO: voci → dati PDF (+ motivoNonEseguito)
  utils/rapportini/datiRiepilogoPdf.test.ts   # vitest
  utils/rapportini/rapportinoPdf.ts           # client: jsPDF → Blob (+ nomeFilePdf)
  utils/rapportini/rapportinoPdf.test.ts      # vitest (nomeFilePdf + smoke blob)
  utils/rapportini/condividiFile.ts           # client: Web Share + fallback download
  utils/rapportini/condividiFile.test.ts      # vitest (predicato supporto)
  components/modules/rapportini/CondividiPdfButton.tsx  # client: pulsante + stati
Modificati:
  components/modules/rapportini/RapportinoLista.tsx     # rende il pulsante nel box "inviato"
  components/modules/rapportini/RapportinoForm.tsx      # passa voci/campi/dataIso
```

Responsabilità isolate: i dati (puri, testabili) sono separati dal rendering PDF (jsPDF) e dalla condivisione (Web Share). Il pulsante è l'unico punto che li mette insieme.

---

## Task 1: Dati del PDF (funzione pura) + test

**Files:**
- Create: `utils/rapportini/datiRiepilogoPdf.ts`
- Test: `utils/rapportini/datiRiepilogoPdf.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/datiRiepilogoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { costruisciDatiPdf, motivoNonEseguito } from './datiRiepilogoPdf';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
  { chiave: 'assente', etichetta: 'Cliente assente', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
];

describe('motivoNonEseguito', () => {
  it('usa la nota se presente (trim)', () => {
    expect(motivoNonEseguito({ note: '  Cancello chiuso ' })).toBe('Cancello chiuso');
  });
  it('senza nota valida → "Assente"', () => {
    expect(motivoNonEseguito({})).toBe('Assente');
    expect(motivoNonEseguito({ note: '   ' })).toBe('Assente');
    expect(motivoNonEseguito({ note: 42 })).toBe('Assente');
  });
});

describe('costruisciDatiPdf', () => {
  const voci = [
    { nominativo: 'Esposito Anna', pdr: '111', via: 'Via Toledo 45', comune: 'Napoli', attivita: 'Sost.', risposte: { eseguito: 'SI', cambio: true } },
    { nominativo: 'Conte Rosa', pdr: '222', via: 'Via Diaz 22', comune: 'Napoli', attivita: 'Sost.', risposte: { assente: true } },
    { nominativo: 'Gallo Sara', pdr: '333', via: 'Via Petrarca 3', comune: 'Napoli', attivita: 'Verifica', risposte: { assente: true, note: 'Impianto non accessibile' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Mario Rossi', dataLabel: '04/06/2026', voci, campi });

  it('conteggi corretti', () => {
    expect(dati.stats).toEqual({ totali: 3, eseguiti: 1, nonEseguiti: 2 });
  });
  it('separa eseguiti/non eseguiti con numerazione globale', () => {
    expect(dati.eseguiti.map((r) => r.n)).toEqual([1]);
    expect(dati.nonEseguiti.map((r) => r.n)).toEqual([2, 3]);
  });
  it('indirizzo = via · comune', () => {
    expect(dati.eseguiti[0].indirizzo).toBe('Via Toledo 45 · Napoli');
  });
  it('motivo = nota oppure "Assente"', () => {
    expect(dati.nonEseguiti[0].motivo).toBe('Assente');
    expect(dati.nonEseguiti[1].motivo).toBe('Impianto non accessibile');
  });
  it('lavorazioni escludono i marcatori "assente"', () => {
    expect(dati.lavorazioni).toEqual([{ etichetta: 'CAMBIO', count: 1 }]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/datiRiepilogoPdf.test.ts`
Expected: FAIL — "Failed to resolve import './datiRiepilogoPdf'".

- [ ] **Step 3: Implementa la funzione pura**

```ts
// utils/rapportini/datiRiepilogoPdf.ts
import { riepilogoRapportino, statoVoce } from './riepilogo';
import { valoreInfo, type VoceInfo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

export interface VoceRiepilogo extends VoceInfo {
  risposte: Record<string, unknown>;
}

export interface RigaRiepilogo {
  n: number;
  nominativo: string;
  pdr: string;
  indirizzo: string;
  attivita: string;
  motivo?: string;
}

export interface DatiRiepilogoPdf {
  staffName: string;
  dataLabel: string;
  stats: { totali: number; eseguiti: number; nonEseguiti: number };
  lavorazioni: { etichetta: string; count: number }[];
  eseguiti: RigaRiepilogo[];
  nonEseguiti: RigaRiepilogo[];
}

/** Marcatori negativi (es. "assente") non sono "lavorazioni svolte". */
function isMarcatoreAssente(chiave: string, etichetta: string): boolean {
  return /assent/i.test(`${chiave} ${etichetta}`);
}

/** Motivo del non eseguito: nota libera se presente, altrimenti "Assente". */
export function motivoNonEseguito(risposte: Record<string, unknown>): string {
  const raw = risposte?.note;
  const nota = typeof raw === 'string' ? raw.trim() : '';
  return nota || 'Assente';
}

export function costruisciDatiPdf(params: {
  staffName: string;
  dataLabel: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
}): DatiRiepilogoPdf {
  const { staffName, dataLabel, voci, campi } = params;
  const riep = riepilogoRapportino(voci, campi);

  const eseguiti: RigaRiepilogo[] = [];
  const nonEseguiti: RigaRiepilogo[] = [];

  voci.forEach((v, i) => {
    const base: RigaRiepilogo = {
      n: i + 1,
      nominativo: valoreInfo(v, 'nominativo') || valoreInfo(v, 'pdr') || `Voce ${i + 1}`,
      pdr: valoreInfo(v, 'pdr'),
      indirizzo: [valoreInfo(v, 'via'), valoreInfo(v, 'comune')].filter(Boolean).join(' · '),
      attivita: valoreInfo(v, 'attivita'),
    };
    const stato = statoVoce(v.risposte, campi);
    if (stato === 'eseguito') eseguiti.push(base);
    else if (stato === 'non_eseguito') nonEseguiti.push({ ...base, motivo: motivoNonEseguito(v.risposte) });
    // 'da_fare' ignorato: dopo l'invio non esiste (gate daFare === 0)
  });

  return {
    staffName,
    dataLabel,
    stats: { totali: riep.totali, eseguiti: riep.eseguiti, nonEseguiti: riep.nonEseguiti },
    lavorazioni: riep.lavorazioni
      .filter((l) => !isMarcatoreAssente(l.chiave, l.etichetta))
      .map((l) => ({ etichetta: l.etichetta, count: l.count })),
    eseguiti,
    nonEseguiti,
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/datiRiepilogoPdf.test.ts`
Expected: PASS (5+ test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/datiRiepilogoPdf.ts utils/rapportini/datiRiepilogoPdf.test.ts
git commit -m "feat(rapportini): dati puri per il PDF di riepilogo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Builder PDF con jsPDF + test

**Files:**
- Create: `utils/rapportini/rapportinoPdf.ts`
- Test: `utils/rapportini/rapportinoPdf.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/rapportinoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { nomeFilePdf, generaRiepilogoPdfBlob } from './rapportinoPdf';
import type { DatiRiepilogoPdf } from './datiRiepilogoPdf';

describe('nomeFilePdf', () => {
  it('sanifica nome operatore e usa la data ISO (YYYY-MM-DD)', () => {
    expect(nomeFilePdf('Mario Rossi', '2026-06-04')).toBe('Rapportino_Mario_Rossi_2026-06-04.pdf');
  });
  it('rimuove accenti e simboli', () => {
    expect(nomeFilePdf("D'Amico Niccolò", '2026-06-04T10:00:00')).toBe('Rapportino_D_Amico_Niccolo_2026-06-04.pdf');
  });
  it('fallback se nome vuoto', () => {
    expect(nomeFilePdf('', '2026-06-04')).toBe('Rapportino_operatore_2026-06-04.pdf');
  });
});

describe('generaRiepilogoPdfBlob', () => {
  const dati: DatiRiepilogoPdf = {
    staffName: 'Mario Rossi',
    dataLabel: '04/06/2026',
    stats: { totali: 2, eseguiti: 1, nonEseguiti: 1 },
    lavorazioni: [{ etichetta: 'CAMBIO', count: 1 }],
    eseguiti: [{ n: 1, nominativo: 'Esposito Anna', pdr: '111', indirizzo: 'Via Toledo 45 · Napoli', attivita: 'Sost.' }],
    nonEseguiti: [{ n: 2, nominativo: 'Conte Rosa', pdr: '222', indirizzo: 'Via Diaz 22 · Napoli', attivita: 'Sost.', motivo: 'Assente' }],
  };
  it('produce un Blob PDF non vuoto', async () => {
    const blob = await generaRiepilogoPdfBlob(dati);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/rapportinoPdf.test.ts`
Expected: FAIL — import non risolvibile.

- [ ] **Step 3: Implementa il builder**

```ts
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
      ['#', 'Cliente', 'PDR', 'Indirizzo', 'Attività'],
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

  // ── Piè di pagina su ogni pagina ──
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
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/rapportinoPdf.test.ts`
Expected: PASS. (jsPDF gira anche in Node, come nella route sopralluoghi.) Se nell'ambiente di test `Blob`/`File` non fossero disponibili, eseguire comunque `npm run build` come verifica di compilazione e segnalarlo.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/rapportinoPdf.ts utils/rapportini/rapportinoPdf.test.ts
git commit -m "feat(rapportini): builder PDF riepilogo (Concept C) con jsPDF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Helper di condivisione (Web Share + fallback) + test

**Files:**
- Create: `utils/rapportini/condividiFile.ts`
- Test: `utils/rapportini/condividiFile.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/condividiFile.test.ts
import { describe, it, expect } from 'vitest';
import { supportaCondivisioneFile } from './condividiFile';

const file = new Blob(['x'], { type: 'application/pdf' });

describe('supportaCondivisioneFile', () => {
  it('true quando share e canShare ci sono e canShare ritorna true', () => {
    expect(supportaCondivisioneFile({ share: async () => {}, canShare: () => true }, file)).toBe(true);
  });
  it('false quando manca share', () => {
    expect(supportaCondivisioneFile({ canShare: () => true }, file)).toBe(false);
  });
  it('false quando canShare ritorna false', () => {
    expect(supportaCondivisioneFile({ share: async () => {}, canShare: () => false }, file)).toBe(false);
  });
  it('false quando navigator non supporta nulla', () => {
    expect(supportaCondivisioneFile({}, file)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/condividiFile.test.ts`
Expected: FAIL — import non risolvibile.

- [ ] **Step 3: Implementa l'helper**

```ts
// utils/rapportini/condividiFile.ts
export type EsitoCondivisione = 'shared' | 'downloaded' | 'cancelled';

export interface NavShareLike {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/** Vero se il dispositivo può condividere file via Web Share API. Puro: testabile con un finto navigator. */
export function supportaCondivisioneFile(nav: NavShareLike, file: Blob): boolean {
  return typeof nav.share === 'function'
    && typeof nav.canShare === 'function'
    && nav.canShare({ files: [file as File] });
}

function scarica(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Prova la condivisione nativa del file; altrimenti scarica. Annullo utente → 'cancelled'. */
export async function condividiOScarica(opts: {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
}): Promise<EsitoCondivisione> {
  const { blob, filename, title, text } = opts;
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (supportaCondivisioneFile(navigator, file)) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // altri errori → ripiega sul download
    }
  }
  scarica(blob, filename);
  return 'downloaded';
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/condividiFile.test.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/condividiFile.ts utils/rapportini/condividiFile.test.ts
git commit -m "feat(rapportini): condivisione file via Web Share con fallback download

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pulsante "Condividi PDF su WhatsApp"

**Files:**
- Create: `components/modules/rapportini/CondividiPdfButton.tsx`

Nota: nessun test automatico (non c'è ambiente React/jsdom configurato nel progetto); la logica è sottile e verrà validata manualmente sul telefono (Task 6). La logica pura è già coperta dai Task 1–3.

- [ ] **Step 1: Crea il componente**

```tsx
// components/modules/rapportini/CondividiPdfButton.tsx
'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { costruisciDatiPdf, type VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { generaRiepilogoPdfBlob, nomeFilePdf } from '@/utils/rapportini/rapportinoPdf';
import { condividiOScarica } from '@/utils/rapportini/condividiFile';

type Stato = 'idle' | 'lavoro' | 'fatto' | 'errore';

export function CondividiPdfButton({
  staffName,
  dataLabel,
  dataIso,
  voci,
  campi,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
}) {
  const [stato, setStato] = useState<Stato>('idle');

  const onClick = async () => {
    if (stato === 'lavoro') return;
    setStato('lavoro');
    try {
      const dati = costruisciDatiPdf({ staffName, dataLabel, voci, campi });
      const blob = await generaRiepilogoPdfBlob(dati);
      const esito = await condividiOScarica({
        blob,
        filename: nomeFilePdf(staffName, dataIso),
        title: `Rapportino ${staffName} ${dataLabel}`,
        text: `Rapportino ${staffName} — ${dataLabel}`,
      });
      setStato(esito === 'cancelled' ? 'idle' : 'fatto');
    } catch {
      setStato('errore');
    }
  };

  const label =
    stato === 'lavoro' ? 'Generazione…'
      : stato === 'fatto' ? 'PDF condiviso ✓'
      : stato === 'errore' ? 'Errore — tocca per riprovare'
      : '📄 Condividi PDF su WhatsApp';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={stato === 'lavoro'}
      className="mt-2 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-base font-semibold text-[var(--brand-text-main)] transition enabled:active:border-[var(--brand-primary)] disabled:opacity-60"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verifica compilazione e lint del file nuovo**

Run: `npx tsc --noEmit`
Expected: nessun errore relativo a questo file.
Run: `npx eslint components/modules/rapportini/CondividiPdfButton.tsx`
Expected: nessun errore (baseline lint del repo già rossa altrove — verificare solo questo file).

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/CondividiPdfButton.tsx
git commit -m "feat(rapportini): pulsante Condividi PDF su WhatsApp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Innesto in RapportinoLista e RapportinoForm

**Files:**
- Modify: `components/modules/rapportini/RapportinoLista.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: RapportinoLista — importa il pulsante e i tipi**

In testa al file, dopo l'import di `IntestazioneRiepilogo`, aggiungi:

```tsx
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { CondividiPdfButton } from './CondividiPdfButton';
```

- [ ] **Step 2: RapportinoLista — aggiungi le prop**

Nell'oggetto di destrutturazione delle props del componente `RapportinoLista`, aggiungi `dataIso`, `voci`, `campi`; e nella type annotation inline aggiungi i rispettivi tipi. Risultato della firma:

```tsx
export function RapportinoLista({
  staffName,
  dataLabel,
  dataIso,
  voci,
  campi,
  riepilogo,
  righe,
  filtro,
  onFiltro,
  onApri,
  onInvia,
  inviabile,
  inviando,
  readOnly,
  inviato,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  riepilogo: RiepilogoRapportino;
  righe: RigaVoce[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onApri: (index: number) => void;
  onInvia: () => void;
  inviabile: boolean;
  inviando: boolean;
  readOnly: boolean;
  inviato: boolean;
}) {
```

- [ ] **Step 3: RapportinoLista — rendi il pulsante nel box "inviato"**

Sostituisci il blocco:

```tsx
          {inviato ? (
            <p className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] py-3 text-center text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</p>
          ) : (
```

con:

```tsx
          {inviato ? (
            <>
              <p className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] py-3 text-center text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</p>
              <CondividiPdfButton
                staffName={staffName}
                dataLabel={dataLabel}
                dataIso={dataIso}
                voci={voci}
                campi={campi}
              />
            </>
          ) : (
```

- [ ] **Step 4: RapportinoForm — passa le nuove prop a RapportinoLista**

Nel JSX dove viene reso `<RapportinoLista ... />`, aggiungi tre prop. `voci` e `campi` sono già variabili in scope nel componente; `dataIso` deriva da `rapportino.data`:

```tsx
        <RapportinoLista
          staffName={rapportino.staff_name}
          dataLabel={dataLabel}
          dataIso={rapportino.data}
          voci={voci}
          campi={campi}
          riepilogo={riepilogo}
          righe={righe}
          filtro={filtro}
          onFiltro={setFiltro}
          onApri={onApri}
          onInvia={handleInvia}
          inviabile={inviabile}
          inviando={inviando}
          readOnly={readOnly}
          inviato={inviato}
        />
```

- [ ] **Step 5: Verifica compilazione e lint dei file toccati**

Run: `npx tsc --noEmit`
Expected: nessun errore. (`voci` di `RapportinoForm` è `Voce[]`, compatibile con `VoceRiepilogo[]` perché ha i campi anagrafici opzionali + `risposte`.)
Run: `npx eslint components/modules/rapportini/RapportinoLista.tsx components/modules/rapportini/RapportinoForm.tsx`
Expected: nessun nuovo errore introdotto da queste modifiche.

- [ ] **Step 6: Commit**

```bash
git add components/modules/rapportini/RapportinoLista.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): mostra Condividi PDF nel box 'inviato'

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica finale e anteprima Vercel

**Files:** nessuno (verifica + rollout).

- [ ] **Step 1: Suite di test completa**

Run: `npm test`
Expected: tutti i test verdi (inclusi i 3 nuovi file). Nessuna regressione.

- [ ] **Step 2: Build di produzione (typecheck incluso)**

Run: `npm run build`
Expected: build completata senza errori di tipo.

- [ ] **Step 3: Lint mirato sui file nuovi/toccati**

Run:
```bash
npx eslint utils/rapportini/datiRiepilogoPdf.ts utils/rapportini/rapportinoPdf.ts utils/rapportini/condividiFile.ts components/modules/rapportini/CondividiPdfButton.tsx components/modules/rapportini/RapportinoLista.tsx components/modules/rapportini/RapportinoForm.tsx
```
Expected: nessun errore sui file della feature (la baseline lint del repo è già rossa altrove).

- [ ] **Step 4: Push del branch per l'anteprima Vercel** (SOLO dopo conferma dell'utente)

```bash
git push origin feat/rapportino-condividi-whatsapp
```
Expected: Vercel crea un deploy di **anteprima** (URL HTTPS) per il branch. La produzione (`main`) resta intatta.

- [ ] **Step 5: Test manuale sul telefono (dall'URL di anteprima)**

Checklist:
- Aprire un rapportino **già inviato** (`/r/<token>`) dall'URL di anteprima → compare "📄 Condividi PDF su WhatsApp".
- Toccare → si apre il menù di condivisione nativo → scegliere WhatsApp → il PDF arriva come allegato.
- Verificare il contenuto del PDF: intestazione (operatore/data), riquadri (totali/eseguiti/non eseguiti), barre lavorazioni, elenchi Eseguiti/Non eseguiti con motivo, piè di pagina.
- Su desktop: il pulsante avvia il **download** del PDF (fallback).

- [ ] **Step 6: Merge in produzione** (SOLO dopo l'OK dell'utente sui test)

Vedi `superpowers:finishing-a-development-branch`. In sintesi (con consenso esplicito): `git fetch`, poi merge fast-forward del branch in `main` e push → deploy in produzione.

---

## Self-Review

**1. Copertura dello spec:**
- §3 layout Concept C → Task 2 (intestazione, riquadri, barre, due elenchi, footer). ✓
- §4 origine dati (riepilogo, statoVoce, valoreInfo, motivo) → Task 1. ✓
- §5 architettura (4 file nuovi + 2 modifiche) → Task 1–5. ✓ (parametro `infoCampi` rimosso: Concept C usa campi fissi nominativo/PDR/indirizzo/attività, quindi non necessario — semplificazione rispetto allo spec, nessun impatto sull'output).
- §6 flusso due-tocchi (pulsante nel box inviato, visibile anche riaprendo) → Task 5. ✓
- §7 Web Share + fallback download → Task 3. ✓
- §8 gestione errori (errore/annullo) → Task 3 (`cancelled`) + Task 4 (stato `errore`). ✓
- §10 test (dati, motivo, filename) → Task 1–3. ✓
- §11 rollout (branch da main → anteprima → merge) → Task 6. ✓

**2. Scansione placeholder:** nessun TBD/TODO; ogni step ha codice o comando concreto. ✓

**3. Coerenza dei tipi:** `VoceRiepilogo` (Task 1) usato in Task 4/5; `DatiRiepilogoPdf`/`RigaRiepilogo` (Task 1) usati in Task 2; `costruisciDatiPdf`, `generaRiepilogoPdfBlob`, `nomeFilePdf`, `condividiOScarica`, `supportaCondivisioneFile`, `CondividiPdfButton` — firme coerenti tra le task. `lavorazioni` filtra i marcatori "assente" (Task 1) coerente col mockup Concept C. ✓

**Nota di semplificazione:** rispetto allo spec, il builder non riceve `infoCampi` (non serve per Concept C). Aggiornare lo spec §5 di conseguenza è opzionale.
