# Risanamento — Fase 5b (PDF riepilogo + ZIP foto) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). **Sessioni concorrenti**: verificare `git branch --show-current` = `feat/risanamento-fase5b` prima di OGNI commit; se diverso, NON committare. **NB working tree**: c'è una modifica NON committata a `components/modules/mappa/MappaOperatoriClient.tsx` (lavoro concorrente) — NON includerla MAI nei commit (`git add` solo dei file elencati per task).

**Goal:** PDF riepilogo del risanamento (civici + misuratori + totale punti gas) generato dall'operatore e condiviso come i link standard; ZIP foto web esteso alle foto delle righe-misuratore.

**Architecture:** PDF lato client (jsPDF, come `rapportinoPdf.ts`), nessuna foto dentro. Helper puro per i dati. Bottone in `RisanamentoView` post-invio → `condividiOScarica`. ZIP foto: nuova Fonte C (righe-misuratore) in `foto-zip/route.ts`.

**Tech Stack:** Next.js 15, TypeScript, jsPDF + jspdf-autotable (già in repo), Supabase, Vitest.

**Vincoli:** Nessuna migration nuova. Gate: unit test helper, `tsc`, `eslint` (file nuovi), `npm run build`. Branch `feat/risanamento-fase5b`. NO push senza ok.

---

## File Structure
- Create: `utils/rapportini/datiPdfRisanamento.ts` (+ test) — struttura dati PDF.
- Create: `utils/rapportini/pdfRisanamento.ts` — generatore PDF (jsPDF) + `nomeFilePdfRisanamento`.
- Modify: `components/modules/rapportini/risanamento/RisanamentoView.tsx` — bottone "Condividi PDF" post-invio.
- Modify: `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts` — Fonte C (foto righe).

---

## Task 1: Helper dati PDF (TDD)

**Files:** Create `utils/rapportini/datiPdfRisanamento.ts` + `utils/rapportini/datiPdfRisanamento.test.ts`

- [ ] **Step 1: Test che fallisce** — `utils/rapportini/datiPdfRisanamento.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { datiPdfRisanamento } from './datiPdfRisanamento';

const voci = [
  { id: 'v1', via: 'Via Roma 1', comune: 'Roma' },
  { id: 'v2', via: 'Via Po 2', comune: 'Roma' },
];
const righe = [
  { voce_id: 'v1', matricola: 'M2', pdr: 'P2', nominativo: 'Bianchi', ordine: 2 },
  { voce_id: 'v1', matricola: 'M1', pdr: 'P1', nominativo: 'Rossi', ordine: 1 },
  { voce_id: 'v2', matricola: 'M3', pdr: 'P3', nominativo: 'Verdi', ordine: 1 },
];

describe('datiPdfRisanamento', () => {
  it('raggruppa per civico e ordina i misuratori per ordine', () => {
    const d = datiPdfRisanamento(voci as never, righe as never);
    expect(d.civici).toHaveLength(2);
    expect(d.civici[0].via).toBe('Via Roma 1');
    expect(d.civici[0].misuratori.map((m) => m.matricola)).toEqual(['M1', 'M2']);
    expect(d.civici[1].misuratori.map((m) => m.matricola)).toEqual(['M3']);
  });
  it('calcola i totali (punti gas = righe)', () => {
    const d = datiPdfRisanamento(voci as never, righe as never);
    expect(d.totaleMisuratori).toBe(3);
    expect(d.totaleCivici).toBe(2);
  });
  it('civico senza righe → misuratori vuoti', () => {
    const d = datiPdfRisanamento(voci as never, [] as never);
    expect(d.totaleMisuratori).toBe(0);
    expect(d.civici[0].misuratori).toEqual([]);
  });
  it('campi nulli → stringhe vuote', () => {
    const d = datiPdfRisanamento([{ id: 'v1', via: null, comune: null }] as never, [{ voce_id: 'v1', matricola: null, pdr: null, nominativo: null, ordine: 1 }] as never);
    expect(d.civici[0].misuratori[0]).toEqual({ matricola: '', pdr: '', nominativo: '' });
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/datiPdfRisanamento.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `utils/rapportini/datiPdfRisanamento.ts`:
```ts
export type MisuratorePdf = { matricola: string; pdr: string; nominativo: string };
export type CivicoPdf = { via: string; comune: string; misuratori: MisuratorePdf[] };
export type DatiPdfRisanamento = { civici: CivicoPdf[]; totaleMisuratori: number; totaleCivici: number };

