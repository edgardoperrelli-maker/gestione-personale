# Rapportini interattivi (Blocco B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rapportini compilabili online dai tecnici via link tokenizzato (WhatsApp, senza login), generati dal piano mappa, con template configurabile in Impostazioni, autosave, Invia, alert "non consegnato" e export Excel/Allegato 10 dai dati compilati.

**Architecture:** 3 tabelle (`rapportino_template`, `rapportini`, `rapportino_voci`, stile Aurea). Funzioni pure per snapshot/merge/stato/mapping (testate con Vitest). API admin per i template e per "Genera rapportini". Rotta pubblica `/r/[token]` (fuori da AuthGate) con API server token-validate (service role) per autosave/invio. Riuso della generazione Excel/Allegato 10 esistente, estratta in un modulo condiviso alimentato dai dati DB.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (service role + auth-helpers), Tailwind 4 (stile Aurea: cyan/magenta/Geist), zod, Vitest, exceljs, docx/JSZip.

**Spec:** `docs/superpowers/specs/2026-05-31-rapportini-interattivi-design.md`

**Prerequisiti:** Vitest è già configurato (Blocco A). Se si parte da un branch senza Vitest, eseguire prima il setup Vitest del piano Blocco A (Task 2 di quel piano).

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `supabase/migrations/20260502000000_rapportini_interattivi.sql` | 3 tabelle + trigger + RLS + seed Standard | Create |
| `utils/rapportini/tokenStatus.ts` (+ test) | Stato token (valido/scaduto/inviato) — puro | Create |
| `utils/rapportini/buildVoci.ts` (+ test) | `taskToVoce` (snapshot) + `mergeVoci` (merge per task_id, preserva risposte) — puro | Create |
| `utils/rapportini/nonConsegnati.ts` (+ test) | Lista rapportini non consegnati — puro | Create |
| `utils/rapportini/excelMapping.ts` (+ test) | Risposte template Standard → colonne M–Q + note — puro | Create |
| `app/api/admin/rapportino-template/route.ts` | CRUD template (requireAdmin, zod) | Create |
| `app/impostazioni/template-rapportini/page.tsx` + `TemplateRapportiniClient.tsx` | Sotto-modulo Impostazioni | Create |
| `app/impostazioni/page.tsx:?` | Registra la voce "Template rapportini" | Modify |
| `app/api/mappa/rapportini/genera/route.ts` | Genera rapportini+voci+token dal piano | Create |
| `app/api/r/[token]/route.ts` | GET dati rapportino per token (pubblica) | Create |
| `app/api/r/[token]/voce/route.ts` | Autosave risposte di una voce (pubblica) | Create |
| `app/api/r/[token]/invia/route.ts` | Invia (finalizza) (pubblica) | Create |
| `app/r/[token]/page.tsx` + `components/modules/rapportini/RapportinoForm.tsx` | Rotta pubblica + form compilazione | Create |
| `components/modules/mappa/RegistroPianificazioni.tsx` | Bottone "Genera rapportini" + pannello stato/link + alert | Modify |
| `lib/rapportini/excelGen.ts` | Estrazione funzioni exceljs/Allegato10 riusabili | Create (refactor) |
| `app/api/mappa/rapportini/export/route.ts` | Export Excel/Allegato10 dai dati compilati | Create |

**Tipi condivisi** (in `utils/rapportini/buildVoci.ts`, usati ovunque):
```ts
TemplateCampo { chiave: string; etichetta: string; tipo: 'crocetta'|'testo'|'select'|'numero'; opzioni?: string[]; ordine: number }
VoceSnapshot { task_id: string; ordine: number; nominativo?, matricola?, pdr?, odsin?, via?, comune?, cap?, recapito?, attivita?, accessibilita?, fascia_oraria?: string; raw_json: unknown }
Voce = VoceSnapshot & { risposte: Record<string, unknown> }
```

---

## Task 1: Migrazione SQL

**Files:** Create `supabase/migrations/20260502000000_rapportini_interattivi.sql`

- [ ] **Step 1: Creare il file** con il contenuto della §4 dello spec (le 3 tabelle, trigger `set_updated_at`, indici, RLS `FOR ALL TO authenticated`, seed template "Standard"). Aggiungere le policy esplicite (idempotenti):

