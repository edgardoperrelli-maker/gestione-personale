# Spostamento interventi tra operatori — propagazione sicura al Salva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando si salva una pianificazione riaperta dopo aver spostato interventi tra operatori, mostrare un riepilogo della variazione, bloccare lo spostamento dei singoli interventi già completati, e gestire (avviso + riapertura) i rapportini già inviati — senza perdere compilazioni né creare/rompere link.

**Architecture:** Si estrae da `genera/route.ts` un motore condiviso in due parti: una funzione **pura** (`calcolaDiffRapportini`) che calcola la variazione per `task_id`, e un endpoint **anteprima** (dry-run) che prepara i dati reali e la invoca. Il Salva nella UI chiama prima l'anteprima (non scrive), mostra una modale di riepilogo/blocco, e solo su conferma procede col flusso esistente (PUT piano → interventi → genera), ora esteso per riaprire gli inviati.

**Tech Stack:** Next.js 15 (route handlers, `runtime nodejs`), Supabase JS, React 19, vitest (test co-locati `*.test.ts`, `environment: node`, alias `@/` → root).

**Contesto chiave già verificato:**
- Il Salva già propaga ai rapportini: [MappaOperatoriClient.tsx:1659-1715](../../../components/modules/mappa/MappaOperatoriClient.tsx) chiama in sequenza `piani` → `piani/interventi` → `rapportini/genera` con template ereditato (`rapTemplateId`).
- `mergeVoci` preserva le risposte per `task_id` che restano: [buildVoci.ts:26-29](../../../utils/rapportini/buildVoci.ts).
- Le voci hanno `task_id` = `String(task.id)` e `intervento_id`. Gli interventi hanno `stato` (`'completato'` = terminale, vedi `TERMINALI` in [InterventiAssegnabili.tsx:15](../../../components/modules/interventi/InterventiAssegnabili.tsx)).
- Modale di riferimento (pattern UI da replicare): [MappaOperatoriClient.tsx:3403-3438](../../../components/modules/mappa/MappaOperatoriClient.tsx).

**Comando test:** `npx vitest run <path>` per un singolo file; `npm run test` per tutta la suite.

---

## File Structure

| File | Responsabilità |
|------|----------------|
| `utils/rapportini/diffRapportini.ts` | **nuovo** — funzione pura `calcolaDiffRapportini`: dati normalizzati → `DiffRapportini`. Nessun I/O. |
| `utils/rapportini/diffRapportini.test.ts` | **nuovo** — unit test della funzione pura. |
| `lib/interventi/sincronizzaRapportini.ts` | **nuovo** — motore I/O estratto da `genera`: loop operatori, merge voci, link, blocco completati, riapertura inviati. |
| `app/api/mappa/rapportini/genera/route.ts` | **modifica** — diventa wrapper sottile su `sincronizzaRapportini`, accetta `confermaInviati`. |
| `app/api/mappa/piani/anteprima-rapportini/route.ts` | **nuovo** — endpoint POST dry-run: prepara dati reali, chiama la funzione pura, ritorna il diff. |
| `components/modules/mappa/MappaOperatoriClient.tsx` | **modifica** — flusso Salva: anteprima → modale riepilogo/blocco → applica con `confermaInviati`. |

---

## Task 1: Funzione pura `calcolaDiffRapportini`

**Files:**
- Create: `utils/rapportini/diffRapportini.ts`
- Test: `utils/rapportini/diffRapportini.test.ts`

- [ ] **Step 1: Scrivi il file dei tipi e della funzione (firma + tipi, corpo provvisorio)**

Create `utils/rapportini/diffRapportini.ts`:

```ts
// utils/rapportini/diffRapportini.ts
// Calcolo PURO (nessun I/O) della variazione sui rapportini quando si salva una
// pianificazione dopo aver spostato interventi tra operatori. Ragiona per task_id
// (le voci hanno task_id = String(task.id)).

export type TaskProposto = { taskId: string; descr: string };
export type OperatoreProposto = { staffId: string; staffName: string; tasks: TaskProposto[] };
export type VoceEsistente = { taskId: string; staffId: string; staffName: string; descr: string };

export type DiffInput = {
  /** Distribuzione proposta (operatori ancora in mappa, con i loro task). */
  operatoriProposti: OperatoreProposto[];
  /** Voci attualmente salvate nei rapportini del piano (stato "prima"). */
  vociEsistenti: VoceEsistente[];
  /** staff_id che hanno già un rapportino in questo piano. */
  staffConRapportino: Set<string>;
  /** staff_id il cui rapportino è in stato 'inviato'. */
  staffInviati: Set<string>;
  /** task_id il cui intervento collegato è 'completato' (non riassegnabile). */
  taskCompletati: Set<string>;
};

export type StaffRef = { staffId: string; staffName: string };
export type Spostamento = { taskId: string; descr: string; daStaffId: string; daNome: string; aStaffId: string; aNome: string };
export type Bloccato = { taskId: string; descr: string; daNome: string; aNome: string; motivo: 'completato' };

export type DiffRapportini = {
  nessunaModifica: boolean;
  spostamenti: Spostamento[];
  nuoviLink: StaffRef[];
  svuotati: StaffRef[];
  inviatiCoinvolti: StaffRef[];
  bloccati: Bloccato[];
};

export function calcolaDiffRapportini(input: DiffInput): DiffRapportini {
  return { nessunaModifica: true, spostamenti: [], nuoviLink: [], svuotati: [], inviatiCoinvolti: [], bloccati: [] };
}
```

