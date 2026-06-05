# Filtro periodo con range personalizzato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Aggiungere un range di date personalizzato (campi Dal/Al nativi) al filtro periodo della vista riepilogo rapportini.

**Architecture:** Logica di calcolo del range in una utility pura testabile (`rangePeriodo.ts`); il componente la consuma. Calcolo in UTC per evitare bug di fuso.

**Tech Stack:** React 19, TypeScript, Vitest. Test: `npx vitest run <path>`.

---

## Task 1: utility `rangePeriodo` (TDD)

**Files:** Create `utils/rapportini/rangePeriodo.ts`; Test `utils/rapportini/rangePeriodo.test.ts`

- [ ] **Step 1 — test (deve fallire)**

```ts
// utils/rapportini/rangePeriodo.test.ts
import { describe, it, expect } from 'vitest';
import { calcolaRange, PERIODI } from './rangePeriodo';

describe('calcolaRange', () => {
  const oggi = '2026-06-05';
  it('preset 30 giorni: from = oggi-30, to = oggi+14 (UTC)', () => {
    expect(calcolaRange('30', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-06', to: '2026-06-19' });
  });
  it('preset 7 giorni', () => {
    expect(calcolaRange('7', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-29', to: '2026-06-19' });
  });
  it('preset sconosciuto → default 30', () => {
    expect(calcolaRange('xyz', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-06', to: '2026-06-19' });
  });
  it('custom valido → date esatte', () => {
    expect(calcolaRange('custom', { dataDa: '2026-01-01', dataA: '2026-01-31' }, oggi)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
  it('custom incompleto → null', () => {
    expect(calcolaRange('custom', { dataDa: '2026-01-01', dataA: '' }, oggi)).toBeNull();
    expect(calcolaRange('custom', { dataDa: '', dataA: '2026-01-31' }, oggi)).toBeNull();
  });
  it('custom invertito (Da > A) → null', () => {
    expect(calcolaRange('custom', { dataDa: '2026-02-01', dataA: '2026-01-01' }, oggi)).toBeNull();
  });
  it('PERIODI espone i tre preset', () => {
    expect(PERIODI.map((p) => p.k)).toEqual(['7', '30', '90']);
  });
});
```

- [ ] **Step 2 — esegui:** `npx vitest run utils/rapportini/rangePeriodo.test.ts` → FAIL (import non risolto).

- [ ] **Step 3 — implementa**

```ts
// utils/rapportini/rangePeriodo.ts
export type PeriodoPreset = { k: string; label: string; giorni: number };

export const PERIODI: PeriodoPreset[] = [
  { k: '7', label: 'Ultimi 7 giorni', giorni: 7 },
  { k: '30', label: 'Ultimi 30 giorni', giorni: 30 },
  { k: '90', label: 'Ultimi 90 giorni', giorni: 90 },
];

export const GIORNI_FUTURO = 14; // i preset includono i rapportini pianificati nei prossimi giorni

export type RangeCustom = { dataDa: string; dataA: string };

/**
 * Finestra { from, to } (YYYY-MM-DD) per il fetch del riepilogo.
 * - preset: from = oggi - giorni, to = oggi + GIORNI_FUTURO.
 * - 'custom': usa dataDa/dataA esatti; null se incompleti o dataDa > dataA.
 * Calcolo in UTC: oggiIso interpretato come mezzanotte UTC per evitare slittamenti di fuso.
 */
export function calcolaRange(
  periodo: string,
  custom: RangeCustom,
  oggiIso: string,
): { from: string; to: string } | null {
  if (periodo === 'custom') {
    const { dataDa, dataA } = custom;
    if (!dataDa || !dataA || dataDa > dataA) return null;
    return { from: dataDa, to: dataA };
  }
  const giorni = PERIODI.find((p) => p.k === periodo)?.giorni ?? 30;
  const base = new Date(`${oggiIso}T00:00:00Z`).getTime();
  const day = 24 * 3600 * 1000;
  const from = new Date(base - giorni * day).toISOString().slice(0, 10);
  const to = new Date(base + GIORNI_FUTURO * day).toISOString().slice(0, 10);
  return { from, to };
}
```

