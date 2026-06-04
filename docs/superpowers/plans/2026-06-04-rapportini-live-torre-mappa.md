# Rapportini Live (torre + mappa monitoraggio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far apparire in torre di controllo e in una mappa di monitoraggio lo stato di ogni intervento (Fatto/Non fatto/Da fare) **già all'autosave** del rapportino interattivo, non più solo all'invio di fine giornata, con aggiornamento Realtime + polling 5 min + tasto manuale.

**Architecture:** L'autosave di ogni voce ([app/api/r/[token]/voce/route.ts](../../../app/api/r/%5Btoken%5D/voce/route.ts)) propaga subito l'esito sulla tabella `interventi` riusando la stessa logica testata dell'invio finale. La torre (già in ascolto Realtime su `interventi`) e una nuova vista mappa snella riusano quei dati, con polling 5 min e tasto "Aggiorna ora" come rete di sicurezza. Un nuovo endpoint admin-only `GET /api/interventi/giorno` serve sia torre che mappa.

**Tech Stack:** Next.js 15 (App Router, route handler `runtime=nodejs`), Supabase (`supabaseAdmin` service-role + Realtime postgres_changes), React 19, Leaflet (dynamic import, ssr:false), Vitest (TDD logica pura), TypeScript.

**Spec:** [docs/superpowers/specs/2026-06-04-rapportini-live-torre-mappa-design.md](../specs/2026-06-04-rapportini-live-torre-mappa-design.md)

**Note operative:**
- Branch corrente: `feat/rapportini-live` (già creato, la spec è già committata).
- `npm run lint` è rosso di baseline sul repo: validare i file toccati con `npx eslint <path>` (deve essere pulito sui file nuovi/modificati), non col lint globale.
- Test runner: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`.

---

## File Structure

| File | Responsabilità |
|---|---|
| `lib/interventi/esitoDaVoce.ts` | + `patchInterventoLiveDaVoce`: decide se l'autosave deve *completare* o *riaprire* l'intervento (logica pura) |
| `lib/interventi/esitoDaVoce.test.ts` | + test della nuova funzione |
| `app/api/r/[token]/voce/route.ts` | autosave voce → in più, propaga l'esito su `interventi` |
| `utils/routing/types.ts` | `Task` + campi `stato`/`esito` |
| `lib/interventi/mappaInterventi.ts` | `InterventoGeoRow.esito` + `mapInterventoToTask` mappa `stato`/`esito` |
| `lib/interventi/mappaInterventi.test.ts` | aggiorna test esistente + nuovo caso stato/esito |
| `app/api/interventi/giorno/route.ts` | **nuovo** endpoint admin-only: interventi del giorno (tutti gli stati) |
| `components/modules/torre/TorreControlloClient.tsx` | + tasto "Aggiorna ora", polling 5 min, "ultimo aggiornamento" |
| `components/modules/mappa/MonitoraggioMappaClient.tsx` | **nuovo** componente: mappa live del giorno (riusa `TorreMappa`) |
| `app/hub/mappa/page.tsx` | + vista `monitoraggio` + card nella landing |

---

## Task 1: Logica pura `patchInterventoLiveDaVoce`

**Files:**
- Modify: `lib/interventi/esitoDaVoce.ts`
- Test: `lib/interventi/esitoDaVoce.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `lib/interventi/esitoDaVoce.test.ts` (e aggiorna l'import sulla riga 2):

```ts
// riga 2: import { esitoInterventoDaVoce } from './esitoDaVoce';
// diventa:
import { esitoInterventoDaVoce, patchInterventoLiveDaVoce } from './esitoDaVoce';
```

```ts
describe('patchInterventoLiveDaVoce', () => {
  it('verde (SI) → completa con eseguito_positivo', () => {
    expect(patchInterventoLiveDaVoce({ eseguito: 'SI' }, campi)).toEqual({
      azione: 'completa', esito: 'eseguito_positivo', esito_motivo: null,
    });
  });
  it('rossa (NO) + nota → completa con esito null e motivo (trim)', () => {
    expect(patchInterventoLiveDaVoce({ eseguito: 'NO', note: ' Assente ' }, campi)).toEqual({
      azione: 'completa', esito: null, esito_motivo: 'Assente',
    });
  });
  it('neutro (vuoto) → riapri', () => {
    expect(patchInterventoLiveDaVoce({}, campi)).toEqual({ azione: 'riapri' });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

Run: `npx vitest run lib/interventi/esitoDaVoce.test.ts`
Expected: FAIL — `patchInterventoLiveDaVoce is not a function` / export mancante.

- [ ] **Step 3: Implementa la funzione**

Aggiungi in fondo a `lib/interventi/esitoDaVoce.ts`:

```ts
export type PatchInterventoLive =
  | { azione: 'completa'; esito: 'eseguito_positivo' | null; esito_motivo: string | null }
  | { azione: 'riapri' };

/**
 * Patch "live" per la propagazione a ogni autosave voce (la voce è lo specchio
 * dell'intervento):
 * - voce con esito (verde/rossa) → 'completa' (chiudi l'intervento);
 * - voce neutra (azzerata) → 'riapri' (riporta l'intervento a "Da fare").
 */
export function patchInterventoLiveDaVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): PatchInterventoLive {
  const patch = esitoInterventoDaVoce(risposte, campi);
  if (patch) return { azione: 'completa', esito: patch.esito, esito_motivo: patch.esito_motivo };
  return { azione: 'riapri' };
}
```

`TemplateCampo` è già importato in cima al file. Nessun nuovo import.

- [ ] **Step 4: Esegui il test per verificare che passa**

Run: `npx vitest run lib/interventi/esitoDaVoce.test.ts`
Expected: PASS (tutti i test, vecchi e nuovi).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/esitoDaVoce.ts lib/interventi/esitoDaVoce.test.ts
git commit -m "feat(rapportini-live): patchInterventoLiveDaVoce (completa/riapri) + test"
```

