# UI Import Interventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una pagina `/hub/interventi` che carica un Excel e lo importa chiamando la rotta esistente `POST /api/interventi/import`, mostrando il riepilogo dell'esito.

**Architecture:** Pagina client (`'use client'`) in `<AuthGate>` che invia una `FormData` alla route handler già esistente (nessun parsing lato client, nessuna nuova rotta). Un nuovo modulo "Interventi" viene registrato nella navigazione data-driven. Un helper puro formatta il riepilogo ed è coperto da unit test; la logica di dedup/insert resta nella rotta.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 (tema Aurea `--brand-*`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-ui-import-interventi-design.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `lib/interventi/importSummary.ts` | Crea | Tipo `ImportInterventiResult` + helper puro `formatImportSummary()` |
| `lib/interventi/importSummary.test.ts` | Crea | Unit test Vitest dell'helper |
| `lib/moduleAccess.ts` | Modifica | Aggiunge `'interventi'` a `AppModuleKey` + entry in `APP_MODULES` |
| `components/layout/moduleIcons.tsx` | Modifica | Aggiunge l'icona `interventi` al record `MODULE_ICONS` |
| `app/hub/interventi/page.tsx` | Crea | Pagina client con il form di import e il riepilogo |

Nota sull'accesso: registrando `interventi` in `APP_MODULES` con `matchPrefixes: ['/hub/interventi']`, la rotta è gestita dal meccanismo esistente (`canAccessPath` + `allowedModules`). La chiave entra in `DEFAULT_ALLOWED_MODULES` (non `adminOnly`): visibile come `mappa`/`rapportini`, senza nuovi guard.

---

## Task 1: Helper puro `formatImportSummary` (TDD)

**Files:**
- Create: `lib/interventi/importSummary.ts`
- Test: `lib/interventi/importSummary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/interventi/importSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatImportSummary } from './importSummary';

describe('formatImportSummary', () => {
  it('usa il plurale per righe/inserimenti/aggiornamenti', () => {
    expect(formatImportSummary({ totaliRighe: 15, inseriti: 12, aggiornati: 3 }))
      .toBe('12 inseriti, 3 aggiornati su 15 righe');
  });

  it('usa il singolare per inserito/riga, plurale per 0 aggiornati', () => {
    expect(formatImportSummary({ totaliRighe: 1, inseriti: 1, aggiornati: 0 }))
      .toBe('1 inserito, 0 aggiornati su 1 riga');
  });

  it('gestisce il singolare di un solo aggiornamento', () => {
    expect(formatImportSummary({ totaliRighe: 1, inseriti: 0, aggiornati: 1 }))
      .toBe('0 inseriti, 1 aggiornato su 1 riga');
  });

  it('gestisce zero inserimenti e zero aggiornamenti', () => {
    expect(formatImportSummary({ totaliRighe: 0, inseriti: 0, aggiornati: 0 }))
      .toBe('0 inseriti, 0 aggiornati su 0 righe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/importSummary.test.ts`
Expected: FAIL — `formatImportSummary` non esiste / modulo non trovato.

- [ ] **Step 3: Write minimal implementation**

Create `lib/interventi/importSummary.ts`:

```ts
/** Esito dell'import restituito da POST /api/interventi/import. */
export type ImportInterventiResult = {
  ok: true;
  batchId: string;
  committente: string;
  data: string;
  lotto: number | null;
  totaliRighe: number;
  inseriti: number;
  aggiornati: number;
};

/**
 * Riepilogo leggibile dei conteggi di import.
 * Es. { totaliRighe: 15, inseriti: 12, aggiornati: 3 } → "12 inseriti, 3 aggiornati su 15 righe".
 */
export function formatImportSummary(
  r: Pick<ImportInterventiResult, 'totaliRighe' | 'inseriti' | 'aggiornati'>,
): string {
  const inseriti = r.inseriti === 1 ? '1 inserito' : `${r.inseriti} inseriti`;
  const aggiornati = r.aggiornati === 1 ? '1 aggiornato' : `${r.aggiornati} aggiornati`;
  const righe = r.totaliRighe === 1 ? '1 riga' : `${r.totaliRighe} righe`;
  return `${inseriti}, ${aggiornati} su ${righe}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/importSummary.test.ts`
Expected: PASS — 4 test verdi.

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/importSummary.ts lib/interventi/importSummary.test.ts
git commit -m "feat(interventi): helper formatImportSummary per riepilogo import (+ test)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Registra il modulo "Interventi" in navigazione

**Files:**
- Modify: `lib/moduleAccess.ts` (tipo `AppModuleKey` righe 12-18; array `APP_MODULES` righe 41-91)
- Modify: `components/layout/moduleIcons.tsx` (record `MODULE_ICONS` righe 8-49)

> I due file vanno modificati insieme: `MODULE_ICONS` è un `Record<AppModuleKey, ReactNode>`, quindi aggiungere la chiave al tipo senza l'icona (o viceversa) fa fallire il typecheck. Per questo la verifica di questo task è `tsc`, non un unit test.

- [ ] **Step 1: Aggiungi `'interventi'` al tipo `AppModuleKey`**

In `lib/moduleAccess.ts`, sostituisci il blocco del tipo (righe 12-18):

```ts
export type AppModuleKey =
  | 'dashboard'
  | 'hotel-calendar'
  | 'rapportini'
  | 'mappa'
  | 'sopralluoghi'
  | 'impostazioni';
```

con:

```ts
export type AppModuleKey =
  | 'dashboard'
  | 'hotel-calendar'
  | 'rapportini'
  | 'mappa'
  | 'interventi'
  | 'sopralluoghi'
  | 'impostazioni';
```

- [ ] **Step 2: Aggiungi la entry in `APP_MODULES`**

In `lib/moduleAccess.ts`, subito dopo il blocco del modulo `mappa` (che termina con `},` intorno a riga 73) e prima del modulo `sopralluoghi`, inserisci:

```ts
  {
    key: 'interventi',
    href: '/hub/interventi',
    label: 'Interventi',
    description: 'Import e gestione interventi',
    section: 'modules',
    matchPrefixes: ['/hub/interventi'],
  },