```sql
-- (tabelle + trigger + seed come da spec §4)
-- Policy esplicite per ognuna delle 3 tabelle:
alter table rapportino_template enable row level security;
drop policy if exists "tpl_all_auth" on rapportino_template;
create policy "tpl_all_auth" on rapportino_template for all to authenticated using (true) with check (true);
alter table rapportini enable row level security;
drop policy if exists "rap_all_auth" on rapportini;
create policy "rap_all_auth" on rapportini for all to authenticated using (true) with check (true);
alter table rapportino_voci enable row level security;
drop policy if exists "voci_all_auth" on rapportino_voci;
create policy "voci_all_auth" on rapportino_voci for all to authenticated using (true) with check (true);
```
> Il file SQL completo (tabelle+trigger+indici+seed+policy) sarà consegnato come blocco unico al PC su richiesta; questo file lo traccia nel repo (idempotente).

- [ ] **Step 2: Commit** `git add supabase/migrations/20260502000000_rapportini_interattivi.sql && git commit -m "feat(rapportini): migrazione rapportini interattivi (template, rapportini, voci)"`

---

## Task 2: Funzione pura `tokenStatus`

**Files:** Create `utils/rapportini/tokenStatus.ts` + `utils/rapportini/tokenStatus.test.ts`

- [ ] **Step 1: Test (falliscono)**
```ts
import { describe, it, expect } from 'vitest';
import { tokenStatus } from './tokenStatus';

const base = { stato: 'in_corso' as const, expires_at: '2026-06-01T12:00:00Z' };
describe('tokenStatus', () => {
  it('inviato vince su tutto', () => {
    expect(tokenStatus({ ...base, stato: 'inviato' }, '2026-05-31T10:00:00Z')).toBe('inviato');
  });
  it('scaduto se now > expires_at', () => {
    expect(tokenStatus(base, '2026-06-01T12:00:01Z')).toBe('scaduto');
  });
  it('valido se in_corso e non scaduto', () => {
    expect(tokenStatus(base, '2026-05-31T10:00:00Z')).toBe('valido');
  });
});
```
- [ ] **Step 2: `npm test` → FAIL** (modulo mancante)
- [ ] **Step 3: Implementare**
```ts
export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; expires_at: string },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  if (new Date(nowIso).getTime() > new Date(r.expires_at).getTime()) return 'scaduto';
  return 'valido';
}
```
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `git add utils/rapportini/tokenStatus.ts utils/rapportini/tokenStatus.test.ts && git commit -m "feat(rapportini): tokenStatus puro + test"`

---

## Task 3: Funzioni pure `taskToVoce` + `mergeVoci`

**Files:** Create `utils/rapportini/buildVoci.ts` + `utils/rapportini/buildVoci.test.ts`

