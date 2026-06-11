# Spostamento operatore in altro territorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'admin di spostare un singolo operatore in un altro territorio dal Riepilogo, in modo coerente su Riepilogo, board Live e tabella `interventi`.

**Architecture:** Override per-rapportino (`rapportini.territorio_override`, nome territorio) come fonte di verità per il raggruppamento del Riepilogo; l'API di spostamento aggiorna anche `interventi.territorio_id` (per Live/export); `ensureInterventiForPiano` ri-applica gli override dopo ogni rigenerazione. Logica pura isolata e testata; route/UI sottili.

**Tech Stack:** Next.js App Router (route handlers `nodejs`), Supabase JS (service-role), Vitest, React client components, Tailwind.

Spec: `docs/superpowers/specs/2026-06-11-spostamento-operatore-territorio-design.md`

---

## File Structure

- Create `supabase/migrations/20260611000000_rapportini_territorio_override.sql` — colonna override.
- Create `utils/rapportini/territorioEffettivo.ts` (+ test) — lettura `override ?? piano`.
- Create `lib/interventi/territorioOverride.ts` (+ test) — helper puri + orchestrazioni db (`applicaSpostamentoTerritorio`, `reapplyOverridesInterventi`).
- Create `app/api/mappa/rapportini/territorio/route.ts` — PATCH spostamento (thin).
- Create `app/api/mappa/territori/route.ts` — GET lista territori per il selettore.
- Modify `app/api/mappa/rapportini/riepilogo/route.ts` — espone `territorio` effettivo + `territorio_override`.
- Modify `utils/rapportini/groupByDay.ts` — `RapRiepilogo` porta `territorio_override`.
- Modify `lib/interventi/ensureInterventiForPiano.ts` — chiama `reapplyOverridesInterventi`.
- Modify `components/modules/mappa/riepilogo/CardTerritorio.tsx` — azione "Sposta" + badge.
- Modify `components/modules/mappa/RiepilogoRapportini.tsx` — carica territori, stato selettore, handler.

---

## Task 1: Migrazione colonna override

**Files:**
- Create: `supabase/migrations/20260611000000_rapportini_territorio_override.sql`

- [ ] **Step 1: Scrivi la migrazione**

```sql
-- Override per-rapportino del territorio: sposta un singolo operatore in un altro
-- gruppo nel Riepilogo (e, via API, anche interventi.territorio_id per Live).
-- NULL = nessun override (vale mappa_piani.territorio del piano).
ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS territorio_override TEXT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260611000000_rapportini_territorio_override.sql
git commit -m "feat(db): rapportini.territorio_override (migrazione, da lanciare a mano)"
```

---

## Task 2: Helper `territorioEffettivo`

**Files:**
- Create: `utils/rapportini/territorioEffettivo.ts`
- Test: `utils/rapportini/territorioEffettivo.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/territorioEffettivo.test.ts
import { describe, it, expect } from 'vitest';
import { territorioEffettivo } from './territorioEffettivo';

describe('territorioEffettivo', () => {
  it('usa l\'override quando valorizzato', () => {
    expect(territorioEffettivo('ACEA', 'Firenze')).toBe('ACEA');
  });
  it('ignora override vuoto/spazi e usa il territorio del piano', () => {
    expect(territorioEffettivo('   ', 'Firenze')).toBe('Firenze');
    expect(territorioEffettivo(null, 'Firenze')).toBe('Firenze');
    expect(territorioEffettivo(undefined, 'Firenze')).toBe('Firenze');
  });
  it('ritorna null se entrambi vuoti', () => {
    expect(territorioEffettivo(null, null)).toBeNull();
    expect(territorioEffettivo('', '  ')).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test (FAIL)**

Run: `npx vitest run utils/rapportini/territorioEffettivo.test.ts`
Expected: FAIL — `Failed to load url ./territorioEffettivo`.

- [ ] **Step 3: Implementa**

```ts
// utils/rapportini/territorioEffettivo.ts
// Territorio "effettivo" di un rapportino nel Riepilogo: l'override per-operatore
// vince sul territorio del piano. Stringhe vuote/spazi contano come assenti.
export function territorioEffettivo(
  override: string | null | undefined,
  territorioPiano: string | null | undefined,
): string | null {
  const o = (override ?? '').trim();
  if (o) return o;
  const p = (territorioPiano ?? '').trim();
  return p || null;
}
```

- [ ] **Step 4: Esegui il test (PASS)**

Run: `npx vitest run utils/rapportini/territorioEffettivo.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/territorioEffettivo.ts utils/rapportini/territorioEffettivo.test.ts
git commit -m "feat(rapportini): helper territorioEffettivo (override ?? piano)"
```

---

## Task 3: Helper puri override → interventi

**Files:**
- Create: `lib/interventi/territorioOverride.ts`
- Test: `lib/interventi/territorioOverride.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce (solo funzioni pure per ora)**

