# Banda blu dinamica nei rapportini Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La banda "INTERVENTI CON NOTE" (merge `A35:Q35` del template `Rapportino.xlsx`) non è più a riga fissa 35: scende automaticamente sotto l'ultimo intervento quando gli interventi superano i 28 slot, così nessun intervento finisce nascosto dentro la banda. Vale per tutti e 4 i generatori Excel che usano quel template.

**Architecture:** Un helper condiviso `lib/rapportini/bandaRapportino.ts` con (1) una funzione PURA `rigaBanda(n)` per la posizione, e (2) due funzioni su `ExcelJS.Worksheet` — `catturaStili(ws)` (chiamata subito dopo il clone del template, prima di scrivere i dati) e `posizionaBanda(ws, dataCount, stili)` (chiamata dopo aver scritto i dati: se c'è overflow smonta il merge `A35:Q35`, ridà stile-dati alle righe sforate e ridisegna la banda merged subito sotto l'ultimo intervento). I 4 generatori chiamano l'helper.

**Tech Stack:** TypeScript, `exceljs` (già dipendenza), Vitest (unit + integration leggendo il template reale da `public/templates/Rapportino.xlsx`).

## Global Constraints

- **Nessuna SQL, nessuna modifica al file template** `public/templates/Rapportino.xlsx` (la banda resta nel template a riga 35; la si riposiziona a runtime).
- **Policy posizione banda:** resta a riga 35 finché gli interventi ci stanno (`dataCount ≤ 28`), poi subito sotto l'ultimo intervento. Formula: `rigaBanda(n) = Math.max(35, 7 + n)`.
- **clientela esporta TUTTI gli interventi:** rimuovere il cap `.slice(0, 33)`.
- Layout template (invariato): header a riga 6, dati da riga 7, banda a riga 35 (`A35:Q35` merged, valore "INTERVENTI CON NOTE"), colonne A..Q (1..17).
- L'helper NON deve importare `server-only` (lo usano sia componenti client sia codice server).
- Baseline lint/test del repo è già rossa per motivi preesistenti: il gate è "nessun nuovo problema dai file del WP" (verifica mirata con `npx eslint <file>` / `npx vitest run <file>`).

---

### Task 1: Helper condiviso `bandaRapportino.ts`

Cuore del fix: posizione pura testabile + manipolazione exceljs della banda. Comprende sia gli unit test (funzione pura) sia un integration test che carica il template reale.

**Files:**
- Create: `lib/rapportini/bandaRapportino.ts`
- Test: `lib/rapportini/bandaRapportino.test.ts`

**Interfaces:**
- Produces:
  - `rigaBanda(dataCount: number): number`
  - `catturaStili(ws: ExcelJS.Worksheet): StiliRapportino` dove `StiliRapportino = { banda: ExcelJS.Style[]; dati: ExcelJS.Style[] }`
  - `posizionaBanda(ws: ExcelJS.Worksheet, dataCount: number, stili: StiliRapportino): { bandRow: number; primaNota: number }`
  - costanti `HEADER_ROW=6`, `DATA_START_ROW=7`, `TEMPLATE_BAND_ROW=35`, `BAND_LABEL='INTERVENTI CON NOTE'`, `LAST_COL=17`

- [ ] **Step 1: Scrivi gli unit test della funzione pura**

`lib/rapportini/bandaRapportino.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rigaBanda } from './bandaRapportino';

describe('rigaBanda', () => {
  it('resta a 35 quando i dati ci stanno (≤28)', () => {
    expect(rigaBanda(0)).toBe(35);
    expect(rigaBanda(1)).toBe(35);
    expect(rigaBanda(28)).toBe(35); // righe 7..34 = 28 interventi
  });
  it('scende subito sotto l\'ultimo intervento in overflow (>28)', () => {
    expect(rigaBanda(29)).toBe(36); // 7+29
    expect(rigaBanda(35)).toBe(42);
    expect(rigaBanda(50)).toBe(57);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npx vitest run lib/rapportini/bandaRapportino.test.ts`
Expected: FAIL — `Failed to resolve import "./bandaRapportino"`.

- [ ] **Step 3: Implementa l'helper**

