# Riepilogo rapportini + Aggiungi manuale + Card colorate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una vista "Riepilogo rapportini" (per giorno → piano → operatore), un pulsante "Aggiungi manuale" nell'editor (modale con gli stessi campi dell'import), e colorare le card del rapportino digitale (verde positivo / rossa assente / neutra).

**Architecture:** Tre unità indipendenti. A: nuova rotta GET di aggregazione + util puro di raggruppamento + componente vista + 3ª card. B: nuovo modale + handler nell'editor che geocodifica e inserisce il task (con eventuale pin esecutore). C: util puro che mappa l'esito a un colore + applicazione alla card.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (service role), TypeScript, Tailwind 4 (tema Aurea), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-rapportini-riepilogo-manuale-colori-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `utils/rapportini/groupByDay.ts` (+test) | `groupRapportiniByDay` (puro) | Create |
| `app/api/mappa/rapportini/riepilogo/route.ts` | GET aggregato rapportini + territorio + nVoci | Create |
| `components/modules/mappa/RiepilogoRapportini.tsx` | Vista riepilogo per giorno | Create |
| `app/hub/mappa/page.tsx` | 3ª card + vista `riepilogo` | Modify |
| `utils/rapportini/voceColore.ts` (+test) | `voceEsitoColore` (puro) | Create |
| `components/modules/rapportini/RapportinoForm.tsx` | Colore card per esito | Modify |
| `components/modules/mappa/ManualTaskModal.tsx` | Modale inserimento manuale | Create |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Pulsante "Aggiungi manuale" + handler | Modify |

I tre blocchi (A=riepilogo, B=manuale, C=colori) sono indipendenti.

---

## Task A1: util `groupRapportiniByDay`

**Files:** Create `utils/rapportini/groupByDay.ts` + `utils/rapportini/groupByDay.test.ts`

- [ ] **Step 1: Test (fallisce)** — `utils/rapportini/groupByDay.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { groupRapportiniByDay, type RapRiepilogo } from './groupByDay';

const r = (over: Partial<RapRiepilogo>): RapRiepilogo => ({
  id: 'x', staff_id: 's', staff_name: 'N', token: 't', stato: 'in_corso', data: '2026-06-01',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  piano_id: 'p1', territorio: 'ACEA', ...over,
});

describe('groupRapportiniByDay', () => {
  it('raggruppa per giorno (desc) e per piano, preservando l\'ordine operatori', () => {
    const out = groupRapportiniByDay([
      r({ id: '1', data: '2026-06-01', piano_id: 'p1', territorio: 'ACEA' }),
      r({ id: '2', data: '2026-06-01', piano_id: 'p1', territorio: 'ACEA' }),
      r({ id: '3', data: '2026-06-01', piano_id: 'p2', territorio: 'PERUGIA' }),
      r({ id: '4', data: '2026-05-30', piano_id: 'p3', territorio: 'FIRENZE' }),
    ]);
    expect(out.map((g) => g.data)).toEqual(['2026-06-01', '2026-05-30']);
    expect(out[0].piani.map((p) => p.piano_id)).toEqual(['p1', 'p2']);
    expect(out[0].piani[0].operatori.map((o) => o.id)).toEqual(['1', '2']);
    expect(out[1].piani).toHaveLength(1);
  });
  it('lista vuota → []', () => {
    expect(groupRapportiniByDay([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire → FAIL** — `npx vitest run utils/rapportini/groupByDay.test.ts`

- [ ] **Step 3: Implementare** — `utils/rapportini/groupByDay.ts`
```ts
import type { RapportinoStato } from './links';

export type RapRiepilogo = RapportinoStato & { piano_id: string; territorio: string | null };

export type GiornoGruppo = {
  data: string;
  piani: { piano_id: string; territorio: string | null; operatori: RapRiepilogo[] }[];
};

