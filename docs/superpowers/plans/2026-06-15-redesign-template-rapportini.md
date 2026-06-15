# Redesign editor "Template rapportini" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividere l'editor dei template rapportini in due schede (Classici/pianificati e Interventi manuali) con editor adattivo a sezioni collassabili, mantenendo tutte le funzioni esistenti e senza toccare DB/API/helper a valle.

**Architecture:** Si estrae la logica di smistamento per scheda in un helper puro testato (`lib/rapportini/templateScheda.ts`). Si aggiungono due componenti di presentazione locali (`SezioneAccordion`, `SchedeTipo`). L'orchestratore `TemplateRapportiniClient.tsx` viene rifattorizzato: un singolo stato `scheda` pilota sia il filtro della lista sia il tipo del template in modifica; le sezioni vengono avvolte in accordion e nascoste quando non pertinenti al tipo; il committente diventa obbligatorio per i manuali. La vecchia checkbox "Solo interventi manuali" sparisce: il valore `solo_manuale` deriva dalla scheda attiva.

**Tech Stack:** Next.js 15 (App Router, React 19, client component), TypeScript, Tailwind v4 con variabili `--brand-*`, vitest 2 (solo funzioni pure: il progetto non ha testing-library/react).

**Nota di scostamento dalla spec:** la spec elencava 5 file-sezione separati (`SezioneBase`, `SezioneTitoloCard`, …). Per ridurre il rischio (props-drilling massiccio di stato/callback) le sezioni restano blocchi JSX nell'orchestratore, **avvolti** in `SezioneAccordion`. Gli obiettivi e i criteri di accettazione della spec restano integralmente soddisfatti (divisione schede, sezioni adattive, accordion, funzioni invariate).

**Baseline di repo (memo "Lint/test baseline rosso"):** `npm run lint` e `npx vitest run` globali sono già rossi su main. I gate qui sono **mirati**: `npx eslint <file toccati>` pulito e `npx vitest run <file di test del task>` verde. Non introdurre nuovi errori nei file toccati.

---

### Task 1: Helper puro di smistamento per scheda (`templateScheda.ts`)

**Files:**
- Create: `lib/rapportini/templateScheda.ts`
- Test: `lib/rapportini/templateScheda.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `lib/rapportini/templateScheda.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  schedaDiTemplate,
  filtraTemplatePerScheda,
  erroreCommittenteManuale,
} from './templateScheda';

describe('schedaDiTemplate', () => {
  it('solo_manuale=true → scheda manuali', () => {
    expect(schedaDiTemplate({ solo_manuale: true })).toBe('manuali');
  });
  it('solo_manuale=false → scheda classici', () => {
    expect(schedaDiTemplate({ solo_manuale: false })).toBe('classici');
  });
  it('solo_manuale assente/null → scheda classici (default storico)', () => {
    expect(schedaDiTemplate({})).toBe('classici');
    expect(schedaDiTemplate({ solo_manuale: null })).toBe('classici');
  });
});

