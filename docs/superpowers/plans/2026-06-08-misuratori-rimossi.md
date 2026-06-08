# Registro Misuratori Rimossi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare un modulo che traccia automaticamente i misuratori rimossi (interventi con esito positivo + matricola presente) e permette all'ufficio di aggiornarne lo stato logistico fino alla riconsegna al committente ACEA.

**Architecture:** Al momento dell'invio del rapportino (`/api/r/[token]/invia`), i voci con `esito_positivo` + `matricola` vengono inseriti nella tabella `misuratori_rimossi`. Il modulo UI legge questa tabella tramite `/api/misuratori` e consente aggiornamenti stato inline + export PDF con jsPDF.

**Tech Stack:** Next.js 15 App Router, Supabase (supabaseAdmin), jsPDF + jspdf-autotable (già installati), Tailwind CSS, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-08-misuratori-rimossi-design.md`

---

## File Map

| Operazione | Path |
|---|---|
| CREATE | `types/misuratori.ts` |
| CREATE | `app/api/misuratori/route.ts` |
| CREATE | `app/api/misuratori/[id]/route.ts` |
| CREATE | `app/api/misuratori/sync/route.ts` |
| MODIFY | `app/api/r/[token]/invia/route.ts` |
| CREATE | `components/modules/misuratori/StatoBadge.tsx` |
| CREATE | `components/modules/misuratori/MisuratoriTabella.tsx` |
| CREATE | `components/modules/misuratori/exportMisuratoriPdf.ts` |
| CREATE | `components/modules/misuratori/MisuratoriClient.tsx` |
| CREATE | `app/hub/misuratori/page.tsx` *(verifica path, vedi Task 11)* |
| MODIFY | Navigation config *(vedi Task 11)* |

---

## Task 1: Migration SQL — Crea tabella `misuratori_rimossi`

**Files:**
- SQL da consegnare all'utente per esecuzione manuale su Supabase prod

> **Nota:** l'utente esegue questa SQL manualmente dalla console Supabase (il MCP punta ad un progetto diverso). Consegna la SQL quando l'utente è pronto.

- [ ] **Step 1.1: Prepara la migration SQL**

```sql
-- Migration: crea tabella misuratori_rimossi
CREATE TABLE IF NOT EXISTS misuratori_rimossi (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id    UUID UNIQUE REFERENCES interventi(id) ON DELETE SET NULL,
  rapportino_id    UUID REFERENCES rapportini(id) ON DELETE SET NULL,

  odl              TEXT,
  data_esecuzione  DATE NOT NULL,
  esecutore        TEXT,
  indirizzo        TEXT,
  comune           TEXT,
  matricola        TEXT NOT NULL,
  pdr              TEXT,

  stato            TEXT NOT NULL DEFAULT 'da_consegnare_deposito'
                   CHECK (stato IN (
                     'da_consegnare_deposito',
                     'scaricato_deposito',
                     'verificato_deposito',
                     'in_consegna_committente',
                     'consegnato_committente'
                   )),
  note             TEXT,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mis_rim_stato ON misuratori_rimossi (stato);
CREATE INDEX IF NOT EXISTS idx_mis_rim_data  ON misuratori_rimossi (data_esecuzione);
CREATE INDEX IF NOT EXISTS idx_mis_rim_comune ON misuratori_rimossi (comune);
```

- [ ] **Step 1.2: Consegna SQL all'utente e attendi conferma esecuzione**

  Comunicare all'utente di eseguire la SQL su Supabase prod prima di procedere con i task successivi.

- [ ] **Step 1.3: Verifica tabella creata**

  Dopo conferma utente, verificare tramite log Vercel o chiedere all'utente di confermare la creazione.

---

## Task 2: Tipi TypeScript

**Files:**
- Create: `types/misuratori.ts`

- [ ] **Step 2.1: Crea `types/misuratori.ts`**

```typescript
export const STATI_MISURATORE = [
  'da_consegnare_deposito',
  'scaricato_deposito',
  'verificato_deposito',
  'in_consegna_committente',
  'consegnato_committente',
] as const;

export type StatoMisuratore = (typeof STATI_MISURATORE)[number];

export const STATO_LABEL: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:   'Da consegnare deposito',
  scaricato_deposito:       'Scaricato deposito',
  verificato_deposito:      'Verificato deposito',
  in_consegna_committente:  'In consegna committente',
  consegnato_committente:   'Consegnato committente',
};

