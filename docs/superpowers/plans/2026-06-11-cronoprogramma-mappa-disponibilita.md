# Cronoprogramma ↔ Mappa: Disponibilità operatori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare Cronoprogramma e Mappa Operatori tramite una tabella unica di disponibilità/assenze a fascia oraria, così che chi è assente (intera giornata) nel cronoprogramma non sia assegnabile nella Mappa in quella data.

**Architecture:** Nuova tabella `disponibilita_operatore` (fonte unica di verità, senza territorio). Il cronoprogramma la scrive via un dialog dedicato; la Mappa la legge per la data pianificata e blocca/segnala. Logica orari condivisa in un helper puro testato (`lib/disponibilita.ts`).

**Tech Stack:** Next.js 14 (app router), TypeScript, React, Supabase (service-role nelle route `/api`), TailwindCSS, vitest.

**Riferimento spec:** `docs/superpowers/specs/2026-06-11-cronoprogramma-mappa-disponibilita-design.md`

**Convenzioni del progetto verificate:**
- `staff_id` è sempre `text`, niente FK sullo schema base.
- Route API: `requireUser()` da `@/lib/apiAuth` + client `supabaseAdmin` (service role). Pattern in `app/api/mappa/distribuzioni/route.ts`.
- Token colore confermati in `app/globals.css`: `--info`, `--warning`, `--danger`, `--success` (+ `-soft`). Manca un viola → lo aggiungiamo (Task 2).
- Test vitest: file `*.test.ts` accanto al sorgente (es. `lib/interventi/mappaInterventi.test.ts`).

---

## Task 1: Migration — tabella `disponibilita_operatore`

**Files:**
- Create: `supabase/migrations/20260611000000_disponibilita_operatore.sql`

- [ ] **Step 1: Scrivi il file migration**

Crea `supabase/migrations/20260611000000_disponibilita_operatore.sql`:

```sql
-- Disponibilità / assenze operatore (fonte unica per Cronoprogramma ↔ Mappa).
-- Indipendente dal territorio: un'assenza è uno stato della persona.
CREATE TABLE IF NOT EXISTS disponibilita_operatore (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    text NOT NULL,                 -- convenzione progetto (no FK su schema base)
  data        date NOT NULL,
  tipo        text NOT NULL
              CHECK (tipo IN ('ferie','104','malattia','permesso','congedo','lutto')),
  modalita    text NOT NULL DEFAULT 'intera'
              CHECK (modalita IN ('intera','parziale')),
  ora_da      time NULL,                     -- inizio finestra DISPONIBILITÀ (null = da inizio giornata)
  ora_a       time NULL,                     -- fine finestra DISPONIBILITÀ   (null = fino a fine giornata)
  note        text NULL,
  created_by  uuid NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (staff_id, data)
);

CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_data
  ON disponibilita_operatore (data);
CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_staff_data
  ON disponibilita_operatore (staff_id, data);

ALTER TABLE disponibilita_operatore ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_policy" ON disponibilita_operatore
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Verifica il file esiste**

Run: `ls supabase/migrations/20260611000000_disponibilita_operatore.sql`
Expected: il file esiste.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000000_disponibilita_operatore.sql
git commit -m "migration(disponibilita): tabella disponibilita_operatore"
```

> NOTA: il Supabase MCP non punta al DB prod. Questa migration verrà lanciata dall'utente sul DB di produzione (consegna SQL come da preferenza utente).

---

## Task 2: Token viola + helper puro `lib/disponibilita.ts` (TDD)

**Files:**
- Modify: `app/globals.css` (aggiungi `--viola`/`--viola-soft` nei due blocchi tema)
- Create: `lib/disponibilita.ts`
- Test: `lib/disponibilita.test.ts`

- [ ] **Step 1: Aggiungi il token viola (tema chiaro)**

In `app/globals.css`, dopo la riga `--info-soft:    oklch(0.80 0.16 215 / 0.16);` (primo blocco, ~riga 57), aggiungi:

```css
  --viola:        oklch(0.62 0.20 300);
  --viola-soft:   oklch(0.62 0.20 300 / 0.16);
```

- [ ] **Step 2: Aggiungi il token viola (secondo blocco tema)**

In `app/globals.css`, dopo la riga `--info-soft:    oklch(0.78 0.155 215 / 0.14);` (secondo blocco, ~riga 130), aggiungi:

```css
  --viola:        oklch(0.55 0.17 300);
  --viola-soft:   oklch(0.62 0.20 300 / 0.14);
```

- [ ] **Step 3: Scrivi i test (falliscono)**

