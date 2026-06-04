# WP2a — Motore tempi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'optimizer un motore tempi: portare la durata nel `Task`, trattare le fasce come finestre orarie e calcolare un ETA per tappa (comportamento soft: ordina e segnala i ritardi).

**Architecture:** Logica pura nuova in `utils/routing/timeEngine.ts` (testata con vitest), tipi additivi in `types.ts`, `optimizeRouteByFascia` esteso per produrre lo `schedule`, popolamento durata da DB ed Excel, e infine integrazione UI minimale nel file caldo `MappaOperatoriClient.tsx` (ribasato su `main`).

**Tech Stack:** TypeScript, Vitest, Next.js 15/React 19, Supabase. Niente migration.

**Spec:** `docs/superpowers/specs/2026-06-04-wp2a-motore-tempi-design.md`

**Regole operative (da `docs/superpowers/roadmap-handoff.md`):**
- `git add` SOLO i file elencati in ogni task (mai `git add -A`); mai committare `tsconfig.tsbuildinfo` né `.claude/settings.local.json`.
- Niente `npm run dev` dentro un subagent.
- Footer di OGNI commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch di lavoro: `feat/wp2a-motore-tempi` (già creato; la spec è già committata).
- Lint: la baseline del repo è già rossa (vedi memoria `lint-baseline-rosso`). Verifica i file toccati con `npx eslint <path>` (0 nuovi problemi); per il file caldo registra la baseline pre-edit e non aumentarla.

---

## File Structure

| File | Responsabilità |
|------|----------------|
| `utils/routing/types.ts` (Modify) | `Task.durata_min`, tipo `ScheduleEntry`, `RouteResult.schedule`. |
| `utils/routing/index.ts` (Modify) | Ri-esporta `ScheduleEntry` dal barrel. |
| `utils/routing/timeEngine.ts` (Create) | Costanti + `parseFasciaWindow`, `computeSchedule`, `formatEtaMin`. Puro. |
| `utils/routing/timeEngine.test.ts` (Create) | Test vitest del motore. |
| `utils/routing/optimizer.ts` (Modify) | `optimizeRouteByFascia` produce lo `schedule`. |
| `utils/routing/optimizer.test.ts` (Create) | Test che lo `schedule` sia presente e allineato. |
| `lib/interventi/mappaInterventi.ts` (Modify) | `durata_stimata_min` in `InterventoGeoRow` + `durata_min` in `mapInterventoToTask`. |
| `lib/interventi/mappaInterventi.test.ts` (Modify) | Copre la durata. |
| `app/api/interventi/da-pianificare/route.ts` (Modify) | `durata_stimata_min` nella SELECT. |
| `utils/routing/excelParser.ts` (Modify) | `durata` in `ColMap` + estrazione `durata_min`. |
| `utils/routing/excelParser.test.ts` (Modify) | `detectFormat` include `durata`. |
| `components/modules/mappa/MappaOperatoriClient.tsx` (Modify, CALDO, ULTIMO) | `opts`/`schedule` in distribuzione + UI ETA/badge. |

---

## Task 1: Tipi (`types.ts` + barrel)

**Files:**
- Modify: `utils/routing/types.ts`
- Modify: `utils/routing/index.ts`

- [ ] **Step 1: Aggiungi `durata_min` al `Task`**

In `utils/routing/types.ts`, dentro `export interface Task`, subito dopo la riga `fascia_oraria: string;` aggiungi:

```ts
  durata_min?: number;
```

- [ ] **Step 2: Aggiungi `ScheduleEntry` e `RouteResult.schedule`**

In `utils/routing/types.ts`, sostituisci l'intera `export interface RouteResult { ... }` con:

```ts
export type ScheduleEntry = {
  /** id del Task a cui si riferisce (allineato a orderedTasks). */
  taskId: string;
  /** Orario stimato di arrivo, in minuti da mezzanotte (es. 480 = 08:00). */
  etaMin: number;
  /** true se l'arrivo supera la fine della finestra oraria del task. */
  inRitardo: boolean;
};

export interface RouteResult {
  /** Sequenza ottimizzata, oggetti Task completi */
  orderedTasks: Task[];
  /** Distanza totale Haversine in km, 2 decimali */
  totalDistanceKm: number;
  /** Coordinate per Leaflet/MapLibre — include il punto base se fornito */
  polyline: Array<{ lat: number; lng: number }>;
  /** ETA per tappa (presente solo nei percorsi col motore tempi). */
  schedule?: ScheduleEntry[];
}
```

- [ ] **Step 3: Ri-esporta `ScheduleEntry` dal barrel**

In `utils/routing/index.ts`, sostituisci la prima riga:

```ts
export type { Task, OperatorBase, RouteResult } from './types';
```

con:

```ts
export type { Task, OperatorBase, RouteResult, ScheduleEntry } from './types';
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add utils/routing/types.ts utils/routing/index.ts
git commit -m "feat(wp2a): tipi motore tempi (Task.durata_min, ScheduleEntry, RouteResult.schedule)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Motore tempi puro (`timeEngine.ts`, TDD)

**Files:**
- Create: `utils/routing/timeEngine.ts`
- Test: `utils/routing/timeEngine.test.ts`

**Riferimenti (sola lettura):** `utils/routing/distance.ts` esporta `haversine(lat1,lng1,lat2,lng2): number` (km). `utils/routing/types.ts` (Task, ScheduleEntry, OperatorBase). Stile test: `utils/routing/esecutore.test.ts`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/routing/timeEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFasciaWindow, computeSchedule, formatEtaMin } from './timeEngine';
import type { Task } from './types';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over };
}

describe('parseFasciaWindow', () => {
  it('parsa HH:MM-HH:MM', () => {
    expect(parseFasciaWindow('08:00-12:00')).toEqual({ startMin: 480, endMin: 720 });
  });
  it('parsa ore intere con trattino', () => {
    expect(parseFasciaWindow('8-12')).toEqual({ startMin: 480, endMin: 720 });
  });
  it('solo inizio → endMin null', () => {
    expect(parseFasciaWindow('08:00')).toEqual({ startMin: 480, endMin: null });
  });
  it('ore e minuti singola', () => {
    expect(parseFasciaWindow('9:30')).toEqual({ startMin: 570, endMin: null });
  });
  it('vuoto / null / non parsabile → null', () => {
    expect(parseFasciaWindow('')).toBeNull();
    expect(parseFasciaWindow(null)).toBeNull();
    expect(parseFasciaWindow(undefined)).toBeNull();
    expect(parseFasciaWindow('mattina')).toBeNull();
  });
});

describe('formatEtaMin', () => {
  it('formatta minuti da mezzanotte in HH:MM', () => {
    expect(formatEtaMin(480)).toBe('08:00');
    expect(formatEtaMin(540)).toBe('09:00');
    expect(formatEtaMin(483)).toBe('08:03');
    expect(formatEtaMin(0)).toBe('00:00');
  });
});

describe('computeSchedule', () => {
  it('solo durate (no coordinate, base null): ETA cumulativo dai default', () => {
    const tasks = [task('a'), task('b'), task('c')]; // durata default 30
    const s = computeSchedule(tasks, null);
    expect(s.map((e) => e.etaMin)).toEqual([480, 510, 540]);
    expect(s.map((e) => e.taskId)).toEqual(['a', 'b', 'c']);
    expect(s.every((e) => !e.inRitardo)).toBe(true);
  });

  it('usa durata_min del task quando presente', () => {
    const tasks = [task('a', { durata_min: 60 }), task('b')];
    const s = computeSchedule(tasks, null);
    expect(s.map((e) => e.etaMin)).toEqual([480, 540]); // 480, 480+60
  });

  it('segnala inRitardo se l’arrivo supera la fine finestra', () => {
    const tasks = [task('a', { durata_min: 60 }), task('b', { fascia_oraria: '08:00-08:30' })];
    const s = computeSchedule(tasks, null);
    // arrivo b = 480 + 60 = 540 > 510 (08:30)
    expect(s[1].inRitardo).toBe(true);
    expect(s[0].inRitardo).toBe(false);
  });

  it('finestra senza fine (endMin null) non è mai in ritardo', () => {
    const tasks = [task('a', { durata_min: 600, fascia_oraria: '08:00' })];
    const s = computeSchedule(tasks, null);
    expect(s[0].inRitardo).toBe(false);
  });

  it('con base lontana, la prima ETA include il viaggio', () => {
    const base = { lat: 41, lng: 12 };
    const tasks = [task('a', { lat: 42, lng: 12 })]; // ~111 km → ~267 min a 25 km/h
    const s = computeSchedule(tasks, base);
    expect(s[0].etaMin).toBeGreaterThan(740);
    expect(s[0].etaMin).toBeLessThan(760);
  });

  it('rispetta opts (startMin, durataDefaultMin)', () => {
    const s = computeSchedule([task('a'), task('b')], null, { startMin: 600, durataDefaultMin: 15 });
    expect(s.map((e) => e.etaMin)).toEqual([600, 615]);
  });

  it('lista vuota → []', () => {
    expect(computeSchedule([], null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/timeEngine.test.ts`
