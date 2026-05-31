# Assegnazioni manuali nel modulo mappe (Blocco A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere uno strato opzionale di assegnazioni manuali (regole per CAP/attività/ODS+indirizzo, con tetto X e lucchetto per-operatore) sopra la distribuzione automatica del modulo mappe, in stile Aurea.

**Architecture:** Una funzione pura `applyManualAssignments` applica le regole come pre-passaggio (cascata ODS→CAP→Attività), poi la distribuzione K-means esistente (`capacityDistributeWithUnassigned`) gira sugli interventi residui e sugli operatori non sigillati. Le regole e i lucchetti si salvano col piano. UI: modal a tutto schermo con wizard, stile Aurea.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (service role + auth-helpers), Tailwind 4, zod, Vitest (nuovo).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-31-assegnazioni-manuali-mappa-design.md`
**Mockup di riferimento:** `docs/superpowers/mockups/` (01-overview, 02-operatore, 03-filtri, 04-conferma)

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `supabase/migrations/20260501000000_mappa_assegnazioni_manuali.sql` | Schema 3 tabelle (già applicato in DB) | Create |
| `vitest.config.ts` | Config test runner | Create |
| `package.json` | devDep `vitest` + script `test` | Modify |
| `utils/routing/manualAssignments.ts` | **Funzione pura** + tipi + helper (cuore della logica) | Create |
| `utils/routing/manualAssignments.test.ts` | Test unitari della funzione pura | Create |
| `app/api/mappa/piani/route.ts` | Persistenza regole+lucchetti nel piano (GET/POST) | Modify |
| `app/api/mappa/piani/rulePayload.ts` | Helper puro: validazione zod + costruzione righe DB | Create |
| `app/api/mappa/piani/rulePayload.test.ts` | Test del helper | Create |
| `app/api/mappa/assegnazioni-preset/route.ts` | CRUD preset riutilizzabili | Create |
| `components/modules/mappa/ManualAssignmentsModal.tsx` | Modal Aurea + wizard regole + lista lucchetti | Create |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Stato regole/lucchetti, bottone, pre-passaggio nella distribuzione, salvataggio | Modify |

**Tipi condivisi (definiti in Task 3, usati ovunque):**
```ts
ManualRule { id, staffId, filtroOds[], filtroIndirizzo[], filtroCap[], filtroAttivita[], maxInterventi: number|null, ordine }
AssignOperator { id, qty }
ManualAssignmentResult { assignedByStaff: Record<string,Task[]>, remaining: Task[], pool: AssignOperator[], closedStaffIds: string[], warnings: ManualWarning[] }
ManualWarning { type: 'regola_vuota'|'overflow'|'ods_doppio'|'chiuso_vuoto', ruleId?, staffId?, message }
```

---

## Task 1: Migrazione SQL nel repo (DB già aggiornato)

**Files:**
- Create: `supabase/migrations/20260501000000_mappa_assegnazioni_manuali.sql`

> Nota: l'utente ha già eseguito questa SQL nel DB. Il file serve a tracciarla nel repo. È idempotente (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), quindi ri-eseguibile senza danni.

- [ ] **Step 1: Creare il file di migrazione**

```sql
-- Blocco A — Assegnazioni manuali nel modulo mappe (regole + lucchetti + preset)
CREATE TABLE IF NOT EXISTS mappa_assegnazioni_manuali (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id         UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id         TEXT NOT NULL,
  staff_name       TEXT,
  filtro_ods       TEXT[] NOT NULL DEFAULT '{}',
  filtro_indirizzo TEXT[] NOT NULL DEFAULT '{}',
  filtro_cap       TEXT[] NOT NULL DEFAULT '{}',
  filtro_attivita  TEXT[] NOT NULL DEFAULT '{}',
  max_interventi   INT,
  ordine           INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assegnazioni_piano ON mappa_assegnazioni_manuali(piano_id);
ALTER TABLE mappa_assegnazioni_manuali ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assegnazioni_all_authenticated" ON mappa_assegnazioni_manuali;
CREATE POLICY "assegnazioni_all_authenticated" ON mappa_assegnazioni_manuali
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mappa_piani_lucchetti (
  piano_id  UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id  TEXT NOT NULL,
  aperto    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (piano_id, staff_id)
);
ALTER TABLE mappa_piani_lucchetti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lucchetti_all_authenticated" ON mappa_piani_lucchetti;
CREATE POLICY "lucchetti_all_authenticated" ON mappa_piani_lucchetti
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mappa_assegnazioni_preset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  staff_id        TEXT,
  filtro_cap      TEXT[] NOT NULL DEFAULT '{}',
  filtro_attivita TEXT[] NOT NULL DEFAULT '{}',
  max_interventi  INT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mappa_assegnazioni_preset ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "preset_all_authenticated" ON mappa_assegnazioni_preset;
CREATE POLICY "preset_all_authenticated" ON mappa_assegnazioni_preset
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260501000000_mappa_assegnazioni_manuali.sql
git commit -m "feat(mappa): migrazione assegnazioni manuali (regole, lucchetti, preset)"
```

---

## Task 2: Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `utils/routing/smoke.test.ts` (temporaneo, rimosso a fine task)

- [ ] **Step 1: Installare Vitest**

Run: `npm install -D vitest@^2`
Expected: aggiunge `vitest` a devDependencies, exit 0.

- [ ] **Step 2: Aggiungere lo script test in package.json**

In `package.json`, dentro `"scripts"`, aggiungere dopo `"lint": "eslint"`:
```json
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Creare vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
});
```

- [ ] **Step 4: Smoke test**

Create `utils/routing/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Expected: PASS (1 test passato).

- [ ] **Step 6: Rimuovere lo smoke test e committare**

```bash
git rm utils/routing/smoke.test.ts
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: setup Vitest test runner"
```

---

## Task 3: Tipi e helper di normalizzazione

**Files:**
- Create: `utils/routing/manualAssignments.ts`
- Create: `utils/routing/manualAssignments.test.ts`