export function groupRapportiniByDay(raps: RapRiepilogo[]): GiornoGruppo[] {
  const byDay = new Map<string, Map<string, { piano_id: string; territorio: string | null; operatori: RapRiepilogo[] }>>();
  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const piani = byDay.get(r.data)!;
    if (!piani.has(r.piano_id)) {
      piani.set(r.piano_id, { piano_id: r.piano_id, territorio: r.territorio, operatori: [] });
    }
    piani.get(r.piano_id)!.operatori.push(r);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([data, pianiMap]) => ({ data, piani: [...pianiMap.values()] }));
}
```

- [ ] **Step 4: Eseguire → PASS** — `npx vitest run utils/rapportini/groupByDay.test.ts`

- [ ] **Step 5: Commit**
```bash
git add utils/rapportini/groupByDay.ts utils/rapportini/groupByDay.test.ts
git commit -m "feat(rapportini): groupRapportiniByDay puro + test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task A2: API `GET /api/mappa/rapportini/riepilogo`

**Files:** Create `app/api/mappa/rapportini/riepilogo/route.ts`

- [ ] **Step 1: Implementare la rotta**
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get('from') ?? new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: raps } = await supabaseAdmin
    .from('rapportini')
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at')
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: false });
  const list = (raps ?? []) as Array<{
    id: string; piano_id: string; staff_id: string; staff_name: string | null;
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null;
  }>;

  // Territori dei piani
  const pianoIds = [...new Set(list.map((r) => r.piano_id))];
  const territoriById: Record<string, string | null> = {};
  if (pianoIds.length) {
    const { data: piani } = await supabaseAdmin.from('mappa_piani').select('id, territorio').in('id', pianoIds);
    (piani ?? []).forEach((p: { id: string; territorio: string | null }) => { territoriById[p.id] = p.territorio ?? null; });
  }

  // Conteggio voci (una query)
  const rapIds = list.map((r) => r.id);
  const vociCount: Record<string, number> = {};
  if (rapIds.length) {
    const { data: voci } = await supabaseAdmin.from('rapportino_voci').select('rapportino_id').in('rapportino_id', rapIds);
    (voci ?? []).forEach((v: { rapportino_id: string }) => { vociCount[v.rapportino_id] = (vociCount[v.rapportino_id] ?? 0) + 1; });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const nowIso = now.toISOString();
  const out = list.map((r) => ({
    ...r,
    territorio: territoriById[r.piano_id] ?? null,
    url: `${base}/r/${r.token}`,
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string }, nowIso),
    nVoci: vociCount[r.id] ?? 0,
  }));
  return NextResponse.json(out);
}
```

- [ ] **Step 2: `npx tsc --noEmit` pulito**

- [ ] **Step 3: Commit**
```bash
git add app/api/mappa/rapportini/riepilogo/route.ts
git commit -m "feat(rapportini): API riepilogo rapportini (aggregato per range)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task A3: Componente `RiepilogoRapportini`

**Files:** Create `components/modules/mappa/RiepilogoRapportini.tsx`

