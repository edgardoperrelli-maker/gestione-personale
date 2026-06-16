# Fase 2 — cache offline del censimento Acea — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far funzionare ricerca + autofill matricola del "+" anche OFFLINE, scaricando il censimento Acea una sola volta e riusandolo cross-giorno (no ri-download quotidiano).

**Architecture:** Nuovo endpoint `GET /api/r/[token]/censimento?v=<versione>` che risponde `{ unchanged: true }` se la versione del client coincide, altrimenti la proiezione snella + nuova versione. Cache in un nuovo store IndexedDB `dbCensimento` con chiave STABILE (`'acea'`, non il token del giorno). `CercaMatricolaLimitazione` offline cerca nella cache (helper puro `cercaCensimentoLocale`) e fa autofill.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, IndexedDB (`lib/offline/db.ts`, **DB_VERSION 1→2**), vitest (node), Playwright e2e (`/offline-e2e`).

**Working dir (worktree):** `C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline` — tutti i comandi da qui. NON fare push (lo fa il controller con OK utente).

**Dati di riferimento:** tabella `limitazione_misuratori_ref` (committente `'acea'`, ~1.429 righe). Colonne: `id bigserial`, `matricola`, `pdr`, `nominativo`, `indirizzo`, `civico`, `comune`, `cap`, `odl`, `created_at` (NO `updated_at`). Versione = `"<count>:<maxId>"`. **Attenzione:** PostgREST tronca a 1000 righe → il fetch completo va PAGINATO.

**Baseline:** lint/test complessivi del repo già rossi → i gate valgono come "nessun problema nuovo dai file toccati".

---

### Task 1: `cercaCensimentoLocale` (ricerca pura, specchio del server)

**Files:**
- Create: `lib/limitazione/cercaCensimentoLocale.ts`
- Test: `lib/limitazione/cercaCensimentoLocale.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/limitazione/cercaCensimentoLocale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cercaCensimentoLocale } from './cercaCensimentoLocale';
import type { CensitoMisuratore } from './autofillAnagrafica';

const righe: CensitoMisuratore[] = [
  { matricola: '99A023041', indirizzo: 'Via Roma', civico: '1', comune: 'Roma' },
  { matricola: 'B12345678', nominativo: 'Rossi' },
];

describe('cercaCensimentoLocale', () => {
  it('match esatto → trovato', () => {
    expect(cercaCensimentoLocale('99A023041', righe)).toEqual({ trovato: true, misuratore: righe[0] });
  });
  it('niente esatto → simili (prefisso variabile: A023041 trova 99A023041)', () => {
    const r = cercaCensimentoLocale('A023041', righe);
    expect(r.trovato).toBe(false);
    if (!r.trovato) expect(r.suggerimenti.map((s) => s.matricola)).toContain('99A023041');
  });
  it('q vuota → nessun risultato', () => {
    expect(cercaCensimentoLocale('  ', righe)).toEqual({ trovato: false, suggerimenti: [] });
  });
  it('nessun simile → suggerimenti vuoti', () => {
    expect(cercaCensimentoLocale('ZZZZZZ', righe)).toEqual({ trovato: false, suggerimenti: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/limitazione/cercaCensimentoLocale.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implement**

Create `lib/limitazione/cercaCensimentoLocale.ts`:

```ts
import { matricoleSimili } from './matricoleSimili';
import type { CensitoMisuratore } from './autofillAnagrafica';

export type EsitoCensimentoLocale =
  | { trovato: true; misuratore: CensitoMisuratore }
  | { trovato: false; suggerimenti: CensitoMisuratore[] };

/**
 * Ricerca OFFLINE nella cache del censimento, specchio della logica server di
 * /cerca-limitazione: match ESATTO sulla matricola → trovato; altrimenti i simili
 * (riusa `matricoleSimili`). Pura: nessun accesso a rete/IndexedDB.
 */
