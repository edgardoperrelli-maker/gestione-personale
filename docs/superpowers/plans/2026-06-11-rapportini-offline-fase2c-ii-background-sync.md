# Rapportini offline — Fase 2c-ii: Background Sync (Android) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Su Android/Chromium, sincronizzare la coda offline **anche ad app chiusa**: quando torna la connessione, il service worker riceve un evento `sync` e drena la coda di tutti i token. I trigger esistenti (online/focus/intervallo) restano e coprono il caso ad-app-aperta; questo aggiunge solo il caso ad-app-chiusa dove supportato.

**Architecture:** Una funzione `drenaTuttiIToken()` (SW-safe: usa solo IndexedDB + fetch + `navigator.onLine`, niente `window`/`document`) itera i token distinti nella coda e chiama `sincronizzaToken` per ciascuno. Il service worker (`app/sw.ts`) registra un listener `sync` che la invoca. Il client registra il tag di background sync quando ci sono elementi in coda (`registraBackgroundSync`). La logica pura (`tokenDistinti`) è testata; il resto è verificato con `tsc` + generazione SW + QA manuale su **dispositivo Android** (iOS Safari non supporta Background Sync — limite documentato).

**Tech Stack:** Next.js 15, Serwist service worker, Background Sync API (SyncManager), IndexedDB.

---

## Contesto di partenza (esistente — leggere prima)

- `app/sw.ts` — service worker Serwist: in fondo `const serwist = new Serwist({...}); serwist.addEventListeners();`. È un modulo TS normale (compilato da Serwist) che PUÒ importare altri moduli `lib/offline/*`.
- `lib/offline/sync.ts` — `sincronizzaToken(token): Promise<boolean>` (SW-safe: usa `indexedDbDisponibile()`, `navigator.onLine`, `dbOutbox`/`dbBlob`/`dbLavoro`, `fetch`; NON usa window/document). `avviaSyncAutomatica` (client-only, usa window/document) **non va importato nel SW**.
- `lib/offline/db.ts` — `dbOutbox.tutti(): Promise<OutboxItem[]>`.
- `lib/offline/types.ts` — `OutboxItem` (ha `token`).
- `lib/offline/useStatoSync.ts` — hook client; in `aggiorna` calcola `inAttesa` (elementi non-bloccati in coda). Punto adatto per registrare il background sync quando c'è lavoro pendente.

> **Convenzione:** commit italiano `feat(offline)`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. SEMPRE `cd "C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline"`. Logica pura con `npx vitest run`; SW/wiring con `npx tsc --noEmit` (NON `npm run build` dai subagent: fallisce su route admin pre-esistente; la generazione del SW la verifica il controller).

## Struttura file (2c-ii)

**Creati:**
- `lib/offline/backgroundSync.ts` + `lib/offline/backgroundSync.test.ts` — `tokenDistinti` (puro, testato), `drenaTuttiIToken` (SW-safe), `registraBackgroundSync` (client).

**Modificati:**
- `app/sw.ts` — listener `sync` che chiama `drenaTuttiIToken`.
- `lib/offline/useStatoSync.ts` — registra il background sync quando ci sono elementi in coda.

---

### Task 1: `backgroundSync.ts` (drena + registra)

**Files:** Create `lib/offline/backgroundSync.ts` + `lib/offline/backgroundSync.test.ts`

- [ ] **Step 1: test (failing)** — `lib/offline/backgroundSync.test.ts` (solo la parte pura `tokenDistinti`):

```ts
import { describe, it, expect } from 'vitest';
import { tokenDistinti } from './backgroundSync';
import type { OutboxItem } from './types';

const item = (token: string, id: string): OutboxItem =>
  ({ id, type: 'voce', token, createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { voceId: id, risposte: {} } });

describe('tokenDistinti', () => {
  it('restituisce i token distinti', () => {
    const out = tokenDistinti([item('a', '1'), item('a', '2'), item('b', '3')]);
    expect(out.sort()).toEqual(['a', 'b']);
  });
  it('lista vuota → array vuoto', () => {
    expect(tokenDistinti([])).toEqual([]);
  });
});
```
Run `npx vitest run lib/offline/backgroundSync.test.ts` → FAIL.

- [ ] **Step 2: implementa** `lib/offline/backgroundSync.ts`:

```ts
import { dbOutbox, indexedDbDisponibile } from './db';
import { sincronizzaToken } from './sync';
import type { OutboxItem } from './types';

export const TAG_BACKGROUND_SYNC = 'rapportini-sync';

/** Token distinti presenti negli elementi della coda. */
export function tokenDistinti(items: OutboxItem[]): string[] {
  return [...new Set(items.map((i) => i.token))];
}

/**
 * Drena la coda di TUTTI i token. SW-safe (solo IndexedDB + fetch + navigator.onLine):
 * usata dal service worker nell'handler `sync` (background sync, app chiusa).
 */
export async function drenaTuttiIToken(): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    const items = await dbOutbox.tutti();
    for (const token of tokenDistinti(items)) {
      await sincronizzaToken(token);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Registra (client-only) un background sync, così alla prossima connettività il SW
 * riceve l'evento `sync` e drena la coda anche ad app chiusa. No-op se non supportato
 * (es. iOS Safari) o fuori dal browser. Idempotente sul tag.
 */
export async function registraBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof self !== 'undefined' && !('SyncManager' in self)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
    if (sync) await sync.register(TAG_BACKGROUND_SYNC);
  } catch {
    /* non supportato / negato: i trigger ad-app-aperta restano comunque attivi */
  }
}
```
Run `npx vitest run lib/offline/backgroundSync.test.ts` → PASS.

