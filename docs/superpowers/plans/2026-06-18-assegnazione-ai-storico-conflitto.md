# Assegnazione AI — Storico + Conflitto operatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Procedi" pianificare solo gli operatori liberi (saltando con avviso chi è già pianificato in quel comune+giorno) e registrare ogni assegnazione in uno storico consultabile.

**Architecture:** Due helper puri (`partizionaConflitti` che riusa `rilevaConflitti`, `costruisciLogRows`) + un loader I/O sottile (`caricaRapportiniEsistenti`, replica il pattern di `sincronizzaRapportini`). L'endpoint `assegna` fa un pre-check conflitti per ogni piano-da-creare, pianifica i soli liberi, scrive il log (best-effort) e ritorna i `conflitti`. Un endpoint GET espone lo storico; il componente lo mostra e segnala i conflitti.

**Tech Stack:** Next.js 15 (App Router, `runtime='nodejs'`), Supabase (`supabaseAdmin`), TypeScript, Vitest, React client component.

## Global Constraints

- **Conflitto = per (operatore, comune, giorno)**: `rilevaConflitti` confronta `staff_id` + `data` + `territorio` normalizzato su un piano diverso. Nel ponte il `territorio` del piano = il `comune` del file. NON duplicare la logica: riusare `rilevaConflitti` da `@/utils/rapportini/rilevaConflitti`.
- **Pianifica i liberi**: gli operatori in conflitto vengono **esclusi** (mai sovrascritti) e tornati in `conflitti`. Se tutti gli operatori di un piano sono in conflitto, il piano NON viene creato.
- **Niente `overwrite:'replace'`**: la chiamata a `sincronizzaRapportini` nell'endpoint `assegna` perde l'opzione `overwrite` (i conflitti sono già esclusi a monte; un 409 residuo deve emergere come avviso, non sovrascrivere).
- **`committente` resta `'acea'`**: lo forza `ensureInterventiForPiano` dentro `sincronizzaRapportini`. NON toccare.
- **Log best-effort**: se l'insert in `assegnazione_ai_log` fallisce, il piano resta valido e si aggiunge un avviso (nessun rollback).
- **Fail-safe**: se il caricamento dei rapportini esistenti fallisce, quel piano viene saltato con avviso.
- **RLS**: la nuova tabella ha `enable row level security` + policy `for all to authenticated using(true) with check(true)`, come `agente_pianificabili` / `agente_file_config`.
- **Migration lanciata dall'utente** (1 sola SQL); non c'è CI che la applica.
- Worktree: `C:\Users\Edgardo\Desktop\gp-aai-storico` (branch `feat/assegnazione-ai-storico-conflitto`). I test girano con `npx vitest run <file>` (il worktree ha `node_modules` via junction sul repo principale).

---

### Task 1: Migration tabella `assegnazione_ai_log`

**Files:**
- Create: `supabase/migrations/20260618120000_assegnazione_ai_log.sql`

**Interfaces:**
- Produces: tabella `assegnazione_ai_log` con colonne `id, data_pianificata, comune, file, staff_id, staff_name, n_interventi, piano_id, creato_da, creato_il`.

- [ ] **Step 1: Scrivere la migration**

File `supabase/migrations/20260618120000_assegnazione_ai_log.sql`:

```sql
-- Assegnazione AI: log append-only delle assegnazioni create via "Procedi"
-- (una riga per operatore effettivamente pianificato). Nessuna FK: è un audit
-- che deve sopravvivere alla cancellazione/sostituzione del piano.
create table if not exists assegnazione_ai_log (
  id uuid primary key default gen_random_uuid(),
  data_pianificata date not null,
  comune text not null,
  file text,
  staff_id uuid,
  staff_name text,
  n_interventi int not null default 0,
  piano_id uuid,
  creato_da uuid,
  creato_il timestamptz not null default now()
);
create index if not exists assegnazione_ai_log_data_comune_idx
  on assegnazione_ai_log (data_pianificata, comune);

alter table assegnazione_ai_log enable row level security;
drop policy if exists assegnazione_ai_log_all_auth on assegnazione_ai_log;
create policy assegnazione_ai_log_all_auth on assegnazione_ai_log
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260618120000_assegnazione_ai_log.sql
git commit -m "feat(assegnazione-ai): migration assegnazione_ai_log (storico)"
```

