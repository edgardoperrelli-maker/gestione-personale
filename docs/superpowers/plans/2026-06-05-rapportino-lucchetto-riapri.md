# Lucchetto "riapri rapportino" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'admin un **lucchetto** per riga nel riepilogo che riapre un rapportino inviato (`stato`→`in_corso` + finestra di validità di 48h), così l'operatore può modificarlo, rinviarlo e rigenerare PDF/Excel (già on-demand).

**Architecture:** Una colonna additiva `rapportini.riaperto_at`. Helper puro `entroRiapertura` + `tokenStatus` che la onora (override valido 48h nel ramo `in_corso`). Nuova API admin `POST /api/admin/rapportini/riapri`. Lucchetto in `CardTerritorio` cablato dal padre `RiepilogoRapportini` (POST + reload). Aggiornati i 5 chiamanti di `tokenStatus` (+ select). PDF/Excel invariati.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Tailwind 4 · Supabase · zod · Vitest.

**Spec:** [docs/superpowers/specs/2026-06-05-rapportino-lucchetto-riapri-design.md](../specs/2026-06-05-rapportino-lucchetto-riapri-design.md)

**Baseline:** lint del progetto già rosso su errori preesistenti → gate = `npx eslint <file toccati>` + `npx tsc --noEmit` (baseline exit 0).

---

## File structure

| File | Responsabilità | Stato |
|---|---|---|
| `utils/rapportini/scadenza.ts` | `entroRiapertura` | modifica |
| `utils/rapportini/scadenza.test.ts` | test `entroRiapertura` | modifica |
| `utils/rapportini/tokenStatus.ts` | override `riaperto_at` | modifica |
| `utils/rapportini/tokenStatus.test.ts` | test override | modifica |
| `supabase/migrations/<ts>_rapportino_riaperto_at.sql` | colonna `riaperto_at` | **nuovo** |
| `app/api/r/[token]/invia/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/r/[token]/page.tsx`, `app/api/mappa/rapportini/riepilogo/route.ts`, `app/api/mappa/rapportini/route.ts` | passano `riaperto_at` a `tokenStatus` | modifica |
| `app/api/admin/rapportini/riapri/route.ts` | API riapri (admin) | **nuovo** |
| `components/modules/mappa/riepilogo/CardTerritorio.tsx` | lucchetto per riga | modifica |
| `components/modules/mappa/RiepilogoRapportini.tsx` | handler riapri + prop | modifica |

---

## Task 1: `entroRiapertura` + `tokenStatus` override (TDD)

**Files:**
- Modify: `utils/rapportini/scadenza.ts`, `utils/rapportini/scadenza.test.ts`
- Modify: `utils/rapportini/tokenStatus.ts`, `utils/rapportini/tokenStatus.test.ts`

- [ ] **Step 1: Test che falliscono**

In `utils/rapportini/scadenza.test.ts` aggiungi `entroRiapertura` all'import esistente da `./scadenza` e appendi:
```ts
describe('entroRiapertura', () => {
  it('entro 48h dal riapri → true', () => {
    expect(entroRiapertura('2026-06-10T08:00:00Z', '2026-06-11T08:00:00Z')).toBe(true);
  });
  it('oltre 48h → false', () => {
    expect(entroRiapertura('2026-06-10T08:00:00Z', '2026-06-12T09:00:00Z')).toBe(false);
  });
  it('istante non valido → false', () => {
    expect(entroRiapertura('boh', '2026-06-11T08:00:00Z')).toBe(false);
  });
});
```

In `utils/rapportini/tokenStatus.test.ts` appendi (l'import di `tokenStatus` c'è già):
```ts
describe('tokenStatus — riaperto_at', () => {
  it('riaperto da poco → valido anche se la data lavori è passata', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-01-01', riaperto_at: '2026-06-10T07:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('valido');
  });
  it('riaperto da oltre 48h → ricade sulla logica della data (scaduto)', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-01-01', riaperto_at: '2026-06-01T08:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
  it('inviato vince anche con riaperto_at recente', () => {
    expect(tokenStatus({ stato: 'inviato', data: '2026-06-08', riaperto_at: '2026-06-10T07:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('inviato');
  });
  it('riaperto_at null → comportamento storico', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08', riaperto_at: null }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
});
```

- [ ] **Step 2: Verifica fail**

Run: `npx vitest run utils/rapportini/scadenza.test.ts utils/rapportini/tokenStatus.test.ts`
Expected: FAIL (`entroRiapertura` non esportata; `tokenStatus` non accetta `riaperto_at`).

- [ ] **Step 3: Implementa**

In fondo a `utils/rapportini/scadenza.ts` aggiungi:
```ts
/** Riapertura valida per GIORNI_VALIDITA giorni (48h) dall'istante `riapertoAt`. */
export function entroRiapertura(riapertoAtIso: string, nowIso: string): boolean {
  const t = Date.parse(riapertoAtIso);
  if (Number.isNaN(t)) return false;
  return Date.parse(nowIso) < t + GIORNI_VALIDITA * 86_400_000;
}
```

