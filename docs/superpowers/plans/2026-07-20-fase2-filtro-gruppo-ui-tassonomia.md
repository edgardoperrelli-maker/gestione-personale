# Fase 2 — Filtro su gruppo + UI Tassonomia: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'endpoint export dell'agente seleziona per `gruppo_attivita='LIMITAZIONI MASSIVE'` (via il match testuale contaminato dal DUNNING) e Impostazioni guadagna la pagina self-service "Tassonomia attività" (lista/aggiungi/attiva-disattiva/elimina-se-inutilizzata).

**Architecture:** Una riga di query nell'endpoint export; nuova API admin CRUD-ristretto su `attivita_tassonomia` (validazioni in modulo puro testato) + pagina client sul pattern di `app/impostazioni/gruppo-attivita`. Nessuna migration (tabella già in prod), nessuna modifica all'agente.

**Tech Stack:** Next.js App Router, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-fase2-filtro-gruppo-ui-tassonomia-design.md`

## Global Constraints

- Branch `feat/fase2-tassonomia` da **origin/main aggiornato** (fetch prima: sessioni concorrenti).
- Repo PUBBLICO: niente dati prod nei fixture (nomi attività ok).
- VIETATO ai subagent: `git push`, `git remote`, eseguire script che toccano il DB. Verifica SOLO vitest+tsc.
- `npx tsc --noEmit -p tsconfig.json` deve restare a 0 errori; suite `npm test` verde al termine.
- Il blocco duplicati (`app/api/admin/interventi-manuali/[id]/approva/route.ts` ~riga 100) NON si tocca.
- La descrizione in tassonomia è la FORMA CANONICA: mai uppercase forzato sulla descrizione (solo trim/spazi collassati). Il gruppo invece è uppercase per convenzione.
- Fix riga orfana `77e8d39b-c156-4a89-aae8-30084f4eba71`: SQL della MAIN SESSION (checkpoint), non dei subagent.

---

### Task 1: Filtro export su gruppo

**Files:**
- Modify: `app/api/export/limitazioni-massive/route.ts` (~riga 56)

**Interfaces:**
- Consumes: colonna `interventi.gruppo_attivita` (in prod, popolata).
- Produces: endpoint invariato nel formato; cambia solo la selezione righe.

- [ ] **Step 1: Sostituisci il filtro**

Nel loop di paginazione, sostituisci la riga:

```typescript
        .or('committente.eq.lim_massive,intervento_tipo.ilike.%limitaz%,intervento_tipo.ilike.%massiv%')
```

con:

```typescript
        // Fase 2 (spec 2026-07-20-fase2): selezione per TASSONOMIA, non per testo. Il match
        // ilike storico includeva per omonimia le attività DUNNING ("Limitazione flusso
        // idrico", ...) — estranee ai master per-comune e a rischio collisione matricola.
        // gruppo_attivita è garantito dai flussi (import validato, manuali a lista chiusa,
        // pianificazione soft + Guard 2) e dallo storico backfillato.
        .eq('gruppo_attivita', 'LIMITAZIONI MASSIVE')
```

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 errori.
Run: `npx vitest run lib/limitazione` → verde (exportLimMassive puro, invariato).

- [ ] **Step 3: Commit**

```bash
git add app/api/export/limitazioni-massive/route.ts
git commit -m "feat(export): selezione limitazioni per gruppo_attivita (via ilike contaminato dal DUNNING)"
```

---

### Task 2: Validazioni pure input tassonomia

**Files:**
- Create: `lib/attivita/validaTassonomiaInput.ts`
- Test: `lib/attivita/validaTassonomiaInput.test.ts`

**Interfaces:**
- Produces (usati dal Task 3): `type InputTassonomia = { committente: string; descrizione: string; gruppo: string }`;
  `validaTassonomiaInput(body: unknown): { ok: true; valore: InputTassonomia } | { ok: false; errore: string }`.

- [ ] **Step 1: Scrivi i test**

```typescript
// lib/attivita/validaTassonomiaInput.test.ts
import { describe, it, expect } from 'vitest';
import { validaTassonomiaInput } from './validaTassonomiaInput';

