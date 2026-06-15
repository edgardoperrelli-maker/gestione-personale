# Centro di costo per-operatore + conteggio appuntamenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spostare il centro di costo dall'assegnazione all'operatore (default + override a periodo, auto-risolto e salvato sull'assegnazione) e mostrare il conteggio appuntamenti nell'header del giorno (calendario) al posto della striscia.

**Architecture:** `staff.cost_center` (default) + tabella `staff_cost_center_ranges` (override a periodo). Helper puro `resolveCostCenter`. I dialoghi assegnazione (che scrivono via `supabaseBrowser`) non chiedono più il cdc: lo risolvono client-side da operatore+data e lo salvano in `assignments.cost_center`. UI di gestione in Impostazioni → Personale. Fix 1: numero appuntamenti nell'header del `DayCell` calendario.

**Tech Stack:** Next.js 15, TypeScript, React, Supabase (supabaseBrowser nei dialoghi; supabaseAdmin/route nelle API personale), TailwindCSS, vitest.

**Riferimento spec:** `docs/superpowers/specs/2026-06-15-cdc-operatore-e-conteggio-appuntamenti-design.md`

**WORKTREE:** lavorare SOLO in `C:\Users\Edgardo\Desktop\gestione-personale-main\.claude\worktrees\cdc` (branch `feat/cdc-operatore`). Mai la dir principale. Verificare `git branch --show-current` == `feat/cdc-operatore` prima di ogni commit; stage solo i file nominati.

**Baseline rossa nota:** `npx tsc --noEmit` ha errori pre-esistenti (es. `playwright.config.ts`/`@playwright/test`). Gate = "nessun nuovo errore sui file del WP": dopo ogni task `npx tsc --noEmit 2>&1 | grep -iE "<file>" || echo OK`.

---

## Task 1: Migration — `staff.cost_center` + `staff_cost_center_ranges`

**Files:** Create `supabase/migrations/20260615000000_staff_cost_center.sql`

- [ ] **Step 1: Scrivi il file**
```sql
-- Centro di costo dell'operatore: default fisso + override a periodo.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS cost_center text NULL;

CREATE TABLE IF NOT EXISTS staff_cost_center_ranges (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    text NOT NULL,
  cost_center text NOT NULL,
  valid_from  date NOT NULL,
  valid_to    date NULL,                 -- NULL = a tempo indeterminato da valid_from
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_cc_ranges_staff ON staff_cost_center_ranges (staff_id);

ALTER TABLE staff_cost_center_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_policy" ON staff_cost_center_ranges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```
- [ ] **Step 2:** `ls supabase/migrations/20260615000000_staff_cost_center.sql` → esiste.
- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260615000000_staff_cost_center.sql
git commit -m "migration(cdc): staff.cost_center + tabella staff_cost_center_ranges"
```
> Lanciata in prod dall'utente.

---

## Task 2: Helper `lib/costCenter.ts` (TDD)

**Files:** Create `lib/costCenter.ts`, `lib/costCenter.test.ts`

- [ ] **Step 1: Test (falliscono)** — crea `lib/costCenter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveCostCenter, type CostCenterRange } from './costCenter';

const r = (cost_center: string, valid_from: string, valid_to: string | null): CostCenterRange =>
  ({ cost_center, valid_from, valid_to });

