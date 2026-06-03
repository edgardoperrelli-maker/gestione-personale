# Fix Torre interventi + scorrimento giorno dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popolare la Torre di controllo creando sempre gli interventi del piano (al salvataggio e alla generazione rapportini), fare il backfill dei piani esistenti, sistemare il filtro operatori, e rendere la card "Stato rapportini" della dashboard navigabile per giorno.

**Architecture:** Logica core estratta in funzioni pure testabili (`planInterventi`, `filtraInterventi`, `addDaysIso`); un wrapper I/O `ensureInterventiForPiano(db, pianoId)` con client iniettato condiviso da due route API e da uno script di backfill; fix mirati sui due componenti React.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (`@supabase/supabase-js`), Vitest, esecuzione script via `tsx`.

**Convenzione commit:** ogni commit termina con la trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Branch:** `fix/torre-interventi-dashboard-giorno` (già creato; la spec è già committata qui).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-03-fix-torre-interventi-e-dashboard-giorno-design.md`

---

## File Structure

| File | Tipo | Responsabilità |
|---|---|---|
| `lib/interventi/planInterventiForPiano.ts` | nuovo | pianificazione pura: da piano+operatori+esistenti → righe da inserire/eliminare |
| `lib/interventi/planInterventiForPiano.test.ts` | nuovo | test del planner |
| `lib/interventi/ensureInterventiForPiano.ts` | nuovo | wrapper I/O (client iniettato): carica dati, chiama il planner, esegue delete+insert |
| `app/api/mappa/piani/interventi/route.ts` | modifica | delega all'helper |
| `app/api/mappa/rapportini/genera/route.ts` | modifica | chiama l'helper prima del linking voci |
| `scripts/backfill-interventi.ts` | nuovo | backfill piani esistenti (via tsx) |
| `lib/interventi/torreView.ts` | modifica | nuova `filtraInterventi` + sentinella |
| `lib/interventi/torreView.test.ts` | modifica | test di `filtraInterventi` |
| `components/modules/torre/TorreControlloClient.tsx` | modifica | usa `filtraInterventi`; fix selezione "Non assegnati" |
| `lib/dashboard/addDaysIso.ts` | nuovo | step ±1 giorno puro |
| `lib/dashboard/addDaysIso.test.ts` | nuovo | test di `addDaysIso` |
| `components/modules/dashboard/RapportiniKpi.tsx` | modifica | stepper giorno + fetch per giorno |

---

## Task 1: Planner puro `planInterventi`

**Files:**
- Create: `lib/interventi/planInterventiForPiano.ts`
- Test: `lib/interventi/planInterventiForPiano.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/interventi/planInterventiForPiano.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planInterventi } from './planInterventiForPiano';
import type { Task } from '@/utils/routing/types';

const task = (over: Partial<Task>): Task => ({
  id: 't', odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over,
});