- [ ] **Step 1: Scrivere i test di normalizzazione (falliscono)**

Create `utils/routing/manualAssignments.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normValue, normAddr } from './manualAssignments';

describe('normValue', () => {
  it('trim + uppercase', () => {
    expect(normValue('  s-ai-051 ')).toBe('S-AI-051');
  });
  it('gestisce null/undefined', () => {
    expect(normValue(undefined)).toBe('');
    expect(normValue(null)).toBe('');
  });
});

describe('normAddr', () => {
  it('rimuove punteggiatura e spazi multipli, uppercase', () => {
    expect(normAddr('Via Roma, 12  ')).toBe('VIA ROMA 12');
  });
  it('case/spazi diversi → stessa forma', () => {
    expect(normAddr('via  roma 12')).toBe(normAddr('VIA ROMA, 12'));
  });
});
```

- [ ] **Step 2: Eseguire i test → falliscono**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: FAIL ("Failed to resolve import './manualAssignments'").

- [ ] **Step 3: Creare il modulo con tipi e helper**

Create `utils/routing/manualAssignments.ts`:
```ts
import type { Task } from './types';

export interface ManualRule {
  id: string;
  staffId: string;
  filtroOds: string[];
  filtroIndirizzo: string[];
  filtroCap: string[];
  filtroAttivita: string[];
  maxInterventi: number | null;
  ordine: number;
}

export interface AssignOperator {
  id: string;   // = staffId
  qty: number;  // capacità target
}

export type ManualWarningType = 'regola_vuota' | 'overflow' | 'ods_doppio' | 'chiuso_vuoto';

export interface ManualWarning {
  type: ManualWarningType;
  ruleId?: string;
  staffId?: string;
  message: string;
}

export interface ManualAssignmentResult {
  assignedByStaff: Record<string, Task[]>;
  remaining: Task[];
  pool: AssignOperator[];
  closedStaffIds: string[];
  warnings: ManualWarning[];
}

export function normValue(v: string | undefined | null): string {
  return (v ?? '').trim().toUpperCase();
}

export function normAddr(v: string | undefined | null): string {
  return normValue(v)
    .replace(/[.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Eseguire i test → passano**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add utils/routing/manualAssignments.ts utils/routing/manualAssignments.test.ts
git commit -m "feat(mappa): tipi + helper normalizzazione assegnazioni manuali"
```

---

## Task 4: `matchesRule` (match AND sui filtri)

**Files:**
- Modify: `utils/routing/manualAssignments.ts`
- Test: `utils/routing/manualAssignments.test.ts`

- [ ] **Step 1: Aggiungere i test (falliscono)**

Appendere a `manualAssignments.test.ts`:
```ts
import { matchesRule } from './manualAssignments';
import type { Task } from './types';

const task = (over: Partial<Task>): Task => ({
  id: 't', odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over,
});
const rule = (over: Partial<import('./manualAssignments').ManualRule>) => ({
  id: 'r', staffId: 's', filtroOds: [], filtroIndirizzo: [], filtroCap: [], filtroAttivita: [],
  maxInterventi: null, ordine: 0, ...over,
});

describe('matchesRule', () => {
  it('CAP esatto', () => {
    expect(matchesRule(task({ cap: '00044' }), rule({ filtroCap: ['00044'] }))).toBe(true);
    expect(matchesRule(task({ cap: '00045' }), rule({ filtroCap: ['00044'] }))).toBe(false);
  });
  it('ODS su odsin', () => {
    expect(matchesRule(task({ odsin: 'ods-1' }), rule({ filtroOds: ['ODS-1'] }))).toBe(true);
  });
  it('indirizzo: match "contiene" normalizzato', () => {
    expect(matchesRule(task({ indirizzo: 'Via Roma 12, Frascati' }), rule({ filtroIndirizzo: ['via roma 12'] }))).toBe(true);
  });
  it('combinati in AND', () => {
    const r = rule({ filtroCap: ['00044'], filtroAttivita: ['S-AI-051'] });
    expect(matchesRule(task({ cap: '00044', attivita: 'S-AI-051' }), r)).toBe(true);
    expect(matchesRule(task({ cap: '00044', attivita: 'X' }), r)).toBe(false);
  });
  it('filtri vuoti ignorati (ma serve almeno un match reale)', () => {
    expect(matchesRule(task({ cap: '00044' }), rule({ filtroCap: ['00044'], filtroOds: [] }))).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire → falliscono**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: FAIL ("matchesRule is not a function").

- [ ] **Step 3: Implementare matchesRule**

Appendere a `manualAssignments.ts`:
```ts
export function matchesRule(task: Task, rule: ManualRule): boolean {
  const ods = normValue(task.odsin);
  const cap = normValue(task.cap);
  const att = normValue(task.attivita);
  const addr = normAddr(task.indirizzo);
  const okOds = rule.filtroOds.length === 0 || rule.filtroOds.map(normValue).includes(ods);
  const okAddr = rule.filtroIndirizzo.length === 0
    || rule.filtroIndirizzo.some((a) => addr.includes(normAddr(a)) && normAddr(a).length > 0);
  const okCap = rule.filtroCap.length === 0 || rule.filtroCap.map(normValue).includes(cap);
  const okAtt = rule.filtroAttivita.length === 0 || rule.filtroAttivita.map(normValue).includes(att);
  return okOds && okAddr && okCap && okAtt;
}
```

- [ ] **Step 4: Eseguire → passano**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/routing/manualAssignments.ts utils/routing/manualAssignments.test.ts
git commit -m "feat(mappa): matchesRule (filtri AND ODS/indirizzo/CAP/attività)"
```

---

## Task 5: `phaseOfRule` (cascata di priorità)

**Files:**
- Modify: `utils/routing/manualAssignments.ts`
- Test: `utils/routing/manualAssignments.test.ts`

- [ ] **Step 1: Test (falliscono)**