describe('resolveCostCenter', () => {
  it('nessun range → default', () => {
    expect(resolveCostCenter('PLENZICH', [], '2026-06-15')).toBe('PLENZICH');
  });
  it('range che copre la data → override', () => {
    expect(resolveCostCenter('PLENZICH', [r('ALESSANDRINI', '2026-06-10', '2026-06-20')], '2026-06-15')).toBe('ALESSANDRINI');
  });
  it('range fuori dalla data → default', () => {
    expect(resolveCostCenter('PLENZICH', [r('ALESSANDRINI', '2026-06-10', '2026-06-12')], '2026-06-15')).toBe('PLENZICH');
  });
  it('valid_to null = aperto → copre date successive', () => {
    expect(resolveCostCenter('PLENZICH', [r('MULTISERVIZI', '2026-06-01', null)], '2026-12-31')).toBe('MULTISERVIZI');
  });
  it('più range sovrapposti → vince il valid_from più recente', () => {
    const ranges = [r('ALESSANDRINI', '2026-06-01', '2026-06-30'), r('PASTORELLI', '2026-06-10', '2026-06-20')];
    expect(resolveCostCenter('PLENZICH', ranges, '2026-06-15')).toBe('PASTORELLI');
  });
  it('default null + nessun range → null', () => {
    expect(resolveCostCenter(null, [], '2026-06-15')).toBeNull();
  });
  it('confini inclusivi (valid_from e valid_to compresi)', () => {
    const ranges = [r('MULTISERVIZI', '2026-06-15', '2026-06-15')];
    expect(resolveCostCenter('PLENZICH', ranges, '2026-06-15')).toBe('MULTISERVIZI');
  });
});
```
- [ ] **Step 2:** `npx vitest run lib/costCenter.test.ts` → FAIL (modulo assente).
- [ ] **Step 3: Implementa** — crea `lib/costCenter.ts`:
```ts
export type CostCenterRange = {
  cost_center: string;
  valid_from: string;        // YYYY-MM-DD
  valid_to: string | null;   // YYYY-MM-DD oppure null (aperto)
};

/** Copertura inclusiva di una data da parte di un range. */
function covers(range: CostCenterRange, isoDate: string): boolean {
  if (range.valid_from > isoDate) return false;
  if (range.valid_to != null && isoDate > range.valid_to) return false;
  return true;
}

/**
 * Centro di costo attivo per una data: l'override di periodo che copre la data
 * (se più d'uno, vince il valid_from più recente; poi il valid_to più recente),
 * altrimenti il default dell'operatore.
 */
export function resolveCostCenter(
  defaultCostCenter: string | null,
  ranges: CostCenterRange[],
  isoDate: string
): string | null {
  const covering = ranges.filter((rg) => covers(rg, isoDate));
  if (covering.length === 0) return defaultCostCenter;
  covering.sort((a, b) => {
    if (a.valid_from !== b.valid_from) return a.valid_from < b.valid_from ? 1 : -1; // from più recente prima
    const at = a.valid_to ?? '9999-12-31';
    const bt = b.valid_to ?? '9999-12-31';
    return at < bt ? 1 : at > bt ? -1 : 0;
  });
  return covering[0].cost_center;
}
```
- [ ] **Step 4:** `npx vitest run lib/costCenter.test.ts` → PASS (7 verdi).
- [ ] **Step 5: Commit**
```bash
git add lib/costCenter.ts lib/costCenter.test.ts
git commit -m "feat(cdc): helper resolveCostCenter (test verdi)"
```

---

## Task 3: `types.ts` — campo `cost_center` su Staff

**Files:** Modify `types.ts`

- [ ] **Step 1:** In `types.ts`, nel type `Staff` (inizia a riga 1), aggiungere dopo `home_territory_id?: string | null;`:
```ts
  cost_center?: string | null;
```
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -iE "types.ts" || echo OK`
- [ ] **Step 3: Commit**
```bash
git add types.ts
git commit -m "feat(cdc): campo cost_center su tipo Staff"
```

---

## Task 4: Componente condiviso `CostCenterRangesEditor`

**Files:** Create `components/impostazioni/CostCenterRangesEditor.tsx`

