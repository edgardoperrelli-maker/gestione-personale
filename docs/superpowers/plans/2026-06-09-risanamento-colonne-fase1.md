# Risanamento colonne — Fase 1 (Fondamenta dati) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Posare le fondamenta dati del flusso "risanamento colonne": schema DB (tabella di riferimento misuratori, tabella figlia righe, flag tipo) e schermata admin per importare l'estrazione misuratori da Excel/CSV.

**Architecture:** Una migration unica introduce `risanamento_misuratori_ref` (l'estrazione), `rapportino_righe` (riga-misuratore figlia di `rapportino_voci`), le colonne `tipo` su `rapportino_template`/`rapportini`, e una vista catalogo degli import. La logica di parsing del file è isolata in un modulo puro testato in TDD; l'endpoint admin la usa per popolare la tabella; una pagina admin offre upload + lista + elimina.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres), libreria `xlsx` (già nel progetto) per leggere Excel/CSV, Vitest, React 19, Tailwind v4.

**Vincoli operativi:**
- **Migration NON eseguita dall'agente.** Il Supabase MCP punta ad altro progetto; non esiste DB di sviluppo locale. Il file migration viene creato nel repo come record e **consegnato in blocco a fine progetto** (l'utente lo lancia dal PC). Di conseguenza l'integrazione DB (endpoint/UI contro tabelle reali) la verifica l'utente dopo il lancio; in locale i gate sono: **unit test del parser, `tsc`, `eslint`, `npm run build`**.
- `npm run lint` è già rosso sulla baseline: gate = `npx eslint <file>` mirato pulito sui file nuovi.
- **NON** fare `git push` senza ok esplicito. Branch di lavoro: `feat/risanamento-fase1` (già creato).
- Lingua UI/messaggi: italiano.

---

## File Structure

**Creati:**
- `supabase/migrations/20260609010000_risanamento_fase1.sql` — tutte le DDL della Fase 1 (2 tabelle + vista + 2 colonne).
- `lib/risanamento/parseImportMisuratori.ts` — parsing/validazione puri del file estrazione (testabile).
- `lib/risanamento/parseImportMisuratori.test.ts` — unit test del parser.
- `app/api/admin/risanamento/import-misuratori/route.ts` — POST import, GET catalogo import, DELETE import.
- `app/impostazioni/risanamento-misuratori/page.tsx` — server component (guard admin) + render client.
- `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx` — form upload + lista import + elimina.

**Non toccati in Fase 1:** editor template, generazione link, UI operatore, scanner, PDF.

---

## Task 1: Migration Fase 1 (schema)

**Files:**
- Create: `supabase/migrations/20260609010000_risanamento_fase1.sql`

- [ ] **Step 1: Scrivi il file migration**

Contenuto completo di `supabase/migrations/20260609010000_risanamento_fase1.sql`:

```sql
-- ============================================================================
-- Risanamento colonne — Fase 1: fondamenta dati
-- ============================================================================

-- 1) Tabella di riferimento misuratori (estrazione importata).
--    matricola = chiave del lookup; pdr/nominativo si auto-compilano dal match.
--    indirizzo/civico servono allo scope "prima nel civico". Nessun UNIQUE su
--    matricola: l'anagrafica puo' essere sporca (duplicati / civico errato).
create table if not exists risanamento_misuratori_ref (
  id bigserial primary key,
  import_id uuid not null,
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  pdr text not null default '',
  matricola text not null,
  nominativo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_ris_ref_matricola on risanamento_misuratori_ref (matricola);
create index if not exists idx_ris_ref_indirizzo_civico on risanamento_misuratori_ref (indirizzo, civico);
create index if not exists idx_ris_ref_import on risanamento_misuratori_ref (import_id);

alter table risanamento_misuratori_ref enable row level security;
drop policy if exists ris_ref_all_auth on risanamento_misuratori_ref;
create policy ris_ref_all_auth on risanamento_misuratori_ref
  for all to authenticated using (true) with check (true);

-- 2) Vista catalogo degli import (per la lista nella schermata admin).
create or replace view risanamento_import_catalog as
select
  import_id,
  count(*)::int          as righe,
  min(created_at)        as caricato_at,
  max(indirizzo)         as indirizzo_campione
from risanamento_misuratori_ref
group by import_id;

-- 3) Tabella figlia: riga-misuratore dentro una voce-civico.
--    Ogni scan = un INSERT indipendente (concorrenza multi-operatore safe).
create table if not exists rapportino_righe (
  id uuid primary key default gen_random_uuid(),
  voce_id uuid not null references rapportino_voci(id) on delete cascade,
  rapportino_id uuid not null references rapportini(id) on delete cascade,
  matricola text not null,
  pdr text,
  nominativo text,
  ref_id bigint references risanamento_misuratori_ref(id) on delete set null,
  fonte text not null default 'manuale' check (fonte in ('civico','fuori_elenco','manuale')),
  risposte jsonb not null default '{}',
  ordine int not null default 0,
  creato_da text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_righe_voce on rapportino_righe (voce_id);
create index if not exists idx_righe_rapportino on rapportino_righe (rapportino_id);
create index if not exists idx_righe_matricola on rapportino_righe (matricola);

-- Trigger updated_at (riusa la funzione set_updated_at() gia' presente nel progetto).
drop trigger if exists rapportino_righe_set_updated_at on rapportino_righe;
create trigger rapportino_righe_set_updated_at
  before update on rapportino_righe
  for each row execute function set_updated_at();

alter table rapportino_righe enable row level security;
drop policy if exists righe_all_auth on rapportino_righe;
create policy righe_all_auth on rapportino_righe
  for all to authenticated using (true) with check (true);

-- 4) Flag tipo: distingue il template/rapportino gerarchico "risanamento".
alter table rapportino_template
  add column if not exists tipo text not null default 'standard'
  check (tipo in ('standard','risanamento'));
alter table rapportini
  add column if not exists tipo text not null default 'standard'
  check (tipo in ('standard','risanamento'));
```