describe('planInterventi', () => {
  const piano = { data: '2026-06-03' };
  const base = { piano, pianoId: 'p1', territorioId: null as string | null };

  it('mappa i task in interventi assegnati', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1', citta: 'Roma' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(1);
    expect(r.daInserire[0]).toMatchObject({
      odl: 'A1', staff_id: 's1', data: '2026-06-03', stato: 'assegnato', piano_id: 'p1', comune: 'Roma',
    });
    expect(r.idDaEliminare).toEqual([]);
  });

  it('elimina i non-terminali e preserva (non duplica) i terminali', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' }), task({ odl: 'CHIUSO' })] }],
      esistenti: [
        { id: 'e1', odl: 'A1', stato: 'assegnato' },
        { id: 'e2', odl: 'CHIUSO', stato: 'completato' },
      ],
    });
    expect(r.idDaEliminare).toEqual(['e1']);
    const odls = r.daInserire.map((x) => x.odl);
    expect(odls).toContain('A1');
    expect(odls).not.toContain('CHIUSO');
  });

  it('dedup interno per odl', () => {
    const r = planInterventi({
      ...base,
      operatori: [
        { staff_id: 's1', tasks: [task({ odl: 'DUP' })] },
        { staff_id: 's2', tasks: [task({ odl: 'DUP' })] },
      ],
      esistenti: [],
    });
    expect(r.daInserire.filter((x) => x.odl === 'DUP')).toHaveLength(1);
  });

  it('scarta odl già presenti su altri piani della stessa data', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'X9' })] }],
      esistenti: [],
      odlGiaPresenti: new Set(['X9']),
    });
    expect(r.daInserire).toHaveLength(0);
  });

  it('le righe senza odl non vengono deduplicate', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '' }), task({ odl: '' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: FAIL — "Failed to resolve import './planInterventiForPiano'" / `planInterventi is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/interventi/planInterventiForPiano.ts`:

```ts
// Pianificazione pura degli interventi di un piano (Mappa Operatori → tabella interventi).
// Nessun I/O. L'I/O sta in ensureInterventiForPiano.ts.
import { taskToIntervento, type InterventoDaMappa } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';

export type PianoMeta = { data: string };
export type OperatorePiano = { staff_id: string; tasks: Task[] | null };
export type InterventoEsistente = { id: string; odl: string | null; stato: string };

export type PianoPlanInput = {
  committente?: string;
  piano: PianoMeta;
  pianoId: string;
  operatori: OperatorePiano[];
  esistenti: InterventoEsistente[];
  territorioId: string | null;
  /** odl già presenti in `interventi` su ALTRI piani della stessa data (indice unico globale). */
  odlGiaPresenti?: Set<string>;
};

export type PianoPlan = {
  idDaEliminare: string[];
  daInserire: InterventoDaMappa[];
};

export function planInterventi(input: PianoPlanInput): PianoPlan {
  const committente = input.committente ?? 'acea';
  const isTerminale = (stato: string) => stato === 'completato' || stato === 'annullato';

  const odlTerminali = new Set(
    input.esistenti.filter((e) => isTerminale(e.stato)).map((e) => e.odl).filter((x): x is string => !!x),
  );
  const idDaEliminare = input.esistenti.filter((e) => !isTerminale(e.stato)).map((e) => e.id);

  const odlGiaPresenti = input.odlGiaPresenti ?? new Set<string>();
  const visti = new Set<string>();
  const daInserire: InterventoDaMappa[] = [];

  for (const op of input.operatori) {
    for (const t of op.tasks ?? []) {
      const rec = taskToIntervento(t, {
        committente,
        data: input.piano.data,
        staffId: op.staff_id,
        pianoId: input.pianoId,
        territorioId: input.territorioId,
      });
      if (rec.odl) {
        if (odlTerminali.has(rec.odl)) continue; // già chiuso → preserva, non duplicare
        if (odlGiaPresenti.has(rec.odl)) continue; // esiste su altro piano stessa data
        if (visti.has(rec.odl)) continue; // dedup interno al batch
        visti.add(rec.odl);
      }
      daInserire.push(rec);
    }
  }

  return { idDaEliminare, daInserire };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/planInterventiForPiano.ts lib/interventi/planInterventiForPiano.test.ts
git commit -m "feat(torre): planner puro planInterventi (preserva terminali, dedup odl)"
```

---

## Task 2: Wrapper I/O `ensureInterventiForPiano`

**Files:**
- Create: `lib/interventi/ensureInterventiForPiano.ts`

Nota: è glue I/O verso Supabase; la logica è già coperta dai test del planner (Task 1). La verifica funzionale avviene col backfill su DB reale (Task 5) e col check manuale della torre (Task 10).

- [ ] **Step 1: Write the implementation**

Create `lib/interventi/ensureInterventiForPiano.ts`:

```ts
// Garantisce che gli interventi del piano esistano e siano allineati ai task correnti.
// Riceve il client Supabase per dependency injection: NON importa server-only/supabaseAdmin,
// così è riusabile sia dalle route API sia dallo script di backfill (tsx).
import type { SupabaseClient } from '@supabase/supabase-js';
import { planInterventi, type OperatorePiano, type InterventoEsistente } from './planInterventiForPiano';

export type EnsureResult = { creati: number; preservati: number; scartati: number; error?: string };

export async function ensureInterventiForPiano(db: SupabaseClient, pianoId: string): Promise<EnsureResult> {
  const { data: pianoRow } = await db
    .from('mappa_piani')
    .select('id, data, territorio')
    .eq('id', pianoId)
    .maybeSingle();
  const piano = pianoRow as { id: string; data: string; territorio: string | null } | null;
  if (!piano) return { creati: 0, preservati: 0, scartati: 0, error: 'Piano non trovato.' };

  // territorio del piano (nome) → territory_id, per il filtro torre
  let territorioId: string | null = null;
  if (piano.territorio) {
    const { data: terr } = await db.from('territories').select('id').eq('name', piano.territorio).maybeSingle();
    territorioId = (terr as { id: string } | null)?.id ?? null;
  }

  const { data: opRows } = await db
    .from('mappa_piani_operatori')
    .select('staff_id, tasks')
    .eq('piano_id', pianoId);
  const operatori = (opRows ?? []) as OperatorePiano[];

  const { data: existing } = await db
    .from('interventi')
    .select('id, odl, stato')
    .eq('piano_id', pianoId)
    .eq('created_from_mappa', true);
  const esistenti = (existing ?? []) as InterventoEsistente[];

  // odl già presenti su ALTRI piani della stessa data (rispetta interventi_dedup_idx)
  const { data: altri } = await db
    .from('interventi')
    .select('odl')
    .eq('data', piano.data)
    .neq('piano_id', pianoId)
    .not('odl', 'is', null);
  const odlGiaPresenti = new Set(
    ((altri ?? []) as Array<{ odl: string | null }>).map((r) => r.odl).filter((x): x is string => !!x),
  );

  const { idDaEliminare, daInserire } = planInterventi({
    piano, pianoId, operatori, esistenti, territorioId, odlGiaPresenti,
  });

  const preservati = esistenti.length - idDaEliminare.length;
  const totTask = operatori.reduce((s, o) => s + (o.tasks ?? []).length, 0);
  const scartati = totTask - daInserire.length;

  if (idDaEliminare.length) {
    const { error } = await db.from('interventi').delete().in('id', idDaEliminare);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }
  if (daInserire.length) {
    const { error } = await db.from('interventi').insert(daInserire);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }
  return { creati: daInserire.length, preservati, scartati };
}
```

- [ ] **Step 2: Verify lint/typecheck**

Run: `npm run lint`
Expected: nessun errore nei file nuovi (`planInterventiForPiano.ts`, `ensureInterventiForPiano.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/interventi/ensureInterventiForPiano.ts
git commit -m "feat(torre): wrapper ensureInterventiForPiano (client iniettato, dedup cross-piano)"
```

---

## Task 3: Route `piani/interventi` usa l'helper

**Files:**
- Modify: `app/api/mappa/piani/interventi/route.ts` (sostituzione integrale del corpo)

- [ ] **Step 1: Replace the route**

Sostituisci l'INTERO contenuto di `app/api/mappa/piani/interventi/route.ts` con:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';

export const runtime = 'nodejs';

/**
 * POST /api/mappa/piani/interventi — crea/aggiorna i record `interventi` dal piano.
 * Body: { pianoId }. Idempotente: gli interventi terminali (completato/annullato) del
 * piano vengono preservati; gli altri (created_from_mappa) sono rigenerati dai task correnti.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { pianoId } = (await req.json().catch(() => ({}))) as { pianoId?: string };
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante.' }, { status: 400 });

  const res = await ensureInterventiForPiano(supabaseAdmin, pianoId);
  if (res.error) {
    const status = res.error === 'Piano non trovato.' ? 404 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ creati: res.creati, preservati: res.preservati, scartati: res.scartati });
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: nessun errore in `app/api/mappa/piani/interventi/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/mappa/piani/interventi/route.ts
git commit -m "refactor(torre): route piani/interventi delega a ensureInterventiForPiano"
```

---

## Task 4: `genera` rapportini garantisce gli interventi

**Files:**
- Modify: `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Add the import**

In `app/api/mappa/rapportini/genera/route.ts`, dopo la riga:

```ts
import { requireUser } from '@/lib/apiAuth';
```

aggiungi:

```ts
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
```

- [ ] **Step 2: Ensure interventi before linking voci**

Trova questo blocco (subito prima della costruzione di `intByKey`):

```ts
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
    const expires = scadenzaIso(piano.data);

    // Interventi del piano (creati al salvataggio distribuzione) per collegare ogni voce.
    const { data: intRows } = await supabaseAdmin
```

Sostituiscilo con (aggiunge la chiamata all'helper e una variabile `interventiWarning`):

```ts
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
    const expires = scadenzaIso(piano.data);

    // Unificazione: garantisci gli interventi del piano PRIMA di collegare le voci.
    // Best-effort: se fallisce, logga ma prosegui con la generazione rapportini.
    let interventiWarning: string | undefined;
    try {
      const ens = await ensureInterventiForPiano(supabaseAdmin, pianoId);
      if (ens.error) interventiWarning = ens.error;
    } catch (e: any) {
      interventiWarning = e?.message ?? 'errore ensure interventi';
    }
    if (interventiWarning) console.error('genera: ensureInterventiForPiano:', interventiWarning);

    // Interventi del piano per collegare ogni voce.
    const { data: intRows } = await supabaseAdmin
```

- [ ] **Step 3: Surface the warning in the response**

Trova la riga finale di successo:

```ts
    return NextResponse.json({ ok: true, rapportini: out });
```

Sostituiscila con:

```ts
    return NextResponse.json({ ok: true, rapportini: out, interventiWarning });
```

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: nessun errore in `app/api/mappa/rapportini/genera/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/mappa/rapportini/genera/route.ts
git commit -m "feat(torre): generare rapportini garantisce e allinea gli interventi del piano"
```

---

## Task 5: Script di backfill + esecuzione

**Files:**
- Create: `scripts/backfill-interventi.ts`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-interventi.ts`:

```ts
// Backfill interventi dei piani esistenti. READ+WRITE idempotente.
// Uso: npx tsx scripts/backfill-interventi.ts [fromDateYYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ensureInterventiForPiano } from '../lib/interventi/ensureInterventiForPiano';

function loadEnv() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* ignore */ }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Mancano env Supabase'); process.exit(1); }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const fromDate = process.argv[2] || new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
  const { data: piani } = await db
    .from('mappa_piani')
    .select('id, data, territorio')
    .gte('data', fromDate)
    .order('data', { ascending: true });

  console.log(`Piani con data >= ${fromDate}: ${piani?.length ?? 0}`);
  for (const p of (piani ?? []) as Array<{ id: string; data: string; territorio: string | null }>) {
    const r = await ensureInterventiForPiano(db, p.id);
    console.log(
      `piano ${p.id.slice(0, 8)} ${p.data} "${p.territorio}" -> creati=${r.creati} preservati=${r.preservati} scartati=${r.scartati}` +
        (r.error ? ` ERR=${r.error}` : ''),
    );
  }
  console.log('Backfill completato.');
}

main();
```

- [ ] **Step 2: Run the backfill**

Run: `npx tsx scripts/backfill-interventi.ts`
Expected: elenca i piani da oggi in poi con `creati=N` > 0 per i piani con task (es. piano ACEA `creati≈61`, piano PERUGIA `creati≈25`), `ERR` assente.

- [ ] **Step 3: Verify the output**

L'output dello Step 2 è la verifica: i piani con task mostrano `creati=N` con N > 0 e nessun `ERR`. La verifica end-to-end (la board che si popola) avviene al Task 10, Step 3. Se un piano mostra `creati=0` con task attesi, fermarsi e indagare (es. `ERR=` per conflitto dedup) prima di proseguire.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-interventi.ts
git commit -m "feat(torre): script di backfill interventi per i piani esistenti"
```

---

## Task 6: Filtro puro `filtraInterventi`

**Files:**
- Modify: `lib/interventi/torreView.ts`
- Test: `lib/interventi/torreView.test.ts`

- [ ] **Step 1: Write the failing test**

In `lib/interventi/torreView.test.ts`, modifica la prima riga di import da:

```ts
import { coloreStato, raggruppaPerOperatore } from './torreView';
```

a:

```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, SENTINELLA_NON_ASSEGNATI } from './torreView';
```

Poi aggiungi in fondo al file:

```ts
describe('filtraInterventi', () => {
  const items = [
    { id: 'a', staff_id: 's1', territorio_id: 't1' },
    { id: 'b', staff_id: 's2', territorio_id: 't1' },
    { id: 'c', staff_id: null, territorio_id: 't2' },
  ];

  it('nessun filtro → tutti', () => {
    expect(filtraInterventi(items, null, null)).toHaveLength(3);
  });
  it('filtro territorio', () => {
    expect(filtraInterventi(items, 't1', null).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('filtro operatore', () => {
    expect(filtraInterventi(items, null, 's1').map((i) => i.id)).toEqual(['a']);
  });
  it('filtro "non assegnati" via sentinella', () => {
    expect(filtraInterventi(items, null, SENTINELLA_NON_ASSEGNATI).map((i) => i.id)).toEqual(['c']);
  });
  it('combina territorio + operatore', () => {
    expect(filtraInterventi(items, 't1', 's2').map((i) => i.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: FAIL — `filtraInterventi is not a function` / export mancante.

- [ ] **Step 3: Add the implementation**

In fondo a `lib/interventi/torreView.ts` aggiungi:

```ts
/** Valore di selezione per il gruppo "Non assegnati" (distinto da null = nessuna selezione). */
export const SENTINELLA_NON_ASSEGNATI = '__na__';

/**
 * Applica i filtri della torre: territorio e operatore.
 * - selTerr: id territorio o null (nessun filtro territorio)
 * - selStaff: id operatore, oppure SENTINELLA_NON_ASSEGNATI per i non assegnati, oppure null
 */
export function filtraInterventi<T extends { staff_id: string | null; territorio_id: string | null }>(
  items: T[],
  selTerr: string | null,
  selStaff: string | null,
): T[] {
  let out = selTerr ? items.filter((i) => i.territorio_id === selTerr) : items;
  if (selStaff === SENTINELLA_NON_ASSEGNATI) out = out.filter((i) => i.staff_id == null);
  else if (selStaff) out = out.filter((i) => i.staff_id === selStaff);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: PASS (test esistenti + 5 nuovi di `filtraInterventi`).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/torreView.ts lib/interventi/torreView.test.ts
git commit -m "feat(torre): filtraInterventi puro + sentinella non assegnati"
```

---

## Task 7: Applica il filtro nel `TorreControlloClient`

**Files:**
- Modify: `components/modules/torre/TorreControlloClient.tsx`

- [ ] **Step 1: Update the import**

Trova:

```ts
import { coloreStato, raggruppaPerOperatore, type TonoTorre } from '@/lib/interventi/torreView';
```

Sostituisci con:

```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
```

- [ ] **Step 2: Replace the filtering lines**

Trova:

```ts
  const itemsTerr = selTerr ? items.filter((i) => i.territorio_id === selTerr) : items;
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
```

Sostituisci con:

```ts
  const itemsTerr = filtraInterventi(items, selTerr, null);
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
```

- [ ] **Step 3: Replace map filter + selected name**

Trova:

```ts
  // La mappa mostra gli interventi dell'operatore selezionato (filtro), o tutti.
  const itemsMappa = selStaff ? itemsTerr.filter((i) => i.staff_id === selStaff) : itemsTerr;
  const nomeSel = selStaff ? gruppi.find((g) => g.operatore.id === selStaff)?.operatore.display_name : null;
```

Sostituisci con:

```ts
  // La mappa mostra gli interventi dell'operatore selezionato (filtro), o tutti.
  const itemsMappa = filtraInterventi(items, selTerr, selStaff);
  const nomeSel = selStaff
    ? gruppi.find((g) => (g.operatore.id ?? SENTINELLA_NON_ASSEGNATI) === selStaff)?.operatore.display_name
    : null;
```

- [ ] **Step 4: Fix the selection toggle + highlight**

Trova:

```ts
          {gruppi.map((g) => {
            const sel = selStaff === g.operatore.id;
            return (
              <button
                key={g.operatore.id ?? 'na'}
                type="button"
                onClick={() => setSelStaff((p) => (p === g.operatore.id ? null : g.operatore.id))}
```

Sostituisci con:

```ts
          {gruppi.map((g) => {
            const opKey = g.operatore.id ?? SENTINELLA_NON_ASSEGNATI;
            const sel = selStaff === opKey;
            return (
              <button
                key={opKey}
                type="button"
                onClick={() => setSelStaff((p) => (p === opKey ? null : opKey))}
```

- [ ] **Step 5: Verify lint**

Run: `npm run lint`
Expected: nessun errore in `components/modules/torre/TorreControlloClient.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/modules/torre/TorreControlloClient.tsx
git commit -m "fix(torre): filtro operatori usa filtraInterventi + sentinella (no highlight fantasma)"
```

---

## Task 8: Helper puro `addDaysIso`

**Files:**
- Create: `lib/dashboard/addDaysIso.ts`
- Test: `lib/dashboard/addDaysIso.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/addDaysIso.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDaysIso } from './addDaysIso';

describe('addDaysIso', () => {
  it('+1 giorno', () => expect(addDaysIso('2026-06-03', 1)).toBe('2026-06-04'));
  it('-1 giorno', () => expect(addDaysIso('2026-06-03', -1)).toBe('2026-06-02'));
  it('cambio mese', () => expect(addDaysIso('2026-06-30', 1)).toBe('2026-07-01'));
  it('cambio anno', () => expect(addDaysIso('2025-12-31', 1)).toBe('2026-01-01'));
  it('anno bisestile', () => expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/addDaysIso.test.ts`
Expected: FAIL — import non risolto / `addDaysIso is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/dashboard/addDaysIso.ts`:

```ts
/** Aggiunge n giorni a una data ISO (YYYY-MM-DD) usando UTC, senza derive di fuso/DST. */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dashboard/addDaysIso.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/addDaysIso.ts lib/dashboard/addDaysIso.test.ts
git commit -m "feat(dashboard): helper puro addDaysIso"
```

---

## Task 9: Stepper giorno nella card `RapportiniKpi`

**Files:**
- Modify: `components/modules/dashboard/RapportiniKpi.tsx` (sostituzione integrale)

- [ ] **Step 1: Replace the component**

Sostituisci l'INTERO contenuto di `components/modules/dashboard/RapportiniKpi.tsx` con:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { aggregateRapportiniKpi, type RapportiniKpi, type RapportinoKpiRow } from '@/lib/dashboard/rapportiniKpi';
import { addDaysIso } from '@/lib/dashboard/addDaysIso';

function todayRomeIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function formatGiorno(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

type Tile = { label: string; value: number; className: string };

export default function RapportiniKpi() {
  const [giorno, setGiorno] = useState<string>(todayRomeIso());
  const [kpi, setKpi] = useState<RapportiniKpi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${giorno}&to=${giorno}`);
        const data = await res.json();
        const rows = (Array.isArray(data) ? data : []) as RapportinoKpiRow[];
        if (active) setKpi(aggregateRapportiniKpi(rows, todayRomeIso()));
      } catch {
        if (active) setKpi({ total: 0, inviato: 0, valido: 0, scaduto: 0, nonConsegnati: 0 });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [giorno]);

  const tiles: Tile[] = kpi
    ? [
        { label: 'Inviati', value: kpi.inviato, className: 'bg-[var(--success-soft)] text-[var(--success)]' },
        { label: 'In corso', value: kpi.valido, className: 'bg-[var(--warning-soft)] text-[var(--warning)]' },
        { label: 'Scaduti', value: kpi.scaduto, className: 'bg-[var(--danger-soft)] text-[var(--danger)]' },
        { label: 'Non consegnati', value: kpi.nonConsegnati, className: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' },
      ]
    : [];

  const isOggi = giorno === todayRomeIso();

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Stato rapportini</h2>
        <Link
          href="/hub/mappa?vista=riepilogo"
          className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
        >
          Riepilogo completo →
        </Link>
      </div>

      {/* Navigatore giorno */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setGiorno((g) => addDaysIso(g, -1))}
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
          aria-label="Giorno precedente"
        >
          ◀
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize text-[var(--brand-text-main)]">{formatGiorno(giorno)}</span>
          {!isOggi && (
            <button
              type="button"
              onClick={() => setGiorno(todayRomeIso())}
              className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]"
            >
              Oggi
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setGiorno((g) => addDaysIso(g, 1))}
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
          aria-label="Giorno successivo"
        >
          ▶
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Caricamento…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl px-3 py-3 ${t.className}`}>
                <p className="text-2xl font-bold tabular-nums">{t.value}</p>
                <p className="text-xs font-medium opacity-90">{t.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs capitalize text-[var(--brand-text-muted)]">
            {kpi?.total ?? 0} rapportini per {formatGiorno(giorno)}.
            {kpi && kpi.nonConsegnati > 0 && (
              <span className="font-semibold text-[var(--brand-primary)]"> {kpi.nonConsegnati} da sollecitare.</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: nessun errore in `components/modules/dashboard/RapportiniKpi.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/dashboard/RapportiniKpi.tsx
git commit -m "feat(dashboard): card Stato rapportini navigabile per giorno"
```

---

## Task 10: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: tutti i test verdi, inclusi `planInterventiForPiano`, `torreView` (con `filtraInterventi`), `addDaysIso`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Manual check — Torre**

Avvia: `npm run dev`. Apri `/hub/torre`.
Expected:
- la board mostra gli operatori del piano di oggi con i conteggi (es. ACEA: 4 operatori con interventi);
- l'intestazione mostra "N interventi" con N > 0;
- cliccando un operatore, la mappa si filtra sui suoi interventi e la card si evidenzia; nessuna card risulta evidenziata di default;
- selezionando un territorio, board e mappa si filtrano di conseguenza.

- [ ] **Step 4: Manual check — Dashboard**

Apri `/hub`.
Expected:
- la card "Stato rapportini" mostra ◀ data ▶;
- ◀/▶ cambiano giorno e i 4 tile + la didascalia si aggiornano sul giorno selezionato;
- spostandosi da oggi compare il pulsante "Oggi" che riporta alla data odierna.

- [ ] **Step 5: Final commit (se restano modifiche non committate)**

```bash
git status
git add -A
git commit -m "chore(torre): verifica finale fix torre + dashboard giorno"
```

---

## Note di esecuzione

- I test pure-function (Task 1, 6, 8) seguono TDD stretto: il test fallisce prima dell'implementazione.
- Wrapper I/O e route (Task 2-4) sono verificati dal backfill su DB reale (Task 5) e dal check manuale (Task 10): è il modo più affidabile di provare l'I/O Supabase senza mock fragili.
- Lo script di backfill (Task 5) gira con `tsx`: gli import di tipo `@/...` (solo-tipo) vengono rimossi a runtime, gli import di valore sono relativi → nessuna configurazione di alias necessaria.
- Nessuna migration: la colonna `created_from_mappa` esiste già nel DB (verificato).