export function cercaCensimentoLocale(q: string, righe: CensitoMisuratore[]): EsitoCensimentoLocale {
  const v = q.trim();
  if (!v) return { trovato: false, suggerimenti: [] };
  const esatto = righe.find((r) => r.matricola === v);
  if (esatto) return { trovato: true, misuratore: esatto };
  return { trovato: false, suggerimenti: matricoleSimili(v, righe, 8) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/limitazione/cercaCensimentoLocale.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/cercaCensimentoLocale.ts lib/limitazione/cercaCensimentoLocale.test.ts
git commit -m "feat(limitazione): cercaCensimentoLocale (ricerca offline pura, specchio server)"
```

---

### Task 2: store IndexedDB `dbCensimento` (DB_VERSION 1→2)

**Files:**
- Modify: `lib/offline/db.ts`

Nota: tocca IndexedDB → verifica solo `tsc`. La compatibilità del bump è additiva (store creati con guardia `!contains`, dati esistenti preservati).

- [ ] **Step 1: Bump versione + nuovo store**

In `lib/offline/db.ts`:

(a) Cambiare `const DB_VERSION = 1;` in `const DB_VERSION = 2;`

(b) Dopo `const STORE_BLOB = 'blob';` aggiungere:

```ts
const STORE_CENSIMENTO = 'censimento';
```

(c) Dentro `req.onupgradeneeded`, dopo la riga che crea `STORE_BLOB`, aggiungere:

```ts
      if (!db.objectStoreNames.contains(STORE_CENSIMENTO)) db.createObjectStore(STORE_CENSIMENTO, { keyPath: 'chiave' });
```

- [ ] **Step 2: Adapter `dbCensimento`**

In `lib/offline/db.ts`, dopo il blocco `export const dbBlob = {...}`, aggiungere:

```ts
/* ── Cache censimento (chiave stabile, non il token) ──────────────────────── */
export type CensitoCacheRecord = { chiave: string; versione: string; righe: unknown[]; scaricatoIl: number };
export const dbCensimento = {
  salva: (rec: CensitoCacheRecord) => tx(STORE_CENSIMENTO, 'readwrite', (s) => s.put(rec)),
  leggi: (chiave: string) =>
    tx<CensitoCacheRecord | undefined>(STORE_CENSIMENTO, 'readonly', (s) => s.get(chiave) as IDBRequest<CensitoCacheRecord | undefined>),
};
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/offline/db" || echo "ok"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add lib/offline/db.ts
git commit -m "feat(offline): store dbCensimento (DB_VERSION 2, additivo) per la cache del censimento"
```

---

### Task 3: endpoint `GET /api/r/[token]/censimento`

**Files:**
- Create: `app/api/r/[token]/censimento/route.ts`

Nota: route server (supabase) → verifica `tsc`; il comportamento è coperto dall'e2e con fetch mockato (Task 6) lato client.

- [ ] **Step 1: Implement the route**

Create `app/api/r/[token]/censimento/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export const runtime = 'nodejs';

const COMMITTENTE = 'acea';
const PROIEZIONE = 'matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';
const PAGINA = 1000;

/**
 * GET /api/r/[token]/censimento?v=<versione>
 * Cache offline del censimento Acea. La versione è "<count>:<maxId>": un nuovo import
 * alza max(id) → cambia versione. Se la versione del client coincide risponde
 * { unchanged: true } (check giornaliero minuscolo); altrimenti la proiezione completa.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Il token deve essere un link operatore reale (non gate sullo stato: è dato di riferimento).
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Versione = count + max(id) del dataset acea.
  const { count } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id', { count: 'exact', head: true })
    .eq('committente', COMMITTENTE);
  const { data: maxRow } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id')
    .eq('committente', COMMITTENTE)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versione = `${count ?? 0}:${(maxRow as { id: number } | null)?.id ?? 0}`;

  const vClient = new URL(req.url).searchParams.get('v') ?? '';
  if (vClient === versione) return NextResponse.json({ unchanged: true, versione });

  // Fetch completo PAGINATO (PostgREST tronca a 1000).
  const righe: CensitoMisuratore[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(PROIEZIONE)
      .eq('committente', COMMITTENTE)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    righe.push(...((data ?? []) as CensitoMisuratore[]));
    if (!data || data.length < PAGINA) break;
  }

  return NextResponse.json({ unchanged: false, versione, righe });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "censimento/route" || echo "ok"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/censimento/route.ts"
git commit -m "feat(api): GET /r/[token]/censimento (versione count:maxId, paginato, unchanged short-circuit)"
```

---

### Task 4: modulo client `lib/offline/censimento.ts`

**Files:**
- Create: `lib/offline/censimento.ts`

Nota: tocca IndexedDB/fetch → verifica `tsc`; coperto dall'e2e (Task 6).

- [ ] **Step 1: Implement**

Create `lib/offline/censimento.ts`:

```ts
import { dbCensimento, indexedDbDisponibile } from './db';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

/** Chiave STABILE della cache (non il token del giorno → riuso cross-giorno). */
const CHIAVE = 'acea';

export async function leggiCensimentoLocale(): Promise<{ versione: string; righe: CensitoMisuratore[] } | undefined> {
  if (!indexedDbDisponibile()) return undefined;
  try {
    const rec = await dbCensimento.leggi(CHIAVE);
    if (!rec) return undefined;
    return { versione: rec.versione, righe: rec.righe as CensitoMisuratore[] };
  } catch {
    return undefined;
  }
}

export async function salvaCensimentoLocale(versione: string, righe: CensitoMisuratore[], now: number): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    await dbCensimento.salva({ chiave: CHIAVE, versione, righe, scaricatoIl: now });
  } catch {
    /* best-effort */
  }
}