```ts
// lib/interventi/territorioOverride.test.ts
import { describe, it, expect } from 'vitest';
import { risolviTerritorioDestinazione, reapplyOverridesPlan } from './territorioOverride';

const idByName = new Map<string, string>([
  ['acea', 'id-acea'],
  ['firenze', 'id-firenze'],
]);

describe('risolviTerritorioDestinazione', () => {
  it('nome valido → override = nome, id risolto (case-insensitive)', () => {
    const r = risolviTerritorioDestinazione('ACEA', 'Firenze', idByName);
    expect(r).toEqual({ ok: true, override: 'ACEA', territorioId: 'id-acea' });
  });
  it('nome non trovato → errore', () => {
    const r = risolviTerritorioDestinazione('Marte', 'Firenze', idByName);
    expect(r.ok).toBe(false);
  });
  it('vuoto/null → ripristino: override null, destinazione = territorio piano', () => {
    expect(risolviTerritorioDestinazione(null, 'Firenze', idByName))
      .toEqual({ ok: true, override: null, territorioId: 'id-firenze' });
    expect(risolviTerritorioDestinazione('  ', 'Sconosciuto', idByName))
      .toEqual({ ok: true, override: null, territorioId: null });
  });
});

describe('reapplyOverridesPlan', () => {
  it('produce update solo per gli override risolvibili', () => {
    const updates = reapplyOverridesPlan(
      [
        { staff_id: 's1', territorio_override: 'ACEA' },
        { staff_id: 's2', territorio_override: null },
        { staff_id: 's3', territorio_override: 'Marte' }, // non risolvibile → scartato
      ],
      idByName,
    );
    expect(updates).toEqual([{ staffId: 's1', territorioId: 'id-acea' }]);
  });
});
```

- [ ] **Step 2: Esegui il test (FAIL)**

Run: `npx vitest run lib/interventi/territorioOverride.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa le funzioni pure (db functions arrivano in Task 5/7)**

```ts
// lib/interventi/territorioOverride.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type RisoluzioneTerritorio =
  | { ok: true; override: string | null; territorioId: string | null }
  | { ok: false; error: string };

/** Mappa nome→id territorio (chiave: name.trim().toLowerCase()). */
export type IdByName = Map<string, string>;

export function buildIdByName(territori: Array<{ id: string; name: string }>): IdByName {
  return new Map(territori.map((t) => [t.name.trim().toLowerCase(), t.id]));
}

/**
 * Decide override + territorio_id di destinazione.
 * - nome valorizzato → deve esistere in territori (altrimenti errore).
 * - vuoto/null → ripristino: override null, destinazione = territorio del piano
 *   (id se risolvibile, altrimenti null).
 */
export function risolviTerritorioDestinazione(
  richiesto: string | null | undefined,
  territorioPiano: string | null | undefined,
  idByName: IdByName,
): RisoluzioneTerritorio {
  const req = (richiesto ?? '').trim();
  if (req) {
    const id = idByName.get(req.toLowerCase());
    if (!id) return { ok: false, error: `Territorio "${req}" non trovato.` };
    return { ok: true, override: req, territorioId: id };
  }
  const piano = (territorioPiano ?? '').trim();
  const id = piano ? (idByName.get(piano.toLowerCase()) ?? null) : null;
  return { ok: true, override: null, territorioId: id };
}

export type OverrideUpdate = { staffId: string; territorioId: string };

/** Update da applicare a interventi per ri-allineare gli override (solo risolvibili). */
export function reapplyOverridesPlan(
  rapportini: Array<{ staff_id: string; territorio_override: string | null }>,
  idByName: IdByName,
): OverrideUpdate[] {
  const out: OverrideUpdate[] = [];
  for (const r of rapportini) {
    const name = (r.territorio_override ?? '').trim();
    if (!name) continue;
    const id = idByName.get(name.toLowerCase());
    if (id) out.push({ staffId: r.staff_id, territorioId: id });
  }
  return out;
}