- [ ] **Step 1: Implementare il componente**
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { statoBadge, whatsappHref } from '@/utils/rapportini/links';
import { groupRapportiniByDay, type RapRiepilogo, type GiornoGruppo } from '@/utils/rapportini/groupByDay';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function RiepilogoRapportini() {
  const [gruppi, setGruppi] = useState<GiornoGruppo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmPiano, setConfirmPiano] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mappa/rapportini/riepilogo');
      const data = await res.json();
      setGruppi(groupRapportiniByDay(Array.isArray(data) ? (data as RapRiepilogo[]) : []));
    } catch {
      setGruppi([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const copia = async (r: RapRiepilogo) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch { /* noop */ }
  };

  const eliminaPiano = async (pianoId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/mappa/piani?id=${pianoId}`, { method: 'DELETE' });
      await carica();
    } finally {
      setBusy(false);
      setConfirmPiano(null);
    }
  };

  const rimuoviOperatore = async (pianoId: string, staffId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/mappa/piani/operatore?pianoId=${pianoId}&staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' });
      await carica();
    } finally {
      setBusy(false);
      setConfirmOp(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-[var(--brand-text-muted)]">Caricamento riepilogo...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold">Riepilogo rapportini</h2>

      {gruppi.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun rapportino.
        </div>
      ) : (
        gruppi.map((g) => (
          <div key={g.data} className="space-y-3">
            <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(g.data)}</h3>
            {g.piani.map((p) => (
              <div key={p.piano_id} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--brand-text-main)]">
                    {p.territorio ?? 'Senza territorio'} · {p.operatori.length} operatori
                  </span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/hub/mappa?vista=pianifica&pianoId=${p.piano_id}`}
                      className="rounded border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand-primary)] hover:opacity-90"
                    >
                      Riapri
                    </a>
                    {confirmPiano === p.piano_id ? (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => eliminaPiano(p.piano_id)} disabled={busy}
                          className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-50">
                          Elimina piano
                        </button>
                        <button onClick={() => setConfirmPiano(null)}
                          className="rounded border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)]">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmPiano(p.piano_id)}
                        className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]">
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {p.operatori.map((r) => {
                    const badge = statoBadge(r.statoCalcolato);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--brand-text-main)]">{r.staff_name ?? 'Operatore'}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                          <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => copia(r)}
                            className="rounded bg-[var(--brand-primary)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.16_0.06_245)] hover:bg-[var(--brand-primary-hover)]">
                            {copiedToken === r.token ? '✓ Copiato!' : '🔗 Copia link'}
                          </button>
                          <a href={whatsappHref(r.staff_name, fmtData(r.data), r.url)} target="_blank" rel="noopener noreferrer"
                            className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)] hover:opacity-80">WhatsApp</a>
                          <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                            className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]">Excel</a>
                          {confirmOp === r.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button onClick={() => rimuoviOperatore(r.piano_id, r.staff_id)} disabled={busy}
                                className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
                              <button onClick={() => setConfirmOp(null)}
                                className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)]">No</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmOp(r.id)}
                              className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]">Rimuovi</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit` pulito**