- [ ] **Step 2: Scrivi i test che falliscono**

Create `utils/rapportini/diffRapportini.test.ts`:

```ts
// utils/rapportini/diffRapportini.test.ts
import { describe, it, expect } from 'vitest';
import { calcolaDiffRapportini, type DiffInput } from './diffRapportini';

function base(over: Partial<DiffInput> = {}): DiffInput {
  return {
    operatoriProposti: [],
    vociEsistenti: [],
    staffConRapportino: new Set<string>(),
    staffInviati: new Set<string>(),
    taskCompletati: new Set<string>(),
    ...over,
  };
}

describe('calcolaDiffRapportini', () => {
  it('spostamento: task passa da Mario a Luigi', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
    }));
    expect(out.spostamenti).toHaveLength(1);
    expect(out.spostamenti[0]).toMatchObject({ taskId: 't1', daStaffId: 's1', aStaffId: 's2' });
    expect(out.bloccati).toEqual([]);
    expect(out.nessunaModifica).toBe(false);
  });

  it('blocco: un task completato che cambia operatore finisce in bloccati, non in spostamenti', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
      taskCompletati: new Set(['t1']),
    }));
    expect(out.spostamenti).toEqual([]);
    expect(out.bloccati).toHaveLength(1);
    expect(out.bloccati[0]).toMatchObject({ taskId: 't1', motivo: 'completato' });
  });

  it('stesso operatore: nessun movimento', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's1', staffName: 'Mario', tasks: [{ taskId: 't1', descr: 'ODL-1' }] }],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1']),
    }));
    expect(out.nessunaModifica).toBe(true);
  });

  it('nuovo link: operatore con task ma senza rapportino esistente', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's3', staffName: 'Giovanni', tasks: [{ taskId: 't9', descr: 'ODL-9' }] }],
      vociEsistenti: [],
      staffConRapportino: new Set<string>(),
    }));
    expect(out.nuoviLink).toEqual([{ staffId: 's3', staffName: 'Giovanni' }]);
  });

  it('svuotato: operatore ancora in lista con rapportino ma 0 task', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's1', staffName: 'Mario', tasks: [] }],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1']),
    }));
    expect(out.svuotati).toEqual([{ staffId: 's1', staffName: 'Mario' }]);
  });

  it('inviati coinvolti: la destinazione di uno spostamento ha rapportino inviato', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
      staffInviati: new Set(['s2']),
    }));
    expect(out.inviatiCoinvolti).toEqual([{ staffId: 's2', staffName: 'Luigi' }]);
  });

  it('nessuna modifica con input vuoto', () => {
    const out = calcolaDiffRapportini(base());
    expect(out.nessunaModifica).toBe(true);
    expect(out).toMatchObject({ spostamenti: [], nuoviLink: [], svuotati: [], bloccati: [] });
  });
});
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run utils/rapportini/diffRapportini.test.ts`
Expected: FAIL (la funzione ritorna sempre `nessunaModifica: true`, gli assert su spostamenti/nuoviLink/ecc. falliscono).

- [ ] **Step 4: Implementa il corpo della funzione**

Replace the `calcolaDiffRapportini` body in `utils/rapportini/diffRapportini.ts`:

```ts
export function calcolaDiffRapportini(input: DiffInput): DiffRapportini {
  // "prima": task_id → voce con lo staff attuale
  const prima = new Map<string, VoceEsistente>();
  for (const v of input.vociEsistenti) prima.set(v.taskId, v);

  // "dopo": task_id → operatore proposto
  const dopo = new Map<string, { staffId: string; staffName: string; descr: string }>();
  for (const op of input.operatoriProposti) {
    for (const t of op.tasks) dopo.set(t.taskId, { staffId: op.staffId, staffName: op.staffName, descr: t.descr });
  }

  const spostamenti: Spostamento[] = [];
  const bloccati: Bloccato[] = [];
  for (const [taskId, d] of dopo) {
    const p = prima.get(taskId);
    if (!p) continue;                      // task mai stato in un rapportino → nuova voce, non spostamento
    if (p.staffId === d.staffId) continue; // stesso operatore → nessun movimento
    if (input.taskCompletati.has(taskId)) {
      bloccati.push({ taskId, descr: p.descr, daNome: p.staffName, aNome: d.staffName, motivo: 'completato' });
    } else {
      spostamenti.push({ taskId, descr: p.descr, daStaffId: p.staffId, daNome: p.staffName, aStaffId: d.staffId, aNome: d.staffName });
    }
  }

  const nuoviLink: StaffRef[] = input.operatoriProposti
    .filter((op) => op.tasks.length > 0 && !input.staffConRapportino.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  const svuotati: StaffRef[] = input.operatoriProposti
    .filter((op) => op.tasks.length === 0 && input.staffConRapportino.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  // staff coinvolti da un movimento: origine/destinazione di uno spostamento,
  // oppure destinazione di una voce nuova (task mai visto assegnato a un operatore esistente).
  const staffCoinvolti = new Set<string>();
  for (const sp of spostamenti) { staffCoinvolti.add(sp.daStaffId); staffCoinvolti.add(sp.aStaffId); }
  for (const [taskId, d] of dopo) { if (!prima.has(taskId)) staffCoinvolti.add(d.staffId); }
  const inviatiCoinvolti: StaffRef[] = input.operatoriProposti
    .filter((op) => staffCoinvolti.has(op.staffId) && input.staffInviati.has(op.staffId))
    .map((op) => ({ staffId: op.staffId, staffName: op.staffName }));

  const nessunaModifica =
    spostamenti.length === 0 && nuoviLink.length === 0 && svuotati.length === 0 && bloccati.length === 0;

  return { nessunaModifica, spostamenti, nuoviLink, svuotati, inviatiCoinvolti, bloccati };
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run utils/rapportini/diffRapportini.test.ts`
Expected: PASS (7 test verdi).

- [ ] **Step 6: Commit**

```bash
git add utils/rapportini/diffRapportini.ts utils/rapportini/diffRapportini.test.ts
git commit -m "feat(rapportini): calcolaDiffRapportini puro (spostamenti/blocco/inviati)"
```

---

## Task 2: Estrarre il motore `sincronizzaRapportini` da `genera`

Refactoring senza cambio di comportamento: si sposta la logica di generazione (loop operatori) in una funzione riusabile; `genera` la chiama. Nessun test DB nel progetto → la non-regressione si verifica con build + suite test esistente verde.