Expected: FAIL — modulo `./timeEngine` inesistente.

- [ ] **Step 3: Implementa `timeEngine.ts`**

Crea `utils/routing/timeEngine.ts`:

```ts
import { haversine } from './distance';
import type { Task, ScheduleEntry, OperatorBase } from './types';

/** Durata usata quando il task non porta `durata_min`. */
export const DURATA_DEFAULT_MIN = 30;
/** Velocità media (km/h) per stimare il tempo di viaggio dalla distanza Haversine (linea d'aria). */
export const VELOCITA_MEDIA_KMH = 25;
/** Inizio giornata in minuti da mezzanotte (08:00). */
export const ORARIO_INIZIO_MIN = 480;

export type FasciaWindow = { startMin: number; endMin: number | null };
export type ScheduleOpts = { startMin?: number; speedKmh?: number; durataDefaultMin?: number };

/**
 * Estrae la finestra oraria (minuti da mezzanotte) da una stringa fascia.
 * Gestisce "08:00-12:00", "8-12", "08:00" (solo inizio), "9:30". Non parsabile → null.
 */
export function parseFasciaWindow(s: string | null | undefined): FasciaWindow | null {
  if (!s) return null;
  const matches = Array.from(String(s).matchAll(/(\d{1,2})(?::(\d{2}))?/g));
  if (!matches.length) return null;
  const toMin = (m: RegExpMatchArray): number => {
    const h = parseInt(m[1], 10);
    const min = m[2] != null ? parseInt(m[2], 10) : 0;
    return h * 60 + min;
  };
  const startMin = toMin(matches[0]);
  if (Number.isNaN(startMin)) return null;
  const endRaw = matches.length >= 2 ? toMin(matches[1]) : null;
  return { startMin, endMin: endRaw != null && !Number.isNaN(endRaw) ? endRaw : null };
}

/** Minuti da mezzanotte → "HH:MM" (24h, clamp a >= 0). */
export function formatEtaMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function travelMin(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
  speedKmh: number,
): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  return (haversine(a.lat, a.lng, b.lat, b.lng) / speedKmh) * 60;
}

/**
 * Calcola l'ETA (orario di arrivo, minuti da mezzanotte) per ogni tappa della
 * sequenza GIÀ ordinata, accumulando viaggio + durata. `inRitardo` se l'arrivo
 * supera la fine della finestra oraria del task. Puro.
 */
export function computeSchedule(
  orderedTasks: Task[],
  base: OperatorBase | null | undefined,
  opts?: ScheduleOpts,
): ScheduleEntry[] {
  const startMin = opts?.startMin ?? ORARIO_INIZIO_MIN;
  const speedKmh = opts?.speedKmh != null && opts.speedKmh > 0 ? opts.speedKmh : VELOCITA_MEDIA_KMH;
  const durataDefaultMin = opts?.durataDefaultMin ?? DURATA_DEFAULT_MIN;

  const schedule: ScheduleEntry[] = [];
  let clock = startMin;
  let prev: { lat?: number; lng?: number } | null = base ? { lat: base.lat, lng: base.lng } : null;

  for (const t of orderedTasks) {
    if (prev) clock += travelMin(prev, t, speedKmh);
    const win = parseFasciaWindow(t.fascia_oraria);
    const inRitardo = win != null && win.endMin != null && clock > win.endMin;
    schedule.push({ taskId: t.id, etaMin: Math.round(clock), inRitardo });
    clock += t.durata_min ?? durataDefaultMin;
    prev = { lat: t.lat, lng: t.lng };
  }
  return schedule;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/routing/timeEngine.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint utils/routing/timeEngine.ts utils/routing/timeEngine.test.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/timeEngine.ts utils/routing/timeEngine.test.ts
git commit -m "feat(wp2a): timeEngine puro (parseFasciaWindow, computeSchedule, formatEtaMin)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Optimizer produce lo `schedule`

**Files:**
- Modify: `utils/routing/optimizer.ts`
- Test: `utils/routing/optimizer.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/routing/optimizer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { optimizeRouteByFascia } from './optimizer';
import type { Task } from './types';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over };
}