type VoceIn = { id: string; via?: string | null; comune?: string | null };
type RigaIn = { voce_id: string; matricola?: string | null; pdr?: string | null; nominativo?: string | null; ordine?: number | null };

/** Raggruppa le righe-misuratore per civico (voce), ordinate per `ordine`. Nessuna foto. */
export function datiPdfRisanamento(voci: VoceIn[], righe: RigaIn[]): DatiPdfRisanamento {
  const civici: CivicoPdf[] = voci.map((v) => {
    const misuratori = righe
      .filter((r) => r.voce_id === v.id)
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
      .map((r) => ({ matricola: r.matricola ?? '', pdr: r.pdr ?? '', nominativo: r.nominativo ?? '' }));
    return { via: v.via ?? '', comune: v.comune ?? '', misuratori };
  });
  return { civici, totaleMisuratori: righe.length, totaleCivici: voci.length };
}
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/datiPdfRisanamento.test.ts` → PASS (4/4).
- [ ] **Step 5: Lint** `npx eslint utils/rapportini/datiPdfRisanamento.ts utils/rapportini/datiPdfRisanamento.test.ts --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add utils/rapportini/datiPdfRisanamento.ts utils/rapportini/datiPdfRisanamento.test.ts
git commit -m "feat(risanamento): helper dati PDF (civici + misuratori + totali)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Generatore PDF (jsPDF)

**Files:** Create `utils/rapportini/pdfRisanamento.ts`

Ruba lo stile da `utils/rapportini/rapportinoPdf.ts` (stessi colori/font/footer). Portrait A4 (lista civici impilata).

- [ ] **Step 1: Implementa** — `utils/rapportini/pdfRisanamento.ts`:
```ts
import type { DatiPdfRisanamento } from './datiPdfRisanamento';

type RGB = [number, number, number];
const INK: RGB = [26, 35, 48];
const MUTED: RGB = [91, 103, 117];
const CYAN: RGB = [10, 143, 176];
const LINE: RGB = [227, 232, 238];
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
```

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "pdfRisanamento"` → vuoto.
- [ ] **Step 3: Lint** `npx eslint utils/rapportini/pdfRisanamento.ts --max-warnings=0` → vuoto.
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add utils/rapportini/pdfRisanamento.ts
git commit -m "feat(risanamento): generatore PDF riepilogo (jsPDF, stile standard)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Bottone "Condividi PDF" in RisanamentoView

**Files:** Modify `components/modules/rapportini/risanamento/RisanamentoView.tsx`

Leggi il file. Importa: `datiPdfRisanamento` da `@/utils/rapportini/datiPdfRisanamento`; `generaPdfRisanamentoBlob, nomeFilePdfRisanamento` da `@/utils/rapportini/pdfRisanamento`; `condividiOScarica` da `@/utils/rapportini/condividiFile`. Il componente ha `rapportino: { staff_name; data }`, `voci`, `righe`.

- [ ] **Step 1: Stato + handler.**
```tsx
  const [pdfBusy, setPdfBusy] = useState(false);
  const condividiPdf = async () => {
    setPdfBusy(true);
    try {
      const dati = datiPdfRisanamento(voci as never, righe as never);
      const blob = await generaPdfRisanamentoBlob(dati, { staffName: rapportino.staff_name, dataLabel: rapportino.data });
      await condividiOScarica({
        blob,
        filename: nomeFilePdfRisanamento(rapportino.staff_name, rapportino.data),
        title: 'Rapportino risanamento',
        text: `Rapportino risanamento ${rapportino.staff_name} ${rapportino.data}`,
      });
    } catch { setErrore('Generazione PDF fallita.'); } finally { setPdfBusy(false); }
  };
```

- [ ] **Step 2: Bottone nel banner "inviato".** Dove si mostra il banner "Rapportino inviato ✓" (5a), aggiungi sotto un bottone "Condividi PDF":
```tsx
  {inviato && (
    <div className="m-3 rounded-xl border border-[var(--success)] bg-[var(--success)]/10 p-4 text-center">
      <p className="mb-3 text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</p>
      <button type="button" onClick={condividiPdf} disabled={pdfBusy}
        className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pdfBusy ? 'Genero…' : '📄 Condividi PDF'}
      </button>
    </div>
  )}
