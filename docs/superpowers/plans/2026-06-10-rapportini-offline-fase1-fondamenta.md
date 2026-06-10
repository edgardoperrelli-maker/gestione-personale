# Rapportini offline — Fase 1: Fondamenta (PWA + data layer + idempotenza server) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fornire l'infrastruttura offline per le pagine operatore: un service worker (Serwist) che mette in cache pagine/asset (→ consultazione rapportino/agenda anche senza rete), un data layer locale IndexedDB con coda di sincronizzazione e logica di sync, e due endpoint server resi idempotenti per i re-invii. Nessun cambiamento visibile di compilazione: il wiring dei form è nelle Fasi 2 e 3.

**Architecture:** Service worker via `@serwist/next` (attivo solo nel build di produzione), registrato da un client component montato **solo** sulle pagine `/r/[token]` e `/agenda/[token]`. Runtime caching `NetworkFirst` ristretto per URL alle rotte operatore; precache degli asset statici. Il data layer è in `lib/offline/`: la **logica pura** (modello coda, piano di sync, validazioni) è isolata in moduli testabili in node con vitest; gli **adapter IndexedDB/browser** sono sottili e verificati via e2e nelle fasi successive.

**Tech Stack:** Next.js 15.5 (App Router, build webpack), React 19, Serwist (`@serwist/next` + `serwist`), IndexedDB (API nativa), Supabase (service role lato server), vitest 2 (env node).

---

## Contesto di partenza (codice esistente — NON modificarlo se non indicato)

- `app/r/[token]/page.tsx` — Server Component, carica rapportino+voci da Supabase, rende `RapportinoForm`. Cap iniziale.
- `app/agenda/[token]/page.tsx` — Server Component, rende `AgendaOperatoreClient`.
- `app/api/r/[token]/voce/route.ts` — POST salvataggio risposte (già idempotente, **non si tocca**).
- `app/api/r/[token]/foto-campo/route.ts` — POST upload foto; genera il nome file con `randomUUID()`. **Da rendere idempotente (Task 12).**
- `app/api/r/[token]/intervento-manuale/route.ts` — POST crea intervento manuale; genera `richiestaId` con `randomUUID()`. **Da rendere idempotente (Task 13).**
- `app/api/agenda/[token]/intervento/route.ts` — POST fatto/non-fatto (già idempotente, **non si tocca**).
- `lib/interventi/manuali/anagraficaValida.ts` — `anagraficaValida(anagrafica): boolean` (riusare in Task 7).
- `lib/interventi/manuali/validaFotoObbligatorie.ts` — `campiFoto(campi)`, `validaFotoObbligatorie(campi, presenti): { ok, mancanti }` (riusare in Task 7).
- `vitest.config.ts` — env `node`, include `**/*.test.ts`, alias `@` → root. I test girano in node: **niente DOM/IndexedDB nei test unitari**.
- Build: `npm run build` = `next build` (webpack). Dev: `npm run dev` = `next dev --turbopack` (il SW **non** viene generato in dev turbopack).

## Struttura file (Fase 1)

**Creati:**
- `lib/offline/types.ts` — tipi condivisi del data layer (nessuna logica).
- `lib/offline/outboxModel.ts` + `.test.ts` — logica pura della coda (coalescing, transizioni di stato).
- `lib/offline/syncPlan.ts` + `.test.ts` — logica pura: ordinamento FIFO + dipendenza foto→voce + gating `invia`.
- `lib/offline/validateManuale.ts` + `.test.ts` — pre-validazione client dell'intervento manuale (riusa helper esistenti).
- `lib/offline/db.ts` — adapter IndexedDB (browser-only, 4 store).
- `lib/offline/snapshot.ts` — salva/legge snapshot del token (browser-only).
- `lib/offline/compressImage.ts` — compressione foto lato client (browser-only).
- `lib/offline/sync.ts` — orchestratore di sincronizzazione (browser-only).
- `app/sw.ts` — sorgente service worker (Serwist).
- `components/offline/ServiceWorkerRegister.tsx` — registra il SW (client).
- `app/api/r/[token]/foto-campo/idempotenza.ts` + `.test.ts` — helper puro per il path idempotente delle foto.
- `app/api/r/[token]/intervento-manuale/idempotenza.test.ts` — test dell'helper di sanitizzazione id (helper in `lib/offline/idRichiesta.ts`).
- `lib/offline/idRichiesta.ts` + (test sopra) — validazione/sanitizzazione UUID richiesta.

**Modificati:**
- `next.config.mjs` — `withSerwistInit`.
- `tsconfig.json` — assicurare che `app/sw.ts` non rompa il typecheck (lib WebWorker via tripla-slash nel file).
- `app/r/[token]/page.tsx` — montare `<ServiceWorkerRegister />`.
- `app/agenda/[token]/page.tsx` — montare `<ServiceWorkerRegister />`.
- `app/api/r/[token]/foto-campo/route.ts` — accettare `clientKey`.
- `app/api/r/[token]/intervento-manuale/route.ts` — accettare `richiestaId` idempotente.

> **Convenzione commit:** ogni Task termina con un commit. Messaggi in italiano, prefisso `feat(offline):` o `test(offline):`/`chore(offline):`. Aggiungere il trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Installare Serwist e collegare `next.config.mjs`

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `next.config.mjs`
- Create: `app/sw.ts` (placeholder minimo per far funzionare il build)

- [ ] **Step 1: Installare le dipendenze**

Run:
```bash
npm install @serwist/next serwist
```
Expected: `@serwist/next` e `serwist` aggiunti a `dependencies` in `package.json`, exit 0.

- [ ] **Step 2: Creare un `app/sw.ts` minimo**

Crea `app/sw.ts` con il contenuto seguente (verrà ampliato nel Task 2; serve un file valido perché `swSrc` lo richiede):

```ts
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [],
});

serwist.addEventListeners();
```

- [ ] **Step 3: Avvolgere la config con `withSerwistInit`**

Sostituisci il contenuto di `next.config.mjs` con:

```js
/** @type {import('next').NextConfig} */
import withSerwistInit from '@serwist/next';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/pdf_sopralluoghi/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/pdf' },
          { key: 'Content-Disposition', value: 'inline' },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Il SW viene generato solo nel build di produzione: in `next dev --turbopack`
  // il plugin webpack non gira e il SW non esiste (atteso).
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
```

- [ ] **Step 4: Verificare che il build di produzione generi il SW**

Run:
```bash
npm run build
```
Expected: build completato con exit 0; il file `public/sw.js` viene generato (Serwist logga "Serwist… compiled successfully" o simile). Verifica:
```bash
test -f public/sw.js && echo "sw.js OK"
```
Expected output: `sw.js OK`

- [ ] **Step 5: Ignorare gli artefatti SW generati**

Aggiungi a `.gitignore` (se non già presenti) le righe:
```
public/sw.js
public/sw.js.map
public/swe-worker-*.js
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.mjs app/sw.ts .gitignore
git commit -m "feat(offline): integra Serwist (service worker) nel build di produzione"
```