- [ ] **Step 3: Commit**
```bash
git add components/modules/mappa/RiepilogoRapportini.tsx
git commit -m "feat(rapportini): vista riepilogo per giorno/piano/operatore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task A4: Card landing + vista `riepilogo`

**Files:** Modify `app/hub/mappa/page.tsx`

- [ ] **Step 1: Import.** Dopo `import RegistroPianificazioni from '@/components/modules/mappa/RegistroPianificazioni';` aggiungere:
```ts
import RiepilogoRapportini from '@/components/modules/mappa/RiepilogoRapportini';
```

- [ ] **Step 2: 3ª card.** Nella landing (`vista === ''`), dentro il `<div className="grid gap-4 sm:grid-cols-2">`, dopo la card "Registro pianificazioni" (la seconda `<a href="/hub/mappa?vista=registro" ...>...</a>`), aggiungere:
```tsx
          <a
            href="/hub/mappa?vista=riepilogo"
            className="group rounded-2xl border border-[var(--brand-border)]
                       bg-[var(--brand-surface)] p-5 shadow-sm transition
                       hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center
                            rounded-xl bg-[var(--brand-primary-soft)]
                            text-[var(--brand-primary)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Riepilogo rapportini</h2>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">Stati per giorno e operatore</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
              <span>Apri</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </a>
```

- [ ] **Step 3: Render della vista.** Dopo il blocco `{vista === 'registro' && ( <RegistroPianificazioni /> )}` aggiungere:
```tsx
      {vista === 'riepilogo' && (
        <RiepilogoRapportini />
      )}
```

- [ ] **Step 4: `npx tsc --noEmit` pulito**

- [ ] **Step 5: Commit**
```bash
git add app/hub/mappa/page.tsx
git commit -m "feat(rapportini): card + vista riepilogo nel modulo mappa" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C1: util `voceEsitoColore`

**Files:** Create `utils/rapportini/voceColore.ts` + `utils/rapportini/voceColore.test.ts`

- [ ] **Step 1: Test (fallisce)** — `utils/rapportini/voceColore.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { voceEsitoColore } from './voceColore';
import type { TemplateCampo } from './buildVoci';

const standard: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'assente', etichetta: 'ASSENTE', tipo: 'crocetta', ordine: 2 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 },
];
const eseguito: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
];

describe('voceEsitoColore', () => {
  it('crocetta ASSENTE → rossa', () => { expect(voceEsitoColore({ assente: true }, standard)).toBe('rossa'); });
  it('crocetta positiva → verde', () => { expect(voceEsitoColore({ att_cess: true }, standard)).toBe('verde'); });
  it('ASSENTE ha priorità sul positivo', () => { expect(voceEsitoColore({ att_cess: true, assente: true }, standard)).toBe('rossa'); });
  it('select NO → rossa, SI → verde', () => {
    expect(voceEsitoColore({ eseguito: 'NO' }, eseguito)).toBe('rossa');
    expect(voceEsitoColore({ eseguito: 'SI' }, eseguito)).toBe('verde');
  });
  it('solo note o vuoto → neutro', () => {
    expect(voceEsitoColore({ note: 'x' }, standard)).toBe('neutro');
    expect(voceEsitoColore({}, standard)).toBe('neutro');
  });
});
```

- [ ] **Step 2: Eseguire → FAIL** — `npx vitest run utils/rapportini/voceColore.test.ts`

- [ ] **Step 3: Implementare** — `utils/rapportini/voceColore.ts`
```ts
import type { TemplateCampo } from './buildVoci';

const NEG_SELECT = /^(no|assente|negativ\w*|ko)$/i;

export function voceEsitoColore(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): 'verde' | 'rossa' | 'neutro' {
  let positivo = false;
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true) {
        if (/assent/i.test(`${c.chiave} ${c.etichetta}`)) return 'rossa';
        positivo = true;
      }
    } else if (c.tipo === 'select') {
      if (typeof v === 'string' && v.trim() !== '') {
        if (NEG_SELECT.test(v.trim())) return 'rossa';
        positivo = true;
      }
    }
  }
  return positivo ? 'verde' : 'neutro';
}
```

- [ ] **Step 4: Eseguire → PASS** — `npx vitest run utils/rapportini/voceColore.test.ts`

- [ ] **Step 5: Commit**
```bash
git add utils/rapportini/voceColore.ts utils/rapportini/voceColore.test.ts
git commit -m "feat(rapportini): voceEsitoColore puro + test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C2: Colore card nel rapportino digitale

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Import.** Dopo `import type { TemplateCampo } from '@/utils/rapportini/buildVoci';` aggiungere:
```ts
import { voceEsitoColore } from '@/utils/rapportini/voceColore';
```

- [ ] **Step 2: Calcolare il colore + applicarlo alla card.** In `VoceCard`, subito dopo la riga `const titolo = voce.nominativo?.trim() || voce.pdr?.trim() || \`Voce ${indice}\`;` aggiungere:
```ts
  const colore = voceEsitoColore(voce.risposte, campi);
  const cardCls =
    colore === 'verde'
      ? 'border-[var(--success)] bg-[var(--success-soft)]'
      : colore === 'rossa'
        ? 'border-[var(--danger)] bg-[var(--danger-soft)]'
        : 'border-[var(--brand-border)] bg-[var(--brand-surface)]';
```
Poi sostituire l'apertura della `<section>` della card:
```tsx
    <section className="overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm">
```
con:
```tsx
    <section className={`overflow-hidden rounded-2xl border shadow-sm transition-colors ${cardCls}`}>
```

- [ ] **Step 3: `npx tsc --noEmit` pulito + `npx vitest run` verde**

- [ ] **Step 4: Commit**
```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): card colorate per esito (verde/rossa/neutra)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task B1: Componente `ManualTaskModal`

**Files:** Create `components/modules/mappa/ManualTaskModal.tsx`

- [ ] **Step 1: Implementare il modale**
```tsx
'use client';

import { useState } from 'react';

export type ManualTaskData = {
  indirizzo: string;
  cap: string;
  citta: string;
  odsin: string;
  pdr: string;
  attivita: string;
  fascia_oraria: string;
  nominativo: string;
  staffId: string;
};

export default function ManualTaskModal({
  operators,
  onClose,
  onAdd,
}: {
  operators: { id: string; displayName: string }[];
  onClose: () => void;
  onAdd: (data: ManualTaskData) => Promise<void> | void;
}) {
  const [d, setD] = useState<ManualTaskData>({
    indirizzo: '', cap: '', citta: '', odsin: '', pdr: '', attivita: '', fascia_oraria: '', nominativo: '', staffId: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ManualTaskData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }));

  const valido = d.indirizzo.trim() !== '' && d.citta.trim() !== '';
  const inputCls = 'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

  const handleAdd = async () => {
    if (!valido || saving) return;
    setSaving(true);
    try {
      await onAdd(d);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-3">
          <h3 className="text-base font-semibold text-[var(--brand-text-main)]">Aggiungi intervento manuale</h3>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">✕</button>
        </div>
        <div className="grid flex-1 gap-3 overflow-auto p-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Indirizzo *</span><input className={inputCls} value={d.indirizzo} onChange={set('indirizzo')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">CAP</span><input className={inputCls} value={d.cap} onChange={set('cap')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Comune *</span><input className={inputCls} value={d.citta} onChange={set('citta')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">ODSIN</span><input className={inputCls} value={d.odsin} onChange={set('odsin')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">PDR</span><input className={inputCls} value={d.pdr} onChange={set('pdr')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Attività</span><input className={inputCls} value={d.attivita} onChange={set('attivita')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Fascia oraria</span><input className={inputCls} value={d.fascia_oraria} onChange={set('fascia_oraria')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nominativo</span><input className={inputCls} value={d.nominativo} onChange={set('nominativo')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Esecutore</span>
            <select className={inputCls} value={d.staffId} onChange={set('staffId')}>
              <option value="">— nessuno / auto —</option>
              {operators.map((o) => (<option key={o.id} value={o.id}>{o.displayName}</option>))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">Annulla</button>
          <button onClick={handleAdd} disabled={!valido || saving} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] hover:opacity-90 disabled:opacity-50">
            {saving ? 'Aggiungo…' : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit` pulito**

- [ ] **Step 3: Commit**
```bash
git add components/modules/mappa/ManualTaskModal.tsx
git commit -m "feat(mappa): modale inserimento intervento manuale" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task B2: Integrazione "Aggiungi manuale" nell'editor

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import.** Vicino agli altri import di componenti (es. dopo l'import di `ManualAssignmentsModal`) aggiungere:
```ts
import ManualTaskModal, { type ManualTaskData } from '@/components/modules/mappa/ManualTaskModal';
```

- [ ] **Step 2: Stato modale.** Accanto agli altri `useState` (es. dopo `const [assignModalOpen, setAssignModalOpen] = useState(false);`) aggiungere:
```ts
  const [manualModalOpen, setManualModalOpen] = useState(false);
```

- [ ] **Step 3: Handler `addManualTask`.** Inserirlo DOPO la definizione di `distributeToOps` (così è in scope come dipendenza) — subito dopo la riga di chiusura `}, [selectedOps, allTasks, ztlZones, manualRules, operatorLocks, esecutorePins]);` di `distributeToOps`:
```ts
  const addManualTask = useCallback(async (data: ManualTaskData) => {
    const operator = data.staffId ? operatorOptions.find((o) => o.id === data.staffId) : undefined;
    const task: Task & { _operatore?: string } = {
      id: `manual-${Date.now()}`,
      indirizzo: data.indirizzo.trim(),
      cap: data.cap.trim(),
      citta: data.citta.trim(),
      odl: '',
      priorita: 0,
      odsin: data.odsin.trim() || undefined,
      pdr: data.pdr.trim() || undefined,
      attivita: data.attivita.trim() || undefined,
      fascia_oraria: data.fascia_oraria.trim(),
      nominativo: data.nominativo.trim() || undefined,
      _operatore: operator?.displayName,
    };
    const geocoded = await geocodeTask(task);
    setExcelTasks((prev) => [...prev, geocoded]);
    setExcelMode(true);
    if (operator) {
      setEsecutorePins((prev) => ({ ...prev, [task.id]: operator.id }));
      setSelectedOps((prev) => {
        if (prev.some((o) => o.id === operator.id)) return prev;
        const isRepOnDay = operator.reperibileDates.includes(planningDate);
        const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
        const base = usesHome
          ? { lat: operator.homeLat!, lng: operator.homeLng! }
          : operator.startLat != null && operator.startLng != null
            ? { lat: operator.startLat, lng: operator.startLng }
            : null;
        const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;
        return [...prev, { id: operator.id, name: operator.displayName, qty: 0, base, startAddress }];
      });
    }
    if (distribution) distributeToOps();
  }, [operatorOptions, planningDate, distribution, distributeToOps]);
```

- [ ] **Step 4: Pulsante "Aggiungi manuale".** Trovare il pulsante "+ Aggiungi attività da template" (`{excelMode && ( <button ... onClick={() => fileTemplateInputRef.current?.click()} ...>+ Aggiungi attività da template</button> )}`). SUBITO DOPO la sua chiusura `)}`, aggiungere:
```tsx
                          {excelMode && (
                            <button
                              type="button"
                              onClick={() => setManualModalOpen(true)}
                              className="rounded-lg border border-[var(--brand-violet)]/40 bg-[var(--brand-violet-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-violet)] hover:opacity-90"
                            >
                              + Aggiungi manuale
                            </button>
                          )}
```

- [ ] **Step 5: Render del modale.** Vicino agli altri modali in fondo al JSX (es. dove è renderizzato `{assignModalOpen && (<ManualAssignmentsModal ... />)}`), aggiungere:
```tsx
      {manualModalOpen && (
        <ManualTaskModal
          operators={operatorOptions.map((o) => ({ id: o.id, displayName: o.displayName }))}
          onClose={() => setManualModalOpen(false)}
          onAdd={addManualTask}
        />
      )}
```

- [ ] **Step 6: `npx tsc --noEmit` pulito**

- [ ] **Step 7: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): pulsante e modale Aggiungi manuale nell'editor" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Note: `geocodeTask`, `Task`, `operatorOptions`, `planningDate`, `distribution`, `distributeToOps`, `setExcelTasks`, `setExcelMode`, `setEsecutorePins`, `setSelectedOps` sono tutti già in scope/importati. Il pulsante condivide il gating `excelMode` del pulsante template (come richiesto: "oltre ad aggiungi da template"). `OpConfig` shape: `{ id, name, qty, base, startAddress }`.

---

## Task V: Verifica end-to-end

**Files:** nessuno (verifica). App + Supabase (`npm run dev`).

- [ ] **Step 1: Suite + tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tutti i test PASS (inclusi i nuovi `groupByDay`, `voceColore`), nessun errore di tipo.

- [ ] **Step 2: A — Riepilogo** — `/hub/mappa` → card "Riepilogo rapportini" → giorni con piani e operatori (stato, link); **Riapri** apre l'editor; **Elimina** piano e **Rimuovi** operatore funzionano (refresh) e i link rimossi vanno in "non trovato".
- [ ] **Step 3: B — Aggiungi manuale** — editor (dopo un import) → "+ Aggiungi manuale" → compila Indirizzo+Comune (+ eventuale Esecutore) → Aggiungi → il punto compare sulla mappa ed entra nella distribuzione; con esecutore scelto, l'intervento è fissato a quell'operatore.
- [ ] **Step 4: C — Card colorate** — apri un `/r/<token>` → compila un esito positivo (SI / crocetta) → card **verde**; metti NO/ASSENTE → card **rossa**; vuota → neutra.

---

## Note per chi esegue

- **Nessuna SQL / migrazione.**
- A: `RapportinoStato` (da `utils/rapportini/links`) esteso con `piano_id`+`territorio` in `RapRiepilogo`; la rotta riepilogo restituisce esattamente quei campi.
- B: l'handler `addManualTask` va definito DOPO `distributeToOps` (per le dipendenze) e replica la logica base/indirizzo di `toggleOp`. Il pin esecutore usa `staffId` diretto (niente match per nome).
- C: il colore è reattivo perché `VoceCard` ricalcola `voceEsitoColore(voce.risposte, campi)` ad ogni render; la `<section>` cambia bordo/sfondo. `--success`/`--danger`/`*-soft` già usati altrove.
- Coerenza tipi: `statoBadge`/`whatsappHref` (links), `tokenStatus`, `TemplateCampo` (buildVoci) riusati.