export type SpostamentoResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Applica lo spostamento: aggiorna rapportini.territorio_override e
 * interventi.territorio_id (righe del piano per quell'operatore).
 */
export async function applicaSpostamentoTerritorio(
  db: SupabaseClient,
  rapportinoId: string,
  territorio: string | null | undefined,
): Promise<SpostamentoResult> {
  const { data: rap } = await db
    .from('rapportini').select('id, piano_id, staff_id').eq('id', rapportinoId).maybeSingle();
  if (!rap) return { ok: false, status: 404, error: 'Rapportino non trovato.' };
  const r = rap as { id: string; piano_id: string; staff_id: string };

  const { data: piano } = await db
    .from('mappa_piani').select('territorio').eq('id', r.piano_id).maybeSingle();
  const { data: terr } = await db.from('territories').select('id, name');
  const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);

  const ris = risolviTerritorioDestinazione(
    territorio, (piano as { territorio: string | null } | null)?.territorio, idByName,
  );
  if (!ris.ok) return { ok: false, status: 400, error: ris.error };

  const { error: eRap } = await db
    .from('rapportini').update({ territorio_override: ris.override }).eq('id', rapportinoId);
  if (eRap) return { ok: false, status: 500, error: eRap.message };

  const { error: eInt } = await db
    .from('interventi').update({ territorio_id: ris.territorioId })
    .eq('piano_id', r.piano_id).eq('staff_id', r.staff_id);
  if (eInt) return { ok: false, status: 500, error: eInt.message };

  return { ok: true };
}

/** Ri-applica a interventi gli override dei rapportini del piano (dopo rigenerazione). */
export async function reapplyOverridesInterventi(db: SupabaseClient, pianoId: string): Promise<void> {
  const { data: raps } = await db
    .from('rapportini').select('staff_id, territorio_override')
    .eq('piano_id', pianoId).not('territorio_override', 'is', null);
  const overrides = (raps ?? []) as Array<{ staff_id: string; territorio_override: string | null }>;
  if (!overrides.length) return;
  const { data: terr } = await db.from('territories').select('id, name');
  const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);
  for (const u of reapplyOverridesPlan(overrides, idByName)) {
    await db.from('interventi').update({ territorio_id: u.territorioId })
      .eq('piano_id', pianoId).eq('staff_id', u.staffId);
  }
}
```

- [ ] **Step 4: Esegui il test (PASS)**

Run: `npx vitest run lib/interventi/territorioOverride.test.ts`
Expected: PASS (le funzioni pure; le db function sono coperte in Task 7).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/territorioOverride.ts lib/interventi/territorioOverride.test.ts
git commit -m "feat(interventi): helper override territorio (risoluzione, reapply, spostamento)"
```

---

## Task 4: Riepilogo espone territorio effettivo + override

**Files:**
- Modify: `app/api/mappa/rapportini/riepilogo/route.ts`
- Modify: `utils/rapportini/groupByDay.ts`

- [ ] **Step 1: Aggiorna il tipo `RapRiepilogo`**

In `utils/rapportini/groupByDay.ts`, aggiungi il campo:

```ts
export type RapRiepilogo = RapportinoStato & {
  piano_id: string;
  territorio: string | null;
  piano_creato_at?: string | null;
  territorio_override?: string | null;
};
```

- [ ] **Step 2: Aggiorna la route**

In `app/api/mappa/rapportini/riepilogo/route.ts`:

Aggiungi l'import sotto gli altri:

```ts
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';
```

Aggiungi `territorio_override` alla select dei rapportini:

```ts
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at, riaperto_at, territorio_override')
```

Aggiungi il campo al tipo inline `list` (dopo `riaperto_at`):

```ts
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null; riaperto_at: string | null;
    territorio_override: string | null;
```

Sostituisci la riga `territorio:` dell'oggetto `out` e aggiungi `territorio_override`:

```ts
    territorio: territorioEffettivo(r.territorio_override, pianoInfoById[r.piano_id]?.territorio),
    territorio_override: r.territorio_override ?? null,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "riepilogo/route groupByDay"`