---

### Task 2: Runtime caching del service worker (rotte operatore)

**Files:**
- Modify: `app/sw.ts`

- [ ] **Step 1: Scrivere le regole di runtime caching**

Sostituisci il contenuto di `app/sw.ts` con:

```ts
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const SETTE_GIORNI = 7 * 24 * 60 * 60;
const TRENTA_GIORNI = 30 * 24 * 60 * 60;

/** Navigazioni alle pagine operatore: rete-poi-cache (offline serve l'ultima versione vista). */
const navigazioneOperatore: RuntimeCaching = {
  matcher: ({ request, url }) =>
    request.mode === 'navigate' &&
    (url.pathname.startsWith('/r/') || url.pathname.startsWith('/agenda/')),
  handler: new NetworkFirst({
    cacheName: 'operatore-pagine',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: SETTE_GIORNI })],
  }),
};

/** GET delle API operatore in sola lettura: rete-poi-cache. */
const apiOperatore: RuntimeCaching = {
  matcher: ({ request, url }) =>
    request.method === 'GET' && url.pathname.startsWith('/api/r/'),
  handler: new NetworkFirst({
    cacheName: 'operatore-api',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: SETTE_GIORNI })],
  }),
};

/** Asset statici stessa-origine (JS/CSS/font/worker): il codice del form gira offline. */
const assetStatici: RuntimeCaching = {
  matcher: ({ request, sameOrigin }) =>
    sameOrigin && ['style', 'script', 'worker', 'font'].includes(request.destination),
  handler: new StaleWhileRevalidate({ cacheName: 'asset-statici' }),
};

/** Immagini stessa-origine. */
const immagini: RuntimeCaching = {
  matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
  handler: new CacheFirst({
    cacheName: 'immagini',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: TRENTA_GIORNI })],
  }),
};

// NB: NON usiamo defaultCache come catch-all per le navigazioni: così le pagine
// non-operatore (/hub, login) NON vengono servite dalla cache (online invariate,
// offline falliscono normalmente). `defaultCache` è importato solo per riferimento
// e NON incluso, per restare aderenti al perimetro deciso nello spec.
void defaultCache;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [navigazioneOperatore, apiOperatore, assetStatici, immagini],
});

serwist.addEventListeners();
```

- [ ] **Step 2: Verificare il build**

Run:
```bash
npm run build
```
Expected: exit 0, `public/sw.js` rigenerato senza errori di tipo.

- [ ] **Step 3: Verifica manuale offline (consultazione)**

