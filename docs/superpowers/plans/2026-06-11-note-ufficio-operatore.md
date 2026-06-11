# Note ufficio→operatore sulle righe del rapportino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'ufficio di allegare una nota (sola lettura per l'operatore) a una riga del rapportino, sia dalla modale manuale di pianificazione sia dall'import Excel, e mostrarla all'operatore.

**Architecture:** La nota è un campo `Task.note` impostato dall'ufficio (textarea nella `ManualTaskModal` o colonna "Note" nell'import Excel). Viaggia automaticamente in `raw_json.note` della voce via `taskToVoce`; l'operatore la legge da lì (nessuna colonna DB, nessuna SQL) e la vede come banner "Nota dall'ufficio" nel dettaglio + spia 📝 nella lista.

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest. Excel via libreria `xlsx`.

**Spec:** [docs/superpowers/specs/2026-06-11-note-ufficio-operatore-design.md](../specs/2026-06-11-note-ufficio-operatore-design.md)

**Nota verifica collisione (dalla spec):** `buildVoceManuale` mette in `raw_json` solo `{ _nuovo, coordinate? }` — **non** usa `note`. Quindi `raw_json.note` è libero e si usa direttamente (nessuna chiave namespaced).

---

## File Structure

| File | Responsabilità | Tipo |
|------|----------------|------|
| `utils/rapportini/notaUfficio.ts` | helper puro `notaUfficioFromRaw` (estrae la nota dal raw_json) | Create |
| `utils/rapportini/notaUfficio.test.ts` | test dell'helper | Create |
| `utils/routing/types.ts` | `Task.note?: string` | Modify |
| `utils/routing/excelParser.ts` | colonna Note nel formato a header leggibili | Modify |
| `utils/routing/excelParser.test.ts` | test del mapping colonna Note | Modify |
| `components/modules/mappa/ManualTaskModal.tsx` | campo `note` + `textarea` | Modify |
| `components/modules/mappa/MappaOperatoriClient.tsx` | `addManualTask` propaga `note` | Modify |
| `app/r/[token]/page.tsx` | mappa `raw_json.note` → `FormVoce.notaUfficio` | Modify |
| `components/modules/rapportini/RapportinoForm.tsx` | `Voce.notaUfficio`; passa a `VoceFocus` e alla riga lista | Modify |
| `components/modules/rapportini/VoceFocus.tsx` | prop `notaUfficio` → `VoceCard` | Modify |
| `components/modules/rapportini/VoceCard.tsx` | banner "Nota dall'ufficio" | Modify |
| `components/modules/rapportini/RapportinoLista.tsx` | `RigaVoce.nota` + spia 📝 | Modify |

---

### Task 1: Helper puro `notaUfficioFromRaw`

**Files:**
- Create: `utils/rapportini/notaUfficio.ts`
- Test: `utils/rapportini/notaUfficio.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/rapportini/notaUfficio.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { notaUfficioFromRaw } from './notaUfficio';

describe('notaUfficioFromRaw', () => {
  it('estrae la nota stringa dal raw_json', () => {
    expect(notaUfficioFromRaw({ note: 'Citofonare Rossi' })).toBe('Citofonare Rossi');
  });
  it('assente o raw null → undefined', () => {
    expect(notaUfficioFromRaw({})).toBeUndefined();
    expect(notaUfficioFromRaw(null)).toBeUndefined();
  });
  it('stringa vuota o solo spazi → undefined', () => {
    expect(notaUfficioFromRaw({ note: '' })).toBeUndefined();
    expect(notaUfficioFromRaw({ note: '   ' })).toBeUndefined();
  });
  it('tipo non stringa → undefined', () => {
    expect(notaUfficioFromRaw({ note: 123 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/notaUfficio.test.ts`
Expected: FAIL — modulo `./notaUfficio` inesistente (import error).

- [ ] **Step 3: Implementa l'helper**

Crea `utils/rapportini/notaUfficio.ts`:

```typescript
/**
 * Estrae la nota dell'ufficio dal raw_json di una voce. La nota viaggia come `raw_json.note`
 * (proveniente da `Task.note`). Ritorna undefined se assente, non stringa o stringa vuota.
 */
export function notaUfficioFromRaw(raw: unknown): string | undefined {
  const n = (raw as { note?: unknown } | null)?.note;
  return typeof n === 'string' && n.trim() !== '' ? n : undefined;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/notaUfficio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/notaUfficio.ts utils/rapportini/notaUfficio.test.ts
git commit -m "feat(rapportini): notaUfficioFromRaw (estrae la nota ufficio dal raw_json)"
```

---

### Task 2: `Task.note` + colonna Note nell'import Excel

