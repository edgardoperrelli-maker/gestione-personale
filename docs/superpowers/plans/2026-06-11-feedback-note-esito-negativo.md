# Feedback note obbligatorie con esito negativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'operatore feedback chiaro quando l'esito è negativo: avviso immediato + nota evidenziata nel dettaglio, e una lista cliccabile di "cosa manca" sopra il pulsante Invia.

**Architecture:** Riusa l'unica fonte di verità `voceColore`. Estrae un helper puro `esitoNegativoPresente` (riuso interno, comportamento di `voceEsitoColore` invariato) e ne deriva `motivoVoceIncompleta` → `'senza_esito' | 'nota_mancante' | null`. La UI consuma questi helper: banner + nota evidenziata in `VoceCard`, lista cliccabile in `RapportinoLista`. Nessuna nuova validazione, nessuna SQL.

**Tech Stack:** Next.js (client components), React, TypeScript, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-11-feedback-note-esito-negativo-design.md](../specs/2026-06-11-feedback-note-esito-negativo-design.md)

**Workspace:** worktree isolato `.claude/worktrees/feedback-note-esito`, branch `feat/feedback-note-esito-negativo` (base `origin/main`). I path sotto sono relativi alla radice del repo (= radice del worktree). I test si lanciano dal checkout principale puntando ai file del worktree (es. `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceMancante.test.ts`), perché il worktree non ha `node_modules` propri.

---

## File Structure

| File | Responsabilità | Tipo |
|------|----------------|------|
| `utils/rapportini/voceColore.ts` | esporta `esitoNegativoPresente` + `isCampoNota`; `voceEsitoColore` li riusa (comportamento invariato) | Modify |
| `utils/rapportini/voceColore.test.ts` | test nuovi helper + regressione | Modify |
| `utils/rapportini/voceMancante.ts` | nuovo: `motivoVoceIncompleta` + tipo `MotivoIncompleto` | Create |
| `utils/rapportini/voceMancante.test.ts` | test | Create |
| `components/modules/rapportini/CampoInput.tsx` | prop `evidenzia` → bordo rosso sul textarea | Modify |
| `components/modules/rapportini/VoceCard.tsx` | banner "nota obbligatoria" + evidenzia il campo nota | Modify |
| `components/modules/rapportini/RapportinoForm.tsx` | calcola `mancanti`, lo passa a `RapportinoLista` | Modify |
| `components/modules/rapportini/RapportinoLista.tsx` | prop `mancanti` + lista cliccabile sopra l'invio | Modify |

---

### Task 1: `esitoNegativoPresente` + `isCampoNota` (refactor `voceColore`)

**Files:**
- Modify: `utils/rapportini/voceColore.ts`
- Test: `utils/rapportini/voceColore.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `utils/rapportini/voceColore.test.ts`, aggiorna l'import in cima:

```typescript
import { voceEsitoColore, esitoNegativoPresente, isCampoNota } from './voceColore';
```

E aggiungi in fondo al file:

```typescript
describe('esitoNegativoPresente', () => {
  it('crocetta negativa (ASSENTE) spuntata → true', () => {
    expect(esitoNegativoPresente({ assente: true }, standard)).toBe(true);
  });
  it('solo crocetta positiva → false', () => {
    expect(esitoNegativoPresente({ att_cess: true }, standard)).toBe(false);
  });
  it('niente compilato → false', () => {
    expect(esitoNegativoPresente({}, standard)).toBe(false);
  });
  it('select NO → true; select SI → false', () => {
    expect(esitoNegativoPresente({ eseguito: 'NO' }, eseguito)).toBe(true);
    expect(esitoNegativoPresente({ eseguito: 'SI' }, eseguito)).toBe(false);
  });
});