---

## Task 2: Propagazione live nell'autosave voce

**Files:**
- Modify: `app/api/r/[token]/voce/route.ts`

Nessun unit test (route handler con Supabase, come il resto del progetto). Verifica con typecheck + lint.

- [ ] **Step 1: Riscrivi il route handler**

Sostituisci **l'intero contenuto** di `app/api/r/[token]/voce/route.ts` con:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, campi_snapshot')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id')
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagazione live: l'intervento collegato riflette SUBITO lo stato della voce.
  // Un errore qui NON deve far fallire l'autosave (la voce è la fonte di verità;
  // l'invio finale riapplica comunque gli esiti).
  const interventoId = (voce as { intervento_id: string | null }).intervento_id;
  if (interventoId) {
    const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
    const patch = patchInterventoLiveDaVoce((risposte ?? {}) as Record<string, unknown>, campi);
    const nowIso = new Date().toISOString();
    const interventoPatch =
      patch.azione === 'completa'
        ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: nowIso }
        : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
    const { error: errInt } = await supabaseAdmin
      .from('interventi')
      .update(interventoPatch)
      .eq('id', interventoId)
      .neq('stato', 'annullato');
    if (errInt) console.error('[r/voce] propagazione intervento fallita:', errInt.message);
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
```

Differenze dal file originale: `select('id, stato, data, campi_snapshot')` sul rapportino, `select('id, intervento_id')` sulla voce, e il blocco di propagazione.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore introdotto dal file (0 errori, o invariato rispetto alla baseline).

- [ ] **Step 3: Lint mirato**

Run: `npx eslint app/api/r/[token]/voce/route.ts`
Expected: nessun errore/warning.

- [ ] **Step 4: Commit**

```bash
git add app/api/r/[token]/voce/route.ts
git commit -m "feat(rapportini-live): autosave voce propaga l'esito su interventi"
```

---

## Task 3: `Task` con `stato`/`esito` + mapper

**Files:**
- Modify: `utils/routing/types.ts`
- Modify: `lib/interventi/mappaInterventi.ts`
- Test: `lib/interventi/mappaInterventi.test.ts`

- [ ] **Step 1: Aggiorna i test (falliranno)**

In `lib/interventi/mappaInterventi.test.ts`:

(a) nell'helper `row()`, aggiungi `esito: null` ai default (dopo `data: '2026-06-04',`):

```ts
    data: '2026-06-04',
    esito: null,
    ...overrides,