- [ ] **Step 1: Test (falliscono)**
```ts
import { describe, it, expect } from 'vitest';
import { taskToVoce, mergeVoci, type Voce } from './buildVoci';

describe('taskToVoce', () => {
  it('snapshot dei campi dal task', () => {
    const t = { id: 'x1', odsin: 'O1', pdr: 'P1', indirizzo: 'Via A 1', citta: 'Roma', cap: '00100',
      nominativo: 'Mario', matricola: 'M1', recapito: '333', accessibilita: 'OK', attivita: 'S-AI-051', fascia_oraria: '8-12' };
    const v = taskToVoce(t, 3);
    expect(v).toMatchObject({ task_id: 'x1', ordine: 3, odsin: 'O1', pdr: 'P1', via: 'Via A 1',
      comune: 'Roma', cap: '00100', nominativo: 'Mario', attivita: 'S-AI-051', fascia_oraria: '8-12' });
    expect(v.raw_json).toEqual(t);
  });
});

describe('mergeVoci', () => {
  const snap = (id: string, ord: number) => ({ task_id: id, ordine: ord, raw_json: {} });
  it('conserva le risposte delle voci esistenti (per task_id), aggiunge nuove, rimuove assenti', () => {
    const fromTasks = [snap('a', 1), snap('b', 2)];
    const existing: Voce[] = [
      { ...snap('a', 9), risposte: { att_cess: true, note: 'ok' } },
      { ...snap('c', 5), risposte: { cambio: true } }, // c non più presente
    ];
    const merged = mergeVoci(fromTasks, existing);
    expect(merged.map((v) => v.task_id).sort()).toEqual(['a', 'b']);
    expect(merged.find((v) => v.task_id === 'a')!.risposte).toEqual({ att_cess: true, note: 'ok' });
    expect(merged.find((v) => v.task_id === 'a')!.ordine).toBe(1); // ordine aggiornato dal task
    expect(merged.find((v) => v.task_id === 'b')!.risposte).toEqual({});
  });
});
```
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: Implementare**
```ts
export interface TemplateCampo {
  chiave: string; etichetta: string;
  tipo: 'crocetta' | 'testo' | 'select' | 'numero';
  opzioni?: string[]; ordine: number;
}
export interface VoceSnapshot {
  task_id: string; ordine: number;
  nominativo?: string; matricola?: string; pdr?: string; odsin?: string;
  via?: string; comune?: string; cap?: string; recapito?: string;
  attivita?: string; accessibilita?: string; fascia_oraria?: string;
  raw_json: unknown;
}
export type Voce = VoceSnapshot & { risposte: Record<string, unknown> };

export function taskToVoce(task: any, ordine: number): VoceSnapshot {
  return {
    task_id: String(task.id),
    ordine,
    nominativo: task.nominativo, matricola: task.matricola, pdr: task.pdr, odsin: task.odsin,
    via: task.indirizzo, comune: task.citta, cap: task.cap, recapito: task.recapito,
    attivita: task.attivita, accessibilita: task.accessibilita, fascia_oraria: task.fascia_oraria,
    raw_json: task,
  };
}

export function mergeVoci(fromTasks: VoceSnapshot[], existing: Voce[]): Voce[] {
  const prev = new Map(existing.map((v) => [v.task_id, v.risposte]));
  return fromTasks.map((s) => ({ ...s, risposte: prev.get(s.task_id) ?? {} }));
}
```
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `git add utils/rapportini/buildVoci.ts utils/rapportini/buildVoci.test.ts && git commit -m "feat(rapportini): taskToVoce + mergeVoci puri + test"`

---

## Task 4: Funzioni pure `nonConsegnati` + `risposteToStandardRow`

**Files:** Create `utils/rapportini/nonConsegnati.ts`, `utils/rapportini/excelMapping.ts` (+ test ciascuna)

- [ ] **Step 1: Test (falliscono)**
```ts
// nonConsegnati.test.ts
import { describe, it, expect } from 'vitest';
import { nonConsegnati } from './nonConsegnati';
describe('nonConsegnati', () => {
  it('elenca i rapportini non inviati con data passata', () => {
    const r = [
      { staff_name: 'A', data: '2026-05-30', stato: 'in_corso' as const },
      { staff_name: 'B', data: '2026-05-30', stato: 'inviato' as const },
      { staff_name: 'C', data: '2026-05-31', stato: 'in_corso' as const }, // oggi: non in lista
    ];
    expect(nonConsegnati(r, '2026-05-31')).toEqual([{ staff_name: 'A', data: '2026-05-30' }]);
  });
});
```
```ts
// excelMapping.test.ts
import { describe, it, expect } from 'vitest';
import { risposteToStandardRow } from './excelMapping';
describe('risposteToStandardRow', () => {
  it('crocetta true → X, false/assente → vuoto; note passthrough', () => {
    expect(risposteToStandardRow({ att_cess: true, cambio: false, note: 'ciao' }))
      .toEqual({ att_cess: 'X', cambio: '', mini_bag: '', rg_stop: '', assente: '', note: 'ciao' });
  });
});
```
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: Implementare**
```ts
// nonConsegnati.ts
export function nonConsegnati<T extends { data: string; stato: string; staff_name?: string }>(
  rapportini: T[], todayIso: string,
): { staff_name?: string; data: string }[] {
  return rapportini
    .filter((r) => r.stato !== 'inviato' && r.data < todayIso)
    .map((r) => ({ staff_name: r.staff_name, data: r.data }));
}
```
```ts
// excelMapping.ts
const x = (v: unknown) => (v === true ? 'X' : '');
export function risposteToStandardRow(risposte: Record<string, unknown>) {
  return {
    att_cess: x(risposte.att_cess), cambio: x(risposte.cambio), mini_bag: x(risposte.mini_bag),
    rg_stop: x(risposte.rg_stop), assente: x(risposte.assente),
    note: typeof risposte.note === 'string' ? risposte.note : '',
  };
}
```
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `git add utils/rapportini/nonConsegnati.ts utils/rapportini/excelMapping.ts utils/rapportini/*.test.ts && git commit -m "feat(rapportini): nonConsegnati + excelMapping puri + test"`