- [ ] **Step 2: Verifica coerenza con lo schema esistente**

Controlla (lettura) che gli oggetti referenziati esistano:
- `rapportino_voci(id)` e `rapportini(id)` — definiti in `supabase/migrations/20260502000000_rapportini_interattivi.sql`.
- la funzione `set_updated_at()` — usata dai trigger in quella stessa migration (riusabile).

Run: `npx tsx -e "0"` NON serve. Verifica testuale: `rg -n "function set_updated_at" supabase/migrations` deve trovare la definizione (in una migration precedente). Se non la trova, usa la funzione trigger già impiegata da `rapportini_set_updated_at` (stesso nome). Expected: la funzione esiste.

- [ ] **Step 3: NON eseguire su DB**

Non lanciare questa SQL. Verrà consegnata in blocco a fine progetto; l'utente la esegue dal PC.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609010000_risanamento_fase1.sql
git commit -m "feat(db): schema Fase 1 risanamento (ref misuratori, rapportino_righe, tipo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Parser import misuratori (TDD)

**Files:**
- Create: `lib/risanamento/parseImportMisuratori.ts`
- Test: `lib/risanamento/parseImportMisuratori.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

Contenuto di `lib/risanamento/parseImportMisuratori.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseImportMisuratori } from './parseImportMisuratori';