/**
 * Allinea la cache locale col server (best-effort, solo ONLINE): manda la versione locale;
 * se invariata non scarica nulla, altrimenti salva la nuova proiezione. No-op offline /
 * senza IndexedDB / su errore. NON lancia mai.
 */
export async function aggiornaCensimento(token: string): Promise<void> {
  if (!indexedDbDisponibile()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const locale = await leggiCensimentoLocale();
    const v = locale?.versione ?? '';
    const res = await fetch(`/api/r/${token}/censimento?v=${encodeURIComponent(v)}`);
    if (!res.ok) return;
    const j = (await res.json()) as
      | { unchanged: true; versione: string }
      | { unchanged: false; versione: string; righe: CensitoMisuratore[] };
    if (j.unchanged) return;
    await salvaCensimentoLocale(j.versione, j.righe, Date.now());
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/offline/censimento" || echo "ok"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add lib/offline/censimento.ts
git commit -m "feat(offline): modulo cache censimento (leggi/salva/aggiorna best-effort)"
```

---

### Task 5: `CercaMatricolaLimitazione` usa la cache offline

**Files:**
- Modify: `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`

Nota: componente UI (node senza jsdom) → niente unit; verifica `tsc` + browser.

- [ ] **Step 1: Import + prewarm cache all'apertura**

(a) In testa, cambiare `import { useState } from 'react';` in `import { useEffect, useState } from 'react';`

(b) Aggiungere gli import:

```ts
import { aggiornaCensimento, leggiCensimentoLocale } from '@/lib/offline/censimento';
import { cercaCensimentoLocale } from '@/lib/limitazione/cercaCensimentoLocale';
```

(c) Subito dopo la dichiarazione degli stati (dopo `const [errore, setErrore] = useState<string | null>(null);` e l'eventuale `const [offline, setOffline] = useState(false);`), aggiungere lo stato e l'effetto di prewarm:

```ts
  const [daVerificare, setDaVerificare] = useState(false);

  // All'apertura della ricerca (online) allinea la cache locale del censimento: così
  // l'autofill funziona offline. Best-effort, no-op offline. Riuso cross-giorno (chiave stabile).
  useEffect(() => {
    void aggiornaCensimento(token);
  }, [token]);
```

- [ ] **Step 2: `reset()` azzera anche `daVerificare`**

Aggiungere `setDaVerificare(false);` dentro `reset()`.

- [ ] **Step 3: Offline / errore-rete → cerca nella cache locale**

Sostituire il ramo offline e il `catch` di `cerca` con la versione che consulta la cache. Il ramo offline diventa:

```ts
    // OFFLINE: cerca nella cache locale del censimento (se scaricata). Autofill come online;
    // l'assegnazione "ad altro operatore" è stato del giorno (non nel censimento) → verifica alla sync.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const locale = await leggiCensimentoLocale();
      const esito = locale ? cercaCensimentoLocale(v, locale.righe) : ({ trovato: false, suggerimenti: [] } as const);
      setSuggVoci(simili);
      setOffline(true);
      if (esito.trovato) { setMisuratore(esito.misuratore); setDaVerificare(true); }
      else setSuggerimenti(esito.suggerimenti);
      setCercato(true);
      return;
    }
```

E il blocco `catch` (errore di rete reale) diventa:

```ts
    } catch {
      // Errore di rete: prova comunque la cache locale, poi rivela l'inserimento a mano.
      const locale = await leggiCensimentoLocale();
      const esito = locale ? cercaCensimentoLocale(v, locale.righe) : ({ trovato: false, suggerimenti: [] } as const);
      setSuggVoci(simili);
      setOffline(true);
      if (esito.trovato) { setMisuratore(esito.misuratore); setDaVerificare(true); }
      else setSuggerimenti(esito.suggerimenti);
      setCercato(true);
    } finally {
      setCercando(false);
    }
