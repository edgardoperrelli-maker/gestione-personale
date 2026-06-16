# Modulo "Agente" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un modulo admin `/hub/agente` che imposta giorni/ora/dryRun/on-off dell'agente limitazioni massive e ne mostra stato e feedback; l'agente diventa un "operaio" che a ogni tick chiede all'app cosa fare.

**Architecture:** App = cervello (decide in fuso Europe/Rome, un giro/giorno via "rivendicazione"), agente = operaio (tick orario → esegue se l'app dice sì → invia report). Config e storico in 2 tabelle Supabase; endpoint agente protetti dalla chiave condivisa `LIM_MASSIVE_EXPORT_KEY`; modulo admin con auth di sessione.

**Tech Stack:** Next.js 15 (route `nodejs`, server/client components), Supabase (`supabaseAdmin` + session client), TypeScript, Vitest. Agente: Node ESM `.mjs` + `exceljs`. Spec: `docs/superpowers/specs/2026-06-16-modulo-agente-design.md`.

**Baseline rossa (memoria):** `npm run lint` e `npx vitest run` interi sono già rossi. Gate **mirati**: `npx vitest run <file del WP>` verde; `npx tsc --noEmit` senza NUOVI errori sui file toccati; `npx eslint <file>` pulito sui nuovi.

**Convenzioni:** `giorni` ISO 1=Lun…7=Dom. `ora`/`oraCorrente` = "HH:MM" zero-padded (confronto stringa valido). Fuso **Europe/Rome** ovunque per le decisioni.

---

## File Structure

**App — logica pura (testabile):**
- Create `lib/agente/orarioRoma.ts` (+`.test.ts`) — `partiRoma(now)`.
- Create `lib/agente/decisione.ts` (+`.test.ts`) — `decideEsecuzione`, `riassumiReport`, `statoAgente`, `validaConfig`, tipi.

**App — auth/endpoint/DB:**
- Create `lib/apiExportKey.ts` — `chiaveValida(req)` (estratto dall'export route, riusato da 3 route).
- Modify `app/api/export/limitazioni-massive/route.ts` — usa `chiaveValida` importata.
- Create `supabase/migrations/20260616160000_agente.sql` — `agente_config` (singleton) + `agente_run`.
- Create `app/api/agente/tick/route.ts`, `app/api/agente/report/route.ts`, `app/api/admin/agente/config/route.ts`.

**App — modulo:**
- Modify `lib/moduleAccess.ts` — chiave `'agente'` + voce `APP_MODULES`.
- Modify `components/layout/moduleIcons.tsx` — icona `agente` (il Record è esaustivo → obbligatorio).
- Create `app/hub/agente/page.tsx` (server) + `components/modules/agente/AgenteClient.tsx` (client).

**Agente (`tools/limitazioni-sync`):**
- Create `lib/dataCella.mjs` (+`.test.ts`) — `giornoDa`, `aDataExcel`, `decidiScritturaData`.
- Modify `agente.mjs` — colonna data usa `decidiScritturaData`; `main()` tick-gated + report.
- Create `lib/apiAgente.mjs` (+`.test.ts`) — `tick`, `inviaReport`.

**Deploy/ops:** migration + Task Scheduler ogni ora + abilitazione modulo + smoke (Task finale, manuale).

---

## PART A — Logica pura (app)

### Task 1: `partiRoma` (scompone l'ora in fuso Europe/Rome)

**Files:**
- Create: `lib/agente/orarioRoma.ts`
- Test: `lib/agente/orarioRoma.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/agente/orarioRoma.test.ts
import { describe, it, expect } from 'vitest';
import { partiRoma } from './orarioRoma';

describe('partiRoma', () => {
  it('converte un istante UTC nel fuso Europe/Rome (estate, UTC+2)', () => {
    // 2026-06-16 19:30 UTC = 21:30 a Roma; 16 giugno 2026 è un martedì (ISO 2)
    expect(partiRoma(new Date('2026-06-16T19:30:00Z'))).toEqual({
      oggi: '2026-06-16', oraCorrente: '21:30', weekday: 2,
    });
  });
  it('gestisce il cambio di data per fuso (23:30 UTC → giorno dopo a Roma)', () => {
    // 2026-06-16 23:30 UTC = 2026-06-17 01:30 a Roma (mercoledì, ISO 3)
    expect(partiRoma(new Date('2026-06-16T23:30:00Z'))).toEqual({
      oggi: '2026-06-17', oraCorrente: '01:30', weekday: 3,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/orarioRoma.test.ts`
Expected: FAIL — impossibile risolvere `./orarioRoma`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/agente/orarioRoma.ts
export type PartiRoma = { oggi: string; oraCorrente: string; weekday: number };

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Scompone `now` nel fuso Europe/Rome: oggi (YYYY-MM-DD), oraCorrente (HH:MM), weekday ISO 1..7. */
export function partiRoma(now: Date): PartiRoma {
  const s = now.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }); // "YYYY-MM-DD HH:MM:SS"
  const wdShort = now.toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' });
  return { oggi: s.slice(0, 10), oraCorrente: s.slice(11, 16), weekday: WD[wdShort] ?? 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/orarioRoma.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agente/orarioRoma.ts lib/agente/orarioRoma.test.ts
git commit -m "feat(agente): partiRoma (scomposizione ora in Europe/Rome)"
```

---

### Task 2: `decideEsecuzione` (il cervello: esegui ora sì/no)

**Files:**
- Create: `lib/agente/decisione.ts`
- Test: `lib/agente/decisione.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/agente/decisione.test.ts
import { describe, it, expect } from 'vitest';
import { decideEsecuzione } from './decisione';

const base = {
  enabled: true, giorni: [1, 2, 3, 4, 5], ora: '21:00',
  weekday: 2, oraCorrente: '21:30', oggi: '2026-06-16', ultimaRivendicazione: null as string | null,
};

describe('decideEsecuzione', () => {
  it('true quando tutte le condizioni sono soddisfatte', () => {
    expect(decideEsecuzione(base)).toBe(true);
  });
  it('false se spento', () => {
    expect(decideEsecuzione({ ...base, enabled: false })).toBe(false);
  });
  it('false se oggi non è un giorno di lavoro', () => {
    expect(decideEsecuzione({ ...base, weekday: 6 })).toBe(false);
  });
  it("false se non è ancora l'ora", () => {
    expect(decideEsecuzione({ ...base, oraCorrente: '20:59' })).toBe(false);
  });
  it('false se già rivendicato oggi (un giro al giorno)', () => {
    expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-16' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: FAIL — impossibile risolvere `./decisione`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/agente/decisione.ts
/** Decide se l'agente deve eseguire ORA. Tutto già in fuso Europe/Rome. */
export function decideEsecuzione(input: {
  enabled: boolean;
  giorni: number[];
  ora: string;
  weekday: number;
  oraCorrente: string;
  oggi: string;
  ultimaRivendicazione: string | null;
}): boolean {
  if (!input.enabled) return false;
  if (!input.giorni.includes(input.weekday)) return false;
  if (input.oraCorrente < input.ora) return false; // "HH:MM" zero-padded → confronto stringa ok
  if (input.ultimaRivendicazione === input.oggi) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agente/decisione.ts lib/agente/decisione.test.ts
git commit -m "feat(agente): decideEsecuzione (gate giorni/ora/rivendicazione)"
```

---

### Task 3: `riassumiReport` (conteggi dal report dell'agente)

**Files:**
- Modify: `lib/agente/decisione.ts`
- Test: `lib/agente/decisione.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append in decisione.test.ts
import { riassumiReport } from './decisione';

describe('riassumiReport', () => {
  it('somma aggiornate/extra/conflitti dai file e conta i non collocati', () => {
    const report = {
      lavori: 658,
      file: [
        { aggiornate: 3, extraAggiunte: 1, conflitti: [{}, {}] },
        { aggiornate: 0, extraAggiunte: 0, conflitti: [] },
      ],
      extraNonCollocate: [{}, {}, {}],
    };
    expect(riassumiReport(report)).toEqual({
      lavori: 658, aggiornate: 3, extra: 1, conflitti: 2, nonCollocate: 3,
    });
  });
  it('usa aggiornate+extra come lavori se il campo lavori manca', () => {
    expect(riassumiReport({ file: [{ aggiornate: 2, extraAggiunte: 1, conflitti: [] }] }))
      .toEqual({ lavori: 3, aggiornate: 2, extra: 1, conflitti: 0, nonCollocate: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: FAIL — `riassumiReport is not a function`.

- [ ] **Step 3: Add the implementation**

```ts
// append in decisione.ts
export type ReportAgente = {
  lavori?: number;
  dryRun?: boolean;
  file?: Array<{ aggiornate?: number; extraAggiunte?: number; conflitti?: unknown[] }>;
  extraNonCollocate?: unknown[];
  erroreGlobale?: string;
};

export type RiassuntoRun = {
  lavori: number; aggiornate: number; extra: number; conflitti: number; nonCollocate: number;
};

export function riassumiReport(r: ReportAgente): RiassuntoRun {
  const file = Array.isArray(r.file) ? r.file : [];
  const aggiornate = file.reduce((s, f) => s + (f.aggiornate ?? 0), 0);
  const extra = file.reduce((s, f) => s + (f.extraAggiunte ?? 0), 0);
  const conflitti = file.reduce((s, f) => s + (Array.isArray(f.conflitti) ? f.conflitti.length : 0), 0);
  const nonCollocate = Array.isArray(r.extraNonCollocate) ? r.extraNonCollocate.length : 0;
  const lavori = typeof r.lavori === 'number' ? r.lavori : aggiornate + extra;
  return { lavori, aggiornate, extra, conflitti, nonCollocate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agente/decisione.ts lib/agente/decisione.test.ts
git commit -m "feat(agente): riassumiReport (conteggi per agente_run)"
```

---

### Task 4: `statoAgente` (online + allerta) e `validaConfig`

**Files:**
- Modify: `lib/agente/decisione.ts`
- Test: `lib/agente/decisione.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append in decisione.test.ts
import { statoAgente, validaConfig } from './decisione';

describe('statoAgente', () => {
  const base = {
    minutiDaContatto: 8, enabled: true, giorni: [1, 2, 3, 4, 5],
    ora: '21:00', oraCorrente: '23:30', weekday: 2, ultimoGiroOggi: true,
  };
  it('online se contatto recente, nessuna allerta se giro fatto oggi', () => {
    expect(statoAgente(base)).toEqual({ online: true, allerta: null });
  });
  it('offline se contatto vecchio o assente', () => {
    expect(statoAgente({ ...base, minutiDaContatto: 200 }).online).toBe(false);
    expect(statoAgente({ ...base, minutiDaContatto: null }).online).toBe(false);
  });
  it('allerta se giorno lavorativo, passata ora+grazia, nessun giro oggi', () => {
    const r = statoAgente({ ...base, ultimoGiroOggi: false });
    expect(r.allerta).toMatch(/Nessun giro/);
  });
  it('niente allerta prima dell ora+grazia', () => {
    expect(statoAgente({ ...base, oraCorrente: '21:30', ultimoGiroOggi: false }).allerta).toBeNull();
  });
});

describe('validaConfig', () => {
  it('accetta una config valida e normalizza i giorni', () => {
    const r = validaConfig({ enabled: true, giorni: [5, 1, 2], ora: '21:00', dry_run: false, finestra_giorni: 15 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.giorni).toEqual([1, 2, 5]);
  });
  it('rifiuta ora malformata', () => {
    const r = validaConfig({ enabled: true, giorni: [1], ora: '9:7', dry_run: false, finestra_giorni: 15 });
    expect(r.ok).toBe(false);
  });
  it('rifiuta giorni fuori 1..7 e finestra fuori 1..60', () => {
    expect(validaConfig({ enabled: true, giorni: [0], ora: '21:00', dry_run: false, finestra_giorni: 15 }).ok).toBe(false);
    expect(validaConfig({ enabled: true, giorni: [1], ora: '21:00', dry_run: false, finestra_giorni: 0 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: FAIL — `statoAgente is not a function`.

- [ ] **Step 3: Add the implementation**

```ts
// append in decisione.ts
function minutiHHMM(s: string): number {
  const [h, m] = String(s).split(':').map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

export function statoAgente(input: {
  minutiDaContatto: number | null;
  enabled: boolean; giorni: number[]; ora: string; oraCorrente: string; weekday: number;
  ultimoGiroOggi: boolean;
  onlineMin?: number; graziaMin?: number;
}): { online: boolean; allerta: string | null } {
  const onlineMin = input.onlineMin ?? 90;
  const graziaMin = input.graziaMin ?? 120;
  const online = input.minutiDaContatto != null && input.minutiDaContatto <= onlineMin;
  const giornoLavorativo = input.enabled && input.giorni.includes(input.weekday);
  const oltre = minutiHHMM(input.oraCorrente) - minutiHHMM(input.ora) >= graziaMin;
  const allerta =
    giornoLavorativo && oltre && !input.ultimoGiroOggi
      ? `Nessun giro registrato oggi dopo le ${input.ora}.`
      : null;
  return { online, allerta };
}

export type ConfigInput = {
  enabled: boolean; giorni: number[]; ora: string; dry_run: boolean; finestra_giorni: number;
};

export function validaConfig(input: unknown):
  | { ok: true; value: ConfigInput }
  | { ok: false; errore: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.enabled !== 'boolean') return { ok: false, errore: 'enabled non valido' };
  if (typeof o.dry_run !== 'boolean') return { ok: false, errore: 'dry_run non valido' };
  if (!Array.isArray(o.giorni) || o.giorni.some((g) => !Number.isInteger(g) || (g as number) < 1 || (g as number) > 7)) {
    return { ok: false, errore: 'giorni deve contenere interi 1..7' };
  }
  if (typeof o.ora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.ora)) {
    return { ok: false, errore: 'ora deve essere "HH:MM"' };
  }
  const fin = o.finestra_giorni;
  if (!Number.isInteger(fin) || (fin as number) < 1 || (fin as number) > 60) {
    return { ok: false, errore: 'finestra_giorni deve essere 1..60' };
  }
  const giorni = Array.from(new Set(o.giorni as number[])).sort((a, b) => a - b);
  return { ok: true, value: { enabled: o.enabled, giorni, ora: o.ora, dry_run: o.dry_run, finestra_giorni: fin as number } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: PASS (tutte le describe).

- [ ] **Step 5: Lint mirato + commit**

Run: `npx eslint lib/agente/decisione.ts lib/agente/orarioRoma.ts`
Expected: pulito.

```bash
git add lib/agente/decisione.ts lib/agente/decisione.test.ts
git commit -m "feat(agente): statoAgente + validaConfig"
```

---

## PART B — Auth, DB, endpoint

### Task 5: estrai `chiaveValida` in `lib/apiExportKey.ts`

**Files:**
- Create: `lib/apiExportKey.ts`
- Modify: `app/api/export/limitazioni-massive/route.ts`

- [ ] **Step 1: Crea l'helper**

```ts
// lib/apiExportKey.ts
import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** Verifica l'header `x-export-key` contro `LIM_MASSIVE_EXPORT_KEY` (confronto a tempo costante, byte-safe). */
export function chiaveValida(req: Request): boolean {
  const atteso = process.env.LIM_MASSIVE_EXPORT_KEY ?? '';
  const fornito = req.headers.get('x-export-key') ?? '';
  if (!atteso) return false;
  const a = Buffer.from(atteso);
  const f = Buffer.from(fornito);
  if (f.length !== a.length) return false;
  try {
    return timingSafeEqual(f, a);
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Usa l'helper nell'export route**

In `app/api/export/limitazioni-massive/route.ts`: rimuovi la funzione locale `chiaveValida` e l'import di `timingSafeEqual`, e aggiungi in cima:
```ts
import { chiaveValida } from '@/lib/apiExportKey';
```
La chiamata `if (!chiaveValida(req)) { ... }` resta identica.

- [ ] **Step 3: Type-check + test esistenti**

Run: `npx tsc --noEmit` → nessun NUOVO errore su quei file.
Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts` → PASS (8).
Run: `npx eslint lib/apiExportKey.ts app/api/export/limitazioni-massive/route.ts` → pulito.

- [ ] **Step 4: Commit**

```bash
git add lib/apiExportKey.ts app/api/export/limitazioni-massive/route.ts
git commit -m "refactor(api): estrai chiaveValida in lib/apiExportKey (riuso per agente)"
```

---

### Task 6: Migration `agente_config` + `agente_run`

**Files:**
- Create: `supabase/migrations/20260616160000_agente.sql`

> DDL: la lancia l'utente su prod (il MCP non scrive). Questo file è la fonte di verità.

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/20260616160000_agente.sql
-- Modulo Agente: configurazione (singleton) + storico giri.
create table if not exists agente_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  giorni smallint[] not null default '{1,2,3,4,5}',   -- ISO 1=Lun … 7=Dom
  ora text not null default '21:00',                   -- "HH:MM" Europe/Rome
  dry_run boolean not null default true,
  finestra_giorni smallint not null default 15,
  ultimo_giro_il timestamptz,
  ultimo_contatto_il timestamptz,
  ultima_rivendicazione_giorno date,
  updated_at timestamptz not null default now()
);
insert into agente_config (id) values (1) on conflict (id) do nothing;

create table if not exists agente_run (
  id uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  dry_run boolean not null default false,
  lavori int not null default 0,
  aggiornate int not null default 0,
  extra int not null default 0,
  conflitti int not null default 0,
  non_collocate int not null default 0,
  errore text,
  dettaglio jsonb
);
create index if not exists agente_run_creato_idx on agente_run (creato_il desc);

alter table agente_config enable row level security;
alter table agente_run enable row level security;
drop policy if exists agente_config_all_auth on agente_config;
create policy agente_config_all_auth on agente_config for all to authenticated using (true) with check (true);
drop policy if exists agente_run_all_auth on agente_run;
create policy agente_run_all_auth on agente_run for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Commit** (l'esecuzione su prod è un passo manuale del Task finale)

```bash
git add supabase/migrations/20260616160000_agente.sql
git commit -m "feat(agente): migration agente_config + agente_run"
```

---

### Task 7: `POST /api/agente/tick`

**Files:**
- Create: `app/api/agente/tick/route.ts`
- Riferimento: `lib/supabaseAdmin`, `lib/agente/orarioRoma`, `lib/agente/decisione`, `lib/apiExportKey`.

> Verifica via curl (Step 3); la logica è già testata in Task 1–2.

- [ ] **Step 1: Implementa la route**

```ts
// app/api/agente/tick/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { decideEsecuzione } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  try {
    const { data: cfg, error } = await supabaseAdmin
      .from('agente_config')
      .select('enabled, giorni, ora, dry_run, finestra_giorni, ultima_rivendicazione_giorno')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!cfg) return NextResponse.json({ error: 'Config assente.' }, { status: 500 });

    const now = new Date();
    const parti = partiRoma(now);
    const eseguiOra = decideEsecuzione({
      enabled: cfg.enabled,
      giorni: (cfg.giorni ?? []) as number[],
      ora: cfg.ora,
      weekday: parti.weekday,
      oraCorrente: parti.oraCorrente,
      oggi: parti.oggi,
      ultimaRivendicazione: cfg.ultima_rivendicazione_giorno,
    });

    const patch: Record<string, unknown> = { ultimo_contatto_il: now.toISOString(), updated_at: now.toISOString() };
    if (eseguiOra) patch.ultima_rivendicazione_giorno = parti.oggi;
    await supabaseAdmin.from('agente_config').update(patch).eq('id', 1);

    return NextResponse.json(
      { eseguiOra, dryRun: cfg.dry_run, finestraGiorni: cfg.finestra_giorni },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore tick.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → nessun nuovo errore sul file.
Run: `npx eslint app/api/agente/tick/route.ts` → pulito.

- [ ] **Step 3: Verifica manuale (dopo aver lanciato la migration in locale o su un branch Supabase)**

Run (atteso 401 senza chiave): `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/agente/tick` → `401`.
Run (con chiave): `curl -s -X POST -H "x-export-key: <LIM_MASSIVE_EXPORT_KEY>" http://localhost:3000/api/agente/tick` → JSON `{ "eseguiOra": ..., "dryRun": ..., "finestraGiorni": 15 }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/agente/tick/route.ts
git commit -m "feat(agente): POST /api/agente/tick (heartbeat + decisione)"
```

---

### Task 8: `POST /api/agente/report`

**Files:**
- Create: `app/api/agente/report/route.ts`

- [ ] **Step 1: Implementa la route**

```ts
// app/api/agente/report/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { riassumiReport, type ReportAgente } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  try {
    const body = (await req.json()) as ReportAgente;
    const r = riassumiReport(body);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('agente_run').insert({
      dry_run: Boolean(body?.dryRun),
      lavori: r.lavori,
      aggiornate: r.aggiornate,
      extra: r.extra,
      conflitti: r.conflitti,
      non_collocate: r.nonCollocate,
      errore: typeof body?.erroreGlobale === 'string' ? body.erroreGlobale : null,
      dettaglio: body,
    });
    if (error) throw error;
    await supabaseAdmin.from('agente_config').update({ ultimo_giro_il: now, updated_at: now }).eq('id', 1);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore report.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` → nessun nuovo errore.
Run: `npx eslint app/api/agente/report/route.ts` → pulito.

- [ ] **Step 3: Commit**

```bash
git add app/api/agente/report/route.ts
git commit -m "feat(agente): POST /api/agente/report (salva agente_run)"
```

---

### Task 9: `PUT /api/admin/agente/config`

**Files:**
- Create: `app/api/admin/agente/config/route.ts`
- Riferimento: `lib/apiAuth` (`requireAdmin`), `lib/agente/decisione` (`validaConfig`).

- [ ] **Step 1: Implementa la route**

```ts
// app/api/admin/agente/config/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { validaConfig } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const parsed = validaConfig(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.errore }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: parsed.value });
}
```

- [ ] **Step 2: Type-check + lint + commit**

Run: `npx tsc --noEmit` → nessun nuovo errore. Run: `npx eslint app/api/admin/agente/config/route.ts` → pulito.

```bash
git add app/api/admin/agente/config/route.ts
git commit -m "feat(agente): PUT /api/admin/agente/config (requireAdmin + validaConfig)"
```

---

## PART C — Modulo `/hub/agente`

### Task 10: registra il modulo in `moduleAccess` + icona

**Files:**
- Modify: `lib/moduleAccess.ts`
- Modify: `components/layout/moduleIcons.tsx`

- [ ] **Step 1: Aggiungi la chiave e la voce modulo**

In `lib/moduleAccess.ts`, aggiungi `'agente'` all'union `AppModuleKey` (dopo `'misuratori'`):
```ts
  | 'misuratori'
  | 'agente'
  | 'impostazioni';
```
E la voce in `APP_MODULES` (prima di `impostazioni`):
```ts
  {
    key: 'agente',
    href: '/hub/agente',
    label: 'Agente',
    description: 'Automazione file ACEA su SharePoint',
    section: 'modules',
    matchPrefixes: ['/hub/agente'],
    adminOnly: true,
    requiresAdminRole: true,
  },
```
(Il commento su `requiresAdminRole` "Solo `impostazioni`" va aggiornato in "`impostazioni` e `agente`".)

- [ ] **Step 2: Aggiungi l'icona (il Record è esaustivo → obbligatorio)**

In `components/layout/moduleIcons.tsx`, dentro `MODULE_ICONS`, prima di `impostazioni`:
```tsx
  agente: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 8V5M9 5h6" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
      <path d="M9 16h6" />
    </svg>
  ),
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` → nessun nuovo errore (se manca l'icona, TS segnala il Record incompleto: è la prova che serve).
Run: `npx eslint lib/moduleAccess.ts components/layout/moduleIcons.tsx` → pulito.

```bash
git add lib/moduleAccess.ts components/layout/moduleIcons.tsx
git commit -m "feat(agente): registra modulo 'agente' (admin) + icona"
```

---

### Task 11: pagina server `/hub/agente`

**Files:**
- Create: `app/hub/agente/page.tsx`
- Riferimento pattern: `app/hub/live/page.tsx` (gate + fuso Roma).

- [ ] **Step 1: Implementa la pagina**

```tsx
// app/hub/agente/page.tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { statoAgente } from '@/lib/agente/decisione';
import AgenteClient, { type AgenteConfigView, type RunView } from '@/components/modules/agente/AgenteClient';

export const dynamic = 'force-dynamic';

export default async function AgentePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') redirect('/hub');
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('agente')) redirect('/hub');

  const { data: cfg } = await supabase
    .from('agente_config')
    .select('enabled, giorni, ora, dry_run, finestra_giorni, ultimo_giro_il, ultimo_contatto_il')
    .eq('id', 1)
    .maybeSingle();
  const { data: runs } = await supabase
    .from('agente_run')
    .select('id, creato_il, dry_run, lavori, aggiornate, extra, conflitti, non_collocate, errore, dettaglio')
    .order('creato_il', { ascending: false })
    .limit(30);

  const config: AgenteConfigView = {
    enabled: cfg?.enabled ?? true,
    giorni: (cfg?.giorni ?? [1, 2, 3, 4, 5]) as number[],
    ora: cfg?.ora ?? '21:00',
    dry_run: cfg?.dry_run ?? true,
    finestra_giorni: cfg?.finestra_giorni ?? 15,
  };

  const now = new Date();
  const parti = partiRoma(now);
  const minutiDaContatto = cfg?.ultimo_contatto_il
    ? Math.floor((now.getTime() - Date.parse(cfg.ultimo_contatto_il)) / 60000)
    : null;
  const ultimoGiroOggi = cfg?.ultimo_giro_il ? partiRoma(new Date(cfg.ultimo_giro_il)).oggi === parti.oggi : false;
  const stato = statoAgente({
    minutiDaContatto, enabled: config.enabled, giorni: config.giorni, ora: config.ora,
    oraCorrente: parti.oraCorrente, weekday: parti.weekday, ultimoGiroOggi,
  });

  return (
    <AgenteClient
      config={config}
      stato={{ online: stato.online, allerta: stato.allerta, minutiDaContatto }}
      runs={(runs ?? []) as RunView[]}
    />
  );
}
```

- [ ] **Step 2: Type-check** (fallirà finché `AgenteClient` non esiste — è il Task successivo)

Run: `npx tsc --noEmit` → atterrà su `AgenteClient` mancante. OK, lo crei nel Task 12, poi ricontrolli.

- [ ] **Step 3: Commit** (insieme al Task 12, vedi sotto)

---

### Task 12: client `AgenteClient.tsx`

**Files:**
- Create: `components/modules/agente/AgenteClient.tsx`

- [ ] **Step 1: Implementa il client**

```tsx
// components/modules/agente/AgenteClient.tsx
'use client';
import { useState } from 'react';

export type AgenteConfigView = {
  enabled: boolean; giorni: number[]; ora: string; dry_run: boolean; finestra_giorni: number;
};
export type RunView = {
  id: string; creato_il: string; dry_run: boolean; lavori: number; aggiornate: number;
  extra: number; conflitti: number; non_collocate: number; errore: string | null; dettaglio: unknown;
};
type StatoView = { online: boolean; allerta: string | null; minutiDaContatto: number | null };

const GIORNI = [
  { n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mer' }, { n: 4, l: 'Gio' },
  { n: 5, l: 'Ven' }, { n: 6, l: 'Sab' }, { n: 7, l: 'Dom' },
];

export default function AgenteClient({
  config: configIniziale, stato, runs,
}: { config: AgenteConfigView; stato: StatoView; runs: RunView[] }) {
  const [config, setConfig] = useState<AgenteConfigView>(configIniziale);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);

  function toggleGiorno(n: number) {
    setConfig((c) => ({
      ...c,
      giorni: c.giorni.includes(n) ? c.giorni.filter((g) => g !== n) : [...c.giorni, n].sort((a, b) => a - b),
    }));
  }

  async function salva() {
    setSalvando(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const j = await res.json();
      setMsg(res.ok ? 'Salvato.' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setSalvando(false);
    }
  }

  const card = 'rounded-2xl border p-5';
  const cardStyle = { borderColor: 'var(--brand-primary-border)', backgroundColor: 'var(--brand-surface)' };

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">Agente</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Aggiornamento automatico dei file ACEA limitazioni massive su SharePoint.
        </p>
      </header>

      {/* STATO */}
      <section className={card} style={cardStyle}>
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${stato.online ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-[var(--brand-text-main)]">
            {stato.online ? 'Online' : 'Offline'}
          </span>
          <span className="text-sm text-[var(--brand-text-muted)]">
            {stato.minutiDaContatto == null ? 'mai contattato' : `ultimo contatto ${stato.minutiDaContatto} min fa`}
          </span>
        </div>
        {stato.allerta && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {stato.allerta}</div>
        )}
      </section>

      {/* PIANIFICAZIONE */}
      <section className={card} style={cardStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--brand-text-main)]">Pianificazione</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))} />
            <span className="text-sm text-[var(--brand-text-main)]">Agente acceso</span>
          </label>

          <div>
            <div className="mb-2 text-sm text-[var(--brand-text-muted)]">Giorni di lavoro</div>
            <div className="flex flex-wrap gap-2">
              {GIORNI.map((g) => (
                <button
                  key={g.n}
                  type="button"
                  onClick={() => toggleGiorno(g.n)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${config.giorni.includes(g.n) ? 'bg-[var(--brand-primary-soft)] font-medium' : ''}`}
                  style={{ borderColor: 'var(--brand-primary-border)', color: 'var(--brand-text-main)' }}
                >
                  {g.l}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3">
            <span className="w-28 text-sm text-[var(--brand-text-muted)]">Ora (dopo le)</span>
            <input type="time" value={config.ora} onChange={(e) => setConfig((c) => ({ ...c, ora: e.target.value }))}
              className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-primary-border)' }} />
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28 text-sm text-[var(--brand-text-muted)]">Finestra (giorni)</span>
            <input type="number" min={1} max={60} value={config.finestra_giorni}
              onChange={(e) => setConfig((c) => ({ ...c, finestra_giorni: Number(e.target.value) }))}
              className="w-20 rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-primary-border)' }} />
          </label>

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={config.dry_run} onChange={(e) => setConfig((c) => ({ ...c, dry_run: e.target.checked }))} />
            <span className="text-sm text-[var(--brand-text-main)]">Modalità Prova (non scrive nei file)</span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={salva} disabled={salvando}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}>
              {salvando ? 'Salvo…' : 'Salva'}
            </button>
            {msg && <span className="text-sm text-[var(--brand-text-muted)]">{msg}</span>}
          </div>
        </div>
      </section>

      {/* FEEDBACK */}
      <section className={card} style={cardStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--brand-text-main)]">Storico giri</h2>
        {runs.length === 0 && <p className="text-sm text-[var(--brand-text-muted)]">Nessun giro registrato.</p>}
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--brand-primary-border)' }}>
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setAperto((a) => (a === r.id ? null : r.id))}>
                <span className="text-sm text-[var(--brand-text-main)]">
                  {new Date(r.creato_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
                  {r.dry_run ? ' · Prova' : ' · Reale'}
                </span>
                <span className="text-sm text-[var(--brand-text-muted)]">
                  {r.errore ? `errore` : `agg ${r.aggiornate} · extra ${r.extra} · confl ${r.conflitti}`}
                </span>
              </button>
              {aperto === r.id && (
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-black/5 p-2 text-xs">
                  {JSON.stringify(r.dettaglio, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check + lint (pagina + client insieme)**

Run: `npx tsc --noEmit` → nessun nuovo errore su `app/hub/agente/page.tsx` e `components/modules/agente/AgenteClient.tsx`.
Run: `npx eslint app/hub/agente/page.tsx components/modules/agente/AgenteClient.tsx` → pulito.

- [ ] **Step 3: Commit (pagina + client)**

```bash
git add app/hub/agente/page.tsx components/modules/agente/AgenteClient.tsx
git commit -m "feat(agente): modulo /hub/agente (pianificazione + stato + storico)"
```

---

## PART D — Agente (`tools/limitazioni-sync`)

### Task 13: `lib/dataCella.mjs` (fix date)

**Files:**
- Create: `tools/limitazioni-sync/lib/dataCella.mjs`
- Test: `tools/limitazioni-sync/lib/dataCella.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/dataCella.test.ts
import { describe, it, expect } from 'vitest';
import { giornoDa, aDataExcel, decidiScritturaData } from './dataCella.mjs';

describe('giornoDa', () => {
  it('estrae YYYY-MM-DD da Date, stringa ISO e già-stringa', () => {
    expect(giornoDa(new Date('2026-06-16T00:00:00+02:00'))).toBe('2026-06-16');
    expect(giornoDa('2026-06-16')).toBe('2026-06-16');
    expect(giornoDa('2026-06-16T10:00:00Z')).toBe('2026-06-16');
    expect(giornoDa('')).toBe('');
  });
});

describe('aDataExcel', () => {
  it('crea una Date a mezzogiorno locale dal giorno ISO (no slittamento di fuso)', () => {
    const d = aDataExcel('2026-06-16');
    expect(d instanceof Date).toBe(true);
    expect(giornoDa(d)).toBe('2026-06-16');
  });
});

describe('decidiScritturaData', () => {
  it('cella vuota → scrivi (Date)', () => {
    const r = decidiScritturaData(null, '2026-06-16');
    expect(r.azione).toBe('scrivi');
    expect(r.valore instanceof Date).toBe(true);
  });
  it('stesso giorno (Date Excel esistente) → salta, niente conflitto', () => {
    expect(decidiScritturaData(new Date('2026-06-16T02:00:00+02:00'), '2026-06-16').azione).toBe('salta');
  });
  it('giorno diverso → conflitto', () => {
    expect(decidiScritturaData(new Date('2026-06-10T02:00:00+02:00'), '2026-06-16').azione).toBe('conflitto');
  });
  it('nuovo vuoto → salta', () => {
    expect(decidiScritturaData(new Date(), '').azione).toBe('salta');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/dataCella.test.ts`
Expected: FAIL — impossibile risolvere `./dataCella.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/dataCella.mjs
// PURE: confronto/scrittura date-aware per la colonna "data" (BN).

/** Estrae "YYYY-MM-DD" da Date | stringa ISO | "YYYY-MM-DD"; '' se vuoto/non valido. */
export function giornoDa(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    // giorno locale (evita slittamenti UTC su date a mezzanotte locale)
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** Crea una Date a mezzogiorno locale dal giorno ISO → exceljs la salva come data Excel senza slittare. */
export function aDataExcel(iso) {
  const [y, m, d] = String(iso).split('-').map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/** Policy date-aware: vuota→scrivi(Date); stesso giorno→salta; giorno diverso→conflitto. */
export function decidiScritturaData(cellaEsistente, nuovoIso) {
  const nuovo = giornoDa(nuovoIso);
  if (nuovo === '') return { azione: 'salta', valore: null };
  const esistente = giornoDa(cellaEsistente);
  if (esistente === '') return { azione: 'scrivi', valore: aDataExcel(nuovo) };
  if (esistente === nuovo) return { azione: 'salta', valore: aDataExcel(nuovo) };
  return { azione: 'conflitto', valore: aDataExcel(nuovo), esistente };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/dataCella.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/dataCella.mjs tools/limitazioni-sync/lib/dataCella.test.ts
git commit -m "feat(lim-sync): dataCella (confronto date-aware, niente falsi conflitti)"
```

---

### Task 14: usa `decidiScritturaData` nell'orchestratore

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`
- Test: `tools/limitazioni-sync/agente.test.ts` (aggiorna l'asserzione sulla data)

- [ ] **Step 1: Aggiorna l'import e la scrittura della colonna data**

In `agente.mjs`, aggiungi l'import:
```js
import { decidiScritturaData } from './lib/dataCella.mjs';
```
Nel ciclo "righe pianificate", il campo `data` NON deve più passare da `decidiScrittura`. Sostituisci il blocco dei `campi` con una gestione separata della data. Dove oggi c'è:
```js
        const campi = [
          ['esecutore', hit.lavoro.esecutore],
          ['data', hit.lavoro.data_esecuzione],
          ['esito', hit.lavoro.esito],
          ['sigillo', hit.lavoro.sigillo],
        ];
        let toccata = false;
        for (const [chiave, valore] of campi) {
          if (col[chiave] == null) continue;
          const cell = row.getCell(col[chiave] + 1);
          const d = decidiScrittura(cell.value, valore);
          if (d.azione === 'scrivi') { cell.value = d.valore; toccata = true; }
          else if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: chiave, esistente: d.esistente, nuovo: d.valore });
          }
        }
```
sostituisci con:
```js
        const campi = [
          ['esecutore', hit.lavoro.esecutore],
          ['esito', hit.lavoro.esito],
          ['sigillo', hit.lavoro.sigillo],
        ];
        let toccata = false;
        for (const [chiave, valore] of campi) {
          if (col[chiave] == null) continue;
          const cell = row.getCell(col[chiave] + 1);
          const d = decidiScrittura(cell.value, valore);
          if (d.azione === 'scrivi') { cell.value = d.valore; toccata = true; }
          else if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: chiave, esistente: d.esistente, nuovo: d.valore });
          }
        }
        // colonna data: confronto date-aware (niente falsi conflitti Date-vs-stringa)
        if (col.data != null) {
          const cell = row.getCell(col.data + 1);
          const dd = decidiScritturaData(cell.value, hit.lavoro.data_esecuzione);
          if (dd.azione === 'scrivi') { cell.value = dd.valore; toccata = true; }
          else if (dd.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: 'data', esistente: String(dd.esistente), nuovo: giornoDa(dd.valore) });
          }
        }
```
Aggiungi `giornoDa` all'import: `import { decidiScritturaData, giornoDa } from './lib/dataCella.mjs';`

- [ ] **Step 2: Aggiorna l'asserzione data nel test e2e**

In `tools/limitazioni-sync/agente.test.ts`, l'asserzione sulla cella BN (data) ora riceve una **Date**, non la stringa. Cambia:
```ts
    expect(ws.getRow(2).getCell(66).value).toBe('2026-06-03'); // BN
```
in:
```ts
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-06-03'); // BN (Date Excel)
```
e aggiungi l'import in cima al test: `import { giornoDa } from './lib/dataCella.mjs';`

- [ ] **Step 3: Run tests**

Run: `npx vitest run tools/limitazioni-sync/` → tutti PASS.
Run: `node --check tools/limitazioni-sync/agente.mjs` → ok.

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/agente.test.ts
git commit -m "fix(lim-sync): colonna data confrontata/scritta come data (niente falsi conflitti)"
```

---

### Task 15: `lib/apiAgente.mjs` (tick + report)

**Files:**
- Create: `tools/limitazioni-sync/lib/apiAgente.mjs`
- Test: `tools/limitazioni-sync/lib/apiAgente.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/apiAgente.test.ts
import { describe, it, expect } from 'vitest';
import { baseUrlDaEndpoint, tick, inviaReport } from './apiAgente.mjs';

describe('baseUrlDaEndpoint', () => {
  it('deriva l origine dall endpoint export', () => {
    expect(baseUrlDaEndpoint('https://x.vercel.app/api/export/limitazioni-massive')).toBe('https://x.vercel.app');
  });
});

describe('tick', () => {
  it('POSTa /api/agente/tick con la chiave e ritorna il JSON', async () => {
    let url = ''; let key = ''; let method = '';
    const fake = async (u: string, o: { method: string; headers: Record<string, string> }) => {
      url = u; key = o.headers['x-export-key']; method = o.method;
      return { ok: true, json: async () => ({ eseguiOra: true, dryRun: false, finestraGiorni: 15 }) };
    };
    const r = await tick({ baseUrl: 'https://x', exportKey: 'k' }, fake as unknown as typeof fetch);
    expect(method).toBe('POST');
    expect(url).toBe('https://x/api/agente/tick');
    expect(key).toBe('k');
    expect(r).toEqual({ eseguiOra: true, dryRun: false, finestraGiorni: 15 });
  });
});

describe('inviaReport', () => {
  it('POSTa /api/agente/report con il report nel body', async () => {
    let body = '';
    const fake = async (_u: string, o: { body: string }) => { body = o.body; return { ok: true, json: async () => ({ ok: true }) }; };
    await inviaReport({ baseUrl: 'https://x', exportKey: 'k', report: { lavori: 5 } }, fake as unknown as typeof fetch);
    expect(JSON.parse(body)).toEqual({ lavori: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: FAIL — impossibile risolvere `./apiAgente.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/apiAgente.mjs
// I/O: chiamate agli endpoint agente dell'app. `fetchImpl` iniettabile per i test.

/** https://host/api/export/... → https://host */
export function baseUrlDaEndpoint(endpointUrl) {
  try {
    return new URL(endpointUrl).origin;
  } catch {
    return String(endpointUrl).replace(/\/api\/.*$/, '');
  }
}

export async function tick({ baseUrl, exportKey }, fetchImpl = fetch) {
  const res = await fetchImpl(`${baseUrl}/api/agente/tick`, {
    method: 'POST',
    headers: { 'x-export-key': exportKey },
  });
  if (!res.ok) throw new Error(`tick ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function inviaReport({ baseUrl, exportKey, report }, fetchImpl = fetch) {
  const res = await fetchImpl(`${baseUrl}/api/agente/report`, {
    method: 'POST',
    headers: { 'x-export-key': exportKey, 'content-type': 'application/json' },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error(`report ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/apiAgente.mjs tools/limitazioni-sync/lib/apiAgente.test.ts
git commit -m "feat(lim-sync): apiAgente (tick + inviaReport)"
```

---

### Task 16: `agente.mjs main()` tick-gated + report

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`

> `main()` è I/O: nessun unit test; la logica decisionale è nell'app (testata). Verifica con `node --check` + giro reale (Task finale).

- [ ] **Step 1: Riscrivi `main()`**

Sostituisci la funzione `main()` esistente con:
```js
async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const baseUrl = baseUrlDaEndpoint(cfg.endpointUrl);
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');

  // 1) chiedi all'app se eseguire ORA (heartbeat incluso)
  const decisione = await tick({ baseUrl, exportKey: cfg.exportKey });
  if (!decisione.eseguiOra) {
    console.log(`[${stamp}] tick: in attesa (eseguiOra=false)`);
    return;
  }

  // 2) esegui il giro coi parametri dati dall'app
  const { from, to } = finestra(now.toISOString().slice(0, 10), decisione.finestraGiorni ?? 15);
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({ cartella: cfg.cartella, lavori, dryRun: !!decisione.dryRun, stamp });
  report.lavori = lavori.length;

  // 3) log locale + invio report all'app
  try { scriviLog(cfg.cartella, stamp, report); } catch (e) {
    console.error(`[lim-sync] log: ${e instanceof Error ? e.message : e}`);
  }
  try { await inviaReport({ baseUrl, exportKey: cfg.exportKey, report }); } catch (e) {
    console.error(`[lim-sync] invio report: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`[${stamp}] giro eseguito: lavori=${lavori.length} dryRun=${!!decisione.dryRun}`);
}
```
Aggiungi gli import in cima al file:
```js
import { tick, inviaReport, baseUrlDaEndpoint } from './lib/apiAgente.mjs';
```
(`finestra` è già importata; resta. La vecchia lettura `cfg.finestraGiorni`/`cfg.dryRun` nel main sparisce: ora vengono dall'app.)

- [ ] **Step 2: Verifica**

Run: `node --check tools/limitazioni-sync/agente.mjs` → ok.
Run: `npx vitest run tools/limitazioni-sync/` → tutti i test PASS (l'e2e di `eseguiGiro` non dipende da `main`).

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(lim-sync): main() tick-gated + invio report all'app"
```

---

## PART E — Deploy e messa in opera (manuale)

### Task 17: migration, deploy, Task Scheduler, abilitazione, smoke

> Passi operativi. Nessun test automatico.

- [ ] **Step 1: Suite mirata completa del WP**

Run: `npx vitest run lib/agente/ tools/limitazioni-sync/`
Expected: tutti verdi.
Run: `npx tsc --noEmit` → 0 errori (o nessun nuovo).

- [ ] **Step 2: Lancia la migration su prod**

Esegui `supabase/migrations/20260616160000_agente.sql` sul DB di produzione (l'utente la lancia: crea `agente_config` con la riga singleton + `agente_run`).

- [ ] **Step 3: Push → deploy**

Con OK esplicito dell'utente: `git push origin <branch>:main` (refspec). Vercel deploya endpoint + modulo. Verifica `POST /api/agente/tick` con la chiave → 200.

- [ ] **Step 4: Abilita il modulo all'admin**

In Impostazioni → Utenze, assicurati che l'utente admin abbia il modulo **Agente** abilitato (è `adminOnly` + `requiresAdminRole`).

- [ ] **Step 5: Aggiorna l'agente sul PC (copia unica) + Task Scheduler ogni ora**

Ricopia la cartella `tools/limitazioni-sync` aggiornata sul PC di lavoro (sovrascrivi i file `.mjs`/`lib`; `config.json` resta). Poi in PowerShell (utente normale):
```powershell
$node = "C:\Users\edgardo.perrelli\node\node-v24.16.0-win-x64\node.exe"
$agente = "C:\Users\edgardo.perrelli\Desktop\tools\tools\limitazioni-sync\agente.mjs"
schtasks /Create /TN "LimitazioniMassiveSync" /TR "`"$node`" `"$agente`"" /SC HOURLY /F
```
Expected: `SUCCESS`. (Da ora il "quando" lo decide l'app; il task gira ogni ora e chiede `/tick`.)

- [ ] **Step 6: Smoke nel browser**

Apri `/hub/agente`: imposta giorni/ora/dryRun, Salva. Forza un tick (`schtasks /Run /TN "LimitazioniMassiveSync"`) e verifica che in pagina compaia "ultimo contatto" aggiornato; quando le condizioni dicono "esegui", che compaia un nuovo giro nello Storico.

---

## Self-Review (compilato in fase di scrittura)

**1. Spec coverage:**
- App-cervello (decideEsecuzione, fuso Roma, rivendicazione) → Task 1,2,7. ✅
- Tabelle `agente_config`/`agente_run` → Task 6. ✅
- Endpoint tick/report (chiave) + admin config → Task 7,8,9; helper chiave Task 5. ✅
- Modulo `/hub/agente` (pianificazione+stato+storico) → Task 10,11,12; statoAgente Task 4. ✅
- Permessi admin + icona → Task 10. ✅
- Agente tick-gated + report → Task 15,16. ✅
- Fix date (niente falsi conflitti, data Excel) → Task 13,14. ✅
- Task Scheduler ogni ora → Task 17. ✅

**2. Placeholder scan:** nessun "TBD"/"handle errors"/"simile a"; ogni step ha codice o comando reale. ✅

**3. Type/nome consistency:** `decideEsecuzione`/`riassumiReport`/`statoAgente`/`validaConfig`/`ReportAgente`/`ConfigInput` definiti in Task 2–4 e usati in Task 7,8,9; `chiaveValida` (Task 5) usata in 7,8; `partiRoma` (Task 1) in 7,11; `AgenteConfigView`/`RunView` definiti in Task 12 e importati in Task 11; `decidiScritturaData`/`giornoDa` (Task 13) usati in 14; `tick`/`inviaReport`/`baseUrlDaEndpoint` (Task 15) usati in 16. ✅
