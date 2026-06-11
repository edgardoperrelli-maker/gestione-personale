# DatePicker a tema (calendario pagina Mappa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire i due `<input type="date">` nativi della pagina Mappa con un calendario a popover, custom e coerente col tema Aurea.

**Architecture:** Helper di data puri e testabili in `components/ui/datePickerUtils.ts`; un client component `components/ui/DatePicker.tsx` che usa quegli helper e rende trigger+popover con le CSS var del tema; integrazione in `MappaOperatoriClient.tsx` sostituendo i due input nativi mantenendo identica la logica `value`/`onChange`/`disabled`.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Tailwind v4 (CSS var oklch), vitest (env `node`, test `*.test.ts`).

---

## File Structure

- **Create** `components/ui/datePickerUtils.ts` — funzioni pure: `parseIso`, `toIso`, `formatDisplay`, `buildMonthGrid`, `monthLabel`, costanti `MONTH_NAMES_IT`/`WEEKDAY_LABELS_IT`. Nessun import, nessun React/DOM.
- **Create** `components/ui/datePickerUtils.test.ts` — unit test vitest sugli helper.
- **Create** `components/ui/DatePicker.tsx` — client component (trigger + popover). Importa solo gli helper.
- **Modify** `components/modules/mappa/MappaOperatoriClient.tsx` — import del componente + sostituzione dei due `<input type="date">` (modale `setupModalDate`, toolbar `planningDate`).

Convenzioni: mese passato agli helper è **1–12** (non 0–11). Tutte le date ISO sono `YYYY-MM-DD`. Griglia **lunedì-first**.

---

## Task 1: Helper di data puri (TDD)

**Files:**
- Create: `components/ui/datePickerUtils.ts`
- Test: `components/ui/datePickerUtils.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`components/ui/datePickerUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseIso,
  toIso,
  formatDisplay,
  buildMonthGrid,
  monthLabel,
  WEEKDAY_LABELS_IT,
} from './datePickerUtils';

describe('parseIso', () => {
  it('parsa una data ISO canonica', () => {
    expect(parseIso('2026-06-11')).toEqual({ y: 2026, m: 6, d: 11 });
  });
  it('ritorna null su vuoto o formato errato', () => {
    expect(parseIso('')).toBeNull();
    expect(parseIso('11/06/2026')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('2026-06-32')).toBeNull();
  });
});

describe('toIso', () => {
  it('formatta con zero-padding', () => {
    expect(toIso(2026, 6, 1)).toBe('2026-06-01');
    expect(toIso(2026, 12, 25)).toBe('2026-12-25');
  });
});

describe('parseIso/toIso round-trip (no shift fuso)', () => {
  it('mantiene lo stesso giorno', () => {
    const iso = '2026-06-11';
    const p = parseIso(iso)!;
    expect(toIso(p.y, p.m, p.d)).toBe(iso);
  });
});

describe('formatDisplay', () => {
  it('rende dd/mm/yyyy', () => {
    expect(formatDisplay('2026-06-11')).toBe('11/06/2026');
  });
  it('ritorna stringa vuota su input non valido', () => {
    expect(formatDisplay('')).toBe('');
    expect(formatDisplay('garbage')).toBe('');
  });
});

describe('monthLabel', () => {
  it('rende mese italiano + anno', () => {
    expect(monthLabel(2026, 6)).toBe('Giugno 2026');
    expect(monthLabel(2026, 1)).toBe('Gennaio 2026');
  });
});

describe('WEEKDAY_LABELS_IT', () => {
  it('è lunedì-first', () => {
    expect(WEEKDAY_LABELS_IT).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  });
});