`lib/rapportini/bandaRapportino.ts`:
```ts
import type ExcelJS from 'exceljs';

export const HEADER_ROW = 6;
export const DATA_START_ROW = 7;
export const TEMPLATE_BAND_ROW = 35;
export const BAND_LABEL = 'INTERVENTI CON NOTE';
export const LAST_COL = 17; // colonna Q

/**
 * Riga in cui posizionare la banda "INTERVENTI CON NOTE" dato il numero di
 * interventi scritti a partire dalla riga 7. Policy: resta alla riga 35 del
 * template finché gli interventi ci stanno (≤ 28), poi subito sotto l'ultimo.
 */
export function rigaBanda(dataCount: number): number {
  return Math.max(TEMPLATE_BAND_ROW, DATA_START_ROW + dataCount);
}

export interface StiliRapportino {
  banda: ExcelJS.Style[]; // stili A..Q della banda (riga 35 del template)
  dati: ExcelJS.Style[];  // stili A..Q di una riga dati (riga 7 del template)
}

function clonaStile(s: Partial<ExcelJS.Style> | undefined): ExcelJS.Style {
  return JSON.parse(JSON.stringify(s ?? {})) as ExcelJS.Style;
}

/**
 * Cattura gli stili della banda (riga 35) e di una riga dati (riga 7) dal foglio
 * appena clonato dal template, PRIMA che i dati vengano scritti (in overflow la
 * riga 35 verrebbe sovrascritta dagli interventi, perdendo lo stile della banda).
 */
export function catturaStili(ws: ExcelJS.Worksheet): StiliRapportino {
  const banda: ExcelJS.Style[] = [];
  const dati: ExcelJS.Style[] = [];
  for (let c = 1; c <= LAST_COL; c++) {
    banda.push(clonaStile(ws.getRow(TEMPLATE_BAND_ROW).getCell(c).style));
    dati.push(clonaStile(ws.getRow(DATA_START_ROW).getCell(c).style));
  }
  return { banda, dati };
}

/**
 * Posiziona la banda sotto gli interventi scritti.
 * - dataCount ≤ 28: la banda resta alla riga 35 del template (nessuna modifica).
 * - dataCount > 28: smonta il merge A35:Q35, ridà stile-dati alle righe 35..(6+dataCount)
 *   che ora contengono interventi (ripulendo l'eventuale testo "INTERVENTI CON NOTE"
 *   residuo nelle celle non scritte), e ridisegna la banda (merge A..Q + stile + label)
 *   alla prima riga libera dopo i dati.
 * Ritorna la riga della banda e la prima riga utile per le note.
 */
export function posizionaBanda(
  ws: ExcelJS.Worksheet,
  dataCount: number,
  stili: StiliRapportino,
): { bandRow: number; primaNota: number } {
  const bandRow = rigaBanda(dataCount);
  if (bandRow === TEMPLATE_BAND_ROW) {
    return { bandRow, primaNota: TEMPLATE_BAND_ROW + 1 };
  }
  // Overflow: la banda del template (riga 35) è coperta dai dati. Smontala e ricostruiscila sotto.
  try { ws.unMergeCells(`A${TEMPLATE_BAND_ROW}:Q${TEMPLATE_BAND_ROW}`); } catch { /* non mergiata: ok */ }
  const ultimaRigaDati = HEADER_ROW + dataCount; // 6 + dataCount
  for (let r = TEMPLATE_BAND_ROW; r <= ultimaRigaDati; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      if (typeof cell.value === 'string' && cell.value === BAND_LABEL) cell.value = null;
      cell.style = clonaStile(stili.dati[c - 1]);
    }
    row.commit();
  }
  const banda = ws.getRow(bandRow);
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = banda.getCell(c);
    cell.value = c === 1 ? BAND_LABEL : null;
    cell.style = clonaStile(stili.banda[c - 1]);
  }
  banda.commit();
  ws.mergeCells(`A${bandRow}:Q${bandRow}`);
  return { bandRow, primaNota: bandRow + 1 };
}
```

- [ ] **Step 4: Esegui gli unit test e verifica che passino**

Run: `npx vitest run lib/rapportini/bandaRapportino.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Aggiungi l'integration test sul template reale**

Appendi a `lib/rapportini/bandaRapportino.test.ts`:
```ts
import path from 'path';
import { readFileSync } from 'fs';
import ExcelJS from 'exceljs';
import { catturaStili, posizionaBanda, BAND_LABEL } from './bandaRapportino';

