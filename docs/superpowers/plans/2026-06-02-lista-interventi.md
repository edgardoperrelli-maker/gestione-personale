# Lista Interventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pagina `/hub/interventi/lista` in sola lettura che elenca gli `interventi` con filtri (data, committente, stato, geocodifica), come server component.

**Architecture:** Server component che legge i filtri dai search param URL e interroga `interventi` via `createServerComponentClient` (RLS, sessione utente); una barra filtri client aggiorna l'URL; una tabella presentational rende le righe. Helper puri normalizzano i filtri e formattano stato/badge.

**Tech Stack:** Next.js 15 (App Router, Server Component, `searchParams` Promise) · React 19 · TypeScript · Supabase auth-helpers · Tailwind 4 (tema Aurea `--brand-*`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-lista-interventi-design.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `lib/interventi/interventiView.ts` (+ `.test.ts`) | Crea | Helper puri: `parseInterventiFilters`, `labelStato`, `badgeGeocode` + tipi filtro |
| `components/modules/interventi/InterventiTable.tsx` | Crea | Tabella presentational (no hook) + stato vuoto |
| `components/modules/interventi/InterventiFilters.tsx` | Crea | Barra filtri client che aggiorna i search param URL |
| `app/hub/interventi/lista/page.tsx` | Crea | Server component: query `interventi` + conteggi + composizione |
| `app/hub/interventi/page.tsx` | Modifica | Link "Vedi lista interventi" → `/hub/interventi/lista` |

Ordine task: T1 (helper) → T2 (tabella) → T3 (filtri) → T4 (pagina + link) → T5 (verifica). T4 dipende da T1/T2/T3.

---

## Task 1: Helper puri `interventiView` (TDD)

**Files:**
- Create: `lib/interventi/interventiView.ts`
- Test: `lib/interventi/interventiView.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `lib/interventi/interventiView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseInterventiFilters, labelStato, badgeGeocode } from './interventiView';

describe('parseInterventiFilters', () => {
  it('usa i default (oggi + tutti) con param vuoti', () => {
    expect(parseInterventiFilters({}, '2026-06-02')).toEqual({
      data: '2026-06-02', committente: 'tutti', stato: 'tutti', geocode: 'tutti',
    });
  });
  it('accetta valori validi', () => {
    expect(
      parseInterventiFilters({ data: '2026-05-01', committente: 'acea', stato: 'assegnato', geocode: 'failed' }, '2026-06-02'),
    ).toEqual({ data: '2026-05-01', committente: 'acea', stato: 'assegnato', geocode: 'failed' });
  });
  it('ricade su tutti per valori non riconosciuti e su oggi per data malformata', () => {
    expect(
      parseInterventiFilters({ data: '01-05-2026', committente: 'pippo', stato: 'x', geocode: 'y' }, '2026-06-02'),
    ).toEqual({ data: '2026-06-02', committente: 'tutti', stato: 'tutti', geocode: 'tutti' });
  });
});

describe('labelStato', () => {
  it('mappa gli stati noti', () => {
    expect(labelStato('da_assegnare')).toBe('Da assegnare');
    expect(labelStato('in_esecuzione')).toBe('In esecuzione');
  });
  it('gestisce null e sconosciuti', () => {
    expect(labelStato(null)).toBe('—');
    expect(labelStato('boh')).toBe('boh');
  });
});

describe('badgeGeocode', () => {
  it('ok → success', () => {
    expect(badgeGeocode('ok')).toEqual({ label: 'Geocodificato', tone: 'success' });
  });
  it('failed → danger', () => {
    expect(badgeGeocode('failed')).toEqual({ label: 'Da correggere', tone: 'danger' });
  });
  it('pending/null → muted', () => {
    expect(badgeGeocode('pending')).toEqual({ label: 'In attesa', tone: 'muted' });
    expect(badgeGeocode(null)).toEqual({ label: 'In attesa', tone: 'muted' });
  });
});
```

- [ ] **Step 2: Esegui il test, verifica che FALLISCE**

Run: `npx vitest run lib/interventi/interventiView.test.ts`
Expected: FAIL (modulo/funzioni non trovate).

- [ ] **Step 3: Implementa**

Create `lib/interventi/interventiView.ts`:

```ts
export type CommittenteFiltro = 'tutti' | 'acea' | 'italgas' | 'altro';
export type StatoFiltro =
  | 'tutti' | 'da_assegnare' | 'assegnato' | 'in_viaggio'
  | 'sul_posto' | 'in_esecuzione' | 'completato' | 'annullato';