**Files:**
- Create: `lib/interventi/sincronizzaRapportini.ts`
- Modify: `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Crea il modulo motore completo**

Create `lib/interventi/sincronizzaRapportini.ts`. È la logica oggi in `genera/route.ts` (righe 21-163) estratta 1:1, con il client per dependency injection (come `ensureInterventiForPiano`) e i `return` convertiti in `SincronizzaResult`. Il blocco completati e la riapertura inviati si aggiungono nel Task 3.

```ts
// lib/interventi/sincronizzaRapportini.ts
// Motore di (ri)generazione dei rapportini di un piano, condiviso tra il pulsante
// "Genera" e il Salva della pianificazione. Estratto da genera/route.ts.
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { taskToVoce, mergeVoci, type Voce } from '@/utils/rapportini/buildVoci';
import { orphanRapportini } from '@/utils/rapportini/orphans';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import { rilevaConflitti, type RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export type SincronizzaOpts = {
  templateId: string;
  overwrite?: 'replace' | 'skip';
  overwriteSubmitted?: boolean;
  /** Conferma la riapertura dei rapportini INVIATI di questo stesso piano toccati dalla variazione. */
  confermaInviati?: boolean;
};

export type SincronizzaResult =
  | { ok: true; rapportini: { staff_id: string; staff_name: string | null; token: string; url: string }[]; interventiWarning?: string }
  | { ok: false; status: number; error?: string; conflicts?: unknown[] };

export async function sincronizzaRapportini(
  db: SupabaseClient,
  pianoId: string,
  opts: SincronizzaOpts,
): Promise<SincronizzaResult> {
  const { data: piano } = await db.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).single();
  if (!piano) return { ok: false, status: 404, error: 'Piano non trovato' };
  const { data: tpl } = await db.from('rapportino_template').select('id, campi, info_campi').eq('id', opts.templateId).single();
  if (!tpl) return { ok: false, status: 404, error: 'Template non trovato' };
  const { data: ops } = await db.from('mappa_piani_operatori').select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

  const operatoriPiano = (ops ?? []).map((o) => ({ staff_id: String(o.staff_id), staff_name: (o.staff_name as string | null) ?? null }));

  const { data: altriRaps, error: eAltri } = await db
    .from('rapportini').select('id, staff_id, piano_id, data, stato, submitted_at')
    .eq('data', piano.data).neq('piano_id', pianoId).in('staff_id', operatoriPiano.map((o) => o.staff_id));
  if (eAltri) return { ok: false, status: 500, error: eAltri.message };

  const altriPianoIds = [...new Set((altriRaps ?? []).map((r) => r.piano_id as string))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: altriPiani, error: ePiani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    if (ePiani) return { ok: false, status: 500, error: ePiani.message };
    (altriPiani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = (altriRaps ?? []).map((r) => ({
    id: r.id as string, staff_id: String(r.staff_id), piano_id: r.piano_id as string,
    territorio: terrByPiano[r.piano_id as string] ?? null, data: r.data as string,
    stato: r.stato as string, submitted_at: (r.submitted_at as string | null) ?? null,
  }));

  const conflicts = rilevaConflitti({
    pianoId, territorio: piano.territorio ?? null, data: piano.data, operatori: operatoriPiano, esistenti,
  });
  if (conflicts.length > 0 && !opts.overwrite) return { ok: false, status: 409, conflicts };
  if (opts.overwrite === 'replace' && conflicts.some((c) => c.submitted) && !opts.overwriteSubmitted) {
    return { ok: false, status: 409, conflicts, error: 'submitted_richiede_conferma' };
  }

  const staffInConflitto = new Set(conflicts.map((c) => c.staff_id));
  if (opts.overwrite === 'replace' && conflicts.length > 0) {
    await db.from('rapportini').delete().in('id', conflicts.map((c) => c.rapportino_id));
  }

  const currentStaffIds = (ops ?? []).map((o) => String(o.staff_id));
  if (currentStaffIds.length > 0) {
    const { data: existingRaps } = await db.from('rapportini').select('id, staff_id').eq('piano_id', pianoId);
    const toRemove = orphanRapportini((existingRaps as { id: string; staff_id: string }[]) ?? [], currentStaffIds);
    if (toRemove.length > 0) await db.from('rapportini').delete().in('id', toRemove);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
  const expires = scadenzaIso(piano.data);

  let interventiWarning: string | undefined;
  try {
    const ens = await ensureInterventiForPiano(db, pianoId);
    if (ens.error) interventiWarning = ens.error;
  } catch (e) {
    interventiWarning = (e instanceof Error ? e.message : String(e)) || 'errore ensure interventi';
  }
  if (interventiWarning) console.error('sincronizza: ensureInterventiForPiano:', interventiWarning);

  const { data: intRows } = await db
    .from('interventi').select('id, staff_id, odl, matricola_contatore, pdr').eq('piano_id', pianoId);
  const resolveIntervento = buildVoceInterventoLinker((intRows ?? []) as InterventoLinkRow[]);

  for (const op of ops ?? []) {
    if (opts.overwrite === 'skip' && staffInConflitto.has(String(op.staff_id))) continue;
    const { data: existing } = await db.from('rapportini')
      .select('id, token').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();
    let rapId = existing?.id;
    let token = existing?.token;
    if (!rapId) {
      token = randomBytes(24).toString('base64url');
      const { data: ins, error: eIns } = await db.from('rapportini').insert({
        piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
        template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], token, stato: 'in_corso', expires_at: expires,
      }).select('id').single();
      if (eIns) return { ok: false, status: 500, error: eIns.message };
      rapId = ins!.id;
    } else {
      await db.from('rapportini')
        .update({ template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], expires_at: expires }).eq('id', rapId);
    }

    const { data: existingVoci } = await db.from('rapportino_voci')
      .select('task_id, risposte, raw_json').eq('rapportino_id', rapId);
    const existingRows = (existingVoci as Array<{ task_id: string; risposte: Record<string, unknown> | null; raw_json: unknown }>) ?? [];
    const existingTaskIds = new Set(existingRows.map((v) => v.task_id));
    const prevNuovoByTask = new Map<string, boolean>(
      existingRows.map((v) => [v.task_id, Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo)]),
    );
    const rapPreesisteva = Boolean(existing?.id);
    const fromTasks = ((op.tasks as unknown[]) ?? []).map((t, i) => taskToVoce(t, i + 1));
    const existingAsVoci: Voce[] = existingRows.map((v) => ({ task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {} }));
    const merged = mergeVoci(fromTasks, existingAsVoci);

    await db.from('rapportino_voci').delete().eq('rapportino_id', rapId);
    if (merged.length) {
      const { error: eVoci } = await db.from('rapportino_voci').insert(merged.map((v) => {
        const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
        const intervento_id = resolveIntervento({
          staff_id: op.staff_id,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
          matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
          pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
        });
        const nuovo = existingTaskIds.has(v.task_id) ? (prevNuovoByTask.get(v.task_id) ?? false) : rapPreesisteva;
        const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo };
        return { rapportino_id: rapId, intervento_id, ...v, raw_json };
      }));
      if (eVoci) return { ok: false, status: 500, error: eVoci.message };
    }
    out.push({ staff_id: op.staff_id, staff_name: op.staff_name ?? null, token: token!, url: `${baseUrl}/r/${token}` });
  }

  return { ok: true, rapportini: out, interventiWarning };
}
```

- [ ] **Step 2: Verifica che il modulo compili**

Run: `npx tsc --noEmit`
Expected: nessun errore in `sincronizzaRapportini.ts` (tipi e import risolti). Eventuali errori solo nei file che ancora importano la vecchia logica si risolvono allo Step 3.

- [ ] **Step 3: Riscrivi `genera/route.ts` come wrapper sottile**

Replace the whole body of `app/api/mappa/rapportini/genera/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { pianoId, templateId, overwrite, overwriteSubmitted, confermaInviati } = await req.json() as {
      pianoId?: string; templateId?: string; overwrite?: 'replace' | 'skip'; overwriteSubmitted?: boolean; confermaInviati?: boolean;
    };
    if (!pianoId || !templateId) return NextResponse.json({ error: 'pianoId e templateId obbligatori' }, { status: 400 });

    const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId, overwrite, overwriteSubmitted, confermaInviati });
    if (!res.ok) {
      const body: Record<string, unknown> = {};
      if (res.error) body.error = res.error;
      if (res.conflicts) body.conflicts = res.conflicts;
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json({ ok: true, rapportini: res.rapportini, interventiWarning: res.interventiWarning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore generazione rapportini.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verifica tipi e suite test esistente (non-regressione)**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati (`sincronizzaRapportini.ts`, `genera/route.ts`).

Run: `npx vitest run utils/rapportini lib/interventi`
Expected: PASS (i test esistenti su buildVoci, orphans, rilevaConflitti, ecc. restano verdi).

- [ ] **Step 5: Verifica lint mirato (la baseline del repo è già rossa altrove)**

Run: `npx eslint lib/interventi/sincronizzaRapportini.ts app/api/mappa/rapportini/genera/route.ts`
Expected: nessun nuovo errore sui due file.

- [ ] **Step 6: Commit**

```bash
git add lib/interventi/sincronizzaRapportini.ts app/api/mappa/rapportini/genera/route.ts
git commit -m "refactor(rapportini): estrai motore sincronizzaRapportini da genera (comportamento invariato)"
```

---

## Task 3: Blocco completati + riapertura inviati nel motore

Aggiunge due comportamenti nel motore: (a) rifiuta se un intervento **completato** sta cambiando operatore; (b) se `confermaInviati`, riapre (stato `in_corso` + `riaperto_at`) i rapportini **inviati** dello stesso piano prima di riscriverne le voci.

**Files:**
- Modify: `lib/interventi/sincronizzaRapportini.ts`

- [ ] **Step 1: Carica `stato` e `staff_id` degli interventi e calcola gli spostamenti di completati**

Nel motore, la query interventi esiste già (oggi seleziona `id, staff_id, odl, matricola_contatore, pdr`). Aggiungi `stato`. Subito dopo aver caricato `intRows`, inserisci il controllo blocco (prima del loop `for (const op of ops ?? [])`):

```ts
// Blocco: un intervento 'completato' non può cambiare operatore.
// Mappa identità→(staff attuale, stato) e confronta con lo staff proposto nei task.
const normOdl = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const statoByOdl = new Map<string, { staff: string; stato: string }>();
for (const it of (intRows ?? []) as Array<{ staff_id: string | null; odl: string | null; stato: string }>) {
  const k = normOdl(it.odl);
  if (k) statoByOdl.set(k, { staff: String(it.staff_id ?? ''), stato: it.stato });
}
const violati: string[] = [];
for (const op of ops ?? []) {
  for (const t of ((op.tasks as Array<{ odl?: string | null }>) ?? [])) {
    const hit = statoByOdl.get(normOdl(t.odl));
    if (hit && hit.stato === 'completato' && hit.staff !== String(op.staff_id)) {
      violati.push(normOdl(t.odl));
    }
  }
}
if (violati.length > 0) {
  return { ok: false, status: 409, error: `spostamento_completato:${violati.join(',')}` };
}
```

NB: la `select` degli interventi va aggiornata aggiungendo `stato`:
`.select('id, staff_id, odl, matricola_contatore, pdr, stato')`.

- [ ] **Step 2: Riapri i rapportini inviati dello stesso piano se confermato**

Dentro il loop operatori, dopo aver risolto `rapId` (rapportino esistente) e **prima** del `delete` delle voci, aggiungi la riapertura condizionata. Sostituisci il blocco `else { await db.from('rapportini').update({...}) }` (aggiornamento di un rapportino esistente) con:

```ts
} else {
  // Rapportino già esistente: aggiorna template/scadenza. Se è 'inviato' e l'utente
  // ha confermato, riaprilo (torna compilabile) valorizzando riaperto_at.
  const { data: cur } = await db.from('rapportini').select('stato').eq('id', rapId).maybeSingle();
  const eraInviato = (cur as { stato?: string } | null)?.stato === 'inviato';
  const patch: Record<string, unknown> = {
    template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], expires_at: expires,
  };
  if (eraInviato && opts.confermaInviati) {
    patch.stato = 'in_corso';
    patch.riaperto_at = new Date().toISOString();
  }
  await db.from('rapportini').update(patch).eq('id', rapId);
}
```

- [ ] **Step 3: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore in `sincronizzaRapportini.ts`.

- [ ] **Step 4: Verifica che la suite pura resti verde**

Run: `npx vitest run utils/rapportini lib/interventi`
Expected: PASS (nessuna regressione; il motore non è coperto da unit, ma le sue dipendenze pure sì).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/sincronizzaRapportini.ts
git commit -m "feat(rapportini): blocco spostamento interventi completati + riapertura inviati su conferma"
```

---

## Task 4: Endpoint anteprima `POST /api/mappa/piani/anteprima-rapportini`

Prepara i dati reali (voci esistenti, rapportini, interventi completati) e invoca la funzione pura. Non scrive nulla.

**Files:**
- Create: `app/api/mappa/piani/anteprima-rapportini/route.ts`

- [ ] **Step 1: Crea l'endpoint**

Create `app/api/mappa/piani/anteprima-rapportini/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { calcolaDiffRapportini, type OperatoreProposto, type VoceEsistente } from '@/utils/rapportini/diffRapportini';

export const runtime = 'nodejs';

type OpBody = { staff_id: string; staff_name?: string | null; tasks?: Array<{ id: string; odl?: string | null; indirizzo?: string | null }> };

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { pianoId, operatori } = (await req.json()) as { pianoId?: string; operatori?: OpBody[] };
    if (!pianoId || !Array.isArray(operatori)) {
      return NextResponse.json({ error: 'pianoId e operatori obbligatori' }, { status: 400 });
    }

    // Rapportini esistenti del piano (staff, stato).
    const { data: raps } = await supabaseAdmin
      .from('rapportini').select('id, staff_id, staff_name, stato').eq('piano_id', pianoId);
    const rapRows = (raps ?? []) as Array<{ id: string; staff_id: string; staff_name: string | null; stato: string }>;
    const staffByRapId = new Map(rapRows.map((r) => [r.id, r]));
    const staffConRapportino = new Set(rapRows.map((r) => String(r.staff_id)));
    const staffInviati = new Set(rapRows.filter((r) => r.stato === 'inviato').map((r) => String(r.staff_id)));

    // Voci esistenti (stato "prima") con descr e intervento_id.
    const rapIds = rapRows.map((r) => r.id);
    const vociEsistenti: VoceEsistente[] = [];
    const interventoIds: string[] = [];
    const taskIdByInterventoId = new Map<string, string>();
    if (rapIds.length > 0) {
      const { data: voci } = await supabaseAdmin
        .from('rapportino_voci').select('rapportino_id, task_id, intervento_id, odl, via').in('rapportino_id', rapIds);
      for (const v of (voci ?? []) as Array<{ rapportino_id: string; task_id: string; intervento_id: string | null; odl: string | null; via: string | null }>) {
        const rap = staffByRapId.get(v.rapportino_id);
        if (!rap) continue;
        vociEsistenti.push({
          taskId: String(v.task_id),
          staffId: String(rap.staff_id),
          staffName: rap.staff_name ?? String(rap.staff_id),
          descr: v.odl ?? v.via ?? String(v.task_id),
        });
        if (v.intervento_id) { interventoIds.push(v.intervento_id); taskIdByInterventoId.set(v.intervento_id, String(v.task_id)); }
      }
    }

    // task completati: intervento collegato con stato 'completato'.
    const taskCompletati = new Set<string>();
    if (interventoIds.length > 0) {
      const { data: ints } = await supabaseAdmin
        .from('interventi').select('id, stato').in('id', interventoIds);
      for (const it of (ints ?? []) as Array<{ id: string; stato: string }>) {
        if (it.stato === 'completato') {
          const tId = taskIdByInterventoId.get(it.id);
          if (tId) taskCompletati.add(tId);
        }
      }
    }

    const operatoriProposti: OperatoreProposto[] = operatori.map((op) => ({
      staffId: String(op.staff_id),
      staffName: op.staff_name ?? String(op.staff_id),
      tasks: (op.tasks ?? []).map((t) => ({ taskId: String(t.id), descr: t.odl ?? t.indirizzo ?? String(t.id) })),
    }));

    const diff = calcolaDiffRapportini({ operatoriProposti, vociEsistenti, staffConRapportino, staffInviati, taskCompletati });
    return NextResponse.json(diff);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore anteprima rapportini.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore in `anteprima-rapportini/route.ts`.

- [ ] **Step 3: Verifica lint mirato**

Run: `npx eslint app/api/mappa/piani/anteprima-rapportini/route.ts`
Expected: nessun nuovo errore.

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/piani/anteprima-rapportini/route.ts
git commit -m "feat(rapportini): endpoint anteprima diff (dry-run) per il Salva"
```

---

## Task 5: UI — flusso Salva con anteprima, riepilogo e blocco

Innesta nel Salva esistente: prima di propagare ai rapportini (oggi righe 1676-1715), chiama l'anteprima; se ci sono bloccati → stop con messaggio; altrimenti mostra la modale di riepilogo; su conferma applica chiamando `genera` con `confermaInviati`.

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Aggiungi gli stati per il diff e la modale**

Vicino agli altri stati rap (dopo [MappaOperatoriClient.tsx:719](../../../components/modules/mappa/MappaOperatoriClient.tsx) `overwriteInviati`), aggiungi:

```tsx
const [diffPreview, setDiffPreview] = useState<import('@/utils/rapportini/diffRapportini').DiffRapportini | null>(null);
const [diffConfermaInviati, setDiffConfermaInviati] = useState(false);
const [pendingApply, setPendingApply] = useState<{ pid: string } | null>(null);
```

- [ ] **Step 2: Estrai la propagazione in una funzione riutilizzabile `applicaRapportini`**

Aggiungi (vicino a `eseguiGenerazione`, [MappaOperatoriClient.tsx:1776](../../../components/modules/mappa/MappaOperatoriClient.tsx)) la funzione che esegue la chiamata a `genera` con conferma inviati e ricarica lo stato:

```tsx
const applicaRapportini = useCallback(async (pid: string, confermaInviati: boolean) => {
  if (!rapTemplateId) { setRapError('Nessun modello rapportino attivo: rapportini non aggiornati.'); return; }
  try {
    const rg = await fetch('/api/mappa/rapportini/genera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pianoId: pid, templateId: rapTemplateId, confermaInviati }),
    });
    if (rg.ok) {
      const r2 = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
      const d2 = await r2.json();
      setRapStato(Array.isArray(d2) ? d2 : []);
    } else if (rg.status === 409) {
      const dataConf = (await rg.json().catch(() => ({}))) as { conflicts?: typeof rapConflicts; error?: string };
      if (Array.isArray(dataConf.conflicts) && dataConf.conflicts.length > 0) setRapConflicts(dataConf.conflicts);
      else setRapError(dataConf.error ?? 'Aggiornamento rapportini: conflitto non risolvibile.');
    } else {
      const ej = (await rg.json().catch(() => ({}))) as { error?: string };
      setRapError(ej.error ?? 'Aggiornamento rapportini non riuscito.');
    }
  } catch {
    setRapError("Errore di rete nell'aggiornamento dei rapportini.");
  }
}, [rapTemplateId]);
```

- [ ] **Step 3: Sostituisci la propagazione silenziosa con anteprima→modale**

In `MappaOperatoriClient.tsx`, sostituisci il blocco `if (rapTemplateId) { ... } else { ... }` attuale (righe **1679-1715**) con la chiamata all'anteprima:

```tsx
if (rapTemplateId) {
  try {
    const ap = await fetch('/api/mappa/piani/anteprima-rapportini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pianoId: pid, operatori }),
    });
    if (ap.ok) {
      const diff = (await ap.json()) as import('@/utils/rapportini/diffRapportini').DiffRapportini;
      if (diff.bloccati.length > 0) {
        const elenco = diff.bloccati.map((b) => `• ${b.descr} (${b.daNome} → ${b.aNome})`).join('\n');
        setRapError(`Questi interventi sono già completati e non possono essere spostati. Riportali all'operatore originale e risalva:\n${elenco}`);
      } else if (diff.nessunaModifica) {
        await applicaRapportini(pid, false); // nessuna variazione rilevante: applica diretto (riallinea expires/template)
      } else {
        setDiffPreview(diff);
        setDiffConfermaInviati(false);
        setPendingApply({ pid });
      }
    } else {
      const ej = (await ap.json().catch(() => ({}))) as { error?: string };
      setRapError(ej.error ?? 'Anteprima rapportini non riuscita.');
    }
  } catch {
    setRapError("Errore di rete nell'anteprima dei rapportini.");
  }
} else {
  setRapError('Nessun modello rapportino attivo: rapportini non aggiornati.');
}
```

- [ ] **Step 4: Aggiungi la modale di riepilogo**

Vicino alla modale conflitti ([MappaOperatoriClient.tsx:3403](../../../components/modules/mappa/MappaOperatoriClient.tsx)), aggiungi una nuova modale che replica il pattern:

```tsx
{diffPreview && pendingApply && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDiffPreview(null); setPendingApply(null); }}>
    <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-base font-semibold">Conferma variazione rapportini</h3>
      <ul className="my-3 max-h-60 space-y-1 overflow-y-auto text-sm">
        {diffPreview.spostamenti.map((s) => (
          <li key={`sp-${s.taskId}`} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5">
            <span className="font-medium">{s.descr}</span>: {s.daNome} → {s.aNome}
          </li>
        ))}
        {diffPreview.nuoviLink.map((n) => (
          <li key={`nl-${n.staffId}`} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-[var(--brand-primary)]">
            Nuovo rapportino + link per {n.staffName}
          </li>
        ))}
        {diffPreview.svuotati.map((v) => (
          <li key={`sv-${v.staffId}`} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-[var(--brand-text-muted)]">
            {v.staffName}: nessun intervento — rapportino vuoto, link conservato
          </li>
        ))}
      </ul>
      {diffPreview.inviatiCoinvolti.length > 0 && (
        <label className="mb-3 flex items-start gap-2 text-xs text-[var(--danger)]">
          <input type="checkbox" checked={diffConfermaInviati} onChange={(e) => setDiffConfermaInviati(e.target.checked)} />
          <span>
            Riapri e applica anche ai rapportini già inviati di: {diffPreview.inviatiCoinvolti.map((i) => i.staffName).join(', ')}
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setDiffPreview(null); setPendingApply(null); }} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm">Annulla</button>
        <button
          type="button"
          onClick={async () => { const pid = pendingApply.pid; const conf = diffConfermaInviati; setDiffPreview(null); setPendingApply(null); await applicaRapportini(pid, conf); }}
          disabled={diffPreview.inviatiCoinvolti.length > 0 && !diffConfermaInviati}
          className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Applica
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verifica tipi e build**