```

(b) nel test `'mappa tutti i campi di una riga completa'`, aggiungi `stato` ed `esito` all'oggetto atteso (dentro `toEqual({...})`, dopo `durata_min: 45,`):

```ts
      durata_min: 45,
      stato: 'da_assegnare',
      esito: null,
    });
```

(c) aggiungi un nuovo test dentro `describe('mapInterventoToTask', ...)`:

```ts
  it('propaga stato/esito di un intervento completato', () => {
    const t = mapInterventoToTask(row({ stato: 'completato', esito: 'eseguito_positivo' }));
    expect(t.stato).toBe('completato');
    expect(t.esito).toBe('eseguito_positivo');
  });
```

- [ ] **Step 2: Esegui i test per verificare che falliscono**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: FAIL — il risultato di `mapInterventoToTask` non contiene `stato`/`esito`.

- [ ] **Step 3: Implementa**

(a) In `utils/routing/types.ts`, dentro `interface Task`, aggiungi due campi (dopo `appointmentDate?: string;`, prima della `}` di chiusura):

```ts
  appointmentDate?: string;
  // Stato operativo (popolato solo quando il Task viene da un intervento del giorno)
  stato?: string;
  esito?: string | null;
}
```

(b) In `lib/interventi/mappaInterventi.ts`, aggiungi `esito` a `InterventoGeoRow` (dopo `data: string;`):

```ts
  data: string;
  esito: string | null;
};
```

(c) In `lib/interventi/mappaInterventi.ts`, dentro `mapInterventoToTask`, aggiungi le ultime due proprietà (dopo `durata_min: row.durata_stimata_min ?? undefined,`):

```ts
    durata_min: row.durata_stimata_min ?? undefined,
    stato: row.stato ?? undefined,
    esito: row.esito ?? null,
  };
```

- [ ] **Step 4: Esegui i test per verificare che passano**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore introdotto.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/types.ts lib/interventi/mappaInterventi.ts lib/interventi/mappaInterventi.test.ts
git commit -m "feat(rapportini-live): Task con stato/esito + mapInterventoToTask"
```

---

## Task 4: Endpoint `GET /api/interventi/giorno`

**Files:**
- Create: `app/api/interventi/giorno/route.ts`

Endpoint admin-only che ritorna **tutti** gli interventi del giorno (ogni stato), con i campi usati da torre e mappa. Usa `requireAdmin()` (già esistente in `lib/apiAuth.ts:39`) per il guard e il client di sessione (RLS) per la query.

- [ ] **Step 1: Crea il route handler**