> Nota: la migration la lancia l'utente sul prod. Non bloccare i task successivi (sono app-only e testabili senza la tabella).

---

### Task 2: Helper `partizionaConflitti` (riusa `rilevaConflitti`)

**Files:**
- Create: `lib/agente/partizionaConflitti.ts`
- Test: `lib/agente/partizionaConflitti.test.ts`

**Interfaces:**
- Consumes: `rilevaConflitti`, `RapEsistente`, `Conflitto` da `@/utils/rapportini/rilevaConflitti`. Firma esistente: `rilevaConflitti(args: { pianoId: string; territorio: string | null; data: string; operatori: { staff_id: string; staff_name: string | null }[]; esistenti: RapEsistente[] }): Conflitto[]`. `RapEsistente = { id: string; staff_id: string; piano_id: string; territorio: string | null; data: string; stato: string; submitted_at: string | null }`. `Conflitto = { staff_id: string; staff_name: string | null; territorio: string | null; data: string; rapportino_id: string; piano_id_esistente: string; submitted: boolean }`.
- Produces: `type OperatoreConflitto = { staff_id: string; staff_name: string | null }` e `partizionaConflitti(args: { operatori: OperatoreConflitto[]; data: string; comune: string; esistenti: RapEsistente[] }): { liberi: OperatoreConflitto[]; inConflitto: Conflitto[] }`.

- [ ] **Step 1: Scrivere il test che fallisce**

File `lib/agente/partizionaConflitti.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { partizionaConflitti } from './partizionaConflitti';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

const operatori = [
  { staff_id: 's1', staff_name: 'CIARALLO' },
  { staff_id: 's2', staff_name: 'PASTORELLI' },
];

describe('partizionaConflitti', () => {
  it('nessun rapportino esistente -> tutti liberi', () => {
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti: [] });
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s1', 's2']);
    expect(r.inConflitto).toEqual([]);
  });

  it('operatore gia pianificato stesso giorno+comune -> in conflitto, l altro resta libero', () => {
    const esistenti: RapEsistente[] = [
      { id: 'r1', staff_id: 's1', piano_id: 'p9', territorio: 'ZAGAROLO', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti });
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s2']);
    expect(r.inConflitto.map((c) => c.staff_id)).toEqual(['s1']);
  });

  it('comune diverso -> nessun conflitto', () => {
    const esistenti: RapEsistente[] = [
      { id: 'r1', staff_id: 's1', piano_id: 'p9', territorio: 'TIVOLI', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti });
    expect(r.inConflitto).toEqual([]);
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 2: Lanciare il test (deve fallire)**

Run: `npx vitest run lib/agente/partizionaConflitti.test.ts`
Expected: FAIL con "partizionaConflitti is not a function" / modulo non trovato.

- [ ] **Step 3: Scrivere l'implementazione minima**

File `lib/agente/partizionaConflitti.ts`:

```ts
// lib/agente/partizionaConflitti.ts
// PURO: partiziona gli operatori di un piano-da-creare in liberi / in conflitto,
// riusando rilevaConflitti (nessuna logica duplicata). Il nuovo piano non esiste
// ancora: pianoId='' così rilevaConflitti non esclude nulla per pianoId.
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';

export type OperatoreConflitto = { staff_id: string; staff_name: string | null };

export function partizionaConflitti(args: {
  operatori: OperatoreConflitto[];
  data: string;
  comune: string;
  esistenti: RapEsistente[];
}): { liberi: OperatoreConflitto[]; inConflitto: Conflitto[] } {
  const inConflitto = rilevaConflitti({
    pianoId: '',
    territorio: args.comune,
    data: args.data,
    operatori: args.operatori,
    esistenti: args.esistenti,
  });
  const idsKO = new Set(inConflitto.map((c) => c.staff_id));
  const liberi = args.operatori.filter((o) => !idsKO.has(o.staff_id));
  return { liberi, inConflitto };
}
```

- [ ] **Step 4: Lanciare il test (deve passare)**

Run: `npx vitest run lib/agente/partizionaConflitti.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/agente/partizionaConflitti.ts lib/agente/partizionaConflitti.test.ts
git commit -m "feat(assegnazione-ai): partizionaConflitti (riusa rilevaConflitti)"
```

---

### Task 3: Helper `costruisciLogRows`

**Files:**
- Create: `lib/agente/costruisciLogRows.ts`
- Test: `lib/agente/costruisciLogRows.test.ts`

**Interfaces:**
- Consumes: `type OperatorePianoDaCreare = { staffId: string; staffName: string; tasks: Task[] }` da `@/lib/agente/raggruppaPerPiano`.
- Produces: `costruisciLogRows(args: { data: string; comune: string; file: string; pianoId: string; userId: string; operatori: OperatorePianoDaCreare[] }): Array<{ data_pianificata: string; comune: string; file: string; staff_id: string; staff_name: string; n_interventi: number; piano_id: string; creato_da: string }>`.

- [ ] **Step 1: Scrivere il test che fallisce**

File `lib/agente/costruisciLogRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { costruisciLogRows } from './costruisciLogRows';
import type { Task } from '@/utils/routing/types';