export type GeocodeFiltro = 'tutti' | 'ok' | 'failed' | 'pending';

export type InterventiFilters = {
  data: string;
  committente: CommittenteFiltro;
  stato: StatoFiltro;
  geocode: GeocodeFiltro;
};

const COMMITTENTI: string[] = ['acea', 'italgas', 'altro'];
const STATI: string[] = [
  'da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione', 'completato', 'annullato',
];
const GEOCODI: string[] = ['ok', 'failed', 'pending'];

/**
 * Normalizza i search param della lista interventi. Puro: riceve `oggi`
 * (YYYY-MM-DD) come argomento per essere deterministico/testabile.
 */
export function parseInterventiFilters(
  sp: { data?: string; committente?: string; stato?: string; geocode?: string },
  oggi: string,
): InterventiFilters {
  const data = typeof sp.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : oggi;
  const committente = COMMITTENTI.includes(sp.committente ?? '') ? (sp.committente as CommittenteFiltro) : 'tutti';
  const stato = STATI.includes(sp.stato ?? '') ? (sp.stato as StatoFiltro) : 'tutti';
  const geocode = GEOCODI.includes(sp.geocode ?? '') ? (sp.geocode as GeocodeFiltro) : 'tutti';
  return { data, committente, stato, geocode };
}

const STATO_LABELS: Record<string, string> = {
  da_assegnare: 'Da assegnare',
  assegnato: 'Assegnato',
  in_viaggio: 'In viaggio',
  sul_posto: 'Sul posto',
  in_esecuzione: 'In esecuzione',
  completato: 'Completato',
  annullato: 'Annullato',
};

export function labelStato(stato: string | null | undefined): string {
  if (!stato) return '—';
  return STATO_LABELS[stato] ?? stato;
}

export type GeocodeBadge = { label: string; tone: 'success' | 'danger' | 'muted' };

export function badgeGeocode(status: string | null | undefined): GeocodeBadge {
  if (status === 'ok') return { label: 'Geocodificato', tone: 'success' };
  if (status === 'failed') return { label: 'Da correggere', tone: 'danger' };
  return { label: 'In attesa', tone: 'muted' };
}
```

- [ ] **Step 4: Esegui il test, verifica che PASSA**

Run: `npx vitest run lib/interventi/interventiView.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Commit**

Git hygiene: c'è un file locale modificato non correlato (`tsconfig.tsbuildinfo`, e talvolta `.claude/settings.local.json`). NON aggiungerli. `git add` solo dei file indicati. Mai `git add -A`.

```bash
git add lib/interventi/interventiView.ts lib/interventi/interventiView.test.ts
git commit -m "feat(interventi): helper interventiView (filtri + label/badge) (+ test)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `InterventiTable` (presentational)

**Files:**
- Create: `components/modules/interventi/InterventiTable.tsx`

> Componente presentational SENZA `'use client'` (nessun hook) — sarà renderizzato dal server component. Verifica = `tsc` + `lint`.

- [ ] **Step 1: Crea il componente**

Create `components/modules/interventi/InterventiTable.tsx`:

```tsx
import { labelStato, badgeGeocode } from '@/lib/interventi/interventiView';

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
};