describe('parseImportMisuratori', () => {
  const header = ['Indirizzo', 'Civico', 'Comune', 'CAP', 'PDR', 'Matricola', 'Nominativo'];

  it('mappa le colonne e produce i record', () => {
    const rows = [
      header,
      ['Via Mario Rossi', '24', 'Napoli', '80100', 'PDR1', 'MAT1', 'Mario Rossi'],
      ['Via Mario Rossi', '24', 'Napoli', '80100', 'PDR2', 'MAT2', 'Anna Bianchi'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.totale).toBe(2);
    expect(res.scartate).toBe(0);
    expect(res.records).toEqual([
      { indirizzo: 'Via Mario Rossi', civico: '24', comune: 'Napoli', cap: '80100', pdr: 'PDR1', matricola: 'MAT1', nominativo: 'Mario Rossi' },
      { indirizzo: 'Via Mario Rossi', civico: '24', comune: 'Napoli', cap: '80100', pdr: 'PDR2', matricola: 'MAT2', nominativo: 'Anna Bianchi' },
    ]);
  });

  it('scarta le righe senza matricola e le conta', () => {
    const rows = [
      header,
      ['Via X', '1', 'Napoli', '', '', 'MATX', 'Tizio'],
      ['Via Y', '2', 'Napoli', '', 'PDRY', '', 'Caio'], // niente matricola → scartata
    ];
    const res = parseImportMisuratori(rows);
    expect(res.totale).toBe(2);
    expect(res.scartate).toBe(1);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].matricola).toBe('MATX');
  });

  it('riconosce gli header indipendentemente da maiuscole/spazi/accenti', () => {
    const rows = [
      ['  MATRICOLA ', 'p.d.r.', 'Nominativo', 'VIA', 'N. Civico', 'Città', 'C.A.P.'],
      ['MAT9', 'PDR9', 'Nome9', 'Via Z', '9', 'Napoli', '80120'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0]).toEqual({
      matricola: 'MAT9', pdr: 'PDR9', nominativo: 'Nome9',
      indirizzo: 'Via Z', civico: '9', comune: 'Napoli', cap: '80120',
    });
  });

  it('campi opzionali assenti → stringa vuota', () => {
    const rows = [
      ['Matricola', 'Indirizzo', 'Civico'],
      ['MAT1', 'Via A', '3'],
    ];
    const res = parseImportMisuratori(rows);
    expect(res.records[0]).toEqual({
      matricola: 'MAT1', indirizzo: 'Via A', civico: '3',
      comune: '', cap: '', pdr: '', nominativo: '',
    });
  });

  it('lancia se manca la colonna matricola', () => {
    const rows = [['Indirizzo', 'Civico', 'PDR'], ['Via A', '1', 'PDR1']];
    expect(() => parseImportMisuratori(rows)).toThrowError(/matricola/i);
  });

  it('file vuoto o solo header → nessun record', () => {
    expect(parseImportMisuratori([]).records).toEqual([]);
    expect(parseImportMisuratori([['Matricola']]).records).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npx vitest run lib/risanamento/parseImportMisuratori.test.ts`
Expected: FAIL — modulo non esistente.

- [ ] **Step 3: Implementa il parser**

Contenuto di `lib/risanamento/parseImportMisuratori.ts`:

```ts
/** Un misuratore di riferimento pronto per l'insert in risanamento_misuratori_ref. */
export type MisuratoreRefInput = {
  indirizzo: string;
  civico: string;
  comune: string;
  cap: string;
  pdr: string;
  matricola: string;
  nominativo: string;
};

export type ParseResult = {
  records: MisuratoreRefInput[];
  totale: number;   // righe dati lette (escluso header)
  scartate: number; // righe senza matricola
};

type Campo = keyof MisuratoreRefInput;

/** Pattern per riconoscere l'intestazione di colonna (su stringa normalizzata). */
const PATTERN: Record<Campo, RegExp> = {
  matricola: /matricola|matr/,
  pdr: /pdr|puntodiriconsegna|puntoriconsegna/,
  nominativo: /nominativo|intestatario|cliente|nome/,
  indirizzo: /indirizzo|via|odonimo|toponimo/,
  civico: /civico|nciv|numciv/,
  comune: /comune|citta|localita/,
  cap: /^cap$|^c.?a.?p/,
};

/** Normalizza un'intestazione: minuscolo, senza accenti/diacritici, senza non-alfanumerici. */
function normHeader(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cell(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * Parsifica le righe grezze di un foglio (header in riga 0) in record misuratore.
 * - Mappa le colonne per pattern (case/accent/space-insensitive).
 * - Scarta (contandole) le righe senza matricola.
 * - Lancia Error se manca la colonna matricola.
 */
export function parseImportMisuratori(rows: unknown[][]): ParseResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { records: [], totale: 0, scartate: 0 };
  }
  const header = rows[0] ?? [];
  const idx: Partial<Record<Campo, number>> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    (Object.keys(PATTERN) as Campo[]).forEach((campo) => {
      if (idx[campo] === undefined && PATTERN[campo].test(n)) idx[campo] = i;
    });
  });

  if (idx.matricola === undefined) {
    throw new Error('Colonna "matricola" mancante nel file.');
  }

  const get = (row: unknown[], campo: Campo): string =>
    idx[campo] === undefined ? '' : cell(row[idx[campo] as number]);

  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => cell(c) !== ''));
  const records: MisuratoreRefInput[] = [];
  let scartate = 0;

  for (const row of dataRows) {
    const matricola = get(row, 'matricola');
    if (!matricola) { scartate++; continue; }
    records.push({
      indirizzo: get(row, 'indirizzo'),
      civico: get(row, 'civico'),
      comune: get(row, 'comune'),
      cap: get(row, 'cap'),
      pdr: get(row, 'pdr'),
      matricola,
      nominativo: get(row, 'nominativo'),
    });
  }

  return { records, totale: dataRows.length, scartate };
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npx vitest run lib/risanamento/parseImportMisuratori.test.ts`
Expected: PASS (tutti).

- [ ] **Step 5: Lint**

Run: `npx eslint lib/risanamento/parseImportMisuratori.ts lib/risanamento/parseImportMisuratori.test.ts --max-warnings=0`
Expected: nessun output.

- [ ] **Step 6: Commit**

```bash
git add lib/risanamento/parseImportMisuratori.ts lib/risanamento/parseImportMisuratori.test.ts
git commit -m "feat(risanamento): parser import estrazione misuratori" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Endpoint admin import/catalogo/elimina

