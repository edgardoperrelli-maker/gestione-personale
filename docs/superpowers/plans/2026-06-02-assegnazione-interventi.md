# Assegnazione Interventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assegnare gli `interventi` agli operatori dalla lista `/hub/interventi/lista` — per riga e in modo massivo — con riassegnazione permissiva (terminali esclusi).

**Architecture:** Un helper puro decide la patch di stato; una rotta `POST /api/interventi/assegna { ids, staffId }` (service role) la applica a uno o più interventi; la tabella della lista diventa un componente client interattivo (checkbox + barra massiva + menu operatore per riga) che chiama la rotta e fa `router.refresh()`.

**Tech Stack:** Next.js 15 (App Router, Server Component + client island) · React 19 · TypeScript · Supabase (`supabaseAdmin`) · Vitest · tema Aurea.

**Spec:** `docs/superpowers/specs/2026-06-02-assegnazione-interventi-design.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `lib/interventi/assegnazione.ts` (+ `.test.ts`) | Crea | Helper puro `pianificaAssegnazione` |
| `app/api/interventi/assegna/route.ts` | Crea | `POST { ids, staffId }` → applica patch via service role |
| `lib/interventi/interventiView.ts` | Modifica | Aggiunge il tipo `InterventoRow` (+`staff_id`) |
| `components/modules/interventi/InterventiAssegnabili.tsx` | Crea | Tabella client: checkbox + barra massiva + menu operatore per riga |
| `app/hub/interventi/lista/page.tsx` | Modifica | Carica operatori validi; usa `InterventiAssegnabili` (al posto di `InterventiTable`) |
| `components/modules/interventi/InterventiTable.tsx` | Rimuove | Sostituita da `InterventiAssegnabili` |

Ordine: T1 (helper) → T2 (rotta) → T3 (tipo) → T4 (componente) → T5 (pagina + rimozione) → T6 (verifica). Build verde a ogni task.

---

## Task 1: Helper puro `pianificaAssegnazione` (TDD)

**Files:**
- Create: `lib/interventi/assegnazione.ts`
- Test: `lib/interventi/assegnazione.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `lib/interventi/assegnazione.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pianificaAssegnazione } from './assegnazione';

describe('pianificaAssegnazione', () => {
  it('da_assegnare + operatore → assegnato, assegnatoAt set', () => {
    expect(pianificaAssegnazione('da_assegnare', 's1')).toEqual({
      ok: true, patch: { staff_id: 's1', stato: 'assegnato', assegnatoAt: 'set', azzeraAvvio: false },
    });
  });
  it('assegnato + altro operatore → riassegna, assegnatoAt keep', () => {
    expect(pianificaAssegnazione('assegnato', 's2')).toEqual({
      ok: true, patch: { staff_id: 's2', stato: 'assegnato', assegnatoAt: 'keep', azzeraAvvio: false },
    });
  });
  it('stato avviato + operatore → reset ad assegnato con azzeraAvvio', () => {
    expect(pianificaAssegnazione('in_esecuzione', 's3')).toEqual({
      ok: true, patch: { staff_id: 's3', stato: 'assegnato', assegnatoAt: 'keep', azzeraAvvio: true },
    });
  });
  it('assegnato + nessuno → disassegna (clear)', () => {
    expect(pianificaAssegnazione('assegnato', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: false },
    });
  });
  it('da_assegnare + nessuno → no-op', () => {
    expect(pianificaAssegnazione('da_assegnare', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'keep', azzeraAvvio: false },
    });
  });
  it('avviato + nessuno → disassegna con azzeraAvvio', () => {
    expect(pianificaAssegnazione('in_viaggio', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: true },
    });
  });
  it('completato → rifiuto', () => {
    expect(pianificaAssegnazione('completato', 's1').ok).toBe(false);
  });
  it('annullato → rifiuto', () => {
    expect(pianificaAssegnazione('annullato', null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test, verifica che FALLISCE**

Run: `npx vitest run lib/interventi/assegnazione.test.ts`
Expected: FAIL (modulo/funzione non trovata).

- [ ] **Step 3: Implementa**

Create `lib/interventi/assegnazione.ts`:

```ts
import type { StatoIntervento } from './statoInterventi';

export type AssegnaPatch = {
  staff_id: string | null;
  stato: StatoIntervento; // 'assegnato' | 'da_assegnare'
  assegnatoAt: 'set' | 'keep' | 'clear';
  azzeraAvvio: boolean; // azzera iniziato_at/chiuso_at (reset da stato avviato)
};
export type EsitoPianificazione = { ok: true; patch: AssegnaPatch } | { ok: false; errore: string };