- [ ] **Step 3: verifica tsc** — `npx tsc --noEmit 2>&1 | grep "backgroundSync"` → vuoto.

- [ ] **Step 4: commit**
```
git add lib/offline/backgroundSync.ts lib/offline/backgroundSync.test.ts
git commit -m "feat(offline): drenaTuttiIToken + registraBackgroundSync (background sync)"
```

---

### Task 2: handler `sync` nel service worker

**Files:** Modify `app/sw.ts`

- [ ] **Step 1: import.** In cima a `app/sw.ts`, dopo gli import esistenti, aggiungi:
```ts
import { drenaTuttiIToken, TAG_BACKGROUND_SYNC } from '@/lib/offline/backgroundSync';
```

- [ ] **Step 2: handler.** In fondo al file, DOPO `serwist.addEventListeners();`, aggiungi:
```ts
// Background Sync (Android/Chromium): alla connettività, drena la coda anche ad app chiusa.
// iOS Safari non supporta l'evento 'sync' → no-op lì (coperto dai trigger ad-app-aperta).
self.addEventListener('sync', (event) => {
  const e = event as Event & { tag?: string; waitUntil(p: Promise<unknown>): void };
  if (e.tag === TAG_BACKGROUND_SYNC) {
    e.waitUntil(drenaTuttiIToken());
  }
});
```

- [ ] **Step 3: verifica tsc** — `npx tsc --noEmit 2>&1 | grep "sw.ts"` → vuoto. (Il bundle SW lo genera il controller con `npm run build` — vedi Task 4.)

- [ ] **Step 4: commit**
```
git add app/sw.ts
git commit -m "feat(offline): service worker drena la coda su evento sync (background)"
```

---

### Task 3: registra il background sync quando c'è lavoro in coda

**Files:** Modify `lib/offline/useStatoSync.ts`

- [ ] **Step 1: import.** Aggiungi:
```ts
import { registraBackgroundSync } from './backgroundSync';
```

- [ ] **Step 2: registra quando pendente.** Dentro `aggiorna`, dopo la `setStato({...})`, aggiungi:
```ts
      if (inAttesa > 0) void registraBackgroundSync();
```
(Idempotente sul tag; ri-registra finché c'è lavoro in coda, così il SW è armato per la prossima connettività.)

- [ ] **Step 3: verifica** — `npx tsc --noEmit 2>&1 | grep "useStatoSync"` → vuoto. `npx eslint lib/offline/useStatoSync.ts` → nessun errore. `npx vitest run lib/offline` → verde.

- [ ] **Step 4: commit**
```
git add lib/offline/useStatoSync.ts
git commit -m "feat(offline): registra background sync quando la coda ha elementi"
```

---

### Task 4: Verifica complessiva 2c-ii

- [ ] **Step 1:** `npx vitest run lib/offline` → tutti verdi (incluso `tokenDistinti`).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errori.
- [ ] **Step 3 (controller): generazione SW.** Il controller esegue `npm run build` e verifica che la fase Serwist completi e `public/sw.js` venga generato (il build completo fallisce comunque dopo, su una route admin pre-esistente; conta solo che il SW si generi includendo il nuovo handler/bundle di `drenaTuttiIToken`). Conferma: `public/sw.js` presente e contiene `addEventListener` per `sync` (o il bundle relativo).
- [ ] **Step 4 (QA manuale — SOLO Android/Chrome):** apri `/r/<token>` su Chrome Android (deploy), compila qualcosa **offline**, **chiudi l'app/scheda**, riattiva la rete → entro qualche secondo i dati risultano a DB (sync ad app chiusa). Su **iOS Safari** questo non avviene (Background Sync non supportato): la sync parte comunque alla riapertura dell'app (trigger esistenti) — comportamento atteso e documentato.
- [ ] **Step 5:** commit di chiusura `chore(offline): verifica 2c-ii` (vuoto se nulla).

---

## Self-Review (eseguita)

**Copertura:** drena coda lato SW → Task 1,2; registrazione client del tag → Task 3; limite iOS documentato → Task 4.

**Placeholder:** nessun TODO; codice/comandi completi.

**Coerenza tipi:** `tokenDistinti(items)` / `drenaTuttiIToken()` / `registraBackgroundSync()` / `TAG_BACKGROUND_SYNC` coerenti tra `backgroundSync.ts`, `app/sw.ts`, `useStatoSync.ts`. `drenaTuttiIToken` importa solo `sincronizzaToken` (SW-safe), NON `avviaSyncAutomatica`.

**Rischi noti:** (a) il SW bundla `sync.ts`+`db.ts`+catena (tutti moduli TS plain, niente `window`/`document` a top-level → bundle SW-safe; verificato in Task 4 Step 3). (b) Se client (app aperta) e SW (background) sincronizzano insieme, al peggio un doppio invio di un item → gli endpoint sono idempotenti (voce/agenda/invia idempotenti, foto `clientKey`, manuale `richiestaId`). (c) Verifica reale solo su Android (limite della Background Sync API).

---

## Prossimo sotto-piano

- **2c-iii — e2e Playwright offline:** test in browser reale del data layer offline (IndexedDB + sync con fetch mockato): compila → offline → ricarica → online → verifica coda/sync.