async function caricaTemplate(): Promise<ExcelJS.Worksheet> {
  const file = path.join(process.cwd(), 'public', 'templates', 'Rapportino.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

function mergeAttiva(ws: ExcelJS.Worksheet, range: string): boolean {
  const merges: string[] = ((ws as unknown as { model?: { merges?: string[] } }).model?.merges) ?? [];
  return merges.includes(range);
}

describe('posizionaBanda (integration, template reale)', () => {
  it('≤28 interventi: la banda resta a riga 35, merge intatto', async () => {
    const ws = await caricaTemplate();
    const stili = catturaStili(ws);
    for (let i = 0; i < 20; i++) ws.getCell(`A${7 + i}`).value = `Op ${i}`; // 20 interventi
    const { bandRow, primaNota } = posizionaBanda(ws, 20, stili);
    expect(bandRow).toBe(35);
    expect(primaNota).toBe(36);
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(true);
    expect(ws.getCell('A35').value).toBe(BAND_LABEL);
  });

  it('35 interventi: banda a riga 42, i dati su riga 35 restano visibili (no merge sopra)', async () => {
    const ws = await caricaTemplate();
    const stili = catturaStili(ws);
    for (let i = 0; i < 35; i++) ws.getCell(`A${7 + i}`).value = `Op ${i}`; // righe 7..41
    const { bandRow, primaNota } = posizionaBanda(ws, 35, stili);
    expect(bandRow).toBe(42);
    expect(primaNota).toBe(43);
    // la vecchia banda non c'è più a 35, e quella riga ora mostra il dato
    expect(mergeAttiva(ws, 'A35:Q35')).toBe(false);
    expect(ws.getCell('A35').value).toBe('Op 28'); // 7+28 = riga 35
    // la banda è ricostruita sotto, mergiata
    expect(mergeAttiva(ws, 'A42:Q42')).toBe(true);
    expect(ws.getCell('A42').value).toBe(BAND_LABEL);
    // nessuna cella della vecchia area banda conserva il testo banda residuo
    expect(ws.getCell('Q35').value).not.toBe(BAND_LABEL);
  });
});
```

- [ ] **Step 6: Esegui tutti i test del file e verifica che passino**

Run: `npx vitest run lib/rapportini/bandaRapportino.test.ts`
Expected: PASS (4 test). Se l'integration test non trova il template, verifica che `process.cwd()` sia la root del worktree.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint lib/rapportini/bandaRapportino.ts lib/rapportini/bandaRapportino.test.ts`
Expected: nessun errore su questi file.

```bash
git add lib/rapportini/bandaRapportino.ts lib/rapportini/bandaRapportino.test.ts
git commit -m "feat(rapportini): helper banda dinamica (rigaBanda + catturaStili + posizionaBanda) + test"
```

---

### Task 2: Applica al rapportino "massiva" (con note)

**Files:**
- Modify: `app/hub/rapportini/massiva/page.tsx` (zona export, righe ~676 e ~737–760)

**Interfaces:**
- Consumes: `catturaStili`, `posizionaBanda`, `DATA_START_ROW` da `@/lib/rapportini/bandaRapportino`.

- [ ] **Step 1: Aggiungi l'import**

In cima a `app/hub/rapportini/massiva/page.tsx`, accanto agli altri import, aggiungi:
```ts
import { catturaStili, posizionaBanda, DATA_START_ROW } from '@/lib/rapportini/bandaRapportino';
```

- [ ] **Step 2: Cattura gli stili subito dopo il clone**

Trova (riga ~676):
```ts
const ws = cloneFromTemplate(base, opName, tplWb);
```
Sostituisci con:
```ts
const ws = cloneFromTemplate(base, opName, tplWb);
const stiliBanda = catturaStili(ws);
```

- [ ] **Step 3: Posiziona banda + note in modo dinamico**

Trova il blocco (righe ~737–760):
```ts
// --- NOTE in fondo, righe 36+ (riga 35 = "INTERVENTI CON NOTE" dal template) ---
const NOTE_START = 36;
const NOTE_END   = 41;
const maxNotes = Math.min(notes.length, NOTE_END - NOTE_START + 1);
for (let i = 0; i < maxNotes; i++) {
  const rr = NOTE_START + i;
  ws.getCell(`A${rr}`).value = notes[i].nom;
  ws.getCell(`B${rr}`).value = notes[i].via;
  ws.getCell(`C${rr}`).value = notes[i].note;
}
for (let r = NOTE_START; r <= NOTE_END; r++) {
  for (const c of ['A','B','C'] as const) {
    ws.getCell(`${c}${r}`).border = {
      top: {style:'thin'}, left:{style:'thin'},
      bottom:{style:'thin'}, right:{style:'thin'},
    };
  }
}
```
Sostituiscilo con:
```ts
// --- Banda "INTERVENTI CON NOTE" + NOTE in fondo, posizione DINAMICA ---
const nInterventi = rowIdx - DATA_START_ROW;
const { primaNota } = posizionaBanda(ws, nInterventi, stiliBanda);
const NOTE_START = primaNota;
const NOTE_END   = primaNota + 5; // 6 righe note (invariato)
const maxNotes = Math.min(notes.length, NOTE_END - NOTE_START + 1);
for (let i = 0; i < maxNotes; i++) {
  const rr = NOTE_START + i;
  ws.getCell(`A${rr}`).value = notes[i].nom;
  ws.getCell(`B${rr}`).value = notes[i].via;
  ws.getCell(`C${rr}`).value = notes[i].note;
}
for (let r = NOTE_START; r <= NOTE_END; r++) {
  for (const c of ['A','B','C'] as const) {
    ws.getCell(`${c}${r}`).border = {
      top: {style:'thin'}, left:{style:'thin'},
      bottom:{style:'thin'}, right:{style:'thin'},
    };
  }
}
```
La riga `(ws as any).pageSetup.printArea = ` `A1:Q${NOTE_END}` ;` subito sotto resta invariata: ora `NOTE_END` è dinamico, quindi l'area di stampa si estende da sola.

- [ ] **Step 4: Lint + typecheck mirati**

Run: `npx eslint "app/hub/rapportini/massiva/page.tsx"`
Expected: nessun errore su questo file.
Run: `npx tsc --noEmit` → nessun **nuovo** errore che citi `massiva/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "app/hub/rapportini/massiva/page.tsx"
git commit -m "fix(rapportini): banda dinamica nel rapportino massiva (no interventi nascosti)"
```

---

### Task 3: Applica al rapportino "clientela" (togli il cap + banda)

**Files:**
- Modify: `app/hub/rapportini/clientela/page.tsx` (righe ~180, ~195–197, dopo ~232)

**Interfaces:**
- Consumes: `catturaStili`, `posizionaBanda`, `DATA_START_ROW` da `@/lib/rapportini/bandaRapportino`.

- [ ] **Step 1: Aggiungi l'import**

In cima a `app/hub/rapportini/clientela/page.tsx`:
```ts
import { catturaStili, posizionaBanda, DATA_START_ROW } from '@/lib/rapportini/bandaRapportino';
```

- [ ] **Step 2: Cattura gli stili dopo il clone**

Trova (riga ~180):
```ts
const ws = cloneFromTemplate(base, opName, tplWb);
```
Sostituisci con:
```ts
const ws = cloneFromTemplate(base, opName, tplWb);
const stiliBanda = catturaStili(ws);
```

- [ ] **Step 3: Togli il cap a 33**

Trova (righe ~195–197):
```ts
const sorted = rowsForOp
  .slice(0, 33)
  .sort((a,b) => hhmmToMin(onlyHHMM(a[COL.U_ORA])) - hhmmToMin(onlyHHMM(b[COL.U_ORA])));
```
Sostituisci con (rimosso `.slice(0, 33)`):
```ts
const sorted = rowsForOp
  .slice()
  .sort((a,b) => hhmmToMin(onlyHHMM(a[COL.U_ORA])) - hhmmToMin(onlyHHMM(b[COL.U_ORA])));
```

- [ ] **Step 4: Posiziona la banda dopo il loop dati**

Trova la fine del loop dati (riga ~230–232):
```ts
  rr.commit();
  rowIdx++;
}
```
Subito DOPO la `}` di chiusura del `for`, aggiungi:
```ts