- [ ] **Step 1: Crea il componente**
```tsx
'use client';

import { COST_CENTERS } from '@/constants/cost-centers';
import type { CostCenterRange } from '@/lib/costCenter';

export default function CostCenterRangesEditor({
  value,
  onChange,
  disabled,
}: {
  value: CostCenterRange[];
  onChange: (ranges: CostCenterRange[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<CostCenterRange>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () =>
    onChange([...value, { cost_center: COST_CENTERS[0], valid_from: '', valid_to: null }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_130px_auto] items-end gap-2">
          <select
            value={r.cost_center}
            disabled={disabled}
            onChange={(e) => update(i, { cost_center: e.target.value })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          >
            {COST_CENTERS.map((cc) => (
              <option key={cc} value={cc}>{cc}</option>
            ))}
          </select>
          <input
            type="date"
            title="Dal"
            value={r.valid_from}
            disabled={disabled}
            onChange={(e) => update(i, { valid_from: e.target.value })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            title="Al (opzionale)"
            value={r.valid_to ?? ''}
            disabled={disabled}
            onChange={(e) => update(i, { valid_to: e.target.value || null })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(i)}
            className="rounded-lg border border-[var(--brand-border)] px-2 py-1.5 text-sm text-[var(--danger)]"
            aria-label="Rimuovi periodo"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-surface-muted)]"
      >
        + Aggiungi periodo
      </button>
    </div>
  );
}
```
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -iE "CostCenterRangesEditor" || echo OK`
- [ ] **Step 3: Commit**
```bash
git add components/impostazioni/CostCenterRangesEditor.tsx
git commit -m "feat(cdc): CostCenterRangesEditor (lista periodi cdc riusabile)"
```

---

## Task 5: API personale — accetta `costCenter` + `costCenterRanges`

**Files:** Modify `app/api/admin/personale/route.ts`

- [ ] **Step 1: Import + helper di validazione cdc**
In cima al file (dopo gli import esistenti), aggiungere:
```ts
import { COST_CENTERS } from '@/constants/cost-centers';
```
Dopo `normalizeNullableNumber` aggiungere:
```ts
function normalizeCostCenter(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return (COST_CENTERS as string[]).includes(v) ? v : '__invalid__';
}

type RangeInput = { cost_center?: unknown; valid_from?: unknown; valid_to?: unknown };
function normalizeRanges(input: unknown): { ok: true; rows: { cost_center: string; valid_from: string; valid_to: string | null }[] } | { ok: false } {
  if (input === undefined) return { ok: true, rows: [] };
  if (!Array.isArray(input)) return { ok: false };
  const rows: { cost_center: string; valid_from: string; valid_to: string | null }[] = [];
  for (const raw of input as RangeInput[]) {
    const cc = String(raw?.cost_center ?? '').trim();
    const from = String(raw?.valid_from ?? '').trim();
    const to = String(raw?.valid_to ?? '').trim();
    if (!(COST_CENTERS as string[]).includes(cc)) return { ok: false };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false };
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false };
    if (to && from > to) return { ok: false };
    rows.push({ cost_center: cc, valid_from: from, valid_to: to || null });
  }
  return { ok: true, rows };
}
```
- [ ] **Step 2: PATCH — gestisci cost_center + ranges**
Nel body type del PATCH aggiungere `costCenter?: string | null;` e `costCenterRanges?: unknown;`.
Dopo il calcolo di `patch` (prima dell'update), validare e aggiungere `cost_center` al `patch`:
```ts
  const cc = normalizeCostCenter(body.costCenter);
  if (cc === '__invalid__') {
    return NextResponse.json({ error: 'Centro di costo non valido.' }, { status: 400 });
  }
  const rangesRes = normalizeRanges(body.costCenterRanges);
  if (!rangesRes.ok) {
    return NextResponse.json({ error: 'Periodi centro di costo non validi.' }, { status: 400 });
  }
```
Aggiungere `cost_center: cc,` dentro l'oggetto `patch`. Aggiungere `cost_center` alla `.select(...)` dell'update (entrambe le occorrenze nel file).
DOPO l'update dello staff andato a buon fine (dopo `if (error) {...}`), sostituire i ranges (replace) SOLO se `body.costCenterRanges !== undefined`:
```ts
  if (body.costCenterRanges !== undefined) {
    await supabaseAdmin.from('staff_cost_center_ranges').delete().eq('staff_id', id);
    if (rangesRes.rows.length > 0) {
      await supabaseAdmin.from('staff_cost_center_ranges').insert(
        rangesRes.rows.map((r) => ({ staff_id: id, cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to }))
      );
    }
  }
```
- [ ] **Step 3: POST — stessa cosa per la creazione**
Nel body type del POST aggiungere `costCenter?: string | null;` e `costCenterRanges?: unknown;`.
Validare `cc`/`rangesRes` come sopra (riusa le stesse funzioni). Aggiungere `cost_center: cc` all'`insert` dello staff e `cost_center` alla `.select(...)`. Dopo l'insert riuscito, usando l'`id` del nuovo staff (`data.id`), inserire i ranges:
```ts
  if (rangesRes.rows.length > 0) {
    await supabaseAdmin.from('staff_cost_center_ranges').insert(
      rangesRes.rows.map((r) => ({ staff_id: data.id, cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to }))
    );
  }