const TONE_STYLE: Record<'success' | 'danger' | 'muted', { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  muted: { bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const TH = 'px-3 py-2 text-left font-semibold';
const TD = 'px-3 py-2';

export default function InterventiTable({ rows }: { rows: InterventoRow[] }) {
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
    <div className="overflow-x-auto rounded-[28px] border" style={{ borderColor: 'var(--brand-border)' }}>
      <table className="min-w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--brand-text-muted)' }}>
            <th className={TH}>ODL</th>
            <th className={TH}>Indirizzo</th>
            <th className={TH}>Comune</th>
            <th className={TH}>Committente</th>
            <th className={TH}>Stato</th>
            <th className={TH}>Geocodifica</th>
            <th className={TH}>Nominativo</th>
            <th className={TH}>Fascia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const g = badgeGeocode(r.geocode_status);
            const tone = TONE_STYLE[g.tone];
            return (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                <td className={TD}>{r.odl ?? '—'}</td>
                <td className={TD}>{r.indirizzo ?? '—'}</td>
                <td className={TD}>{r.comune ?? '—'}</td>
                <td className={TD}>{r.committente ?? '—'}</td>
                <td className={TD}>{labelStato(r.stato)}</td>
                <td className={TD}>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: tone.bg, color: tone.fg }}
                  >
                    {g.label}
                  </span>
                </td>
                <td className={TD}>{r.nominativo ?? '—'}</td>
                <td className={TD}>{r.fascia_oraria ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/interventi/InterventiTable.tsx`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add components/modules/interventi/InterventiTable.tsx
git commit -m "feat(interventi): InterventiTable (tabella presentational lista)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `InterventiFilters` (client)

**Files:**
- Create: `components/modules/interventi/InterventiFilters.tsx`

> Client component: aggiorna i search param URL ad ogni cambio filtro. Verifica = `tsc` + `lint`.

- [ ] **Step 1: Crea il componente**

Create `components/modules/interventi/InterventiFilters.tsx`:

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { InterventiFilters as Filters } from '@/lib/interventi/interventiView';

const fieldStyle = {
  borderColor: 'var(--brand-border)',
  color: 'var(--brand-text-main)',
  backgroundColor: 'var(--brand-surface)',
};
const labelClass = 'block text-xs font-semibold uppercase tracking-[0.14em]';
const labelStyle = { color: 'var(--brand-text-muted)' };
const controlClass = 'w-full rounded-2xl border px-3 py-2 text-sm outline-none transition';

export default function InterventiFilters({ filters }: { filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSelect(key: string, value: string) {
    setParam(key, value === 'tutti' ? '' : value);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="space-y-1">
        <label htmlFor="f-data" className={labelClass} style={labelStyle}>Data</label>
        <input
          id="f-data"
          type="date"
          value={filters.data}
          onChange={(e) => setParam('data', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="f-committente" className={labelClass} style={labelStyle}>Committente</label>
        <select
          id="f-committente"
          value={filters.committente}
          onChange={(e) => onSelect('committente', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="acea">Acea</option>
          <option value="italgas">Italgas</option>
          <option value="altro">Altro</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="f-stato" className={labelClass} style={labelStyle}>Stato</label>
        <select
          id="f-stato"
          value={filters.stato}
          onChange={(e) => onSelect('stato', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="da_assegnare">Da assegnare</option>
          <option value="assegnato">Assegnato</option>
          <option value="in_viaggio">In viaggio</option>
          <option value="sul_posto">Sul posto</option>
          <option value="in_esecuzione">In esecuzione</option>
          <option value="completato">Completato</option>
          <option value="annullato">Annullato</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="f-geocode" className={labelClass} style={labelStyle}>Geocodifica</label>
        <select
          id="f-geocode"
          value={filters.geocode}
          onChange={(e) => onSelect('geocode', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="ok">Geocodificati</option>
          <option value="failed">Da correggere</option>
          <option value="pending">In attesa</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/interventi/InterventiFilters.tsx`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add components/modules/interventi/InterventiFilters.tsx
git commit -m "feat(interventi): InterventiFilters (barra filtri lista via URL)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pagina `/hub/interventi/lista` + link dall'import

**Files:**
- Create: `app/hub/interventi/lista/page.tsx`
- Modify: `app/hub/interventi/page.tsx` (link "Vedi lista interventi")

> Server component (Next 15: `searchParams` è una Promise da `await`). Usa lo stesso pattern `createServerComponentClient` di `app/hub/page.tsx`. Verifica = `tsc` + `lint`. NON avviare il dev server.

- [ ] **Step 1: Crea la pagina lista**

Create `app/hub/interventi/lista/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import InterventiFilters from '@/components/modules/interventi/InterventiFilters';
import InterventiTable, { type InterventoRow } from '@/components/modules/interventi/InterventiTable';
import { parseInterventiFilters } from '@/lib/interventi/interventiView';

export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome, formato YYYY-MM-DD. */
function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default async function ListaInterventiPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; committente?: string; stato?: string; geocode?: string }>;
}) {
  const sp = await searchParams;
  const filters = parseInterventiFilters(sp, oggiIso());

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  let q = supabase
    .from('interventi')
    .select('id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria')
    .eq('data', filters.data)
    .order('comune', { ascending: true })
    .order('indirizzo', { ascending: true })
    .limit(1000);
  if (filters.committente !== 'tutti') q = q.eq('committente', filters.committente);
  if (filters.stato !== 'tutti') q = q.eq('stato', filters.stato);
  if (filters.geocode !== 'tutti') q = q.eq('geocode_status', filters.geocode);

  const { data: rows, error } = await q;
  const interventi = (rows ?? []) as InterventoRow[];

  const conteggi = {
    totale: interventi.length,
    ok: interventi.filter((r) => r.geocode_status === 'ok').length,
    failed: interventi.filter((r) => r.geocode_status === 'failed').length,
    pending: interventi.filter((r) => r.geocode_status !== 'ok' && r.geocode_status !== 'failed').length,
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Interventi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Elenco degli interventi importati, filtrabile per data, committente, stato e geocodifica.
          </p>
        </div>
        <Link
          href="/hub/interventi"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Importa interventi
        </Link>
      </header>

      <InterventiFilters filters={filters} />

      {error ? (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Errore nel caricamento: {error.message}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { k: 'Totale', v: conteggi.totale },
              { k: 'Geocodificati', v: conteggi.ok },
              { k: 'Da correggere', v: conteggi.failed },
              { k: 'In attesa', v: conteggi.pending },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>
                  {c.k}
                </div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  {c.v}
                </div>
              </div>
            ))}
          </div>

          <InterventiTable rows={interventi} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Aggiungi il link nella pagina import**

In `app/hub/interventi/page.tsx`:

2a — aggiungi l'import. FIND:
```tsx
import GeocodePanel from '@/components/modules/interventi/GeocodePanel';
```
REPLACE WITH:
```tsx
import GeocodePanel from '@/components/modules/interventi/GeocodePanel';
import Link from 'next/link';
```

2b — aggiungi il link in fondo all'header. FIND:
```tsx
          giorno aggiorna le righe esistenti (dedup per committente, ODL e data) invece di duplicarle.
        </p>
      </header>
```
REPLACE WITH:
```tsx
          giorno aggiorna le righe esistenti (dedup per committente, ODL e data) invece di duplicarle.
        </p>
        <Link
          href="/hub/interventi/lista"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Vedi lista interventi
        </Link>
      </header>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint app/hub/interventi/lista/page.tsx app/hub/interventi/page.tsx`
Expected: pulito.

- [ ] **Step 4: Commit**

```bash
git add app/hub/interventi/lista/page.tsx app/hub/interventi/page.tsx
git commit -m "feat(interventi): pagina /hub/interventi/lista (lista filtrabile) + link da import" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verifica finale

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: tutti i test verdi (esistenti + i nuovi di `interventiView`).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Nessun commit (sola verifica).** Se rosso, torna al task pertinente.

---

## Note di esecuzione

- `npx tsc` aggiorna `tsconfig.tsbuildinfo`: NON includerlo nei commit. Usare sempre `git add` dei file specifici, mai `git add -A`.
- Lasciare fuori dai commit `.claude/settings.local.json` e `tsconfig.tsbuildinfo`.
- Non avviare `npm run dev` nei subagent (long-running): la verifica è `tsc`/`lint`/`test`; lo smoke a video lo fa il controller.
- La feature è sola lettura: non servono **nuove** migration. Legge però la colonna `geocode_status`, introdotta dalla migration geocoding già consegnata (`20260602010000_interventi_geocode_status.sql`): va applicata sul DB, altrimenti la query va in errore.