export const STATO_COLOR: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:   'bg-gray-100 text-gray-600',
  scaricato_deposito:       'bg-amber-100 text-amber-700',
  verificato_deposito:      'bg-blue-100 text-blue-700',
  in_consegna_committente:  'bg-orange-100 text-orange-700',
  consegnato_committente:   'bg-green-100 text-green-700',
};

export interface MisuratoreRimosso {
  id: string;
  intervento_id: string | null;
  rapportino_id: string | null;
  odl: string | null;
  data_esecuzione: string;
  esecutore: string | null;
  indirizzo: string | null;
  comune: string | null;
  matricola: string;
  pdr: string | null;
  stato: StatoMisuratore;
  note: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2.2: Commit**

```bash
git add types/misuratori.ts
git commit -m "feat(misuratori): tipi TypeScript MisuratoreRimosso"
```

---

## Task 3: API GET — Lista misuratori con filtri

**Files:**
- Create: `app/api/misuratori/route.ts`

- [ ] **Step 3.1: Crea `app/api/misuratori/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

async function requireUser(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: (() => cookieStore) as unknown as () => ReturnType<typeof cookies>,
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  return true;
}

export async function GET(req: Request) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const dataInizio = searchParams.get('data_inizio');
  const dataFine   = searchParams.get('data_fine');
  const stato      = searchParams.get('stato');
  const comune     = searchParams.get('comune');
  const esecutore  = searchParams.get('esecutore');

  let query = supabaseAdmin
    .from('misuratori_rimossi')
    .select('*')
    .order('data_esecuzione', { ascending: false })
    .order('created_at', { ascending: false });

  if (dataInizio) query = query.gte('data_esecuzione', dataInizio);
  if (dataFine)   query = query.lte('data_esecuzione', dataFine);
  if (stato)      query = query.eq('stato', stato);
  if (comune)     query = query.ilike('comune', `%${comune}%`);
  if (esecutore)  query = query.eq('esecutore', esecutore);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 3.2: Commit**

```bash
git add app/api/misuratori/route.ts
git commit -m "feat(misuratori): API GET lista con filtri"
```

---

## Task 4: API PATCH — Aggiorna stato e note

**Files:**
- Create: `app/api/misuratori/[id]/route.ts`

- [ ] **Step 4.1: Crea `app/api/misuratori/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STATI_MISURATORE } from '@/types/misuratori';

export const runtime = 'nodejs';