Crea `app/api/interventi/giorno/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const COLONNE =
  'id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo, lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria, territorio_id';

/**
 * GET /api/interventi/giorno?data=YYYY-MM-DD
 * Admin-only. Ritorna { interventi: [...] } — tutti gli interventi del giorno
 * (ogni stato), nella forma attesa da TorreIntervento. Usato dalla torre
 * (polling/tasto) e dalla mappa di monitoraggio.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json(
      { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });

  const { data: rows, error } = await supabase
    .from('interventi')
    .select(COLONNE)
    .eq('data', data)
    .order('comune', { ascending: true })
    .order('indirizzo', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ interventi: rows ?? [] });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Lint mirato**

Run: `npx eslint app/api/interventi/giorno/route.ts`
Expected: pulito.

- [ ] **Step 4: Commit**

```bash
git add app/api/interventi/giorno/route.ts
git commit -m "feat(rapportini-live): endpoint admin /api/interventi/giorno"
```

---

## Task 5: Torre — tasto "Aggiorna ora" + polling 5 min + ultimo aggiornamento

**Files:**
- Modify: `components/modules/torre/TorreControlloClient.tsx`

La torre mantiene la subscription Realtime esistente. Aggiungiamo refresh manuale/periodico che riusa l'endpoint del Task 4 e fa `setItems`.

- [ ] **Step 1: Aggiorna import React**

Riga 3: `import { useEffect, useState } from 'react';` → aggiungi `useCallback`:

```ts
import { useCallback, useEffect, useState } from 'react';
```

- [ ] **Step 2: Aggiungi state e funzione refresh**

Subito dopo `const [live, setLive] = useState(false);` (riga 53), aggiungi:

```ts
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
```

Subito dopo `const router = useRouter();` (riga 56), aggiungi:

```ts
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/interventi/giorno?data=${data}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { interventi?: TorreIntervento[] };
      setItems(json.interventi ?? []);
      setLastUpdate(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      /* errore di rete: ritenta al prossimo giro di polling */
    }
  }, [data]);