Sostituisci l'intero corpo di `utils/rapportini/tokenStatus.ts` con:
```ts
import { isScaduto, entroRiapertura } from './scadenza';

export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; data: string; riaperto_at?: string | null },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  if (r.riaperto_at && entroRiapertura(r.riaperto_at, nowIso)) return 'valido';
  return isScaduto(r.data, nowIso) ? 'scaduto' : 'valido';
}
```

- [ ] **Step 4: Verifica pass**

Run: `npx vitest run utils/rapportini/scadenza.test.ts utils/rapportini/tokenStatus.test.ts`
Expected: PASS (esistenti + nuovi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/scadenza.ts utils/rapportini/scadenza.test.ts utils/rapportini/tokenStatus.ts utils/rapportini/tokenStatus.test.ts
git commit -m "feat(rapportino): tokenStatus onora riaperto_at (finestra 48h)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrazione SQL `riaperto_at`

**Files:**
- Create: `supabase/migrations/20260605010000_rapportino_riaperto_at.sql`

- [ ] **Step 1: Crea il file**

```sql
-- Riapertura admin di un rapportino inviato: istante di riapertura.
-- tokenStatus considera il rapportino valido per 48h da questo istante (data lavori intatta).
-- Additiva e retro-compatibile (null = mai riaperto).
alter table rapportini
  add column if not exists riaperto_at timestamptz;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260605010000_rapportino_riaperto_at.sql
git commit -m "feat(db): rapportini.riaperto_at (riapertura admin)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Chiamanti di `tokenStatus` passano `riaperto_at`

**Files (5):**
- Modify: `app/api/r/[token]/invia/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/r/[token]/page.tsx`, `app/api/mappa/rapportini/riepilogo/route.ts`, `app/api/mappa/rapportini/route.ts`

- [ ] **Step 1: `invia/route.ts`**

Sostituisci:
```ts
    .select('id, stato, data, campi_snapshot')
```
con:
```ts
    .select('id, stato, data, campi_snapshot, riaperto_at')
```
Sostituisci:
```ts
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
```
con:
```ts
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
```

- [ ] **Step 2: `voce/route.ts`**

Sostituisci:
```ts
    .select('id, stato, data, campi_snapshot, staff_id')
```
con:
```ts
    .select('id, stato, data, campi_snapshot, staff_id, riaperto_at')
```
Sostituisci:
```ts
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
```
con:
```ts
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
```

- [ ] **Step 3: `app/r/[token]/page.tsx`**

Sostituisci:
```ts
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot, template_id')
```
con:
```ts
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot, template_id, riaperto_at')
```
Sostituisci:
```ts
  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString());
```
con:
```ts
  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString());
```

- [ ] **Step 4: `app/api/mappa/rapportini/riepilogo/route.ts`**

Sostituisci:
```ts
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at')
```
con:
```ts
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at, riaperto_at')
```
Sostituisci (tipo della list):
```ts
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null;
  }>;
```
con:
```ts
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null; riaperto_at: string | null;
  }>;
```
Sostituisci:
```ts
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, nowIso),
```
con:
```ts
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, nowIso),
```

- [ ] **Step 5: `app/api/mappa/rapportini/route.ts`**

Sostituisci:
```ts
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data, template_id').eq('piano_id', pianoId);
```
con:
```ts
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data, template_id, riaperto_at').eq('piano_id', pianoId);
```
Sostituisci (tipo della list):
```ts
    submitted_at: string | null; data: string; template_id: string | null;
  }>;
```
con:
```ts
    submitted_at: string | null; data: string; template_id: string | null; riaperto_at: string | null;
  }>;
```
(`tokenStatus(r, now)` legge già `r.riaperto_at` ora che è nel tipo — nessuna altra modifica.)

- [ ] **Step 6: Typecheck + lint + commit**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "app/api/r/[token]/invia/route.ts" "app/api/r/[token]/voce/route.ts" "app/r/[token]/page.tsx" "app/api/mappa/rapportini/riepilogo/route.ts" "app/api/mappa/rapportini/route.ts"` → nessun NUOVO problema
```bash
git add "app/api/r/[token]/invia/route.ts" "app/api/r/[token]/voce/route.ts" "app/r/[token]/page.tsx" "app/api/mappa/rapportini/riepilogo/route.ts" "app/api/mappa/rapportini/route.ts"
git commit -m "feat(rapportino): i chiamanti di tokenStatus passano riaperto_at" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: API admin `riapri`

**Files:**
- Create: `app/api/admin/rapportini/riapri/route.ts`

- [ ] **Step 1: Crea il file**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const Schema = z.object({ rapportinoId: z.string().uuid() });

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'rapportinoId non valido' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('rapportini')
    .update({ stato: 'in_corso', submitted_at: null, riaperto_at: new Date().toISOString() })
    .eq('id', parsed.data.rapportinoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + lint + commit**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "app/api/admin/rapportini/riapri/route.ts"` → clean