**Files:**
- Create: `app/api/admin/risanamento/import-misuratori/route.ts`

- [ ] **Step 1: Implementa il route handler**

Contenuto di `app/api/admin/risanamento/import-misuratori/route.ts`:

```ts
import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseImportMisuratori, type MisuratoreRefInput } from '@/lib/risanamento/parseImportMisuratori';

export const runtime = 'nodejs';

const BATCH = 500;

/** POST: importa un'estrazione Excel/CSV nella tabella di riferimento. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }

  let rows: unknown[][];
  try {
    const wb = name.endsWith('.csv')
      ? XLSX.read(await file.text(), { type: 'string' })
      : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseImportMisuratori(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'File non valido.' }, { status: 422 });
  }
  if (parsed.records.length === 0) {
    return NextResponse.json({ error: 'Nessuna riga valida (matricola assente).' }, { status: 422 });
  }

  const importId = randomUUID();
  const payload = parsed.records.map((r: MisuratoreRefInput) => ({ ...r, import_id: importId }));

  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabaseAdmin
      .from('risanamento_misuratori_ref')
      .insert(payload.slice(i, i + BATCH));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    import_id: importId,
    inseriti: parsed.records.length,
    totale: parsed.totale,
    scartate: parsed.scartate,
  });
}

/** GET: catalogo degli import caricati (dalla vista). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('risanamento_import_catalog')
    .select('import_id, righe, caricato_at, indirizzo_campione')
    .order('caricato_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** DELETE: elimina tutte le righe di un import (?import_id=...). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const importId = new URL(req.url).searchParams.get('import_id');
  if (!importId) return NextResponse.json({ error: 'import_id mancante.' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('risanamento_misuratori_ref')
    .delete()
    .eq('import_id', importId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verifica l'export di `requireAdmin`**

Conferma (lettura) che `lib/apiAuth` esporti `requireAdmin` con firma `(): Promise<NextResponse | ...>` (è già usato in `app/api/admin/rapportini/export-intervalli/route.ts`). Se il nome differisse, allinea l'import.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "import-misuratori"`
Expected: nessun output.

- [ ] **Step 4: Lint**

Run: `npx eslint "app/api/admin/risanamento/import-misuratori/route.ts" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/risanamento/import-misuratori/route.ts"
git commit -m "feat(risanamento): endpoint admin import/catalogo/elimina misuratori" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pagina admin (upload + lista + elimina)

**Files:**
- Create: `app/impostazioni/risanamento-misuratori/page.tsx`
- Create: `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx`

- [ ] **Step 1: Server component con guard admin**

Contenuto di `app/impostazioni/risanamento-misuratori/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';
import ImportMisuratoriClient from './ImportMisuratoriClient';

export const dynamic = 'force-dynamic';

export default async function RisanamentoMisuratoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  return <ImportMisuratoriClient />;
}
```

NOTE: verifica il path della pagina di login (qui `/login`, coerente con il resto del progetto) e l'helper `createServerComponentClient` (già usato altrove in `app/`); se il progetto usa un wrapper diverso per leggere user+role lato server, riusa quello.

- [ ] **Step 2: Client component (upload + lista + elimina)**

Contenuto di `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

type ImportRow = { import_id: string; righe: number; caricato_at: string; indirizzo_campione: string | null };
type Esito = { type: 'ok' | 'err'; msg: string } | null;

