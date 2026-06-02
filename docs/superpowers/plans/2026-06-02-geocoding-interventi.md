# Geocoding Interventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popolare `lat/lng` degli `interventi` importati tramite geocodifica server-side, auto-avviata dopo l'import e non bloccante, con UI per correggere e ri-geocodificare gli indirizzi non trovati.

**Architecture:** Si estrae il core del geocoder esistente (provider Nominatim/Photon + normalizzazione + rate-limit) in un modulo runtime-agnostico senza Supabase; una cache server (service role) e un entry server lo riusano. Una rotta a blocchi geocodifica i `pending` (auto-avviata da un loop client dopo l'import); una rotta di retry gestisce la correzione manuale del toponimo. Stessa rotta/logica riusabile dal futuro worker Playwright.

**Tech Stack:** Next.js 15 (App Router, route `nodejs`) · React 19 · TypeScript · Supabase (`supabaseAdmin`, service role) · Vitest · Nominatim/Photon.

**Spec:** `docs/superpowers/specs/2026-06-02-geocoding-interventi-design.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `lib/interventi/geocodeStatus.ts` (+ `.test.ts`) | Crea | Helper puri: `statoDaRisultatoGeocode`, `formatGeocodeProgress` |
| `supabase/migrations/20260602010000_interventi_geocode_status.sql` | Crea | Migration: colonne `geocode_status`/`geocode_attempts` (NON applicata; consegnata all'utente) |
| `utils/routing/geocodingCore.ts` | Crea | Core geocoder runtime-agnostico (provider + normalizzazione + rate-limit), `resolveCoordsFromProviders` |
| `utils/routing/geocoding.ts` | Modifica | Usa il core; `geocodeTask` (client, per la mappa) invariato nel comportamento |
| `utils/routing/geocodingCacheServer.ts` | Crea | Cache `geocoding_cache` lato server (`supabaseAdmin`) |
| `lib/interventi/geocodeServer.ts` | Crea | `geocodeIndirizzoServer` = cache server → core → salva |
| `app/api/interventi/geocode/route.ts` | Crea | `POST` (geocodifica un blocco) + `GET` (lista falliti) |
| `app/api/interventi/geocode/retry/route.ts` | Crea | `POST` retry singolo con indirizzo corretto |
| `components/modules/interventi/GeocodePanel.tsx` | Crea | Loop client + barra avanzamento + UI falliti (correggi/ritenta) |
| `app/hub/interventi/page.tsx` | Modifica | Mostra `<GeocodePanel>` dopo un import riuscito |

Nota: la migration NON viene applicata dall'implementazione; il file viene committato e la SQL consegnata all'utente per l'esecuzione manuale al PC.

---

## Task 1: Helper puri `geocodeStatus` (TDD)

**Files:**
- Create: `lib/interventi/geocodeStatus.ts`
- Test: `lib/interventi/geocodeStatus.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `lib/interventi/geocodeStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { statoDaRisultatoGeocode, formatGeocodeProgress } from './geocodeStatus';

describe('statoDaRisultatoGeocode', () => {
  it("torna 'ok' con coordinate valide", () => {
    expect(statoDaRisultatoGeocode({ lat: 41.9, lng: 12.5 })).toBe('ok');
  });
  it("torna 'failed' con null", () => {
    expect(statoDaRisultatoGeocode(null)).toBe('failed');
  });
});

describe('formatGeocodeProgress', () => {
  it('riepiloga ok/da correggere/rimasti', () => {
    expect(formatGeocodeProgress({ processati: 10, ok: 8, falliti: 2, restanti: 5 }))
      .toBe('8 ok, 2 da correggere · 5 rimasti');
  });
  it('gestisce lo zero', () => {
    expect(formatGeocodeProgress({ processati: 0, ok: 0, falliti: 0, restanti: 0 }))
      .toBe('0 ok, 0 da correggere · 0 rimasti');
  });
});
```

- [ ] **Step 2: Esegui il test, verifica che FALLISCE**

Run: `npx vitest run lib/interventi/geocodeStatus.test.ts`
Expected: FAIL (modulo/funzioni non trovate).

- [ ] **Step 3: Implementa**

Create `lib/interventi/geocodeStatus.ts`:

```ts
/** Stato di geocodifica derivato dal risultato del geocoder. */
export function statoDaRisultatoGeocode(coords: { lat: number; lng: number } | null): 'ok' | 'failed' {
  return coords ? 'ok' : 'failed';
}

export type GeocodeProgress = {
  processati: number;
  ok: number;
  falliti: number;
  restanti: number;
};

/** Riepilogo leggibile dell'avanzamento della geocodifica. */
export function formatGeocodeProgress(p: GeocodeProgress): string {
  return `${p.ok} ok, ${p.falliti} da correggere · ${p.restanti} rimasti`;
}
```

- [ ] **Step 4: Esegui il test, verifica che PASSA**

Run: `npx vitest run lib/interventi/geocodeStatus.test.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 5: Commit**

Git hygiene: c'è un file locale modificato non correlato (`.claude/settings.local.json`). NON aggiungerlo. `git add` solo dei file indicati. Mai `git add -A`.

```bash
git add lib/interventi/geocodeStatus.ts lib/interventi/geocodeStatus.test.ts
git commit -m "feat(geocoding): helper statoDaRisultatoGeocode + formatGeocodeProgress (+ test)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration `geocode_status` (file creato, NON applicato)

**Files:**
- Create: `supabase/migrations/20260602010000_interventi_geocode_status.sql`

> Questo task crea solo il file di migration. NON eseguirlo sul DB: la SQL viene consegnata all'utente, che la lancia al PC. Verifica = il file esiste con la SQL indicata.

- [ ] **Step 1: Crea il file di migration**

Create `supabase/migrations/20260602010000_interventi_geocode_status.sql`:

```sql
-- Geocoding interventi: stato (pending/ok/failed) + contatore tentativi
-- Spec: docs/superpowers/specs/2026-06-02-geocoding-interventi-design.md
alter table public.interventi
  add column if not exists geocode_status text not null default 'pending'
    check (geocode_status in ('pending','ok','failed')),
  add column if not exists geocode_attempts integer not null default 0;

-- backfill: gli interventi che hanno già coordinate sono 'ok'
update public.interventi
  set geocode_status = 'ok'
  where lat is not null and lng is not null and geocode_status <> 'ok';

-- indice per la coda dei pending (geocodifica a blocchi per data)
create index if not exists interventi_geocode_pending_idx
  on public.interventi (data, geocode_status)
  where geocode_status = 'pending';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260602010000_interventi_geocode_status.sql
git commit -m "feat(geocoding): migration geocode_status/geocode_attempts su interventi (da applicare)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Estrai `geocodingCore.ts` e aggiorna `geocoding.ts`

**Files:**
- Create: `utils/routing/geocodingCore.ts`
- Modify: `utils/routing/geocoding.ts` (riscritto per usare il core)

> Refactor a comportamento invariato per `geocodeTask` (usato dalla mappa). Il core NON importa Supabase/React: così è importabile lato server senza trascinare `geocodingCache.ts` (`'use client'`). Verifica = `tsc` pulito + suite test invariata verde.

- [ ] **Step 1: Crea il core**

Create `utils/routing/geocodingCore.ts`:

```ts
// Core di geocoding runtime-agnostico: provider (Nominatim/Photon), normalizzazione
// e rate-limit. NESSUNA dipendenza Supabase/React → usabile sia client che server.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';
const USER_AGENT = 'gestione-personale-app';
const RATE_LIMIT_MS = 1000;

export type Coordinates = { lat: number; lng: number };
type NominatimResult = { lat: string; lon: string };
type PhotonResponse = { features?: Array<{ geometry?: { coordinates?: number[] } }> };

let queue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
export function normalizeLocationField(value: string): string {
  return collapseSpaces(value);
}
function expandSafeStreetAbbreviation(value: string): string {
  return value
    .replace(/^V\.(?=\s)/i, 'VIA')
    .replace(/^VLE\.?(?=\s)/i, 'VIALE')
    .replace(/^(?:PZA\.?|P\.?\s*ZZA\.?)(?=\s)/i, 'PIAZZA')
    .replace(/^C\.?\s*SO\.?(?=\s)/i, 'CORSO')
    .replace(/^LGO\.?(?=\s)/i, 'LARGO');
}
export function normalizeAddress(value: string): string {
  const collapsed = collapseSpaces(value);
  const expanded = expandSafeStreetAbbreviation(collapsed);
  return collapseSpaces(expanded.replace(/[.,;:]+/g, ' '));
}
function buildFreeTextQuery(indirizzo: string, citta: string, cap?: string): string {
  const location = cap ? `${cap} ${citta}`.trim() : citta;
  return [indirizzo, location, 'Italia'].filter(Boolean).join(', ');
}
function isValidCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function parseNominatimResponse(data: NominatimResult[]): Coordinates | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number.parseFloat(data[0].lat);
  const lng = Number.parseFloat(data[0].lon);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}