```

- [ ] **Step 3: Aggiungi l'icona in `MODULE_ICONS`**

In `components/layout/moduleIcons.tsx`, dentro l'oggetto `MODULE_ICONS`, dopo la voce `mappa: ( … ),` (intorno a riga 34) inserisci:

```tsx
  interventi: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3v10m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  ),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore (il record `MODULE_ICONS` è di nuovo esaustivo; nessun altro punto del codice usa un `Record<AppModuleKey, …>`).

- [ ] **Step 5: Commit**

```bash
git add lib/moduleAccess.ts components/layout/moduleIcons.tsx
git commit -m "feat(interventi): registra modulo Interventi in navigazione (moduleAccess + icona)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pagina di import `/hub/interventi`

**Files:**
- Create: `app/hub/interventi/page.tsx`

- [ ] **Step 1: Crea la pagina**

Create `app/hub/interventi/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import AuthGate from '@/components/AuthGate';
import { formatImportSummary, type ImportInterventiResult } from '@/lib/interventi/importSummary';

const COMMITTENTI = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'altro', label: 'Altro' },
] as const;

type Committente = (typeof COMMITTENTI)[number]['value'];

/** Data odierna in fuso Europe/Rome, formato YYYY-MM-DD per <input type="date">. */
function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default function InterventiImportPage() {
  return (
    <AuthGate>
      <ImportInterventiForm />
    </AuthGate>
  );
}

function ImportInterventiForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('Nessun file selezionato');
  const [committente, setCommittente] = useState<Committente>('italgas');
  const [data, setData] = useState<string>(() => oggiIso());
  const [lotto, setLotto] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportInterventiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileName(f ? f.name : 'Nessun file selezionato');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError('Seleziona un file Excel.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setError('Data non valida.');
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('committente', committente);
      fd.append('data', data);
      if (lotto) fd.append('lotto', lotto);

      const res = await fetch('/api/interventi/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore durante l\'import.');
        return;
      }
      setResult(json as ImportInterventiResult);
      setFile(null);
      setFileName('Nessun file selezionato');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!file && /^\d{4}-\d{2}-\d{2}$/.test(data) && !busy;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
        >
          Interventi · Import
        </span>
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Importa interventi
        </h1>
        <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--brand-text-muted)' }}>
          Carica un Excel del committente: le righe vengono salvate come interventi. Un ri-import dello stesso
          giorno aggiorna le righe esistenti (dedup per committente, ODL e data) invece di duplicarle.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-[28px] border bg-[var(--brand-surface)] p-6 shadow-sm"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <div className="space-y-2">
          <label
            className="block text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--brand-text-muted)' }}
          >
            File Excel
          </label>
          <div
            className="flex flex-col gap-4 rounded-[24px] border border-dashed p-5 md:flex-row md:items-center md:justify-between"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
              {fileName}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="interventi-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={onPick}
                className="hidden"
              />
              <label
                htmlFor="interventi-file-input"
                className="inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {file ? 'Sostituisci file' : 'Carica file'}
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFileName('Nessun file selezionato');
                  }}
                  className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
                  style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Committente
            </label>
            <select
              value={committente}
              onChange={(e) => setCommittente(e.target.value as Committente)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            >
              {COMMITTENTI.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Data di lavoro
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            />
          </div>

          <div className="space-y-2">
            <label
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Lotto (Acea)
            </label>
            <select
              value={lotto}
              onChange={(e) => setLotto(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            >
              <option value="">—</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        </div>

        {error && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}
        {result && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
          >
            Import completato ({result.committente}, {result.data}): {formatImportSummary(result)}.
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? 'Import in corso…' : 'Importa'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore nei file aggiunti (`app/hub/interventi/page.tsx`).

- [ ] **Step 4: Verifica manuale (smoke)**

Run: `npm run dev` e apri `http://localhost:3000/hub/interventi`.
Expected:
- voce "Interventi" presente nella Sidebar (icona import) e attiva sulla pagina;
- il form mostra File / Committente (default Italgas) / Data (oggi) / Lotto;
- selezionando un Excel Italgas (formato ATTGIORN) reale e premendo "Importa" compare il box verde con il riepilogo (es. "12 inseriti, 3 aggiornati su 15 righe"); con file mancante o data vuota compare il box rosso.

> Nota: il flusso completo richiede env Supabase configurato e un Excel reale. In assenza, verifica almeno il rendering della pagina e la presenza in Sidebar.

- [ ] **Step 5: Commit**

```bash
git add app/hub/interventi/page.tsx
git commit -m "feat(interventi): pagina /hub/interventi per import Excel" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verifica finale dell'intera suite

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Esegui tutti i test**

Run: `npm run test`
Expected: PASS — tutti i test esistenti più i 4 nuovi di `formatImportSummary`.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Nessun commit**

Task di sola verifica: se Step 1-2 sono verdi, non ci sono modifiche da committare. Se emergono errori, torna al task pertinente e correggi.

---

## Note di esecuzione

- Eseguire `npx tsc` aggiorna `tsconfig.tsbuildinfo` (file già "modified" nel working tree): **non** includerlo nei commit. Usare sempre `git add` dei file specifici elencati in ogni task, mai `git add -A`.
- Lo stesso vale per `.claude/settings.local.json`: lasciarlo fuori dai commit.