Crea `lib/disponibilita.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  derivaModalita,
  isAssenzaIntera,
  labelOrario,
  labelDisponibilita,
  indexByStaffData,
  isTipoAssenza,
  type Disponibilita,
} from './disponibilita';

function d(over: Partial<Disponibilita> = {}): Disponibilita {
  return {
    id: 'id-1', staff_id: 's1', data: '2026-06-12',
    tipo: 'ferie', modalita: 'intera', ora_da: null, ora_a: null, note: null,
    ...over,
  };
}

describe('derivaModalita', () => {
  it('null+null → intera', () => expect(derivaModalita(null, null)).toBe('intera'));
  it('solo ora_a → parziale', () => expect(derivaModalita(null, '13:00')).toBe('parziale'));
  it('solo ora_da → parziale', () => expect(derivaModalita('14:00', null)).toBe('parziale'));
  it('entrambe → parziale', () => expect(derivaModalita('09:00', '13:00')).toBe('parziale'));
});

describe('isAssenzaIntera', () => {
  it('senza orari è intera', () => expect(isAssenzaIntera(d())).toBe(true));
  it('con orario non è intera', () => expect(isAssenzaIntera(d({ ora_a: '13:00' }))).toBe(false));
});

describe('labelOrario', () => {
  it('tutto il giorno', () => expect(labelOrario(null, null)).toBe('tutto il giorno'));
  it('fino alle', () => expect(labelOrario(null, '13:00')).toBe('fino alle 13:00'));
  it('dalle', () => expect(labelOrario('14:00', null)).toBe('dalle 14:00'));
  it('finestra', () => expect(labelOrario('09:00', '13:00')).toBe('09:00–13:00'));
  it('normalizza HH:MM:SS → HH:MM', () => expect(labelOrario(null, '13:00:00')).toBe('fino alle 13:00'));
});

describe('labelDisponibilita', () => {
  it('compone tipo + orario', () =>
    expect(labelDisponibilita(d({ tipo: '104', ora_a: '13:00' }))).toBe('104 · fino alle 13:00'));
});

describe('indexByStaffData', () => {
  it('indicizza per staff_id|data', () => {
    const idx = indexByStaffData([d({ staff_id: 's1', data: '2026-06-12' })]);
    expect(idx['s1|2026-06-12']?.id).toBe('id-1');
  });
});

describe('isTipoAssenza', () => {
  it('accetta i 6 tipi', () => expect(isTipoAssenza('lutto')).toBe(true));
  it('rifiuta altro', () => expect(isTipoAssenza('lavoro')).toBe(false));
});
```

- [ ] **Step 4: Run test (devono fallire)**

Run: `npx vitest run lib/disponibilita.test.ts`
Expected: FAIL — modulo `./disponibilita` non trovato.

- [ ] **Step 5: Implementa l'helper**

Crea `lib/disponibilita.ts`:

```ts
export const TIPI_ASSENZA = ['ferie', '104', 'malattia', 'permesso', 'congedo', 'lutto'] as const;
export type TipoAssenza = typeof TIPI_ASSENZA[number];

export type Disponibilita = {
  id: string;
  staff_id: string;
  data: string;            // YYYY-MM-DD
  tipo: TipoAssenza;
  modalita: 'intera' | 'parziale';
  ora_da: string | null;   // 'HH:MM' (o 'HH:MM:SS' dal DB)
  ora_a: string | null;
  note: string | null;
};

/** Metadati UI per tipo: etichetta + colori (token tema, niente hard-coded). */
export const TIPO_META: Record<TipoAssenza, { label: string; bg: string; border: string; text: string }> = {
  ferie:    { label: 'Ferie',    bg: 'var(--info-soft)',           border: 'var(--info)',           text: 'var(--info)' },
  '104':    { label: '104',      bg: 'var(--viola-soft)',          border: 'var(--viola)',          text: 'var(--viola)' },
  malattia: { label: 'Malattia', bg: 'var(--danger-soft)',         border: 'var(--danger)',         text: 'var(--danger)' },
  permesso: { label: 'Permesso', bg: 'var(--warning-soft)',        border: 'var(--warning)',        text: 'var(--warning)' },
  congedo:  { label: 'Congedo',  bg: 'var(--success-soft)',        border: 'var(--success)',        text: 'var(--success)' },
  lutto:    { label: 'Lutto',    bg: 'var(--brand-surface-muted)', border: 'var(--brand-border)',   text: 'var(--brand-text-muted)' },
};

export function isTipoAssenza(v: unknown): v is TipoAssenza {
  return typeof v === 'string' && (TIPI_ASSENZA as readonly string[]).includes(v);
}

/** 'intera' se nessun orario, altrimenti 'parziale'. */
export function derivaModalita(ora_da: string | null, ora_a: string | null): 'intera' | 'parziale' {
  return !ora_da && !ora_a ? 'intera' : 'parziale';
}

export function isAssenzaIntera(d: Pick<Disponibilita, 'ora_da' | 'ora_a'>): boolean {
  return derivaModalita(d.ora_da, d.ora_a) === 'intera';
}

/** Normalizza 'HH:MM:SS' → 'HH:MM'. */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : t;
}

export function labelOrario(ora_da: string | null, ora_a: string | null): string {
  const da = hhmm(ora_da);
  const a = hhmm(ora_a);
  if (!da && !a) return 'tutto il giorno';
  if (da && a) return `${da}–${a}`;
  if (a) return `fino alle ${a}`;
  return `dalle ${da}`;
}

export function labelDisponibilita(d: Pick<Disponibilita, 'tipo' | 'ora_da' | 'ora_a'>): string {
  return `${TIPO_META[d.tipo].label} · ${labelOrario(d.ora_da, d.ora_a)}`;
}

/** Indicizza per `${staff_id}|${data}` (1 riga per operatore/giorno). */
export function indexByStaffData(rows: Disponibilita[]): Record<string, Disponibilita> {
  const m: Record<string, Disponibilita> = {};
  for (const r of rows) m[`${r.staff_id}|${r.data}`] = r;
  return m;
}
```