describe('optimizeRouteByFascia · schedule', () => {
  it('ritorna uno schedule con un entry per task allineato a orderedTasks', () => {
    const tasks = [
      task('a', { lat: 41.90, lng: 12.50, fascia_oraria: '08:00-12:00' }),
      task('b', { lat: 41.91, lng: 12.51, fascia_oraria: '08:00-12:00' }),
    ];
    const res = optimizeRouteByFascia(tasks, { lat: 41.9, lng: 12.5 });
    expect(res.schedule).toBeDefined();
    expect(res.schedule!.length).toBe(res.orderedTasks.length);
    expect(res.schedule!.map((s) => s.taskId)).toEqual(res.orderedTasks.map((t) => t.id));
    expect(res.schedule!.every((s) => typeof s.etaMin === 'number')).toBe(true);
  });

  it('lista vuota → schedule vuoto', () => {
    const res = optimizeRouteByFascia([]);
    expect(res.schedule ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/optimizer.test.ts`
Expected: FAIL — `res.schedule` è `undefined`.

- [ ] **Step 3: Estendi `optimizeRouteByFascia`**

In `utils/routing/optimizer.ts`:

a) Aggiungi l'import in cima (dopo gli import esistenti):

```ts
import { computeSchedule, type ScheduleOpts } from './timeEngine';
```

b) Cambia la firma di `optimizeRouteByFascia`. Sostituisci:

```ts
export function optimizeRouteByFascia(tasks: Task[], base?: OperatorBase): RouteResult {
  if (!tasks.length) {
    return { orderedTasks: [], totalDistanceKm: 0, polyline: [] };
  }
```

con:

```ts
export function optimizeRouteByFascia(tasks: Task[], base?: OperatorBase, opts?: ScheduleOpts): RouteResult {
  if (!tasks.length) {
    return { orderedTasks: [], totalDistanceKm: 0, polyline: [], schedule: [] };
  }
```

c) Sostituisci il `return` finale della funzione:

```ts
  return { orderedTasks: allOrdered, totalDistanceKm, polyline };
}
```

con:

```ts
  const schedule = computeSchedule(allOrdered, base ?? null, opts);

  return { orderedTasks: allOrdered, totalDistanceKm, polyline, schedule };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/routing/optimizer.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint utils/routing/optimizer.ts utils/routing/optimizer.test.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/optimizer.ts utils/routing/optimizer.test.ts
git commit -m "feat(wp2a): optimizeRouteByFascia produce lo schedule (ETA per tappa)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Durata dal DB (`mappaInterventi` + GET)

**Files:**
- Modify: `lib/interventi/mappaInterventi.ts`
- Modify: `lib/interventi/mappaInterventi.test.ts`
- Modify: `app/api/interventi/da-pianificare/route.ts`

- [ ] **Step 1: Aggiorna i test (TDD)**

In `lib/interventi/mappaInterventi.test.ts`, nella factory `row(...)`, aggiungi dentro l'oggetto restituito (es. dopo `richiede_due_operatori: true,`):

```ts
    durata_stimata_min: 45,
```

Nel test "mappa tutti i campi di una riga completa", aggiungi all'oggetto atteso (`toEqual({...})`), dopo `codice: 'S-AI-001',`:

```ts
      durata_min: 45,
```

Nel test "applica i default sui campi null", aggiungi all'override `row({ ... })` il campo `durata_stimata_min: null,` e in fondo agli assert:

```ts
    expect(t.durata_min).toBeUndefined();
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: FAIL — `durata_min` non mappato; `InterventoGeoRow` non ha `durata_stimata_min`.

- [ ] **Step 3: Estendi `InterventoGeoRow` e `mapInterventoToTask`**

In `lib/interventi/mappaInterventi.ts`, dentro `export type InterventoGeoRow = InterventoRow & { ... }`, aggiungi dopo `richiede_due_operatori: boolean | null;`:

```ts
  durata_stimata_min: number | null;
```

In `mapInterventoToTask`, dentro l'oggetto ritornato, aggiungi dopo `codice: row.codice_servizio ?? undefined,`:

```ts
    durata_min: row.durata_stimata_min ?? undefined,
```

- [ ] **Step 4: Aggiungi la colonna alla GET**

In `app/api/interventi/da-pianificare/route.ts`, nella costante `COLONNE`, aggiungi `, durata_stimata_min` alla fine della stringa (prima della chiusura dell'apice):

```ts
const COLONNE =
  'id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id, lat, lng, cap, pdr, matricola_contatore, intervento_tipo, codice_servizio, richiede_due_operatori, data, durata_stimata_min';
```

- [ ] **Step 5: Esegui i test, type-check, lint**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: PASS.
Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint lib/interventi/mappaInterventi.ts app/api/interventi/da-pianificare/route.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add lib/interventi/mappaInterventi.ts lib/interventi/mappaInterventi.test.ts app/api/interventi/da-pianificare/route.ts
git commit -m "feat(wp2a): porta durata_stimata_min nel Task (mappaInterventi + GET)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Durata dall'Excel (`excelParser`)

**Files:**
- Modify: `utils/routing/excelParser.ts`
- Modify: `utils/routing/excelParser.test.ts`

**Contesto:** `detectFormat(headerRow)` (esportato) ritorna una `ColMap`. Il formato "Export Dati / Geocall" usa header leggibili via `findCol`. Il template generato dalla mappa ha una colonna "Tempo Esecuzione".

- [ ] **Step 1: Aggiorna il test (TDD)**

In `utils/routing/excelParser.test.ts`, aggiungi un test che verifica l'estrazione della colonna durata nel formato a header leggibili. Aggiungi in fondo al file:

```ts
import { detectFormat } from './excelParser';

describe('detectFormat · durata', () => {
  it('mappa la colonna "Tempo Esecuzione" nel formato Export Dati', () => {
    const header = ['Indirizzo', 'CAP', 'Comune', 'Fascia', 'Tempo Esecuzione'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.durata).toBe(4);
  });

  it('durata = null se la colonna non esiste', () => {
    const header = ['Indirizzo', 'CAP', 'Comune'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.durata).toBeNull();
  });
});
```

> Nota: se `excelParser.test.ts` non importa già `describe/it/expect`, usa l'import esistente in cima al file; aggiungi solo l'import di `detectFormat` se non presente.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `ColMap` non ha `durata`.

- [ ] **Step 3: Aggiungi `durata` a `ColMap` e ai formati**

In `utils/routing/excelParser.ts`:

a) Nel tipo `ColMap`, aggiungi dopo `codice: number | null;`:

```ts
  durata: number | null;
```

b) Nel ramo **ATTGIORN** del `return` di `detectFormat`, aggiungi dopo `codice: ATTGIORN_COL.CODICE,`:

```ts
      durata: null,
```

c) In ENTRAMBI i `return` del ramo **Massiva** (con e senza header riconosciuto), aggiungi dopo `codice: null,`:

```ts
      durata: null,
```

d) Nel ramo **Export Dati** (ultimo `return`), aggiungi dopo `codice: null,`:

```ts
    durata: findCol(headers, [/tempo.*esec/, /^durata$/, /^tempo$/, /minut/]),
```

- [ ] **Step 4: Popola `durata_min` nella costruzione del Task**

In `parseExcelToTasks`, dentro l'oggetto `task`, aggiungi dopo `codice: colMap.codice != null ? str(row[colMap.codice]) : undefined,`:

```ts
      durata_min: colMap.durata != null ? (Number.parseInt(str(row[colMap.durata]), 10) || undefined) : undefined,
```

- [ ] **Step 5: Esegui i test, type-check, lint**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS.
Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint utils/routing/excelParser.ts utils/routing/excelParser.test.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(wp2a): estrai durata_min dalla colonna Tempo Esecuzione (excelParser)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Integrazione mappa (file CALDO, ULTIMO)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

> ⚠️ FILE CALDO. `git fetch` + rebase su `main` prima. Le righe possono shiftare: usa le ancore di testo.

- [ ] **Step 1: Fetch + rebase**

```bash
git fetch origin
git rebase origin/main
```

Expected: rebase pulito. In caso di conflitto su `MappaOperatoriClient.tsx`, risolverlo preservando le modifiche di `main` e poi `git rebase --continue`.

- [ ] **Step 2: Registra la baseline eslint del file**

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Annota il conteggio finale (es. "24 problems"). Gli edit NON devono aumentarlo.

- [ ] **Step 3: Import del formatter ETA e del tipo**

Dopo `import { buildDistribuzionePayload } from '@/lib/interventi/mappaInterventi';` aggiungi:

```ts
import { formatEtaMin } from '@/utils/routing/timeEngine';
import type { ScheduleEntry } from '@/utils/routing';
```

- [ ] **Step 4: Aggiungi `schedule` al tipo `DistEntry`**

Nel tipo `DistEntry`, dopo `polyline: Array<{ lat: number; lng: number }>;` aggiungi:

```ts
  schedule?: ScheduleEntry[];
```

- [ ] **Step 5: Propaga lo `schedule` in `distributeToOps`**

Nel `distributeToOps`, dove si costruisce ogni `DistEntry` (blocco `optimizeRouteByFascia(grp, op.base ?? undefined)`), sostituisci:

```ts
    const routeRes =
      grp.length >= 1
        ? optimizeRouteByFascia(grp, op.base ?? undefined)
        : { orderedTasks: grp, totalDistanceKm: 0, polyline: [] };
    return {
      op: op.name ?? op.id ?? 'Operatore',
      staffId: op.id,
      color: OP_COLORS[i % OP_COLORS.length],
      tasks: routeRes.orderedTasks,
      km: routeRes.totalDistanceKm,
      polyline: routeRes.polyline,
      base: op.base,
      startAddress: op.startAddress,
    };
```

con:

```ts
    const routeRes =
      grp.length >= 1
        ? optimizeRouteByFascia(grp, op.base ?? undefined)
        : { orderedTasks: grp, totalDistanceKm: 0, polyline: [], schedule: [] };
    return {
      op: op.name ?? op.id ?? 'Operatore',
      staffId: op.id,
      color: OP_COLORS[i % OP_COLORS.length],
      tasks: routeRes.orderedTasks,
      km: routeRes.totalDistanceKm,
      polyline: routeRes.polyline,
      base: op.base,
      startAddress: op.startAddress,
      schedule: routeRes.schedule,
    };
```

- [ ] **Step 6: Propaga lo `schedule` in `moveTask` e `assignUnassignedTask`**

In `moveTask`, sostituisci:

```ts
      const res = optimizeRouteByFascia(grp, newDist[i].base ?? undefined);
      newDist[i] = { ...newDist[i], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline };
```

con:

```ts
      const res = optimizeRouteByFascia(grp, newDist[i].base ?? undefined);
      newDist[i] = { ...newDist[i], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline, schedule: res.schedule };
```

In `assignUnassignedTask`, sostituisci:

```ts
    const res = optimizeRouteByFascia(grp, newDist[toIdx].base ?? undefined);
    newDist[toIdx] = { ...newDist[toIdx], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline };
```

con:

```ts
    const res = optimizeRouteByFascia(grp, newDist[toIdx].base ?? undefined);
    newDist[toIdx] = { ...newDist[toIdx], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline, schedule: res.schedule };
```

- [ ] **Step 7: Mostra ETA + badge ritardo nella lista task per operatore**

Nel rendering `distribution.map((d, i) => (...))`, dentro `tasks.map((t, idx) => { ... })`, individua la riga della fascia:

```tsx
                                {t.fascia_oraria && <div className="text-[var(--brand-text-subtle)]">{t.fascia_oraria}</div>}
```

e aggiungi SUBITO DOPO:

```tsx
                                {(() => {
                                  const sched = d.schedule?.find((s) => s.taskId === t.id);
                                  if (!sched) return null;
                                  return (
                                    <div className={sched.inRitardo ? 'font-medium text-[var(--warning)]' : 'text-[var(--brand-text-subtle)]'}>
                                      ETA {formatEtaMin(sched.etaMin)}{sched.inRitardo ? ' · in ritardo' : ''}
                                    </div>
                                  );
                                })()}
```

> Se la variabile del map esterno non si chiama `d`, usa il nome reale del parametro di `distribution.map((<param>, i) => ...)`.

- [ ] **Step 8: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: stesso conteggio della baseline di Step 2 (nessun nuovo problema).

- [ ] **Step 9: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(wp2a): mappa — ETA per tappa e badge ritardo nella distribuzione" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Gate finali e chiusura WP

- [ ] **Step 1: Gate completi**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run test`
Expected: tutti verdi (inclusi `timeEngine.test.ts`, `optimizer.test.ts`, `mappaInterventi.test.ts`, `excelParser.test.ts`).

- [ ] **Step 2: Accettazione (manuale, a cura dell'utente con `npm run dev`)**

1. Carica interventi del giorno (o Excel con "Tempo Esecuzione") → distribuisci tra operatori.
2. Verifica che ogni tappa mostri un ETA crescente (`HH:MM`) e che gli interventi che sforano la fascia abbiano il badge "in ritardo".

- [ ] **Step 3: Chiusura WP**

```bash
git fetch origin
git switch main
git merge --ff-only feat/wp2a-motore-tempi
# push: lo esegue l'utente (push diretto su main bloccato per l'assistant)
git branch -d feat/wp2a-motore-tempi
```

---

## Note di implementazione
- **Niente migration**: `durata_stimata_min` esiste già.
- **Retro-compatibilità**: `opts` di `optimizeRouteByFascia` è opzionale; i call site che non lo passano usano i default (costanti). `optimizeRoute` (rotta singola) NON è toccato.
- **Tipi senza ciclo**: `ScheduleEntry` vive in `types.ts` (usato da `RouteResult`); `FasciaWindow`/`ScheduleOpts` in `timeEngine.ts`.
- **UI è un primo passo**: l'ETA/badge sono minimali (richiesta utente: "da ottimizzare").
