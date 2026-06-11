# Rapportini offline — Fase 2c-iii: e2e Playwright (data layer offline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un test end-to-end Playwright, in browser reale, che verifica il **data layer offline** non coperto dai test unit (env node): compilazione local-first → coda → comportamento offline → sincronizzazione al ritorno rete, con le `fetch` mockate. Chiude il gap sui moduli browser-only (IndexedDB `db.ts`, orchestratore `sync.ts`, `persistVoce`).

**Architecture:** Un `@playwright/test` minimale (config + un test) gira contro `next dev`. Una **pagina-harness dev-only** (`/__offline-e2e__`, `notFound()` in produzione) espone su `window.__offline` le funzioni del data layer; il test le pilota via `page.evaluate`, mocka `POST /api/r/**/voce` via `page.route`, usa `context.setOffline(...)` per simulare la rete, e asserisce lo stato della coda IndexedDB. Niente backend reale, niente token se:ed.

**Tech Stack:** Playwright `@playwright/test` 1.60.0 (browser chromium-1223 già installati), Next.js 15 (`next dev --turbopack`), IndexedDB.

---

## Contesto di partenza

- Playwright CLI 1.60.0 disponibile via `npx`; browser `chromium-1223` già installati in `~/AppData/Local/ms-playwright`. Il progetto NON ha ancora `@playwright/test` in `package.json` né un config: questo piano lo aggiunge.
- `lib/offline/persistVoce.ts` → `persistiVoce(token, voceId, risposte, now): Promise<boolean>`, `reidrataVoci(token, voci)`.
- `lib/offline/sync.ts` → `sincronizzaToken(token): Promise<boolean>` (early-return se `navigator.onLine === false`; POSTa `voce` a `/api/r/${token}/voce`).
- `lib/offline/db.ts` → `dbOutbox.perToken(token): Promise<OutboxItem[]>`.
- `next dev` usa `.env.local` (presente nel worktree). La pagina-harness è client-side e renderizza senza backend.

> **Convenzione:** commit italiano `test(offline)`/`chore(offline)`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. SEMPRE `cd "C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline"`.

## Struttura file (2c-iii)

**Creati:**
- `playwright.config.ts` — config minimale (testDir `e2e/`, webServer `next dev`, progetto chromium).
- `app/__offline-e2e__/page.tsx` — wrapper server dev-only (`notFound()` in produzione).
- `app/__offline-e2e__/HarnessClient.tsx` — client: espone il data layer su `window.__offline`.
- `e2e/offline.spec.ts` — il test e2e.

**Modificati:**
- `package.json` — `@playwright/test` in devDependencies + script `e2e`.
- `.gitignore` — artefatti Playwright (`/test-results`, `/playwright-report`, `/e2e/.cache`).

---

### Task 1: infra Playwright (dipendenza + config + gitignore)

**Files:** Modify `package.json`, create `playwright.config.ts`, modify `.gitignore`

- [ ] **Step 1: installa la dipendenza (versione pinnata ai browser presenti)**

Run: `npm install -D @playwright/test@1.60.0`
Expected: `@playwright/test@1.60.0` in `devDependencies`, exit 0. (NON eseguire `npx playwright install`: i browser chromium-1223 sono già presenti.)

- [ ] **Step 2: crea `playwright.config.ts`:**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/__offline-e2e__',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: script.** In `package.json` aggiungi a `scripts`: `"e2e": "playwright test"`.

- [ ] **Step 4: gitignore.** Aggiungi a `.gitignore`:
```
/test-results
/playwright-report
/e2e/.cache
```

- [ ] **Step 5: commit**
```
git add package.json package-lock.json playwright.config.ts .gitignore
git commit -m "chore(offline): infra Playwright per e2e (config + dep)"
```

---

### Task 2: pagina-harness dev-only

**Files:** Create `app/__offline-e2e__/page.tsx` + `app/__offline-e2e__/HarnessClient.tsx`

- [ ] **Step 1: wrapper server dev-only** `app/__offline-e2e__/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import HarnessClient from './HarnessClient';

export const dynamic = 'force-dynamic';

/** Pagina di test e2e per il data layer offline. Disponibile SOLO fuori produzione. */
export default function OfflineE2EPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <HarnessClient />;
}
```

- [ ] **Step 2: client harness** `app/__offline-e2e__/HarnessClient.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { persistiVoce, reidrataVoci } from '@/lib/offline/persistVoce';
import { sincronizzaToken } from '@/lib/offline/sync';
import { dbOutbox } from '@/lib/offline/db';

declare global {
  interface Window {
    __offline?: {
      persistiVoce: typeof persistiVoce;
      reidrataVoci: typeof reidrataVoci;
      sincronizzaToken: typeof sincronizzaToken;
      codaPerToken: (token: string) => Promise<Array<{ id: string; type: string; stato: string }>>;
    };
  }
}

/** Espone il data layer offline su window per i test e2e (solo dev). */
export default function HarnessClient() {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    window.__offline = {
      persistiVoce,
      reidrataVoci,
      sincronizzaToken,
      codaPerToken: async (token: string) =>
        (await dbOutbox.perToken(token)).map((i) => ({ id: i.id, type: i.type, stato: i.stato })),
    };
    setPronto(true);
  }, []);
  return <div data-testid="harness">{pronto ? 'pronto' : 'caricamento'}</div>;
}
```