describe('buildMonthGrid', () => {
  it('produce 42 celle (6 settimane)', () => {
    expect(buildMonthGrid(2026, 6)).toHaveLength(42);
  });
  it('la prima cella è sempre un lunedì', () => {
    const grid = buildMonthGrid(2026, 2);
    const first = grid[0];
    expect(new Date(first.y, first.m - 1, first.d).getDay()).toBe(1); // 1 = lunedì
  });
  it('giugno 2026 parte di lunedì → prima cella = 2026-06-01 inMonth', () => {
    const grid = buildMonthGrid(2026, 6);
    expect(grid[0].iso).toBe('2026-06-01');
    expect(grid[0].inMonth).toBe(true);
  });
  it('febbraio 2026 parte di domenica → prima cella = 2026-01-26 fuori mese, il giorno 1 è all’indice 6', () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid[0].iso).toBe('2026-01-26');
    expect(grid[0].inMonth).toBe(false);
    expect(grid[6].iso).toBe('2026-02-01');
    expect(grid[6].inMonth).toBe(true);
  });
  it('conta esattamente i giorni del mese come inMonth (feb 2024 bisestile = 29)', () => {
    const grid = buildMonthGrid(2024, 2);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run components/ui/datePickerUtils.test.ts`
Expected: FAIL — modulo `./datePickerUtils` inesistente.

- [ ] **Step 3: Implementa il modulo minimo**

`components/ui/datePickerUtils.ts`:

```ts
// Helper di data puri per il DatePicker a tema.
// Convenzione: mese 1-12. ISO = 'YYYY-MM-DD'. Griglia lunedì-first.

export type GridCell = { y: number; m: number; d: number; iso: string; inMonth: boolean };

export const MONTH_NAMES_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export const WEEKDAY_LABELS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (typeof iso !== 'string') return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function formatDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_IT[month - 1]} ${year}`;
}

export function buildMonthGrid(year: number, month: number): GridCell[] {
  // Lunedì-first: quante celle del mese precedente mostrare prima del giorno 1.
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Dom..6=Sab
  const offset = (firstDow + 6) % 7; // 0 se lunedì
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(year, month - 1, 1 - offset + i);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const cd = dt.getDate();
    cells.push({ y: cy, m: cm, d: cd, iso: toIso(cy, cm, cd), inMonth: cm === month && cy === year });
  }
  return cells;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run components/ui/datePickerUtils.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Lint del nuovo file**

Run: `npx eslint components/ui/datePickerUtils.ts components/ui/datePickerUtils.test.ts`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add components/ui/datePickerUtils.ts components/ui/datePickerUtils.test.ts
git commit -m "feat(ui): helper di data puri per DatePicker (parse/format/griglia mese) + test"
```

---

## Task 2: Componente `DatePicker` (trigger + popover)

**Files:**
- Create: `components/ui/DatePicker.tsx`

Nota: env test è `node` (niente DOM), quindi il componente non ha unit test; è verificato da typecheck/build (Task 4) e a vista. Mantienilo allineato agli helper di Task 1.

- [ ] **Step 1: Crea il componente**

`components/ui/DatePicker.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMonthGrid,
  formatDisplay,
  monthLabel,
  parseIso,
  toIso,
  WEEKDAY_LABELS_IT,
} from './datePickerUtils';

type DatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  fullWidth?: boolean;
};

export default function DatePicker({
  value,
  onChange,
  disabled = false,
  min,
  max,
  placeholder = 'gg/mm/aaaa',
  className = '',
  ariaLabel = 'Seleziona data',
  fullWidth = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Vista mese/anno del popover (non è il valore selezionato).
  const [view, setView] = useState(() => {
    const p = parseIso(value);
    if (p) return { y: p.y, m: p.m };
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  // Alla riapertura riallinea la vista al valore (o al mese corrente).
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value);
    if (p) {
      setView({ y: p.y, m: p.m });
      return;
    }
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }, [open, value]);

  // Chiusura su click esterno + Esc.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const grid = useMemo(() => buildMonthGrid(view.y, view.m), [view.y, view.m]);

  const now = new Date();
  const todayIso = toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const isDisabledDay = (iso: string) =>
    (min !== undefined && iso < min) || (max !== undefined && iso > max);

  const pick = (iso: string) => {
    if (isDisabledDay(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const prevMonth = () =>
    setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () =>
    setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }));

  return (
    <div ref={rootRef} className={`relative ${fullWidth ? 'block w-full' : 'inline-block'} ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] transition focus:outline-none focus:border-[var(--brand-primary)] focus:shadow-[0_0_0_1px_var(--brand-primary)] ${
          fullWidth ? 'w-full' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--brand-primary-border)]'}`}
      >
        <span className={value ? '' : 'text-[var(--brand-text-subtle)]'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--brand-text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Calendario"
          className="absolute left-0 top-full z-[60] mt-2 w-72 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3"
          style={{ boxShadow: 'var(--shadow-lg), 0 0 18px oklch(0.80 0.16 215 / 0.25)' }}
        >
          {/* Header mese */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mese precedente"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--brand-border)] text-[var(--brand-text-main)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
            >
              ‹
            </button>
            <div className="text-sm font-semibold text-[var(--brand-text-main)]">
              {monthLabel(view.y, view.m)}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mese successivo"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--brand-border)] text-[var(--brand-text-main)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
            >
              ›
            </button>
          </div>

          {/* Intestazioni giorni */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            {WEEKDAY_LABELS_IT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Griglia giorni */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell, idx) => {
              const isSelected = value === cell.iso;
              const isToday = todayIso === cell.iso;
              const dis = isDisabledDay(cell.iso);
              const weekend = idx % 7 >= 5;
              let cls: string;
              if (!cell.inMonth) {
                cls = 'text-[var(--brand-text-subtle)] opacity-40';
              } else if (isSelected) {
                cls = 'bg-[var(--brand-primary)] font-semibold text-[oklch(0.16_0.06_245)]';
              } else if (isToday) {
                cls = 'ring-1 ring-[var(--brand-primary)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]';
              } else {
                cls = `${weekend ? 'text-[var(--brand-text-muted)]' : 'text-[var(--brand-text-main)]'} hover:bg-[var(--brand-surface-muted)]`;
              }
              if (dis) cls += ' opacity-30 cursor-not-allowed';
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || dis}
                  onClick={() => cell.inMonth && pick(cell.iso)}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm transition ${cls}`}
                >
                  {cell.d}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-[var(--brand-border)] pt-2">
            <button
              type="button"
              onClick={() => pick(todayIso)}
              disabled={isDisabledDay(todayIso)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck del nuovo file**

Run: `npx eslint components/ui/DatePicker.tsx`
Expected: nessun errore.

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore relativo a `components/ui/DatePicker.tsx` (se la baseline ha già errori altrove, verifica solo che non ne compaiano per questo file).

- [ ] **Step 3: Commit**

```bash
git add components/ui/DatePicker.tsx
git commit -m "feat(ui): componente DatePicker a tema (trigger + popover calendario)"
```

---

## Task 3: Integrazione in `MappaOperatoriClient.tsx`

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` (import in cima; input modale ~`2411-2416`; input toolbar ~`2465-2480`)

- [ ] **Step 1: Aggiungi l’import del componente**

In cima al file, tra gli altri import di componenti/`@/`, aggiungi:

```tsx
import DatePicker from '@/components/ui/DatePicker';
```

- [ ] **Step 2: Sostituisci l’input del modale "Configura pianificazione"**

Trova (campo `setupModalDate`):

```tsx
                  <input
                    type="date"
                    value={setupModalDate}
                    onChange={(e) => setSetupModalDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                  />
```

Sostituisci con:

```tsx
                  <DatePicker
                    fullWidth
                    value={setupModalDate}
                    onChange={(iso) => setSetupModalDate(iso)}
                    ariaLabel="Data pianificazione"
                  />
```

- [ ] **Step 3: Sostituisci l’input "Data" della toolbar**

Trova (campo `planningDate`):

```tsx
              <input
                type="date"
                value={planningDate}
                disabled={isEditMode || setupDone}
                onChange={(e) => {
                  if (isEditMode || setupDone) return;
                  if (e.target.value) {
                    setPlanningDate(e.target.value);
                    setSelectedOps([]);
                    setDistribution(null);
                  }
                }}
                className={`rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-sm ${
                  isEditMode || setupDone ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
```

Sostituisci con:

```tsx
              <DatePicker
                value={planningDate}
                disabled={isEditMode || setupDone}
                onChange={(iso) => {
                  if (isEditMode || setupDone) return;
                  if (iso) {
                    setPlanningDate(iso);
                    setSelectedOps([]);
                    setDistribution(null);
                  }
                }}
                ariaLabel="Data pianificazione"
              />
```

- [ ] **Step 4: Lint del file modificato**

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun **nuovo** errore introdotto (confronta con la baseline rossa già esistente: i soli errori ammessi sono quelli preesistenti non legati alle righe toccate; non devono comparire errori su `DatePicker`/righe modificate).

- [ ] **Step 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): usa DatePicker a tema al posto degli input data nativi"
```

---

## Task 4: Verifica finale (build + a vista)

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Esegui i test della utility**

Run: `npx vitest run components/ui/datePickerUtils.test.ts`
Expected: PASS.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori di type/compile relativi a `components/ui/DatePicker.tsx`, `components/ui/datePickerUtils.ts` e `components/modules/mappa/MappaOperatoriClient.tsx`.

- [ ] **Step 3: Verifica a vista (manuale, su `npm run dev` o deploy Vercel)**

Apri `/hub/mappa?vista=pianifica` e controlla:
- Modale "Configura pianificazione": il campo data apre un calendario a tema; selezionando un giorno il campo mostra `dd/mm/yyyy` e il modale si conferma con territorio.
- Toolbar "Data": dopo `Conferma` (setupDone) il trigger è `disabled` (attenuato, non apre il popover); con "Nuova pianificazione" torna abilitato.
- Navigazione mesi `‹`/`›`, **Oggi**, **oggi** col ring cyan, **selezionato** pieno cyan.
- Chiusura: click su un giorno, click fuori, `Esc`.
- Nessuno shift di giorno (selezioni l’11 → resta l’11).
- Tema chiaro (toggle in alto): il calendario resta leggibile (usa solo CSS var).

- [ ] **Step 4: Nessun commit** (solo verifica). Se la verifica a vista richiede correzioni, tornare al task pertinente.

---

## Self-Review (note per chi esegue)

- **Copertura spec:** trigger+popover (Task 2), entrambi i campi Mappa (Task 3), helper testabili + no shift fuso (Task 1), build/a-vista (Task 4). Footer "Oggi", weekend smorzati, min/max, disabled: tutti presenti nel componente.
- **Coerenza tipi:** mese sempre 1–12 negli helper; `GridCell` espone `y/m/d/iso/inMonth`; `DatePicker` consuma `buildMonthGrid/formatDisplay/monthLabel/parseIso/toIso/WEEKDAY_LABELS_IT` — nomi identici a Task 1.
- **YAGNI:** niente navigazione da tastiera con frecce, niente range/orari, niente adozione su altre pagine (fuori scope da spec).