// Banda "INTERVENTI CON NOTE" dinamica: scende sotto l'ultimo intervento in overflow.
posizionaBanda(ws, rowIdx - DATA_START_ROW, stiliBanda);
```

- [ ] **Step 5: Lint + typecheck mirati**

Run: `npx eslint "app/hub/rapportini/clientela/page.tsx"`
Expected: nessun errore su questo file.
Run: `npx tsc --noEmit` → nessun **nuovo** errore che citi `clientela/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "app/hub/rapportini/clientela/page.tsx"
git commit -m "fix(rapportini): clientela esporta tutti gli interventi + banda dinamica"
```

---

### Task 4: Applica all'export mappa (`MappaOperatoriClient`)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` (riga ~2324, dopo ~2374)

**Interfaces:**
- Consumes: `catturaStili`, `posizionaBanda` da `@/lib/rapportini/bandaRapportino`.

- [ ] **Step 1: Aggiungi l'import**

In cima a `components/modules/mappa/MappaOperatoriClient.tsx`:
```ts
import { catturaStili, posizionaBanda } from '@/lib/rapportini/bandaRapportino';
```

- [ ] **Step 2: Cattura gli stili dopo il clone**

Trova (riga ~2324):
```ts
const ws = cloneFromTemplate(base, sheetName, tplWb);
```
Sostituisci con:
```ts
const ws = cloneFromTemplate(base, sheetName, tplWb);
const stiliBanda = catturaStili(ws);
```