describe('validaTassonomiaInput', () => {
  it('input valido: descrizione trim/spazi collassati (case CONSERVATO), gruppo uppercase', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: '  Limitazione  Massiva su Impianto ', gruppo: ' limitazioni massive ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valore.descrizione).toBe('Limitazione Massiva su Impianto');
      expect(r.valore.gruppo).toBe('LIMITAZIONI MASSIVE');
      expect(r.valore.committente).toBe('acea');
    }
  });
  it('committente normalizzato lowercase e validato', () => {
    const r = validaTassonomiaInput({ committente: 'ITALGAS', descrizione: 'BONIFICHE', gruppo: 'BONIFICHE' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valore.committente).toBe('italgas');
  });
  it('committente fuori lista → errore', () => {
    const r = validaTassonomiaInput({ committente: 'lim_massive', descrizione: 'X', gruppo: 'G' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain('committente');
  });
  it('descrizione vuota → errore', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: '   ', gruppo: 'G' });
    expect(r.ok).toBe(false);
  });
  it('gruppo vuoto → errore', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: 'X', gruppo: '' });
    expect(r.ok).toBe(false);
  });
  it('body non-oggetto → errore', () => {
    expect(validaTassonomiaInput(null).ok).toBe(false);
    expect(validaTassonomiaInput('x').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run lib/attivita/validaTassonomiaInput.test.ts` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementa**

```typescript
// lib/attivita/validaTassonomiaInput.ts
// PURA: validazione input per la UI tassonomia (spec fase 2 §4.1).
// La DESCRIZIONE è la forma canonica che finirà su interventi: trim + spazi collassati,
// case CONSERVATO (mai uppercase forzato). Il GRUPPO è uppercase per convenzione.
const COMMITTENTI = ['acea', 'italgas', 'altro'] as const;

export type InputTassonomia = { committente: string; descrizione: string; gruppo: string };

export function validaTassonomiaInput(
  body: unknown,
): { ok: true; valore: InputTassonomia } | { ok: false; errore: string } {
  if (typeof body !== 'object' || body == null) return { ok: false, errore: 'Body non valido.' };
  const b = body as Record<string, unknown>;
  const committente = String(b.committente ?? '').trim().toLowerCase();
  if (!(COMMITTENTI as readonly string[]).includes(committente)) {
    return { ok: false, errore: `committente non valido (${COMMITTENTI.join('|')}).` };
  }
  const descrizione = String(b.descrizione ?? '').replace(/\s+/g, ' ').trim();
  if (!descrizione) return { ok: false, errore: 'Descrizione attività obbligatoria.' };
  const gruppo = String(b.gruppo ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!gruppo) return { ok: false, errore: 'Gruppo attività obbligatorio.' };
  return { ok: true, valore: { committente, descrizione, gruppo } };
}
```

- [ ] **Step 4: Esegui → PASS**

Run: `npx vitest run lib/attivita/validaTassonomiaInput.test.ts` → PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add lib/attivita/validaTassonomiaInput.ts lib/attivita/validaTassonomiaInput.test.ts
git commit -m "feat(tassonomia): validazione pura input UI (descrizione canonica, gruppo uppercase)"
```

---

### Task 3: API admin tassonomia

**Files:**
- Create: `app/api/admin/attivita-tassonomia/route.ts`

**Interfaces:**
- Consumes: `validaTassonomiaInput` (Task 2), `chiaveTassonomia`, `committenteEquivalente` da `@/lib/attivita/tassonomia`; pattern guard admin da `app/api/admin/attivita/route.ts` (righe 25-44: `createRouteHandlerClient` + `resolveUserRole`, ruolo `admin`).
- Produces: GET/POST/PATCH/DELETE come da spec §4.1 (usati dal Task 4).

- [ ] **Step 1: Implementa la route**

```typescript
// app/api/admin/attivita-tassonomia/route.ts
// CRUD RISTRETTO sulla tassonomia attività (spec fase 2 §4.1): niente rename (la
// descrizione canonica è referenziata dallo storico: rinominare = nuova riga + disattiva
// la vecchia); delete solo se mai usata su interventi.
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { validaTassonomiaInput } from '@/lib/attivita/validaTassonomiaInput';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';

export const runtime = 'nodejs';

type RigaDb = { id: string; committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean };

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

/** Utilizzo di una voce: quante righe interventi la referenziano (storico canonicalizzato →
 *  match esatto su intervento_tipo + committente equivalente, lim_massive conta come acea). */
async function utilizzoVoce(r: RigaDb): Promise<number> {
  const committenti = r.committente === 'acea' ? ['acea', 'lim_massive'] : [r.committente];
  const { count, error } = await supabaseAdmin
    .from('interventi')
    .select('id', { count: 'exact', head: true })
    .eq('intervento_tipo', r.descrizione)
    .in('committente', committenti);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .order('committente').order('gruppo').order('descrizione');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const righe = await Promise.all(
      ((data ?? []) as RigaDb[]).map(async (r) => ({ ...r, utilizzo: await utilizzoVoce(r) })),
    );
    return NextResponse.json({ righe });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore conteggio utilizzo.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const esito = validaTassonomiaInput(await req.json().catch(() => null));
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: 400 });
  // insert: descrizione_norm la calcola il trigger DB; unique (committente, descrizione_norm)
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .insert({ ...esito.valore, attivo: true })
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .single();
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: dup ? 'Esiste già questa descrizione per questo committente.' : error.message },
      { status: dup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, riga: { ...(data as RigaDb), utilizzo: 0 } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => null)) as { id?: unknown; attivo?: unknown } | null;
  const id = String(body?.id ?? '').trim();
  if (!id || typeof body?.attivo !== 'boolean') {
    return NextResponse.json({ error: 'Servono id e attivo (boolean). Le descrizioni non si rinominano: crea una nuova voce e disattiva la vecchia.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .update({ attivo: body.attivo })
    .eq('id', id)
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const riga = data as RigaDb;
    return NextResponse.json({ ok: true, riga: { ...riga, utilizzo: await utilizzoVoce(riga) } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore conteggio utilizzo.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const id = String(new URL(req.url).searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });
  const { data: rigaData, error: e1 } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .eq('id', id)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!rigaData) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  try {
    const utilizzo = await utilizzoVoce(rigaData as RigaDb);
    if (utilizzo > 0) {
      return NextResponse.json(
        { error: `Voce già utilizzata da ${utilizzo} interventi: disattivala invece di eliminarla.`, utilizzo },
        { status: 409 },
      );
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore verifica utilizzo.' }, { status: 500 });
  }
  const { error } = await supabaseAdmin.from('attivita_tassonomia').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Nota: `committenteEquivalente` è importato ma la logica lim_massive→acea in `utilizzoVoce`
è esplicitata con l'array `committenti` — se preferisci, usa `committenteEquivalente` per
derivarla; l'importante è che una voce acea conti anche gli interventi lim_massive.
(Se l'import resta inutilizzato, rimuovilo: niente import morti.)

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 errori.
Run: `npx vitest run lib/attivita` → verde.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/attivita-tassonomia/route.ts
git commit -m "feat(tassonomia): API admin lista/aggiungi/toggle/elimina-se-inutilizzata"
```

---

### Task 4: Pagina Impostazioni + menu

**Files:**
- Create: `app/impostazioni/attivita-tassonomia/page.tsx`
- Create: `app/impostazioni/attivita-tassonomia/AttivitaTassonomiaClient.tsx`
- Modify: `app/impostazioni/page.tsx` (array voci: aggiungi la nuova, precisa la description di "Gruppo Attivita")

**Interfaces:**
- Consumes: API Task 3. Pattern UI di riferimento: `app/impostazioni/gruppo-attivita/GruppoAttivitaClient.tsx` (stati, feedback, fetch, filtri) — RICALCARE lo stile, non importarlo.

- [ ] **Step 1: page.tsx (wrapper)**

```tsx
import AttivitaTassonomiaClient from './AttivitaTassonomiaClient';

export const dynamic = 'force-dynamic';

export default function AttivitaTassonomiaPage() {
  return <AttivitaTassonomiaClient />;
}
```

- [ ] **Step 2: AttivitaTassonomiaClient.tsx**

Client component sul modello di `GruppoAttivitaClient.tsx` (stessi pattern di stato,
feedback 3.5s, loading, `cache: 'no-store'`). Requisiti funzionali (adatta liberamente il
markup allo stile del file di riferimento, tema sobrio con `var(--brand-*)`):

- Tipo riga: `{ id, committente, descrizione, descrizioneNorm?, gruppo, attivo, utilizzo }`
  (dal GET: campo `descrizione_norm` — puoi ignorarlo nella UI).
- Header con contatori: totale voci, attive, in uso (`utilizzo > 0`).
- Barra: input ricerca (su descrizione+gruppo, case-insensitive), select filtro stato
  (tutte | attive | disattive), select filtro committente (tutti | acea | italgas | altro).
- Form aggiunta: select committente (acea/italgas/altro), input descrizione, gruppo =
  select con i gruppi DISTINTI già presenti (per il committente scelto, più tutti) +
  opzione "Nuovo gruppo…" che mostra un input libero. Submit → POST → prepend in lista +
  feedback. Errori 400/409 mostrati come feedback error.
- Lista raggruppata per committente → gruppo: per riga descrizione, badge gruppo, badge
  utilizzo ("Non utilizzata" | "N interventi"), toggle Attiva/Disattiva (PATCH), bottone
  Elimina SOLO se `utilizzo === 0` (con `confirm()` nativo), altrimenti tooltip
  "disattivala invece".
- Nota fissa sotto il form: «Le descrizioni non si rinominano: crea la nuova voce e
  disattiva la vecchia. Le nuove attività sono subito valide per import mappa, template
  e inserimenti manuali.»

- [ ] **Step 3: Menu**

In `app/impostazioni/page.tsx`, nell'array delle voci, DOPO la voce `gruppo-attivita`:

```typescript
  {
    href: '/impostazioni/attivita-tassonomia',
    title: 'Tassonomia attività',
    description: 'Descrizioni e gruppi attività validi per import, template e inserimenti manuali (motore tassonomia).',
  },
```

e nella voce esistente `gruppo-attivita` cambia la description in:

```typescript
    description: 'Gestisci elenco attivita condiviso da cronoprogramma, mappa e sopralluoghi (non e la tassonomia import).',
```

- [ ] **Step 4: Verifica**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 errori.
Run: `npx vitest run lib/attivita` → verde.

- [ ] **Step 5: Commit**

```bash
git add app/impostazioni/attivita-tassonomia/ app/impostazioni/page.tsx
git commit -m "feat(impostazioni): pagina Tassonomia attivita (lista, aggiungi, attiva/disattiva)"
```

---

### Task 5: Verifica finale, PR

- [ ] **Step 1:** `npm test` → suite intera verde. `npx tsc --noEmit` → 0 errori.
- [ ] **Step 2 (MAIN SESSION):** fix riga orfana su prod (SQL singola riga, id `77e8d39b-…`) PRIMA del merge; confronto finestra pre/post filtro.
- [ ] **Step 3:** push branch + `gh pr create` (titolo "Fase 2: filtro agente su gruppo_attivita + UI Tassonomia attivita"; body con spec, numeri di verifica, nota "nessuna migration"). Merge SOLO con ok esplicito dell'utente.

## Note per l'esecutore

- Ordine: 1 → 2 → 3 → 4 → 5 (il 2 può precedere l'1; il 3 dipende dal 2; il 4 dal 3).
- Numeri di riga riferiti a main `a0a61c8`: verificare col grep prima di modificare.
- Fuori scope: riclassificazione lim_massive→acea; blocco duplicati; UI di rename.