- [ ] **Step 6: Run test (devono passare)**

Run: `npx vitest run lib/disponibilita.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 7: Commit**

```bash
git add app/globals.css lib/disponibilita.ts lib/disponibilita.test.ts
git commit -m "feat(disponibilita): helper puro + tipi + token viola (test verdi)"
```

---

## Task 3: Route API `/api/disponibilita`

**Files:**
- Create: `app/api/disponibilita/route.ts`

- [ ] **Step 1: Crea la route**

Crea `app/api/disponibilita/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/apiAuth';
import { derivaModalita, isTipoAssenza } from '@/lib/disponibilita';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SELECT = 'id, staff_id, data, tipo, modalita, ora_da, ora_a, note';

// GET ?data=YYYY-MM-DD  (Mappa)  oppure  ?from=YYYY-MM-DD&to=YYYY-MM-DD  (Cronoprogramma)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const data = sp.get('data');
    const from = sp.get('from');
    const to = sp.get('to');

    let query = supabaseAdmin.from('disponibilita_operatore').select(SELECT);
    if (data) {
      query = query.eq('data', data);
    } else if (from && to) {
      query = query.gte('data', from).lte('data', to);
    } else {
      return NextResponse.json({ error: 'Missing data or from/to' }, { status: 400 });
    }

    const res = await query;
    if (res.error) {
      console.error('GET /api/disponibilita select error:', res.error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }
    return NextResponse.json(res.data ?? []);
  } catch (error) {
    console.error('GET /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST { staff_id, data, tipo, ora_da|null, ora_a|null, note|null } → upsert su (staff_id, data)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { staff_id, data, tipo } = body;
    const ora_da = body.ora_da || null;
    const ora_a = body.ora_a || null;
    const note = body.note || null;

    if (!staff_id || !data || !isTipoAssenza(tipo)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (ora_da && ora_a && ora_da >= ora_a) {
      return NextResponse.json({ error: 'ora_da deve precedere ora_a' }, { status: 400 });
    }

    const row = {
      staff_id,
      data,
      tipo,
      modalita: derivaModalita(ora_da, ora_a),
      ora_da,
      ora_a,
      note,
      updated_at: new Date().toISOString(),
    };

    const res = await supabaseAdmin
      .from('disponibilita_operatore')
      .upsert(row, { onConflict: 'staff_id,data' })
      .select(SELECT)
      .single();

    if (res.error) {
      console.error('POST /api/disponibilita upsert error:', res.error);
      return NextResponse.json({ error: 'Upsert failed' }, { status: 500 });
    }
    return NextResponse.json(res.data);
  } catch (error) {
    console.error('POST /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE ?id=...
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const res = await supabaseAdmin.from('disponibilita_operatore').delete().eq('id', id);
    if (res.error) {
      console.error('DELETE /api/disponibilita error:', res.error);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifica typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file nuovi (`app/api/disponibilita/route.ts`, `lib/disponibilita.ts`). (La baseline del repo può avere errori preesistenti altrove: verifica che non ne compaiano di nuovi su questi file.)

- [ ] **Step 3: Commit**

```bash
git add app/api/disponibilita/route.ts
git commit -m "feat(disponibilita): route /api/disponibilita (GET/POST upsert/DELETE)"
```

---

## Task 4: Dialog `AssenzaDialog` (cronoprogramma scrive)

**Files:**
- Create: `components/modules/cronoprogramma-personale/AssenzaDialog.tsx`

- [ ] **Step 1: Crea il componente**

Crea `components/modules/cronoprogramma-personale/AssenzaDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import DatePicker from '@/components/ui/DatePicker';
import { TIPI_ASSENZA, TIPO_META, type Disponibilita, type TipoAssenza } from '@/lib/disponibilita';
import type { Staff } from '@/types';

type ModoOrario = 'intera' | 'fino' | 'dalle' | 'finestra';

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

function modoFrom(existing?: Disponibilita | null): ModoOrario {
  if (!existing || (!existing.ora_da && !existing.ora_a)) return 'intera';
  if (existing.ora_da && existing.ora_a) return 'finestra';
  if (existing.ora_a) return 'fino';
  return 'dalle';
}

export default function AssenzaDialog({
  open,
  staffList,
  defaultDate,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  staffList: Staff[];
  defaultDate: string;
  existing?: Disponibilita | null;
  onClose: () => void;
  onSaved: (d: Disponibilita) => void;
  onDeleted: (id: string) => void;
}) {
  const isEdit = !!existing;
  const [staffId, setStaffId] = useState(existing?.staff_id ?? '');
  const [data, setData] = useState(existing?.data ?? defaultDate);
  const [tipo, setTipo] = useState<TipoAssenza>(existing?.tipo ?? 'ferie');
  const [modo, setModo] = useState<ModoOrario>(modoFrom(existing));
  const [oraDa, setOraDa] = useState(hhmm(existing?.ora_da ?? null));
  const [oraA, setOraA] = useState(hhmm(existing?.ora_a ?? null));
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const computeOrari = (): { ora_da: string | null; ora_a: string | null } => {
    if (modo === 'intera') return { ora_da: null, ora_a: null };
    if (modo === 'fino') return { ora_da: null, ora_a: oraA || null };
    if (modo === 'dalle') return { ora_da: oraDa || null, ora_a: null };
    return { ora_da: oraDa || null, ora_a: oraA || null };
  };

  const save = async () => {
    setError(null);
    if (!staffId || !data) {
      setError('Seleziona operatore e data.');
      return;
    }
    const { ora_da, ora_a } = computeOrari();
    if (modo === 'fino' && !ora_a) return setError('Indica l’ora di fine disponibilità.');
    if (modo === 'dalle' && !ora_da) return setError('Indica l’ora di inizio disponibilità.');
    if (modo === 'finestra' && (!ora_da || !ora_a)) return setError('Indica inizio e fine finestra.');
    if (ora_da && ora_a && ora_da >= ora_a) return setError('L’ora di inizio deve precedere quella di fine.');

    setSaving(true);
    try {
      const res = await fetch('/api/disponibilita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, data, tipo, ora_da, ora_a, note: note || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Salvataggio non riuscito.');
        return;
      }
      const saved = (await res.json()) as Disponibilita;
      onSaved(saved);
    } catch {
      setError('Errore di rete nel salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/disponibilita?id=${existing.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(existing.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-2xl">
        <div className="text-lg font-semibold text-[var(--brand-text-main)]">
          {isEdit ? 'Modifica assenza / disponibilità' : 'Assenza / Disponibilità'}
        </div>

        {/* Operatore */}
        <label className="mt-4 block text-xs font-semibold text-[var(--brand-text-muted)]">Operatore</label>
        <select
          value={staffId}
          disabled={isEdit}
          onChange={(e) => setStaffId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">— seleziona —</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.display_name}</option>
          ))}
        </select>

        {/* Data */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Data</label>
        <div className="mt-1">
          <DatePicker value={data} onChange={setData} disabled={isEdit} fullWidth />
        </div>

        {/* Tipo */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Tipo</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TIPI_ASSENZA.map((t) => {
            const meta = TIPO_META[t];
            const active = tipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  backgroundColor: active ? meta.bg : 'transparent',
                  borderColor: active ? meta.border : 'var(--brand-border)',
                  color: active ? meta.text : 'var(--brand-text-muted)',
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Modalità orario */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Disponibilità</label>
        <div className="mt-1 grid grid-cols-2 gap-1.5 text-sm">
          {([
            ['intera', 'Tutto il giorno'],
            ['fino', 'Disponibile fino alle…'],
            ['dalle', 'Disponibile dalle…'],
            ['finestra', 'Finestra…'],
          ] as [ModoOrario, string][]).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setModo(val)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                modo === val
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-text-main)]'
                  : 'border-[var(--brand-border)] text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Campi orario contestuali */}
        {(modo === 'dalle' || modo === 'finestra') && (
          <div className="mt-2">
            <label className="block text-xs text-[var(--brand-text-muted)]">Dalle</label>
            <input type="time" value={oraDa} onChange={(e) => setOraDa(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />
          </div>
        )}
        {(modo === 'fino' || modo === 'finestra') && (
          <div className="mt-2">
            <label className="block text-xs text-[var(--brand-text-muted)]">Fino alle</label>
            <input type="time" value={oraA} onChange={(e) => setOraA(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />
          </div>
        )}

        {/* Note */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Note (opzionale)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />

        {error && <div className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {isEdit && (
              <Button variant="outline" onClick={remove} disabled={saving}>Elimina</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
            <Button variant="primary" onClick={save} disabled={saving}>Salva</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore su `AssenzaDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/cronoprogramma-personale/AssenzaDialog.tsx
git commit -m "feat(disponibilita): AssenzaDialog (crea/modifica/elimina assenza)"
```

---

## Task 5a: Cronoprogramma — toolbar + stato + fetch + dialog

**Files:**
- Modify: `components/modules/cronoprogramma-personale/CronoToolbar.tsx`
- Modify: `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`

- [ ] **Step 1: Aggiungi il bottone in CronoToolbar**

In `CronoToolbar.tsx`, aggiungi `onNewAssenza: () => void;` ai props (sia nella destrutturazione sia nel type), poi un bottone prima di "Inserisci reperibile":

Destrutturazione (dopo `onInsertRep,`):
```tsx
  onNewAssenza,
```
Type (dopo `onInsertRep: () => void;`):
```tsx
  onNewAssenza: () => void;
```
JSX (subito prima di `<Button onClick={onInsertRep} size="sm">`):
```tsx
          <Button onClick={onNewAssenza} size="sm" variant="soft">
            Assenza
          </Button>
```

- [ ] **Step 2: Stato + import in CronoprogrammaWorkspace**

In `CronoprogrammaWorkspace.tsx`, aggiungi gli import in cima (vicino agli altri import di componenti/lib):
```tsx
import AssenzaDialog from './AssenzaDialog';
import type { Disponibilita } from '@/lib/disponibilita';
```

Aggiungi gli stati (vicino agli altri `useState`, es. dopo `const [taskCountRefresh, setTaskCountRefresh] = useState(0);`):
```tsx
  // Assenze / disponibilità (per giorno ISO)
  const [assenze, setAssenze] = useState<Record<string, (Disponibilita & { staff_name: string })[]>>({});
  const [assenzaDialogOpen, setAssenzaDialogOpen] = useState(false);
  const [assenzaEditing, setAssenzaEditing] = useState<Disponibilita | null>(null);
  const [assenzaDefaultDate, setAssenzaDefaultDate] = useState<string>('');
```

- [ ] **Step 3: Fetch assenze per il range**

In `CronoprogrammaWorkspace.tsx`, dopo il `useEffect` che fetcha `taskCountMap` (quello con `/api/mappa/distribuzioni`), aggiungi:
```tsx
  useEffect(() => {
    let alive = true;
    (async () => {
      const from = fmtDay(range.start);
      const to = fmtDay(range.end);
      if (!from || !to) return;
      try {
        const res = await fetch(`/api/disponibilita?from=${from}&to=${to}`);
        if (!res.ok) return;
        const rows = (await res.json()) as Disponibilita[];
        if (!alive || !Array.isArray(rows)) return;
        const nameById = new Map(staff.map((s) => [s.id, s.display_name]));
        const grouped: Record<string, (Disponibilita & { staff_name: string })[]> = {};
        for (const r of rows) {
          (grouped[r.data] ??= []).push({ ...r, staff_name: nameById.get(r.staff_id) ?? '—' });
        }
        setAssenze(grouped);
      } catch (e) {
        console.error('Errore fetch disponibilità:', e);
      }
    })();
    return () => { alive = false; };
  }, [range.start, range.end, rev, staff]);
```

- [ ] **Step 4: Handlers + render del dialog**

In `CronoprogrammaWorkspace.tsx`, aggiungi gli handler (vicino agli altri, es. dopo `removeAssignment`):
```tsx
  const openNewAssenza = (iso?: string) => {
    setAssenzaEditing(null);
    setAssenzaDefaultDate(iso ?? todayIso);
    setAssenzaDialogOpen(true);
  };
  const openEditAssenza = (d: Disponibilita) => {
    setAssenzaEditing(d);
    setAssenzaDefaultDate(d.data);
    setAssenzaDialogOpen(true);
  };
  const upsertAssenzaInState = (d: Disponibilita) => {
    const nameById = new Map(staff.map((s) => [s.id, s.display_name]));
    setAssenze((prev) => {
      const next: Record<string, (Disponibilita & { staff_name: string })[]> = {};
      // rimuovi eventuale riga precedente dello stesso operatore (può cambiare giorno)
      for (const [iso, list] of Object.entries(prev)) {
        const filtered = list.filter((x) => x.id !== d.id && !(x.staff_id === d.staff_id && x.data === d.data));
        if (filtered.length) next[iso] = filtered;
      }
      (next[d.data] ??= []).push({ ...d, staff_name: nameById.get(d.staff_id) ?? '—' });
      return next;
    });
  };
  const removeAssenzaFromState = (id: string) => {
    setAssenze((prev) => {
      const next: Record<string, (Disponibilita & { staff_name: string })[]> = {};
      for (const [iso, list] of Object.entries(prev)) {
        const filtered = list.filter((x) => x.id !== id);
        if (filtered.length) next[iso] = filtered;
      }
      return next;
    });
  };
```

Passa `onNewAssenza={() => openNewAssenza()}` al `<CronoToolbar ... />`.

Aggiungi il render del dialog vicino agli altri modali (es. prima della chiusura del componente, accanto a `<ExportAssignmentsDialog ... />`):
```tsx
      <AssenzaDialog
        open={assenzaDialogOpen}
        staffList={staff}
        defaultDate={assenzaDefaultDate}
        existing={assenzaEditing}
        onClose={() => { setAssenzaDialogOpen(false); setAssenzaEditing(null); }}
        onSaved={(d) => { upsertAssenzaInState(d); setAssenzaDialogOpen(false); setAssenzaEditing(null); }}
        onDeleted={(id) => { removeAssenzaFromState(id); setAssenzaDialogOpen(false); setAssenzaEditing(null); }}
      />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore. (Il prop `assenzeByDay`/`onEditAssenza` verso `CronoCalendarView` viene aggiunto nel Task 5b; qui non passarlo ancora.)

- [ ] **Step 6: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoToolbar.tsx components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat(disponibilita): toolbar Assenza + fetch + dialog nel cronoprogramma"
```

---

## Task 5b: Cronoprogramma — render card assenza nel calendario

**Files:**
- Modify: `components/modules/cronoprogramma-personale/CronoCalendarView.tsx`
- Modify: `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx` (passa i nuovi props)

- [ ] **Step 1: Aggiungi i props a CronoCalendarView e DayCell**

In `CronoCalendarView.tsx`, aggiungi gli import:
```tsx
import { TIPO_META, labelDisponibilita, type Disponibilita } from '@/lib/disponibilita';
```

Aggiungi ai props del componente esterno `CronoCalendarView` (nel type e nella destrutturazione):
```tsx
  assenzeByDay?: Record<string, (Disponibilita & { staff_name: string })[]>;
  onEditAssenza?: (d: Disponibilita) => void;
```
e passali a `<DayCell ... assenzeByDay={assenzeByDay} onEditAssenza={onEditAssenza} />`.

Aggiungi gli stessi due campi al type dei props di `DayCell` e alla sua destrutturazione.

- [ ] **Step 2: Renderizza le card assenza (livello giorno, sopra le assegnazioni)**

In `DayCell`, dentro `<div className="mt-2 space-y-2">`, **prima** del blocco `{sorted.length ? ... }`, inserisci:
```tsx
        {(() => {
          const dayAssenze = props.assenzeByDay?.[iso] ?? [];
          if (!dayAssenze.length) return null;
          return (
            <div className="space-y-1">
              {dayAssenze.map((a) => {
                const meta = TIPO_META[a.tipo];
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => props.onEditAssenza?.(a)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-110"
                    style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}`, color: meta.text }}
                    title={a.note ?? undefined}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.border }} />
                    <span className="truncate">{a.staff_name} · {labelDisponibilita(a)}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
```

Nota: `props.assenzeByDay` e `props.onEditAssenza` (accesso via `props.` perché non sono nella destrutturazione iniziale — oppure aggiungili lì).

- [ ] **Step 3: Passa i props da CronoprogrammaWorkspace**

Nel `<CronoCalendarView ... />` dentro `CronoprogrammaWorkspace.tsx`, aggiungi:
```tsx
            assenzeByDay={assenze}
            onEditAssenza={openEditAssenza}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoCalendarView.tsx components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat(disponibilita): card assenza a livello giorno nel calendario"
```

---

## Task 6a: Mappa — fetch disponibilità + blocco in `toggleOp`

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import + stato**

In `MappaOperatoriClient.tsx`, aggiungi l'import (vicino agli altri import da `@/lib`):
```tsx
import { isAssenzaIntera, labelOrario, type Disponibilita } from '@/lib/disponibilita';
```

Aggiungi lo stato vicino a `planningDate` (dopo la riga `const [planningDate, setPlanningDate] = ...`):
```tsx
  // Assenze del giorno pianificato: lookup per staff_id
  const [assenzeByStaff, setAssenzeByStaff] = useState<Record<string, Disponibilita>>({});
  const [assenzaMsg, setAssenzaMsg] = useState<string | null>(null);
```

- [ ] **Step 2: Fetch su cambio planningDate**

Subito dopo il `useEffect` che fetcha gli appuntamenti lazy (`/api/appointments/mappa`), aggiungi:
```tsx
  // Carica le assenze per la data pianificata
  useEffect(() => {
    if (!planningDate) { setAssenzeByStaff({}); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/disponibilita?data=${planningDate}`);
        if (!res.ok) return;
        const rows = (await res.json()) as Disponibilita[];
        if (!alive || !Array.isArray(rows)) return;
        const m: Record<string, Disponibilita> = {};
        for (const r of rows) m[r.staff_id] = r;
        setAssenzeByStaff(m);
      } catch (e) {
        console.error('Errore fetch disponibilità (mappa):', e);
      }
    })();
    return () => { alive = false; };
  }, [planningDate]);
```

- [ ] **Step 3: Blocco in `toggleOp`**

Sostituisci il corpo di `setSelectedOps(...)` dentro `toggleOp` (riga ~1600) per bloccare l'aggiunta se l'operatore è assente-intero. Calcola il blocco PRIMA dell'updater (niente `setState` dentro un altro `setState`):
```tsx
    const ass = assenzeByStaff[operator.id];
    const blocca = !!(ass && isAssenzaIntera(ass));

    setSelectedOps((prev) => {
      const already = prev.some((o) => o.id === operator.id);
      if (already) return prev.filter((o) => o.id !== operator.id); // deseleziona sempre permesso
      if (blocca) return prev;                                       // assenza intera: non aggiungere
      return [...prev, { id: operator.id, name: operator.displayName, qty: 0, base, startAddress }];
    });

    if (blocca) {
      setAssenzaMsg(`${operator.displayName} è assente (${ass!.tipo}) il ${planningDate}: non assegnabile.`);
    }
```
e aggiungi `assenzeByStaff` alle dipendenze di `useCallback` di `toggleOp` (l'array attuale è `[planningDate]` → diventa `[planningDate, assenzeByStaff]`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(disponibilita): Mappa legge assenze e blocca toggleOp su assenza intera"
```

---

## Task 6b: Mappa — badge nella lista operatori + banner conflitto

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Helper di rendering badge**

In `MappaOperatoriClient.tsx`, dentro il componente (vicino agli altri helper/`useMemo`), aggiungi una funzione pura locale:
```tsx
  // Badge assenza per un operatore nella data pianificata. null = nessuna assenza.
  const assenzaBadge = (staffId: string): { intera: boolean; testo: string; tipo: string } | null => {
    const a = assenzeByStaff[staffId];
    if (!a) return null;
    const intera = isAssenzaIntera(a);
    return { intera, tipo: a.tipo, testo: intera ? `${a.tipo} · tutto il giorno` : `${a.tipo} · ${labelOrario(a.ora_da, a.ora_a)}` };
  };
```

- [ ] **Step 2: Messaggio di blocco (toast inline)**

Individua il punto in cui si apre il pannello operatori (cerca `showOpPicker`). Subito sopra (o sotto) il bottone/intestazione del picker, renderizza il messaggio transitorio:
```tsx
        {assenzaMsg && (
          <div
            className="mb-2 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            onAnimationEnd={() => undefined}
          >
            {assenzaMsg}{' '}
            <button className="underline" onClick={() => setAssenzaMsg(null)}>chiudi</button>
          </div>
        )}
```

- [ ] **Step 3: Stato visivo nella lista operatori selezionabili**

Cerca dove si renderizza la lista degli operatori cliccabili (chiamano `toggleOp(op)` / `toggleOp(operator)`). Per ciascun operatore aggiungi il calcolo e il badge:
```tsx
                  {(() => {
                    const b = assenzaBadge(op.id);
                    if (!b) return null;
                    return (
                      <span
                        className="ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={
                          b.intera
                            ? { backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }
                            : { backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }
                        }
                        title={b.intera ? 'Assente tutto il giorno' : 'Disponibilità parziale'}
                      >
                        {b.intera ? '🔒 ' : ''}{b.testo}
                      </span>
                    );
                  })()}
```
e, sull'elemento cliccabile dell'operatore, quando `assenzaBadge(op.id)?.intera` è true, aggiungi `opacity-50` alla classe (resta cliccabile: il blocco vero è in `toggleOp`, che mostra il messaggio).
> Sostituisci `op` con il nome reale della variabile dell'iterazione (verifica nel JSX: l'oggetto è di tipo `MappaOperatorOption`, campo id = `op.id`).

- [ ] **Step 4: Banner conflitto retroattivo sugli operatori già nel piano**

Calcola i conflitti (vicino agli altri `useMemo`/derivati, dopo che `selectedOps` e `assenzeByStaff` esistono):
```tsx
  const conflittiAssenza = useMemo(
    () => selectedOps.filter((o) => {
      const a = assenzeByStaff[o.id];
      return a && isAssenzaIntera(a);
    }),
    [selectedOps, assenzeByStaff]
  );
```
Renderizza un banner sopra la distribuzione/lista operatori del piano (cerca dove si mappa `selectedOps` / `distribution`):
```tsx
        {conflittiAssenza.length > 0 && (
          <div
            className="mb-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            ⚠ {conflittiAssenza.length} operator{conflittiAssenza.length === 1 ? 'e' : 'i'} ora risultano assenti per il {planningDate}: {conflittiAssenza.map((o) => o.name).join(', ')}. Rivedi il piano.
          </div>
        )}
```
E, dove si renderizza la card di ciascun operatore del piano, aggiungi un bordo rosso se in conflitto:
```tsx
                  style={assenzeByStaff[op.id] && isAssenzaIntera(assenzeByStaff[op.id]) ? { borderColor: 'var(--danger)', borderWidth: 2 } : undefined}
```
> Adatta `op` al nome reale della variabile e integra con eventuali `style` già presenti sull'elemento.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK (nessun nuovo errore introdotto dai file toccati).

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(disponibilita): Mappa badge assenza + banner conflitto retroattivo"
```

---

## Task 7: Script migrazione storica (consegna manuale)

**Files:**
- Create: `docs/superpowers/sql/2026-06-11-migrazione-assenze-disponibilita.sql`

- [ ] **Step 1: Scrivi lo script SQL**

Crea `docs/superpowers/sql/2026-06-11-migrazione-assenze-disponibilita.sql`:

```sql
-- MIGRAZIONE STORICA: ferie/104/malattia/permesso/congedo/lutto da `assignments` → `disponibilita_operatore`.
-- Le assenze storiche diventano 'intera' (giornata intera). Da lanciare UNA VOLTA in produzione.
-- I nomi attività attesi: Ferie, 104, Malattia, Permesso, Congedo, Lutto (match case-insensitive esatto).

-- 1) VERIFICA PRE-MIGRAZIONE — conferma nomi/conteggi prima di procedere.
SELECT a.name, count(*)
FROM assignments asg
JOIN activities_renamed a ON a.id = asg.activity_id
WHERE lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto')
GROUP BY a.name
ORDER BY a.name;

-- 2) INSERIMENTO nelle disponibilità (idempotente su staff_id+data).
INSERT INTO disponibilita_operatore (staff_id, data, tipo, modalita, ora_da, ora_a)
SELECT asg.staff_id::text, cd.day, lower(trim(a.name)), 'intera', NULL, NULL
FROM assignments asg
JOIN activities_renamed a ON a.id = asg.activity_id
JOIN calendar_days cd ON cd.id = asg.day_id
WHERE lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto')
  AND asg.staff_id IS NOT NULL
ON CONFLICT (staff_id, data) DO NOTHING;

-- 3) RIMOZIONE delle vecchie card-attività migrate (evita doppioni nel calendario).
DELETE FROM assignments asg
USING activities_renamed a
WHERE a.id = asg.activity_id
  AND lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto');
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/sql/2026-06-11-migrazione-assenze-disponibilita.sql
git commit -m "docs(disponibilita): script migrazione storica assenze (consegna manuale)"
```

> NOTA: NON eseguire automaticamente. Va consegnato all'utente, che lancia prima la query (1) per confermare i nomi reali, poi (2) e (3). Se compaiono varianti (es. "ART.104", "Permesso 104"), estendere le clausole `IN (...)` con un mapping esplicito prima di lanciare (2)/(3).

---

## Task 8: Verifica finale

- [ ] **Step 1: Test helper**

Run: `npx vitest run lib/disponibilita.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck/build**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun nuovo errore introdotto dai file di questa feature (la baseline del repo può avere errori preesistenti — vedi memoria "lint/test baseline rosso": verifica mirata sui file toccati).

- [ ] **Step 3: Smoke manuale (su dev o deploy Vercel, dopo aver lanciato la migration tabella)**

1. Cronoprogramma (`/dashboard`) → "Assenza" → metti Mario in **Ferie tutto il giorno** domani → la card colorata appare nel giorno; click → si riapre in modifica.
2. Metti Luca con **104 · fino alle 13:00** → card con etichetta orario.
3. Mappa (`/hub/mappa?vista=pianifica`) data = domani → Mario è **bloccato** (badge 🔒, messaggio se provi a selezionarlo); Luca selezionabile con chip "104 · fino alle 13:00".
4. Seleziona Luca, poi nel cronoprogramma mettilo in **Ferie**; riapri il piano Mappa → **banner rosso** "1 operatore ora risulta assente" + bordo rosso sulla card.
5. Verifica che le assenze **non** chiedano né mostrino territorio.

- [ ] **Step 4: Verifica working tree pulito**

Run: `git status`
Expected: tutto committato.

---

## Prossimo Passo

Tutti i task completati → usa **finishing-a-development-branch** per merge ff in `main` + push + eliminazione branch (come da metodo superpowers dell'utente). Ricorda: consegnare all'utente (a) la migration tabella `20260611000000_disponibilita_operatore.sql` e (b) lo script di migrazione storica, da lanciare su produzione.