Expected: nessuna riga (nessun errore nei file toccati).

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/rapportini/riepilogo/route.ts utils/rapportini/groupByDay.ts
git commit -m "feat(riepilogo): territorio effettivo (override per-operatore) nel payload"
```

---

## Task 5: ensureInterventiForPiano ri-applica gli override

**Files:**
- Modify: `lib/interventi/ensureInterventiForPiano.ts`

- [ ] **Step 1: Importa l'helper**

In testa al file, dopo gli import esistenti:

```ts
import { reapplyOverridesInterventi } from './territorioOverride';
```

- [ ] **Step 2: Chiama il reapply prima del return finale**

Sostituisci il blocco finale:

```ts
  if (daInserire.length) {
    const { error } = await db.from('interventi').insert(daInserire);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }
  return { creati: daInserire.length, preservati, scartati };
```

con:

```ts
  if (daInserire.length) {
    const { error } = await db.from('interventi').insert(daInserire);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }

  // Ri-applica gli override per-operatore: la rigenerazione ha appena rimesso il
  // territorio del piano su tutte le righe; per gli operatori spostati va ripristinato.
  await reapplyOverridesInterventi(db, pianoId);

  return { creati: daInserire.length, preservati, scartati };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "ensureInterventiForPiano"`
Expected: nessuna riga.

- [ ] **Step 4: Esegui i test esistenti di sincronizza (non devono rompersi)**

Run: `npx vitest run lib/interventi/sincronizzaRapportini.test.ts`
Expected: PASS (ensure è mockato in quel test → reapply non viene eseguito).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/ensureInterventiForPiano.ts
git commit -m "feat(interventi): ensure ri-applica gli override territorio dopo la rigenerazione"
```

---

## Task 6: GET lista territori

**Files:**
- Create: `app/api/mappa/territori/route.ts`

- [ ] **Step 1: Crea la route**

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { data } = await supabaseAdmin
    .from('territories')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  return NextResponse.json((data ?? []) as Array<{ id: string; name: string }>);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "mappa/territori"`
Expected: nessuna riga.

- [ ] **Step 3: Commit**

```bash
git add app/api/mappa/territori/route.ts
git commit -m "feat(mappa): GET /api/mappa/territori (lista per selettore spostamento)"
```

---

## Task 7: API PATCH spostamento + test orchestrazione

**Files:**
- Create: `app/api/mappa/rapportini/territorio/route.ts`
- Modify: `lib/interventi/territorioOverride.test.ts`

- [ ] **Step 1: Aggiungi il test della db-function con fake db**

Aggiungi in fondo a `lib/interventi/territorioOverride.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { applicaSpostamentoTerritorio } from './territorioOverride';

type Row = Record<string, unknown>;
function fakeDb(seed: Record<string, Row[]>): { db: SupabaseClient; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));
  class B {
    table: string; op: 'select' | 'update' = 'select'; patch: Row = {};
    filters: Array<[string, unknown]> = [];
    constructor(t: string) { this.table = t; }
    select() { this.op = 'select'; return this; }
    update(p: Row) { this.op = 'update'; this.patch = p; return this; }
    eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    not() { return this; }
    private rows() {
      let rows = tables[this.table] ?? [];
      for (const [c, v] of this.filters) rows = rows.filter((r) => r[c] === v);
      return rows;
    }
    async maybeSingle() { return { data: this.rows()[0] ?? null, error: null }; }
    then(res: (v: { data: Row[]; error: null }) => void) {
      if (this.op === 'update') { for (const r of this.rows()) Object.assign(r, this.patch); res({ data: [], error: null }); return; }
      res({ data: this.rows(), error: null });
    }
  }
  return { db: { from: (t: string) => new B(t) } as unknown as SupabaseClient, tables };
}