Run:
```bash
npm run start
```
Poi nel browser: apri `http://localhost:3000/r/<un-token-valido>` con rete → DevTools → Application → Service Workers: il SW risulta "activated". Application → Cache Storage: compare `operatore-pagine`. Spunta "Offline" in Network → ricarica: la pagina si apre comunque (dati dell'ultima visita).
Expected: pagina operatore visibile offline; le pagine `/hub/*` NON si aprono offline (corretto).

> Se in questo momento `<ServiceWorkerRegister />` non è ancora montato (Task 3), registra manualmente da console: `navigator.serviceWorker.register('/sw.js')` per la verifica.

- [ ] **Step 4: Commit**

```bash
git add app/sw.ts
git commit -m "feat(offline): runtime caching SW limitato alle rotte operatore"
```

---

### Task 3: Registrazione del SW solo sulle pagine operatore

**Files:**
- Create: `components/offline/ServiceWorkerRegister.tsx`
- Modify: `app/r/[token]/page.tsx` (montaggio del componente)
- Modify: `app/agenda/[token]/page.tsx` (montaggio del componente)

- [ ] **Step 1: Creare il componente di registrazione**

Crea `components/offline/ServiceWorkerRegister.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

/**
 * Registra il service worker SOLO dove questo componente è montato (pagine operatore).
 * In sviluppo (`next dev --turbopack`) il SW non viene generato: la guardia su
 * NODE_ENV evita un 404 su /sw.js. In produzione/preview Vercel il SW esiste.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* registrazione non critica: l'app resta usabile online */
    });
  }, []);
  return null;
}
```

- [ ] **Step 2: Montare il componente nella pagina rapportino**

In `app/r/[token]/page.tsx`, aggiungi l'import in cima:
```ts
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
```
e dentro il `return (<main …>` finale (quello che contiene `<RapportinoForm …/>`), aggiungi `<ServiceWorkerRegister />` come primo figlio:
```tsx
  return (
    <main className="min-h-dvh bg-[var(--brand-bg)] text-[var(--brand-text-main)]">
      <ServiceWorkerRegister />
      <RapportinoForm
        token={token}
        /* …props invariate… */
      />
    </main>
  );
```

- [ ] **Step 3: Montare il componente nella pagina agenda**

In `app/agenda/[token]/page.tsx`, aggiungi l'import:
```ts
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
```
e rendi `<ServiceWorkerRegister />` accanto a `<AgendaOperatoreClient …/>`. Poiché oggi il `return` è direttamente `<AgendaOperatoreClient …/>`, avvolgilo in un fragment:
```tsx
  return (
    <>
      <ServiceWorkerRegister />
      <AgendaOperatoreClient
        token={token}
        /* …props invariate… */
      />
    </>
  );
```

- [ ] **Step 4: Verificare build + typecheck**

Run:
```bash
npm run build
```
Expected: exit 0.

- [ ] **Step 5: Verifica manuale**

Run `npm run start`, apri una pagina `/r/<token>`: in DevTools → Application → Service Workers il SW è "activated" **senza** registrazione manuale. Apri `/hub` (da loggato): il SW resta attivo (controlla l'origine) ma le navigazioni hub non vengono messe in cache.
Expected: SW registrato solo aprendo pagine operatore.

- [ ] **Step 6: Commit**

```bash
git add components/offline/ServiceWorkerRegister.tsx app/r/[token]/page.tsx app/agenda/[token]/page.tsx
git commit -m "feat(offline): registra il service worker solo sulle pagine operatore"
```

---

### Task 4: Tipi condivisi del data layer

**Files:**
- Create: `lib/offline/types.ts`

- [ ] **Step 1: Definire i tipi**

Crea `lib/offline/types.ts`:

```ts
/** Tipi del data layer offline (condivisi tra logica pura e adapter IndexedDB). */

export type OutboxType = 'voce' | 'foto' | 'agenda' | 'manuale' | 'invia';
export type OutboxStato = 'in_attesa' | 'in_invio' | 'errore' | 'bloccato';

export type PayloadVoce = { voceId: string; risposte: Record<string, unknown> };
export type PayloadFoto = { voceId: string; chiave: string; blobId: string; clientKey: string };
export type PayloadAgenda = {
  interventoId: string;
  azione: 'fatto' | 'non_fatto';
  causale?: string | null;
  motivo?: string | null;
};
export type PayloadManuale = {
  richiestaId: string;
  committente: string;
  anagrafica: Record<string, unknown>;
  risposte: Record<string, unknown>;
  note?: string | null;
  fotoBlobRefs: Array<{ chiave: string; blobId: string }>;
};
export type PayloadInvia = Record<string, never>;

export type OutboxItem =
  | { id: string; type: 'voce'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadVoce }
  | { id: string; type: 'foto'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadFoto }
  | { id: string; type: 'agenda'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadAgenda }
  | { id: string; type: 'manuale'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadManuale }
  | { id: string; type: 'invia'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadInvia };

/** Snapshot dati per la consultazione offline (per token). */
export type SnapshotRapportino = {
  token: string;
  tipo: 'rapportino';
  aggiornatoIl: number;
  dati: unknown; // pacchetto serializzabile delle props del form
};
export type SnapshotAgenda = {
  token: string;
  tipo: 'agenda';
  aggiornatoIl: number;
  dati: unknown;
};
export type Snapshot = SnapshotRapportino | SnapshotAgenda;

/** Voce di lavoro locale: risposte correnti di una voce (sopravvive al reload offline). */
export type LavoroVoce = {
  chiave: string; // `${token}:${voceId}`
  token: string;
  voceId: string;
  risposte: Record<string, unknown>;
  aggiornatoIl: number;
};
```

- [ ] **Step 2: Verificare il typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: nessun nuovo errore relativo a `lib/offline/types.ts` (ignora errori preesistenti altrove).

- [ ] **Step 3: Commit**

```bash
git add lib/offline/types.ts
git commit -m "feat(offline): tipi condivisi del data layer offline"
```

---

### Task 5: Modello coda (logica pura) — coalescing e transizioni

**Files:**
- Create: `lib/offline/outboxModel.ts`
- Test: `lib/offline/outboxModel.test.ts`

- [ ] **Step 1: Scrivere i test (failing)**

Crea `lib/offline/outboxModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chiaveCoalescing, applicaUpsert, marcaErrore, prossimoTentativoMs } from './outboxModel';
import type { OutboxItem } from './types';

function voce(id: string, token: string, voceId: string, risposte: Record<string, unknown>, createdAt = 1): OutboxItem {
  return { id, type: 'voce', token, voceId: undefined as never, createdAt, tentativi: 0, stato: 'in_attesa', payload: { voceId, risposte } } as OutboxItem;
}

describe('chiaveCoalescing', () => {
  it('le voci coalescono per (token, voceId)', () => {
    const a = voce('1', 'tok', 'v1', { a: 1 });
    expect(chiaveCoalescing(a)).toBe('voce:tok:v1');
  });
  it('agenda coalesce per (token, interventoId)', () => {
    const a: OutboxItem = { id: '2', type: 'agenda', token: 'tok', createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { interventoId: 'i1', azione: 'fatto' } };
    expect(chiaveCoalescing(a)).toBe('agenda:tok:i1');
  });
  it('foto/manuale/invia NON coalescono (chiave per id)', () => {
    const f: OutboxItem = { id: '3', type: 'foto', token: 'tok', createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { voceId: 'v1', chiave: 'foto1', blobId: 'b1', clientKey: 'k1' } };
    expect(chiaveCoalescing(f)).toBe('foto:3');
  });
});

describe('applicaUpsert', () => {
  it('sostituisce una voce esistente con la stessa chiave di coalescing mantenendo l\'id originale', () => {
    const esistenti = [voce('1', 'tok', 'v1', { a: 1 }, 10)];
    const nuovo = voce('2', 'tok', 'v1', { a: 2 }, 20);
    const out = applicaUpsert(esistenti, nuovo);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1'); // id stabile
    expect((out[0].payload as { risposte: unknown }).risposte).toEqual({ a: 2 }); // ultima versione
    expect(out[0].createdAt).toBe(10); // posizione FIFO preservata
  });
  it('aggiunge in coda quando non c\'è coalescing', () => {
    const esistenti = [voce('1', 'tok', 'v1', { a: 1 }, 10)];
    const nuovo: OutboxItem = { id: '3', type: 'foto', token: 'tok', createdAt: 20, tentativi: 0, stato: 'in_attesa', payload: { voceId: 'v1', chiave: 'f', blobId: 'b', clientKey: 'k' } };
    const out = applicaUpsert(esistenti, nuovo);
    expect(out).toHaveLength(2);
  });
});

describe('marcaErrore / prossimoTentativoMs', () => {
  it('incrementa i tentativi e imposta stato errore', () => {
    const a = voce('1', 'tok', 'v1', { a: 1 });
    const out = marcaErrore(a, 'rete');
    expect(out.tentativi).toBe(1);
    expect(out.stato).toBe('errore');
    expect(out.ultimoErrore).toBe('rete');
  });
  it('backoff esponenziale con tetto a 60s', () => {
    expect(prossimoTentativoMs(1)).toBe(1000);
    expect(prossimoTentativoMs(2)).toBe(2000);
    expect(prossimoTentativoMs(3)).toBe(4000);
    expect(prossimoTentativoMs(10)).toBe(60000); // tetto
  });
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run:
```bash
npx vitest run lib/offline/outboxModel.test.ts
```
Expected: FAIL — `Cannot find module './outboxModel'`.

- [ ] **Step 3: Implementare il modello**

Crea `lib/offline/outboxModel.ts`:

```ts
import type { OutboxItem } from './types';

/**
 * Chiave di coalescing: voci e agenda si "fondono" (una sola in coda per entità,
 * con l'ultima versione); foto/manuale/invia restano distinte (chiave per id).
 */
export function chiaveCoalescing(item: OutboxItem): string {
  if (item.type === 'voce') return `voce:${item.token}:${item.payload.voceId}`;
  if (item.type === 'agenda') return `agenda:${item.token}:${item.payload.interventoId}`;
  return `${item.type}:${item.id}`;
}

/**
 * Upsert con coalescing: se esiste un elemento con la stessa chiave, lo sostituisce
 * mantenendo l'`id` e il `createdAt` originali (posizione FIFO stabile); altrimenti
 * accoda il nuovo elemento.
 */
export function applicaUpsert(esistenti: OutboxItem[], nuovo: OutboxItem): OutboxItem[] {
  const chiave = chiaveCoalescing(nuovo);
  const idx = esistenti.findIndex((e) => chiaveCoalescing(e) === chiave);
  if (idx === -1) return [...esistenti, nuovo];
  const precedente = esistenti[idx];
  const fuso = { ...nuovo, id: precedente.id, createdAt: precedente.createdAt, tentativi: 0, stato: 'in_attesa', ultimoErrore: undefined } as OutboxItem;
  const out = esistenti.slice();
  out[idx] = fuso;
  return out;
}

/** Marca un elemento come fallito (incrementa i tentativi). */
export function marcaErrore(item: OutboxItem, errore: string): OutboxItem {
  return { ...item, tentativi: item.tentativi + 1, stato: 'errore', ultimoErrore: errore };
}

/** Backoff esponenziale: 1s, 2s, 4s, … con tetto a 60s. */
export function prossimoTentativoMs(tentativi: number): number {
  return Math.min(1000 * 2 ** (tentativi - 1), 60000);
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run:
```bash
npx vitest run lib/offline/outboxModel.test.ts
```
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/outboxModel.ts lib/offline/outboxModel.test.ts
git commit -m "feat(offline): modello coda con coalescing e backoff (logica pura)"
```

---

### Task 6: Piano di sincronizzazione (logica pura) — ordine ed esito

**Files:**
- Create: `lib/offline/syncPlan.ts`
- Test: `lib/offline/syncPlan.test.ts`

Definizioni: dato l'insieme degli `OutboxItem` di un token, produrre la **sequenza ordinata** in cui inviarli, rispettando: (1) foto prima delle voci che le referenziano; (2) `invia` per ultimo e solo se non resta altro per quel token; (3) per il resto, ordine FIFO per `createdAt`. La funzione decide anche, dato l'esito HTTP, se l'elemento è **completato**, **da ritentare** o **bloccato** (errore definitivo).

- [ ] **Step 1: Scrivere i test (failing)**

Crea `lib/offline/syncPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ordineInvio, classificaEsito } from './syncPlan';
import type { OutboxItem } from './types';

const base = { token: 'tok', tentativi: 0, stato: 'in_attesa' as const };

function it_(type: OutboxItem['type'], id: string, createdAt: number, payload: unknown): OutboxItem {
  return { ...base, id, type, createdAt, payload } as OutboxItem;
}

describe('ordineInvio', () => {
  it('mette le foto prima delle voci', () => {
    const voce = it_('voce', 'a', 10, { voceId: 'v1', risposte: {} });
    const foto = it_('foto', 'b', 20, { voceId: 'v1', chiave: 'f', blobId: 'bl', clientKey: 'k' });
    const out = ordineInvio([voce, foto]);
    expect(out.map((x) => x.type)).toEqual(['foto', 'voce']);
  });
  it('mette invia per ultimo', () => {
    const invia = it_('invia', 'a', 5, {});
    const voce = it_('voce', 'b', 10, { voceId: 'v1', risposte: {} });
    const out = ordineInvio([invia, voce]);
    expect(out.map((x) => x.type)).toEqual(['voce', 'invia']);
  });
  it('esclude invia se restano altri elementi non-invia in errore definitivo', () => {
    const invia = it_('invia', 'a', 5, {});
    const voce = { ...it_('voce', 'b', 10, { voceId: 'v1', risposte: {} }), stato: 'bloccato' as const };
    const out = ordineInvio([invia, voce]);
    // la voce bloccata non è inviabile e blocca l'invio finale
    expect(out.find((x) => x.type === 'invia')).toBeUndefined();
  });
  it('a parità di priorità ordina per createdAt', () => {
    const v2 = it_('voce', 'a', 30, { voceId: 'v2', risposte: {} });
    const v1 = it_('voce', 'b', 10, { voceId: 'v1', risposte: {} });
    const out = ordineInvio([v2, v1]);
    expect(out.map((x) => x.createdAt)).toEqual([10, 30]);
  });
});

describe('classificaEsito', () => {
  it('2xx → completato', () => {
    expect(classificaEsito(200).esito).toBe('completato');
    expect(classificaEsito(204).esito).toBe('completato');
  });
  it('409/403/422 → bloccato (errore definitivo) con motivo', () => {
    expect(classificaEsito(409).esito).toBe('bloccato');
    expect(classificaEsito(403).esito).toBe('bloccato');
    expect(classificaEsito(422).esito).toBe('bloccato');
  });
  it('5xx e 0 (rete) → da ritentare', () => {
    expect(classificaEsito(500).esito).toBe('ritenta');
    expect(classificaEsito(0).esito).toBe('ritenta');
  });
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run:
```bash
npx vitest run lib/offline/syncPlan.test.ts
```
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare il piano**

Crea `lib/offline/syncPlan.ts`:

```ts
import type { OutboxItem } from './types';

/** Priorità di tipo: foto(0) → manuale(1) → voce(2) → agenda(2) → invia(9, sempre ultimo). */
function priorita(type: OutboxItem['type']): number {
  switch (type) {
    case 'foto': return 0;
    case 'manuale': return 1;
    case 'voce': return 2;
    case 'agenda': return 2;
    case 'invia': return 9;
  }
}

/**
 * Ordina gli elementi di un token per l'invio:
 * - foto/manuale prima delle voci (le foto producono i path che le voci referenziano);
 * - `invia` per ultimo, e SOLO se non resta nessun altro elemento (inclusi i bloccati):
 *   un rapportino non va inviato finché c'è lavoro non sincronizzato.
 */
export function ordineInvio(items: OutboxItem[]): OutboxItem[] {
  const nonInvia = items.filter((i) => i.type !== 'invia');
  const invia = items.filter((i) => i.type === 'invia');
  const ordinati = nonInvia
    .slice()
    .sort((a, b) => priorita(a.type) - priorita(b.type) || a.createdAt - b.createdAt);

  // Se non resta nessun altro elemento: restituisci solo il primo invia (se esiste).
  if (nonInvia.length === 0) {
    if (invia.length === 0) return [];
    return [invia.sort((a, b) => a.createdAt - b.createdAt)[0]];
  }

  // Se c'è almeno un elemento non-invia bloccato, NON inviare (il rapportino non va
  // chiuso finché resta lavoro irrisolto): escludi invia.
  if (nonInvia.some((i) => i.stato === 'bloccato')) return ordinati;

  // Altrimenti appendi invia in coda (ultimo): nello stesso giro parte solo dopo che
  // gli altri elementi sono stati inviati con successo (l'orchestratore interrompe
  // su errore di rete prima di arrivare a invia).
  return [...ordinati, ...invia.slice().sort((a, b) => a.createdAt - b.createdAt)];
}

export type EsitoSync =
  | { esito: 'completato' }
  | { esito: 'ritenta' }
  | { esito: 'bloccato'; motivo: string };

/** Classifica l'esito HTTP di un invio. status 0 = errore di rete. */
export function classificaEsito(status: number): EsitoSync {
  if (status >= 200 && status < 300) return { esito: 'completato' };
  // Transitori → ritenta: errore di rete (0), troppe richieste (429), errori server (5xx).
  if (status === 0 || status === 429 || status >= 500) return { esito: 'ritenta' };
  // Errori client permanenti (4xx): ritentare non aiuta → bloccato (le route operatore
  // usano 400/404 per condizioni definitive, quindi NON vanno ritentate all'infinito).
  if (status === 403) return { esito: 'bloccato', motivo: 'Giornata già chiusa' };
  if (status === 409) return { esito: 'bloccato', motivo: 'Link scaduto o non più modificabile' };
  if (status === 422) return { esito: 'bloccato', motivo: 'Dati non validi' };
  return { esito: 'bloccato', motivo: 'Richiesta non valida' };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run:
```bash
npx vitest run lib/offline/syncPlan.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offline/syncPlan.ts lib/offline/syncPlan.test.ts
git commit -m "feat(offline): piano di sincronizzazione ordine+esito (logica pura)"
```

---

### Task 7: Pre-validazione client dell'intervento manuale

**Files:**
- Create: `lib/offline/validateManuale.ts`
- Test: `lib/offline/validateManuale.test.ts`

Riusa `anagraficaValida` e `validaFotoObbligatorie`/`campiFoto` esistenti per validare **prima** di accodare un intervento manuale offline, riducendo i rifiuti 422 al sync.

- [ ] **Step 1: Scrivere i test (failing)**

Crea `lib/offline/validateManuale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validaManualeClient } from './validateManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'foto_contatore', tipo: 'foto', etichetta: 'Foto contatore', ordine: 1, obbligatoria: true } as TemplateCampo,
];

describe('validaManualeClient', () => {
  it('ok con anagrafica valida e foto obbligatorie presenti', () => {
    const r = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campi,
      slotFotoPresenti: { foto_contatore: true },
    });
    expect(r.ok).toBe(true);
  });
  it('errore se manca identificativo/indirizzo', () => {
    const r = validaManualeClient({
      anagrafica: { note: 'x' },
      campiTemplate: campi,
      slotFotoPresenti: { foto_contatore: true },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/identificativo|indirizzo/i);
  });
  it('errore se manca una foto obbligatoria', () => {
    const r = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campi,
      slotFotoPresenti: { foto_contatore: false },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/foto/i);
  });
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run:
```bash
npx vitest run lib/offline/validateManuale.test.ts
```
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare la validazione**

Crea `lib/offline/validateManuale.ts`:

```ts
import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';
import { validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type EsitoValidazione = { ok: true } | { ok: false; motivo: string };

/**
 * Pre-validazione lato client dell'intervento manuale, identica alle regole server,
 * così offline accodiamo solo richieste valide (meno rifiuti 422 al sync).
 */
export function validaManualeClient(args: {
  anagrafica: Record<string, unknown>;
  campiTemplate: TemplateCampo[];
  slotFotoPresenti: Record<string, boolean>;
}): EsitoValidazione {
  if (!anagraficaValida(args.anagrafica)) {
    return { ok: false, motivo: 'Indicare almeno un identificativo (PDR, ODL o matricola) e un campo indirizzo (via o comune).' };
  }
  const esito = validaFotoObbligatorie(args.campiTemplate, args.slotFotoPresenti);
  if (!esito.ok) {
    return { ok: false, motivo: `Foto obbligatorie mancanti: ${esito.mancanti.join(', ')}` };
  }
  return { ok: true };
}
```

> **Nota per l'esecutore:** verifica le firme reali di `anagraficaValida` e `validaFotoObbligatorie` in `lib/interventi/manuali/`. Se `validaFotoObbligatorie` accetta un formato diverso da `Record<string, boolean>`, adatta la chiamata (l'oggetto `slotFotoPresenti` mappa `chiave → presente`). Mantieni invariata la firma pubblica `validaManualeClient`.

- [ ] **Step 4: Eseguire i test (devono passare)**

Run:
```bash
npx vitest run lib/offline/validateManuale.test.ts
```
Expected: PASS. Se i tipi `TemplateCampo` richiedono campi aggiuntivi, completa l'oggetto `campi` nel test di conseguenza.

- [ ] **Step 5: Commit**

```bash
git add lib/offline/validateManuale.ts lib/offline/validateManuale.test.ts
git commit -m "feat(offline): pre-validazione client intervento manuale"
```

---

### Task 8: Adapter IndexedDB (browser-only)

**Files:**
- Create: `lib/offline/db.ts`

Adapter sottile sui 4 store. Nessun unit test in node (IndexedDB assente); verificato via e2e in Fase 2.

- [ ] **Step 1: Implementare l'adapter**

Crea `lib/offline/db.ts`:

```ts
import type { OutboxItem, Snapshot, LavoroVoce } from './types';

const DB_NAME = 'rapportini-offline';
const DB_VERSION = 1;
const STORE_SNAPSHOT = 'snapshot';
const STORE_LAVORO = 'lavoro';
const STORE_OUTBOX = 'outbox';
const STORE_BLOB = 'blob';

function apriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) db.createObjectStore(STORE_SNAPSHOT, { keyPath: 'token' });
      if (!db.objectStoreNames.contains(STORE_LAVORO)) db.createObjectStore(STORE_LAVORO, { keyPath: 'chiave' });
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const s = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        s.createIndex('per_token', 'token', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOB)) db.createObjectStore(STORE_BLOB, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return apriDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function tutti<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

/* ── Snapshot ─────────────────────────────────────────────────────────────── */
export const dbSnapshot = {
  salva: (snap: Snapshot) => tx(STORE_SNAPSHOT, 'readwrite', (s) => s.put(snap)),
  leggi: (token: string) => tx<Snapshot | undefined>(STORE_SNAPSHOT, 'readonly', (s) => s.get(token) as IDBRequest<Snapshot | undefined>),
};

/* ── Lavoro (risposte locali per voce) ────────────────────────────────────── */
export const dbLavoro = {
  salva: (l: LavoroVoce) => tx(STORE_LAVORO, 'readwrite', (s) => s.put(l)),
  perToken: async (token: string): Promise<LavoroVoce[]> => {
    const all = await tutti<LavoroVoce>(STORE_LAVORO);
    return all.filter((l) => l.token === token);
  },
  rimuovi: (chiave: string) => tx(STORE_LAVORO, 'readwrite', (s) => s.delete(chiave)),
};

/* ── Outbox ───────────────────────────────────────────────────────────────── */
export const dbOutbox = {
  tutti: () => tutti<OutboxItem>(STORE_OUTBOX),
  perToken: async (token: string): Promise<OutboxItem[]> => {
    const all = await tutti<OutboxItem>(STORE_OUTBOX);
    return all.filter((i) => i.token === token);
  },
  put: (item: OutboxItem) => tx(STORE_OUTBOX, 'readwrite', (s) => s.put(item)),
  rimuovi: (id: string) => tx(STORE_OUTBOX, 'readwrite', (s) => s.delete(id)),
};

/* ── Blob foto ────────────────────────────────────────────────────────────── */
export const dbBlob = {
  salva: (id: string, blob: Blob) => tx(STORE_BLOB, 'readwrite', (s) => s.put({ id, blob })),
  leggi: async (id: string): Promise<Blob | undefined> => {
    const r = await tx<{ id: string; blob: Blob } | undefined>(STORE_BLOB, 'readonly', (s) => s.get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>);
    return r?.blob;
  },
  rimuovi: (id: string) => tx(STORE_BLOB, 'readwrite', (s) => s.delete(id)),
};

/** Disponibilità di IndexedDB (false in SSR o browser senza supporto). */
export function indexedDbDisponibile(): boolean {
  return typeof indexedDB !== 'undefined';
}
```

- [ ] **Step 2: Verificare il typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: nessun nuovo errore in `lib/offline/db.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/offline/db.ts
git commit -m "feat(offline): adapter IndexedDB (snapshot/lavoro/outbox/blob)"
```

---

### Task 9: Snapshot helper (browser-only)

**Files:**
- Create: `lib/offline/snapshot.ts`

- [ ] **Step 1: Implementare**

Crea `lib/offline/snapshot.ts`:

```ts
import { dbSnapshot, indexedDbDisponibile } from './db';
import type { Snapshot } from './types';

/** Salva lo snapshot dei dati del token per la consultazione offline. Best-effort. */
export async function salvaSnapshot(token: string, tipo: 'rapportino' | 'agenda', dati: unknown): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    const snap = { token, tipo, dati, aggiornatoIl: Date.now() } as Snapshot;
    await dbSnapshot.salva(snap);
  } catch {
    /* quota/permessi: non bloccare l'app */
  }
}

/** Legge lo snapshot del token (undefined se assente o IndexedDB non disponibile). */
export async function leggiSnapshot(token: string): Promise<Snapshot | undefined> {
  if (!indexedDbDisponibile()) return undefined;
  try {
    return await dbSnapshot.leggi(token);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add lib/offline/snapshot.ts
git commit -m "feat(offline): helper snapshot consultazione offline"
```

---

### Task 10: Compressione foto lato client (browser-only)

**Files:**
- Create: `lib/offline/compressImage.ts`

- [ ] **Step 1: Implementare**

Crea `lib/offline/compressImage.ts`:

```ts
/**
 * Comprime un'immagine lato client per ridurre l'occupazione in IndexedDB e il
 * peso dell'upload. Ridimensiona al lato massimo `maxLato` e ricodifica in JPEG.
 * In caso di errore restituisce il file originale (best-effort).
 */
export async function comprimiImmagine(file: File, maxLato = 1600, qualita = 0.7): Promise<Blob> {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file);
    const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scala);
    const h = Math.round(bitmap.height * scala);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: qualita });
    }
    return await new Promise<Blob>((resolve) =>
      (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? file), 'image/jpeg', qualita),
    );
  } catch {
    return file;
  }
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: nessun nuovo errore (se `OffscreenCanvas`/`createImageBitmap` mancano nei lib DOM, aggiungi `"dom"` è già presente in tsconfig di Next; in caso, usa un cast `as unknown`).

- [ ] **Step 3: Commit**

```bash
git add lib/offline/compressImage.ts
git commit -m "feat(offline): compressione foto lato client"
```

---

### Task 11: Orchestratore di sincronizzazione (browser-only)

**Files:**
- Create: `lib/offline/sync.ts`

Coordina la coda usando `db` + `syncPlan` + `fetch`. Espone `sincronizzaToken(token)` e `avviaSyncAutomatica(token)` (registra i trigger). Browser-only; verificato via e2e in Fase 2.

- [ ] **Step 1: Implementare**

Crea `lib/offline/sync.ts`:

```ts
import { dbOutbox, dbBlob, dbLavoro, indexedDbDisponibile } from './db';
import { ordineInvio, classificaEsito } from './syncPlan';
import { marcaErrore } from './outboxModel';
import type { OutboxItem } from './types';

let inCorso = false;

/** Esegue l'invio HTTP di un singolo elemento; restituisce lo status (0 = errore rete). */
async function inviaElemento(item: OutboxItem): Promise<number> {
  try {
    if (item.type === 'voce') {
      const r = await fetch(`/api/r/${item.token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: item.payload.voceId, risposte: item.payload.risposte }),
      });
      return r.status;
    }
    if (item.type === 'agenda') {
      const r = await fetch(`/api/agenda/${item.token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      return r.status;
    }
    if (item.type === 'foto') {
      const blob = await dbBlob.leggi(item.payload.blobId);
      if (!blob) return 200; // blob già caricato/rimosso: trattalo come completato
      const fd = new FormData();
      fd.append('file', blob, `${item.payload.clientKey}.jpg`);
      fd.append('clientKey', item.payload.clientKey);
      const r = await fetch(`/api/r/${item.token}/foto-campo`, { method: 'POST', body: fd });
      if (r.ok) {
        const { path } = (await r.json()) as { path?: string };
        if (path) {
          // riscrive il path reale nelle risposte locali della voce
          const lavori = await dbLavoro.perToken(item.token);
          const lavoro = lavori.find((l) => l.voceId === item.payload.voceId);
          const risposte = { ...(lavoro?.risposte ?? {}), [item.payload.chiave]: path };
          await dbLavoro.salva({ chiave: `${item.token}:${item.payload.voceId}`, token: item.token, voceId: item.payload.voceId, risposte, aggiornatoIl: Date.now() });
          // accoda/aggiorna il salvataggio della voce con il path reale
          await dbOutbox.put({ id: `voce-${item.token}-${item.payload.voceId}`, type: 'voce', token: item.token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: { voceId: item.payload.voceId, risposte } });
        }
        await dbBlob.rimuovi(item.payload.blobId);
      }
      return r.status;
    }
    if (item.type === 'manuale') {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({
        richiestaId: item.payload.richiestaId,
        committente: item.payload.committente,
        anagrafica: item.payload.anagrafica,
        risposte: item.payload.risposte,
        note: item.payload.note ?? null,
      }));
      for (const ref of item.payload.fotoBlobRefs) {
        const blob = await dbBlob.leggi(ref.blobId);
        if (blob) fd.append(`foto:${ref.chiave}`, blob, `${ref.chiave}.jpg`);
      }
      const r = await fetch(`/api/r/${item.token}/intervento-manuale`, { method: 'POST', body: fd });
      if (r.ok) {
        for (const ref of item.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
      }
      return r.status;
    }
    // invia
    const r = await fetch(`/api/r/${item.token}/invia`, { method: 'POST' });
    return r.status;
  } catch {
    return 0; // errore di rete
  }
}

/** Sincronizza tutta la coda di un token. Ritorna true se la coda è vuota a fine giro. */
export async function sincronizzaToken(token: string): Promise<boolean> {
  if (!indexedDbDisponibile() || inCorso) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  inCorso = true;
  try {
    const items = (await dbOutbox.perToken(token)).filter((i) => i.stato !== 'bloccato');
    const ordinati = ordineInvio(items);
    for (const item of ordinati) {
      await dbOutbox.put({ ...item, stato: 'in_invio' });
      const status = await inviaElemento(item);
      const esito = classificaEsito(status);
      if (esito.esito === 'completato') {
        await dbOutbox.rimuovi(item.id);
      } else if (esito.esito === 'bloccato') {
        await dbOutbox.put({ ...item, stato: 'bloccato', ultimoErrore: esito.motivo });
      } else {
        await dbOutbox.put(marcaErrore(item, 'rete'));
        break; // errore di rete: interrompi, ritenta al trigger successivo
      }
    }
    const restanti = (await dbOutbox.perToken(token)).filter((i) => i.stato !== 'bloccato');
    return restanti.length === 0;
  } finally {
    inCorso = false;
  }
}

/**
 * Registra i trigger di sincronizzazione automatica per un token e restituisce
 * una funzione di cleanup. Trigger: online, ritorno in primo piano, intervallo.
 */
export function avviaSyncAutomatica(token: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => { void sincronizzaToken(token); };
  const onVisibile = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisibile);
  const intervallo = window.setInterval(run, 30000);
  run(); // tentativo immediato
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisibile);
    window.clearInterval(intervallo);
  };
}
```

> **Nota:** `Date.now()` è usato qui (runtime browser, non workflow) ed è corretto. Il Background Sync API (Android) verrà aggiunto in Fase 2 come potenziamento; i trigger qui coprono già il caso "torna online / riapri / dopo un'azione".

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: nessun nuovo errore in `lib/offline/sync.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/offline/sync.ts
git commit -m "feat(offline): orchestratore di sincronizzazione coda+trigger"
```

---

### Task 12: Idempotenza upload foto (`clientKey`)

**Files:**
- Create: `app/api/r/[token]/foto-campo/idempotenza.ts`
- Test: `app/api/r/[token]/foto-campo/idempotenza.test.ts`
- Modify: `app/api/r/[token]/foto-campo/route.ts`

- [ ] **Step 1: Scrivere il test dell'helper (failing)**

Crea `app/api/r/[token]/foto-campo/idempotenza.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nomeFileFoto } from './idempotenza';