```bash
git add "app/api/admin/rapportini/riapri/route.ts"
git commit -m "feat(rapportino): API admin riapri rapportino (in_corso + riaperto_at)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Lucchetto in `CardTerritorio` + handler nel padre

**Files:**
- Modify: `components/modules/mappa/riepilogo/CardTerritorio.tsx`
- Modify: `components/modules/mappa/RiepilogoRapportini.tsx`

- [ ] **Step 1: `CardTerritorio.tsx` — nuova prop**

Nel tipo dei props del componente, dopo `onRimuoviOp: (pianoId: string, staffId: string) => void;` aggiungi:
```tsx
  onRiapriRapportino: (rapportinoId: string) => void;
```
e nella destructure dei parametri (in cima a `export default function CardTerritorio({ ... }`), dopo `onRimuoviOp,` aggiungi `onRiapriRapportino,`.

- [ ] **Step 2: `CardTerritorio.tsx` — pulsante lucchetto**

Subito DOPO il pulsante copia (la riga `<button onClick={() => onCopia(r)} ...>{copiedToken === r.token ? '✓' : '🔗'}</button>`) inserisci:
```tsx
                    <button
                      type="button"
                      onClick={() => onRiapriRapportino(r.id)}
                      disabled={busy || r.statoCalcolato === 'valido'}
                      title={r.statoCalcolato === 'valido' ? 'Aperto: l’operatore può modificare' : 'Riapri per la modifica'}
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5 disabled:opacity-60"
                    >{r.statoCalcolato === 'valido' ? '🔓' : '🔒'}</button>
```

- [ ] **Step 3: `RiepilogoRapportini.tsx` — handler**

Dopo la funzione `rimuoviOperatore` (prima del `return (`) aggiungi:
```tsx
  const riapriRapportino = async (rapportinoId: string) => {
    setBusy(true);
    try {
      await fetch('/api/admin/rapportini/riapri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapportinoId }),
      });
      await carica();
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 4: `RiepilogoRapportini.tsx` — passa la prop**

Nel render di `<CardTerritorio ... />`, dopo `onRimuoviOp={rimuoviOperatore}` aggiungi:
```tsx
                onRimuoviOp={rimuoviOperatore}
                onRiapriRapportino={riapriRapportino}
```

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint components/modules/mappa/riepilogo/CardTerritorio.tsx components/modules/mappa/RiepilogoRapportini.tsx` → clean
```bash
git add components/modules/mappa/riepilogo/CardTerritorio.tsx components/modules/mappa/RiepilogoRapportini.tsx
git commit -m "feat(rapportino): lucchetto riapri nella riga del riepilogo" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica finale + nota deploy

**Files:** nessuno.

- [ ] **Step 1: Suite + typecheck + lint**

Run: `npm test` → tutti PASS (inclusi i nuovi `entroRiapertura`/`tokenStatus`)
Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint utils/rapportini/scadenza.ts utils/rapportini/tokenStatus.ts "app/api/admin/rapportini/riapri/route.ts" components/modules/mappa/riepilogo/CardTerritorio.tsx components/modules/mappa/RiepilogoRapportini.tsx "app/r/[token]/page.tsx"` → nessun NUOVO problema

- [ ] **Step 2: Build (con env)**

Copia `.env.local` dal repo padre, `npm run build` → ok (rotte `/r/[token]`, `/hub/mappa`, `/api/admin/rapportini/riapri` compilano). Rimuovi `.env.local`.

- [ ] **Step 3: Verifica manuale**

- Riepilogo (`/hub/mappa`): su un rapportino **inviato** appare 🔒; clic → diventa 🔓 (in_corso); su uno in compilazione 🔓 disabilitato.
- Operatore: riapri il link `/r/<token>` → tornato modificabile (anche se la data era passata) → modifica → **rinvia** → ricompare "Condividi PDF" → PDF aggiornato. ⤓ Excel aggiornato.

- [ ] **Step 4: Nota deploy (migrazione PRIMA del push)**

I `select` di `/voce`·`/invia`·`page.tsx` ora includono `riaperto_at`: se la colonna non esiste sul prod, quelle rotte (anche pubbliche) vanno in errore. Quindi l'utente applica la SQL `riaperto_at` sul DB **prod prima** del push del codice. SQL consegnata su richiesta.

---

## Self-review (in scrittura)

- **Spec coverage:** lucchetto UI (Task 5), API riapri (Task 4), riaperto_at + tokenStatus 48h (Task 1), migrazione (Task 2), 5 chiamanti (Task 3), PDF/Excel invariati (nessun task: già on-demand). ✔
- **No placeholder:** ogni step ha codice/comandi reali (`<ts>` migrazione → nome concreto `20260605010000`). ✔
- **Coerenza tipi:** `tokenStatus(r: {stato, data, riaperto_at?}, now)` usato identico nei 5 chiamanti; `entroRiapertura(riapertoAt, now)`; prop `onRiapriRapportino(rapportinoId)` ↔ handler `riapriRapportino`; `riaperto_at` (DB/select/cast) coerente. ✔
- **Nessuna modifica** a PDF/Excel, a `campi_snapshot`, alla logica autosave. ✔
