# Task-via "BONIFICHE EXTRA" — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** L'operatore apre un task-via (attività BONIFICHE EXTRA) e crea per quella via uno o più interventi col "+" (Italgas + via pre-compilati), che vanno in Lista attesa collegati al task-via.

**Architecture:** Tutto additivo: il nuovo comportamento si attiva SOLO per voci con `attivita === 'BONIFICHE EXTRA'`. Si riusa il "+" esistente (`ModaleInterventoManuale`, offline-first) aggiungendo prop opzionali di pre-compilazione + un `parentVoceId` che viaggia nel payload (anche offline) e finisce in una nuova colonna nullable `interventi_manuali.parent_voce_id`. Nuovo schermo operatore `TaskViaFocus` (derivato dalla vista focus, senza toccare `VoceFocus`).

**Tech Stack:** Next.js (route handler Node + React client), Supabase, IndexedDB outbox, TypeScript, vitest.

---

### Task 1: Migrazione colonna `parent_voce_id` (passo manuale)

**Files:**
- Create: `supabase/migrations/20260616120000_interventi_manuali_parent_voce.sql`

- [ ] **Step 1: Crea il file migrazione**

```sql
-- Collega una richiesta manuale "+" al task-via padre (voce di pianificazione
-- con attività BONIFICHE EXTRA). Nullable e additivo: le richieste senza parent
-- restano valide e invariate.
alter table interventi_manuali
  add column if not exists parent_voce_id uuid;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260616120000_interventi_manuali_parent_voce.sql
git commit -m "chore(db): migrazione parent_voce_id su interventi_manuali (task-via)"
```

NB: la migrazione la lancia l'utente sul prod (no DDL automatico).

---

### Task 2: Helper `isTaskVia`

**Files:**
- Create: `lib/interventi/manuali/taskVia.ts`
- Test: `lib/interventi/manuali/taskVia.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isTaskVia, ATTIVITA_TASK_VIA } from './taskVia';

describe('isTaskVia', () => {
  it('riconosce una voce con attività BONIFICHE EXTRA (case/spazi tolleranti)', () => {
    expect(isTaskVia({ attivita: 'BONIFICHE EXTRA' })).toBe(true);
    expect(isTaskVia({ attivita: '  bonifiche extra ' })).toBe(true);
  });
  it('false per attività diverse o assenti', () => {
    expect(isTaskVia({ attivita: 'Sostituzione' })).toBe(false);
    expect(isTaskVia({ attivita: '' })).toBe(false);
    expect(isTaskVia({})).toBe(false);
    expect(isTaskVia(null)).toBe(false);
  });
  it('espone la costante', () => {
    expect(ATTIVITA_TASK_VIA).toBe('BONIFICHE EXTRA');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/manuali/taskVia.test.ts`
Expected: FAIL — "Cannot find module './taskVia'".

- [ ] **Step 3: Write minimal implementation**

```ts
// PURA: discrimina i "task-via" (voci di pianificazione a sola via) dall'attività.
export const ATTIVITA_TASK_VIA = 'BONIFICHE EXTRA';

export function isTaskVia(voce: { attivita?: string | null } | null | undefined): boolean {
  return (voce?.attivita ?? '').trim().toUpperCase() === ATTIVITA_TASK_VIA;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/manuali/taskVia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/taskVia.ts lib/interventi/manuali/taskVia.test.ts
git commit -m "feat(manuali): helper isTaskVia (attività BONIFICHE EXTRA)"
```

---

### Task 3: Thread `parentVoceId` nel payload (offline + route)

**Files:**
- Modify: `lib/offline/types.ts`
- Modify: `lib/offline/persistManuale.ts`
- Modify: `lib/offline/sync.ts`
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: `types.ts` — aggiungi il campo a `PayloadManuale`**

In `PayloadManuale` (dopo `note?:`):

```ts
  parentVoceId?: string | null;
```

- [ ] **Step 2: `persistManuale.ts` — aggiungi a `DatiManualeOffline` e propaga**

In `DatiManualeOffline` (dopo `note?:`):

```ts
  parentVoceId?: string | null;
```

E nel payload passato a `costruisciManualeOutbox` (dopo `note: dati.note ?? null,`):

```ts
        parentVoceId: dati.parentVoceId ?? null,
```

- [ ] **Step 3: `sync.ts` — includi nel JSON `dati` del ramo manuale**

Nel ramo `if (item.type === 'manuale')`, nell'oggetto passato a `fd.append('dati', JSON.stringify({ ... }))`, aggiungi (dopo `note: item.payload.note ?? null,`):

```ts
        parentVoceId: item.payload.parentVoceId ?? null,
```

- [ ] **Step 4: `route.ts` — leggi e salva `parent_voce_id`**