describe('nomeFileFoto', () => {
  it('usa il clientKey sanificato quando presente', () => {
    expect(nomeFileFoto('rap1', 'abc-123', 'jpg')).toBe('rapportini/rap1/abc-123.jpg');
  });
  it('rimuove caratteri non sicuri dal clientKey', () => {
    expect(nomeFileFoto('rap1', '../../etc/passwd', 'jpg')).toBe('rapportini/rap1/etcpasswd.jpg');
  });
  it('genera un nome casuale (fallback) quando clientKey è assente', () => {
    const a = nomeFileFoto('rap1', undefined, 'jpg');
    expect(a.startsWith('rapportini/rap1/')).toBe(true);
    expect(a.endsWith('.jpg')).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run:
```bash
npx vitest run app/api/r/[token]/foto-campo/idempotenza.test.ts
```
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare l'helper**

Crea `app/api/r/[token]/foto-campo/idempotenza.ts`:

```ts
import { randomUUID } from 'crypto';

/** Sanifica il clientKey: tiene solo [a-zA-Z0-9-_]. */
function sanifica(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Path di storage idempotente per la foto di campo. Con `clientKey` presente il
 * path è deterministico → un re-invio (upsert) sovrascrive lo stesso file invece
 * di crearne uno nuovo. Senza clientKey, fallback a UUID casuale (comportamento legacy).
 */
export function nomeFileFoto(rapId: string, clientKey: string | undefined, ext: string): string {
  const base = clientKey && sanifica(clientKey) ? sanifica(clientKey) : randomUUID();
  return `rapportini/${rapId}/${base}.${ext}`;
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run:
```bash
npx vitest run app/api/r/[token]/foto-campo/idempotenza.test.ts
```
Expected: PASS.

- [ ] **Step 5: Usare l'helper nella route**

In `app/api/r/[token]/foto-campo/route.ts`:
- aggiungi l'import: `import { nomeFileFoto } from './idempotenza';`
- rimuovi l'import ora inutilizzato `import { randomUUID } from 'crypto';` (l'UUID è gestito dall'helper);
- leggi il clientKey dalla FormData dopo il check del file:
```ts
  const clientKey = typeof fd.get('clientKey') === 'string' ? (fd.get('clientKey') as string) : undefined;
```
- sostituisci la riga che costruisce `storagePath`:
```ts
  // prima:
  // const storagePath = `rapportini/${rap.id}/${randomUUID()}.${ext}`;
  // dopo:
  const storagePath = nomeFileFoto(rap.id, clientKey, ext);
```
(Il resto della route — validazioni, `upsert: true`, risposta `{ path }` — resta invariato.)

- [ ] **Step 6: Verificare build/typecheck**

Run:
```bash
npm run build
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "app/api/r/[token]/foto-campo/idempotenza.ts" "app/api/r/[token]/foto-campo/idempotenza.test.ts" "app/api/r/[token]/foto-campo/route.ts"
git commit -m "feat(offline): foto-campo idempotente via clientKey"
```

---

### Task 13: Idempotenza intervento manuale (`richiestaId`)

**Files:**
- Create: `lib/offline/idRichiesta.ts`
- Test: `lib/offline/idRichiesta.test.ts`
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Scrivere il test dell'helper (failing)**

Crea `lib/offline/idRichiesta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { richiestaIdValido } from './idRichiesta';

describe('richiestaIdValido', () => {
  it('accetta un UUID v4 ben formato', () => {
    expect(richiestaIdValido('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
  });
  it('rifiuta stringhe non-UUID', () => {
    expect(richiestaIdValido('abc')).toBe(false);
    expect(richiestaIdValido('')).toBe(false);
    expect(richiestaIdValido(undefined)).toBe(false);
    expect(richiestaIdValido('3f2504e0-4f89-41d3-9a0c')).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run:
```bash
npx vitest run lib/offline/idRichiesta.test.ts
```
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare l'helper**

Crea `lib/offline/idRichiesta.ts`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True se `id` è un UUID valido (usato come chiave di idempotenza lato server). */
export function richiestaIdValido(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run:
```bash
npx vitest run lib/offline/idRichiesta.test.ts
```
Expected: PASS.

- [ ] **Step 5: Rendere idempotente la route**

In `app/api/r/[token]/intervento-manuale/route.ts`:
- aggiungi l'import: `import { richiestaIdValido } from '@/lib/offline/idRichiesta';`
- estendi il tipo di `rawDati` per includere `richiestaId?: string` (nel JSON.parse della form):
```ts
  const rawDati = JSON.parse(String(form.get('dati') ?? '{}')) as {
    richiestaId?: string;
    committente?: CommittenteManuale;
    anagrafica?: Record<string, unknown>;
    risposte?: Record<string, unknown>;
    note?: string;
  };
```
- sostituisci la generazione dell'id (riga `const richiestaId = randomUUID();`) con uso del client id + **short-circuit idempotente**. Inserisci, subito prima di `const richiestaId = randomUUID();`, il blocco:
```ts
  // Idempotenza: se il client fornisce un richiestaId già esistente (re-invio offline),
  // restituisci il risultato esistente senza re-inserire.
  if (richiestaIdValido(rawDati.richiestaId)) {
    const { data: esistente } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, voce_id, corsia, intervento_id')
      .eq('id', rawDati.richiestaId)
      .maybeSingle();
    if (esistente) {
      return NextResponse.json({
        id: esistente.id,
        voceId: esistente.voce_id,
        corsia: esistente.corsia,
        interventoId: esistente.intervento_id,
        idempotente: true,
      });
    }
  }
```
- e cambia la riga di generazione id in:
```ts
  // prima: const richiestaId = randomUUID();
  const richiestaId = richiestaIdValido(rawDati.richiestaId) ? rawDati.richiestaId : randomUUID();
```
(Il resto della route — upload foto, INSERT, corsia, rollback — resta invariato. La validazione anagrafica/foto continua a valere: un re-invio valido con id nuovo crea normalmente; un re-invio con id già presente corto-circuita.)

- [ ] **Step 6: Verificare build/typecheck**

Run:
```bash
npm run build
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/offline/idRichiesta.ts lib/offline/idRichiesta.test.ts "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(offline): intervento-manuale idempotente via richiestaId"
```

---

### Task 14: Verifica complessiva Fase 1

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Eseguire tutti i test offline**

Run:
```bash
npx vitest run lib/offline app/api/r/[token]/foto-campo/idempotenza.test.ts
```
Expected: tutti i test offline verdi (outboxModel, syncPlan, validateManuale, idRichiesta, idempotenza foto).

- [ ] **Step 2: Build di produzione pulito**

Run:
```bash
npm run build
```
Expected: exit 0; `public/sw.js` presente.

- [ ] **Step 3: Verifica manuale consultazione offline (prod build)**

Run `npm run start`. In un browser:
1. Apri `/r/<token-valido>` con rete → SW "activated", cache `operatore-pagine` popolata.
2. Vai offline (DevTools → Network → Offline) → ricarica: la pagina si apre (consultazione OK).
3. Apri `/hub` offline → NON si apre (corretto: l'area admin non è in cache).

Expected: consultazione offline del rapportino funziona; perimetro admin escluso.

- [ ] **Step 4: Commit finale (se ci sono modifiche di verifica, es. .gitignore)**

```bash
git add -A
git commit -m "chore(offline): verifica Fase 1 (fondamenta) completata" --allow-empty
```

---

## Self-Review (eseguita)

**Copertura spec:** §3.1 SW → Task 1-2; §3.2 middleware → nessuna modifica (corretto, verificato in spec); registrazione → Task 3; §4 IndexedDB store → Task 4,8; coalescing → Task 5; §5 motore sync + ordine + trigger → Task 6,11; §6 casi limite (classificazione 409/403/422 → bloccato) → Task 6,11; pre-validazione manuale → Task 7; §7 modifiche server → Task 12,13; compressione foto → Task 10; snapshot consultazione → Task 9. **Wiring UI dei form, pillola di stato, SaveBadge esteso, foto/agenda/manuale offline lato form → Fasi 2 e 3** (fuori da questo piano per dimensione).

**Placeholder:** nessun TODO/TBD; ogni step ha codice o comando completo. Le due "Note per l'esecutore" (Task 7 firme helper, Task 10 lib DOM) indicano verifiche puntuali sul codice esistente, non lavoro non specificato.

**Coerenza tipi:** `OutboxItem`/payload definiti in Task 4 e usati coerentemente in Task 5,6,11; `nomeFileFoto`/`richiestaIdValido`/`validaManualeClient`/`comprimiImmagine`/`sincronizzaToken`/`avviaSyncAutomatica` con firme stabili tra definizione e uso.

---

## Prossimi piani (NON in questo documento)

- **Fase 2 — Rapportino offline (compilazione):** wiring di `RapportinoForm` al data layer (`lavoro`+`outbox`+reidratazione), foto offline via `blob`+`compressImage`, `SaveBadge` con stato "in attesa di rete", `OfflineStatusPill`, Background Sync (Android), cassetto "da risolvere", e2e Playwright offline. Salva snapshot in `page.tsx` rapportino.
- **Fase 3 — Agenda + Intervento manuale offline:** wiring di `AgendaOperatoreClient` (Fatto/Non fatto via outbox) e `ModaleInterventoManuale` (accodamento con pre-validazione + foto blob), snapshot agenda, e2e.

## Contratti e note emersi dalle review della Fase 1 (DA RISPETTARE in Fase 2/3)

- **Id canonico delle voci outbox:** quando il form accoda un salvataggio voce DEVE usare `idOutboxVoce(token, voceId)` (= `voce:${token}:${voceId}`, in [lib/offline/ids.ts](../../../lib/offline/ids.ts)) come `id` dell'elemento outbox. Così coincide con la voce ri-accodata dall'orchestratore dopo l'upload foto e con `chiaveCoalescing` → niente doppioni in IndexedDB.
- **`clientKey` unico per foto:** chi genera un elemento `foto` in coda DEVE assegnare un `clientKey` **univoco per ogni singola foto** (es. UUID per blob). Il path di storage è deterministico (`upsert`), quindi due foto che condividono lo stesso `clientKey` nello stesso rapportino si sovrascriverebbero.
- **Replay manuale e `voceId`:** il corto-circuito idempotente di `intervento-manuale` può restituire `voceId: null` se il replay arriva mentre l'originale è ancora a metà (la `voce_id` è impostata da una UPDATE successiva). Il chiamante (`sync.ts`) oggi ignora il body, quindi è innocuo; un futuro consumatore NON deve fidarsi del `voceId` di una risposta `idempotente:true`.
- **Concorrenza cross-tab:** il guard `inCorso` di `sync.ts` è single-flight per-tab. Due tab/dispositivi che replicano lo stesso `richiestaId` in parallelo possono incrociarsi sul rollback storage (caso stretto). Da valutare in Fase 2/3 se diventa rilevante.
- **`db.tx` durabilità:** le scritture risolvono al commit della transazione (`oncomplete`) — sicuro affidarsi alla rimozione/put come durabili.

## Verifica build / QA (limite ambiente locale)

- Il `npm run build` completo **non si conclude in locale** per un errore **pre-esistente** in "collect page data" della route admin `/api/admin/rapportini/[rapportinoId]/foto-zip` (non toccata da questa feature). Il **service worker Serwist si genera comunque** (`public/sw.js`, ~56KB).
- Verifica end-to-end (build completo + comportamento offline reale: cache pagine, coda, sync) da fare su **preview Vercel**, anche perché il SW è attivo **solo nel build di produzione** (in `next dev --turbopack` non viene generato).
- Verifica locale effettuata: `tsc --noEmit` pulito sui file della feature; **22 test unitari offline verdi** (outboxModel, syncPlan, validateManuale, idRichiesta, nomeFileFoto).