- [ ] **Step 3: verifica tsc** — `npx tsc --noEmit 2>&1 | grep -E "__offline-e2e__|HarnessClient"` → vuoto.

- [ ] **Step 4: commit**
```
git add "app/__offline-e2e__/page.tsx" "app/__offline-e2e__/HarnessClient.tsx"
git commit -m "test(offline): pagina-harness dev-only per e2e data layer"
```

---

### Task 3: test e2e

**Files:** Create `e2e/offline.spec.ts`

- [ ] **Step 1: implementa** `e2e/offline.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const TOK = 'e2e-tok';

test('compila offline → torna online → sincronizza', async ({ page, context }) => {
  // Mock del salvataggio voce: conta le chiamate e risponde 200.
  const postChiamate: string[] = [];
  await page.route('**/api/r/**/voce', async (route) => {
    postChiamate.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/__offline-e2e__');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  // 1) ONLINE: persisti + sincronizza → POST fatto, coda svuotata.
  await page.evaluate(async (t) => {
    await window.__offline!.persistiVoce(t, 'v1', { a: 1 }, Date.now());
    await window.__offline!.sincronizzaToken(t);
  }, TOK);
  await expect.poll(() => postChiamate.length).toBeGreaterThan(0);
  let coda = await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK);
  expect(coda.length).toBe(0);

  // 2) OFFLINE: persisti → resta in coda, nessun nuovo POST.
  await context.setOffline(true);
  const postPrima = postChiamate.length;
  await page.evaluate(async (t) => {
    await window.__offline!.persistiVoce(t, 'v2', { b: 2 }, Date.now());
    await window.__offline!.sincronizzaToken(t);
  }, TOK);
  coda = await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK);
  expect(coda.length).toBe(1);
  expect(postChiamate.length).toBe(postPrima);

  // 3) ONLINE di nuovo: sincronizza → POST fatto, coda svuotata.
  await context.setOffline(false);
  await page.evaluate((t) => window.__offline!.sincronizzaToken(t), TOK);
  await expect.poll(async () => (await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK)).length).toBe(0);
  expect(postChiamate.length).toBeGreaterThan(postPrima);
});
```

- [ ] **Step 2: commit**
```
git add e2e/offline.spec.ts
git commit -m "test(offline): e2e compila offline → online → sincronizza"
```

---

### Task 4: Verifica complessiva 2c-iii (esecuzione e2e — controller)

- [ ] **Step 1 (controller):** esegui l'e2e:
```
PLAYWRIGHT_BROWSERS_PATH="$HOME/AppData/Local/ms-playwright" npx playwright test
```
(oppure `npm run e2e`). Playwright avvia `next dev`, apre la pagina-harness, esegue il test. Expected: **1 passed**. Se `next dev` impiega a partire, il `webServer.timeout` (120s) lo copre.
- [ ] **Step 2:** `npx vitest run lib/offline` → i test unit restano verdi. `npx tsc --noEmit` → 0 errori.
- [ ] **Step 3:** se l'e2e fallisce per timing/ambiente (es. dev server lento, porta occupata), il controller diagnostica (porta, env, log Playwright in `playwright-report`) e ritenta; se l'ambiente non consente l'avvio del dev server, documenta che il test è scritto e gira sulla macchina dell'utente con `npm run e2e`.
- [ ] **Step 4:** commit di chiusura `chore(offline): verifica 2c-iii` (vuoto se nulla).

---

## Self-Review (eseguita)

**Copertura:** e2e del data layer offline (persist → coda → offline non-invia → online sync) → Task 3; infra eseguibile → Task 1,2,4. Mocka la rete (no backend), usa una pagina-harness dev-only (no token se:ed).

**Placeholder:** nessun TODO; codice/comandi completi.

**Coerenza:** `window.__offline.{persistiVoce, sincronizzaToken, codaPerToken}` esposti in `HarnessClient` e usati nel test; firme coerenti con i moduli reali; `codaPerToken` proietta gli `OutboxItem` in oggetti serializzabili (no blob) per `page.evaluate`.

**Rischi noti:** (a) avvio `next dev` nel webServer (lento ma coperto da timeout); (b) isolamento IndexedDB — Playwright dà un context fresco per test → IndexedDB pulito; (c) il test verifica la LOGICA del data layer in browser reale, non l'intera UI del form (quella resta QA su Vercel) — scelta deliberata per un e2e robusto e riproducibile senza backend.

---

## Conclusione Fase 2c / feature

Con 2c-iii la **Fase 2c** è completa: cassetto "da risolvere", invio offline, Background Sync (Android), e2e. L'intera feature "rapportini offline" (Fasi 1 → 2c) è realizzata: consultazione + compilazione (testo + foto) offline, sincronizzazione silenziosa, gestione errori, e copertura test (unit + e2e).