```
- [ ] **Step 4:** `npx tsc --noEmit 2>&1 | grep -iE "personale/route" || echo OK`
- [ ] **Step 5: Commit**
```bash
git add app/api/admin/personale/route.ts
git commit -m "feat(cdc): API personale accetta costCenter + costCenterRanges (replace)"
```

---

## Task 6: Pagina Personale — carica cost_center + ranges

**Files:** Modify `app/impostazioni/personale/page.tsx`, `app/impostazioni/personale/PersonaleClient.tsx`

- [ ] **Step 1: page.tsx — aggiungi cost_center al select staff e carica i ranges**
Nel `select('id, display_name, ... home_territory_id')` aggiungere `, cost_center`.
Aggiungere alla `Promise.all` una terza query:
```ts
    supabase.from('staff_cost_center_ranges').select('id, staff_id, cost_center, valid_from, valid_to'),
```
Costruire la mappa e passarla:
```ts
  const rangesByStaff: Record<string, { cost_center: string; valid_from: string; valid_to: string | null }[]> = {};
  for (const r of (ranges ?? []) as { staff_id: string; cost_center: string; valid_from: string; valid_to: string | null }[]) {
    (rangesByStaff[r.staff_id] ??= []).push({ cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to });
  }
```
(destrutturare `ranges` dalla Promise.all) e passare `initialRanges={rangesByStaff}` a `<PersonaleClient />`.

- [ ] **Step 2: PersonaleClient — props + stato ranges + UI**
Aggiungere import:
```tsx
import CostCenterRangesEditor from '@/components/impostazioni/CostCenterRangesEditor';
import { COST_CENTERS } from '@/constants/cost-centers';
import type { CostCenterRange } from '@/lib/costCenter';
```
Estendere `Props`:
```tsx
type Props = {
  initialStaff: Staff[];
  territories: Territory[];
  initialRanges: Record<string, CostCenterRange[]>;
};
```
Nel componente, aggiungere stato per i ranges:
```tsx
  const [rangesByStaff, setRangesByStaff] = useState<Record<string, CostCenterRange[]>>(initialRanges);
