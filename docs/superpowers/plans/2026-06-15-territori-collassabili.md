# Intestazioni territorio collassabili — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella vista Calendario del cronoprogramma, rendere le bande-intestazione di territorio collassabili (globale per `territory.id`, stato salvato in localStorage).

**Architecture:** Helper puro `lib/cronoCollapse.ts` per load/save da localStorage; `CronoCalendarView` tiene un `Set<string>` di territori chiusi e un toggle, passati a `DayCell`, che rende la banda territorio un bottone e nasconde le card quando chiuso.

**Tech Stack:** Next.js 15, React, TypeScript, TailwindCSS, vitest.

**Riferimento spec:** `docs/superpowers/specs/2026-06-15-territori-collassabili-design.md`

**WORKTREE:** lavorare SOLO in `C:\Users\Edgardo\Desktop\gestione-personale-main\.claude\worktrees\collassa` (branch `feat/territori-collassabili`). Mai la dir principale. Verificare `git branch --show-current` == `feat/territori-collassabili` prima di ogni commit; stage solo i file nominati.

**Baseline rossa nota:** `npx tsc --noEmit` ha errori pre-esistenti (es. `playwright.config.ts`). Gate = nessun nuovo errore sui file del WP.

---

## Task 1: Helper `lib/cronoCollapse.ts` (TDD)

**Files:** Create `lib/cronoCollapse.ts`, `lib/cronoCollapse.test.ts`

- [ ] **Step 1: Test (falliscono)** — crea `lib/cronoCollapse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCollapsed } from './cronoCollapse';

describe('parseCollapsed', () => {
  it('null → []', () => expect(parseCollapsed(null)).toEqual([]));
  it('JSON malformato → []', () => expect(parseCollapsed('{bad')).toEqual([]));
  it('oggetto non-array → []', () => expect(parseCollapsed('{"a":1}')).toEqual([]));
  it('array valido → stesso', () => expect(parseCollapsed('["a","b"]')).toEqual(['a', 'b']));
  it('array misto → solo stringhe', () => expect(parseCollapsed('["a",1,null,"b"]')).toEqual(['a', 'b']));
});
```

- [ ] **Step 2:** `npx vitest run lib/cronoCollapse.test.ts` → FAIL (modulo assente).

- [ ] **Step 3: Implementa** — crea `lib/cronoCollapse.ts`:
```ts
const KEY = 'crono:collapsedTerritori';

/** Parsing puro e robusto del valore localStorage → array di chiavi territorio. */
export function parseCollapsed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function loadCollapsed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseCollapsed(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveCollapsed(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* ignora errori quota/privacy */
  }
}
```

- [ ] **Step 4:** `npx vitest run lib/cronoCollapse.test.ts` → PASS (5 verdi).

- [ ] **Step 5: Commit**
```bash
git add lib/cronoCollapse.ts lib/cronoCollapse.test.ts
git commit -m "feat(crono): helper cronoCollapse (load/save territori chiusi, test verdi)"
```

---

## Task 2: CronoCalendarView — stato collasso + banda territorio cliccabile

**Files:** Modify `components/modules/cronoprogramma-personale/CronoCalendarView.tsx`

- [ ] **Step 1: Import**
- Cambiare `import { type DragEvent, useMemo } from 'react';` in `import { type DragEvent, useMemo, useState } from 'react';`.
- Aggiungere: `import { loadCollapsed, saveCollapsed } from '@/lib/cronoCollapse';`.

- [ ] **Step 2: Props type — aggiungi i due campi a CronoCalendarView e DayCell**
Nel type dei props del componente esterno `CronoCalendarView` (il blocco `}: { ... }`), aggiungere:
```tsx
  collapsedTerritori?: Set<string>;
  onToggleTerritorio?: (key: string) => void;
```
E aggiungere gli STESSI due campi al type dei props di `DayCell` (la funzione `function DayCell(props: { ... })`).