```

- [ ] **Step 4: Render — gestire il caso "trovato offline (da verificare)"**

Nel blocco `{cercato && (...)}`, cambiare la condizione del ramo "Procedi" così che valga sia per `altroOperatore` sia per `daVerificare`, mostrando in quest'ultimo caso la nota di verifica. Sostituire:

```tsx
          {misuratore && altroOperatore ? (
            <button type="button" onClick={() => onTrovato(misuratore)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
              Procedi comunque (compila i dati)
            </button>
          ) : (
```

con:

```tsx
          {misuratore && (altroOperatore || daVerificare) ? (
            <>
              {daVerificare && (
                <p className="rounded-lg border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] px-3 py-2 text-xs font-semibold text-[var(--warning-fg,#92400e)]">
                  Offline: dati dal censimento locale. L&apos;assegnazione verrà verificata alla sincronizzazione.
                </p>
              )}
              <button type="button" onClick={() => onTrovato(misuratore)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
                Procedi (compila i dati)
              </button>
            </>
          ) : (
```

- [ ] **Step 5: Aggiornare la nota offline del ramo "else"**

Nel ramo `else` (quello con suggerimenti/inserisci a mano), sostituire la nota offline esistente:

```tsx
              {offline && (
                <p className="rounded-lg border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] px-3 py-2 text-xs font-semibold text-[var(--warning-fg,#92400e)]">
                  Offline: censimento non disponibile. Inserisci i dati a mano: verranno verificati alla sincronizzazione.
                </p>
              )}
```

con (copre sia cache-presente che assente):

```tsx
              {offline && (
                <p className="rounded-lg border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] px-3 py-2 text-xs font-semibold text-[var(--warning-fg,#92400e)]">
                  Offline: ricerca dal censimento locale. Se non trovi la matricola inseriscila a mano (verrà verificata alla sincronizzazione).
                </p>
              )}
```

- [ ] **Step 6: Verify tsc + eslint**

Run: `npx tsc --noEmit 2>&1 | grep -E "CercaMatricolaLimitazione" || echo "ok"`
Expected: `ok`.
Run: `npx eslint components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`
Expected: nessun errore nuovo.

- [ ] **Step 7: Commit**

```bash
git add components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx
git commit -m "feat(offline): scansione matricola usa la cache censimento offline (autofill + verifica alla sync)"
```

---

### Task 6: e2e — round-trip cache + versione

**Files:**
- Modify: `app/offline-e2e/HarnessClient.tsx`
- Modify: `e2e/offline.spec.ts`

- [ ] **Step 1: Esporre gli helper censimento nell'harness**

In `app/offline-e2e/HarnessClient.tsx`:

(a) Aggiungere l'import:

```ts
import { aggiornaCensimento, leggiCensimentoLocale } from '@/lib/offline/censimento';
```

(b) Nell'interfaccia `Window['__offline']` aggiungere:

```ts
      aggiornaCensimento: typeof aggiornaCensimento;
      leggiCensimentoLocale: typeof leggiCensimentoLocale;
```

(c) Nell'oggetto assegnato a `window.__offline` aggiungere `aggiornaCensimento,` e `leggiCensimentoLocale,`.

- [ ] **Step 2: Scrivere il test e2e**

Aggiungere in fondo a `e2e/offline.spec.ts`:

```ts
test('censimento: aggiorna scarica e cachea; versione invariata non riscarica', async ({ page }) => {
  const TOKC = 'e2e-censimento';
  let chiamate = 0;
  await page.route('**/api/r/**/censimento**', async (route) => {
    chiamate += 1;
    const url = new URL(route.request().url());
    const v = url.searchParams.get('v') ?? '';
    if (v === '2:200') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unchanged: true, versione: '2:200' }) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unchanged: false, versione: '2:200', righe: [{ matricola: 'M1' }, { matricola: 'M2' }] }),
      });
    }
  });

  await page.goto('/offline-e2e');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  // 1) Prima volta (nessuna cache): scarica e salva.
  await page.evaluate((t) => window.__offline!.aggiornaCensimento(t), TOKC);
  await expect.poll(() => chiamate).toBe(1);
  let locale = await page.evaluate(() => window.__offline!.leggiCensimentoLocale());
  expect(locale?.versione).toBe('2:200');
  expect(locale?.righe.map((r) => r.matricola)).toEqual(['M1', 'M2']);

  // 2) Seconda volta (stessa versione): il server risponde unchanged, la cache resta.
  await page.evaluate((t) => window.__offline!.aggiornaCensimento(t), TOKC);
  await expect.poll(() => chiamate).toBe(2);
  locale = await page.evaluate(() => window.__offline!.leggiCensimentoLocale());
  expect(locale?.versione).toBe('2:200');
  expect(locale?.righe.length).toBe(2);
});
```

- [ ] **Step 3: Eseguire l'e2e**

Run: `PLAYWRIGHT_BROWSERS_PATH="$HOME/AppData/Local/ms-playwright" npx playwright test`
Expected: 4 test PASS (i 3 esistenti + il nuovo censimento).

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "HarnessClient|offline.spec" || echo "ok"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/offline-e2e/HarnessClient.tsx e2e/offline.spec.ts
git commit -m "test(offline): e2e cache censimento (scarica+cachea, unchanged non riscarica)"
```