describe('applicaSpostamentoTerritorio', () => {
  const seed = () => ({
    rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', territorio_override: null }],
    mappa_piani: [{ id: 'p1', territorio: 'Firenze' }],
    territories: [{ id: 'id-acea', name: 'ACEA' }, { id: 'id-firenze', name: 'Firenze' }],
    interventi: [
      { id: 'i1', piano_id: 'p1', staff_id: 's1', territorio_id: 'id-firenze' },
      { id: 'i2', piano_id: 'p1', staff_id: 's2', territorio_id: 'id-firenze' },
    ],
  });

  it('sposta: imposta override e aggiorna SOLO gli interventi dell\'operatore', async () => {
    const { db, tables } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'rap1', 'ACEA');
    expect(res.ok).toBe(true);
    expect(tables.rapportini[0].territorio_override).toBe('ACEA');
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-acea');
    expect(tables.interventi.find((i) => i.id === 'i2')?.territorio_id).toBe('id-firenze');
  });

  it('ripristino (null): override null e interventi tornano al territorio del piano', async () => {
    const seeded = seed();
    seeded.rapportini[0].territorio_override = 'ACEA';
    seeded.interventi[0].territorio_id = 'id-acea';
    const { db, tables } = fakeDb(seeded);
    const res = await applicaSpostamentoTerritorio(db, 'rap1', null);
    expect(res.ok).toBe(true);
    expect(tables.rapportini[0].territorio_override).toBeNull();
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-firenze');
  });

  it('rapportino inesistente → 404', async () => {
    const { db } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'nope', 'ACEA');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('territorio inesistente → 400', async () => {
    const { db } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'rap1', 'Marte');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test (PASS)**

Run: `npx vitest run lib/interventi/territorioOverride.test.ts`
Expected: PASS (pure + orchestrazione).

- [ ] **Step 3: Crea la route thin**

```ts
// app/api/mappa/rapportini/territorio/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoTerritorio } from '@/lib/interventi/territorioOverride';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { rapportinoId?: string; territorio?: string | null };
  const rapportinoId = String(body.rapportinoId ?? '').trim();
  if (!rapportinoId) return NextResponse.json({ error: 'rapportinoId richiesto.' }, { status: 400 });

  const res = await applicaSpostamentoTerritorio(supabaseAdmin, rapportinoId, body.territorio ?? null);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "rapportini/territorio"`
Expected: nessuna riga.

- [ ] **Step 5: Commit**

```bash
git add app/api/mappa/rapportini/territorio/route.ts lib/interventi/territorioOverride.test.ts
git commit -m "feat(mappa): PATCH /api/mappa/rapportini/territorio (sposta operatore) + test"
```

---

## Task 8: UI — CardTerritorio (badge + selettore Sposta)

**Files:**
- Modify: `components/modules/mappa/riepilogo/CardTerritorio.tsx`

- [ ] **Step 1: Estendi le props del componente**

Aggiungi al tipo delle props (dopo `busy: boolean;`):

```ts
  territori: Array<{ id: string; name: string }>;
  onSposta: (rapportinoId: string, territorio: string | null) => void;
  spostaOpen: string | null;
  setSpostaOpen: (v: string | null) => void;
```

E aggiungi i nomi alla destrutturazione dei parametri:

```ts
  terr, dataLabel, copiedToken, onCopia, onRiapri, onEliminaPiano, onRimuoviOp, onRiapriRapportino, confirmPiano, setConfirmPiano, confirmOp, setConfirmOp, busy, territori, onSposta, spostaOpen, setSpostaOpen,
```

- [ ] **Step 2: Badge "spostato" accanto al nome**

Nella riga del nome operatore, dopo lo `<span>` del conteggio interventi, aggiungi:

```tsx
                    <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                    {r.territorio_override && (
                      <span className="rounded-full border border-[var(--brand-primary-border)] px-2 py-0.5 text-[10px] text-[var(--brand-primary)]" title={`Spostato in ${r.territorio_override}`}>↪ spostato</span>
                    )}
```

- [ ] **Step 3: Pulsante "Sposta" + selettore inline**

Nella barra delle azioni (dentro `<div className="flex shrink-0 items-center gap-1.5 ...">`), prima del blocco `confirmOp`, aggiungi:

```tsx
                    {spostaOpen === r.id ? (
                      <select
                        autoFocus
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => { onSposta(r.id, e.target.value || null); setSpostaOpen(null); }}
                        onBlur={() => setSpostaOpen(null)}
                        className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1 py-0.5 text-[11px]"
                      >
                        <option value="" disabled>Sposta in…</option>
                        {r.territorio_override && <option value="__reset__">↩ Riporta al piano</option>}
                        {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSpostaOpen(r.id)}
                        title="Sposta in un altro territorio"
                        className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)] hover:text-[var(--brand-primary)]"
                      >↪</button>
                    )}
```

Nota: il valore `__reset__` va tradotto in `null` nell'handler del parent (Task 9). In alternativa l'`onChange` qui invia `e.target.value || null`; per il reset usiamo `__reset__` → il parent lo mappa a `null`.

Per chiarezza, cambia l'`onChange` in:

```tsx
                        onChange={(e) => { const v = e.target.value; onSposta(r.id, v === '__reset__' || v === '' ? null : v); setSpostaOpen(null); }}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "CardTerritorio"`
Run: `npx eslint components/modules/mappa/riepilogo/CardTerritorio.tsx`
Expected: nessun errore nei file toccati.

- [ ] **Step 5: Commit**

```bash
git add components/modules/mappa/riepilogo/CardTerritorio.tsx
git commit -m "feat(riepilogo): azione Sposta + badge spostato nella riga operatore"
```

---

## Task 9: UI — RiepilogoRapportini (carica territori, stato, handler)

**Files:**
- Modify: `components/modules/mappa/RiepilogoRapportini.tsx`

- [ ] **Step 1: Stato territori + selettore aperto**

Dopo `const [busy, setBusy] = useState(false);` aggiungi:

```ts
  const [territori, setTerritori] = useState<Array<{ id: string; name: string }>>([]);
  const [spostaOpen, setSpostaOpen] = useState<string | null>(null);
```

- [ ] **Step 2: Carica i territori una volta**

Dopo lo `useEffect(() => { carica(); }, [carica]);` aggiungi:

```ts
  useEffect(() => {
    let attivo = true;
    fetch('/api/mappa/territori')
      .then((r) => r.json())
      .then((d) => { if (attivo) setTerritori(Array.isArray(d) ? d : []); })
      .catch(() => { if (attivo) setTerritori([]); });
    return () => { attivo = false; };
  }, []);
```

- [ ] **Step 3: Handler di spostamento**

Dopo `rimuoviOperatore` (o vicino agli altri handler) aggiungi:

```ts
  const spostaOperatore = async (rapportinoId: string, territorio: string | null) => {
    setBusy(true);
    try {
      await fetch('/api/mappa/rapportini/territorio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapportinoId, territorio }),
      });
      await carica();
    } finally { setBusy(false); }
  };
```

- [ ] **Step 4: Passa le nuove props a CardTerritorio**

Nel JSX `<CardTerritorio ... />` aggiungi le props:

```tsx
                territori={territori}
                onSposta={spostaOperatore}
                spostaOpen={spostaOpen}
                setSpostaOpen={setSpostaOpen}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "RiepilogoRapportini"`
Run: `npx eslint components/modules/mappa/RiepilogoRapportini.tsx`
Expected: nessun errore nei file toccati.

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/RiepilogoRapportini.tsx
git commit -m "feat(riepilogo): carica territori e collega lo spostamento operatore"
```

---

## Task 10: Verifica finale

- [ ] **Step 1: Test dei file nuovi**

Run: `npx vitest run utils/rapportini/territorioEffettivo.test.ts lib/interventi/territorioOverride.test.ts lib/rapportini/contaVoci.test.ts lib/interventi/sincronizzaRapportini.test.ts`
Expected: tutti PASS.

- [ ] **Step 2: Typecheck mirato dei file toccati**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /I "territorioOverride territorioEffettivo riepilogo/route ensureInterventiForPiano mappa/territori rapportini/territorio CardTerritorio RiepilogoRapportini groupByDay"`
Expected: nessuna riga.

- [ ] **Step 3: Lint dei file toccati**

Run: `npx eslint app/api/mappa/rapportini/territorio/route.ts app/api/mappa/territori/route.ts app/api/mappa/rapportini/riepilogo/route.ts lib/interventi/territorioOverride.ts lib/interventi/ensureInterventiForPiano.ts utils/rapportini/territorioEffettivo.ts components/modules/mappa/riepilogo/CardTerritorio.tsx components/modules/mappa/RiepilogoRapportini.tsx`
Expected: nessun errore nei file toccati.

- [ ] **Step 4: Nota migrazione**

Ricorda all'utente di lanciare a mano `supabase/migrations/20260611000000_rapportini_territorio_override.sql` sul DB prod (il Supabase MCP non è prod). La feature richiede la colonna `territorio_override`.

---

## Self-Review (compilato)

- **Spec coverage:** override colonna (Task 1) ✓; lettura `override ?? piano` (Task 2,4) ✓; API spostamento + interventi (Task 3,7) ✓; reapply su rigenerazione (Task 3,5) ✓; GET territori (Task 6) ✓; UI azione+badge (Task 8,9) ✓; test (Task 2,3,7) ✓; migrazione manuale (Task 1,10) ✓.
- **Placeholder scan:** nessun TBD/TODO; codice completo in ogni step.
- **Type consistency:** `RisoluzioneTerritorio`, `OverrideUpdate`, `SpostamentoResult`, `IdByName`, `territorio_override`, `applicaSpostamentoTerritorio`, `reapplyOverridesInterventi` usati coerentemente tra task.