Appendere:
```ts
import { phaseOfRule } from './manualAssignments';

describe('phaseOfRule', () => {
  it('ODS o indirizzo → fase 0', () => {
    expect(phaseOfRule(rule({ filtroOds: ['X'] }))).toBe(0);
    expect(phaseOfRule(rule({ filtroIndirizzo: ['Y'] }))).toBe(0);
    expect(phaseOfRule(rule({ filtroOds: ['X'], filtroCap: ['00044'] }))).toBe(0);
  });
  it('CAP (senza ODS/indirizzo) → fase 1', () => {
    expect(phaseOfRule(rule({ filtroCap: ['00044'], filtroAttivita: ['A'] }))).toBe(1);
  });
  it('solo attività → fase 2', () => {
    expect(phaseOfRule(rule({ filtroAttivita: ['A'] }))).toBe(2);
  });
});
```

- [ ] **Step 2: Eseguire → falliscono**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: FAIL ("phaseOfRule is not a function").

- [ ] **Step 3: Implementare**

Appendere a `manualAssignments.ts`:
```ts
export function phaseOfRule(rule: ManualRule): 0 | 1 | 2 {
  if (rule.filtroOds.length > 0 || rule.filtroIndirizzo.length > 0) return 0;
  if (rule.filtroCap.length > 0) return 1;
  return 2;
}

function hasAnyFilter(rule: ManualRule): boolean {
  return rule.filtroOds.length > 0 || rule.filtroIndirizzo.length > 0
    || rule.filtroCap.length > 0 || rule.filtroAttivita.length > 0;
}
```

- [ ] **Step 4: Eseguire → passano**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/routing/manualAssignments.ts utils/routing/manualAssignments.test.ts
git commit -m "feat(mappa): phaseOfRule (cascata ODS→CAP→attività)"
```

---

## Task 6: `applyManualAssignments` (pre-passaggio completo)

**Files:**
- Modify: `utils/routing/manualAssignments.ts`
- Test: `utils/routing/manualAssignments.test.ts`

- [ ] **Step 1: Test completi (falliscono)**

Appendere:
```ts
import { applyManualAssignments } from './manualAssignments';

const ops = [{ id: 'mario', qty: 30 }, { id: 'anna', qty: 30 }, { id: 'sara', qty: 30 }];

