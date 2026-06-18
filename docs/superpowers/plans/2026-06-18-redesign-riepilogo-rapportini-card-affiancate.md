# Redesign Riepilogo rapportini — card affiancate + spostamento di giorno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare il Riepilogo rapportini (`/hub/mappa?vista=riepilogo`) con una card per pianificazione affiancate in griglia, giorni ordinati con "oggi" in cima, e aggiungere lo spostamento di **giorno** per singolo operatore e per intera pianificazione.

**Architecture:** Logica pura in `utils/rapportini/` (ordine giorni, raggruppamento per piano) testata con vitest. Due nuovi endpoint PATCH che orchestrano Supabase riusando helper puri esistenti (`scadenzaIso`, `rilevaConflitti`, `risolviTerritorioDestinazione`). UI rifattorizzata in componenti piccoli (`IntestazioneGiorno`, `MenuSposta`, `CardPianificazione`).

**Tech Stack:** Next.js (App Router, route handlers `runtime = 'nodejs'`), React client components, Tailwind con CSS vars `--brand-*`, Supabase (`supabaseAdmin`), vitest.

## Global Constraints

- **Nessuna migrazione SQL.** Tutti i campi esistono già (`rapportini.data`, `rapportini.expires_at`, `mappa_piani.data/territorio`, `interventi.data`, `mappa_distribuzioni`).
- **Token e voci compilate intatti** in ogni spostamento: si tocca solo `data`/`expires_at`/`territorio`, mai `token`, `rapportino_voci`, `campi_snapshot`.
- **Scadenza derivata dalla data:** `expires_at = scadenzaIso(data)` (`utils/rapportini/scadenza.ts`).
- **Auth:** gli endpoint di scrittura usano `requireAdmin` (come `app/api/mappa/rapportini/territorio/route.ts`).
- **Conflitto invariante:** mai due rapportini dello stesso `staff_id` sullo stesso `(territorio, data)`. Riuso `rilevaConflitti` (`utils/rapportini/rilevaConflitti.ts`).
- **Baseline lint/test già rossa su main** (problemi preesistenti): il gate è "nessun nuovo problema dai file toccati" → verificare con `npx eslint <path>` e `npx vitest run <file>`.
- **Lingua UI:** italiano; classi colore via `var(--brand-*)`, `var(--success/--warning/--danger-*)`.

---

### Task 1: Helper puri per l'ordine e l'etichetta dei giorni

**Files:**
- Create: `utils/rapportini/giorniRiepilogo.ts`
- Test: `utils/rapportini/giorniRiepilogo.test.ts`

**Interfaces:**
- Produces:
  - `ordinaGiorni(giorni: string[], oggi: string): string[]` — ordina date `YYYY-MM-DD`: `oggi` per primo (se presente), poi i futuri crescenti, poi i passati decrescenti.
  - `etichettaRelativaGiorno(data: string, oggi: string): 'oggi' | 'domani' | 'ieri' | null` — usa `addGiorni` da `scadenza.ts`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { ordinaGiorni, etichettaRelativaGiorno } from './giorniRiepilogo';

describe('ordinaGiorni', () => {
  it('mette oggi per primo, poi futuri asc, poi passati desc', () => {
    const giorni = ['2026-06-16', '2026-06-20', '2026-06-18', '2026-06-19', '2026-06-17'];
    expect(ordinaGiorni(giorni, '2026-06-18')).toEqual([
      '2026-06-18', // oggi
      '2026-06-19', '2026-06-20', // futuri asc
      '2026-06-17', '2026-06-16', // passati desc
    ]);
  });
  it('funziona se oggi non è tra i giorni (solo futuri/passati)', () => {
    expect(ordinaGiorni(['2026-06-20', '2026-06-15'], '2026-06-18')).toEqual(['2026-06-20', '2026-06-15']);
  });
  it('ritorna [] su input vuoto', () => {
    expect(ordinaGiorni([], '2026-06-18')).toEqual([]);
  });
});