---

## Task 5: API admin template-rapportini (CRUD)

**Files:** Create `app/api/admin/rapportino-template/route.ts`

> Replica il pattern di `app/api/admin/territori/route.ts`: funzione `requireAdmin()` (createRouteHandlerClient + profiles.role + `resolveUserRole`), `supabaseAdmin` da `lib/supabaseAdmin`, validazione zod.

- [ ] **Step 1: Implementare la route** (GET lista, POST crea, PATCH aggiorna, DELETE — vietato sul default).
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
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, (user.app_metadata as any)?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const CampoSchema = z.object({
  chiave: z.string().min(1),
  etichetta: z.string().min(1),
  tipo: z.enum(['crocetta', 'testo', 'select', 'numero']),
  opzioni: z.array(z.string()).optional(),
  ordine: z.number().int(),
});
const TemplateSchema = z.object({
  nome: z.string().min(1),
  campi: z.array(CampoSchema).min(1),
  active: z.boolean().optional().default(true),
});

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, nome, campi, is_default, active, created_at, updated_at')
    .order('is_default', { ascending: false }).order('nome');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const parsed = TemplateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('rapportino_template')
    .insert({ nome: parsed.data.nome, campi: parsed.data.campi, active: parsed.data.active })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const parsed = TemplateSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of ['nome', 'campi', 'active'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
  const { error } = await supabaseAdmin.from('rapportino_template').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('is_default').eq('id', id).maybeSingle();
  if (tpl?.is_default) return NextResponse.json({ error: 'Il template di default non è eliminabile' }, { status: 409 });
  const { error } = await supabaseAdmin.from('rapportino_template').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 2: `npx tsc --noEmit` pulito**
- [ ] **Step 3: Commit** `git add app/api/admin/rapportino-template/route.ts && git commit -m "feat(rapportini): API admin CRUD template"`

---

## Task 6: Impostazioni → Template rapportini (UI)

**Files:** Create `app/impostazioni/template-rapportini/page.tsx` + `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`; Modify `app/impostazioni/page.tsx`

- [ ] **Step 1: Server page** (mirror `app/impostazioni/zone-ztl/page.tsx`): carica i template via `supabaseAdmin`/server client e passa a `TemplateRapportiniClient`.
```tsx
// page.tsx
import AuthGate from '@/components/AuthGate';
import TemplateRapportiniClient from './TemplateRapportiniClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function Page() {
  const { data } = await supabaseAdmin.from('rapportino_template')
    .select('id, nome, campi, is_default, active').order('is_default', { ascending: false }).order('nome');
  return <AuthGate><TemplateRapportiniClient initial={data ?? []} /></AuthGate>;
}
```
- [ ] **Step 2: Client component** — lista + editor. Stile Aurea (cyan/Geist, classi come nei mockup Blocco A). Campi del template: aggiungi/rimuovi/riordina; per campo etichetta + tipo (select crocetta/testo/select/numero) + opzioni (se select). Salvataggio via `fetch('/api/admin/rapportino-template', {method: POST|PATCH})`, delete via DELETE. Tipi `TemplateCampo` da `@/utils/rapportini/buildVoci`.
  (Codice completo del client: form controllato con stato `campi: TemplateCampo[]`, pulsanti "＋ Aggiungi campo", "Salva", "Elimina"; usare `crypto.randomUUID()` per chiavi nuove di default basate su slug dell'etichetta.)
- [ ] **Step 3: Registrare la voce** in `app/impostazioni/page.tsx` — aggiungere all'array `MODULES` un oggetto come gli altri:
```ts
{ href: '/impostazioni/template-rapportini', title: 'Template rapportini', description: 'Configura i campi dei rapportini compilabili', icon: /* come gli altri */ },
```
- [ ] **Step 4: `npx tsc --noEmit` pulito + verifica manuale** (`npm run dev`, apri `/impostazioni/template-rapportini`, crea/modifica un template).
- [ ] **Step 5: Commit** `git add app/impostazioni/template-rapportini app/impostazioni/page.tsx && git commit -m "feat(rapportini): impostazioni gestione template"`

---

## Task 7: API "Genera rapportini" dal piano

**Files:** Create `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Implementare** — POST `{ pianoId, templateId }`:
  1. `requireAdmin` (o authenticated, coerente con `/api/mappa/piani`).
  2. Carica il piano + `mappa_piani_operatori` (con `tasks`) + il template scelto (`campi`).
  3. Per ogni operatore: upsert `rapportini` per `(piano_id, staff_id)` — se nuovo genera `token = crypto.randomBytes(24).toString('base64url')`, `expires_at = now + 48h`, `stato='in_corso'`; salva `template_id` + `campi_snapshot`. Carica le voci esistenti, calcola `taskToVoce` su ogni task → `mergeVoci(fromTasks, existing)` → upsert/replace `rapportino_voci`.
  4. Risponde `{ rapportini: [{ staff_id, staff_name, token, url }] }` con `url = ${process.env.NEXT_PUBLIC_SITE_URL}/r/${token}`.
```ts
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { taskToVoce, mergeVoci, type Voce } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { pianoId, templateId } = await req.json();
    if (!pianoId || !templateId) return NextResponse.json({ error: 'pianoId e templateId obbligatori' }, { status: 400 });

    const { data: piano } = await supabaseAdmin.from('mappa_piani').select('id, data').eq('id', pianoId).single();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi').eq('id', templateId).single();
    if (!tpl) return NextResponse.json({ error: 'Template non trovato' }, { status: 404 });
    const { data: ops } = await supabaseAdmin.from('mappa_piani_operatori')
      .select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const out: any[] = [];
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    for (const op of ops ?? []) {
      // upsert rapportino (mantiene token se esiste)
      const { data: existing } = await supabaseAdmin.from('rapportini')
        .select('id, token').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();
      let rapId = existing?.id; let token = existing?.token;
      if (!rapId) {
        token = randomBytes(24).toString('base64url');
        const { data: ins } = await supabaseAdmin.from('rapportini').insert({
          piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
          template_id: templateId, campi_snapshot: tpl.campi, token, stato: 'in_corso', expires_at: expires,
        }).select('id').single();
        rapId = ins!.id;
      } else {
        await supabaseAdmin.from('rapportini').update({ template_id: templateId, campi_snapshot: tpl.campi, expires_at: expires }).eq('id', rapId);
      }
      // voci: merge per task_id
      const { data: existingVoci } = await supabaseAdmin.from('rapportino_voci')
        .select('task_id, risposte').eq('rapportino_id', rapId);
      const fromTasks = (op.tasks ?? []).map((t: any, i: number) => taskToVoce(t, i + 1));
      const merged: Voce[] = mergeVoci(fromTasks, (existingVoci ?? []).map((v: any) => ({ task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {} })) as any);
      await supabaseAdmin.from('rapportino_voci').delete().eq('rapportino_id', rapId);
      if (merged.length) await supabaseAdmin.from('rapportino_voci').insert(
        merged.map((v) => ({ rapportino_id: rapId, ...v }))
      );
      out.push({ staff_id: op.staff_id, staff_name: op.staff_name, token, url: `${base}/r/${token}` });
    }
    return NextResponse.json({ ok: true, rapportini: out });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```
- [ ] **Step 2: `npx tsc --noEmit` pulito**
- [ ] **Step 3: Commit** `git add app/api/mappa/rapportini/genera/route.ts && git commit -m "feat(rapportini): API genera rapportini dal piano"`

---

## Task 8: API pubbliche `/api/r/[token]` (GET / voce / invia)

**Files:** Create `app/api/r/[token]/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/api/r/[token]/invia/route.ts`

> Tutte usano `supabaseAdmin` (service role) DOPO aver validato il token + scadenza con `tokenStatus`. Nessuna scrittura se `inviato`/`scaduto`.

- [ ] **Step 1: GET dati** `app/api/r/[token]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin.from('rapportini')
    .select('id, staff_name, data, stato, expires_at, campi_snapshot').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const stato = tokenStatus(rap as any, new Date().toISOString());
  const { data: voci } = await supabaseAdmin.from('rapportino_voci')
    .select('id, ordine, nominativo, pdr, via, comune, cap, attivita, fascia_oraria, risposte')
    .eq('rapportino_id', rap.id).order('ordine');
  return NextResponse.json({ rapportino: { ...rap, statoCalcolato: stato }, voci: voci ?? [] });
}
```
- [ ] **Step 2: Autosave voce** `app/api/r/[token]/voce/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id, stato, expires_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as any, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  // la voce deve appartenere a questo rapportino
  const { data: voce } = await supabaseAdmin.from('rapportino_voci').select('id').eq('id', voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
```
- [ ] **Step 3: Invia** `app/api/r/[token]/invia/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id, stato, expires_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as any, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 4: `npx tsc --noEmit` pulito**
- [ ] **Step 5: Commit** `git add app/api/r && git commit -m "feat(rapportini): API pubbliche token (get/voce/invia)"`

---

## Task 9: Rotta pubblica `/r/[token]` + form

**Files:** Create `app/r/[token]/page.tsx` + `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Page pubblica** (NIENTE AuthGate). Server component: fetch GET `/api/r/[token]` (o lettura diretta via supabaseAdmin) → passa al form. Gestisce stati `not_found`/`scaduto`/`inviato` con schermate dedicate.
- [ ] **Step 2: `RapportinoForm` (client)** — stile Aurea, mobile/tablet:
  - Intestazione operatore/data.
  - Per ogni voce: campi precompilati (read-only) + campi editabili **resi da `campi_snapshot`** (crocetta=checkbox→`true`, testo=input, select=tendina con `opzioni`, numero=input number).
  - **Autosave**: on change → aggiorna stato locale + debounce (≈800ms) → `POST /api/r/[token]/voce {voceId, risposte}`; indicatore "salvato/ salvataggio…/ non salvato (riprova)". Coda+retry su errore rete.
  - **Invia** → `POST /api/r/[token]/invia` → mostra conferma + passa a sola lettura. Se ci sono voci senza alcun esito, `confirm()` "Alcune voci senza esito, invii comunque?".
  (Codice completo del componente: stato `voci`, funzione `setRisposta(voceId, chiave, valore)`, `useEffect` debounce per voce modificata, render dinamico per `tipo`.)
- [ ] **Step 3: `npx tsc --noEmit` + verifica manuale** (apri `/r/<token>` di prova, compila, ricarica → persistenza, Invia → sola lettura).
- [ ] **Step 4: Commit** `git add app/r components/modules/rapportini && git commit -m "feat(rapportini): rotta pubblica /r/[token] + form compilazione autosave/invia"`

---

## Task 10: RegistroPianificazioni — Genera, pannello stato/link, alert

**Files:** Modify `components/modules/mappa/RegistroPianificazioni.tsx`

- [ ] **Step 1: Bottone "Genera rapportini"** accanto a "Riapri" (intorno a riga 174). Apre un piccolo modal: select del template (fetch `/api/admin/rapportino-template`) → POST `/api/mappa/rapportini/genera {pianoId, templateId}` → mostra la lista link.
- [ ] **Step 2: Pannello rapportini del piano** — dopo la generazione (o caricando i rapportini del piano via un GET, es. estendere `/api/mappa/piani` per includere lo stato rapportini, oppure un nuovo `GET /api/mappa/rapportini?pianoId=`): per operatore → link **Copia** / **Apri WhatsApp** (`https://wa.me/?text=` + url, o con numero se disponibile), **stato** (in corso/inviato/scaduto), avanzamento. (Aggiungere `GET /api/mappa/rapportini?pianoId=` se serve.)
- [ ] **Step 3: Alert "non consegnato"** — banner in cima al Registro: fetch dei rapportini con `stato≠inviato` e `data` passata (riuso `nonConsegnati` lato client sui dati caricati, o una query dedicata) → mostra "[operatore] · piano [data] non consegnato, richiede intervento".
- [ ] **Step 4: `npx tsc --noEmit` + verifica manuale**
- [ ] **Step 5: Commit** `git add components/modules/mappa/RegistroPianificazioni.tsx app/api/mappa/rapportini && git commit -m "feat(rapportini): genera/pannello/alert nel registro pianificazioni"`

---

## Task 11: Export Excel + Allegato 10 dai dati compilati

**Files:** Create `lib/rapportini/excelGen.ts` (refactor) + `app/api/mappa/rapportini/export/route.ts`

- [ ] **Step 1: Estrarre in `lib/rapportini/excelGen.ts`** le funzioni riusabili oggi in `app/hub/rapportini/massiva/page.tsx`: `buildAllegato10Fields` (rrr. 238-249), `fillLazioXml` (196-202), `fillFirenzeXml` (205-235), `buildCombinedDocx` (147-192), `getLazioTemplate`/`getFirenzeTemplate` (115-135), e da `clientela/page.tsx` `cloneFromTemplate` (665-701), `safeStr`, `hhmmToMin`, `sanitizeSheetName`. Renderle **pure rispetto ai dati** (input = righe strutturate, non l'Excel sorgente). Le pagine clientela/massiva importano da qui (nessun cambio di comportamento — verificare con un export di prova).
- [ ] **Step 2: Funzione `buildRapportinoExcel(rapportino, voci, templateStandard)`** che usa `risposteToStandardRow` (Task 4) per riempire le colonne M–Q + note, poi `cloneFromTemplate`. Per template non-Standard → tabella generica (colonne = `campi_snapshot`).
- [ ] **Step 3: `app/api/mappa/rapportini/export/route.ts`** — GET `?pianoId=` (o `?rapportinoId=`): carica rapportini+voci compilati, genera l'Excel (+ Allegato 10 per i codici in `allegato10_codici`) e risponde col file (o uno ZIP).
- [ ] **Step 4: Pulsante "Esporta Excel/Allegato10"** nel pannello rapportini (Task 10) che scarica da questa route.
- [ ] **Step 5: `npx tsc --noEmit` + verifica manuale** (genera, compila una voce, esporta → l'Excel ha la X nelle colonne giuste).
- [ ] **Step 6: Commit** `git add lib/rapportini app/api/mappa/rapportini/export app/hub/rapportini && git commit -m "feat(rapportini): export Excel/Allegato10 dai dati compilati (refactor generazione)"`

---

## Self-review notes (per chi esegue)

- **Coerenza tipi:** `TemplateCampo`/`Voce` in `utils/rapportini/buildVoci.ts` usati da generazione, form, settings. `tokenStatus` usato da tutte le API pubbliche. `risposteToStandardRow` usato dall'export.
- **Sicurezza:** le API pubbliche non espongono le tabelle; validano token+scadenza via `tokenStatus` e scrivono con service role; `voce` verifica l'appartenenza al rapportino. Verificare (Task 9) che `/r` non sia coperta da auth globale (in quest'app AuthGate è per-pagina; nessun middleware noto — confermare cercando `middleware.ts`).
- **Parti ancorate al codice reale** (Task 6 registrazione voce Impostazioni; Task 10 punti in RegistroPianificazioni ~riga 174; Task 11 estrazione funzioni exceljs/docx): individuate con esplorazione, da rifinire leggendo i file in fase di esecuzione. Le funzioni Allegato10 (`fillLazioXml`/`fillFirenzeXml`/`buildAllegato10Fields`) sono già generiche → riuso ad alto livello di fattibilità.
- **Backward-compat:** l'estrazione in `lib/rapportini/excelGen.ts` non deve cambiare il comportamento delle pagine clientela/massiva (importano le stesse funzioni). Verificare con un export di prova prima del commit.
- **SQL:** il blocco runnable completo va consegnato/lanciato al PC; il file migrazione lo traccia (idempotente).
- **Componenti UI grandi** (TemplateRapportiniClient, RapportinoForm): lo scheletro + la logica chiave sono specificati; il markup di dettaglio segue lo stile Aurea (come i mockup Blocco A) ed è completato in esecuzione.