const TERMINALI: ReadonlySet<StatoIntervento> = new Set(['completato', 'annullato']);
const AVVIATI: ReadonlySet<StatoIntervento> = new Set(['in_viaggio', 'sul_posto', 'in_esecuzione']);

/**
 * Decide la patch per assegnare/riassegnare/disassegnare un intervento.
 * Riassegnazione permissiva su tutti gli stati non terminali (gli avviati
 * tornano ad 'assegnato'); `completato`/`annullato` rifiutati. Puro/testabile.
 */
export function pianificaAssegnazione(statoCorrente: StatoIntervento, staffId: string | null): EsitoPianificazione {
  if (TERMINALI.has(statoCorrente)) {
    return { ok: false, errore: `Intervento ${statoCorrente}: non riassegnabile` };
  }
  if (staffId) {
    return {
      ok: true,
      patch: {
        staff_id: staffId,
        stato: 'assegnato',
        assegnatoAt: statoCorrente === 'da_assegnare' ? 'set' : 'keep',
        azzeraAvvio: AVVIATI.has(statoCorrente),
      },
    };
  }
  if (statoCorrente === 'da_assegnare') {
    return { ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'keep', azzeraAvvio: false } };
  }
  return {
    ok: true,
    patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: AVVIATI.has(statoCorrente) },
  };
}
```

- [ ] **Step 4: Esegui il test, verifica che PASSA**

Run: `npx vitest run lib/interventi/assegnazione.test.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

Git hygiene: NON stageare `tsconfig.tsbuildinfo` / `.claude/settings.local.json`. Mai `git add -A`.

```bash
git add lib/interventi/assegnazione.ts lib/interventi/assegnazione.test.ts
git commit -m "feat(interventi): helper pianificaAssegnazione (+ test)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rotta `POST /api/interventi/assegna`

**Files:**
- Create: `app/api/interventi/assegna/route.ts`

> Auth `requireUser`, scritture via `supabaseAdmin`. Riusa l'helper di T1. Verifica = `tsc` + `lint`.

- [ ] **Step 1: Crea la rotta**

Create `app/api/interventi/assegna/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { pianificaAssegnazione } from '@/lib/interventi/assegnazione';
import type { StatoIntervento } from '@/lib/interventi/statoInterventi';

export const runtime = 'nodejs';