describe('etichettaRelativaGiorno', () => {
  it('riconosce oggi/domani/ieri e altrimenti null', () => {
    expect(etichettaRelativaGiorno('2026-06-18', '2026-06-18')).toBe('oggi');
    expect(etichettaRelativaGiorno('2026-06-19', '2026-06-18')).toBe('domani');
    expect(etichettaRelativaGiorno('2026-06-17', '2026-06-18')).toBe('ieri');
    expect(etichettaRelativaGiorno('2026-06-25', '2026-06-18')).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/giorniRiepilogo.test.ts`
Expected: FAIL (`giorniRiepilogo` non esiste).

- [ ] **Step 3: Implementa il minimo**

```ts
// utils/rapportini/giorniRiepilogo.ts
import { addGiorni } from './scadenza';

/** Ordina date YYYY-MM-DD: oggi primo, poi futuri asc, poi passati desc. */
export function ordinaGiorni(giorni: string[], oggi: string): string[] {
  const futuri = giorni.filter((g) => g > oggi).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const passati = giorni.filter((g) => g < oggi).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const haOggi = giorni.filter((g) => g === oggi);
  return [...haOggi, ...futuri, ...passati];
}

/** 'oggi' | 'domani' | 'ieri' | null rispetto a `oggi` (YYYY-MM-DD). */
export function etichettaRelativaGiorno(
  data: string,
  oggi: string,
): 'oggi' | 'domani' | 'ieri' | null {
  if (data === oggi) return 'oggi';
  if (data === addGiorni(oggi, 1)) return 'domani';
  if (data === addGiorni(oggi, -1)) return 'ieri';
  return null;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/giorniRiepilogo.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/giorniRiepilogo.ts utils/rapportini/giorniRiepilogo.test.ts
git commit -m "feat(riepilogo): helper ordine giorni (oggi in cima) ed etichetta relativa"
```

---

### Task 2: Raggruppamento per pianificazione (`groupByDayPiano`)

**Files:**
- Create: `utils/rapportini/groupByDayPiano.ts`
- Test: `utils/rapportini/groupByDayPiano.test.ts`

**Interfaces:**
- Consumes: `RapRiepilogo` (da `utils/rapportini/groupByDay.ts`), `ordinaGiorni` (Task 1).
- Produces:
  - `type PianoCard = { piano_id: string; territorio: string | null; creato_at: string | null; operatori: RapRiepilogo[] }`
  - `type GiornoPiani = { data: string; piani: PianoCard[] }`
  - `groupByDayPiano(raps: RapRiepilogo[], oggi: string): GiornoPiani[]` — una `PianoCard` per `(data, piano_id)`; `territorio` = etichetta effettiva (campo `r.territorio`, già risolto dalla route); giorni ordinati con `ordinaGiorni`; dentro al giorno i piani ordinati per territorio (asc, "senza territorio" per ultimo) poi `creato_at` asc.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { groupByDayPiano } from './groupByDayPiano';
import type { RapRiepilogo } from './groupByDay';

const rap = (o: Partial<RapRiepilogo> & { id: string; piano_id: string; data: string }): RapRiepilogo => ({
  staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  territorio: null, piano_creato_at: null, ...o,
});

describe('groupByDayPiano', () => {
  it('crea una card per (data, piano_id) e ordina i giorni con oggi in cima', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-19', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'SUD', piano_creato_at: '2026-06-18T10:00:00Z' }),
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T08:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out.map((g) => g.data)).toEqual(['2026-06-18', '2026-06-19']);
    // dentro il 18: NORD prima di SUD (alfabetico)
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p3', 'p2']);
    expect(out[0].piani[0]).toMatchObject({ piano_id: 'p3', territorio: 'NORD', creato_at: '2026-06-18T08:00:00Z' });
  });

  it('due piani stesso territorio/giorno → due card ordinate per creato_at', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'late', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T14:00:00Z' }),
      rap({ id: 'b', piano_id: 'early', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['early', 'late']);
  });

  it('"senza territorio" va in fondo nel giorno', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: null, piano_creato_at: '2026-06-18T08:00:00Z' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'NORD', piano_creato_at: '2026-06-18T09:00:00Z' }),
    ];
    const out = groupByDayPiano(raps, '2026-06-18');
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p2', 'p1']);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/groupByDayPiano.test.ts`
Expected: FAIL (`groupByDayPiano` non esiste).

- [ ] **Step 3: Implementa il minimo**

```ts
// utils/rapportini/groupByDayPiano.ts
import type { RapRiepilogo } from './groupByDay';
import { ordinaGiorni } from './giorniRiepilogo';

export type PianoCard = {
  piano_id: string;
  territorio: string | null;
  creato_at: string | null;
  operatori: RapRiepilogo[];
};
export type GiornoPiani = { data: string; piani: PianoCard[] };

const SENZA = '￿'; // ordina sempre per ultimo
const chiaveTerr = (t: string | null) => {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
};

export function groupByDayPiano(raps: RapRiepilogo[], oggi: string): GiornoPiani[] {
  const byDay = new Map<string, Map<string, PianoCard>>();
  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const piani = byDay.get(r.data)!;
    if (!piani.has(r.piano_id)) {
      piani.set(r.piano_id, {
        piano_id: r.piano_id,
        territorio: (r.territorio ?? '').trim() || null,
        creato_at: r.piano_creato_at ?? null,
        operatori: [],
      });
    }
    piani.get(r.piano_id)!.operatori.push(r);
  }
  const giorniOrdinati = ordinaGiorni([...byDay.keys()], oggi);
  return giorniOrdinati.map((data) => ({
    data,
    piani: [...byDay.get(data)!.values()].sort((a, b) => {
      const ta = chiaveTerr(a.territorio);
      const tb = chiaveTerr(b.territorio);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (a.creato_at ?? '').localeCompare(b.creato_at ?? '');
    }),
  }));
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/groupByDayPiano.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/groupByDayPiano.ts utils/rapportini/groupByDayPiano.test.ts
git commit -m "feat(riepilogo): raggruppamento per pianificazione (una card per piano)"
```

---

### Task 3: Endpoint spostamento di giorno — singolo operatore

**Files:**
- Create: `lib/interventi/spostaData.ts`
- Create: `app/api/mappa/rapportini/data/route.ts`

**Interfaces:**
- Consumes: `scadenzaIso` (`utils/rapportini/scadenza.ts`), `rilevaConflitti` + `RapEsistente` (`utils/rapportini/rilevaConflitti.ts`), `territorioEffettivo` (`utils/rapportini/territorioEffettivo.ts`), `requireAdmin` (`lib/apiAuth.ts`), `supabaseAdmin` (`lib/supabaseAdmin.ts`).
- Produces: `applicaSpostamentoDataRapportino(db, rapportinoId, nuovaData): Promise<SpostamentoDataResult>` con `type SpostamentoDataResult = { ok: true } | { ok: false; status: number; error?: string; conflicts?: Conflitto[] }`.

> Verifica: orchestrazione DB (pattern del progetto: niente unit test sulla route; verifica con `npx tsc --noEmit`, `npx eslint`, e prova manuale). La logica pura riusata (`scadenzaIso`, `rilevaConflitti`) è già testata.

- [ ] **Step 1: Implementa la lib di orchestrazione**

```ts
// lib/interventi/spostaData.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';

export type SpostamentoDataResult =
  | { ok: true }
  | { ok: false; status: number; error?: string; conflicts?: Conflitto[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sposta un singolo rapportino su un altro giorno: aggiorna data + expires_at.
 *  Blocca se crea un duplicato dello stesso operatore su (territorio effettivo, nuovaData). */
export async function applicaSpostamentoDataRapportino(
  db: SupabaseClient,
  rapportinoId: string,
  nuovaData: string,
): Promise<SpostamentoDataResult> {
  if (!ISO_DATE.test(nuovaData)) return { ok: false, status: 400, error: 'Data non valida.' };

  const { data: rap } = await db
    .from('rapportini')
    .select('id, piano_id, staff_id, staff_name, data, territorio_override')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (!rap) return { ok: false, status: 404, error: 'Rapportino non trovato.' };
  const r = rap as {
    id: string; piano_id: string; staff_id: string; staff_name: string | null;
    data: string; territorio_override: string | null;
  };
  if (r.data === nuovaData) return { ok: true };

  const { data: piano } = await db.from('mappa_piani').select('territorio').eq('id', r.piano_id).maybeSingle();
  const territorio = territorioEffettivo(r.territorio_override, (piano as { territorio: string | null } | null)?.territorio ?? null);

  // Conflitto: stesso operatore già su (territorio, nuovaData) in un altro piano.
  const { data: altri } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at, territorio_override')
    .eq('data', nuovaData)
    .eq('staff_id', r.staff_id)
    .neq('piano_id', r.piano_id);
  const altriPianoIds = [...new Set(((altri ?? []) as Array<{ piano_id: string }>).map((a) => a.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: piani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    (piani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = ((altri ?? []) as Array<{
    id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>).map((a) => ({
    id: a.id, staff_id: a.staff_id, piano_id: a.piano_id, data: a.data, stato: a.stato, submitted_at: a.submitted_at,
    territorio: territorioEffettivo(a.territorio_override, terrByPiano[a.piano_id] ?? null),
  }));
  const conflicts = rilevaConflitti({
    pianoId: r.piano_id, territorio, data: nuovaData,
    operatori: [{ staff_id: r.staff_id, staff_name: r.staff_name }],
    esistenti,
  });
  if (conflicts.length > 0) return { ok: false, status: 409, conflicts };

  const { error } = await db
    .from('rapportini')
    .update({ data: nuovaData, expires_at: scadenzaIso(nuovaData) })
    .eq('id', rapportinoId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 2: Implementa la route PATCH**

```ts
// app/api/mappa/rapportini/data/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoDataRapportino } from '@/lib/interventi/spostaData';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { rapportinoId?: string; data?: string };
  const rapportinoId = String(body.rapportinoId ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!rapportinoId) return NextResponse.json({ error: 'rapportinoId richiesto.' }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'data richiesta.' }, { status: 400 });

  const res = await applicaSpostamentoDataRapportino(supabaseAdmin, rapportinoId, data);
  if (!res.ok) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verifica tipi e lint**

Run: `npx tsc --noEmit` (atteso: nessun nuovo errore sui file creati)
Run: `npx eslint lib/interventi/spostaData.ts app/api/mappa/rapportini/data/route.ts` (atteso: pulito)

- [ ] **Step 4: Commit**

```bash
git add lib/interventi/spostaData.ts app/api/mappa/rapportini/data/route.ts
git commit -m "feat(riepilogo): endpoint sposta-giorno per singolo operatore (data+scadenza, blocco duplicati)"
```

---

### Task 4: Endpoint spostamento di giorno e/o territorio — intera pianificazione

**Files:**
- Create: `lib/interventi/spostaPiano.ts`
- Create: `app/api/mappa/piani/sposta/route.ts`

**Interfaces:**
- Consumes: `scadenzaIso`, `rilevaConflitti`/`RapEsistente`/`Conflitto`, `territorioEffettivo`, `buildIdByName` + `risolviTerritorioDestinazione` (`lib/interventi/territorioOverride.ts`), `supabaseAdmin`, `requireAdmin`.
- Produces: `applicaSpostamentoPiano(db, pianoId, opts: { data?: string; territorio?: string | null }): Promise<SpostamentoPianoResult>` con `type SpostamentoPianoResult = { ok: true } | { ok: false; status: number; error?: string; conflicts?: Conflitto[] }`.

Comportamento:
- Carica il piano (`data`, `territorio`) e i suoi rapportini (`id, staff_id, staff_name, stato, submitted_at, territorio_override`).
- `nuovaData = opts.data ?? piano.data`; `nuovoTerr = opts.territorio !== undefined ? opts.territorio : piano.territorio`.
- Conflitto: per ogni operatore del piano, c'è già un rapportino su `(nuovoTerr, nuovaData)` in un piano diverso? Se sì → `409 { conflicts }`, niente scritture.
- Scritture (solo se nessun conflitto):
  - `mappa_piani`: aggiorna `data` (se cambiata) e/o `territorio` (se cambiato).
  - Se `data` cambiata: per ogni rapportino del piano → `data = nuovaData`, `expires_at = scadenzaIso(nuovaData)`; `interventi` del piano → `data = nuovaData`; `mappa_distribuzioni`: azzera `task_count` su `(staff_id, vecchiaData)` e upsert su `(staff_id, nuovaData)` con il `task_count` da `mappa_piani_operatori`.
  - Se `territorio` cambiato: azzera i `territorio_override` divergenti dei rapportini del piano (così la card riflette il nuovo territorio) e riallinea `interventi.territorio_id` via `risolviTerritorioDestinazione`.

> Verifica: come Task 3 (orchestrazione, no unit test; `tsc`+`eslint`+manuale). Le decisioni pure riusate sono già testate.

- [ ] **Step 1: Implementa la lib di orchestrazione**

```ts
// lib/interventi/spostaPiano.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';
import { buildIdByName, risolviTerritorioDestinazione } from '@/lib/interventi/territorioOverride';

export type SpostamentoPianoResult =
  | { ok: true }
  | { ok: false; status: number; error?: string; conflicts?: Conflitto[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function applicaSpostamentoPiano(
  db: SupabaseClient,
  pianoId: string,
  opts: { data?: string; territorio?: string | null },
): Promise<SpostamentoPianoResult> {
  if (opts.data !== undefined && !ISO_DATE.test(opts.data)) return { ok: false, status: 400, error: 'Data non valida.' };
  if (opts.data === undefined && opts.territorio === undefined) {
    return { ok: false, status: 400, error: 'Specificare data e/o territorio.' };
  }

  const { data: piano } = await db.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).maybeSingle();
  if (!piano) return { ok: false, status: 404, error: 'Piano non trovato.' };
  const p = piano as { id: string; data: string; territorio: string | null };

  const nuovaData = opts.data ?? p.data;
  const nuovoTerr = opts.territorio !== undefined ? opts.territorio : p.territorio;
  const cambiaData = nuovaData !== p.data;
  const cambiaTerr = (nuovoTerr ?? '') !== (p.territorio ?? '');
  if (!cambiaData && !cambiaTerr) return { ok: true };

  const { data: rapsRaw } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, stato, submitted_at, territorio_override')
    .eq('piano_id', pianoId);
  const raps = (rapsRaw ?? []) as Array<{
    id: string; staff_id: string; staff_name: string | null; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>;

  // Conflitto: gli operatori del piano finirebbero su (nuovoTerr, nuovaData) dove esiste già un loro rapportino.
  const operatori = raps.map((r) => ({ staff_id: r.staff_id, staff_name: r.staff_name }));
  const { data: altriRaw } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at, territorio_override')
    .eq('data', nuovaData)
    .neq('piano_id', pianoId)
    .in('staff_id', operatori.map((o) => o.staff_id));
  const altri = (altriRaw ?? []) as Array<{
    id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>;
  const altriPianoIds = [...new Set(altri.map((a) => a.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: piani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    (piani ?? []).forEach((x: { id: string; territorio: string | null }) => { terrByPiano[x.id] = x.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = altri.map((a) => ({
    id: a.id, staff_id: a.staff_id, piano_id: a.piano_id, data: a.data, stato: a.stato, submitted_at: a.submitted_at,
    territorio: territorioEffettivo(a.territorio_override, terrByPiano[a.piano_id] ?? null),
  }));
  const conflicts = rilevaConflitti({ pianoId, territorio: nuovoTerr, data: nuovaData, operatori, esistenti });
  if (conflicts.length > 0) return { ok: false, status: 409, conflicts };

  // --- Scritture (nessuna transazione nativa in PostgREST: ordine prudente) ---
  const headerUpdate: Record<string, unknown> = {};
  if (cambiaData) headerUpdate.data = nuovaData;
  if (cambiaTerr) headerUpdate.territorio = nuovoTerr;
  const { error: eHead } = await db.from('mappa_piani').update(headerUpdate).eq('id', pianoId);
  if (eHead) return { ok: false, status: 500, error: eHead.message };

  if (cambiaData) {
    const expires = scadenzaIso(nuovaData);
    const { error: eRap } = await db.from('rapportini').update({ data: nuovaData, expires_at: expires }).eq('piano_id', pianoId);
    if (eRap) return { ok: false, status: 500, error: eRap.message };
    await db.from('interventi').update({ data: nuovaData }).eq('piano_id', pianoId);

    // Distribuzioni: azzera la vecchia data, upsert la nuova con i task_count del piano.
    const staffIds = operatori.map((o) => o.staff_id);
    if (staffIds.length) {
      await db.from('mappa_distribuzioni')
        .update({ task_count: 0, updated_at: new Date().toISOString() })
        .in('staff_id', staffIds).eq('data', p.data);
      const { data: opsRows } = await db.from('mappa_piani_operatori').select('staff_id, task_count').eq('piano_id', pianoId);
      const rows = ((opsRows ?? []) as Array<{ staff_id: string; task_count: number | null }>).map((o) => ({
        staff_id: o.staff_id, data: nuovaData, task_count: Number(o.task_count ?? 0), updated_at: new Date().toISOString(),
      }));
      if (rows.length) await db.from('mappa_distribuzioni').upsert(rows, { onConflict: 'staff_id,data' });
    }
  }

  if (cambiaTerr) {
    // Azzera gli override divergenti e riallinea interventi.territorio_id al nuovo territorio del piano.
    await db.from('rapportini').update({ territorio_override: null }).eq('piano_id', pianoId).not('territorio_override', 'is', null);
    const { data: terr } = await db.from('territories').select('id, name');
    const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);
    const ris = risolviTerritorioDestinazione(null, nuovoTerr, idByName);
    const territorioId = ris.ok ? ris.territorioId : null;
    await db.from('interventi').update({ territorio_id: territorioId }).eq('piano_id', pianoId);
  }

  return { ok: true };
}
```

- [ ] **Step 2: Implementa la route PATCH**

```ts
// app/api/mappa/piani/sposta/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoPiano } from '@/lib/interventi/spostaPiano';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { pianoId?: string; data?: string; territorio?: string | null };
  const pianoId = String(body.pianoId ?? '').trim();
  if (!pianoId) return NextResponse.json({ error: 'pianoId richiesto.' }, { status: 400 });

  const opts: { data?: string; territorio?: string | null } = {};
  if (typeof body.data === 'string' && body.data.trim()) opts.data = body.data.trim();
  if ('territorio' in body) opts.territorio = body.territorio ?? null;

  const res = await applicaSpostamentoPiano(supabaseAdmin, pianoId, opts);
  if (!res.ok) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verifica tipi e lint**

Run: `npx tsc --noEmit`
Run: `npx eslint lib/interventi/spostaPiano.ts app/api/mappa/piani/sposta/route.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/interventi/spostaPiano.ts app/api/mappa/piani/sposta/route.ts
git commit -m "feat(riepilogo): endpoint sposta piano (giorno e/o territorio) con distribuzioni e blocco duplicati"
```

---

### Task 5: Componente `IntestazioneGiorno`

**Files:**
- Create: `components/modules/mappa/riepilogo/IntestazioneGiorno.tsx`

**Interfaces:**
- Consumes: `etichettaRelativaGiorno` (Task 1), `GiornoPiani` (Task 2).
- Produces: default export `IntestazioneGiorno({ giorno, oggi }: { giorno: GiornoPiani; oggi: string })`.

Comportamento: mostra la data estesa (`toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })`, `capitalize`), un badge se `etichettaRelativaGiorno` ≠ null (`Oggi` con `bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]`, `Domani`/`Ieri` neutro `bg-[var(--brand-surface-muted)]`), e i conteggi `N piani · N operatori · N interventi` dove `nOperatori = somma operatori`, `nInterventi = somma nVoci`.

- [ ] **Step 1: Implementa il componente**

```tsx
'use client';
import type { GiornoPiani } from '@/utils/rapportini/groupByDayPiano';
import { etichettaRelativaGiorno } from '@/utils/rapportini/giorniRiepilogo';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

const BADGE: Record<'oggi' | 'domani' | 'ieri', { label: string; cls: string }> = {
  oggi: { label: 'Oggi', cls: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' },
  domani: { label: 'Domani', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
  ieri: { label: 'Ieri', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
};

export default function IntestazioneGiorno({ giorno, oggi }: { giorno: GiornoPiani; oggi: string }) {
  const rel = etichettaRelativaGiorno(giorno.data, oggi);
  const nPiani = giorno.piani.length;
  const nOperatori = giorno.piani.reduce((s, p) => s + p.operatori.length, 0);
  const nInterventi = giorno.piani.reduce((s, p) => s + p.operatori.reduce((x, o) => x + (o.nVoci ?? 0), 0), 0);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {rel && (
        <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${BADGE[rel].cls}`}>{BADGE[rel].label}</span>
      )}
      <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(giorno.data)}</h3>
      <span className="text-xs text-[var(--brand-text-muted)]">· {nPiani} piani · {nOperatori} operatori · {nInterventi} interventi</span>
    </div>
  );
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ; `npx eslint components/modules/mappa/riepilogo/IntestazioneGiorno.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/riepilogo/IntestazioneGiorno.tsx
git commit -m "feat(riepilogo): intestazione giorno con badge oggi/domani/ieri e conteggi"
```

---

### Task 6: Componente `MenuSposta` (territorio | giorno)

**Files:**
- Create: `components/modules/mappa/riepilogo/MenuSposta.tsx`

**Interfaces:**
- Consumes: `DatePicker` (`components/ui/DatePicker.tsx`).
- Produces: default export
  ```ts
  MenuSposta({ modo, territori, territorioCorrente, onSpostaTerritorio, onSpostaData, busy, label }: {
    modo: 'operatore' | 'piano';
    territori: Array<{ id: string; name: string }>;
    territorioCorrente: string | null;
    onSpostaTerritorio: (territorio: string | null) => void;
    onSpostaData: (dataIso: string) => void;
    busy: boolean;
    label?: string; // testo del trigger; default '↪'
  })
  ```

Comportamento: un trigger (`label`, default `↪`) apre un menu in-flow con due sezioni: **Territorio** (select con i territori + opzione "↩ Riporta al piano" se `modo==='operatore'` e c'è override → invia `null`) e **Giorno** (un `DatePicker` con `value=''`, `onChange` → `onSpostaData(iso)`). Per `modo==='piano'` il select territorio offre tutti i territori (lo spostamento applica all'intero piano). Chiude su selezione o click esterno (gestione `open` locale + `useRef` come in `DatePicker`). Disabilita i controlli se `busy`.

> Nota: riusa lo stile select esistente in `CardTerritorio.tsx:110-122` (bordo `--brand-border`, testo `text-[11px]`). Il `DatePicker` accetta `triggerClassName` per uniformare la dimensione.

- [ ] **Step 1: Implementa il componente** (menu con stato `open`, due sezioni; usa `DatePicker` con `value=""` e `onChange`)

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';

export default function MenuSposta({
  modo, territori, territorioCorrente, onSpostaTerritorio, onSpostaData, busy, label = '↪',
}: {
  modo: 'operatore' | 'piano';
  territori: Array<{ id: string; name: string }>;
  territorioCorrente: string | null;
  onSpostaTerritorio: (territorio: string | null) => void;
  onSpostaData: (dataIso: string) => void;
  busy: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title="Sposta in un altro territorio o giorno"
        className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)] hover:text-[var(--brand-primary)] disabled:opacity-50"
      >{label}</button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-56 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 text-[12px]" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">In un altro territorio</div>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => { const v = e.target.value; if (v === '') return; onSpostaTerritorio(v === '__reset__' ? null : v); setOpen(false); }}
            className="mb-2 w-full rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-1 text-[12px]"
          >
            <option value="" disabled>Scegli territorio…</option>
            {modo === 'operatore' && territorioCorrente && <option value="__reset__">↩ Riporta al piano</option>}
            {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">In un altro giorno</div>
          <DatePicker
            value=""
            onChange={(iso) => { onSpostaData(iso); setOpen(false); }}
            disabled={busy}
            ariaLabel="Sposta a giorno"
            fullWidth
            triggerClassName="border border-[var(--brand-border)] bg-[var(--brand-surface)]"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ; `npx eslint components/modules/mappa/riepilogo/MenuSposta.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/riepilogo/MenuSposta.tsx
git commit -m "feat(riepilogo): MenuSposta condiviso (territorio | giorno) con DatePicker"
```

---

### Task 7: Componente `CardPianificazione` (una card per piano)

**Files:**
- Create: `components/modules/mappa/riepilogo/CardPianificazione.tsx`

**Interfaces:**
- Consumes: `PianoCard` (Task 2), `statoBadge`/`whatsappHref`/`RapportinoStato` (`utils/rapportini/links.ts`), `ModaleScaricaFoto` (`components/modules/mappa/riepilogo/ModaleScaricaFoto.tsx`), `MenuSposta` (Task 6).
- Produces: default export
  ```ts
  CardPianificazione({ piano, dataLabel, copiedToken, onCopia, onRiapriHref, onEliminaPiano, onRimuoviOp,
    onRiapriRapportino, confirmPiano, setConfirmPiano, confirmOp, setConfirmOp, busy, territori,
    onSpostaTerritorioOperatore, onSpostaDataOperatore, onSpostaPiano }: { ... })
  ```

Comportamento: deriva da `CardTerritorio.tsx` (corpo righe operatore **identico**: tasti 🔗/🔒/📲/👁/⤓/🖼️ e conferme rimuovi/elimina invariati), con queste differenze:
- header card = **una pianificazione**: etichetta `piano.territorio ?? 'Senza territorio'` + `creato HH:MM` (da `piano.creato_at`); azioni piano: `↗ Riapri` (href `onRiapriHref(piano.piano_id)`), `Sposta piano ▾` (= `MenuSposta` `modo="piano"`, `onSpostaTerritorio={(t)=>onSpostaPiano(piano.piano_id,{territorio:t})}`, `onSpostaData={(d)=>onSpostaPiano(piano.piano_id,{data:d})}`), `🗑 Elimina` (conferma come oggi).
- niente più `multiPiano`/mini-header annidati: la card è già un singolo piano.
- nella riga operatore, il vecchio bottone/menù `↪` (select territorio) è sostituito da `MenuSposta` `modo="operatore"` con `onSpostaTerritorio={(t)=>onSpostaTerritorioOperatore(r.id,t)}` e `onSpostaData={(d)=>onSpostaDataOperatore(r.id,d)}`; resta il badge "↪ spostato" se `r.territorio_override`.

> Implementazione: copia `CardTerritorio.tsx` come base, rimuovi il ramo `multiPiano` e il `.map(piani)` (ora c'è un solo `piano`), sostituisci il blocco select-territorio (righe ~110-130) con `<MenuSposta … />`. Mantieni `ModaleScaricaFoto`, `fmtOra`, e tutte le altre azioni **invariate**.

- [ ] **Step 1: Crea `CardPianificazione.tsx`** partendo da `CardTerritorio.tsx`, applicando le differenze sopra. Header:

```tsx
<div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-3 py-2">
  <span className="flex items-center gap-2">
    <span className="text-sm font-semibold">{piano.territorio ?? 'Senza territorio'}</span>
    <span className="text-[11px] text-[var(--brand-text-muted)]">creato {fmtOra(piano.creato_at)}</span>
  </span>
  <span className="flex items-center gap-2 text-[11px]">
    <span className="text-xs text-[var(--brand-text-muted)]">{piano.operatori.length} operatori</span>
    <a href={onRiapriHref(piano.piano_id)} className="font-medium text-[var(--brand-primary)] hover:opacity-90">↗ Riapri</a>
    <MenuSposta modo="piano" territori={territori} territorioCorrente={piano.territorio}
      onSpostaTerritorio={(t) => onSpostaPiano(piano.piano_id, { territorio: t })}
      onSpostaData={(d) => onSpostaPiano(piano.piano_id, { data: d })}
      busy={busy} label="Sposta piano ▾" />
    {confirmPiano === piano.piano_id ? (
      <>
        <button onClick={() => onEliminaPiano(piano.piano_id)} disabled={busy} className="font-semibold text-[var(--danger)] disabled:opacity-50">Elimina piano</button>
        <button onClick={() => setConfirmPiano(null)} className="text-[var(--brand-text-muted)]">No</button>
      </>
    ) : (
      <button onClick={() => setConfirmPiano(piano.piano_id)} className="text-[var(--brand-text-muted)] hover:text-[var(--danger)]">🗑 Elimina</button>
    )}
  </span>
</div>
```

Corpo righe operatore: identico a `CardTerritorio.tsx:71-142` ma con `piano.operatori` e il blocco `↪`/select rimpiazzato da:

```tsx
<MenuSposta modo="operatore" territori={territori} territorioCorrente={r.territorio_override ?? null}
  onSpostaTerritorio={(t) => onSpostaTerritorioOperatore(r.id, t)}
  onSpostaData={(d) => onSpostaDataOperatore(r.id, d)} busy={busy} />
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ; `npx eslint components/modules/mappa/riepilogo/CardPianificazione.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/riepilogo/CardPianificazione.tsx
git commit -m "feat(riepilogo): CardPianificazione (una card per piano) con MenuSposta e Sposta piano"
```

---

### Task 8: Refactor `RiepilogoRapportini` (griglia + handler spostamento)

**Files:**
- Modify: `components/modules/mappa/RiepilogoRapportini.tsx`

**Interfaces:**
- Consumes: `groupByDayPiano` (Task 2), `IntestazioneGiorno` (Task 5), `CardPianificazione` (Task 7), `FiltriRiepilogo` (invariato), `filtraRapportini` (invariato).

Cambiamenti:
- Sostituisci `groupByDayTerritory` con `groupByDayPiano(filtraRapportini(raps, filtri), oggi)` dove `oggi = new Date().toISOString().slice(0,10)`.
- Render: per ogni `giorno` → `<IntestazioneGiorno giorno oggi />` + griglia `<div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>` con una `<CardPianificazione>` per `piano`.
- Aggiungi handler:
  - `onSpostaDataOperatore(rapportinoId, data)` → `PATCH /api/mappa/rapportini/data` `{ rapportinoId, data }`; su `409` mostra avviso conflitti; poi `carica()`.
  - `onSpostaPiano(pianoId, { data?, territorio? })` → `PATCH /api/mappa/piani/sposta`; su `409` avviso; poi `carica()`.
  - `onSpostaTerritorioOperatore(rapportinoId, territorio)` → invariato (`PATCH /api/mappa/rapportini/territorio`), già presente come `spostaOperatore`.
- Stato avviso conflitti: `const [avviso, setAvviso] = useState<string | null>(null)` + banner in cima (`bg-[var(--warning-soft)] text-[var(--warning)]`). Messaggio: `Spostamento bloccato: ${nomi} già presenti in quel territorio/giorno.`
- Avviso spostamento nel passato (opzionale, non bloccante): se la data scelta `< oggi`, prima della PATCH `window.confirm('Il link risulterà scaduto in quel giorno (riapribile con 🔒). Procedere?')`.
- Rimuovi gli stati ora inutili (`spostaOpen`, `confirm*` restano; `spostaOpen` non serve più perché gestito in `MenuSposta`).

- [ ] **Step 1: Applica il refactor** (helper `gestisciPatch` che fa fetch, gestisce `409` → `setAvviso`, e `carica()`):

```tsx
const gestisciSpostamento = async (url: string, body: object) => {
  setBusy(true); setAvviso(null);
  try {
    const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      const nomi = (j.conflicts ?? []).map((c: { staff_name: string | null }) => c.staff_name ?? 'operatore').join(', ');
      setAvviso(`Spostamento bloccato: ${nomi || 'operatore'} già presente in quel territorio/giorno.`);
      return;
    }
    await carica();
  } finally { setBusy(false); }
};
const onSpostaDataOperatore = (rapportinoId: string, data: string) => {
  const oggi = new Date().toISOString().slice(0, 10);
  if (data < oggi && !window.confirm('Il link risulterà scaduto in quel giorno (riapribile con 🔒). Procedere?')) return;
  gestisciSpostamento('/api/mappa/rapportini/data', { rapportinoId, data });
};
const onSpostaPiano = (pianoId: string, opts: { data?: string; territorio?: string | null }) => {
  const oggi = new Date().toISOString().slice(0, 10);
  if (opts.data && opts.data < oggi && !window.confirm('Il link risulterà scaduto in quel giorno (riapribile con 🔒). Procedere?')) return;
  gestisciSpostamento('/api/mappa/piani/sposta', { pianoId, ...opts });
};
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ; `npx eslint components/modules/mappa/RiepilogoRapportini.tsx`

- [ ] **Step 3: Build mirato**

Run: `npx next build` *(o, se troppo lento, `npx tsc --noEmit` è sufficiente come gate)*
Expected: nessun errore sui file del riepilogo.

- [ ] **Step 4: Commit**

```bash
git add components/modules/mappa/RiepilogoRapportini.tsx
git commit -m "feat(riepilogo): griglia card per giorno (oggi in cima) + handler sposta giorno/piano"
```

---

### Task 9: Cleanup `groupByDayTerritory` e `CardTerritorio`

**Files:**
- Delete: `utils/rapportini/groupByDayTerritory.ts`, `utils/rapportini/groupByDayTerritory.test.ts`
- Delete: `components/modules/mappa/riepilogo/CardTerritorio.tsx`

**Interfaces:** nessuna nuova; verifica che nessun import residuo li referenzi.

- [ ] **Step 1: Verifica assenza di riferimenti residui**

Run: `git grep -n "groupByDayTerritory\|CardTerritorio"` → atteso: nessun risultato in `app/`, `components/`, `utils/` (solo eventuali doc).

- [ ] **Step 2: Rimuovi i file**

```bash
git rm utils/rapportini/groupByDayTerritory.ts utils/rapportini/groupByDayTerritory.test.ts components/modules/mappa/riepilogo/CardTerritorio.tsx
```

- [ ] **Step 3: Verifica build/test della suite riepilogo**

Run: `npx tsc --noEmit`
Run: `npx vitest run utils/rapportini/giorniRiepilogo.test.ts utils/rapportini/groupByDayPiano.test.ts`
Expected: PASS; nessun errore di import.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(riepilogo): rimuove groupByDayTerritory e CardTerritorio (sostituiti)"
```

---

## Self-Review (eseguita)

**Spec coverage:**
- §3 card per pianificazione → Task 2, 7. Multi-piano due card → Task 2 (test) + 7.
- §3 ordine oggi in cima → Task 1, 2, render Task 8.
- §3 griglia auto-fit → Task 8.
- §5.1 sposta operatore di giorno → Task 3.
- §5.2 sposta piano giorno/territorio → Task 4.
- §5.3 conflitto duplicato operatore → Task 3, 4 (riuso `rilevaConflitti`).
- §7 avviso passato non bloccante → Task 8. Inviati restano inviati → nessun cambio `stato` negli endpoint (Task 3,4). Distribuzioni → Task 4.
- §4 componenti (Intestazione/MenuSposta/CardPianificazione) → Task 5,6,7. Riuso DatePicker → Task 6.
- §9 cleanup groupByDayTerritory/CardTerritorio → Task 9.

**Placeholder scan:** nessun TBD/TODO; codice reale in ogni step di logica; UI con snippet chiave + riferimenti precisi alle righe da preservare.

**Type consistency:** `RapRiepilogo`, `PianoCard`/`GiornoPiani`, `Conflitto`, `SpostamentoDataResult`/`SpostamentoPianoResult`, props `MenuSposta`/`CardPianificazione` coerenti tra i task. Endpoint: body `{ rapportinoId, data }` e `{ pianoId, data?, territorio? }` coerenti tra route e chiamanti (Task 8).

## Note di rischio
- Lo spostamento DB non è una transazione atomica (PostgREST): l'ordine di scrittura è prudente (header → rapportini → interventi → distribuzioni). Un fallimento intermedio è raro ma possibile; gli endpoint ritornano l'errore. Accettabile per un'azione amministrativa manuale.
- `mappa_distribuzioni` segue il modello esistente (azzera vecchia, upsert nuova) coerente con POST/DELETE piani.