async function requireUser(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: (() => cookieStore) as unknown as () => ReturnType<typeof cookies>,
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  return true;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('stato' in body) {
    if (!(STATI_MISURATORE as readonly string[]).includes(body.stato as string)) {
      return NextResponse.json({ error: 'stato non valido' }, { status: 400 });
    }
    patch.stato = body.stato;
  }

  if ('note' in body) {
    patch.note = typeof body.note === 'string' ? body.note || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('misuratori_rimossi')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4.2: Commit**

```bash
git add app/api/misuratori/[id]/route.ts
git commit -m "feat(misuratori): API PATCH aggiorna stato/note"
```

---

## Task 5: API POST sync — Fallback dati pregressi

**Files:**
- Create: `app/api/misuratori/sync/route.ts`

- [ ] **Step 5.1: Crea `app/api/misuratori/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: (() => cookieStore) as unknown as () => ReturnType<typeof cookies>,
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Riservato agli admin' }, { status: 403 });
  return true;
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  // 1. IDs già presenti
  const { data: existing } = await supabaseAdmin
    .from('misuratori_rimossi')
    .select('intervento_id');
  const existingIds = new Set((existing ?? []).map(r => r.intervento_id).filter(Boolean));

  // 2. Interventi qualificanti non ancora registrati
  const { data: interventi, error: errInt } = await supabaseAdmin
    .from('interventi')
    .select('id, data, matricola_contatore')
    .eq('esito', 'eseguito_positivo')
    .not('matricola_contatore', 'is', null)
    .neq('matricola_contatore', '');
  if (errInt) return NextResponse.json({ error: errInt.message }, { status: 500 });

  const nuoviIds = (interventi ?? [])
    .map(i => i.id)
    .filter(id => !existingIds.has(id));

  if (nuoviIds.length === 0) return NextResponse.json({ ok: true, inseriti: 0 });

  // 3. Recupera dati voce per questi interventi
  const { data: voci, error: errVoci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id, matricola, pdr, odl, via, comune, rapportino_id')
    .in('intervento_id', nuoviIds);
  if (errVoci) return NextResponse.json({ error: errVoci.message }, { status: 500 });

  // 4. Recupera staff_name dai rapportini
  const rapIds = [...new Set((voci ?? []).map(v => v.rapportino_id).filter(Boolean))];
  const { data: rapportini } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_name')
    .in('id', rapIds);

  const rapMap = Object.fromEntries((rapportini ?? []).map(r => [r.id, r.staff_name]));
  const intDataMap = Object.fromEntries((interventi ?? []).map(i => [i.id, i.data]));

  // 5. Costruisci payload e inserisci
  const toInsert = (voci ?? [])
    .filter(v => v.intervento_id && v.matricola && v.matricola.trim())
    .map(v => ({
      intervento_id:  v.intervento_id,
      rapportino_id:  v.rapportino_id ?? null,
      odl:            v.odl ?? null,
      data_esecuzione: intDataMap[v.intervento_id],
      esecutore:      rapMap[v.rapportino_id ?? ''] ?? null,
      indirizzo:      v.via ?? null,
      comune:         v.comune ?? null,
      matricola:      v.matricola.trim(),
      pdr:            v.pdr ?? null,
    }));

  if (toInsert.length === 0) return NextResponse.json({ ok: true, inseriti: 0 });

  const { error: errIns } = await supabaseAdmin
    .from('misuratori_rimossi')
    .upsert(toInsert, { onConflict: 'intervento_id', ignoreDuplicates: true });
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 });

  return NextResponse.json({ ok: true, inseriti: toInsert.length });
}
```

- [ ] **Step 5.2: Commit**

```bash
git add app/api/misuratori/sync/route.ts
git commit -m "feat(misuratori): API POST sync fallback dati pregressi"
```

---

## Task 6: Hook nell'endpoint di invio rapportino

**Files:**
- Modify: `app/api/r/[token]/invia/route.ts`

- [ ] **Step 6.1: Leggi il file corrente**

  Leggi `app/api/r/[token]/invia/route.ts` per confermare che la struttura è quella attesa prima di modificarlo.

- [ ] **Step 6.2: Aggiungi `staff_name` alla select di `rapportini`**

  Trova la riga:
  ```typescript
  .select('id, stato, data, campi_snapshot, riaperto_at')
  ```
  Sostituisci con:
  ```typescript
  .select('id, stato, data, staff_name, campi_snapshot, riaperto_at')
  ```

- [ ] **Step 6.3: Aggiungi campi misuratore alla select di `rapportino_voci`**

  Trova la riga:
  ```typescript
  .select('intervento_id, risposte, updated_at')
  ```
  Sostituisci con:
  ```typescript
  .select('intervento_id, risposte, updated_at, matricola, pdr, odl, via, comune')
  ```

- [ ] **Step 6.4: Aggiorna il tipo del for-loop e aggiungi raccolta misuratori**

  Il loop esistente ha questa firma del tipo:
  ```typescript
  for (const v of (voci ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null; updated_at: string }>)
  ```

  Sostituisci l'intero for-loop (incluse le righe di update interventi) con la versione ampliata:

  ```typescript
  const misuratoriFermi: Array<{
    intervento_id: string;
    rapportino_id: string;
    odl: string | null;
    data_esecuzione: string;
    esecutore: string | null;
    indirizzo: string | null;
    comune: string | null;
    matricola: string;
    pdr: string | null;
  }> = [];

  for (const v of (voci ?? []) as Array<{
    intervento_id: string | null;
    risposte: Record<string, unknown> | null;
    updated_at: string;
    matricola: string | null;
    pdr: string | null;
    odl: string | null;
    via: string | null;
    comune: string | null;
  }>) {
    if (!v.intervento_id) continue;
    const patch = esitoInterventoDaVoce(v.risposte ?? {}, campi);
    if (!patch) continue;
    // chiuso_at = ora di compilazione della voce (updated_at), non l'ora di invio.
    await supabaseAdmin
      .from('interventi')
      .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at })
      .eq('id', v.intervento_id)
      .neq('stato', 'annullato');

    // Raccolta misuratori rimossi (esito positivo + matricola presente)
    if (patch.esito === 'eseguito_positivo' && v.matricola && v.matricola.trim()) {
      misuratoriFermi.push({
        intervento_id:  v.intervento_id,
        rapportino_id:  rap.id,
        odl:            v.odl ?? null,
        data_esecuzione: (rap as { data: string }).data,
        esecutore:      (rap as { staff_name?: string | null }).staff_name ?? null,
        indirizzo:      v.via ?? null,
        comune:         v.comune ?? null,
        matricola:      v.matricola.trim(),
        pdr:            v.pdr ?? null,
      });
    }
  }

  // Inserisci in misuratori_rimossi (idempotente: ON CONFLICT DO NOTHING)
  if (misuratoriFermi.length > 0) {
    await supabaseAdmin
      .from('misuratori_rimossi')
      .upsert(misuratoriFermi, { onConflict: 'intervento_id', ignoreDuplicates: true });
  }
  ```

- [ ] **Step 6.5: Verifica che `return NextResponse.json({ ok: true })` sia ancora l'ultima riga**

  Il return finale non deve spostarsi dentro il for-loop.

- [ ] **Step 6.6: Verifica lint sul file modificato**

```bash
npx eslint app/api/r/[token]/invia/route.ts --max-warnings=0
```

  Se ci sono errori nuovi (non preesistenti), correggili.

- [ ] **Step 6.7: Commit**

```bash
git add app/api/r/[token]/invia/route.ts
git commit -m "feat(misuratori): hook auto-popolamento su invio rapportino"
```

---

## Task 7: Componente StatoBadge

**Files:**
- Create: `components/modules/misuratori/StatoBadge.tsx`

- [ ] **Step 7.1: Crea directory e componente**

```typescript
// components/modules/misuratori/StatoBadge.tsx
import { STATO_COLOR, STATO_LABEL, type StatoMisuratore } from '@/types/misuratori';

export default function StatoBadge({ stato }: { stato: StatoMisuratore }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATO_COLOR[stato]}`}
    >
      {STATO_LABEL[stato]}
    </span>
  );
}
```

- [ ] **Step 7.2: Commit**

```bash
git add components/modules/misuratori/StatoBadge.tsx
git commit -m "feat(misuratori): componente StatoBadge"
```

---

## Task 8: Componente MisuratoriTabella

**Files:**
- Create: `components/modules/misuratori/MisuratoriTabella.tsx`

Questo componente riceve i dati già filtrati dal parent e gestisce:
- Ordinamento locale per colonna
- Dropdown inline stato con ottimistic update
- Editing inline note (click → input → blur per salvare)

- [ ] **Step 8.1: Crea `components/modules/misuratori/MisuratoriTabella.tsx`**

```typescript
'use client';
import { useCallback, useMemo, useState } from 'react';
import { STATI_MISURATORE, STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import StatoBadge from './StatoBadge';

type SortKey = 'data_esecuzione' | 'stato' | 'comune';

interface Props {
  rows: MisuratoreRimosso[];
  onPatch: (id: string, patch: { stato?: StatoMisuratore; note?: string }) => Promise<void>;
}

export default function MisuratoriTabella({ rows, onPatch }: Props) {
  const [sortKey, setSortKey]   = useState<SortKey>('data_esecuzione');
  const [sortAsc, setSortAsc]   = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue]     = useState('');

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string;
      const bv = (b[sortKey] ?? '') as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortKey, sortAsc]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }, [sortKey]);

  const handleStatoChange = useCallback(
    async (id: string, stato: StatoMisuratore) => {
      await onPatch(id, { stato });
    },
    [onPatch]
  );

  const startNoteEdit = useCallback((row: MisuratoreRimosso) => {
    setEditingNote(row.id);
    setNoteValue(row.note ?? '');
  }, []);

  const commitNote = useCallback(
    async (id: string) => {
      await onPatch(id, { note: noteValue });
      setEditingNote(null);
    },
    [onPatch, noteValue]
  );

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun misuratore trovato con i filtri selezionati.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--brand-border)]">
      <table className="min-w-full divide-y divide-[var(--brand-border)] text-sm">
        <thead className="bg-[var(--brand-surface)]">
          <tr>
            {(
              [
                { key: null,              label: 'ODS/ODL' },
                { key: 'data_esecuzione', label: 'Data' },
                { key: null,              label: 'Esecutore' },
                { key: null,              label: 'Indirizzo' },
                { key: 'comune',          label: 'Comune' },
                { key: null,              label: 'Matricola' },
                { key: null,              label: 'PDR' },
                { key: 'stato',           label: 'Stato' },
                { key: null,              label: 'Note' },
              ] as Array<{ key: SortKey | null; label: string }>
            ).map(({ key, label }) => (
              <th
                key={label}
                onClick={key ? () => toggleSort(key) : undefined}
                className={`px-3 py-2 text-left font-medium text-[var(--brand-text-muted)] uppercase tracking-wide text-xs whitespace-nowrap${key ? ' cursor-pointer select-none hover:text-[var(--brand-text-main)]' : ''}`}
              >
                {label}{key && <SortArrow k={key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--brand-border)] bg-[var(--brand-bg)]">
          {sorted.map(row => (
            <tr key={row.id} className="hover:bg-[var(--brand-surface)] transition-colors">
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.odl ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.data_esecuzione}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.esecutore ?? '—'}</td>
              <td className="px-3 py-2 max-w-[180px] truncate">{row.indirizzo ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.comune ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.matricola}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.pdr ?? '—'}</td>

              {/* Dropdown stato inline */}
              <td className="px-3 py-2 whitespace-nowrap">
                <select
                  value={row.stato}
                  onChange={e => handleStatoChange(row.id, e.target.value as StatoMisuratore)}
                  className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  {STATI_MISURATORE.map(s => (
                    <option key={s} value={s}>{STATO_LABEL[s]}</option>
                  ))}
                </select>
              </td>

              {/* Note editabili inline */}
              <td className="px-3 py-2 min-w-[140px]">
                {editingNote === row.id ? (
                  <input
                    autoFocus
                    value={noteValue}
                    onChange={e => setNoteValue(e.target.value)}
                    onBlur={() => commitNote(row.id)}
                    onKeyDown={e => e.key === 'Enter' && commitNote(row.id)}
                    className="w-full rounded border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => startNoteEdit(row)}
                    className="cursor-text text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] italic"
                    title="Clicca per modificare"
                  >
                    {row.note || '—'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8.2: Commit**

```bash
git add components/modules/misuratori/MisuratoriTabella.tsx
git commit -m "feat(misuratori): componente MisuratoriTabella con sort e edit inline"
```

---

## Task 9: Utility export PDF

**Files:**
- Create: `components/modules/misuratori/exportMisuratoriPdf.ts`

jsPDF e jspdf-autotable sono già nel `package.json` (`jspdf: ^3.0.3`, `jspdf-autotable: ^5.0.2`).

- [ ] **Step 9.1: Crea `components/modules/misuratori/exportMisuratoriPdf.ts`**

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';

export interface PdfFilters {
  dataInizio?: string;
  dataFine?: string;
  stato?: string;
  comune?: string;
  esecutore?: string;
}

export function exportMisuratoriPdf(rows: MisuratoreRimosso[], filters: PdfFilters): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Intestazione
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Registro Misuratori Rimossi — ACEA', 14, 18);

  // Filtri attivi
  const parts: string[] = [];
  if (filters.dataInizio || filters.dataFine) {
    parts.push(`Periodo: ${filters.dataInizio ?? '—'} / ${filters.dataFine ?? '—'}`);
  }
  if (filters.stato) {
    parts.push(`Stato: ${STATO_LABEL[filters.stato as StatoMisuratore] ?? filters.stato}`);
  }
  if (filters.comune) parts.push(`Comune: ${filters.comune}`);
  if (filters.esecutore) parts.push(`Esecutore: ${filters.esecutore}`);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (parts.length) doc.text(parts.join('  ·  '), 14, 26);

  const printDate = new Date().toLocaleDateString('it-IT');
  doc.text(`Stampato: ${printDate}  ·  ${rows.length} righe`, 14, 32);

  // Tabella
  autoTable(doc, {
    startY: 38,
    head: [['ODS/ODL', 'Data', 'Esecutore', 'Indirizzo', 'Comune', 'Matricola', 'PDR', 'Stato', 'Note']],
    body: rows.map(r => [
      r.odl ?? '',
      r.data_esecuzione,
      r.esecutore ?? '',
      r.indirizzo ?? '',
      r.comune ?? '',
      r.matricola,
      r.pdr ?? '',
      STATO_LABEL[r.stato],
      r.note ?? '',
    ]),
    styles:     { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22 }, // ODS/ODL
      1: { cellWidth: 20 }, // Data
      2: { cellWidth: 28 }, // Esecutore
      3: { cellWidth: 45 }, // Indirizzo
      4: { cellWidth: 24 }, // Comune
      5: { cellWidth: 26 }, // Matricola
      6: { cellWidth: 20 }, // PDR
      7: { cellWidth: 36 }, // Stato
      8: { cellWidth: 'auto' }, // Note
    },
  });

  // Footer "Pagina X di Y" — post-processing (il totale pagine è noto solo dopo autoTable)
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' }
    );
  }

  doc.save(`misuratori-rimossi-${new Date().toISOString().slice(0, 10)}.pdf`);
}
```

- [ ] **Step 9.2: Commit**

```bash
git add components/modules/misuratori/exportMisuratoriPdf.ts
git commit -m "feat(misuratori): utility export PDF con jsPDF"
```

---

## Task 10: Componente MisuratoriClient

**Files:**
- Create: `components/modules/misuratori/MisuratoriClient.tsx`

Questo è il componente principale: gestisce lo stato filtri, il fetch, gli ottimistic update e il trigger PDF.

- [ ] **Step 10.1: Crea `components/modules/misuratori/MisuratoriClient.tsx`**

```typescript
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import MisuratoriTabella from './MisuratoriTabella';
import { exportMisuratoriPdf, type PdfFilters } from './exportMisuratoriPdf';

interface Filters {
  dataInizio: string;
  dataFine: string;
  stato: string;
  comune: string;
  esecutore: string;
}

const FILTERS_EMPTY: Filters = {
  dataInizio: '',
  dataFine: '',
  stato: '',
  comune: '',
  esecutore: '',
};

export default function MisuratoriClient() {
  const [rows, setRows]         = useState<MisuratoreRimosso[]>([]);
  const [filters, setFilters]   = useState<Filters>(FILTERS_EMPTY);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Esecutori e comuni univoci per le select dinamiche
  const esecutori = [...new Set(rows.map(r => r.esecutore).filter(Boolean))] as string[];
  const comuni    = [...new Set(rows.map(r => r.comune).filter(Boolean))] as string[];

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.dataInizio) params.set('data_inizio', f.dataInizio);
      if (f.dataFine)   params.set('data_fine', f.dataFine);
      if (f.stato)      params.set('stato', f.stato);
      if (f.comune)     params.set('comune', f.comune);
      if (f.esecutore)  params.set('esecutore', f.esecutore);

      const res = await fetch(`/api/misuratori?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore fetch');
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(filters); }, [fetchData, filters]);

  const handlePatch = useCallback(
    async (id: string, patch: { stato?: StatoMisuratore; note?: string }) => {
      // Ottimistic update
      setRows(prev =>
        prev.map(r => r.id === id ? { ...r, ...patch } : r)
      );
      try {
        const res = await fetch(`/api/misuratori/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          // Rollback: ricarica dati
          await fetchData(filters);
        }
      } catch {
        await fetchData(filters);
      }
    },
    [fetchData, filters]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/misuratori/sync', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; inseriti?: number; error?: string };
      if (json.ok) {
        await fetchData(filters);
        if (json.inseriti && json.inseriti > 0) {
          alert(`Sincronizzazione completata: ${json.inseriti} nuovi misuratori aggiunti.`);
        } else {
          alert('Nessun nuovo misuratore da sincronizzare.');
        }
      } else {
        alert(`Errore sync: ${json.error}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [fetchData, filters]);

  const handleExportPdf = useCallback(() => {
    const pdfFilters: PdfFilters = {
      dataInizio: filters.dataInizio || undefined,
      dataFine:   filters.dataFine   || undefined,
      stato:      filters.stato      || undefined,
      comune:     filters.comune     || undefined,
      esecutore:  filters.esecutore  || undefined,
    };
    exportMisuratoriPdf(rows, pdfFilters);
  }, [rows, filters]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--brand-text-main)]">
          Misuratori Rimossi
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] transition-colors disabled:opacity-50"
          >
            {syncing ? 'Sincronizzando…' : 'Ricalcola'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={rows.length === 0}
            className="rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Esporta PDF
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Dal</label>
          <input
            type="date"
            value={filters.dataInizio}
            onChange={e => setFilter('dataInizio', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Al</label>
          <input
            type="date"
            value={filters.dataFine}
            onChange={e => setFilter('dataFine', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Stato</label>
          <select
            value={filters.stato}
            onChange={e => setFilter('stato', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {STATI_MISURATORE.map(s => (
              <option key={s} value={s}>{STATO_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Comune</label>
          <select
            value={filters.comune}
            onChange={e => setFilter('comune', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {comuni.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Esecutore</label>
          <select
            value={filters.esecutore}
            onChange={e => setFilter('esecutore', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {esecutori.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {/* Stato caricamento / errore */}
      {loading && (
        <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Conteggio + Tabella */}
      {!loading && (
        <>
          <p className="text-xs text-[var(--brand-text-muted)]">
            {rows.length} {rows.length === 1 ? 'misuratore' : 'misuratori'}
          </p>
          <MisuratoriTabella rows={rows} onPatch={handlePatch} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 10.2: Verifica lint**

```bash
npx eslint components/modules/misuratori/ --max-warnings=0
```

  Correggi eventuali errori nuovi (non preesistenti).

- [ ] **Step 10.3: Commit**

```bash
git add components/modules/misuratori/
git commit -m "feat(misuratori): MisuratoriClient con filtri, ottimistic update e PDF"
```

---

## Task 11: Page route e navigazione

**Files:**
- Create: `app/hub/misuratori/page.tsx` *(verificare il path corretto)*
- Modify: file navigation config

- [ ] **Step 11.1: Verifica il path corretto per la nuova route**

  Esegui il seguente comando per capire dove vivono le pagine del modulo ufficio:

```bash
find app -name "page.tsx" | grep -v "r\[token\]" | head -20
```

  Cerca pattern come `app/hub/mappa/page.tsx` o `app/(protected)/mappa/page.tsx`. Usa lo stesso prefisso per il nuovo modulo.

- [ ] **Step 11.2: Crea la page file**

  Se le pagine sono sotto `app/hub/`:
  - Path: `app/hub/misuratori/page.tsx`

  Se sotto `app/(protected)/`:
  - Path: `app/(protected)/misuratori/page.tsx`

```typescript
import AuthGate from '@/components/AuthGate';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

export default function MisuratoriPage() {
  return (
    <AuthGate>
      <MisuratoriClient />
    </AuthGate>
  );
}
```

- [ ] **Step 11.3: Trova il file di configurazione della navigazione**

```bash
grep -r "appNavigation" --include="*.ts" --include="*.tsx" -l
```

  Oppure:
```bash
grep -r "href.*mappa\|href.*riepilogo" --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 11.4: Aggiungi voce "Misuratori" alla navigation config**

  Nel file trovato allo step precedente, aggiungi una voce con lo stesso pattern delle voci esistenti. Esempio (adatta icon e struttura al pattern esistente):

```typescript
{
  href: '/hub/misuratori',  // aggiusta prefisso se necessario
  label: 'Misuratori',
  icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
    </svg>
  ),
},
```

- [ ] **Step 11.5: Verifica lint sull'intera directory**

```bash
npx eslint app/hub/misuratori/ components/modules/misuratori/ --max-warnings=0
```

- [ ] **Step 11.6: Commit finale**

```bash
git add app/hub/misuratori/ components/layout/
git commit -m "feat(misuratori): page route e voce navigazione"
```

---

## Task 12: Smoke test manuale

- [ ] **Step 12.1: Avvia il server di sviluppo e verifica la pagina**

```bash
npm run dev
```

  Naviga su `http://localhost:3000/hub/misuratori` (o il path corretto).

  Verifica:
  - [ ] La pagina si carica senza errori di console
  - [ ] I filtri sono visibili
  - [ ] La tabella mostra i dati (o "Nessun misuratore" se la tabella è vuota)
  - [ ] Il pulsante "Esporta PDF" genera un file scaricabile
  - [ ] Il dropdown stato nella tabella aggiorna il badge inline

- [ ] **Step 12.2: Testa l'hook invia**

  Con un rapportino di test che abbia una voce con matricola + esito positivo: invia il rapportino e verifica che compaia un record nella pagina misuratori.

- [ ] **Step 12.3: Commit finale di verifica**

  Se sono stati necessari fix durante lo smoke test:
```bash
git add -p
git commit -m "fix(misuratori): correzioni post smoke test"
```

---

## Riepilogo ordine di esecuzione

1. Task 1 — SQL (richiede esecuzione manuale su Supabase prod dall'utente)
2. Task 2 — Tipi (nessuna dipendenza)
3. Tasks 3, 4, 5 — API routes (dipendono dai tipi)
4. Task 6 — Hook invia (dipende dalla tabella esistente)
5. Tasks 7, 8, 9 — Componenti (dipendono dai tipi)
6. Task 10 — MisuratoriClient (dipende da 7, 8, 9)
7. Task 11 — Page + Navigation (dipende da 10)
8. Task 12 — Smoke test