- [ ] **Step 3: Stato + toggle nel componente**
Subito dopo `const dayMap = useMemo(() => indexDays(days), [days]);` aggiungere:
```tsx
  const [collapsedTerritori, setCollapsedTerritori] = useState<Set<string>>(() => new Set(loadCollapsed()));
  const toggleTerritorio = (key: string) =>
    setCollapsedTerritori((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed([...next]);
      return next;
    });
```

- [ ] **Step 4: Passa a DayCell**
Nel `<DayCell ... />` (dentro `weeks.map`), aggiungere:
```tsx
              collapsedTerritori={collapsedTerritori}
              onToggleTerritorio={toggleTerritorio}
```

- [ ] **Step 5: DayCell — banda territorio → bottone + collasso**
Nel ramo `sortMode === 'TERRITORIO' || 'PER_TERRITORIO'`, sostituire l'intera `return groups.map((g) => { ... });` con:
```tsx
              return groups.map((g) => {
                const s = getTerritoryStyle(g.terrName || null);
                const key = g.terrId ?? '__none__';
                const collapsed = props.collapsedTerritori?.has(key) ?? false;
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => props.onToggleTerritorio?.(key)}
                      className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left"
                      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                      title={collapsed ? 'Espandi territorio' : 'Comprimi territorio'}
                    >
                      <span className="text-[9px] leading-none" style={{ color: s.text }}>{collapsed ? '▸' : '▾'}</span>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.band }} />
                      <span className="truncate text-[9px] font-semibold uppercase tracking-wide" style={{ color: s.text }}>
                        {g.terrName || 'Senza territorio'}{collapsed ? ` (${g.items.length})` : ''}
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="space-y-1">
                        {g.items.map((a) => (
                          <div
                            key={a.id}
                            draggable
                            className="cursor-grab active:cursor-grabbing"
                            onDragStart={(e) =>
                              writeAssignmentDragData(e.dataTransfer, {
                                id: a.id,
                                fromDay: iso,
                                fromTerritoryId: a.territory?.id ?? null,
                              })
                            }
                          >
                            <OperatorCard a={a} onDelete={() => onDelete(a)} onEdit={onEdit} taskCount={taskCountMap?.[`${a.staff?.id}|${iso}`]} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
```
(È identico all'originale tranne: chiave `key`, `collapsed`, banda → `<button>` con chevron + `(n)` se chiuso, e il blocco card avvolto in `{!collapsed && (...)}`. `iso`, `onDelete`, `onEdit`, `taskCountMap`, `writeAssignmentDragData`, `OperatorCard`, `getTerritoryStyle` sono già in scope nel DayCell.)

- [ ] **Step 6: Typecheck**
`npx tsc --noEmit 2>&1 | grep -iE "CronoCalendarView" || echo OK-no-nuovi-errori`

- [ ] **Step 7: Commit**
```bash
git add components/modules/cronoprogramma-personale/CronoCalendarView.tsx
git commit -m "feat(crono): bande territorio collassabili nella vista Calendario (globale + localStorage)"
```

---

## Task 3: Verifica finale

- [ ] **Step 1:** `npx vitest run lib/cronoCollapse.test.ts` → 5 verdi.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -iE "cronoCollapse|CronoCalendarView" || echo OK-no-nuovi-errori`
- [ ] **Step 3:** `npm run build` → l'app compila; eventuale Failed solo su baseline (`@playwright/test`), non sui file del WP.
- [ ] **Step 4: Smoke (dopo deploy)**
  1. Cronoprogramma → vista **Calendario**, ordinamento **Territorio**.
  2. Click su una banda territorio (es. PERUGIA) → si chiude in **tutti i giorni**, mostra `▸ PERUGIA (n)`; le card spariscono.
  3. Ri-click → si riapre (`▾ PERUGIA` + card).
  4. Ricarica la pagina → il territorio resta chiuso (localStorage).
  5. Altre viste (griglia/split/tabella) e ordinamento A-Z invariati.
- [ ] **Step 5:** `git status` → pulito.

---

## Prossimo Passo
Tutti i task completati → **finishing-a-development-branch** (ff/rebase su origin/main + push + cleanup worktree). Nessuna SQL.