function parsePhotonResponse(data: PhotonResponse): Coordinates | null {
  const coordinates = data.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}
function runSerial<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    try {
      return await operation();
    } finally {
      await delay(RATE_LIMIT_MS);
    }
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}
async function fetchNominatim(params: URLSearchParams): Promise<Coordinates | null> {
  try {
    return await runSerial(async () => {
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) {
        console.warn(`[geocoding] Nominatim HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as NominatimResult[];
      return parseNominatimResponse(data);
    });
  } catch (error) {
    console.warn('[geocoding] Nominatim request failed:', error);
    return null;
  }
}
async function fetchPhoton(query: string): Promise<Coordinates | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: '1' });
    return await runSerial(async () => {
      const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) {
        console.warn(`[geocoding] Photon HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as PhotonResponse;
      return parsePhotonResponse(data);
    });
  } catch (error) {
    console.warn('[geocoding] Photon request failed:', error);
    return null;
  }
}

/**
 * Risolve le coordinate di un indirizzo interrogando i provider in cascata
 * (Nominatim strutturato → free-text con/senza CAP → Photon con/senza CAP).
 * Nessuna cache: la cache (client o server) è gestita dai wrapper. Rate-limit 1/sec.
 */
export async function resolveCoordsFromProviders(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<Coordinates | null> {
  const normalizedAddress = normalizeAddress(indirizzo);
  const normalizedCap = normalizeLocationField(cap);
  const normalizedCity = normalizeLocationField(citta);
  if (!normalizedAddress) return null;

  const structured = await fetchNominatim(
    new URLSearchParams({
      street: normalizedAddress,
      city: normalizedCity,
      postalcode: normalizedCap,
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (structured) return structured;

  const withCap = await fetchNominatim(
    new URLSearchParams({
      q: buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap),
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (withCap) return withCap;

  const withoutCap = await fetchNominatim(
    new URLSearchParams({
      q: buildFreeTextQuery(normalizedAddress, normalizedCity),
      countrycodes: 'it',
      format: 'jsonv2',
      limit: '1',
    }),
  );
  if (withoutCap) return withoutCap;

  const photonWithCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity, normalizedCap));
  if (photonWithCap) return photonWithCap;

  const photonWithoutCap = await fetchPhoton(buildFreeTextQuery(normalizedAddress, normalizedCity));
  if (photonWithoutCap) return photonWithoutCap;

  return null;
}
```

- [ ] **Step 2: Riscrivi `geocoding.ts` per usare il core (comportamento invariato)**

Replace the ENTIRE content of `utils/routing/geocoding.ts` with:

```ts
import type { Task } from './types';
import { getCachedCoords, saveResolvedCoords } from './geocodingCache';
import {
  resolveCoordsFromProviders,
  normalizeAddress,
  normalizeLocationField,
  type Coordinates,
} from './geocodingCore';

const cache = new Map<string, Coordinates>();

function buildCacheKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}
function getInMemoryCoords(rawKey: string, normalizedKey: string): Coordinates | null {
  return cache.get(rawKey) ?? cache.get(normalizedKey) ?? null;
}
function saveInMemoryCoords(rawKey: string, normalizedKey: string, coords: Coordinates): void {
  cache.set(rawKey, coords);
  if (normalizedKey !== rawKey) cache.set(normalizedKey, coords);
}

export async function geocodeTask(task: Task): Promise<Task> {
  try {
    if (task.lat != null && task.lng != null) return task;

    const rawAddress = task.indirizzo;
    const normalizedAddress = normalizeAddress(task.indirizzo);
    const normalizedCap = normalizeLocationField(task.cap);
    const normalizedCity = normalizeLocationField(task.citta);
    const rawKey = buildCacheKey(rawAddress, normalizedCap, normalizedCity);
    const normalizedKey = buildCacheKey(normalizedAddress, normalizedCap, normalizedCity);

    const memoryCoords = getInMemoryCoords(rawKey, normalizedKey);
    if (memoryCoords) return { ...task, lat: memoryCoords.lat, lng: memoryCoords.lng };

    const rawCached = await getCachedCoords(rawAddress, normalizedCap, normalizedCity);
    if (rawCached) {
      saveInMemoryCoords(rawKey, normalizedKey, rawCached);
      return { ...task, lat: rawCached.lat, lng: rawCached.lng };
    }

    if (normalizedAddress !== rawAddress) {
      const normCached = await getCachedCoords(normalizedAddress, normalizedCap, normalizedCity);
      if (normCached) {
        saveInMemoryCoords(rawKey, normalizedKey, normCached);
        return { ...task, lat: normCached.lat, lng: normCached.lng };
      }
    }

    const coords = await resolveCoordsFromProviders(task.indirizzo, task.cap, task.citta);
    if (coords) {
      saveInMemoryCoords(rawKey, normalizedKey, coords);
      await saveResolvedCoords(rawAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
      if (normalizedAddress !== rawAddress) {
        await saveResolvedCoords(normalizedAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
      }
      return { ...task, lat: coords.lat, lng: coords.lng };
    }

    return task;
  } catch (error) {
    console.error(`[geocoding] Impossibile geocodificare "${task.indirizzo}, ${task.cap} ${task.citta}":`, error);
    return task;
  }
}

export async function geocodeBatch(tasks: Task[]): Promise<Task[]> {
  const results: Task[] = [];
  for (const task of tasks) {
    results.push(await geocodeTask(task));
  }
  return results;
}
```

- [ ] **Step 3: Typecheck + suite test invariata**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run test`
Expected: tutti i test esistenti verdi (nessuna regressione; non ci sono test diretti su geocoding, la verifica è il typecheck + il resto della suite).

- [ ] **Step 4: Commit**

```bash
git add utils/routing/geocodingCore.ts utils/routing/geocoding.ts
git commit -m "refactor(geocoding): estrai core runtime-agnostico (riuso client/server)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Cache server `geocodingCacheServer.ts`

**Files:**
- Create: `utils/routing/geocodingCacheServer.ts`

> Replica della cache client ma con `supabaseAdmin` (service role), stessa `lookup_key` → cache condivisa con la versione client. Verifica = `tsc`.

- [ ] **Step 1: Crea il file**

Create `utils/routing/geocodingCacheServer.ts`:

```ts
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Stessa chiave della cache client (geocodingCache.ts) → cache condivisa. */
function buildKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function getCachedCoordsServer(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('geocoding_cache')
      .select('lat, lng')
      .eq('lookup_key', buildKey(indirizzo, cap, citta))
      .maybeSingle();
    return data ? { lat: data.lat, lng: data.lng } : null;
  } catch {
    return null; // silenzioso: un errore cache non blocca la geocodifica
  }
}

export async function saveResolvedCoordsServer(
  indirizzo: string,
  cap: string,
  citta: string,
  lat: number,
  lng: number,
): Promise<void> {
  try {
    await supabaseAdmin.from('geocoding_cache').upsert(
      {
        lookup_key: buildKey(indirizzo, cap, citta),
        indirizzo_raw: indirizzo,
        cap_raw: cap,
        citta_raw: citta,
        lat,
        lng,
      },
      { onConflict: 'lookup_key' },
    );
  } catch {
    // silenzioso
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add utils/routing/geocodingCacheServer.ts
git commit -m "feat(geocoding): cache geocoding_cache lato server (service role)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Entry server `geocodeServer.ts`

**Files:**
- Create: `lib/interventi/geocodeServer.ts`

> Punto unico server-side: cache server → (miss) core → salva in cache. Riusato da rotta e (futuro) worker.

- [ ] **Step 1: Crea il file**

Create `lib/interventi/geocodeServer.ts`:

```ts
import {
  resolveCoordsFromProviders,
  normalizeAddress,
  normalizeLocationField,
  type Coordinates,
} from '@/utils/routing/geocodingCore';
import { getCachedCoordsServer, saveResolvedCoordsServer } from '@/utils/routing/geocodingCacheServer';

/**
 * Geocodifica server-side di un indirizzo: cache DB (service role) → provider → salva in cache.
 * Torna {lat,lng} oppure null. Nessuna dipendenza dal browser.
 */
export async function geocodeIndirizzoServer(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<Coordinates | null> {
  const rawAddress = (indirizzo ?? '').trim();
  if (!rawAddress) return null;

  const normalizedAddress = normalizeAddress(rawAddress);
  const normalizedCap = normalizeLocationField(cap ?? '');
  const normalizedCity = normalizeLocationField(citta ?? '');

  const rawCached = await getCachedCoordsServer(rawAddress, normalizedCap, normalizedCity);
  if (rawCached) return rawCached;
  if (normalizedAddress !== rawAddress) {
    const normCached = await getCachedCoordsServer(normalizedAddress, normalizedCap, normalizedCity);
    if (normCached) return normCached;
  }

  const coords = await resolveCoordsFromProviders(rawAddress, normalizedCap, normalizedCity);
  if (!coords) return null;

  await saveResolvedCoordsServer(rawAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
  if (normalizedAddress !== rawAddress) {
    await saveResolvedCoordsServer(normalizedAddress, normalizedCap, normalizedCity, coords.lat, coords.lng);
  }
  return coords;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/interventi/geocodeServer.ts
git commit -m "feat(geocoding): entry server geocodeIndirizzoServer (cache + core)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rotta `POST`/`GET` `/api/interventi/geocode`

**Files:**
- Create: `app/api/interventi/geocode/route.ts`

> `POST` geocodifica un blocco di `pending`; `GET` elenca i `failed` di uno scope. Auth `requireUser()`, scritture via `supabaseAdmin`. Verifica = `tsc` + `lint`.

- [ ] **Step 1: Crea la rotta**

Create `app/api/interventi/geocode/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';
import { statoDaRisultatoGeocode } from '@/lib/interventi/geocodeStatus';

export const runtime = 'nodejs';

function nrm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

type PendingRow = {
  id: string;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  geocode_attempts: number | null;
};

/**
 * POST /api/interventi/geocode — geocodifica un blocco di interventi `pending`.
 * Body JSON: { batchId?, data?, limit? }. Almeno uno tra batchId e data.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { batchId?: unknown; data?: unknown; limit?: unknown };
    const batchId = nrm(body.batchId);
    const data = nrm(body.data);
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0 && body.limit <= 100
        ? body.limit
        : 25;

    if (!batchId && !data) {
      return NextResponse.json({ error: 'Specificare batchId o data.' }, { status: 400 });
    }

    let q = supabaseAdmin
      .from('interventi')
      .select('id, indirizzo, comune, cap, geocode_attempts')
      .is('lat', null)
      .neq('geocode_status', 'failed')
      .not('indirizzo', 'is', null)
      .limit(limit);
    if (batchId) q = q.eq('import_batch_id', batchId);
    if (data) q = q.eq('data', data);

    const { data: rows, error } = await q;
    if (error) throw error;

    let ok = 0;
    let falliti = 0;
    const fallitiList: Array<{ id: string; indirizzo: string | null; comune: string | null; cap: string | null }> = [];

    for (const r of (rows ?? []) as PendingRow[]) {
      const coords = await geocodeIndirizzoServer(r.indirizzo ?? '', r.cap ?? '', r.comune ?? '');
      const stato = statoDaRisultatoGeocode(coords);
      const attempts = (r.geocode_attempts ?? 0) + 1;

      if (stato === 'ok' && coords) {
        await supabaseAdmin
          .from('interventi')
          .update({
            lat: coords.lat,
            lng: coords.lng,
            geocoded_at: new Date().toISOString(),
            geocode_status: 'ok',
            geocode_attempts: attempts,
          })
          .eq('id', r.id);
        ok += 1;
      } else {
        await supabaseAdmin
          .from('interventi')
          .update({ geocode_status: 'failed', geocode_attempts: attempts })
          .eq('id', r.id);
        falliti += 1;
        fallitiList.push({ id: r.id, indirizzo: r.indirizzo, comune: r.comune, cap: r.cap });
      }
    }

    let rq = supabaseAdmin
      .from('interventi')
      .select('id', { count: 'exact', head: true })
      .is('lat', null)
      .neq('geocode_status', 'failed')
      .not('indirizzo', 'is', null);
    if (batchId) rq = rq.eq('import_batch_id', batchId);
    if (data) rq = rq.eq('data', data);
    const { count } = await rq;

    return NextResponse.json({
      processati: (rows ?? []).length,
      ok,
      falliti,
      restanti: count ?? 0,
      fallitiList,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore geocodifica.' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/interventi/geocode?batchId=&data= — elenca gli interventi con
 * geocodifica fallita nello scope, per la UI di correzione.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const batchId = nrm(url.searchParams.get('batchId'));
    const data = nrm(url.searchParams.get('data'));
    if (!batchId && !data) {
      return NextResponse.json({ error: 'Specificare batchId o data.' }, { status: 400 });
    }

    let q = supabaseAdmin
      .from('interventi')
      .select('id, indirizzo, comune, cap')
      .eq('geocode_status', 'failed');
    if (batchId) q = q.eq('import_batch_id', batchId);
    if (data) q = q.eq('data', data);

    const { data: rows, error } = await q.order('indirizzo', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ falliti: rows ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura falliti.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint app/api/interventi/geocode/route.ts`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/geocode/route.ts
git commit -m "feat(geocoding): rotta /api/interventi/geocode (POST blocco + GET falliti)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rotta retry `/api/interventi/geocode/retry`

**Files:**
- Create: `app/api/interventi/geocode/retry/route.ts`

> Ri-geocodifica un singolo intervento con indirizzo corretto. Su successo salva coord + indirizzo corretto sull'intervento (la correzione in `geocoding_cache` la fa già `geocodeIndirizzoServer`). Verifica = `tsc` + `lint`.

- [ ] **Step 1: Crea la rotta**

Create `app/api/interventi/geocode/retry/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';

export const runtime = 'nodejs';

function nrm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * POST /api/interventi/geocode/retry — ri-geocodifica un intervento con indirizzo corretto.
 * Body JSON: { id, indirizzo, comune?, cap? }.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      indirizzo?: unknown;
      comune?: unknown;
      cap?: unknown;
    };
    const id = nrm(body.id);
    const indirizzo = nrm(body.indirizzo);
    const comune = nrm(body.comune);
    const cap = nrm(body.cap);

    if (!id) return NextResponse.json({ error: 'id mancante.' }, { status: 400 });
    if (!indirizzo) return NextResponse.json({ error: 'indirizzo mancante.' }, { status: 400 });

    const coords = await geocodeIndirizzoServer(indirizzo, cap ?? '', comune ?? '');

    if (!coords) {
      // Salva comunque l'indirizzo corretto; resta 'failed' per un nuovo tentativo.
      await supabaseAdmin
        .from('interventi')
        .update({ indirizzo, comune, cap, geocode_status: 'failed' })
        .eq('id', id);
      return NextResponse.json({ ok: false });
    }

    await supabaseAdmin
      .from('interventi')
      .update({
        indirizzo,
        comune,
        cap,
        lat: coords.lat,
        lng: coords.lng,
        geocoded_at: new Date().toISOString(),
        geocode_status: 'ok',
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, lat: coords.lat, lng: coords.lng });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore retry geocodifica.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint app/api/interventi/geocode/retry/route.ts`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/geocode/retry/route.ts
git commit -m "feat(geocoding): rotta /api/interventi/geocode/retry (correzione toponimo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `GeocodePanel` + aggancio nella pagina

**Files:**
- Create: `components/modules/interventi/GeocodePanel.tsx`
- Modify: `app/hub/interventi/page.tsx` (render del panel dopo l'import)

> Loop client a blocchi + barra avanzamento + lista falliti editabile con "Ritenta". Non far partire `npm run dev` (long-running): verifica con `tsc` + `lint`; lo smoke test a video lo fa il controller.

- [ ] **Step 1: Crea `GeocodePanel.tsx`**

Create `components/modules/interventi/GeocodePanel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGeocodeProgress, type GeocodeProgress } from '@/lib/interventi/geocodeStatus';

type FailedItem = { id: string; indirizzo: string | null; comune: string | null; cap: string | null };

export default function GeocodePanel({ batchId }: { batchId: string }) {
  const [progress, setProgress] = useState<GeocodeProgress>({ processati: 0, ok: 0, falliti: 0, restanti: 0 });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [falliti, setFalliti] = useState<FailedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const startedFor = useRef<string | null>(null);

  async function runLoop() {
    setRunning(true);
    setError(null);
    setDone(false);
    const acc: GeocodeProgress = { processati: 0, ok: 0, falliti: 0, restanti: 0 };
    try {
      for (;;) {
        const res = await fetch('/api/interventi/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, limit: 25 }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(typeof json?.error === 'string' ? json.error : 'Errore geocodifica.');
          break;
        }
        acc.processati += json.processati ?? 0;
        acc.ok += json.ok ?? 0;
        acc.falliti += json.falliti ?? 0;
        acc.restanti = json.restanti ?? 0;
        setProgress({ ...acc });
        if (!json.processati || json.restanti === 0) break;
      }

      const f = await fetch(`/api/interventi/geocode?batchId=${encodeURIComponent(batchId)}`);
      const fj = await f.json();
      if (f.ok && Array.isArray(fj?.falliti)) setFalliti(fj.falliti as FailedItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setRunning(false);
      setDone(true);
    }
  }

  useEffect(() => {
    if (startedFor.current === batchId) return;
    startedFor.current = batchId;
    void runLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  function onResolved(id: string) {
    setFalliti((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section
      className="space-y-4 rounded-[28px] border bg-[var(--brand-surface)] p-6 shadow-sm"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>
          Geocodifica
        </h2>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {running ? 'Geocodifica in corso…' : done ? 'Geocodifica completata.' : 'In avvio…'} {formatGeocodeProgress(progress)}
        </p>
      </div>

      {error && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      {!running && (
        <button
          type="button"
          onClick={() => void runLoop()}
          className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Riprendi geocodifica
        </button>
      )}

      {done && falliti.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Indirizzi da correggere ({falliti.length})
          </p>
          <ul className="space-y-3">
            {falliti.map((f) => (
              <FailedRow key={f.id} item={f} onResolved={() => onResolved(f.id)} />
            ))}
          </ul>
        </div>
      )}

      {done && falliti.length === 0 && !error && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
        >
          Tutti gli indirizzi del batch sono stati geocodificati.
        </div>
      )}
    </section>
  );
}

function FailedRow({ item, onResolved }: { item: FailedItem; onResolved: () => void }) {
  const [indirizzo, setIndirizzo] = useState(item.indirizzo ?? '');
  const [comune, setComune] = useState(item.comune ?? '');
  const [cap, setCap] = useState(item.cap ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onRetry() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/interventi/geocode/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, indirizzo, comune, cap }),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        onResolved();
        return;
      }
      setMsg(res.ok ? 'Ancora non trovato — correggi il toponimo e riprova.' : (json?.error ?? 'Errore.'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' };

  return (
    <li className="rounded-2xl border p-4" style={{ borderColor: 'var(--brand-border)' }}>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.7fr_auto] sm:items-center">
        <input
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          placeholder="Indirizzo"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <input
          value={comune}
          onChange={(e) => setComune(e.target.value)}
          placeholder="Comune"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <input
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="CAP"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onRetry}
          disabled={busy || indirizzo.trim() === ''}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? '…' : 'Ritenta'}
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
          {msg}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Aggancia il panel nella pagina**

In `app/hub/interventi/page.tsx`, add the import after the existing imports (after the `formatImportSummary` import line):

```tsx
import GeocodePanel from '@/components/modules/interventi/GeocodePanel';
```

Then, in the JSX, immediately AFTER the closing `</form>` tag and BEFORE the closing `</main>` tag, insert:

```tsx
      {result && <GeocodePanel batchId={result.batchId} />}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/interventi/GeocodePanel.tsx app/hub/interventi/page.tsx`
Expected: pulito.

- [ ] **Step 4: Commit**

```bash
git add components/modules/interventi/GeocodePanel.tsx app/hub/interventi/page.tsx
git commit -m "feat(geocoding): auto-avvio dopo import + UI correzione falliti (GeocodePanel)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verifica finale

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: tutti i test verdi (esistenti + i nuovi di `geocodeStatus`).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Nessun commit (sola verifica).** Se rosso, torna al task pertinente.

---

## Note di esecuzione

- `npx tsc` aggiorna `tsconfig.tsbuildinfo`: NON includerlo nei commit. Usare sempre `git add` dei file specifici, mai `git add -A`.
- Lasciare fuori dai commit `.claude/settings.local.json`.
- La migration (Task 2) NON va eseguita: il controller consegnerà la SQL all'utente da lanciare al PC.
- Non avviare `npm run dev` nei subagent (long-running): la verifica è `tsc`/`lint`/`test`; lo smoke a video lo fa il controller.