describe('isCampoNota', () => {
  it('campo testo che inizia per "note" → true', () => {
    expect(isCampoNota({ chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 })).toBe(true);
  });
  it('campo testo non-note → false', () => {
    expect(isCampoNota({ chiave: 'descr', etichetta: 'Descrizione', tipo: 'testo', ordine: 1 })).toBe(false);
  });
  it('crocetta chiamata "note" → false (non è testo)', () => {
    expect(isCampoNota({ chiave: 'note', etichetta: 'Note', tipo: 'crocetta', ordine: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceColore.test.ts`
Expected: FAIL — `esitoNegativoPresente` / `isCampoNota` non esportati (import error).

- [ ] **Step 3: Refactor `voceColore.ts`**

Sostituisci l'INTERO contenuto di `utils/rapportini/voceColore.ts` con:

```typescript
import type { TemplateCampo } from './buildVoci';

/** Valore di una tendina che indica di per sé "non fatto". */
const NEG_SELECT = /^(no|assente|negativ\w*|ko)$/i;

/** Campo il cui NOME indica un esito negativo (assente / non eseguito / negativo / ko). */
const NEG_NAME = /assent|non[\s_-]*eseguit|negativ|\bko\b/i;

/** Pattern per i campi "note": obbligatori SOLO con esito negativo. */
const NOTE_FIELD = /^note/i;

function nomeNegativo(c: TemplateCampo): boolean {
  return NEG_NAME.test(`${c.chiave} ${c.etichetta}`);
}

/** Un campo è "nota" (obbligatorio solo con esito negativo) se è di tipo testo e il nome inizia per "note". */
export function isCampoNota(c: TemplateCampo): boolean {
  return c.tipo === 'testo' && NOTE_FIELD.test(`${c.chiave} ${c.etichetta}`);
}

/**
 * True se le risposte contengono un esito NEGATIVO:
 *  - una crocetta su un campo dal nome negativo (Assente / Non eseguito / …) è spuntata, oppure
 *  - una tendina ha valore esplicitamente negativo (NO / negativo / ko) o è su un campo dal nome negativo.
 */
export function esitoNegativoPresente(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): boolean {
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true && nomeNegativo(c)) return true;
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s !== '' && (NEG_SELECT.test(s) || nomeNegativo(c))) return true;
    }
  }
  return false;
}

/**
 * Con esito negativo le note sono obbligatorie.
 * Ritorna true se il template non ha campi "note" (nessun obbligo) oppure tutti sono compilati.
 */
function noteCompilate(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  const campiNote = campi.filter(isCampoNota);
  if (campiNote.length === 0) return true;
  return campiNote.every((c) => {
    const v = risposte[c.chiave];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

export function voceEsitoColore(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): 'verde' | 'rossa' | 'neutro' {
  // Un esito negativo ha sempre priorità (come prima): se presente, la voce è rossa solo
  // con le note compilate, altrimenti resta neutro (da fare).
  if (esitoNegativoPresente(risposte, campi)) {
    return noteCompilate(risposte, campi) ? 'rossa' : 'neutro';
  }
  // Nessun esito negativo: verde se c'è almeno un esito positivo, altrimenti neutro.
  let positivo = false;
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true) positivo = true;
    } else if (c.tipo === 'select') {
      if (typeof v === 'string' && v.trim() !== '') positivo = true;
    }
  }
  return positivo ? 'verde' : 'neutro';
}
```

- [ ] **Step 4: Esegui i test e verifica che passino (inclusa la REGRESSIONE)**

Run: `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceColore.test.ts`
Expected: PASS — tutti i nuovi test E tutti i test preesistenti di `voceEsitoColore` (il refactor non cambia il comportamento).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/feedback-note-esito add utils/rapportini/voceColore.ts utils/rapportini/voceColore.test.ts
git -C .claude/worktrees/feedback-note-esito commit -m "refactor(rapportini): esitoNegativoPresente + isCampoNota (riuso in voceEsitoColore)"
```

---

### Task 2: `motivoVoceIncompleta` (nuovo helper puro)

**Files:**
- Create: `utils/rapportini/voceMancante.ts`
- Test: `utils/rapportini/voceMancante.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/rapportini/voceMancante.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { motivoVoceIncompleta } from './voceMancante';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'assente', etichetta: 'ASSENTE', tipo: 'crocetta', ordine: 2 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 },
];

describe('motivoVoceIncompleta', () => {
  it('esito negativo senza nota → nota_mancante', () => {
    expect(motivoVoceIncompleta({ assente: true }, campi)).toBe('nota_mancante');
  });
  it('esito negativo con nota → null (completa)', () => {
    expect(motivoVoceIncompleta({ assente: true, note: 'non trovato' }, campi)).toBeNull();
  });
  it('nessun esito → senza_esito', () => {
    expect(motivoVoceIncompleta({}, campi)).toBe('senza_esito');
    expect(motivoVoceIncompleta({ note: 'x' }, campi)).toBe('senza_esito');
  });
  it('esito positivo → null (completa)', () => {
    expect(motivoVoceIncompleta({ att_cess: true }, campi)).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceMancante.test.ts`
Expected: FAIL — modulo `./voceMancante` inesistente.

- [ ] **Step 3: Implementa l'helper**

Crea `utils/rapportini/voceMancante.ts`:

```typescript
import { voceEsitoColore, esitoNegativoPresente } from './voceColore';
import type { TemplateCampo } from './buildVoci';

export type MotivoIncompleto = 'senza_esito' | 'nota_mancante';

/**
 * Perché una voce è incompleta (resta "da fare"). `null` se completa (verde o rossa).
 * - `'nota_mancante'`: esito negativo presente ma la nota obbligatoria non è compilata.
 * - `'senza_esito'`: nessun esito messo.
 */
export function motivoVoceIncompleta(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): MotivoIncompleto | null {
  if (voceEsitoColore(risposte, campi) !== 'neutro') return null;
  return esitoNegativoPresente(risposte, campi) ? 'nota_mancante' : 'senza_esito';
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceMancante.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/feedback-note-esito add utils/rapportini/voceMancante.ts utils/rapportini/voceMancante.test.ts
git -C .claude/worktrees/feedback-note-esito commit -m "feat(rapportini): motivoVoceIncompleta (senza_esito | nota_mancante)"
```

---

### Task 3: `CampoInput` — prop `evidenzia` (bordo rosso sul textarea)

**Files:**
- Modify: `components/modules/rapportini/CampoInput.tsx`

Nota: componente client senza test unit; verifica manuale in Task 7.

- [ ] **Step 1: Aggiungi la prop `evidenzia` alla firma di `CampoInput`**

In `components/modules/rapportini/CampoInput.tsx`, nella firma di `export function CampoInput`, aggiungi `evidenzia` al destructuring e al tipo. Cambia:

```typescript
export function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
}) {
```

in:

```typescript
export function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
  evidenzia,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
  evidenzia?: boolean;
}) {
```

- [ ] **Step 2: Passa `evidenzia` al textarea (ramo campo testo)**

Nel ramo finale che rende il campo testo, cambia:

```tsx
      <TextareaAuto valore={typeof valore === 'string' ? valore : ''} disabilitato={disabilitato} onChange={onChange} />
```

in:

```tsx
      <TextareaAuto valore={typeof valore === 'string' ? valore : ''} disabilitato={disabilitato} onChange={onChange} evidenzia={evidenzia} />
```

- [ ] **Step 3: `TextareaAuto` accetta `evidenzia` e mostra il bordo rosso**

Sostituisci la firma e il `return` di `TextareaAuto`. Cambia la firma:

```typescript
function TextareaAuto({ valore, disabilitato, onChange }: { valore: string; disabilitato: boolean; onChange: (v: unknown) => void }) {
```

in:

```typescript
function TextareaAuto({ valore, disabilitato, onChange, evidenzia }: { valore: string; disabilitato: boolean; onChange: (v: unknown) => void; evidenzia?: boolean }) {
```

E nel `return`, cambia la `className` del `<textarea>`:

```tsx
      className={`${inputCls} resize-none overflow-hidden`}
```

in:

```tsx
      className={`${inputCls} resize-none overflow-hidden ${evidenzia ? 'border-[var(--danger)] ring-1 ring-[var(--danger)]' : ''}`}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .claude/worktrees/feedback-note-esito/tsconfig.json 2>&1 | grep "CampoInput" || echo "OK"`
Expected: nessun errore su `CampoInput.tsx`. (Se `tsc` col tsconfig del worktree non gira per via dei path, lancialo dal checkout principale e filtra `CampoInput`.)

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/feedback-note-esito add components/modules/rapportini/CampoInput.tsx
git -C .claude/worktrees/feedback-note-esito commit -m "feat(rapportini): CampoInput prop evidenzia (bordo rosso sul textarea)"
```

---

### Task 4: `VoceCard` — banner "nota obbligatoria" + evidenzia il campo nota

**Files:**
- Modify: `components/modules/rapportini/VoceCard.tsx`

Nota: componente client; coperto dagli helper (Task 1/2) + verifica manuale (Task 7).

- [ ] **Step 1: Import degli helper**

In cima a `components/modules/rapportini/VoceCard.tsx`, dopo gli import esistenti, aggiungi:

```typescript
import { motivoVoceIncompleta } from '@/utils/rapportini/voceMancante';
import { isCampoNota } from '@/utils/rapportini/voceColore';
```

- [ ] **Step 2: `VoceCampi` accetta `evidenziaNota` ed evidenzia il campo nota**

Sostituisci la firma di `VoceCampi` e la riga che rende i campi `altri`. Cambia la firma:

```tsx
export function VoceCampi({ campi, voce, disabilitato, onChange }: { campi: TemplateCampo[]; voce: VoceCardData; disabilitato: boolean; onChange: (chiave: string, valore: unknown) => void }) {
```

in:

```tsx
export function VoceCampi({ campi, voce, disabilitato, onChange, evidenziaNota }: { campi: TemplateCampo[]; voce: VoceCardData; disabilitato: boolean; onChange: (chiave: string, valore: unknown) => void; evidenziaNota?: boolean }) {
```

E la riga dei campi `altri`, cambia:

```tsx
        <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} />
```

in:

```tsx
        <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} evidenzia={Boolean(evidenziaNota) && isCampoNota(campo)} />
```

- [ ] **Step 3: `VoceCard` calcola `notaMancante`, rende il banner e passa `evidenziaNota`**

Dentro la funzione `VoceCard`, subito dopo la riga `const bordo = ...;`, aggiungi:

```typescript
  const notaMancante = motivoVoceIncompleta(voce.risposte, campi) === 'nota_mancante';
```

Poi, nel JSX, subito DOPO il blocco `{notaUfficio && ( ... )}` e PRIMA di `<VoceDettagli ... />`, aggiungi il banner:

```tsx
      {notaMancante && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3.5 py-2.5">
          <span aria-hidden className="text-base leading-none">⚠️</span>
          <p className="text-[13.5px] font-semibold text-[var(--danger)]">
            Esito negativo: la nota è obbligatoria. Compila il campo nota qui sotto per completare l&apos;intervento.
          </p>
        </div>
      )}
```

Infine, nella riga che rende `<VoceCampi ... />`, aggiungi `evidenziaNota={notaMancante}`:

```tsx
      <VoceCampi campi={campi} voce={voce} disabilitato={disabilitato} onChange={onChange} evidenziaNota={notaMancante} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "VoceCard" || echo "OK"` (dal checkout principale, sul worktree)
Expected: nessun errore su `VoceCard.tsx`.

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/feedback-note-esito add components/modules/rapportini/VoceCard.tsx
git -C .claude/worktrees/feedback-note-esito commit -m "feat(rapportini): banner 'nota obbligatoria' + nota evidenziata su esito negativo"
```

---

### Task 5: `RapportinoForm` (calcola `mancanti`) + `RapportinoLista` (lista cliccabile)

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx`
- Modify: `components/modules/rapportini/RapportinoLista.tsx`

Nota: componenti client; coperti dagli helper + verifica manuale (Task 7).

- [ ] **Step 1: `RapportinoForm` — import e calcolo `mancanti`**

In `components/modules/rapportini/RapportinoForm.tsx`, aggiungi l'import (vicino agli altri import di utils):

```typescript
import { motivoVoceIncompleta, type MotivoIncompleto } from '@/utils/rapportini/voceMancante';
```

Subito DOPO il `useMemo` che costruisce `const righe: RigaVoce[] = useMemo(...)` (cioè dopo la sua riga di chiusura `[voci, campi, titoloCampi]);`), aggiungi:

```typescript
  const mancanti = useMemo(
    () =>
      voci
        .map((v, idx) => ({ index: idx, v }))
        .filter(({ v }) => !v.annullato)
        .map(({ index, v }) => ({ index, titolo: titoloVoce(v, titoloCampi, index), motivo: motivoVoceIncompleta(v.risposte, campi) }))
        .filter((m): m is { index: number; titolo: string; motivo: MotivoIncompleto } => m.motivo !== null),
    [voci, campi, titoloCampi],
  );
```

(`titoloVoce` è già importato e usato nel costruttore di `righe`.)

- [ ] **Step 2: `RapportinoForm` — passa `mancanti` a `RapportinoLista`**

Nel render di `<RapportinoLista ... />`, aggiungi la prop (es. subito dopo `righe={righe}`):

```tsx
          mancanti={mancanti}
```

- [ ] **Step 3: `RapportinoLista` — import del tipo e prop `mancanti`**

In `components/modules/rapportini/RapportinoLista.tsx`, aggiungi l'import:

```typescript
import type { MotivoIncompleto } from '@/utils/rapportini/voceMancante';
```

Aggiungi `mancanti` al destructuring delle props (es. dopo `righe,`) e al tipo delle props (dopo `righe: RigaVoce[];`):

```typescript
  mancanti,
```

```typescript
  mancanti: { index: number; titolo: string; motivo: MotivoIncompleto }[];
```

- [ ] **Step 4: `RapportinoLista` — etichette motivi + render della lista**

Subito dopo le costanti in alto (es. dopo `const FILTRI = ...`), aggiungi:

```typescript
const MOTIVO_LABEL: Record<MotivoIncompleto, string> = {
  senza_esito: 'senza esito',
  nota_mancante: 'nota obbligatoria mancante',
};
```

Nel blocco di invio, dentro il ramo `) : (` … `<>` (quello NON `inviato`), come PRIMO elemento dopo `<>` (cioè prima di `{!readOnly && inviabile && ( ... )}`), aggiungi:

```tsx
              {!readOnly && mancanti.length > 0 && (
                <div className="mb-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2">
                  <p className="mb-1 text-xs font-bold text-[var(--danger)]">
                    Per inviare, completa {mancanti.length} {mancanti.length === 1 ? 'intervento' : 'interventi'}:
                  </p>
                  <div className="space-y-0.5">
                    {mancanti.map((m) => (
                      <button
                        key={m.index}
                        type="button"
                        onClick={() => onApri(m.index)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition hover:bg-[var(--brand-surface)]"
                      >
                        <span className="shrink-0 font-bold text-[var(--brand-text-main)]">Intervento {m.index + 1}</span>
                        <span className="truncate text-[var(--brand-text-muted)]">— {MOTIVO_LABEL[m.motivo]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "RapportinoForm|RapportinoLista" || echo "OK"`
Expected: nessun errore sui due file.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/feedback-note-esito add components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/RapportinoLista.tsx
git -C .claude/worktrees/feedback-note-esito commit -m "feat(rapportini): lista cliccabile 'cosa manca' sopra l'invio"
```

---

### Task 6: Suite test + typecheck + lint

**Files:** nessuna modifica — solo esecuzione.

- [ ] **Step 1: Test dei file della feature (dal checkout principale, sui file del worktree)**

Run: `npx vitest run .claude/worktrees/feedback-note-esito/utils/rapportini/voceColore.test.ts .claude/worktrees/feedback-note-esito/utils/rapportini/voceMancante.test.ts`
Expected: PASS (regressione `voceEsitoColore` + nuovi helper).

- [ ] **Step 2: Typecheck dei file della feature**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "voceColore|voceMancante|CampoInput|VoceCard|RapportinoForm|RapportinoLista" || echo "OK"`
Expected: nessun errore sui file della feature.

- [ ] **Step 3: Lint sui file toccati**

Run: `npx eslint .claude/worktrees/feedback-note-esito/utils/rapportini/voceColore.ts .claude/worktrees/feedback-note-esito/utils/rapportini/voceMancante.ts .claude/worktrees/feedback-note-esito/components/modules/rapportini/CampoInput.tsx .claude/worktrees/feedback-note-esito/components/modules/rapportini/VoceCard.tsx .claude/worktrees/feedback-note-esito/components/modules/rapportini/RapportinoForm.tsx .claude/worktrees/feedback-note-esito/components/modules/rapportini/RapportinoLista.tsx`
Expected: nessun nuovo problema dai file modificati (baseline repo già rossa — confronta solo le righe toccate).

- [ ] **Step 4: Se qualcosa fallisce, correggi prima di proseguire**

Diagnostica e correggi (non aggirare). Ri-esegui fino al verde.

---

### Task 7: Verifica manuale (smoke) e chiusura

**Files:** nessuna modifica — verifica in app reale.

- [ ] **Step 1: Avvia e apri un rapportino operatore**

Run: `npm run dev` → apri un link rapportino `/r/<token>` con un template che ha un campo esito negativo (Assente / NO) e un campo "Note".

- [ ] **Step 2: Avviso immediato**

In un intervento, metti l'esito **negativo** (spunta ASSENTE o seleziona NO): deve comparire **subito** il banner "⚠️ Esito negativo: la nota è obbligatoria" e il campo **Note** deve avere il **bordo rosso**. Scrivi la nota → banner e bordo spariscono, la voce diventa "Non fatto".

- [ ] **Step 3: Lista "cosa manca"**

Con almeno un intervento incompleto, torna alla lista: sopra il pulsante (disabilitato) deve esserci il riquadro "Per inviare, completa N interventi:" con le righe **"Intervento X — senza esito / nota obbligatoria mancante"**. Cliccando una riga si apre quell'intervento. Completa tutto → la lista sparisce, compare "Tutti gli interventi hanno un esito ✓" e il pulsante si abilita.

- [ ] **Step 4: Non-regressione**

Esito **positivo** senza nota → nessun avviso (nota facoltativa). Voce **annullata** → non compare tra i mancanti. Rapportino già **inviato** → nessun avviso/lista.

- [ ] **Step 5: Chiusura branch**

Invoca la skill `superpowers:finishing-a-development-branch` per il branch `feat/feedback-note-esito-negativo` (rebase su `origin/main` aggiornata + push ff con ok dell'utente).

---

## Self-Review (compilata)

- **Copertura spec:** helper `esitoNegativoPresente` + refactor invariante (Task 1) ✓; `motivoVoceIncompleta` (Task 2) ✓; avviso immediato banner + nota evidenziata (Task 3 `CampoInput` + Task 4 `VoceCard`) ✓; lista cliccabile "cosa manca" sopra l'invio (Task 5) ✓; pulsante Invia resta disabilitato (logica `inviabile` invariata) ✓; nessuna SQL ✓; "quando" la nota è obbligatoria invariato ✓.
- **Placeholder:** nessun TBD/TODO; ogni step ha codice/comando concreto.
- **Coerenza tipi:** `esitoNegativoPresente(risposte, campi): boolean` / `isCampoNota(c): boolean` / `motivoVoceIncompleta(...): MotivoIncompleto | null` / prop `evidenzia?: boolean` (CampoInput) / `evidenziaNota?: boolean` (VoceCampi) / `mancanti: { index, titolo, motivo: MotivoIncompleto }[]` — coerenti tra Task 1→5.

---

## Execution Handoff

Vedi sotto per la scelta del metodo di esecuzione.