```
Nel form espanso del singolo operatore (dentro `{isExpanded && (...)}`, vicino al territorio), aggiungere:
```tsx
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Centro di costo (predefinito)
                    </label>
                    <select
                      value={row.cost_center ?? ''}
                      onChange={(e) => updateRow(row.id, { cost_center: e.target.value || null })}
                      className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                    >
                      <option value="">— Nessuno —</option>
                      {COST_CENTERS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                    </select>
                  </div>
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Centri di costo a periodo (override)
                    </label>
                    <CostCenterRangesEditor
                      value={rangesByStaff[row.id] ?? []}
                      onChange={(r) => setRangesByStaff((prev) => ({ ...prev, [row.id]: r }))}
                    />
                  </div>
```
Nel `handleSave`, nel body del PATCH aggiungere:
```tsx
          costCenter: row.cost_center ?? null,
          costCenterRanges: rangesByStaff[row.id] ?? [],
```
- [ ] **Step 3:** `npx tsc --noEmit 2>&1 | grep -iE "personale" || echo OK`
- [ ] **Step 4: Commit**
```bash
git add app/impostazioni/personale/page.tsx app/impostazioni/personale/PersonaleClient.tsx
git commit -m "feat(cdc): Personale - default cdc + editor periodi per operatore"
```

---

## Task 7: NewOperatorModal — default cdc + periodi alla creazione

**Files:** Modify `app/impostazioni/personale/NewOperatorModal.tsx`

- [ ] **Step 1: Import + stato**
Aggiungere import:
```tsx
import CostCenterRangesEditor from '@/components/impostazioni/CostCenterRangesEditor';
import { COST_CENTERS } from '@/constants/cost-centers';
import type { CostCenterRange } from '@/lib/costCenter';
```
Aggiungere stato (dopo `homeCity`):
```tsx
  const [costCenter, setCostCenter] = useState<string>('');
  const [costCenterRanges, setCostCenterRanges] = useState<CostCenterRange[]>([]);
```
- [ ] **Step 2: UI** — dopo il blocco "Territorio di residenza operativa" (prima di "Magazzino"), aggiungere:
```tsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Centro di costo (predefinito)
            </label>
            <select
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            >
              <option value="">— Nessuno —</option>
              {COST_CENTERS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Centri di costo a periodo (override)
            </label>
            <CostCenterRangesEditor value={costCenterRanges} onChange={setCostCenterRanges} />
          </div>
```
- [ ] **Step 3: payload** — nel `body` del POST aggiungere:
```tsx
        costCenter: costCenter || null,
        costCenterRanges,
```
- [ ] **Step 4:** `npx tsc --noEmit 2>&1 | grep -iE "NewOperatorModal" || echo OK`
- [ ] **Step 5: Commit**
```bash
git add app/impostazioni/personale/NewOperatorModal.tsx
git commit -m "feat(cdc): NewOperatorModal - default cdc + periodi alla creazione"
```

---

## Task 8: Cronoprogramma — carica cost_center + ranges e passali ai dialoghi

**Files:** Modify `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`

- [ ] **Step 1: cost_center nello staff select**
Nel caricamento `staff` (la query `sb.from('staff').select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng')`) aggiungere `, cost_center` al select. (Lo stato `staff` è già `Staff[]`; il campo è ora nel tipo da Task 3.)
- [ ] **Step 2: stato + fetch ranges**
Aggiungere import:
```tsx
import type { CostCenterRange } from '@/lib/costCenter';
```
Aggiungere stato (vicino agli altri):
```tsx
  const [costCenterRangesByStaff, setCostCenterRangesByStaff] = useState<Record<string, CostCenterRange[]>>({});
```
In un `useEffect` di bootstrap (vicino a dove carica staff/activities/territories), aggiungere il fetch dei ranges:
```tsx
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb.from('staff_cost_center_ranges').select('staff_id, cost_center, valid_from, valid_to');
      if (!alive || !data) return;
      const m: Record<string, CostCenterRange[]> = {};
      for (const r of data as { staff_id: string; cost_center: string; valid_from: string; valid_to: string | null }[]) {
        (m[r.staff_id] ??= []).push({ cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to });
      }
      setCostCenterRangesByStaff(m);
    })();
    return () => { alive = false; };
  }, [sb]);
```
  NON passare ancora la prop ai dialoghi: lo fanno i task 9 e 10 (insieme alla prop sul dialogo), per non creare un typecheck rosso intermedio.
- [ ] **Step 4:** `npx tsc --noEmit 2>&1 | grep -iE "CronoprogrammaWorkspace" || echo OK` (lo stato `costCenterRangesByStaff` risulta non ancora usato: è atteso, lo consuma il task 9; se il tsconfig non segnala unused locals, è OK).
- [ ] **Step 5: Commit**
```bash
git add components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat(cdc): cronoprogramma carica cost_center + ranges operatori"
```

---

## Task 9: NewAssignmentDialog — niente più campo cdc, risolto da operatore+data

**Files:** Modify `components/NewAssignmentDialog.tsx`

- [ ] **Step 1: Import + prop**
Aggiungere:
```tsx
import { resolveCostCenter, type CostCenterRange } from '@/lib/costCenter';
```
Estendere i props con `costCenterRangesByStaff: Record<string, CostCenterRange[]>;` e destrutturarlo.
- [ ] **Step 2: Rimuovi stato/validazione cdc**
Rimuovere `const [costCenter, setCostCenter] = useState<CostCenter | ''>('');`. Rimuovere `costCenter` dalle dipendenze dell'`useEffect` che resetta `err`. Cambiare `const canSave = !!staffId && !!costCenter && !saving;` in `const canSave = !!staffId && !saving;`. Rimuovere l'import di `CostCenter`/`COST_CENTERS` se non più usati (TypeScript segnalerà).
- [ ] **Step 3: Risolvi il cdc per giorno in createOne**
`createOne` deve conoscere l'iso del giorno target. Cambiare la firma in `createOne(targetDayId: string, isoForDay: string)`. Nei due punti di chiamata passare l'iso: nel caso non-range `await createOne(dayId, iso)`; nel loop range `await createOne(targetDayId, isoX)`.
Dentro `createOne`, prima dell'insert, calcolare:
```tsx
    const def = staffList.find((s) => s.id === staffId)?.cost_center ?? null;
    const ranges = costCenterRangesByStaff[staffId] ?? [];
    const cc = resolveCostCenter(def, ranges, isoForDay);
```
Sostituire `cost_center: costCenter as CostCenter,` con `cost_center: cc,` nell'insert, e nel ritorno sostituire `cost_center: (costCenter as string).trim() as CostCenter,` con `cost_center: cc,`.
- [ ] **Step 4: Rimuovi la `<label>` del Centro di costo**
Eliminare il blocco JSX `<label>...Centro di costo *...</label>` (il select COST_CENTERS).
- [ ] **Step 5: Passa la prop dal workspace**
In `CronoprogrammaWorkspace.tsx`, al `<NewAssignmentDialog ... />` aggiungere `costCenterRangesByStaff={costCenterRangesByStaff}`.
- [ ] **Step 6:** `npx tsc --noEmit 2>&1 | grep -iE "NewAssignmentDialog|CronoprogrammaWorkspace" || echo OK`
- [ ] **Step 7: Commit**
```bash
git add components/NewAssignmentDialog.tsx components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat(cdc): NewAssignmentDialog risolve il cdc da operatore+data (no campo)"
```

---

## Task 10: EditAssignmentDialog — niente più campo cdc, risolto da operatore+data

**Files:** Modify `components/EditAssignmentDialog.tsx`

- [ ] **Step 1: Import + prop**
Aggiungere `import { resolveCostCenter, type CostCenterRange } from '@/lib/costCenter';` (rimuovere l'import `COST_CENTERS` se inutilizzato). Estendere i props con `costCenterRangesByStaff: Record<string, CostCenterRange[]>;` e destrutturarlo.
- [ ] **Step 2: Rimuovi stato/validazione cdc**
Rimuovere `const [costCenter, setCostCenter] = useState<string>(assignment.cost_center ?? '');` e l'`useEffect` `setCostCenter(...)`. Rimuovere `costCenter` dalle deps dell'`useEffect` reset err. Cambiare `const canSave = !!staffId && !!costCenter && !saving;` in `const canSave = !!staffId && !saving;`.
- [ ] **Step 3: Risolvi il cdc al salvataggio**
In `save()`, prima dell'`update`, calcolare:
```tsx
    const def = staffList.find((s) => s.id === staffId)?.cost_center ?? null;
    const ranges = costCenterRangesByStaff[staffId] ?? [];
    const cc = resolveCostCenter(def, ranges, iso);
```
Sostituire `cost_center: costCenter || null,` con `cost_center: cc,` nell'update.
- [ ] **Step 4: Rimuovi la `<label>` del Centro di costo** (il blocco select COST_CENTERS).
- [ ] **Step 5: Passa la prop dal workspace**
In `CronoprogrammaWorkspace.tsx`, al `<EditAssignmentDialog ... />` aggiungere `costCenterRangesByStaff={costCenterRangesByStaff}`.
- [ ] **Step 6:** `npx tsc --noEmit 2>&1 | grep -iE "EditAssignmentDialog|CronoprogrammaWorkspace" || echo OK` (ora le prop dei dialoghi combaciano e `costCenterRangesByStaff` è usato).
- [ ] **Step 7: Commit**
```bash
git add components/EditAssignmentDialog.tsx components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat(cdc): EditAssignmentDialog risolve il cdc da operatore+data (no campo)"
```

---

## Task 11: FIX 1 — conteggio appuntamenti nell'header del giorno (calendario)

**Files:** Modify `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`, `components/modules/cronoprogramma-personale/CronoCalendarView.tsx`; Delete `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`

- [ ] **Step 1: Workspace — rimuovi la striscia, calcola la mappa conteggi**
Rimuovere l'import `AppointmentCountStrip` e il blocco JSX `<motion.div ...><AppointmentCountStrip .../></motion.div>`.
Aggiungere import `import { countAppointmentsByDay } from '@/lib/appuntamenti';` (se non già presente) e calcolare:
```tsx
  const appointmentCountByIso = useMemo(
    () => countAppointmentsByDay(appointments, daysArray.map(fmtDay)),
    [appointments, daysArray]
  );
```
Passare al `<CronoCalendarView ... appointmentCountByIso={appointmentCountByIso} />`.
- [ ] **Step 2: CronoCalendarView — propaga la prop**
Aggiungere alla firma di `CronoCalendarView` (type + destrutturazione) `appointmentCountByIso?: Record<string, number>;` e passarla a `<DayCell ... appointmentCountByIso={appointmentCountByIso} />`. Aggiungere lo stesso campo al type dei props di `DayCell`.
- [ ] **Step 3: DayCell — render "N App." tra A-Z e Nuovo**
Nell'header del `DayCell`, individuare il gruppo a sinistra che contiene il bottone "A-Z" (`props.setSortMode('AZ')`) e il gruppo a destra col bottone "Nuovo" (`onAdd(d)`). Inserire, subito DOPO il bottone "A-Z" (dentro lo stesso flex di sinistra), questo:
```tsx
          {(() => {
            const n = props.appointmentCountByIso?.[iso] ?? 0;
            if (n <= 0) return null;
            return (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-primary)' }} title={`${n} appuntamenti`}>
                {n} App.
              </span>
            );
          })()}
```
(`iso` è già calcolato in `DayCell`; `appointmentCountByIso` va aggiunto alla destrutturazione o letto via `props.`.)
- [ ] **Step 4: Cancella il componente striscia**
```bash
git rm components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx
```
- [ ] **Step 5:** `npx tsc --noEmit 2>&1 | grep -iE "CronoCalendarView|CronoprogrammaWorkspace|AppointmentCountStrip" || echo OK` (nessun residuo riferimento a AppointmentCountStrip).
- [ ] **Step 6: Commit**
```bash
git add components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx components/modules/cronoprogramma-personale/CronoCalendarView.tsx
git commit -m "fix(appuntamenti): conteggio 'N App.' nell'header del giorno (rimossa striscia)"
```

---

## Task 12: Script seed cdc (consegna manuale)

**Files:** Create `docs/superpowers/sql/2026-06-15-seed-cost-center.sql`

- [ ] **Step 1: Scrivi lo script**
```sql
-- SEED: imposta staff.cost_center col centro di costo più frequente nello storico assegnazioni.
-- Lanciare UNA VOLTA, dopo la migration tabella. Non sovrascrive i default già impostati.
UPDATE staff s
SET cost_center = sub.cc
FROM (
  SELECT staff_id, cc FROM (
    SELECT staff_id, cost_center AS cc,
           row_number() OVER (PARTITION BY staff_id ORDER BY count(*) DESC) AS rn
    FROM assignments
    WHERE cost_center IS NOT NULL
    GROUP BY staff_id, cost_center
  ) ranked
  WHERE rn = 1
) sub
WHERE s.id = sub.staff_id::text AND s.cost_center IS NULL;
```
- [ ] **Step 2: Commit**
```bash
git add docs/superpowers/sql/2026-06-15-seed-cost-center.sql
git commit -m "docs(cdc): script seed cost_center dallo storico (consegna manuale)"
```
> NON eseguire. Consegna all'utente; verificare prima il tipo di `assignments.staff_id` vs `staff.id`.

---

## Task 13: Verifica finale

- [ ] **Step 1:** `npx vitest run lib/costCenter.test.ts lib/appuntamenti.test.ts` → tutti verdi.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -iE "costCenter|cost-center|personale|AssignmentDialog|Cronoprogramma|CronoCalendarView|appuntamenti" || echo OK-no-nuovi-errori`
- [ ] **Step 3:** `npm run build` → l'app compila; un eventuale Failed solo su baseline (`@playwright/test`), non sui file del WP.
- [ ] **Step 4: Smoke (dopo migration + deploy)**
  1. Impostazioni → Personale: a un operatore imposta cdc predefinito + un periodo override; Salva.
  2. Cronoprogramma → "+ Nuovo" su un giorno dentro il periodo override per quell'operatore: il campo cdc NON c'è più; salva; in Tabella/Export il cdc è quello dell'override. Su un giorno fuori dal periodo → cdc = default.
  3. Calendario: l'header del giorno mostra "N App." in celeste tra A-Z e Nuovo solo se ci sono appuntamenti; nessuna striscia/data doppia.
- [ ] **Step 5:** `git status` → pulito.

---

## Prossimo Passo
Tutti i task completati → **finishing-a-development-branch** (ff/rebase su origin/main + push + cleanup worktree). Consegna SQL all'utente: (a) migration `20260615000000_staff_cost_center.sql`, (b) seed `2026-06-15-seed-cost-center.sql`.