- [ ] **Step 4 — esegui:** `npx vitest run utils/rapportini/rangePeriodo.test.ts` → PASS.

- [ ] **Step 5 — commit:** `feat(rapportini): utility rangePeriodo con range personalizzato`

---

## Task 2: integra il range nel componente

**Files:** Modify `components/modules/mappa/RiepilogoRapportini.tsx`

> Componente client, niente test automatico → verifica manuale + lint.

- [ ] **Step 1 — import dalla utility, rimuovi PERIODI/GIORNI_FUTURO locali**

Sostituisci le costanti locali `PERIODI` e `GIORNI_FUTURO` con:
```ts
import { PERIODI, calcolaRange } from '@/utils/rapportini/rangePeriodo';
```

- [ ] **Step 2 — stato per le date custom**

Accanto a `const [periodo, setPeriodo] = useState('30');` aggiungi:
```ts
  const [dataDa, setDataDa] = useState('');
  const [dataA, setDataA] = useState('');
```

- [ ] **Step 3 — `carica()` usa `calcolaRange`** (sostituisci il corpo del calcolo from/to)

```ts
  const carica = useCallback(async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const range = calcolaRange(periodo, { dataDa, dataA }, oggi);
    if (!range) return; // custom incompleto/invertito: non ricaricare, mantieni i risultati
    setLoading(true);
    try {
      const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${range.from}&to=${range.to}`);
      const data = await res.json();
      setRaps(Array.isArray(data) ? (data as RapRiepilogo[]) : []);
    } catch {
      setRaps([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, dataDa, dataA]);
```

- [ ] **Step 4 — select con "Personalizzato" + input condizionali**

Sostituisci il blocco del `<select>` periodo con:
```tsx
        <select
          className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
          value={periodo}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom' && !dataDa && !dataA) {
              const oggi = new Date().toISOString().slice(0, 10);
              const r = calcolaRange(periodo, { dataDa: '', dataA: '' }, oggi);
              if (r) { setDataDa(r.from); setDataA(r.to); }
            }
            setPeriodo(v);
          }}
        >
          {PERIODI.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
          <option value="custom">Personalizzato…</option>
        </select>
        {periodo === 'custom' && (
          <>
            <input
              type="date"
              aria-label="Dal"
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
              value={dataDa}
              max={dataA || undefined}
              onChange={(e) => setDataDa(e.target.value)}
            />
            <span className="text-xs text-[var(--brand-text-muted)]">→</span>
            <input
              type="date"
              aria-label="Al"
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
              value={dataA}
              min={dataDa || undefined}
              onChange={(e) => setDataA(e.target.value)}
            />
          </>
        )}
```

- [ ] **Step 5 — lint:** `npx eslint components/modules/mappa/RiepilogoRapportini.tsx` → nessun nuovo errore.

- [ ] **Step 6 — verifica manuale:** menu periodo mostra "Personalizzato…"; selezionandolo compaiono Dal/Al prepopolati; cambiando le date il riepilogo si ricarica; range invertito non ricarica; tornando a un preset i campi spariscono.

- [ ] **Step 7 — `npm test`** (atteso: 323 baseline + nuovi test rangePeriodo, tutti verdi).

- [ ] **Step 8 — commit:** `feat(rapportini): range personalizzato (Dal/Al) nel filtro periodo`

---

## Self-review
- Copertura spec: opzione Personalizzato ✓, input Dal/Al stilizzati ✓, calcolo UTC ✓, guard custom→null ✓, prepopolazione ✓.
- Tipi coerenti: `calcolaRange(periodo, {dataDa,dataA}, oggiIso)` usato identico in `carica()` e nel prepopolamento.