**Files:**
- Modify: `utils/routing/types.ts`
- Modify: `utils/routing/excelParser.ts`
- Test: `utils/routing/excelParser.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

In coda a `utils/routing/excelParser.test.ts` aggiungi:

```typescript
describe('detectFormat — colonna Note', () => {
  it('mappa una colonna "Note" (formato leggibile)', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune', 'Note']);
    expect(cm).not.toBeNull();
    expect(cm!.note).toBe(3);
  });
  it('riconosce anche "Nota" e "Annotazioni"', () => {
    expect(detectFormat(['Indirizzo', 'Nota'])!.note).toBe(1);
    expect(detectFormat(['Indirizzo', 'Annotazioni'])!.note).toBe(1);
  });
  it('senza colonna note → note null', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune']);
    expect(cm!.note).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `cm!.note` non esiste sul tipo `ColMap` (errore TS) / valore undefined.

- [ ] **Step 3: Aggiungi `note` al tipo `Task`**

In `utils/routing/types.ts`, dentro `interface Task`, subito dopo la riga `annullato?: boolean;` aggiungi:

```typescript
  /** Nota informativa dall'ufficio per l'operatore (sola lettura lato operatore). */
  note?: string;
```

- [ ] **Step 4: Aggiungi `note` al `ColMap` e alle tre mappature in `detectFormat`**

In `utils/routing/excelParser.ts`:

(a) Nel tipo `ColMap`, dopo `accessibilita: number | null;` aggiungi:

```typescript
  note: number | null;
```

(b) Nel ramo **ATTGIORN** (oggetto ritornato dopo `if (/^risorsa$/i.test(...))`), dopo `accessibilita: ATTGIORN_COL.ACCESSIBILITA,` aggiungi:

```typescript
      note: null,
```

(c) Nei **due** rami **Massiva** (entrambi gli oggetti `return { via: MASSIVA_COL.VIA, ... }`), dopo `accessibilita: null,` aggiungi in ciascuno:

```typescript
        note: null,
```

(d) Nel ramo **"Export Dati / Geocall"** (ultimo `return { via, ... }`), dopo `accessibilita: null,` aggiungi:

```typescript
    note: findCol(headers, [/^note$/, /^nota$/, /^annotazioni$/]),
```

- [ ] **Step 5: Valorizza `note` sul Task in `parseExcelToTasks`**

In `utils/routing/excelParser.ts`, dentro la costruzione del `task` (oggetto `const task: Task & { _operatore?: string } = { ... }`), dopo la riga `accessibilita: colMap.accessibilita != null ? str(row[colMap.accessibilita]) : undefined,` aggiungi:

```typescript
      note: colMap.note != null ? (str(row[colMap.note]) || undefined) : undefined,
```

- [ ] **Step 6: Esegui il test e verifica che passi**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS (tutti, inclusi i preesistenti).

- [ ] **Step 7: Commit**

```bash
git add utils/routing/types.ts utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(routing): Task.note + colonna Note nell'import Excel"
```

---

### Task 3: Campo Note nella modale ufficio

**Files:**
- Modify: `components/modules/mappa/ManualTaskModal.tsx`
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

Nota: componente client senza test unit; verifica manuale in Task 6.

- [ ] **Step 1: Aggiungi `note` a `ManualTaskData` e allo stato iniziale**

In `components/modules/mappa/ManualTaskModal.tsx`:

(a) Nel tipo `ManualTaskData`, dopo `staffId: string;` aggiungi:

```typescript
  note: string;
```

(b) Nello stato iniziale `useState<ManualTaskData>({ ... })`, aggiungi `note: ''` all'oggetto:

```typescript
    indirizzo: '', cap: '', citta: '', odl: '', pdr: '', matricola: '', attivita: '', fascia_oraria: '', nominativo: '', staffId: '', note: '',
```

- [ ] **Step 2: Estendi l'handler `set` per accettare anche la textarea**

In `ManualTaskModal.tsx`, sostituisci la definizione di `set`:

```typescript
  const set = (k: keyof ManualTaskData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }));
```

con:

```typescript
  const set = (k: keyof ManualTaskData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }));
```

- [ ] **Step 3: Aggiungi la textarea nella modale**

In `ManualTaskModal.tsx`, subito DOPO la `label` dell'Attività (quella con `value={d.attivita}`), aggiungi:

```tsx
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nota per l'operatore</span><textarea className={inputCls} rows={2} value={d.note} onChange={set('note')} placeholder="Es. citofonare Rossi, accesso dal retro…" /></label>
```

- [ ] **Step 4: Propaga `note` sul Task in `addManualTask`**

In `components/modules/mappa/MappaOperatoriClient.tsx`, dentro `addManualTask`, nell'oggetto `const task: Task & { _operatore?: string } = { ... }`, dopo `nominativo: data.nominativo.trim() || undefined,` aggiungi:

```typescript
      note: data.note.trim() || undefined,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore in `ManualTaskModal.tsx` / `MappaOperatoriClient.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/ManualTaskModal.tsx components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): campo Nota per l'operatore nella modale manuale di pianificazione"
```

---

### Task 4: Visualizzazione lato operatore (banner + spia)

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx`
- Modify: `app/r/[token]/page.tsx`
- Modify: `components/modules/rapportini/RapportinoLista.tsx`
- Modify: `components/modules/rapportini/VoceFocus.tsx`
- Modify: `components/modules/rapportini/VoceCard.tsx`

Nota: catena di rendering client; coperta dall'helper (Task 1) e verifica manuale (Task 6).

- [ ] **Step 1: Aggiungi `notaUfficio` al tipo `Voce`**

In `components/modules/rapportini/RapportinoForm.tsx`, nel tipo `export type Voce = { ... }`, dopo `coordinate?: string;` aggiungi:

```typescript
  notaUfficio?: string;
```

- [ ] **Step 2: Mappa la nota nella pagina operatore**

In `app/r/[token]/page.tsx`:

(a) Aggiungi l'import (vicino agli altri import in cima):

```typescript
import { notaUfficioFromRaw } from '@/utils/rapportini/notaUfficio';
```

(b) Nel `.map((v) => ({ ... }))` che costruisce `const voci: FormVoce[]`, dopo `coordinate: coordinateFromRaw(v.raw_json),` aggiungi:

```typescript
    notaUfficio: notaUfficioFromRaw(v.raw_json),
```

- [ ] **Step 3: Porta la nota nella riga della lista**

In `components/modules/rapportini/RapportinoForm.tsx`, nel costruttore di `righe` (l'oggetto ritornato dal `voci.map(...)`), aggiungi `nota: v.notaUfficio` prima di `badge:`:

```tsx
        return { index: idx, titolo, sub, attivita, fascia, stato: statoVoce(v.risposte, campi), nuovo: v.nuovo, annullato: v.annullato, nota: v.notaUfficio, badge: badgeVoceManuale(v.approvazione_stato ?? null) };
```

- [ ] **Step 4: Passa la nota a `VoceFocus`**

In `components/modules/rapportini/RapportinoForm.tsx`, nel render di `<VoceFocus ... />`, dopo `motivoRifiuto={voci[indiceCorrente].motivo_rifiuto ?? null}` aggiungi:

```tsx
          notaUfficio={voci[indiceCorrente].notaUfficio ?? null}
```

- [ ] **Step 5: `VoceFocus` accetta e inoltra `notaUfficio`**

In `components/modules/rapportini/VoceFocus.tsx`:

(a) Aggiungi la prop alla firma destrutturata e al tipo. Cambia:

```tsx
  voce, indice, totale, campi, dettaglio, titoloCampi, disabilitato, stato, saveState,
  onChange, onPrev, onNext, onClose, approvazioneStato, motivoRifiuto,
}: {
```

in:

```tsx
  voce, indice, totale, campi, dettaglio, titoloCampi, disabilitato, stato, saveState,
  onChange, onPrev, onNext, onClose, approvazioneStato, motivoRifiuto, notaUfficio,
}: {
```

(b) Nel blocco dei tipi delle prop, dopo `motivoRifiuto?: string | null;` aggiungi:

```tsx
  notaUfficio?: string | null;
```

(c) Nel render di `<VoceCard ... />`, dopo `motivoRifiuto={motivoRifiuto}` aggiungi:

```tsx
          notaUfficio={notaUfficio}
```

- [ ] **Step 6: `VoceCard` accetta `notaUfficio` e rende il banner**

In `components/modules/rapportini/VoceCard.tsx`:

(a) Aggiungi la prop alla firma destrutturata e al tipo. Cambia:

```tsx
  voce, indice, campi, dettaglio, titoloCampi, stato, disabilitato, onChange,
  headerRight, approvazioneStato, motivoRifiuto,
}: {
```

in:

```tsx
  voce, indice, campi, dettaglio, titoloCampi, stato, disabilitato, onChange,
  headerRight, approvazioneStato, motivoRifiuto, notaUfficio,
}: {
```

(b) Nel blocco dei tipi delle prop, dopo `motivoRifiuto?: string | null;` aggiungi:

```tsx
  notaUfficio?: string | null;
```

(c) Nel JSX, subito DOPO `<VoceHeaderInfo voce={voce} coordinataAbilitata={coordinataAbilitata} />` aggiungi:

```tsx
      {notaUfficio && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3.5 py-2.5">
          <span aria-hidden className="text-base leading-none">📝</span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Nota dall&apos;ufficio</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[var(--brand-text-main)]">{notaUfficio}</p>
          </div>
        </div>
      )}
```

- [ ] **Step 7: `RapportinoLista` — `RigaVoce.nota` + spia 📝**

In `components/modules/rapportini/RapportinoLista.tsx`:

(a) Nel tipo `export type RigaVoce = { ... }`, aggiungi `nota?: string;` prima di `badge?:`:

```typescript
export type RigaVoce = { index: number; titolo: string; sub: string; attivita?: string; fascia?: string; stato: StatoVoce; nuovo?: boolean; annullato?: boolean; nota?: string; badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null };
```

(b) In `RigaVoceCard`, dentro la riga `<span className="flex min-w-0 items-center gap-1.5">`, subito DOPO il blocco `{r.badge && ( ... )}` e PRIMA dello `<span>` del titolo (`{r.titolo}`), aggiungi:

```tsx
          {r.nota && (
            <span title="Nota dall'ufficio" aria-label="Nota dall'ufficio" className="shrink-0 text-[13px] leading-none">📝</span>
          )}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore nei file toccati.

- [ ] **Step 9: Commit**

```bash
git add app/r components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx components/modules/rapportini/VoceCard.tsx components/modules/rapportini/RapportinoLista.tsx
git commit -m "feat(rapportini): banner 'Nota dall'ufficio' nel dettaglio + spia nella lista"
```

---

### Task 5: Suite di test completa + lint

**Files:** nessuna modifica — solo esecuzione.

- [ ] **Step 1: Esegui l'intera suite Vitest**

Run: `npx vitest run`
Expected: PASS. In particolare verdi `utils/rapportini/notaUfficio.test.ts` e `utils/routing/excelParser.test.ts`.

- [ ] **Step 2: Typecheck globale**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore introdotto dai file della feature.

- [ ] **Step 3: Lint sui file toccati**

Run: `npx eslint utils/rapportini/notaUfficio.ts utils/routing/excelParser.ts utils/routing/types.ts components/modules/mappa/ManualTaskModal.tsx components/modules/mappa/MappaOperatoriClient.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx components/modules/rapportini/VoceCard.tsx components/modules/rapportini/RapportinoLista.tsx`
Expected: nessun nuovo problema dai file modificati (la baseline del repo è già rossa — confronta solo le righe toccate).

- [ ] **Step 4: Se qualcosa fallisce, correggi prima di proseguire**

Diagnostica e correggi (non aggirare). Ri-esegui fino al verde. Commit della correzione se necessario.

---

### Task 6: Verifica manuale (smoke) e chiusura

**Files:** nessuna modifica — verifica in app reale.

- [ ] **Step 1: Avvia l'app**

Run: `npm run dev` → apri `/hub/mappa` (vista *Pianifica indirizzi*) con un piano attivo.

- [ ] **Step 2: Nota da modale manuale**

Apri "Aggiungi intervento manuale", compila indirizzo/comune e scrivi una **Nota per l'operatore** → Aggiungi → **Salva distribuzione**. Apri il link rapportino dell'operatore: nella lista la riga ha la spia 📝; aprendo l'intervento compare il banner "Nota dall'ufficio" con il testo.

- [ ] **Step 3: Nota da import Excel**

Prepara un .xlsx (formato a header leggibili) con una colonna **Note** valorizzata su qualche riga, importalo per aggiungere attività al piano → Salva. Verifica che l'operatore veda la nota (spia + banner) solo sulle righe con testo.

- [ ] **Step 4: Sola lettura + assenza nota**

Verifica che l'operatore non possa modificare la nota (è solo testo nel banner) e che le righe senza nota non mostrino né spia né banner.

- [ ] **Step 5: Chiusura branch**

Invoca la skill `superpowers:finishing-a-development-branch` per decidere merge/PR del branch `feat/note-ufficio-operatore`.

---

## Self-Review (compilata)

- **Copertura spec:** input modale ufficio (Task 3) ✓; input colonna Excel (Task 2) ✓; propagazione `raw_json.note` (Task 1 helper + `Task.note` Task 2 + `taskToVoce` esistente) ✓; banner dettaglio (Task 4, VoceCard) ✓; spia lista (Task 4, RapportinoLista) ✓; sola lettura (banner è solo display) ✓; scope solo all'aggiunta (nessuna UI di edit su righe esistenti) ✓; nessuna SQL ✓; collisione chiave risolta (`raw_json.note` libero, verificato `buildVoceManuale`) ✓.
- **Placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto.
- **Coerenza tipi:** `notaUfficioFromRaw(raw): string|undefined` / `Task.note?: string` / `ColMap.note: number|null` / `Voce.notaUfficio?: string` (= `FormVoce`) / `RigaVoce.nota?: string` / prop `notaUfficio?: string|null` su `VoceFocus` e `VoceCard` — coerenti tra i task. Il banner usa `notaUfficio` come prop esplicita (non `valoreInfo`), così l'anteprima template che riusa `VoceCard` resta invariata (prop opzionale → nessun banner).

---

## Execution Handoff

Vedi sotto per la scelta del metodo di esecuzione.