/**
 * POST /api/interventi/assegna — assegna/riassegna/disassegna uno o più interventi.
 * Body JSON: { ids: string[], staffId: string | null }.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; staffId?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [];
    const staffId = typeof body.staffId === 'string' && body.staffId.trim() !== '' ? body.staffId.trim() : null;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nessun intervento selezionato.' }, { status: 400 });
    }

    const { data: rows, error } = await supabaseAdmin.from('interventi').select('id, stato').in('id', ids);
    if (error) throw error;

    const statoById = new Map<string, StatoIntervento>();
    for (const r of (rows ?? []) as Array<{ id: string; stato: StatoIntervento }>) {
      statoById.set(r.id, r.stato);
    }

    let assegnati = 0;
    const scartati: Array<{ id: string; errore: string }> = [];

    for (const id of ids) {
      const stato = statoById.get(id);
      if (!stato) {
        scartati.push({ id, errore: 'Intervento non trovato' });
        continue;
      }
      const esito = pianificaAssegnazione(stato, staffId);
      if (!esito.ok) {
        scartati.push({ id, errore: esito.errore });
        continue;
      }
      const { patch } = esito;
      const update: Record<string, unknown> = { staff_id: patch.staff_id, stato: patch.stato };
      if (patch.assegnatoAt === 'set') update.assegnato_at = new Date().toISOString();
      else if (patch.assegnatoAt === 'clear') update.assegnato_at = null;
      if (patch.azzeraAvvio) {
        update.iniziato_at = null;
        update.chiuso_at = null;
      }
      const { error: ue } = await supabaseAdmin.from('interventi').update(update).eq('id', id);
      if (ue) throw new Error(`Update intervento ${id} fallito: ${ue.message}`);
      assegnati += 1;
    }

    return NextResponse.json({ assegnati, scartati });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore assegnazione.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint app/api/interventi/assegna/route.ts`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/assegna/route.ts
git commit -m "feat(interventi): rotta /api/interventi/assegna (assegnazione singola + massiva)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Aggiungi `InterventoRow` a `interventiView.ts`

**Files:**
- Modify: `lib/interventi/interventiView.ts`

> Additivo (il tipo diventa condiviso tra pagina e componente client), con `staff_id`. `InterventiTable.tsx` mantiene per ora la sua copia: verrà rimosso in T5. Verifica = `tsc`.

- [ ] **Step 1: Aggiungi il tipo**

In fondo a `lib/interventi/interventiView.ts`, aggiungi:

```ts
export type InterventoRow = {
  id: string;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  committente: string | null;
  stato: string | null;
  geocode_status: string | null;
  nominativo: string | null;
  fascia_oraria: string | null;
  staff_id: string | null;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore (additivo).

- [ ] **Step 3: Commit**

```bash
git add lib/interventi/interventiView.ts
git commit -m "feat(interventi): InterventoRow condiviso in interventiView (+ staff_id)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `InterventiAssegnabili` (tabella client interattiva)

**Files:**
- Create: `components/modules/interventi/InterventiAssegnabili.tsx`

> Client. Selezione + barra massiva + menu operatore per riga. Righe terminali (completato/annullato) non selezionabili/non modificabili. Verifica = `tsc` + `lint`. NON avviare il dev server.

- [ ] **Step 1: Crea il componente**

Create `components/modules/interventi/InterventiAssegnabili.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelStato, badgeGeocode, type InterventoRow } from '@/lib/interventi/interventiView';

type Operatore = { id: string; display_name: string };

const TONE_STYLE: Record<'success' | 'danger' | 'muted', { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  muted: { bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const TERMINALI = new Set(['completato', 'annullato']);
const TH = 'px-3 py-2 text-left font-semibold';
const TD = 'px-3 py-2';
const fieldStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' };

export default function InterventiAssegnabili({
  rows,
  operators,
}: {
  rows: InterventoRow[];
  operators: Operatore[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStaff, setBulkStaff] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const assegnabili = rows.filter((r) => !TERMINALI.has(r.stato ?? ''));
  const tuttiSelezionati = assegnabili.length > 0 && assegnabili.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(tuttiSelezionati ? new Set() : new Set(assegnabili.map((r) => r.id)));
  }

  async function assegna(ids: string[], staffId: string | null) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setAvviso(null);
    try {
      const res = await fetch('/api/interventi/assegna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, staffId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore assegnazione.');
        return;
      }
      const scartati = Array.isArray(json?.scartati) ? json.scartati.length : 0;
      if (scartati > 0) setAvviso(`${json.assegnati} assegnati, ${scartati} non assegnabili (completati/annullati).`);
      setSelected(new Set());
      setBulkStaff('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
      >
        Nessun intervento per i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {avviso && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          {avviso}
        </div>
      )}

      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            {selected.size} selezionati
          </span>
          <select
            aria-label="Operatore per assegnazione massiva"
            value={bulkStaff}
            onChange={(e) => setBulkStaff(e.target.value)}
            className="rounded-2xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          >
            <option value="">— Operatore</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.display_name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || bulkStaff === ''}
            onClick={() => assegna([...selected], bulkStaff)}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {busy ? '…' : `Assegna ${selected.size}`}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            Annulla selezione
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[28px] border" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--brand-text-muted)' }}>
              <th className={TD}>
                <input
                  type="checkbox"
                  aria-label="Seleziona tutti"
                  checked={tuttiSelezionati}
                  onChange={toggleAll}
                  disabled={assegnabili.length === 0}
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
              </th>
              <th className={TH}>ODL</th>
              <th className={TH}>Indirizzo</th>
              <th className={TH}>Comune</th>
              <th className={TH}>Committente</th>
              <th className={TH}>Stato</th>
              <th className={TH}>Geocodifica</th>
              <th className={TH}>Operatore</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = badgeGeocode(r.geocode_status);
              const tone = TONE_STYLE[g.tone];
              const terminale = TERMINALI.has(r.stato ?? '');
              return (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ${r.odl ?? r.id}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={terminale || busy}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                  </td>
                  <td className={TD}>{r.odl ?? '—'}</td>
                  <td className={TD}>{r.indirizzo ?? '—'}</td>
                  <td className={TD}>{r.comune ?? '—'}</td>
                  <td className={TD}>{r.committente ?? '—'}</td>
                  <td className={TD}>{labelStato(r.stato)}</td>
                  <td className={TD}>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: tone.bg, color: tone.fg }}>
                      {g.label}
                    </span>
                  </td>
                  <td className={TD}>
                    {terminale ? (
                      <span style={{ color: 'var(--brand-text-muted)' }}>
                        {operators.find((o) => o.id === r.staff_id)?.display_name ?? '—'}
                      </span>
                    ) : (
                      <select
                        aria-label={`Operatore per ${r.odl ?? r.id}`}
                        value={r.staff_id ?? ''}
                        onChange={(e) => assegna([r.id], e.target.value === '' ? null : e.target.value)}
                        disabled={busy}
                        className="rounded-xl border px-2 py-1 text-sm outline-none"
                        style={fieldStyle}
                      >
                        <option value="">— Non assegnato</option>
                        {r.staff_id && !operators.some((o) => o.id === r.staff_id) && (
                          <option value={r.staff_id}>Operatore {r.staff_id}</option>
                        )}
                        {operators.map((o) => (
                          <option key={o.id} value={o.id}>{o.display_name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/interventi/InterventiAssegnabili.tsx`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add components/modules/interventi/InterventiAssegnabili.tsx
git commit -m "feat(interventi): InterventiAssegnabili (tabella con assegnazione per-riga + massiva)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Aggancia alla lista + rimuovi `InterventiTable`

**Files:**
- Modify: `app/hub/interventi/lista/page.tsx`
- Remove: `components/modules/interventi/InterventiTable.tsx`

> Carica gli operatori validi per la data, aggiunge `staff_id` al select, usa `InterventiAssegnabili`. Verifica = `tsc` + `lint`.

- [ ] **Step 1: Aggiorna gli import**

In `app/hub/interventi/lista/page.tsx`, FIND:
```tsx
import InterventiTable, { type InterventoRow } from '@/components/modules/interventi/InterventiTable';
import { parseInterventiFilters } from '@/lib/interventi/interventiView';
```
REPLACE WITH:
```tsx
import InterventiAssegnabili from '@/components/modules/interventi/InterventiAssegnabili';
import { parseInterventiFilters, type InterventoRow } from '@/lib/interventi/interventiView';
import { isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';
```

- [ ] **Step 2: Aggiungi `staff_id` al select interventi**

FIND:
```tsx
    .select('id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria')
```
REPLACE WITH:
```tsx
    .select('id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id')
```

- [ ] **Step 3: Carica gli operatori validi per la data**

FIND:
```tsx
  const { data: rows, error } = await q;
  const interventi = (rows ?? []) as InterventoRow[];
```
REPLACE WITH:
```tsx
  const { data: rows, error } = await q;
  const interventi = (rows ?? []) as InterventoRow[];

  const { data: staffRows } = await supabase.from('staff').select('id, display_name, valid_from, valid_to');
  const operatori = ((staffRows ?? []) as Staff[])
    .filter((s) => isStaffValidOnDay(s, filters.data))
    .map((s) => ({ id: s.id, display_name: s.display_name }));
```

- [ ] **Step 4: Usa `InterventiAssegnabili`**

FIND:
```tsx
          <InterventiTable rows={interventi} />
```
REPLACE WITH:
```tsx
          <InterventiAssegnabili rows={interventi} operators={operatori} />
```

- [ ] **Step 5: Rimuovi la tabella sola-lettura**

```bash
git rm components/modules/interventi/InterventiTable.tsx
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore (nessuno importa più `InterventiTable`; `InterventoRow` viene da `interventiView`).
Run: `npx eslint app/hub/interventi/lista/page.tsx`
Expected: pulito.

- [ ] **Step 7: Commit**

```bash
git add app/hub/interventi/lista/page.tsx components/modules/interventi/InterventiTable.tsx
git commit -m "feat(interventi): lista assegnabile (operatori validi + InterventiAssegnabili); rimuove InterventiTable" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica finale

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Suite completa** — Run: `npm run test` → tutti verdi (esistenti + 8 nuovi di `pianificaAssegnazione`).
- [ ] **Step 2: Typecheck** — Run: `npx tsc -p tsconfig.json` → nessun errore.
- [ ] **Step 3: Nessun commit (sola verifica).** Se rosso, torna al task pertinente.

---

## Note di esecuzione

- `npx tsc` aggiorna `tsconfig.tsbuildinfo`: non includerlo nei commit. `git add` dei file specifici, mai `git add -A`. Lasciare fuori `.claude/settings.local.json`.
- Non avviare `npm run dev` nei subagent: verifica con `tsc`/`lint`/`test`; lo smoke a video lo fa il controller.
- Nessuna SQL: `interventi` ha già `staff_id`/`stato`/`assegnato_at`/`iniziato_at`/`chiuso_at`.