describe('applyManualAssignments', () => {
  it('cascata: ODS vince su CAP per lo stesso intervento', () => {
    const tasks = [task({ id: 'a', odsin: 'O1', cap: '00044' })];
    const rules = [
      rule({ id: 'rOds', staffId: 'mario', filtroOds: ['O1'], ordine: 0 }),
      rule({ id: 'rCap', staffId: 'anna', filtroCap: ['00044'], ordine: 0 }),
    ];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']?.map((t) => t.id)).toEqual(['a']);
    expect(res.assignedByStaff['anna'] ?? []).toEqual([]);
    expect(res.remaining).toEqual([]);
  });

  it('tetto X: assegna fino a X, eccesso in remaining + warning overflow', () => {
    const tasks = [task({ id: 'a', cap: '1' }), task({ id: 'b', cap: '1' }), task({ id: 'c', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'], maxInterventi: 2 })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']).toHaveLength(2);
    expect(res.remaining).toHaveLength(1);
    expect(res.warnings.some((w) => w.type === 'overflow')).toBe(true);
  });

  it('lucchetto chiuso: operatore fuori dal pool', () => {
    const tasks = [task({ id: 'a', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'] })];
    const res = applyManualAssignments(tasks, rules, ops, { mario: false });
    expect(res.closedStaffIds).toContain('mario');
    expect(res.pool.find((o) => o.id === 'mario')).toBeUndefined();
  });

  it('lucchetto aperto (default): capacità ridotta dai pinnati', () => {
    const tasks = [task({ id: 'a', cap: '1' }), task({ id: 'b', cap: '1' })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroCap: ['1'], maxInterventi: 2 })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    const mario = res.pool.find((o) => o.id === 'mario');
    expect(mario?.qty).toBe(28); // 30 - 2 pinnati
  });

  it('regola a vuoto → warning regola_vuota', () => {
    const res = applyManualAssignments([task({ id: 'a', cap: '1' })],
      [rule({ id: 'r', staffId: 'mario', filtroCap: ['999'] })], ops, {});
    expect(res.warnings.some((w) => w.type === 'regola_vuota')).toBe(true);
  });

  it('ODS doppio → primo per ordine vince, warning ods_doppio', () => {
    const tasks = [task({ id: 'a', odsin: 'O1' })];
    const rules = [
      rule({ id: 'r1', staffId: 'mario', filtroOds: ['O1'], ordine: 0 }),
      rule({ id: 'r2', staffId: 'anna', filtroOds: ['O1'], ordine: 1 }),
    ];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']).toHaveLength(1);
    expect(res.warnings.some((w) => w.type === 'ods_doppio')).toBe(true);
  });

  it('chiuso senza match → warning chiuso_vuoto', () => {
    const res = applyManualAssignments([task({ id: 'a', cap: '1' })],
      [rule({ id: 'r', staffId: 'mario', filtroCap: ['999'] })], ops, { mario: false });
    expect(res.warnings.some((w) => w.type === 'chiuso_vuoto' && w.staffId === 'mario')).toBe(true);
  });

  it('fallback indirizzo quando ODS assente nel dato', () => {
    const tasks = [task({ id: 'a', indirizzo: 'Via Roma 12, Frascati', odsin: undefined })];
    const rules = [rule({ id: 'r', staffId: 'mario', filtroIndirizzo: ['via roma 12'] })];
    const res = applyManualAssignments(tasks, rules, ops, {});
    expect(res.assignedByStaff['mario']?.map((t) => t.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Eseguire → falliscono**

Run: `npx vitest run utils/routing/manualAssignments.test.ts`
Expected: FAIL ("applyManualAssignments is not a function").

- [ ] **Step 3: Implementare la funzione pura**

Appendere a `manualAssignments.ts`:
```ts
export function applyManualAssignments(
  tasks: Task[],
  rules: ManualRule[],
  ops: AssignOperator[],
  locks: Record<string, boolean>,
): ManualAssignmentResult {
  const assignedByStaff: Record<string, Task[]> = {};
  const pinnedCount: Record<string, number> = {};
  const takenBy = new Map<string, string>(); // taskId -> staffId
  const warnings: ManualWarning[] = [];

  const valid = rules.filter(hasAnyFilter);

  for (const phase of [0, 1, 2] as const) {
    const inPhase = valid
      .filter((r) => phaseOfRule(r) === phase)
      .sort((a, b) => a.ordine - b.ordine);

    for (const rule of inPhase) {
      const allMatches = tasks.filter((t) => matchesRule(t, rule));
      const free = allMatches.filter((t) => !takenBy.has(t.id));

      // ods_doppio: in fase ODS, alcuni match presi da un altro operatore
      if (phase === 0) {
        const stolen = allMatches.filter(
          (t) => takenBy.has(t.id) && takenBy.get(t.id) !== rule.staffId,
        );
        if (stolen.length > 0) {
          warnings.push({ type: 'ods_doppio', ruleId: rule.id, staffId: rule.staffId,
            message: `ODS già assegnato ad altro operatore (${stolen.length})` });
        }
      }

      if (free.length === 0) {
        warnings.push({ type: 'regola_vuota', ruleId: rule.id, staffId: rule.staffId,
          message: 'Nessun intervento corrispondente nel dataset' });
        continue;
      }

      const cap = rule.maxInterventi == null ? Infinity : Math.max(0, rule.maxInterventi);
      const take = free.slice(0, cap);
      if (free.length > cap) {
        warnings.push({ type: 'overflow', ruleId: rule.id, staffId: rule.staffId,
          message: `${free.length} corrispondenti, assegnati ${take.length}, ${free.length - take.length} redistribuiti` });
      }
      for (const t of take) {
        takenBy.set(t.id, rule.staffId);
        (assignedByStaff[rule.staffId] ??= []).push(t);
        pinnedCount[rule.staffId] = (pinnedCount[rule.staffId] ?? 0) + 1;
      }
    }
  }

  const closedStaffIds = ops.filter((o) => locks[o.id] === false).map((o) => o.id);
  const closedSet = new Set(closedStaffIds);

  for (const id of closedStaffIds) {
    if (!pinnedCount[id]) {
      warnings.push({ type: 'chiuso_vuoto', staffId: id,
        message: 'Operatore 🔒 chiuso senza interventi corrispondenti: resterà vuoto' });
    }
  }

  const pool = ops
    .filter((o) => !closedSet.has(o.id))
    .map((o) => ({ id: o.id, qty: Math.max(0, o.qty - (pinnedCount[o.id] ?? 0)) }));

  const remaining = tasks.filter((t) => !takenBy.has(t.id));

  return { assignedByStaff, remaining, pool, closedStaffIds, warnings };
}
```

- [ ] **Step 4: Eseguire tutti i test → passano**

Run: `npm test`
Expected: PASS (tutti i test di manualAssignments).

- [ ] **Step 5: Commit**

```bash
git add utils/routing/manualAssignments.ts utils/routing/manualAssignments.test.ts
git commit -m "feat(mappa): applyManualAssignments (pre-passaggio cascata + lucchetti + X)"
```

---

## Task 7: Persistenza regole+lucchetti nell'API piani

**Files:**
- Create: `app/api/mappa/piani/rulePayload.ts`
- Create: `app/api/mappa/piani/rulePayload.test.ts`
- Modify: `app/api/mappa/piani/route.ts`

- [ ] **Step 1: Test del helper (falliscono)**

Create `app/api/mappa/piani/rulePayload.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseRegole, buildRuleRows } from './rulePayload';

describe('parseRegole', () => {
  it('accetta regola valida', () => {
    const r = parseRegole([{ staffId: 's', filtroCap: ['00044'], maxInterventi: 10, ordine: 0 }]);
    expect(r[0].staffId).toBe('s');
    expect(r[0].filtroOds).toEqual([]);
  });
  it('scarta regole senza alcun filtro', () => {
    expect(parseRegole([{ staffId: 's' }])).toEqual([]);
  });
  it('scarta regole senza staffId', () => {
    expect(parseRegole([{ filtroCap: ['1'] }])).toEqual([]);
  });
});

describe('buildRuleRows', () => {
  it('mappa camelCase → snake_case con piano_id', () => {
    const rows = buildRuleRows('PIANO1', parseRegole([{ staffId: 's', staffName: 'S', filtroCap: ['1'], ordine: 2 }]));
    expect(rows[0]).toMatchObject({ piano_id: 'PIANO1', staff_id: 's', filtro_cap: ['1'], ordine: 2 });
  });
});
```

- [ ] **Step 2: Eseguire → falliscono**

Run: `npx vitest run app/api/mappa/piani/rulePayload.test.ts`
Expected: FAIL ("Failed to resolve import './rulePayload'").

- [ ] **Step 3: Creare il helper**

Create `app/api/mappa/piani/rulePayload.ts`:
```ts
import { z } from 'zod';

const strArr = z.array(z.string()).optional().default([]);

export const RegolaSchema = z.object({
  staffId: z.string().min(1),
  staffName: z.string().optional(),
  filtroOds: strArr,
  filtroIndirizzo: strArr,
  filtroCap: strArr,
  filtroAttivita: strArr,
  maxInterventi: z.number().int().positive().nullable().optional().default(null),
  ordine: z.number().int().optional().default(0),
});
export type Regola = z.infer<typeof RegolaSchema>;

function hasAnyFilter(r: Regola): boolean {
  return r.filtroOds.length + r.filtroIndirizzo.length + r.filtroCap.length + r.filtroAttivita.length > 0;
}

export function parseRegole(input: unknown): Regola[] {
  if (!Array.isArray(input)) return [];
  const out: Regola[] = [];
  for (const item of input) {
    const parsed = RegolaSchema.safeParse(item);
    if (parsed.success && hasAnyFilter(parsed.data)) out.push(parsed.data);
  }
  return out;
}

export function buildRuleRows(pianoId: string, regole: Regola[]) {
  return regole.map((r) => ({
    piano_id: pianoId,
    staff_id: r.staffId,
    staff_name: r.staffName ?? null,
    filtro_ods: r.filtroOds,
    filtro_indirizzo: r.filtroIndirizzo,
    filtro_cap: r.filtroCap,
    filtro_attivita: r.filtroAttivita,
    max_interventi: r.maxInterventi,
    ordine: r.ordine,
  }));
}

export function buildLockRows(pianoId: string, lucchetti: unknown) {
  if (!lucchetti || typeof lucchetti !== 'object') return [];
  return Object.entries(lucchetti as Record<string, unknown>)
    .filter(([staffId]) => staffId.length > 0)
    .map(([staffId, aperto]) => ({ piano_id: pianoId, staff_id: staffId, aperto: aperto !== false }));
}
```

- [ ] **Step 4: Eseguire → passano**

Run: `npx vitest run app/api/mappa/piani/rulePayload.test.ts`
Expected: PASS.

- [ ] **Step 5: Persistere nel POST (route.ts)**

In `app/api/mappa/piani/route.ts`, dopo l'import a riga 4 aggiungere:
```ts
import { parseRegole, buildRuleRows, buildLockRows } from './rulePayload';
```

In `POST`, alla destrutturazione (riga 77) aggiungere `regole` e `lucchetti`:
```ts
    const { data: isoData, territorio, note, stato = 'bozza', operatori, regole, lucchetti } = body;
```

Subito **dopo** l'insert di `mappa_piani_operatori` riuscito (dopo riga 127 `if (eOp) throw...`), inserire:
```ts
    // Regole di assegnazione manuale (delete-then-insert atomico per piano)
    const ruleRows = buildRuleRows(pianoId, parseRegole(regole));
    if (ruleRows.length > 0) {
      const { error: eRules } = await supabaseAdmin.from('mappa_assegnazioni_manuali').insert(ruleRows);
      if (eRules) console.error('[POST /api/mappa/piani] regole:', eRules.message);
    }
    const lockRows = buildLockRows(pianoId, lucchetti);
    if (lockRows.length > 0) {
      const { error: eLocks } = await supabaseAdmin.from('mappa_piani_lucchetti').insert(lockRows);
      if (eLocks) console.error('[POST /api/mappa/piani] lucchetti:', eLocks.message);
    }
```
> Nota: ogni POST crea un nuovo `pianoId`, quindi l'insert è già "pulito" (nessuna riga preesistente per quel piano). Il "delete-then-insert" si applica solo se in futuro si aggiungerà un endpoint di update in-place.

- [ ] **Step 6: Restituire regole+lucchetti nel GET**

In `GET`, dopo il blocco `operatori` (dopo riga 40 `if (eOp) throw...`), aggiungere:
```ts
    const { data: regoleRows } = await supabaseAdmin
      .from('mappa_assegnazioni_manuali')
      .select('id, piano_id, staff_id, staff_name, filtro_ods, filtro_indirizzo, filtro_cap, filtro_attivita, max_interventi, ordine')
      .in('piano_id', pianoIds);
    const { data: lockRows } = await supabaseAdmin
      .from('mappa_piani_lucchetti')
      .select('piano_id, staff_id, aperto')
      .in('piano_id', pianoIds);
```
E nel `result` (riga 60) aggiungere due campi all'oggetto:
```ts
      regole: (regoleRows ?? []).filter((r: any) => r.piano_id === p.id),
      lucchetti: (lockRows ?? []).filter((l: any) => l.piano_id === p.id),
```

- [ ] **Step 7: Verifica build + test**

Run: `npm test && npx tsc --noEmit`
Expected: test PASS, nessun errore TypeScript.

- [ ] **Step 8: Commit**

```bash
git add app/api/mappa/piani/route.ts app/api/mappa/piani/rulePayload.ts app/api/mappa/piani/rulePayload.test.ts
git commit -m "feat(mappa): salva/leggi regole e lucchetti nell'API piani"
```

---

## Task 8: Endpoint preset riutilizzabili

**Files:**
- Create: `app/api/mappa/assegnazioni-preset/route.ts`

- [ ] **Step 1: Creare la route**

Create `app/api/mappa/assegnazioni-preset/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('mappa_assegnazioni_preset')
    .select('id, nome, staff_id, filtro_cap, filtro_attivita, max_interventi')
    .order('nome');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.nome) return NextResponse.json({ error: 'nome obbligatorio' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('mappa_assegnazioni_preset')
      .insert({
        nome: String(b.nome),
        staff_id: b.staffId ?? null,
        filtro_cap: Array.isArray(b.filtroCap) ? b.filtroCap : [],
        filtro_attivita: Array.isArray(b.filtroAttivita) ? b.filtroAttivita : [],
        max_interventi: typeof b.maxInterventi === 'number' ? b.maxInterventi : null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { error } = await supabaseAdmin.from('mappa_assegnazioni_preset').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verifica build**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/api/mappa/assegnazioni-preset/route.ts
git commit -m "feat(mappa): endpoint CRUD preset assegnazioni"
```

---

## Task 9: Componente modal Aurea + wizard

**Files:**
- Create: `components/modules/mappa/ManualAssignmentsModal.tsx`

> Il markup visivo replica i mockup in `docs/superpowers/mockups/` (stile Aurea: cyan `#00D4FF`/oklch(0.78 0.155 215), magenta, navy, Geist, angoli arrotondati, glow). Usa Tailwind con classi arbitrarie `oklch(...)` per i colori Aurea, coerenti con quei mockup.

- [ ] **Step 1: Creare il componente**

Create `components/modules/mappa/ManualAssignmentsModal.tsx`:
```tsx
'use client';
import { useMemo, useState } from 'react';
import type { ManualRule } from '@/utils/routing/manualAssignments';
import type { Task } from '@/utils/routing/types';

export type OperatorLite = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  operators: OperatorLite[];
  tasks: Task[];                       // dataset corrente (per anteprima + suggerimenti)
  rules: ManualRule[];
  locks: Record<string, boolean>;      // staffId -> aperto
  onChangeRules: (rules: ManualRule[]) => void;
  onChangeLocks: (locks: Record<string, boolean>) => void;
  onDistribute: () => void;
};

const C = {
  primary: 'oklch(0.78 0.155 215)', magenta: 'oklch(0.6 0.25 350)',
  navy: 'oklch(0.21 0.07 250)', border: 'oklch(0.91 0.018 245)',
};

export default function ManualAssignmentsModal(p: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  // valori distinti dal dataset per i suggerimenti
  const capValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.cap ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );
  const attValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.attivita ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );

  if (!p.open) return null;

  const pinnedStaffIds = new Set(p.rules.map((r) => r.staffId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'linear-gradient(rgba(8,16,32,.42),rgba(8,16,32,.42)), radial-gradient(circle at top left, oklch(0.78 0.13 215/.30), transparent 42%), radial-gradient(circle at top right, oklch(0.66 0.22 350/.22), transparent 44%), linear-gradient(180deg, oklch(0.22 0.06 250), oklch(0.13 0.05 250))' }}>
      <div className="flex h-[min(840px,93vh)] w-[min(1280px,95vw)] flex-col overflow-hidden rounded-[28px] bg-white"
        style={{ border: `1px solid color-mix(in oklch, ${C.primary} 35%, transparent)`, boxShadow: '0 28px 90px -36px rgba(6,18,40,.7)', fontFamily: 'Geist, Inter, system-ui, sans-serif' }}>
        <div className="flex items-center justify-between border-b px-7 py-5" style={{ borderColor: C.border }}>
          <div>
            <div className="flex items-center gap-2 text-[19px] font-semibold">
              <span style={{ color: C.primary }}>📌</span> Assegnazioni manuali
            </div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: 'oklch(0.5 0.04 245)' }}>
              {p.rules.length} regole · {pinnedStaffIds.size} operatori pinnati
            </div>
          </div>
          <button onClick={p.onClose} className="h-9 w-9 rounded-xl border" style={{ borderColor: C.border }}>✕</button>
        </div>

        <div className="flex-1 overflow-auto px-7 py-6">
          {/* Per il markup dettagliato di regole/lista/lucchetti e del wizard a step,
              replicare i mockup docs/superpowers/mockups/01-overview.html e 03-filtri.html.
              Logica minima funzionante qui sotto. */}
          <button onClick={() => setWizardOpen(true)}
            className="mb-4 rounded-2xl px-5 py-3 font-semibold"
            style={{ background: C.primary, color: 'oklch(0.16 0.06 245)', boxShadow: '0 0 16px oklch(0.78 0.13 215/.45)' }}>
            ＋ Nuova regola
          </button>

          {/* Lista regole */}
          <div className="space-y-3">
            {p.rules.map((r) => {
              const op = p.operators.find((o) => o.id === r.staffId);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: C.border }}>
                  <div>
                    <div className="font-semibold">{op?.name ?? r.staffId}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
                      {r.filtroOds.length > 0 && <span>🎯 {r.filtroOds.length} ODS</span>}
                      {r.filtroIndirizzo.length > 0 && <span>🏠 {r.filtroIndirizzo.length} indirizzo</span>}
                      {r.filtroCap.length > 0 && <span>📍 {r.filtroCap.join(', ')}</span>}
                      {r.filtroAttivita.length > 0 && <span>🔧 {r.filtroAttivita.join(', ')}</span>}
                      <span>{r.maxInterventi == null ? 'illimitato' : `max ${r.maxInterventi}`}</span>
                    </div>
                  </div>
                  <button onClick={() => p.onChangeRules(p.rules.filter((x) => x.id !== r.id))}
                    className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border }}>Elimina</button>
                </div>
              );
            })}
          </div>

          {/* Lista operatori + lucchetto */}
          <h3 className="mt-6 mb-2 text-[15px] font-semibold">Operatori · lucchetto</h3>
          <div className="space-y-2">
            {p.operators.map((o) => {
              const aperto = p.locks[o.id] !== false; // default aperto
              const pinned = pinnedStaffIds.has(o.id);
              return (
                <div key={o.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: C.border, opacity: pinned ? 1 : 0.6 }}>
                  <span className="text-[13.5px] font-semibold">{o.name}{pinned ? '' : ' · automatico'}</span>
                  {pinned && (
                    <button onClick={() => p.onChangeLocks({ ...p.locks, [o.id]: !aperto })}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={aperto
                        ? { background: 'oklch(0.74 0.21 145/.16)', color: 'oklch(0.52 0.21 145)' }
                        : { background: 'oklch(0.64 0.25 350/.16)', color: 'oklch(0.54 0.25 350)' }}>
                      {aperto ? '🔓 Aperto' : '🔒 Chiuso'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {wizardOpen && (
            <RuleWizard
              operators={p.operators}
              tasks={p.tasks}
              capValues={capValues}
              attValues={attValues}
              onCancel={() => setWizardOpen(false)}
              onCreate={(rule) => { p.onChangeRules([...p.rules, rule]); setWizardOpen(false); }}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t px-7 py-4" style={{ borderColor: C.border, background: 'oklch(0.96 0.012 245)' }}>
          <span className="text-[12.5px]" style={{ color: 'oklch(0.5 0.04 245)' }}>{p.rules.length} regole attive</span>
          <div className="flex gap-2.5">
            <button onClick={p.onClose} className="rounded-2xl px-5 py-2.5 text-sm font-semibold" style={{ color: 'oklch(0.5 0.04 245)' }}>Chiudi</button>
            <button onClick={p.onDistribute} className="rounded-2xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: C.primary, color: 'oklch(0.16 0.06 245)', boxShadow: '0 0 16px oklch(0.78 0.13 215/.45)' }}>⚙ Distribuisci</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungere il sotto-componente RuleWizard nello stesso file**

Appendere a `ManualAssignmentsModal.tsx` (genera `id` via `crypto.randomUUID()`):
```tsx
function chips(s: string): string[] {
  return s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
}

function RuleWizard(props: {
  operators: OperatorLite[]; tasks: Task[]; capValues: string[]; attValues: string[];
  onCancel: () => void; onCreate: (rule: ManualRule) => void;
}) {
  const [staffId, setStaffId] = useState('');
  const [ods, setOds] = useState(''); const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState(''); const [att, setAtt] = useState('');
  const [maxX, setMaxX] = useState('');

  const rule: ManualRule = {
    id: crypto.randomUUID(), staffId,
    filtroOds: chips(ods), filtroIndirizzo: chips(indirizzo),
    filtroCap: chips(cap), filtroAttivita: chips(att),
    maxInterventi: maxX.trim() ? Math.max(1, parseInt(maxX, 10) || 1) : null, ordine: 0,
  };
  const valid = staffId && (rule.filtroOds.length || rule.filtroIndirizzo.length || rule.filtroCap.length || rule.filtroAttivita.length);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
      <div className="w-[min(720px,94vw)] rounded-[24px] bg-white p-6" style={{ fontFamily: 'Geist, Inter, sans-serif' }}>
        <h3 className="mb-4 text-[16px] font-semibold">Nuova regola</h3>
        <label className="mb-1 block text-[13px] font-semibold">Operatore</label>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm">
          <option value="">— seleziona —</option>
          {props.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="mb-1 block text-[13px] font-semibold">🎯 ODS (separati da virgola)</label>
        <input value={ods} onChange={(e) => setOds(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm" placeholder="ODS-10231, ODS-10244" />
        <label className="mb-1 block text-[13px] font-semibold">🏠 Indirizzo (fallback ODS)</label>
        <input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm" placeholder="Via Roma 12, Frascati" />
        <label className="mb-1 block text-[13px] font-semibold">📍 CAP</label>
        <input value={cap} onChange={(e) => setCap(e.target.value)} className="mb-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="00044, 00045" />
        <div className="mb-3 text-[11px] text-neutral-500">Dal dataset: {props.capValues.slice(0, 8).join(' · ') || '—'}</div>
        <label className="mb-1 block text-[13px] font-semibold">🔧 Attività</label>
        <input value={att} onChange={(e) => setAtt(e.target.value)} className="mb-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="S-AI-051" />
        <div className="mb-3 text-[11px] text-neutral-500">Dal dataset: {props.attValues.slice(0, 8).join(' · ') || '—'}</div>
        <label className="mb-1 block text-[13px] font-semibold">Tetto X (max interventi, opzionale)</label>
        <input value={maxX} onChange={(e) => setMaxX(e.target.value)} type="number" min={1} className="mb-4 w-40 rounded-xl border px-3 py-2 text-sm" placeholder="30" />
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel} className="rounded-xl px-4 py-2 text-sm">Annulla</button>
          <button disabled={!valid} onClick={() => props.onCreate(rule)}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'oklch(0.78 0.155 215)', color: 'oklch(0.16 0.06 245)' }}>✓ Crea regola</button>
        </div>
      </div>
    </div>
  );
}
```
> Il wizard "a step" completo (4 step con barra di avanzamento + anteprima live + box fallback ambra) è descritto nei mockup; questa versione raccoglie gli stessi dati in un unico form ed è il punto di partenza. L'incremento a step multipli è una rifinitura UI successiva, non blocca la logica.

- [ ] **Step 3: Verifica build**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/modules/mappa/ManualAssignmentsModal.tsx
git commit -m "feat(mappa): modal Aurea + wizard regole assegnazione"
```

---

## Task 10: Integrazione nel MappaOperatoriClient (stato + pre-passaggio)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import + stato regole/lucchetti/modal**

In cima al file aggiungere agli import:
```ts
import { applyManualAssignments, type ManualRule } from '@/utils/routing/manualAssignments';
import ManualAssignmentsModal from './ManualAssignmentsModal';
```
Dentro il componente `MappaOperatoriClient` (dopo lo stato `selectedOps`, ~riga 656) aggiungere:
```ts
  const [manualRules, setManualRules] = useState<ManualRule[]>([]);
  const [operatorLocks, setOperatorLocks] = useState<Record<string, boolean>>({});
  const [assignModalOpen, setAssignModalOpen] = useState(false);
```

- [ ] **Step 2: Localizzare il punto di distribuzione**

Cercare nel file la chiamata esistente a `capacityDistributeWithUnassigned(` (la sua definizione è a riga 264; la **chiamata** è dentro il handler che costruisce `DistEntry[]` e chiama `setDistribution`). Identificare la riga, es.:
```ts
const { groups, unassigned } = capacityDistributeWithUnassigned(excelTasks, ops);
```
(dove `ops: OpConfig[]` è costruito da `selectedOps`).

- [ ] **Step 3: Inserire il pre-passaggio manuale prima della chiamata**

Sostituire quella riga con:
```ts
// PRE-PASSAGGIO: applica le regole manuali, poi K-means sul resto
const pre = applyManualAssignments(
  excelTasks,
  manualRules,
  ops.map((o) => ({ id: o.id, qty: o.qty })),
  operatorLocks,
);
if (pre.warnings.length) {
  setZtlConflicts((prev) => [...prev, ...pre.warnings.map((w) => w.message)]);
}
const poolOps: OpConfig[] = ops
  .filter((o) => !pre.closedStaffIds.includes(o.id))
  .map((o) => ({ ...o, qty: pre.pool.find((p) => p.id === o.id)?.qty ?? o.qty }));
const auto = capacityDistributeWithUnassigned(pre.remaining, poolOps);
const unassigned = auto.unassigned;
// fonde pinnati + automatici per ogni operatore (stesso indice di `ops`)
const groups: Task[][] = ops.map((o) => {
  const pinned = pre.assignedByStaff[o.id] ?? [];
  const poolIdx = poolOps.findIndex((po) => po.id === o.id);
  const autoTasks = poolIdx >= 0 ? (auto.groups[poolIdx] ?? []) : [];
  return [...pinned, ...autoTasks];
});
```
> Da qui in poi il codice esistente usa `groups` e `unassigned` come prima (costruzione di `DistEntry[]`, ottimizzazione rotta per operatore, `setDistribution(...)`). Nessuna altra modifica al merge necessaria.

- [ ] **Step 4: Montare il modal e il bottone di apertura**

Vicino agli altri bottoni della toolbar di pianificazione (es. accanto al pulsante che avvia la distribuzione) aggiungere:
```tsx
<button type="button" onClick={() => setAssignModalOpen(true)}
  className="rounded-xl border px-4 py-2 text-sm font-medium">
  📌 Assegnazioni manuali{manualRules.length ? ` (${manualRules.length})` : ''}
</button>
```
In fondo al JSX di ritorno del componente (prima della chiusura del fragment/div radice) aggiungere:
```tsx
<ManualAssignmentsModal
  open={assignModalOpen}
  onClose={() => setAssignModalOpen(false)}
  operators={selectedOps.map((o) => ({ id: o.id, name: o.name }))}
  tasks={excelTasks}
  rules={manualRules}
  locks={operatorLocks}
  onChangeRules={setManualRules}
  onChangeLocks={setOperatorLocks}
  onDistribute={() => { setAssignModalOpen(false); /* chiamare qui lo stesso handler di "Distribuisci" */ }}
/>
```
> Collegare `onDistribute` alla **stessa** funzione invocata dal pulsante "Distribuisci" esistente (quella che contiene il blocco modificato allo Step 3). Estrarla in una funzione nominata `runDistribution()` se è inline, e passarne il riferimento.

- [ ] **Step 5: Verifica build**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): pre-passaggio assegnazioni manuali nella distribuzione + modal"
```

---

## Task 11: Salvataggio e ricarica di regole/lucchetti col piano

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Includere regole/lucchetti nel payload di salvataggio**

Trovare la `fetch('/api/mappa/piani', { method: 'POST', ... })` (handler di salvataggio piano). Nel `body: JSON.stringify({ ... })` aggiungere due campi:
```ts
        regole: manualRules,
        lucchetti: operatorLocks,
```

- [ ] **Step 2: Ricaricare regole/lucchetti alla riapertura di un piano**

Dove il componente idrata uno stato da un piano salvato (effetto che usa `initialDistribution`/`initialPianoId`, ~riga 840-852), se i dati del piano includono `regole`/`lucchetti` (dal GET esteso in Task 7), idratare:
```ts
  // se disponibili dal piano caricato:
  // setManualRules((piano.regole ?? []).map(mapRegolaFromDb));
  // setOperatorLocks(Object.fromEntries((piano.lucchetti ?? []).map((l) => [l.staff_id, l.aperto])));
```
Aggiungere il mapper in cima al file:
```ts
function mapRegolaFromDb(r: any): ManualRule {
  return {
    id: r.id, staffId: r.staff_id,
    filtroOds: r.filtro_ods ?? [], filtroIndirizzo: r.filtro_indirizzo ?? [],
    filtroCap: r.filtro_cap ?? [], filtroAttivita: r.filtro_attivita ?? [],
    maxInterventi: r.max_interventi ?? null, ordine: r.ordine ?? 0,
  };
}
```
> Collegare le due righe commentate alla sorgente reale del piano caricato (la prop/fetch da cui arriva `initialDistribution`). Se il piano caricato non porta ancora `regole`/`lucchetti`, estendere quella sorgente per includerli dal GET.

- [ ] **Step 3: Verifica build + test completo**

Run: `npm test && npx tsc --noEmit`
Expected: test PASS, nessun errore TS.

- [ ] **Step 4: Verifica manuale nell'app**

Run: `npm run dev` → aprire `/hub/mappa` → "Pianificazione indirizzi" → caricare un Excel → aprire "📌 Assegnazioni manuali" → creare una regola (CAP presente nel dataset) → impostare lucchetto → "Distribuisci".
Expected: l'operatore pinnato riceve gli interventi del CAP; chiuso = solo quelli; salvando e riaprendo il piano, le regole ricompaiono.

- [ ] **Step 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): salvataggio/ricarica regole e lucchetti col piano"
```

---

## Self-review notes (per chi esegue)

- **Coerenza tipi:** `ManualRule` (camelCase) è la forma in TS; il DB usa snake_case; la mappatura è in `buildRuleRows`/`mapRegolaFromDb`. `applyManualAssignments` riceve `ops: {id,qty}[]` derivati da `OpConfig`.
- **Cascata:** garantita da `phaseOfRule` + iterazione `[0,1,2]` + `takenBy` (primo match vince); l'ordine intra-fase da `rule.ordine`.
- **Lucchetto per-operatore:** `operatorLocks[staffId] === false` ⇒ chiuso (fuori dal pool). Default assente ⇒ aperto.
- **ZTL invariata:** `getTaskZtl` continua a funzionare; gli avvisi manuali si accodano a `ztlConflicts` (riuso del canale avvisi esistente).
- **Punti da agganciare al codice reale** (Task 10 Step 2/4, Task 11 Step 1/2): la chiamata a `capacityDistributeWithUnassigned`, il pulsante "Distribuisci" e la fetch di salvataggio — individuati con grep, non modificano la firma delle funzioni esistenti.