```

- [ ] **Step 3: Aggiungi l'effetto di polling (pausa in background)**

Subito dopo la `}, [data]);` di chiusura dell'useEffect del Realtime (riga 86), aggiungi un nuovo effetto:

```ts
  useEffect(() => {
    const INTERVAL = 5 * 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { void refresh(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);
```

- [ ] **Step 4: Aggiungi tasto e indicatore in header**

Nel blocco `<div className="flex items-center gap-2">` dell'header (riga 119), subito **dopo** l'`<input type="date" .../>` (chiude a riga 126) e **prima** dello `<span ...>` del badge Live (riga 127), inserisci il tasto:

```tsx
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)]"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            title="Ricarica subito gli interventi del giorno"
          >
            Aggiorna ora
          </button>
```

Poi, subito **dopo** lo `</span>` di chiusura del badge Live (riga 136), aggiungi l'indicatore dell'ultimo aggiornamento:

```tsx
          {lastUpdate && (
            <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              agg. {lastUpdate}
            </span>
          )}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npx eslint components/modules/torre/TorreControlloClient.tsx`
Expected: pulito.

- [ ] **Step 6: Commit**

```bash
git add components/modules/torre/TorreControlloClient.tsx
git commit -m "feat(rapportini-live): torre con polling 5min + tasto Aggiorna ora"
```

---

## Task 6: Componente `MonitoraggioMappaClient`

**Files:**
- Create: `components/modules/mappa/MonitoraggioMappaClient.tsx`

Mappa live degli interventi del giorno. Riusa `TorreMappa` (disegno marker colorati per stato) e lo stesso pattern Realtime della torre; aggiunge fetch iniziale, polling 5 min, tasto "Aggiorna ora", selettore data e legenda. Self-contained: carica i dati da `/api/interventi/giorno`.

- [ ] **Step 1: Crea il componente**

Crea `components/modules/mappa/MonitoraggioMappaClient.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { coloreStato } from '@/lib/interventi/torreView';
import type { TorreIntervento } from '@/components/modules/torre/TorreControlloClient';

const TorreMappa = dynamic(() => import('@/components/modules/torre/TorreMappa'), { ssr: false });

function oggiRoma(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function oraIt(): string {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const LEGENDA: Array<{ dot: string; label: string }> = [
  { dot: '#22c55e', label: 'Fatto' },
  { dot: '#ef4444', label: 'Non fatto' },
  { dot: '#fbbf24', label: 'Da fare' },
  { dot: '#38bdf8', label: 'In corso' },
  { dot: '#9ca3af', label: 'Annullato' },
];

export default function MonitoraggioMappaClient() {
  const [data, setData] = useState(oggiRoma());
  const [items, setItems] = useState<TorreIntervento[]>([]);
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/interventi/giorno?data=${data}`, { cache: 'no-store' });
      if (res.status === 403) { setErrore('Accesso riservato agli admin.'); setItems([]); return; }
      if (!res.ok) return;
      const json = (await res.json()) as { interventi?: TorreIntervento[] };
      setItems(json.interventi ?? []);
      setErrore(null);
      setLastUpdate(oraIt());
    } catch {
      /* errore di rete: ritenta al prossimo giro */
    }
  }, [data]);

  // Fetch iniziale + a ogni cambio data
  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime su interventi del giorno (stesso pattern della torre)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`monitoraggio-${data}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi', filter: `data=eq.${data}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string } | null)?.id;
              return oldId ? prev.filter((x) => x.id !== oldId) : prev;
            }
            const next = payload.new as TorreIntervento;
            if (!next?.id) return prev;
            const idx = prev.findIndex((x) => x.id === next.id);
            if (idx === -1) return [...prev, next];
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
          setLastUpdate(oraIt());
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, [data]);

  // Polling 5 min, in pausa quando la scheda è in background
  useEffect(() => {
    const INTERVAL = 5 * 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { void refresh(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const totali = items.reduce(
    (acc, it) => {
      const t = coloreStato(it.stato, it.esito);
      if (t === 'ok') acc.fatti += 1;
      else if (t === 'ko') acc.nonFatti += 1;
      else if (t === 'attesa') acc.daFare += 1;
      return acc;
    },
    { fatti: 0, nonFatti: 0, daFare: 0 },
  );

  return (
    <main className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Monitoraggio oggi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            {data} · {items.length} interventi · ✅ {totali.fatti} · ❌ {totali.nonFatti} · ⏳ {totali.daFare}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)]"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            title="Ricarica subito gli interventi del giorno"
          >
            Aggiorna ora
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: live ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
              color: live ? 'var(--success)' : 'var(--brand-text-muted)',
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: live ? '#22c55e' : '#9ca3af' }} />
            {live ? 'Live' : 'Non connesso'}
          </span>
          {lastUpdate && (
            <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>agg. {lastUpdate}</span>
          )}
        </div>
      </header>

      {errore ? (
        <div
          className="rounded-2xl border px-4 py-6 text-center text-sm"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-muted)' }}
        >
          {errore}
        </div>
      ) : (
        <>
          <TorreMappa interventi={items} />
          <div className="flex flex-wrap items-center gap-3 px-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            {LEGENDA.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.dot }} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npx eslint components/modules/mappa/MonitoraggioMappaClient.tsx`
Expected: pulito.

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/MonitoraggioMappaClient.tsx
git commit -m "feat(rapportini-live): MonitoraggioMappaClient (mappa live del giorno)"
```

---

## Task 7: Pagina mappa — vista `monitoraggio` + card landing

**Files:**
- Modify: `app/hub/mappa/page.tsx`

- [ ] **Step 1: Importa il componente**

Dopo l'import di `RiepilogoRapportini` (riga 12), aggiungi:

```ts
import MonitoraggioMappaClient from '@/components/modules/mappa/MonitoraggioMappaClient';
```

- [ ] **Step 2: Aggiungi la card nella landing**

Nel blocco `{vista === '' && (...)}`, dentro la griglia `<div className="grid gap-4 sm:grid-cols-2">`, aggiungi una quarta card **dopo** la card "Riepilogo rapportini" (subito prima del `</div>` che chiude la griglia, riga ~354):

```tsx
          <a
            href="/hub/mappa?vista=monitoraggio"
            className="group rounded-2xl border border-[var(--brand-border)]
                       bg-[var(--brand-surface)] p-5 shadow-sm transition
                       hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center
                            rounded-xl bg-[var(--brand-primary-soft)]
                            text-[var(--brand-primary)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </div>
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Monitoraggio oggi</h2>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">Interventi del giorno live sulla mappa</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
              <span>Apri</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </a>
```

- [ ] **Step 3: Aggiungi il blocco vista**

Dopo il blocco `{vista === 'riepilogo' && (<RiepilogoRapportini />)}` (riga ~381) e **prima** del `</div>` di chiusura del wrapper, aggiungi:

```tsx
      {vista === 'monitoraggio' && (
        <MonitoraggioMappaClient />
      )}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npx eslint app/hub/mappa/page.tsx`
Expected: pulito.

- [ ] **Step 5: Build di verifica**

Run: `npm run build`
Expected: build OK (la rotta `/hub/mappa` e `/api/interventi/giorno` compilano senza errori).

- [ ] **Step 6: Commit**

```bash
git add app/hub/mappa/page.tsx
git commit -m "feat(rapportini-live): vista mappa Monitoraggio oggi + card landing"
```

---

## Verifica finale (manuale, dopo tutti i task)

- [ ] **Tutti i test verdi:** `npx vitest run` → tutti pass.
- [ ] **Typecheck:** `npx tsc --noEmit` → nessun errore.
- [ ] **Lint dei file toccati** (baseline globale rossa, quindi mirato):
  `npx eslint lib/interventi/esitoDaVoce.ts app/api/r/[token]/voce/route.ts utils/routing/types.ts lib/interventi/mappaInterventi.ts app/api/interventi/giorno/route.ts components/modules/torre/TorreControlloClient.tsx components/modules/mappa/MonitoraggioMappaClient.tsx app/hub/mappa/page.tsx`
  → pulito.
- [ ] **Smoke test manuale del flusso live:**
  1. Apri `/hub/torre` come admin.
  2. In un'altra scheda apri un rapportino `/r/<token>` valido del giorno, compila una voce fino a renderla verde (Fatto). Attendi l'autosave (~1s).
  3. La torre deve mostrare quell'intervento come **Fatto** entro pochi secondi (Realtime) o al massimo al polling/tasto "Aggiorna ora".
  4. Azzera la voce nel rapportino → l'intervento torna **Da fare** in torre.
  5. Apri `/hub/mappa?vista=monitoraggio`: i marker riflettono gli stessi stati, con legenda e "Aggiorna ora".

---

## Self-Review (eseguita)

**Spec coverage:**
- Parte 1 (propagazione autosave) → Task 1 + Task 2 ✓
- Parte 2 (torre: realtime già presente + polling + tasto + last-update) → Task 5 ✓
- Parte 3 (mappa monitoraggio: Task stato/esito, endpoint giorno, vista dedicata) → Task 3, 4, 6, 7 ✓
- Riapertura su voce neutra → Task 1 (`riapri`) + Task 2 (patch `assegnato`) ✓
- Endpoint condiviso torre+mappa → Task 4, usato in Task 5 e Task 6 ✓
- Test TDD su logica pura → Task 1, Task 3 ✓
- Realtime già abilitato (nessuna migration) → confermato nella spec ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto.

**Type consistency:** `patchInterventoLiveDaVoce` ritorna `{ azione: 'completa' | 'riapri' }` in Task 1, usata identica in Task 2. `TorreIntervento` (campi `stato`, `esito`) riusato in Task 5/6. `coloreStato(stato, esito)` riusato coerentemente. `Task.stato?/esito?` definiti in Task 3 e usati dal mapper. Endpoint ritorna `{ interventi }` consumato come `json.interventi` in Task 5/6.

**Note di scope (follow-up, non in questo piano):** la card "Monitoraggio oggi" è visibile nel modulo mappa a tutti gli utenti del modulo; i dati restano protetti dall'endpoint admin-only (403 → messaggio). Nasconderla ai non-admin è un miglioramento separato.