---

### Task 7: verifica complessiva Fase 2

**Files:** nessuno (gate).

- [ ] **Step 1: tsc**

Run: `npx tsc --noEmit 2>&1 | head -20; echo "[exit ${PIPESTATUS[0]}]"`
Expected: `[exit 0]`.

- [ ] **Step 2: eslint dei file toccati**

Run:
```bash
npx eslint lib/limitazione/cercaCensimentoLocale.ts lib/offline/db.ts lib/offline/censimento.ts "app/api/r/[token]/censimento/route.ts" components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx app/offline-e2e/HarnessClient.tsx e2e/offline.spec.ts
```
Expected: nessun output.

- [ ] **Step 3: unit (limitazione + offline)**

Run: `npx vitest run lib/limitazione lib/offline 2>&1 | grep -E "Test Files|Tests "`
Expected: tutti PASS (incluso `cercaCensimentoLocale.test.ts`).

- [ ] **Step 4: e2e**

Run: `PLAYWRIGHT_BROWSERS_PATH="$HOME/AppData/Local/ms-playwright" npx playwright test`
Expected: 4 PASS.

- [ ] **Step 5: handoff controller**

Niente push: il controller fa fetch + rebase su `origin/main` + push via refspec con OK utente, aggiorna la memoria. Verifica reale su deploy Vercel (SW + IndexedDB attivi solo in prod): aprire il "+" lim_massive ONLINE una volta (scarica la cache) → andare offline → la ricerca matricola fa autofill dal censimento locale.

## Self-review (copertura spec Fase 2)

- Endpoint `GET /censimento?v=` con `unchanged` short-circuit → Task 3. ✓
- Versione `count:maxId` (no `updated_at` in tabella) + fetch paginato (>1000) → Task 3. ✓
- Store `dbCensimento` chiave stabile cross-giorno → Task 2. ✓
- Micro-controllo versione all'apertura (best-effort, no-op offline) → Task 4 + prewarm in Task 5. ✓
- Lookup offline + autofill; "assegnata ad altro operatore" → "da verificare alla sincronizzazione" → Task 5. ✓
- Niente placeholder; tipi coerenti (`CensitoMisuratore`, `EsitoCensimentoLocale`, `CensitoCacheRecord`, versione stringa `"count:maxId"`). ✓
