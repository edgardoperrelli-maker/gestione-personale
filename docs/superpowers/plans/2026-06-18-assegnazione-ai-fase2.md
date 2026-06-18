# Assegnazione AI — Fase 2 (Procedi → crea pianificazione) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Step in checkbox (`- [ ]`).

**Goal:** Il pulsante **"Procedi"** nel modulo `/hub/assegnazione-ai` prende le righe pianificabili selezionate e crea **piano + interventi + rapportini** riusando il motore esistente, con la mappatura esecutore→operatore.

**Architecture:** Un endpoint admin `POST /api/admin/agente/assegna {ids[]}` carica le righe `agente_pianificabili` selezionate, risolve l'esecutore (cognome→`staff.display_name`), raggruppa per `(data, comune)` con i task per operatore, crea `mappa_piani`+`mappa_piani_operatori` e chiama **`sincronizzaRapportini(db, pianoId, {templateId})`** (che internamente chiama già `ensureInterventiForPiano` → crea le righe `interventi` stato `assegnato`). Logica di matching e raggruppamento **pura e testata**. Spec: `docs/superpowers/specs/2026-06-18-assegnazione-ai-design.md`.

**Tech Stack:** Next.js 15 (route `runtime='nodejs'`), Supabase (`supabaseAdmin`), TypeScript, Vitest. Worktree `C:/Users/Edgardo/Desktop/gp-assegnazione-ai`, branch `feat/assegnazione-ai`.

## Global Constraints
- **Gate mirati** (baseline repo rossa): `npx tsc --noEmit` senza NUOVI errori, `npx eslint <file>` pulito, `npx vitest run <file>` per i test aggiunti.
- **Push a main** solo con OK utente, refspec `git push origin feat/assegnazione-ai:main`. **Sessione concorrente attiva**: lavorare nel worktree, `git fetch`+FF+rebase prima del push.
- **Riuso, non riscrivo**: NON reimplementare la creazione interventi/rapportini — chiamare `sincronizzaRapportini` (che fa `ensureInterventiForPiano`).
- Interfacce esatte (verbatim dal codice):
  - `sincronizzaRapportini(db: SupabaseClient, pianoId: string, opts: { templateId: string; overwrite?: 'replace'|'skip'; overwriteSubmitted?: boolean; confermaInviati?: boolean }): Promise<{ ok: true; rapportini: {staff_id,staff_name,token,url}[]; interventiWarning?: string } | { ok: false; status: number; error?: string; conflicts?: unknown[] }>`
  - `mappa_piani` insert: `{ data: <ISO 'YYYY-MM-DD'>, territorio, note: null, stato: 'confermato', created_by: <userId>, updated_by: <userId> }` → `.select('id').single()`.
  - `mappa_piani_operatori` insert per operatore: `{ piano_id, staff_id, staff_name, colore: '#2563EB', km: 0, task_count: <n>, start_address: null, tasks: <Task[]>, polyline: [] }`.
  - `Task` (campi usati): `{ id: string; odl: string; indirizzo: string; cap: string; citta: string; priorita: number; fascia_oraria: string; matricola?: string; attivita?: string; pdr?: string; nominativo?: string }`.
  - `taskToIntervento` (chiamato dentro ensureInterventiForPiano) mappa: `task.citta→comune`, `task.matricola→matricola_contatore`, `task.attivita→intervento_tipo`, `task.odl→odl`; committente è **fisso 'acea'** dentro ensureInterventiForPiano.
  - staff: `await supabaseAdmin.from('staff').select('id, display_name')`.
  - `requireAdmin(): Promise<{ user: User; role } | NextResponse>` (auth via `auth.user.id`).
  - Template ZAGAROLO = `agente_file_config.template_id` (id "Rapportino limitazioni massive" = `be7451aa-443a-4365-8627-5e763a24d865`).

---

### Task 1: pure `risolviEsecutore` (cognome → staff)

**Files:**
- Create: `lib/agente/risolviEsecutore.ts`
- Test: `lib/agente/risolviEsecutore.test.ts`

**Interfaces:**
- Produces: `risolviEsecutore(esecutore: string, staff: {id:string; display_name:string}[]): { staffId: string; staffName: string } | { errore: 'non_trovato' | 'ambiguo' }`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { risolviEsecutore } from './risolviEsecutore';