Nel tipo di `rawDati` (l'oggetto da `JSON.parse(form.get('dati'))`) aggiungi il campo:

```ts
    parentVoceId?: string;
```

Poi calcola un valore pulito (subito dopo aver costruito `dati`):

```ts
  const parentVoceId = typeof rawDati.parentVoceId === 'string' && rawDati.parentVoceId.trim() !== ''
    ? rawDati.parentVoceId.trim()
    : null;
```

E nell'`insert` di `interventi_manuali` aggiungi la colonna (dopo `intervento_id: interventoId,`):

```ts
      parent_voce_id: parentVoceId,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "offline/(types|persistManuale|sync)|intervento-manuale/route" || echo "OK"`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/types.ts lib/offline/persistManuale.ts lib/offline/sync.ts "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(manuali): parentVoceId nel payload (+ offline) e salvato su interventi_manuali"
```

---

### Task 4: `ModaleInterventoManuale` — pre-compilazione opzionale

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`

- [ ] **Step 1: Aggiungi le prop opzionali**

Nel tipo dei props del componente (dopo `onCreata: (stato: 'inviata' | 'in-coda') => void;`):

```ts
  /** Pre-compilazione (task-via): committente pre-selezionato, anagrafica iniziale, link al task padre. */
  committenteIniziale?: CommittenteManuale;
  anagraficaIniziale?: AnagraficaManuale;
  parentVoceId?: string | null;
```

E destruttura i nuovi props nella firma:

```ts
  committenteIniziale,
  anagraficaIniziale,
  parentVoceId,
```

- [ ] **Step 2: Inizializza lo stato dalla pre-compilazione**

Sostituisci le tre `useState` iniziali:

```ts
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>({});
```

con:

```ts
  const [step, setStep] = useState<1 | 2 | 3 | 4>(committenteIniziale ? 2 : 1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(committenteIniziale ?? null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>(anagraficaIniziale ?? {});
```

- [ ] **Step 3: Passa `parentVoceId` al submit (offline + fallback)**

Nella chiamata `accodaManuale(token, { committente, anagrafica, risposte, fotoFiles: foto }, Date.now())` aggiungi il campo:

```ts
    const esito = await accodaManuale(token, { committente, anagrafica, risposte, fotoFiles: foto, parentVoceId: parentVoceId ?? null }, Date.now());
```

E nel ramo fallback, nell'oggetto `JSON.stringify({ committente, anagrafica, risposte })`:

```ts
      fd.append('dati', JSON.stringify({ committente, anagrafica, risposte, parentVoceId: parentVoceId ?? null }));
```

- [ ] **Step 4: Lint + typecheck**

Run: `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "ModaleInterventoManuale" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx
git commit -m "feat(manuali): + pre-compilabile (committente/anagrafica iniziali + parentVoceId)"
```

---

### Task 5: Endpoint figli del task-via

**Files:**
- Create: `app/api/r/[token]/task-via/[voceId]/route.ts`

- [ ] **Step 1: Crea l'endpoint GET**

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/** Interventi "+" creati per un task-via (parent_voce_id), per il rapportino del token. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; voceId: string }> }) {
  const { token, voceId } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, data, dati_correnti, created_at')
    .eq('rapportino_id', rap.id)
    .eq('parent_voce_id', voceId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = ((data ?? []) as Array<{ id: string; stato: string; dati_correnti: { anagrafica?: Record<string, unknown> } }>).map((r) => ({
    id: r.id,
    stato: r.stato,
    matricola: String(r.dati_correnti?.anagrafica?.matricola ?? ''),
    via: String(r.dati_correnti?.anagrafica?.via ?? ''),
  }));
  return NextResponse.json({ interventi: out });
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint "app/api/r/[token]/task-via/[voceId]/route.ts"`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "task-via" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/task-via/[voceId]/route.ts"
git commit -m "feat(rapportini): endpoint interventi figli del task-via"
```

---

### Task 6: Componente `TaskViaFocus`

**Files:**
- Create: `components/modules/rapportini/TaskViaFocus.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Voce } from './RapportinoForm';

const STATO_LABEL: Record<string, string> = {
  in_attesa: 'In sospeso', approvato: 'Approvato', rifiutato: 'Rifiutato',
  auto_liberi: 'Approvato', annullato: 'Annullato',
};

export function TaskViaFocus({
  voce,
  token,
  onAggiungi,
  onClose,
}: {
  voce: Voce;
  token: string;
  onAggiungi: (voce: Voce) => void;
  onClose: () => void;
}) {
  const [interventi, setInterventi] = useState<Array<{ id: string; stato: string; matricola: string }>>([]);
  const parentId = voce.taskId ?? voce.id;
  const carica = useCallback(async () => {
    try {
      const r = await fetch(`/api/r/${token}/task-via/${parentId}`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { interventi: [] }) as { interventi?: Array<{ id: string; stato: string; matricola: string }> };
      setInterventi(j.interventi ?? []);
    } catch { /* lista best-effort */ }
  }, [token, parentId]);
  useEffect(() => { void carica(); }, [carica]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--brand-text-muted)]">&larr; Indietro</button>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Bonifiche extra</span>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Via</p>
        <p className="text-lg font-bold text-[var(--brand-text-main)]">{voce.via ?? '—'}</p>
      </div>

      <button
        type="button"
        onClick={() => onAggiungi(voce)}
        className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)]"
      >
        + Aggiungi intervento
      </button>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Interventi su questa via ({interventi.length})</p>
        {interventi.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun intervento creato per ora.</p>
        ) : (
          <ul className="divide-y divide-[var(--brand-border)] rounded-xl border border-[var(--brand-border)]">
            {interventi.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-[var(--brand-text-main)]">{i.matricola || '(senza matricola)'}</span>
                <span className="text-xs text-[var(--brand-text-muted)]">{STATO_LABEL[i.stato] ?? i.stato}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint components/modules/rapportini/TaskViaFocus.tsx`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "TaskViaFocus" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/TaskViaFocus.tsx
git commit -m "feat(rapportini): schermo TaskViaFocus (via + aggiungi intervento + lista figli)"
```

---

### Task 7: Wiring in `RapportinoForm` (branch + pre-compilazione modale)

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Import del componente e dell'helper**

Aggiungi agli import:

```tsx
import { TaskViaFocus } from './TaskViaFocus';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import type { AnagraficaManuale } from '@/lib/interventi/manuali/types';
```

- [ ] **Step 2: Stato per la pre-compilazione del "+"**

Vicino a `const [modaleAperta, setModaleAperta] = useState(false);` (cercalo nel file) aggiungi:

```tsx
  const [prefillManuale, setPrefillManuale] = useState<{ committenteIniziale: CommittenteManuale; anagraficaIniziale: AnagraficaManuale; parentVoceId: string } | null>(null);
```

- [ ] **Step 3: Branch nella vista focus**

Sostituisci il blocco della vista focus:

```tsx
      ) : vista === 'focus' && voci[indiceCorrente] ? (
        <VoceFocus
```

con (apre `TaskViaFocus` per i task-via, altrimenti `VoceFocus` invariato):

```tsx
      ) : vista === 'focus' && voci[indiceCorrente] && isTaskVia(voci[indiceCorrente]) ? (
        <TaskViaFocus
          voce={voci[indiceCorrente]}
          token={token}
          onClose={onClose}
          onAggiungi={(v) => {
            setPrefillManuale({
              committenteIniziale: 'italgas',
              anagraficaIniziale: { via: v.via ?? '' },
              parentVoceId: v.taskId ?? v.id,
            });
            setModaleAperta(true);
          }}
        />
      ) : vista === 'focus' && voci[indiceCorrente] ? (
        <VoceFocus
```

- [ ] **Step 4: Passa la pre-compilazione alla modale e pulisci alla chiusura**

Nel blocco `{modaleAperta && (<ModaleInterventoManuale ... />)}` aggiungi i tre props (dopo `campiStandard={campiStandardManuale ?? campiSnapshot}`):

```tsx
          committenteIniziale={prefillManuale?.committenteIniziale}
          anagraficaIniziale={prefillManuale?.anagraficaIniziale}
          parentVoceId={prefillManuale?.parentVoceId}
```

E in `onClose` della modale aggiungi `setPrefillManuale(null);`:

```tsx
          onClose={() => { setModaleAperta(false); setPrefillManuale(null); }}
```

E in `onCreata`, dopo aver gestito lo stato, aggiungi `setPrefillManuale(null);` (prima della chiusura/reload).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint components/modules/rapportini/RapportinoForm.tsx`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "RapportinoForm" || echo "OK"`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): apri TaskViaFocus per i task-via e pre-compila il + (Italgas + via)"
```

---

### Task 8: Verifica complessiva

**Files:** nessuno (verifica)

- [ ] **Step 1: Suite + typecheck**

Run: `npx vitest run lib/interventi/manuali/ lib/offline/`
Expected: tutti verdi (incluso `taskVia`).
Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 2: Verifica funzionale post-deploy (dopo la migrazione)**

- Creare in pianificazione un task-via (attività `BONIFICHE EXTRA` + via).
- Operatore: apre il task → vede `TaskViaFocus` → "+ Aggiungi intervento" parte su Italgas + via → invia.
- Read-only DB: `select id, parent_voce_id, committente, stato from interventi_manuali where parent_voce_id is not null order by created_at desc limit 5;` → la richiesta ha `parent_voce_id` valorizzato.
- In `TaskViaFocus` ricompare l'intervento con stato "In sospeso"; dopo approvazione backoffice → "Approvato".

---

## Self-Review (esito)

- **Copertura spec:** discriminante `isTaskVia` → Task 2; link `parent_voce_id` (migrazione + payload offline + route) → Task 1+3; "+" pre-compilato (Italgas+via+parent) → Task 4; schermo operatore + lista figli → Task 5+6; branch non distruttivo → Task 7; verifica → Task 8.
- **Additività:** prop modale opzionali (FAB invariata); `parent_voce_id` nullable (insert come oggi se assente); branch focus solo per `isTaskVia`; `VoceFocus` non toccato.
- **Placeholder:** nessuno; codice completo per ogni step.
- **Coerenza tipi:** `parentVoceId?: string | null` coerente in `PayloadManuale`/`DatiManualeOffline`/props modale; `parent_voce_id` colonna/insert/endpoint; `committenteIniziale: CommittenteManuale`, `anagraficaIniziale: AnagraficaManuale` coerenti tra modale e `RapportinoForm`.