- [ ] **Step 3: Posiziona la banda dopo il loop dati**

Trova la fine del `sorted.forEach(...)` che scrive le righe (riga ~2374):
```ts
          rr.commit();
        });
```
Subito DOPO `});`, aggiungi:
```ts

        // Banda "INTERVENTI CON NOTE" dinamica: scende sotto l'ultimo intervento in overflow.
        posizionaBanda(ws, sorted.length, stiliBanda);
```

- [ ] **Step 4: Lint + typecheck mirati**

Run: `npx eslint "components/modules/mappa/MappaOperatoriClient.tsx"`
Expected: nessun errore su questo file.
Run: `npx tsc --noEmit` → nessun **nuovo** errore che citi `MappaOperatoriClient.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "components/modules/mappa/MappaOperatoriClient.tsx"
git commit -m "fix(rapportini): banda dinamica nell'export mappa (no interventi nascosti)"
```

---

### Task 5: Applica all'export standard server-side (`exportStandard.ts`)

**Files:**
- Modify: `lib/rapportini/exportStandard.ts` (riga ~85, dopo ~141)

**Interfaces:**
- Consumes: `catturaStili`, `posizionaBanda` da `./bandaRapportino`.

- [ ] **Step 1: Aggiungi l'import**

In `lib/rapportini/exportStandard.ts`, dopo gli import esistenti:
```ts
import { catturaStili, posizionaBanda } from './bandaRapportino';
```

- [ ] **Step 2: Cattura gli stili dopo aver preso il foglio**

Trova (righe ~85–86):
```ts
const ws = wb.worksheets[0];
if (!ws) throw new Error('Foglio template non valido in Rapportino.xlsx.');
```
Sostituisci con:
```ts
const ws = wb.worksheets[0];
if (!ws) throw new Error('Foglio template non valido in Rapportino.xlsx.');
const stiliBanda = catturaStili(ws);
```

- [ ] **Step 3: Posiziona la banda dopo il loop voci**

Trova la fine del loop voci (riga ~139–141):
```ts
    rr.commit();
    rowIdx++;
  }
```
Subito DOPO la `}` di chiusura del `for (const v of ordered)`, aggiungi:
```ts

  // Banda "INTERVENTI CON NOTE" dinamica: scende sotto l'ultima voce in overflow.
  posizionaBanda(ws, rowIdx - DATA_START_ROW, stiliBanda);
```
(`DATA_START_ROW` è già definito come costante locale `= 7` in questo file: non serve importarlo.)

- [ ] **Step 4: Lint + typecheck mirati**

Run: `npx eslint lib/rapportini/exportStandard.ts`
Expected: nessun errore su questo file.
Run: `npx tsc --noEmit` → nessun **nuovo** errore che citi `exportStandard.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/rapportini/exportStandard.ts
git commit -m "fix(rapportini): banda dinamica nell'export standard server-side"
```

---

### Task 6: Verifica finale

**Files:** nessuno (sola verifica).

- [ ] **Step 1: Suite dell'helper verde**

Run: `npx vitest run lib/rapportini/bandaRapportino.test.ts`
Expected: 4 test PASS.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata; nessun errore sui 5 file toccati (`bandaRapportino.ts`, `massiva/page.tsx`, `clientela/page.tsx`, `MappaOperatoriClient.tsx`, `exportStandard.ts`). Eventuali errori preesistenti altrove (baseline) non riguardano questo WP.

- [ ] **Step 3: Smoke manuale (consigliato, sul deploy o in locale)**

Genera un rapportino con **> 28 interventi** (es. 35) da: massiva, clientela, export mappa, e l'export standard di un rapportino compilato. Verifica in ognuno che:
1. Tutti gli interventi siano visibili (nessuno sparito o nascosto).
2. La banda "INTERVENTI CON NOTE" sia **sotto** l'ultimo intervento (non più a riga 35).
3. Con ≤ 28 interventi l'aspetto sia identico a prima (banda a riga 35).
4. In massiva le note siano sotto la banda.

- [ ] **Step 4: Niente commit** (task di sola verifica).

---

## Note di chiusura (per chi esegue)

- **DRY:** la logica della banda vive solo in `bandaRapportino.ts`; i 4 generatori la chiamano. Non duplicare la posizione/lo stile nei singoli file.
- **`cloneFromTemplate` resta duplicato** nei 3 file client (fuori scope ricomporlo qui).
- A fine feature: merge/push secondo il metodo (worktree già su `origin/main`).