export default function ImportMisuratoriClient() {
  const [lista, setLista] = useState<ImportRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Esito>(null);

  const carica = useCallback(async () => {
    const res = await fetch('/api/admin/risanamento/import-misuratori');
    if (res.ok) setLista((await res.json()) as ImportRow[]);
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const importa = async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/api/admin/risanamento/import-misuratori', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setEsito({ type: 'err', msg: json.error ?? 'Import fallito.' }); return; }
      setEsito({ type: 'ok', msg: `Importati ${json.inseriti} misuratori (scartate ${json.scartate}).` });
      setFile(null);
      await carica();
    } catch {
      setEsito({ type: 'err', msg: 'Errore di rete.' });
    } finally {
      setBusy(false);
    }
  };

  const elimina = async (importId: string) => {
    if (!confirm('Eliminare questo import e tutti i suoi misuratori?')) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/risanamento/import-misuratori?import_id=${encodeURIComponent(importId)}`, { method: 'DELETE' });
      await carica();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[var(--brand-text-main)]">Estrazione misuratori (risanamento)</h1>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Importa estrazione</h2>
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          File Excel/CSV con colonne: Matricola (obbligatoria), PDR, Nominativo, Indirizzo, Civico, Comune, CAP.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--brand-text-main)]"
        />
        <button
          type="button"
          disabled={!file || busy}
          onClick={importa}
          className="mt-4 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Import in corso…' : 'Importa'}
        </button>
        {esito && (
          <p className={`mt-3 text-sm ${esito.type === 'ok' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {esito.msg}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--brand-text-main)]">Import caricati</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun import presente.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((imp) => (
              <li key={imp.import_id} className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                <div className="text-sm text-[var(--brand-text-main)]">
                  <span className="font-medium">{imp.righe} misuratori</span>
                  <span className="ml-2 text-xs text-[var(--brand-text-muted)]">
                    {new Date(imp.caricato_at).toLocaleString('it-IT')}{imp.indirizzo_campione ? ` · es. ${imp.indirizzo_campione}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => elimina(imp.import_id)}
                  className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "risanamento-misuratori"`
Expected: nessun output.

- [ ] **Step 4: Lint**

Run: `npx eslint "app/impostazioni/risanamento-misuratori/page.tsx" "app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 5: Commit**

```bash
git add "app/impostazioni/risanamento-misuratori/page.tsx" "app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx"
git commit -m "feat(risanamento): pagina admin import estrazione misuratori" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Unit test parser**

Run: `npx vitest run lib/risanamento/parseImportMisuratori.test.ts`
Expected: PASS.

- [ ] **Step 2: Type-check globale (file della Fase 1)**

Run: `npx tsc --noEmit 2>&1 | grep -Ei "risanamento|import-misuratori"`
Expected: nessun output.

- [ ] **Step 3: Lint di tutti i file nuovi**

Run:
```bash
npx eslint lib/risanamento/parseImportMisuratori.ts lib/risanamento/parseImportMisuratori.test.ts "app/api/admin/risanamento/import-misuratori/route.ts" "app/impostazioni/risanamento-misuratori/page.tsx" "app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx" --max-warnings=0
```
Expected: nessun output.

- [ ] **Step 4: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori; compare la route `/impostazioni/risanamento-misuratori`.

- [ ] **Step 5: Riepilogo all'utente**

Comunica: la Fase 1 è pronta sul branch `feat/risanamento-fase1`. La **migration** `20260609010000_risanamento_fase1.sql` va lanciata sul DB (verrà consegnata in blocco con le migration delle fasi successive, oppure su richiesta). Finché non è lanciata, la pagina import risponde con errore DB — è atteso. NON pushare/deployare senza ok esplicito e senza che la migration sia stata lanciata prima (stesso vincolo d'ordine SQL→deploy della feature precedente).

---

## Self-review (copertura spec)

- Tabella `risanamento_misuratori_ref` + indici + RLS → Task 1 ✓
- Vista catalogo import → Task 1 ✓ (serve alla GET del Task 3)
- `rapportino_righe` (FK voce/rapportino, `fonte`, `risposte`, indice matricola, trigger updated_at, RLS) → Task 1 ✓
- `tipo` su `rapportino_template` e `rapportini` → Task 1 ✓
- Parser import (header mapping, scarto senza matricola, throw se manca matricola) → Task 2 ✓
- Import Excel/CSV (xlsx) + insert batch + admin guard → Task 3 ✓
- Catalogo import + elimina → Task 3 (GET/DELETE) ✓
- Schermata admin upload + lista + elimina → Task 4 ✓
- Migration non eseguita, consegnata in blocco; gate locali parser/tsc/lint/build → vincoli + Task 5 ✓
- Confine Fase 1 (niente editor template/link/scanner/PDF) → rispettato (nessun task li tocca) ✓

## Note di consistenza tipi

- `MisuratoreRefInput` (Task 2) usato dall'endpoint (Task 3) nell'insert con `import_id` aggiunto.
- Colonne dell'insert (`indirizzo,civico,comune,cap,pdr,matricola,nominativo,import_id`) = colonne della tabella (Task 1).
- `risanamento_import_catalog` espone `import_id, righe, caricato_at, indirizzo_campione` (Task 1) = campi letti dalla GET (Task 3) e dal tipo `ImportRow` (Task 4).