Run: `npx tsc --noEmit`
Expected: nessun errore in `MappaOperatoriClient.tsx`.

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun NUOVO errore introdotto dai blocchi aggiunti (confronta con la baseline del file).

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(rapportini): Salva con anteprima diff, riepilogo, blocco completati e riapertura inviati"
```

---

## Task 6: Verifica finale end-to-end e build

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Suite test completa**

Run: `npm run test`
Expected: PASS (inclusi i nuovi test di `diffRapportini`; nessuna regressione).

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori di tipo/route.

- [ ] **Step 3: Verifica manuale guidata (in `npm run dev`)**

Scenario su una pianificazione **già con rapportini generati**:
1. Riapri il piano, sposta un intervento **non completato** da A a B → Salva → la modale mostra "ODL → da A a B" → Applica → il digitale di A non lo ha più, quello di B sì (badge NUOVO); i link non cambiano.
2. Sposta un intervento **completato** da A a B → Salva → compare il messaggio di **blocco** con l'elenco; nessuna scrittura finché non lo riporti ad A.
3. Sposta un intervento verso un operatore con rapportino **inviato** → Salva → la modale mostra la spunta "riapri inviati"; senza spunta il bottone Applica è disabilitato; con spunta → applica e il rapportino torna compilabile.
4. Sposta tutti gli interventi via da A → Salva → A appare tra gli "svuotati"; dopo Applica il suo link resta valido ma vuoto.

- [ ] **Step 4: Commit finale (se servono fix dalla verifica)**

```bash
git add -A
git commit -m "test(rapportini): verifica end-to-end spostamento interventi al Salva"
```

---

## Note di implementazione

- **Nessuna migration**: `interventi.stato`, `rapportini.stato` e `rapportini.riaperto_at` esistono già.
- **Identità del blocco**: si usa l'ODL normalizzato (i task ACEA con ODL valorizzato sono il caso reale). Se in futuro servisse coprire i task senza ODL, estendere `statoByOdl` con l'identità composta indirizzo+matricola di `identitaIntervento` ([planInterventiForPiano.ts:39](../../../lib/interventi/planInterventiForPiano.ts)).
- **Baseline lint rossa**: il repo ha già ~89 errori lint preesistenti; il gate è "nessun nuovo problema sui file toccati" (verifica con `npx eslint <path>`).
- **Limite noto**: la propagazione non è transazionale (come già oggi `genera`); in caso di errore a metà nessuna compilazione viene persa perché il merge è preservante.