const task = (id: string): Task => ({
  id, odl: '', indirizzo: '', cap: '', citta: 'ZAGAROLO',
  priorita: 0, fascia_oraria: '', attivita: 'LIMITAZIONI MASSIVE',
});

describe('costruisciLogRows', () => {
  it('una riga per operatore, n_interventi = numero task', () => {
    const rows = costruisciLogRows({
      data: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx',
      pianoId: 'piano1', userId: 'user1',
      operatori: [
        { staffId: 's1', staffName: 'CIARALLO', tasks: [task('a'), task('b')] },
        { staffId: 's2', staffName: 'PASTORELLI', tasks: [task('c')] },
      ],
    });
    expect(rows).toEqual([
      { data_pianificata: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx', staff_id: 's1', staff_name: 'CIARALLO', n_interventi: 2, piano_id: 'piano1', creato_da: 'user1' },
      { data_pianificata: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx', staff_id: 's2', staff_name: 'PASTORELLI', n_interventi: 1, piano_id: 'piano1', creato_da: 'user1' },
    ]);
  });

  it('nessun operatore -> array vuoto', () => {
    const rows = costruisciLogRows({
      data: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx',
      pianoId: 'piano1', userId: 'user1', operatori: [],
    });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Lanciare il test (deve fallire)**

Run: `npx vitest run lib/agente/costruisciLogRows.test.ts`
Expected: FAIL ("costruisciLogRows is not a function").

- [ ] **Step 3: Scrivere l'implementazione minima**

File `lib/agente/costruisciLogRows.ts`:

```ts
// lib/agente/costruisciLogRows.ts
// PURO: righe da inserire in assegnazione_ai_log, una per operatore pianificato.
import type { OperatorePianoDaCreare } from '@/lib/agente/raggruppaPerPiano';

export function costruisciLogRows(args: {
  data: string;
  comune: string;
  file: string;
  pianoId: string;
  userId: string;
  operatori: OperatorePianoDaCreare[];
}) {
  return args.operatori.map((o) => ({
    data_pianificata: args.data,
    comune: args.comune,
    file: args.file,
    staff_id: o.staffId,
    staff_name: o.staffName,
    n_interventi: o.tasks.length,
    piano_id: args.pianoId,
    creato_da: args.userId,
  }));
}
```

- [ ] **Step 4: Lanciare il test (deve passare)**

Run: `npx vitest run lib/agente/costruisciLogRows.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add lib/agente/costruisciLogRows.ts lib/agente/costruisciLogRows.test.ts
git commit -m "feat(assegnazione-ai): costruisciLogRows (righe storico)"
```

---

### Task 4: Pre-check conflitti + log nell'endpoint `assegna`

**Files:**
- Create: `lib/agente/caricaRapportiniEsistenti.ts`
- Modify: `app/api/admin/agente/assegna/route.ts`

**Interfaces:**
- Consumes: `partizionaConflitti` (Task 2), `costruisciLogRows` (Task 3), `RapEsistente` da `@/utils/rapportini/rilevaConflitti`, `supabaseAdmin`.
- Produces: l'endpoint ritorna ora anche `conflitti: { staff_name: string | null; comune: string; data: string; submitted: boolean }[]`. Helper `caricaRapportiniEsistenti(db: SupabaseClient, data: string, staffIds: string[]): Promise<RapEsistente[]>`.

- [ ] **Step 1: Scrivere il loader I/O `caricaRapportiniEsistenti`**

`rapportini` NON ha la colonna `territorio`: il territorio si risolve via join su `mappa_piani`, esattamente come fa `sincronizzaRapportini`. File `lib/agente/caricaRapportiniEsistenti.ts`:

```ts
// lib/agente/caricaRapportiniEsistenti.ts
// I/O sottile: carica i rapportini esistenti (forma RapEsistente attesa da rilevaConflitti)
// per una data, ristretti agli staffIds. Il territorio NON è su `rapportini`: si risolve
// via join su `mappa_piani` (stesso pattern di sincronizzaRapportini).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export async function caricaRapportiniEsistenti(
  db: SupabaseClient,
  data: string,
  staffIds: string[],
): Promise<RapEsistente[]> {
  if (staffIds.length === 0) return [];
  const { data: raps, error } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at')
    .eq('data', data)
    .in('staff_id', staffIds);
  if (error) throw new Error(error.message);
  const rows = (raps ?? []) as Array<{ id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null }>;
  const pianoIds = [...new Set(rows.map((r) => r.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (pianoIds.length) {
    const { data: piani, error: ePiani } = await db.from('mappa_piani').select('id, territorio').in('id', pianoIds);
    if (ePiani) throw new Error(ePiani.message);
    for (const p of (piani ?? []) as Array<{ id: string; territorio: string | null }>) terrByPiano[p.id] = p.territorio ?? null;
  }
  return rows.map((r) => ({
    id: String(r.id),
    staff_id: String(r.staff_id),
    piano_id: String(r.piano_id),
    territorio: terrByPiano[r.piano_id] ?? null,
    data: String(r.data),
    stato: String(r.stato),
    submitted_at: r.submitted_at ?? null,
  }));
}
```

- [ ] **Step 2: Aggiornare gli import dell'endpoint**

In `app/api/admin/agente/assegna/route.ts`, dopo gli import esistenti, aggiungere:

```ts
import { partizionaConflitti } from '@/lib/agente/partizionaConflitti';
import { costruisciLogRows } from '@/lib/agente/costruisciLogRows';
import { caricaRapportiniEsistenti } from '@/lib/agente/caricaRapportiniEsistenti';
```

- [ ] **Step 3: Aggiungere l'accumulatore `conflitti`**

In `app/api/admin/agente/assegna/route.ts`, trovare la riga:

```ts
    const avvisi: string[] = [];
    let pianiCreati = 0; let rapportiniCreati = 0;
```

e sostituirla con:

```ts
    const avvisi: string[] = [];
    const conflitti: { staff_name: string | null; comune: string; data: string; submitted: boolean }[] = [];
    let pianiCreati = 0; let rapportiniCreati = 0;
```

- [ ] **Step 4: Inserire il pre-check conflitti e pianificare i soli liberi**

Nel loop `for (const p of piani) {`, trovare il blocco che va dall'anti-duplicato fino all'insert di `mappa_piani_operatori`. Attualmente è:

```ts
      for (const p of piani) {
        // anti-duplicato: elimina piani residui SENZA rapportini per (data, territorio=comune)
        const { data: esistenti } = await supabaseAdmin.from('mappa_piani').select('id').eq('data', p.data).eq('territorio', p.comune);
        for (const ex of (esistenti ?? []) as Array<{ id: string }>) {
          const { count } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', ex.id);
          if (count === 0) {
            await supabaseAdmin.from('interventi').delete().eq('piano_id', ex.id);
            await supabaseAdmin.from('mappa_piani').delete().eq('id', ex.id);
          }
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
```

Sostituire l'INTERO blocco qui sopra con (le modifiche: pre-check conflitti dopo l'anti-dup; `operatoriLiberi` al posto di `p.operatori`):

```ts
      for (const p of piani) {
        // anti-duplicato: elimina piani residui SENZA rapportini per (data, territorio=comune)
        const { data: esistenti } = await supabaseAdmin.from('mappa_piani').select('id').eq('data', p.data).eq('territorio', p.comune);
        for (const ex of (esistenti ?? []) as Array<{ id: string }>) {
          const { count } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', ex.id);
          if (count === 0) {
            await supabaseAdmin.from('interventi').delete().eq('piano_id', ex.id);
            await supabaseAdmin.from('mappa_piani').delete().eq('id', ex.id);
          }
        }

        // pre-check conflitti: pianifica solo gli operatori NON già pianificati in quel comune+giorno
        const staffIds = p.operatori.map((o) => o.staffId);
        let rapEsistenti;
        try {
          rapEsistenti = await caricaRapportiniEsistenti(supabaseAdmin, p.data, staffIds);
        } catch (e) {
          avvisi.push(`Conflitti ${p.comune} ${p.data}: verifica fallita (${e instanceof Error ? e.message : 'errore'}), piano saltato.`);
          continue;
        }
        const { liberi, inConflitto } = partizionaConflitti({
          operatori: p.operatori.map((o) => ({ staff_id: o.staffId, staff_name: o.staffName })),
          data: p.data, comune: p.comune, esistenti: rapEsistenti,
        });
        for (const c of inConflitto) conflitti.push({ staff_name: c.staff_name, comune: p.comune, data: p.data, submitted: c.submitted });
        const operatoriLiberi = p.operatori.filter((o) => liberi.some((L) => L.staff_id === o.staffId));
        if (operatoriLiberi.length === 0) continue; // tutti già pianificati: nessun piano

        // crea piano + operatori (solo i liberi)
        const { data: piano, error: ePiano } = await supabaseAdmin.from('mappa_piani').insert({
          data: p.data, territorio: p.comune, note: null, stato: 'confermato', created_by: userId, updated_by: userId,
        }).select('id').single();
        if (ePiano || !piano) { avvisi.push(`Piano ${p.comune} ${p.data}: ${ePiano?.message ?? 'creazione fallita'}.`); continue; }
        const pianoId = (piano as { id: string }).id;
        const opRows = operatoriLiberi.map((o) => ({
          piano_id: pianoId, staff_id: o.staffId, staff_name: o.staffName, colore: '#2563EB',
          km: 0, task_count: o.tasks.length, start_address: null, tasks: o.tasks, polyline: [],
        }));
        const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
```

- [ ] **Step 5: Togliere `overwrite:'replace'` e scrivere il log dopo il successo**

Sempre in `app/api/admin/agente/assegna/route.ts`, trovare:

```ts
        // rapportini (sincronizzaRapportini chiama ensureInterventiForPiano internamente)
        const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId: cfg.template_id, overwrite: 'replace' });
        if (!res.ok) {
          const { count: nRap } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', pianoId);
          if (nRap === 0) {
            await supabaseAdmin.from('interventi').delete().eq('piano_id', pianoId);
            await supabaseAdmin.from('mappa_piani').delete().eq('id', pianoId);
          }
          avvisi.push(`Rapportini ${p.comune} ${p.data}: ${res.error ?? 'conflitto'} (status ${res.status}).`);
          continue;
        }
        pianiCreati += 1;
        rapportiniCreati += res.rapportini.length;
        if (res.interventiWarning) avvisi.push(`Interventi ${p.comune} ${p.data}: ${res.interventiWarning}`);
      }
```

e sostituirlo con (rimosso `overwrite:'replace'`; aggiunta scrittura log best-effort):

```ts
        // rapportini (sincronizzaRapportini chiama ensureInterventiForPiano internamente).
        // NIENTE overwrite:'replace': i conflitti sono già esclusi a monte; un 409 residuo
        // (race) deve emergere come avviso, non sovrascrivere in silenzio.
        const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId: cfg.template_id });
        if (!res.ok) {
          const { count: nRap } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', pianoId);
          if (nRap === 0) {
            await supabaseAdmin.from('interventi').delete().eq('piano_id', pianoId);
            await supabaseAdmin.from('mappa_piani').delete().eq('id', pianoId);
          }
          avvisi.push(`Rapportini ${p.comune} ${p.data}: ${res.error ?? 'conflitto'} (status ${res.status}).`);
          continue;
        }
        pianiCreati += 1;
        rapportiniCreati += res.rapportini.length;
        if (res.interventiWarning) avvisi.push(`Interventi ${p.comune} ${p.data}: ${res.interventiWarning}`);

        // storico (best-effort): una riga per operatore pianificato
        const logRows = costruisciLogRows({ data: p.data, comune: p.comune, file, pianoId, userId, operatori: operatoriLiberi });
        const { error: eLog } = await supabaseAdmin.from('assegnazione_ai_log').insert(logRows);
        if (eLog) avvisi.push(`Log ${p.comune} ${p.data}: ${eLog.message}`);
      }
```

- [ ] **Step 6: Aggiungere `conflitti` alla risposta**

Trovare il `return NextResponse.json({...})` finale:

```ts
    return NextResponse.json({
      ok: true, pianiCreati, rapportiniCreati,
      nonRisolti: [...nonRisoltiMap.values()], avvisi,
    });
```

e sostituirlo con:

```ts
    return NextResponse.json({
      ok: true, pianiCreati, rapportiniCreati,
      nonRisolti: [...nonRisoltiMap.values()], conflitti, avvisi,
    });
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun NUOVO errore nei file toccati (`app/api/admin/agente/assegna/route.ts`, `lib/agente/caricaRapportiniEsistenti.ts`). Eventuali errori preesistenti altrove sono fuori scope.

- [ ] **Step 8: Commit**

```bash
git add lib/agente/caricaRapportiniEsistenti.ts app/api/admin/agente/assegna/route.ts
git commit -m "feat(assegnazione-ai): pre-check conflitti (pianifica i liberi) + storico log"
```

---

### Task 5: Endpoint GET `/api/admin/agente/assegnazioni` (storico)

**Files:**
- Create: `app/api/admin/agente/assegnazioni/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` da `@/lib/apiAuth` (pattern: `const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth;`), `supabaseAdmin`.
- Produces: `GET` → `{ righe: Array<{ data_pianificata: string; comune: string; file: string | null; staff_name: string | null; n_interventi: number; creato_il: string }> }`. Query opzionale `?data=YYYY-MM-DD`.

- [ ] **Step 1: Scrivere l'endpoint**

File `app/api/admin/agente/assegnazioni/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data');

  let q = supabaseAdmin
    .from('assegnazione_ai_log')
    .select('data_pianificata, comune, file, staff_name, n_interventi, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) q = q.eq('data_pianificata', data);

  const { data: righe, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ righe: righe ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore nel nuovo file.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/agente/assegnazioni/route.ts
git commit -m "feat(assegnazione-ai): endpoint GET storico assegnazioni"
```

---

### Task 6: UI — sezione Storico + avviso conflitti in `AssegnazioneAiClient`

**Files:**
- Modify: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/agente/assegnazioni` (Task 5) e il nuovo campo `conflitti` della risposta di `POST /api/admin/agente/assegna` (Task 4).

- [ ] **Step 1: Importare `useEffect` e aggiungere il tipo `StoricoRiga`**

In `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`, riga 3:

```ts
import { useState } from 'react';
```

sostituire con:

```ts
import { useState, useEffect } from 'react';
```

Dopo il tipo `FileConfig` (intorno alla riga 24), aggiungere:

```ts
export type StoricoRiga = {
  data_pianificata: string;
  comune: string;
  file: string | null;
  staff_name: string | null;
  n_interventi: number;
  creato_il: string;
};
```

- [ ] **Step 2: Aggiungere stato storico + caricamento**

Dopo `const [esito, setEsito] = useState<string | null>(null);` (riga ~52), aggiungere:

```ts
  const [storico, setStorico] = useState<StoricoRiga[]>([]);

  async function caricaStorico() {
    try {
      const res = await fetch('/api/admin/agente/assegnazioni');
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStorico((j.righe ?? []) as StoricoRiga[]);
    } catch {
      /* lo storico è informativo: un errore qui non blocca nulla */
    }
  }

  useEffect(() => { void caricaStorico(); }, []);
```

- [ ] **Step 3: Mostrare i conflitti nell'esito di Procedi e ricaricare lo storico**

Nella funzione `procedi()`, trovare:

```ts
        const nr = (j.nonRisolti ?? []) as { esecutore: string; motivo: string; n: number }[];
        const avvisi = (j.avvisi ?? []) as string[];
        let m = `Creati ${j.pianiCreati ?? 0} piani, ${j.rapportiniCreati ?? 0} rapportini.`;
        if (nr.length) m += ` Operatori non pianificati: ${nr.map((x) => `${x.esecutore} (${x.motivo}, ${x.n})`).join(', ')}.`;
        if (avvisi.length) m += ` Avvisi: ${avvisi.join(' · ')}`;
        setEsito(m);
        setSelezione(new Set<string>());
        router.refresh();
```

e sostituire con (aggiunge i `conflitti` e ricarica lo storico):

```ts
        const nr = (j.nonRisolti ?? []) as { esecutore: string; motivo: string; n: number }[];
        const conf = (j.conflitti ?? []) as { staff_name: string | null; comune: string; data: string; submitted: boolean }[];
        const avvisi = (j.avvisi ?? []) as string[];
        let m = `Creati ${j.pianiCreati ?? 0} piani, ${j.rapportiniCreati ?? 0} rapportini.`;
        if (conf.length) m += ` Non assegnati (già pianificati): ${conf.map((c) => `${c.staff_name ?? '—'} a ${c.comune} il ${c.data}`).join(', ')}.`;
        if (nr.length) m += ` Operatori non risolti: ${nr.map((x) => `${x.esecutore} (${x.motivo}, ${x.n})`).join(', ')}.`;
        if (avvisi.length) m += ` Avvisi: ${avvisi.join(' · ')}`;
        setEsito(m);
        setSelezione(new Set<string>());
        void caricaStorico();
        router.refresh();
```

- [ ] **Step 4: Aggiungere la sezione "Storico assegnazioni"**

In `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`, trovare la chiusura dell'ultima `</section>` prima di `</main>` (riga ~290). Subito **prima** di `</main>`, inserire:

```tsx
      {/* Storico assegnazioni */}
      <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>
          Storico assegnazioni
        </h2>

        {(() => {
          const delGiorno = storico.filter((s) => s.data_pianificata === data);
          if (delGiorno.length === 0) return null;
          return (
            <div
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
            >
              ⚠️ Il giorno {data} risulta già assegnato: {delGiorno.map((s) => `${s.staff_name ?? '—'} (${s.comune}, ${s.n_interventi})`).join(', ')}.
            </div>
          );
        })()}

        {storico.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna assegnazione registrata.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--brand-text-muted)' }}>
                  {['Giorno', 'Comune', 'Operatore', 'N. interventi', 'Creato il'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storico.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{s.data_pianificata}</td>
                    <td className="px-2 py-1.5">{s.comune}</td>
                    <td className="px-2 py-1.5">{s.staff_name ?? '—'}</td>
                    <td className="px-2 py-1.5">{s.n_interventi}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{new Date(s.creato_il).toLocaleString('it-IT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore nel componente.

- [ ] **Step 6: Commit**

```bash
git add components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git commit -m "feat(assegnazione-ai): UI storico assegnazioni + avviso conflitti"
```

---

### Task 7: Build + smoke + migration

**Files:** nessuno (verifica end-to-end).

- [ ] **Step 1: Suite helper agente verde**

Run: `npx vitest run lib/agente/`
Expected: PASS, inclusi i nuovi `partizionaConflitti` e `costruisciLogRows`.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori (compila i nuovi endpoint/route/UI).

- [ ] **Step 3: Lanciare la migration sul prod (utente)**

Eseguire `supabase/migrations/20260618120000_assegnazione_ai_log.sql` nell'editor SQL del prod (progetto `aceztqfebringeaebvce`).

- [ ] **Step 4: Smoke manuale**

1. `/hub/assegnazione-ai` → "Leggi dal file" su un giorno → "Procedi": verifica `pianiCreati`/`rapportiniCreati` e che la sezione **Storico assegnazioni** si popoli.
2. Premere "Procedi" di nuovo sulle stesse righe (o su un operatore già pianificato in quel comune+giorno): l'esito mostra **"Non assegnati (già pianificati): …"** e NON crea doppioni per quell'operatore.
3. Selezionare un giorno già presente in storico → compare il banner **"⚠️ Il giorno … risulta già assegnato"**.

- [ ] **Step 5: Commit eventuali fix dello smoke** (se necessario).

---

## Note di deviazione dalla spec

- La spec elencava lo storico caricato anche server-side; qui è caricato **solo client-side** dall'endpoint GET (mount + dopo Procedi), così `page.tsx` resta invariato e la logica storico vive in un solo posto. Stesso risultato funzionale.
- Il filtro "per giorno selezionato" è fatto **client-side** sulla lista recente (banner), mentre l'endpoint supporta comunque `?data=` per usi futuri. Il guard robusto contro i doppioni è il **pre-check conflitti** (stato live dei rapportini), non lo storico.