describe('filtraTemplatePerScheda', () => {
  const list = [
    { id: 'a', solo_manuale: false },
    { id: 'b', solo_manuale: true },
    { id: 'c' },
    { id: 'd', solo_manuale: true },
  ];
  it('classici = solo_manuale falsy', () => {
    expect(filtraTemplatePerScheda(list, 'classici').map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('manuali = solo_manuale true', () => {
    expect(filtraTemplatePerScheda(list, 'manuali').map((t) => t.id)).toEqual(['b', 'd']);
  });
  it('non muta l\'array di input', () => {
    const copia = [...list];
    filtraTemplatePerScheda(list, 'manuali');
    expect(list).toEqual(copia);
  });
});

describe('erroreCommittenteManuale', () => {
  it('manuale senza committente → messaggio di errore', () => {
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: null })).toBe(
      'Per i template manuali il committente è obbligatorio',
    );
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: '' })).toBeTruthy();
  });
  it('manuale con committente → nessun errore', () => {
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: 'acea' })).toBeNull();
  });
  it('classico senza committente → nessun errore (committente opzionale)', () => {
    expect(erroreCommittenteManuale({ solo_manuale: false, committente: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/rapportini/templateScheda.test.ts`
Expected: FAIL con "Failed to resolve import './templateScheda'" (il modulo non esiste ancora).

- [ ] **Step 3: Implementa l'helper**

Create `lib/rapportini/templateScheda.ts`:

```ts
/** Le due schede dell'editor template: classici (pianificati) e interventi manuali. */
export type SchedaTemplate = 'classici' | 'manuali';

/** Riga minima per lo smistamento (solo il flag che discrimina). */
export interface TemplateSchedaRow {
  solo_manuale?: boolean | null;
}

/** Scheda di appartenenza di un template. `solo_manuale` falsy ⇒ classico (default storico). */
export function schedaDiTemplate(t: TemplateSchedaRow): SchedaTemplate {
  return t.solo_manuale ? 'manuali' : 'classici';
}

/** Filtra i template per la scheda indicata. Non muta l'array di input. */
export function filtraTemplatePerScheda<T extends TemplateSchedaRow>(
  templates: T[],
  scheda: SchedaTemplate,
): T[] {
  return templates.filter((t) => schedaDiTemplate(t) === scheda);
}

/**
 * Validazione specifica della scheda Manuali: il committente è obbligatorio.
 * Ritorna il messaggio d'errore, oppure `null` se va bene (classico o manuale con committente).
 */
export function erroreCommittenteManuale(input: {
  solo_manuale?: boolean | null;
  committente?: string | null;
}): string | null {
  if (input.solo_manuale && !input.committente) {
    return 'Per i template manuali il committente è obbligatorio';
  }
  return null;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run lib/rapportini/templateScheda.test.ts`
Expected: PASS (tutti i casi verdi).

- [ ] **Step 5: Lint mirato**

Run: `npx eslint lib/rapportini/templateScheda.ts lib/rapportini/templateScheda.test.ts`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add lib/rapportini/templateScheda.ts lib/rapportini/templateScheda.test.ts
git commit -m "feat(template): helper puro smistamento schede classici/manuali"
```

---

### Task 2: Componente `SezioneAccordion`

**Files:**
- Create: `app/impostazioni/template-rapportini/SezioneAccordion.tsx`

Componente di presentazione collassabile: replica il riquadro `rounded-2xl border bg-surface` esistente ma con header cliccabile (titolo + sottotitolo opzionale + chevron) e corpo richiudibile. Nessun test unitario: è puro JSX (il progetto non ha testing-library/react); la verifica è eslint + type-check.

- [ ] **Step 1: Crea il componente**

Create `app/impostazioni/template-rapportini/SezioneAccordion.tsx`:

```tsx
'use client';
import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function SezioneAccordion({ title, subtitle, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
      >
        <span className="flex flex-col">
          <span className="font-semibold text-[var(--brand-text-main)]">{title}</span>
          {subtitle && (
            <span className="mt-0.5 text-xs font-normal text-[var(--brand-text-muted)]">{subtitle}</span>
          )}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-[var(--brand-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-[var(--brand-border)] p-6 pt-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Lint mirato**

Run: `npx eslint app/impostazioni/template-rapportini/SezioneAccordion.tsx`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/impostazioni/template-rapportini/SezioneAccordion.tsx
git commit -m "feat(template): componente SezioneAccordion collassabile"
```

---

### Task 3: Componente `SchedeTipo`

**Files:**
- Create: `app/impostazioni/template-rapportini/SchedeTipo.tsx`

Le due schede selettore in cima alla colonna sinistra. Puro JSX, nessun test unitario.

- [ ] **Step 1: Crea il componente**

Create `app/impostazioni/template-rapportini/SchedeTipo.tsx`:

```tsx
'use client';
import type { SchedaTemplate } from '@/lib/rapportini/templateScheda';

const SCHEDE: { key: SchedaTemplate; label: string }[] = [
  { key: 'classici', label: 'Classici · pianificati' },
  { key: 'manuali', label: 'Interventi manuali' },
];

type Props = {
  attiva: SchedaTemplate;
  onChange: (s: SchedaTemplate) => void;
};

export default function SchedeTipo({ attiva, onChange }: Props) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-1">
      {SCHEDE.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          aria-pressed={attiva === s.key}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            attiva === s.key
              ? 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]'
              : 'text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Lint mirato**

Run: `npx eslint app/impostazioni/template-rapportini/SchedeTipo.tsx`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/impostazioni/template-rapportini/SchedeTipo.tsx
git commit -m "feat(template): componente SchedeTipo (classici/manuali)"
```

---

### Task 4: Orchestratore — stato `scheda`, lista filtrata, validazione

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

Questo task introduce lo stato `scheda` che rimpiazza `soloManuale`, filtra la lista e aggiunge la validazione del committente. Le modifiche al JSX dell'editor (accordion + nascondere sezioni) sono nel Task 5.

- [ ] **Step 1: Aggiungi gli import**

In testa al file, dopo la riga `import { SAMPLE_VOCE_INFO, sampleRisposte } from '@/utils/rapportini/sampleVoce';` (riga 15), aggiungi:

```tsx
import SezioneAccordion from './SezioneAccordion';
import SchedeTipo from './SchedeTipo';
import {
  schedaDiTemplate,
  filtraTemplatePerScheda,
  erroreCommittenteManuale,
  type SchedaTemplate,
} from '@/lib/rapportini/templateScheda';
```

- [ ] **Step 2: Sostituisci lo stato `soloManuale` con `scheda` + derivato**

Trova (riga ~76):

```tsx
  const [soloManuale, setSoloManuale] = useState(false);
```

Sostituisci con:

```tsx
  const [scheda, setScheda] = useState<SchedaTemplate>('classici');
  const soloManuale = scheda === 'manuali';
```

- [ ] **Step 3: Allinea la scheda al caricamento di un template**

In `loadTemplate` (riga ~96-109) trova:

```tsx
    setSoloManuale(tpl.solo_manuale ?? false);
```

Sostituisci con:

```tsx
    setScheda(schedaDiTemplate(tpl));
```

- [ ] **Step 4: Rimuovi `setSoloManuale` da `startNew`**

In `startNew` (riga ~111-124) elimina la riga:

```tsx
    setSoloManuale(false);
```

(Il nuovo template eredita la scheda attiva: non si tocca `scheda`.)

- [ ] **Step 5: Aggiungi la funzione di cambio scheda**

Subito dopo `startNew` (prima di `reloadTemplates`), aggiungi:

```tsx
  function cambiaScheda(s: SchedaTemplate) {
    setScheda(s);
    setSelectedId(null);
    setIsNew(false);
  }
```

- [ ] **Step 6: Valida il committente manuale in `handleSave`**

In `handleSave`, dopo il ciclo di validazione dei campi (dopo la riga `if (!c.etichetta.trim()) { ... }` che chiude a riga ~230), aggiungi prima di `setSaving(true);`:

```tsx
    const errComm = erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (errComm) { showFeedback('error', errComm); return; }
```

- [ ] **Step 7: Blocca l'auto-save dei manuali senza committente**

Nell'`useEffect` di auto-save, trova (riga ~298-300):

```tsx
    const valido =
      nome.trim() !== '' && campi.length > 0 && campi.every((c) => c.etichetta.trim() !== '');
    if (!valido) { setAutoState('idle'); return; }
```

Sostituisci con:

```tsx
    const valido =
      nome.trim() !== '' && campi.length > 0 && campi.every((c) => c.etichetta.trim() !== '');
    const committenteOk = !erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (!valido || !committenteOk) { setAutoState('idle'); return; }
```

- [ ] **Step 8: Aggiorna le dipendenze dell'auto-save**

In fondo all'`useEffect` di auto-save trova l'array di dipendenze (riga ~333):

```tsx
  }, [nome, committente, soloManuale, tipo, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);
```

Sostituisci con (rimpiazza `soloManuale` con `scheda`):

```tsx
  }, [nome, committente, scheda, tipo, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);
```

- [ ] **Step 9: Schede in cima e lista filtrata**

Nel render della colonna sinistra, trova il blocco header (riga ~366-375):

```tsx
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Template rapportini</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90"
          >
            + Nuovo
          </button>
        </div>
```

Sostituisci con (aggiunge le schede sotto l'header):

```tsx
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Template rapportini</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90"
          >
            + Nuovo
          </button>
        </div>

        <SchedeTipo attiva={scheda} onChange={cambiaScheda} />
```

- [ ] **Step 10: Usa la lista filtrata nel render**

Subito dopo `const selectedTpl = templates.find((t) => t.id === selectedId);` (riga ~339), aggiungi:

```tsx
  const templatesVisibili = filtraTemplatePerScheda(templates, scheda);
```

Poi nel render della lista, trova le due occorrenze che usano `templates` per il rendering e l'empty-state:

- Riga ~377: `{templates.length === 0 && !isNew ? (` → `{templatesVisibili.length === 0 && !isNew ? (`
- Riga ~388: `{templates.map((tpl) => (` → `{templatesVisibili.map((tpl) => (`

E aggiorna il testo dell'empty-state (riga ~379) per riflettere la scheda:

```tsx
            {scheda === 'manuali' ? 'Nessun template per interventi manuali. Creane uno.' : 'Nessun template classico. Creane uno.'}
```

(Lascia invariata `reloadTemplates`/`templates` altrove: il filtro è solo per la visualizzazione della lista.)

- [ ] **Step 11: Type-check mirato**

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore relativo a `TemplateRapportiniClient.tsx` / `templateScheda.ts` (ignora eventuali errori preesistenti altrove, coerente con la baseline). In particolare nessun "Cannot find name 'soloManuale'" residuo.

- [ ] **Step 12: Lint mirato**

Run: `npx eslint app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
Expected: nessun errore (in particolare nessuna variabile/funzione inutilizzata come `setSoloManuale`).

- [ ] **Step 13: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "refactor(template): stato scheda al posto di soloManuale + lista filtrata + validazione committente"
```

---

### Task 5: Orchestratore — sezioni in accordion e adattive per scheda

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

Si avvolgono le sezioni dell'editor in `SezioneAccordion`, si nascondono quelle non pertinenti ai manuali (Titolo card, Dettaglio card/coordinate, selettore Tipo) e si rimuove la checkbox "Solo interventi manuali". Le anteprime restano dentro l'accordion. Tutte le funzioni interne (campi, info, titolo, foto-priority) restano invariate.

- [ ] **Step 1: Unisci "Nome" e "Committente" nella sezione accordion "Impostazioni base"**

Trova il blocco "Nome template" (riga ~434-443) e il blocco "Committente" (riga ~446-485) — sono due `<div className="rounded-2xl border ...">` consecutivi. **Sostituisci entrambi** con un unico accordion. Dentro: il campo nome, il selettore Tipo **solo per i classici**, il committente (obbligatorio per i manuali), niente più checkbox `soloManuale`:

```tsx
            {/* ── Impostazioni base ─────────────────────────────────────────── */}
            <SezioneAccordion title="Impostazioni base" defaultOpen>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Nome template</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mb-4 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                placeholder="es. Rapportino standard"
              />

              {scheda === 'classici' && (
                <>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Tipo rapportino</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as 'standard' | 'risanamento')}
                    className="mb-4 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                  >
                    <option value="standard">Standard</option>
                    <option value="risanamento">Risanamento colonne</option>
                  </select>
                </>
              )}

              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Committente{scheda === 'manuali' && <span className="text-[var(--danger)]"> *</span>}
              </label>
              <select
                value={committente}
                onChange={(e) => setCommittente(e.target.value as Committente | '')}
                className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="">— Nessuno —</option>
                <option value="acea">Acea</option>
                <option value="italgas">Italgas</option>
                <option value="altro">Altro</option>
                <option value="lim_massive">Limitazioni massive</option>
              </select>
              <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                {scheda === 'manuali'
                  ? 'Instrada la modale "+" dell\'operatore: il committente scelto carica i campi di questo template.'
                  : 'Opzionale: associa il template a un committente (fallback al default se assente).'}
              </p>
            </SezioneAccordion>
```

- [ ] **Step 2: Avvolgi "Card nella lista interventi" e mostralo solo ai classici**

Trova il blocco che inizia con `{/* ── Card nella lista interventi ── */}` / `<div className="rounded-2xl border ..."><h3 ...>Card nella lista interventi</h3>` (riga ~487) e termina con il suo `</div>` di chiusura subito dopo `</AnteprimaBox>` (riga ~527).

Sostituisci il **wrapper di apertura** — cioè:

```tsx
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Card nella lista interventi</h3>
```

con:

```tsx
            {scheda === 'classici' && (
            <SezioneAccordion title="Titolo della card voce">
```

E sostituisci il **wrapper di chiusura** (il `</div>` che chiude questa sezione, subito dopo `</AnteprimaBox>` a riga ~527) con:

```tsx
            </SezioneAccordion>
            )}
```

(La riga `<p className="mb-4 text-xs ...">Il titolo di ogni voce…</p>` resta come testo descrittivo dentro l'accordion.)

- [ ] **Step 3: Avvolgi "Dettaglio card" e mostralo solo ai classici**

Trova il blocco `<div className="rounded-2xl border ..."><h3 ...>Dettaglio card</h3>` (riga ~530) fino al `</div>` dopo il suo `</AnteprimaBox>` (riga ~548).

Sostituisci l'apertura:

```tsx
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio card</h3>
```

con:

```tsx
            {scheda === 'classici' && (
            <SezioneAccordion title="Dettaglio card">
```

E la chiusura `</div>` (dopo `</AnteprimaBox>`, riga ~548) con:

```tsx
            </SezioneAccordion>
            )}
```

- [ ] **Step 4: Avvolgi "Dettaglio anagrafica" (entrambe le schede)**

Trova `<div className="rounded-2xl border ..."><h3 ...>Dettaglio anagrafica</h3>` (riga ~551) fino al `</div>` dopo il suo `</AnteprimaBox>` (riga ~589).

Sostituisci l'apertura:

```tsx
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio anagrafica</h3>
```

con:

```tsx
            <SezioneAccordion title={scheda === 'manuali' ? 'Anagrafica da compilare' : 'Dettaglio anagrafica'}>
```

E la chiusura `</div>` (dopo `</AnteprimaBox>`, riga ~589) con:

```tsx
            </SezioneAccordion>
```

- [ ] **Step 5: Avvolgi "Lista azioni da fare" (aperta di default, entrambe le schede)**

Trova `<div className="rounded-2xl border ..."><h3 ...>Lista azioni da fare</h3>` (riga ~592) fino al `</div>` dopo il suo `</AnteprimaBox>` (riga ~763).

Sostituisci l'apertura:

```tsx
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Lista azioni da fare</h3>
```

con:

```tsx
            <SezioneAccordion title="Azioni da fare" defaultOpen>
```

E la chiusura `</div>` (dopo `</AnteprimaBox>`, riga ~763) con:

```tsx
            </SezioneAccordion>
```

(Il flag "Obbligatoria" sui campi non-foto resta condizionato a `soloManuale`, che ora è `true` solo nella scheda Manuali — nessuna modifica a quel blocco.)

- [ ] **Step 6: Avvolgi "Priorità nome foto" in accordion**

Trova il blocco condizionale `{haCampiFoto && (` con dentro `<div className="rounded-2xl border ..."><h3 ...>Priorità nome foto</h3>` (riga ~766-767) fino al `</div>` di chiusura prima della parentesi `)}` (riga ~811-812).

Sostituisci l'apertura:

```tsx
            {haCampiFoto && (
              <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
                <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Priorità nome foto</h3>
```

con:

```tsx
            {haCampiFoto && (
              <SezioneAccordion title="Foto — priorità nome file">
```

E la chiusura — il `</div>` prima di `)}` a riga ~811 — con:

```tsx
              </SezioneAccordion>
            )}
```

- [ ] **Step 7: Type-check mirato**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore. In particolare nessun tag JSX sbilanciato (`<div>`/`</div>` o `<SezioneAccordion>`/`</SezioneAccordion>` non chiusi) e nessun riferimento residuo a `setSoloManuale`.

- [ ] **Step 8: Lint mirato**

Run: `npx eslint app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
Expected: nessun errore.

- [ ] **Step 9: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(template): sezioni in accordion e adattive per scheda (nasconde titolo/coordinate/tipo ai manuali)"
```

---

### Task 6: Verifica finale e smoke

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Test dell'helper**

Run: `npx vitest run lib/rapportini/templateScheda.test.ts`
Expected: PASS.

- [ ] **Step 2: Lint di tutti i file toccati**

Run: `npx eslint lib/rapportini/templateScheda.ts app/impostazioni/template-rapportini/SezioneAccordion.tsx app/impostazioni/template-rapportini/SchedeTipo.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
Expected: nessun errore.

- [ ] **Step 3: Build di produzione (verifica compilazione pagina)**

Run: `npm run build`
Expected: build completata senza errori sulla route `impostazioni/template-rapportini`. (Se la build fallisce per ragioni preesistenti non legate ai file toccati, isolarne la causa col type-check mirato del passo precedente.)

- [ ] **Step 4: Smoke manuale (dev server)**

Run: `npm run dev` e apri `/impostazioni/template-rapportini`. Verifica i criteri di accettazione della spec:

1. In cima alla lista compaiono le due schede; cambiandole la lista mostra solo i template di quel tipo.
2. Da scheda **Manuali** → "+ Nuovo": NON compaiono Titolo card, Dettaglio card, né il selettore Tipo; il committente è marcato con `*`.
3. Salvare un manuale senza committente mostra l'errore "Per i template manuali il committente è obbligatorio" e non salva.
4. Da scheda **Classici** → "+ Nuovo": compare il selettore Tipo; scegliendo "Risanamento colonne" e aggiungendo un campo foto compaiono le opzioni "Sezione foto".
5. Le sezioni si aprono/chiudono; "Impostazioni base" e "Azioni da fare" sono aperte di default.
6. Aprendo un template **esistente** classico e uno manuale, la scheda si allinea automaticamente e i campi si popolano correttamente.
7. Modificando un template esistente, l'auto-save mostra "Salvato ✓" (e per i manuali resta "idle" finché manca il committente).

- [ ] **Step 5: Commit finale (se necessari aggiustamenti dallo smoke)**

Se lo smoke richiede correzioni, applicarle e committare con messaggio `fix(template): <descrizione>`. Altrimenti il task è completo.

---

## Self-Review (eseguito in fase di scrittura del piano)

**Copertura spec:**
- Divisione classici/manuali (schede) → Task 3 + Task 4 (Step 9-10).
- `solo_manuale` derivato dalla scheda, niente checkbox → Task 4 (Step 2-4) + Task 5 (Step 1).
- Sezioni solo-classici nascoste ai manuali (Titolo card, Coordinate, Tipo) → Task 5 (Step 1-3).
- Committente obbligatorio per i manuali (handleSave + auto-save) → Task 1 + Task 4 (Step 6-7).
- Accordion con default aperti (Base, Azioni) → Task 2 + Task 5 (Step 1, 5).
- Anteprime mantenute dentro le sezioni → Task 5 (restano nel JSX avvolto).
- Flag "Obbligatoria" sui campi manuali → invariato (condizione `soloManuale`), Task 5 (Step 5).
- Sezioni foto misuratore/fase solo se risanamento → invariato (condizione `tipo === 'risanamento'`), Task 5 (Step 5).
- Nessuna modifica DB/API/helper a valle → garantito: nessun task tocca `route.ts`, schema o helper a valle.
- Edge case empty-state per scheda → Task 4 (Step 10).
- Edge case cambio scheda deseleziona → Task 4 (Step 5, `cambiaScheda`).

**Placeholder scan:** nessun TBD/TODO; ogni step che cambia codice mostra il codice completo o l'esatta sostituzione.

**Consistenza dei nomi:** `scheda`/`SchedaTemplate`, `schedaDiTemplate`, `filtraTemplatePerScheda`, `erroreCommittenteManuale`, `cambiaScheda`, `templatesVisibili`, `SezioneAccordion`, `SchedeTipo` usati in modo coerente tra i task. `soloManuale` resta come **derivato** (`scheda === 'manuali'`) per non toccare i blocchi che già lo referenziano (payload, flag obbligatoria).