```
(Sostituisci il banner "inviato" semplice della 5a con questa versione che include il bottone. Mantieni la stessa condizione `{inviato && ...}`.)

- [ ] **Step 3: Type-check** `npx tsc --noEmit 2>&1 | grep -i "RisanamentoView"` → vuoto.
- [ ] **Step 4: Lint** `npx eslint "components/modules/rapportini/risanamento/RisanamentoView.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 5: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/RisanamentoView.tsx"
git commit -m "feat(risanamento): bottone Condividi PDF post-invio (stesso flusso standard)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: ZIP foto esteso — Fonte C (righe-misuratore)

**Files:** Modify `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`

- [ ] **Step 1: Aggiungi la Fonte C** subito DOPO il blocco "Fonte B" (dopo la chiusura del `for` delle voci, prima di `// ── 4. Unisce le due fonti`):
```ts
  // ── 3-bis. Fonte C: foto delle righe-misuratore (risanamento), scope='misuratore' ─
  const fotoRighe: FotoZip[] = [];
  const campiMisuratore = campiFoto.filter((c) => ((c as { scope_foto?: string }).scope_foto ?? 'misuratore') === 'misuratore');
  if (campiMisuratore.length > 0) {
    const { data: righeRows } = await supabaseAdmin
      .from('rapportino_righe')
      .select('id, matricola, pdr, nominativo, risposte')
      .eq('rapportino_id', rapportinoId)
      .order('ordine', { ascending: true });
    for (const r of (righeRows ?? []) as Array<{ id: string; matricola: string | null; pdr: string | null; nominativo: string | null; risposte: Record<string, unknown> | null }>) {
      const ids = { pdr: r.pdr ?? undefined, matricola: r.matricola ?? undefined };
      for (const campo of campiMisuratore) {
        const storagePath = (r.risposte ?? {})[campo.chiave];
        if (typeof storagePath !== 'string' || !storagePath) continue;
        const ext = storagePath.split('.').pop() ?? 'jpg';
        fotoRighe.push({ richiesta_id: r.id, storage_path: storagePath, file_name: nomeFotoFile(campo.etichetta, ids, ext, fotoPriority) });
      }
    }
  }
```

- [ ] **Step 2: Includi la Fonte C nell'unione.** Cambia `const tutteLePhoto = [...fotoManuali, ...fotoVoci];` in:
```ts
  const tutteLePhoto = [...fotoManuali, ...fotoVoci, ...fotoRighe];
```

- [ ] **Step 3: Type-check** `npx tsc --noEmit 2>&1 | grep -i "foto-zip"` → vuoto.
- [ ] **Step 4: Lint** `npx eslint "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 5: Commit** (verifica branch)
```bash
git add "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts"
git commit -m "feat(risanamento): ZIP foto include le foto delle righe-misuratore (Fonte C)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verifica finale

- [ ] **Step 1:** `npx vitest run utils/rapportini/datiPdfRisanamento.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "pdfRisanamento|datiPdfRisanamento|RisanamentoView|foto-zip"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file nuovi → puliti.
- [ ] **Step 4:** `npm run build` → ok.
- [ ] **Step 5:** Riepilogo: 5b pronta → **progetto risanamento completo** (Fasi 1→5b). Verifica visiva PDF/ZIP con dati reali dopo le migration.

---

## Self-review (copertura spec 5b)
- PDF dati (helper) → Task 1 ✓
- PDF generatore (jsPDF, stile standard, portrait) → Task 2 ✓
- Trigger client (bottone post-invio, condividiOScarica, stesso flusso standard) → Task 3 ✓
- ZIP foto esteso (Fonte C righe-misuratore) → Task 4 ✓
- Confine (no foto nel PDF, no admin PDF) → rispettato ✓
- Standard non rotto: foto-zip Fonte C è vuota per rapportini standard (nessuna riga) → nessun effetto ✓

## Note tipi
- `datiPdfRisanamento(voci, righe)` → `{ civici:[{via,comune,misuratori:[{matricola,pdr,nominativo}]}], totaleMisuratori, totaleCivici }`.
- `generaPdfRisanamentoBlob(dati, { staffName, dataLabel })` → `Blob`; `nomeFilePdfRisanamento(staffName, dataIso)` → filename.
- `condividiOScarica({ blob, filename, title, text })` esistente (Web Share/download).
- Fonte C usa `FotoZip = { richiesta_id, storage_path, file_name }` + `nomeFotoFile` (già importati nel route).