const staff = [
  { id: 's1', display_name: 'CIARALLO SIMONE' },
  { id: 's2', display_name: 'PASTORELLI LUIGI' },
  { id: 's3', display_name: 'ROSSI MARIO' },
  { id: 's4', display_name: 'ROSSI ANNA' },
];

describe('risolviEsecutore', () => {
  it('match per cognome (primo token, case-insensitive)', () => {
    expect(risolviEsecutore('CIARALLO', staff)).toEqual({ staffId: 's1', staffName: 'CIARALLO SIMONE' });
    expect(risolviEsecutore('  pastorelli ', staff)).toEqual({ staffId: 's2', staffName: 'PASTORELLI LUIGI' });
  });
  it('nessun match → non_trovato', () => {
    expect(risolviEsecutore('BIANCHI', staff)).toEqual({ errore: 'non_trovato' });
    expect(risolviEsecutore('', staff)).toEqual({ errore: 'non_trovato' });
  });
  it('più match stesso cognome → ambiguo', () => {
    expect(risolviEsecutore('ROSSI', staff)).toEqual({ errore: 'ambiguo' });
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run lib/agente/risolviEsecutore.test.ts`

- [ ] **Step 3: Implementa**

```ts
// lib/agente/risolviEsecutore.ts
// PURO: mappa il nome esecutore del file (cognome, es. "CIARALLO") a uno staff_id
// confrontando col cognome (primo token) di staff.display_name. Maiuscolo, case-insensitive.
const cognome = (s: string): string => (s ?? '').trim().split(/\s+/)[0].toUpperCase();

export function risolviEsecutore(
  esecutore: string,
  staff: { id: string; display_name: string }[],
): { staffId: string; staffName: string } | { errore: 'non_trovato' | 'ambiguo' } {
  const target = cognome(esecutore);
  if (!target) return { errore: 'non_trovato' };
  const match = (staff ?? []).filter((s) => cognome(s.display_name) === target);
  if (match.length === 0) return { errore: 'non_trovato' };
  if (match.length > 1) return { errore: 'ambiguo' };
  return { staffId: match[0].id, staffName: match[0].display_name };
}
```

- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` (0 nuovi)

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add lib/agente/risolviEsecutore.ts lib/agente/risolviEsecutore.test.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): risolviEsecutore puro (cognome->staff, ambiguo/non trovato)"
```
(`<worktree>` = `C:/Users/Edgardo/Desktop/gp-assegnazione-ai`.)

---

### Task 2: pure `raggruppaPerPiano` (righe → piani con operatori e Task)

**Files:**
- Create: `lib/agente/raggruppaPerPiano.ts`
- Test: `lib/agente/raggruppaPerPiano.test.ts`

**Interfaces:**
- Consumes: tipi riga risolta.
- Produces:
  - `type RigaRisolta = { id: string; odl: string|null; matricola: string|null; indirizzo: string|null; comune: string|null; data: string; staffId: string; staffName: string }`
  - `type PianoDaCreare = { data: string; comune: string; operatori: { staffId: string; staffName: string; tasks: Task[] }[] }` (Task = shape dei Global Constraints)
  - `raggruppaPerPiano(righe: RigaRisolta[], attivita: string): PianoDaCreare[]` — raggruppa per `(data, comune)`, poi per `staffId`; ogni riga → un Task `{ id: riga.id, odl: riga.odl ?? '', indirizzo: riga.indirizzo ?? '', cap: '', citta: riga.comune ?? '', priorita: 0, fascia_oraria: '', matricola: riga.matricola ?? undefined, attivita }`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { raggruppaPerPiano, type RigaRisolta } from './raggruppaPerPiano';

const r = (over: Partial<RigaRisolta>): RigaRisolta => ({
  id: 'a', odl: 'O1', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO',
  data: '2026-06-19', staffId: 's1', staffName: 'CIARALLO SIMONE', ...over,
});

describe('raggruppaPerPiano', () => {
  it('un piano per (data,comune); operatori per staffId; un Task per riga', () => {
    const out = raggruppaPerPiano([
      r({ id: '1', staffId: 's1' }),
      r({ id: '2', staffId: 's1' }),
      r({ id: '3', staffId: 's2', staffName: 'PASTORELLI LUIGI' }),
    ], 'LIMITAZIONI MASSIVE');
    expect(out).toHaveLength(1);
    expect(out[0].comune).toBe('ZAGAROLO');
    expect(out[0].operatori).toHaveLength(2);
    const s1 = out[0].operatori.find((o) => o.staffId === 's1')!;
    expect(s1.tasks).toHaveLength(2);
    expect(s1.tasks[0]).toEqual({ id: '1', odl: 'O1', indirizzo: 'VIA X', cap: '', citta: 'ZAGAROLO', priorita: 0, fascia_oraria: '', matricola: 'M1', attivita: 'LIMITAZIONI MASSIVE' });
  });
  it('giorni/comuni diversi → piani separati', () => {
    const out = raggruppaPerPiano([
      r({ id: '1', data: '2026-06-19', comune: 'ZAGAROLO' }),
      r({ id: '2', data: '2026-06-20', comune: 'ZAGAROLO' }),
      r({ id: '3', data: '2026-06-19', comune: 'ROMA' }),
    ], 'X');
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementa**

```ts
// lib/agente/raggruppaPerPiano.ts
// PURO: trasforma le righe risolte in una lista di piani (uno per data+comune),
// ciascuno con gli operatori e i loro Task. Riusato dall'endpoint /assegna.
import type { Task } from '@/utils/routing/types';

export type RigaRisolta = {
  id: string; odl: string | null; matricola: string | null; indirizzo: string | null;
  comune: string | null; data: string; staffId: string; staffName: string;
};
export type OperatorePianoDaCreare = { staffId: string; staffName: string; tasks: Task[] };
export type PianoDaCreare = { data: string; comune: string; operatori: OperatorePianoDaCreare[] };

function rigaToTask(r: RigaRisolta, attivita: string): Task {
  return {
    id: r.id,
    odl: r.odl ?? '',
    indirizzo: r.indirizzo ?? '',
    cap: '',
    citta: r.comune ?? '',
    priorita: 0,
    fascia_oraria: '',
    matricola: r.matricola ?? undefined,
    attivita,
  };
}

export function raggruppaPerPiano(righe: RigaRisolta[], attivita: string): PianoDaCreare[] {
  const piani = new Map<string, PianoDaCreare>();
  for (const r of righe ?? []) {
    const comune = r.comune ?? '';
    const keyP = `${r.data}|${comune}`;
    let piano = piani.get(keyP);
    if (!piano) { piano = { data: r.data, comune, operatori: [] }; piani.set(keyP, piano); }
    let op = piano.operatori.find((o) => o.staffId === r.staffId);
    if (!op) { op = { staffId: r.staffId, staffName: r.staffName, tasks: [] }; piano.operatori.push(op); }
    op.tasks.push(rigaToTask(r, attivita));
  }
  return [...piani.values()];
}
```

- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add lib/agente/raggruppaPerPiano.ts lib/agente/raggruppaPerPiano.test.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): raggruppaPerPiano puro (righe->piani per data+comune con Task)"
```

---

### Task 3: endpoint `POST /api/admin/agente/assegna`

**Files:**
- Create: `app/api/admin/agente/assegna/route.ts`

> Nessun unit test sulla route: gate tsc + eslint. Riusa le pure di T1/T2 + `sincronizzaRapportini`.

**Interfaces:**
- Consumes: `requireAdmin`, `supabaseAdmin`, `risolviEsecutore` (T1), `raggruppaPerPiano` (T2), `sincronizzaRapportini`.
- Body: `{ ids: string[] }` (id di `agente_pianificabili` selezionati).
- Ritorna: `{ ok: true, pianiCreati: number, rapportiniCreati: number, nonRisolti: { esecutore: string; motivo: 'non_trovato'|'ambiguo'; n: number }[], avvisi: string[] }`.

- [ ] **Step 1: Implementa**

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { raggruppaPerPiano, type RigaRisolta } from '@/lib/agente/raggruppaPerPiano';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';

export const runtime = 'nodejs';

type PianRow = { id: string; file: string; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; data: string; esecutore: string | null };

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { ids?: string[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna riga selezionata.' }, { status: 400 });

  try {
    // 1) righe selezionate
    const { data: rowsRaw, error: eRows } = await supabaseAdmin
      .from('agente_pianificabili')
      .select('id, file, odl, matricola, indirizzo, comune, data, esecutore')
      .in('id', ids);
    if (eRows) throw eRows;
    const rows = (rowsRaw ?? []) as PianRow[];
    if (rows.length === 0) return NextResponse.json({ error: 'Righe non trovate.' }, { status: 404 });

    // 2) config per-file (committente/attivita/template) + staff
    const files = [...new Set(rows.map((r) => r.file))];
    const { data: cfgRows } = await supabaseAdmin.from('agente_file_config').select('file, attivita, template_id').in('file', files);
    const cfgByFile = new Map<string, { attivita: string; template_id: string | null }>();
    for (const c of (cfgRows ?? []) as Array<{ file: string; attivita: string; template_id: string | null }>) cfgByFile.set(c.file, { attivita: c.attivita, template_id: c.template_id });
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staff = (staffRows ?? []) as { id: string; display_name: string }[];

    // 3) risolvi esecutore; raccogli i non risolti
    const risolte: (RigaRisolta & { file: string })[] = [];
    const nonRisoltiMap = new Map<string, { esecutore: string; motivo: 'non_trovato' | 'ambiguo'; n: number }>();
    for (const r of rows) {
      const res = risolviEsecutore(r.esecutore ?? '', staff);
      if ('errore' in res) {
        const key = `${r.esecutore ?? ''}|${res.errore}`;
        const cur = nonRisoltiMap.get(key) ?? { esecutore: r.esecutore ?? '', motivo: res.errore, n: 0 };
        cur.n += 1; nonRisoltiMap.set(key, cur);
        continue;
      }
      risolte.push({ id: r.id, file: r.file, odl: r.odl, matricola: r.matricola, indirizzo: r.indirizzo, comune: r.comune, data: r.data, staffId: res.staffId, staffName: res.staffName });
    }

    // 4) per ogni file (template/attivita possono differire) raggruppa e crea i piani
    const avvisi: string[] = [];
    let pianiCreati = 0; let rapportiniCreati = 0;
    for (const file of files) {
      const cfg = cfgByFile.get(file);
      if (!cfg || !cfg.template_id) { avvisi.push(`File ${file}: template non configurato (imposta agente_file_config.template_id).`); continue; }
      const righeFile = risolte.filter((r) => r.file === file);
      const piani = raggruppaPerPiano(righeFile, cfg.attivita);
      for (const p of piani) {
        // anti-duplicato: elimina piani residui SENZA rapportini per (data, territorio=comune)
        const { data: esistenti } = await supabaseAdmin.from('mappa_piani').select('id').eq('data', p.data).eq('territorio', p.comune);
        for (const ex of (esistenti ?? []) as Array<{ id: string }>) {
          const { count } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', ex.id);
          if (!count) await supabaseAdmin.from('mappa_piani').delete().eq('id', ex.id);
        }
        // crea piano + operatori
        const { data: piano, error: ePiano } = await supabaseAdmin.from('mappa_piani').insert({
          data: p.data, territorio: p.comune, note: null, stato: 'confermato', created_by: userId, updated_by: userId,
        }).select('id').single();
        if (ePiano || !piano) { avvisi.push(`Piano ${p.comune} ${p.data}: ${ePiano?.message ?? 'creazione fallita'}.`); continue; }
        const pianoId = (piano as { id: string }).id;
        const opRows = p.operatori.map((o) => ({
          piano_id: pianoId, staff_id: o.staffId, staff_name: o.staffName, colore: '#2563EB',
          km: 0, task_count: o.tasks.length, start_address: null, tasks: o.tasks, polyline: [],
        }));
        const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
        if (eOp) { avvisi.push(`Operatori ${p.comune} ${p.data}: ${eOp.message}.`); continue; }
        // rapportini (sincronizzaRapportini chiama ensureInterventiForPiano internamente)
        const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId: cfg.template_id, overwrite: 'replace' });
        if (!res.ok) { avvisi.push(`Rapportini ${p.comune} ${p.data}: ${res.error ?? 'conflitto'} (status ${res.status}).`); continue; }
        pianiCreati += 1;
        rapportiniCreati += res.rapportini.length;
        if (res.interventiWarning) avvisi.push(`Interventi ${p.comune} ${p.data}: ${res.interventiWarning}`);
      }
    }

    return NextResponse.json({
      ok: true, pianiCreati, rapportiniCreati,
      nonRisolti: [...nonRisoltiMap.values()], avvisi,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore assegna.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Gate** — `npx tsc --noEmit` (0 nuovi); `npx eslint app/api/admin/agente/assegna/route.ts`

- [ ] **Step 3: Commit**

```bash
git -C "<worktree>" add app/api/admin/agente/assegna/route.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): endpoint assegna (crea piano+interventi+rapportini dalle righe selezionate)"
```

---

### Task 4: UI — attiva "Procedi" + esito

**Files:**
- Modify: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Consumes: endpoint `assegna` (T3).

- [ ] **Step 1: Stato + handler**

In `AssegnazioneAiClient`, accanto agli altri `useState`, aggiungi:
```tsx
  const [procedendo, setProcedendo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  async function procedi() {
    if (selezione.size === 0) return;
    setProcedendo(true); setEsito(null);
    try {
      const res = await fetch('/api/admin/agente/assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selezione] }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const nr = (j.nonRisolti ?? []) as { esecutore: string; motivo: string; n: number }[];
        const avvisi = (j.avvisi ?? []) as string[];
        let m = `Creati ${j.pianiCreati ?? 0} piani, ${j.rapportiniCreati ?? 0} rapportini.`;
        if (nr.length) m += ` Operatori non pianificati: ${nr.map((x) => `${x.esecutore} (${x.motivo}, ${x.n})`).join(', ')}.`;
        if (avvisi.length) m += ` Avvisi: ${avvisi.join(' · ')}`;
        setEsito(m);
        router.refresh();
      } else {
        setEsito(`Errore: ${j.error ?? res.status}`);
      }
    } catch (e) {
      setEsito(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setProcedendo(false);
    }
  }
```

- [ ] **Step 2: Pulsante attivo + messaggio**

Sostituisci il pulsante "Procedi" disabilitato con:
```tsx
        <button
          type="button"
          onClick={() => void procedi()}
          disabled={procedendo || selezione.size === 0}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {procedendo ? 'Creo…' : `Procedi (${selezione.size} righe)`}
        </button>
```
e sotto, se `esito` è valorizzato, un riquadro:
```tsx
        {esito && (
          <p className="mt-2 text-sm" style={{ color: 'var(--brand-text-muted)' }}>{esito}</p>
        )}
```

- [ ] **Step 3: Gate + Commit** — `npx tsc --noEmit`; `npx eslint components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

```bash
git -C "<worktree>" add components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git -C "<worktree>" commit -m "feat(assegnazione-ai-ui): Procedi crea la pianificazione + esito"
```

---

### Task 5 — Deploy Fase 2 (manuale)

- [ ] **Step 1:** Suite mirata verde: `npx vitest run lib/agente/`; `npx tsc --noEmit` 0 nuovi.
- [ ] **Step 2:** Imposta il template di ZAGAROLO sul prod (utente):
  ```sql
  update agente_file_config set template_id = 'be7451aa-443a-4365-8627-5e763a24d865', updated_at = now() where file = 'ZAGAROLO.xlsx';
  ```
- [ ] **Step 3:** `git -C "<worktree>" fetch origin` + FF check (rebase su origin/main se mosso).
- [ ] **Step 4:** Con OK utente: `git push origin feat/assegnazione-ai:main` → Vercel. (Nessuna migration nuova in F2.)
- [ ] **Step 5:** Smoke: leggi un giorno → seleziona righe → **Procedi** → verifica piano in `/hub/mappa`, interventi e rapportini creati per gli operatori; controlla gli "operatori non pianificati".

---

## Self-Review
- Spec F2: esecutore→operatore (T1) · raggruppamento (T2) · creazione piano/interventi/rapportini (T3, riusa sincronizzaRapportini→ensureInterventiForPiano) · UI Procedi (T4) · template ZAGAROLO (T5). ✅
- Niente reimplementazione di interventi/rapportini: si chiama `sincronizzaRapportini`. ✅
- Niente placeholder; `<worktree>` definito (T1). ✅
- Tipi coerenti: `risolviEsecutore` (T1) → `RigaRisolta.staffId/staffName` (T2) → operatori in T3; `Task` shape uguale ovunque. ✅
- Idempotenza: anti-dup piani residui per (data,comune) + dedup interventi `(committente,odl,data)` in ensureInterventiForPiano. ✅
