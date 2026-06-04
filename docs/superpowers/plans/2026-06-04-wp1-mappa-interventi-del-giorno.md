# WP1 — Mappa "Interventi del giorno" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pagina Mappa carica gli interventi geocodificati del giorno dalla tabella `interventi` (alternativa all'upload Excel) e, dopo la distribuzione tra operatori, riscrive l'assegnazione (staff_id, ordine, stato, token agenda) sugli interventi.

**Architecture:** Tre unità nuove a zero collisione (helper puri testabili + GET sorgente + POST sink) sviluppate per prime, poi un edit al file caldo `MappaOperatoriClient.tsx` (ribasato su `main`). Il POST replica il pattern di scrittura di `app/api/interventi/assegna/route.ts` riusando `pianificaAssegnazione()` e `generaAgendaToken()`, aggiungendo la scrittura di `ordine`.

**Tech Stack:** Next.js 15 (Route Handler, `runtime='nodejs'`), React 19, TypeScript, Supabase (`@supabase/auth-helpers-nextjs` per la lettura RLS, `supabaseAdmin` service-role per le scritture), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-wp1-mappa-interventi-del-giorno-design.md`

**Regole operative (da `docs/superpowers/roadmap-handoff.md`):**
- `git add` SOLO i file elencati in ogni task (mai `git add -A`); mai committare `tsconfig.tsbuildinfo` né `.claude/settings.local.json`.
- Niente `npm run dev` dentro un subagent.
- Footer di OGNI commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch di lavoro: `feat/wp1-mappa-interventi-del-giorno` (già creato; la spec è già committata).

---

## File Structure

| File | Responsabilità |
|------|----------------|
| `lib/interventi/mappaInterventi.ts` (Create) | Helper puri: tipo `InterventoGeoRow`, `mapInterventoToTask`, `buildDistribuzionePayload`. Nessun I/O. |
| `lib/interventi/mappaInterventi.test.ts` (Create) | Test vitest degli helper puri. |
| `app/api/interventi/da-pianificare/route.ts` (Create) | GET sorgente: legge gli interventi geocodificati del giorno (RLS) → `{ interventi: Task[] }`. |
| `app/api/interventi/distribuzione/route.ts` (Create) | POST sink: applica l'assegnazione mappa→interventi + token agenda idempotente. |
| `components/modules/mappa/MappaOperatoriClient.tsx` (Modify) | File CALDO. Flag `sorgente`, handler di caricamento dal DB, pulsante, branch in `saveDistribution`. |

---

## Task 1: Helper puri `mappaInterventi.ts` (TDD)

**Files:**
- Create: `lib/interventi/mappaInterventi.ts`
- Test: `lib/interventi/mappaInterventi.test.ts`

**Riferimenti (sola lettura):** `utils/routing/types.ts` (tipo `Task`), `lib/interventi/interventiView.ts:58` (tipo `InterventoRow`), `lib/interventi/taskToIntervento.ts` (mapping inverso Task→DB).

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/interventi/mappaInterventi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapInterventoToTask, buildDistribuzionePayload, type InterventoGeoRow } from './mappaInterventi';

function row(overrides: Partial<InterventoGeoRow> = {}): InterventoGeoRow {
  return {
    id: 'uuid-1',
    odl: 'ODL-1',
    indirizzo: 'Via Roma 1',
    comune: 'Roma',
    committente: 'acea',
    stato: 'da_assegnare',
    geocode_status: 'ok',
    nominativo: 'Mario Rossi',
    fascia_oraria: '9-12',
    staff_id: null,
    lat: 41.9,
    lng: 12.5,
    cap: '00100',
    pdr: 'PDR-1',
    matricola_contatore: 'M123',
    intervento_tipo: 'Sostituzione',
    codice_servizio: 'S-AI-001',
    richiede_due_operatori: true,
    data: '2026-06-04',
    ...overrides,
  };
}

describe('mapInterventoToTask', () => {
  it('mappa tutti i campi di una riga completa', () => {
    const t = mapInterventoToTask(row());
    expect(t).toEqual({
      id: 'uuid-1',
      odl: 'ODL-1',
      pdr: 'PDR-1',
      indirizzo: 'Via Roma 1',
      cap: '00100',
      citta: 'Roma',
      priorita: 0,
      fascia_oraria: '9-12',
      lat: 41.9,
      lng: 12.5,
      requiresTwoOperators: true,
      nominativo: 'Mario Rossi',
      matricola: 'M123',
      attivita: 'Sostituzione',
      codice: 'S-AI-001',
    });
  });

  it('rinomina comune→citta, matricola_contatore→matricola, intervento_tipo→attivita, codice_servizio→codice', () => {
    const t = mapInterventoToTask(row({ comune: 'Milano', matricola_contatore: 'X9', intervento_tipo: 'Verifica', codice_servizio: 'C-1' }));
    expect(t.citta).toBe('Milano');
    expect(t.matricola).toBe('X9');
    expect(t.attivita).toBe('Verifica');
    expect(t.codice).toBe('C-1');
  });

  it('applica i default sui campi null (priorita 0, stringhe vuote, undefined)', () => {
    const t = mapInterventoToTask(row({
      odl: null, indirizzo: null, cap: null, comune: null, fascia_oraria: null,
      pdr: null, lat: null, lng: null, richiede_due_operatori: null,
      nominativo: null, matricola_contatore: null, intervento_tipo: null, codice_servizio: null,
    }));
    expect(t.odl).toBe('');
    expect(t.indirizzo).toBe('');
    expect(t.cap).toBe('');
    expect(t.citta).toBe('');
    expect(t.fascia_oraria).toBe('');
    expect(t.priorita).toBe(0);
    expect(t.pdr).toBeUndefined();
    expect(t.lat).toBeUndefined();
    expect(t.lng).toBeUndefined();
    expect(t.requiresTwoOperators).toBeUndefined();
    expect(t.nominativo).toBeUndefined();
    expect(t.matricola).toBeUndefined();
    expect(t.attivita).toBeUndefined();
    expect(t.codice).toBeUndefined();
  });
});

describe('buildDistribuzionePayload', () => {
  it('genera ordine 1-based per operatore e fa flatten', () => {
    const piano = [
      { staffId: 's1', tasks: [{ id: 'a' }, { id: 'b' }] },
      { staffId: 's2', tasks: [{ id: 'c' }] },
    ];
    expect(buildDistribuzionePayload(piano)).toEqual([
      { intervento_id: 'a', staff_id: 's1', ordine: 1 },
      { intervento_id: 'b', staff_id: 's1', ordine: 2 },
      { intervento_id: 'c', staff_id: 's2', ordine: 1 },
    ]);
  });

  it('lista vuota → []', () => {
    expect(buildDistribuzionePayload([])).toEqual([]);
  });

  it('operatore senza task → nessuna riga', () => {
    const piano = [{ staffId: 's1', tasks: [] }, { staffId: 's2', tasks: [{ id: 'x' }] }];
    expect(buildDistribuzionePayload(piano)).toEqual([{ intervento_id: 'x', staff_id: 's2', ordine: 1 }]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: FAIL — il modulo `./mappaInterventi` non esiste ("Failed to resolve import" / "does not provide an export named 'mapInterventoToTask'").

- [ ] **Step 3: Implementa il modulo**

Crea `lib/interventi/mappaInterventi.ts`:

```ts
import type { Task } from '@/utils/routing';
import type { InterventoRow } from '@/lib/interventi/interventiView';

/**
 * Riga della tabella `interventi` arricchita dei campi geo/extra necessari a
 * costruire un Task per la mappa. Estende InterventoRow (sola lettura) senza
 * modificarne la forma: interventiView.ts resta intatto (file caldo WP3c).
 */
export type InterventoGeoRow = InterventoRow & {
  lat: number | null;
  lng: number | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  codice_servizio: string | null;
  richiede_due_operatori: boolean | null;
  data: string;
};

/**
 * Mappa una riga `interventi` geocodificata nel tipo Task prodotto da
 * parseExcelToTasks, così che il codice di distribuzione della mappa funzioni
 * senza modifiche. Inverso di taskToIntervento (comune→citta,
 * matricola_contatore→matricola, intervento_tipo→attivita, codice_servizio→codice).
 */
export function mapInterventoToTask(row: InterventoGeoRow): Task {
  return {
    id: row.id,
    odl: row.odl ?? '',
    pdr: row.pdr ?? undefined,
    indirizzo: row.indirizzo ?? '',
    cap: row.cap ?? '',
    citta: row.comune ?? '',
    priorita: 0,
    fascia_oraria: row.fascia_oraria ?? '',
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    requiresTwoOperators: row.richiede_due_operatori ?? undefined,
    nominativo: row.nominativo ?? undefined,
    matricola: row.matricola_contatore ?? undefined,
    attivita: row.intervento_tipo ?? undefined,
    codice: row.codice_servizio ?? undefined,
  };
}

/** Una entry del piano: un operatore con i suoi task ordinati. */
export type PianoEntry = { staffId: string; tasks: Array<{ id: string }> };

/** Riga del payload verso POST /api/interventi/distribuzione. */
export type DistribuzioneRiga = { intervento_id: string; staff_id: string; ordine: number };

/**
 * Costruisce il payload di assegnazione dalla distribuzione mappa→operatori.
 * `ordine` è 1-based per operatore (posizione nel giro). Flatten su tutte le entry.
 */
export function buildDistribuzionePayload(piano: PianoEntry[]): DistribuzioneRiga[] {
  return piano.flatMap((entry) =>
    entry.tasks.map((task, i) => ({
      intervento_id: task.id,
      staff_id: entry.staffId,
      ordine: i + 1,
    })),
  );
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run lib/interventi/mappaInterventi.test.ts`
Expected: PASS (6 test verdi).

- [ ] **Step 5: Type-check e lint dei nuovi file**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add lib/interventi/mappaInterventi.ts lib/interventi/mappaInterventi.test.ts
git commit -m "feat(wp1): helper puri mappaInterventi (mapInterventoToTask, buildDistribuzionePayload)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: GET `/api/interventi/da-pianificare`

**Files:**
- Create: `app/api/interventi/da-pianificare/route.ts`

**Pattern di riferimento (sola lettura):** `lib/apiAuth.ts` (`requireUser`, costruzione `createRouteHandlerClient`), `app/api/interventi/riconsegna/sync/route.ts:9-22` (uso di `cookies()` + `createRouteHandlerClient`).

> Nota: le Route Handler nel repo non hanno unit test; la verifica è `tsc` + `lint`.

- [ ] **Step 1: Crea la route**

Crea `app/api/interventi/da-pianificare/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { mapInterventoToTask, type InterventoGeoRow } from '@/lib/interventi/mappaInterventi';

export const runtime = 'nodejs';

const COMMITTENTI_VALIDI = ['acea', 'italgas', 'altro'];
const COLONNE =
  'id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id, lat, lng, cap, pdr, matricola_contatore, intervento_tipo, codice_servizio, richiede_due_operatori, data';

/**
 * GET /api/interventi/da-pianificare?data=YYYY-MM-DD&committente=acea
 * Ritorna { interventi: Task[] } — gli interventi geocodificati del giorno con
 * stato 'da_assegnare'|'assegnato', nella forma prodotta da parseExcelToTasks.
 * Lettura con RLS (client di sessione, non supabaseAdmin).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const data = searchParams.get('data') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json(
        { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
        { status: 400 },
      );
    }
    const committenteParam = searchParams.get('committente') ?? 'acea';
    const committente = COMMITTENTI_VALIDI.includes(committenteParam) ? committenteParam : 'acea';

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const { data: rows, error } = await supabase
      .from('interventi')
      .select(COLONNE)
      .eq('data', data)
      .eq('committente', committente)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .in('stato', ['da_assegnare', 'assegnato']);
    if (error) throw error;

    const interventi = ((rows ?? []) as unknown as InterventoGeoRow[]).map(mapInterventoToTask);
    return NextResponse.json({ interventi });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento interventi.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/da-pianificare/route.ts
git commit -m "feat(wp1): GET /api/interventi/da-pianificare — sorgente interventi del giorno" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: POST `/api/interventi/distribuzione`

**Files:**
- Create: `app/api/interventi/distribuzione/route.ts`

**Pattern di riferimento (sola lettura):** `app/api/interventi/assegna/route.ts:42-82` (loop `pianificaAssegnazione` → patch → update + upsert `agenda_token`). Helper puri riusati: `lib/interventi/assegnazione.ts` (`pianificaAssegnazione`), `lib/interventi/agendaToken.ts` (`generaAgendaToken`), `lib/interventi/statoInterventi.ts` (`StatoIntervento`).

> Differenza rispetto ad `assegna`: scrive anche `ordine` (dal payload) e raccoglie più `staff_id` distinti (uno per assegnazione) per il token agenda, usando la `data` del body.

- [ ] **Step 1: Crea la route**

Crea `app/api/interventi/distribuzione/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { pianificaAssegnazione } from '@/lib/interventi/assegnazione';
import type { StatoIntervento } from '@/lib/interventi/statoInterventi';
import { generaAgendaToken } from '@/lib/interventi/agendaToken';

export const runtime = 'nodejs';

type Assegnazione = { intervento_id: string; staff_id: string; ordine: number };

function isAssegnazione(a: unknown): a is Assegnazione {
  if (!a || typeof a !== 'object') return false;
  const r = a as Record<string, unknown>;
  return (
    typeof r.intervento_id === 'string' && r.intervento_id.trim() !== '' &&
    typeof r.staff_id === 'string' && r.staff_id.trim() !== '' &&
    typeof r.ordine === 'number'
  );
}

/**
 * POST /api/interventi/distribuzione — applica la distribuzione mappa→interventi.
 * Body: { data: string; assegnazioni: { intervento_id, staff_id, ordine }[] }.
 * Riusa pianificaAssegnazione() e generaAgendaToken() (stati/transizioni/token
 * identici alla pipeline). Scrive staff_id, ordine, stato='assegnato', assegnato_at.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => ({}))) as { data?: unknown; assegnazioni?: unknown };
    const data =
      typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : null;
    if (!data) {
      return NextResponse.json(
        { error: 'Parametro data mancante o non valido (atteso YYYY-MM-DD).' },
        { status: 400 },
      );
    }
    const assegnazioni: Assegnazione[] = Array.isArray(body.assegnazioni)
      ? body.assegnazioni.filter(isAssegnazione)
      : [];
    if (assegnazioni.length === 0) {
      return NextResponse.json({ error: 'Nessuna assegnazione valida.' }, { status: 400 });
    }

    const ids = assegnazioni.map((a) => a.intervento_id);
    const { data: rows, error } = await supabaseAdmin.from('interventi').select('id, stato').in('id', ids);
    if (error) throw error;
    const byId = new Map<string, StatoIntervento>();
    for (const r of (rows ?? []) as Array<{ id: string; stato: StatoIntervento }>) byId.set(r.id, r.stato);

    let assegnati = 0;
    const scartati: Array<{ id: string; errore: string }> = [];
    const staffCoinvolti = new Set<string>();

    for (const a of assegnazioni) {
      const stato = byId.get(a.intervento_id);
      if (!stato) {
        scartati.push({ id: a.intervento_id, errore: 'Intervento non trovato' });
        continue;
      }
      const esito = pianificaAssegnazione(stato, a.staff_id);
      if (!esito.ok) {
        scartati.push({ id: a.intervento_id, errore: esito.errore });
        continue;
      }
      const { patch } = esito;
      const update: Record<string, unknown> = {
        staff_id: patch.staff_id,
        stato: patch.stato,
        ordine: a.ordine,
      };
      if (patch.assegnatoAt === 'set') update.assegnato_at = new Date().toISOString();
      else if (patch.assegnatoAt === 'clear') update.assegnato_at = null;
      if (patch.azzeraAvvio) {
        update.iniziato_at = null;
        update.chiuso_at = null;
      }
      const { error: ue } = await supabaseAdmin.from('interventi').update(update).eq('id', a.intervento_id);
      if (ue) throw new Error(`Update intervento ${a.intervento_id} fallito: ${ue.message}`);
      assegnati += 1;
      if (patch.staff_id) staffCoinvolti.add(patch.staff_id);
    }

    // Garantisce un token agenda per ogni (staff, giorno) coinvolto. Idempotente.
    if (staffCoinvolti.size > 0) {
      const tokenRows = Array.from(staffCoinvolti).map((staff_id) => ({
        staff_id,
        data,
        token: generaAgendaToken(),
      }));
      const { error: te } = await supabaseAdmin
        .from('agenda_token')
        .upsert(tokenRows, { onConflict: 'staff_id,data', ignoreDuplicates: true });
      if (te) throw new Error(`Generazione token agenda fallita: ${te.message}`);
    }

    return NextResponse.json({ assegnati, scartati });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore distribuzione.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/distribuzione/route.ts
git commit -m "feat(wp1): POST /api/interventi/distribuzione — sink assegnazione + token agenda" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Edit file CALDO `MappaOperatoriClient.tsx`

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

> ⚠️ **FILE CALDO.** Prima di editare: aggiorna `main` e ribasa il branch. Poi **RILEGGI** le sezioni indicate (le righe possono essere shiftate): usa le ancore di testo qui sotto, non i numeri di riga assoluti.

- [ ] **Step 1: Fetch + rebase su main**

```bash
git fetch origin
git rebase origin/main
```

Expected: rebase pulito (nessun conflitto). In caso di conflitto su `MappaOperatoriClient.tsx`, risolverlo preservando le modifiche in arrivo da `main`, poi `git rebase --continue`.

- [ ] **Step 2: Verifica le ancore nel file (sola lettura)**

Rileggi nel file `components/modules/mappa/MappaOperatoriClient.tsx` le ancore:
- import da `@/utils/routing` (riga ~10);
- blocco stato "Excel import" con `const [excelMode, setExcelMode] = useState(false);`;
- handler `handleFileChange` (contiene `setExcelMode(true);`);
- handler `clearExcel` (contiene `setExcelMode(false);`);
- handler `saveDistribution` (inizia con `if (!distribution || !selectedOps.length) return;`);
- blocco JSX del ternario `{!excelMode ? ( ... Carica Excel ... ) : ( ... Chiudi Excel ... )}`.

- [ ] **Step 3: Aggiungi l'import dell'helper**

Dopo l'import `import type { Task, OperatorBase, RouteResult } from '@/utils/routing';` aggiungi:

```ts
import { buildDistribuzionePayload } from '@/lib/interventi/mappaInterventi';
```

- [ ] **Step 4: Aggiungi lo stato `sorgente`**

Nel blocco "Excel import", subito dopo `const [excelMode, setExcelMode] = useState(false);`, aggiungi:

```ts
  const [sorgente, setSorgente] = useState<'excel' | 'interventi'>('excel');
```

- [ ] **Step 5: Marca la sorgente Excel in `handleFileChange`**

In `handleFileChange`, subito dopo la riga `setExcelMode(true);`, aggiungi:

```ts
    setSorgente('excel');
```

- [ ] **Step 6: Reset della sorgente in `clearExcel`**

In `clearExcel`, subito dopo la riga `setExcelMode(false);`, aggiungi:

```ts
    setSorgente('excel');
```

- [ ] **Step 7: Aggiungi l'handler `caricaInterventiDelGiorno`**

Subito dopo la definizione di `clearExcel` (dopo la sua chiusura `}, []);`), aggiungi:

```ts
  const caricaInterventiDelGiorno = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/interventi/da-pianificare?data=${planningDate}&committente=acea`,
      );
      const json = (await res.json().catch(() => ({}))) as { interventi?: Task[]; error?: string };
      if (!res.ok) {
        alert(`Caricamento interventi non riuscito — ${json.error ?? res.status}.`);
        return;
      }
      const interventi = json.interventi ?? [];
      if (interventi.length === 0) {
        alert(`Nessun intervento da pianificare per il ${planningDate}.`);
        return;
      }
      setExcelTasks(interventi);
      setExcelMode(true);
      setSorgente('interventi');
      setExcelOnlyManualAction(false);
      setRouteMode(false);
      setRouteResult(null);
      setGeocodingProgress(null);
      setDistribution(null);
      setUnassignedTasks([]);
      setSelectedExcelTaskId(null);
      setEditingTaskId(null);
      setEsecutorePins({});
      setEsecutoreWarnings([]);
      setSelectedOps([]);
    } catch {
      alert('Errore di rete nel caricamento degli interventi.');
    }
  }, [planningDate]);
```

- [ ] **Step 8: Branch su `sorgente` in `saveDistribution`**

In `saveDistribution`, subito dopo il guard `if (!distribution || !selectedOps.length) return;`, inserisci il branch (prima di `setSavingDistribution(true);`):

```ts
    if (sorgente === 'interventi') {
      setSavingDistribution(true);
      setSavedDistribution(false);
      try {
        const assegnazioni = buildDistribuzionePayload(distribution);
        const res = await fetch('/api/interventi/distribuzione', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: planningDate, assegnazioni }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          assegnati?: number;
          scartati?: Array<{ id: string; errore: string }>;
          error?: string;
        };
        if (!res.ok) {
          alert(`Distribuzione non riuscita — ${json.error ?? res.status}.`);
        } else {
          setSavedDistribution(true);
          const nScartati = json.scartati?.length ?? 0;
          alert(`${json.assegnati ?? 0} interventi assegnati${nScartati ? `, ${nScartati} scartati` : ''}.`);
        }
      } finally {
        setSavingDistribution(false);
      }
      return;
    }
```

Poi aggiungi `sorgente` all'array delle dipendenze del `useCallback` di `saveDistribution` (che termina con `}, [currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks]);` → diventa `}, [currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks, sorgente]);`).

- [ ] **Step 9: Aggiungi il pulsante "Carica interventi del giorno"**

Nel JSX, sostituisci il ramo `!excelMode` del ternario dei pulsanti (quello che mostra solo "Carica Excel") in modo da affiancare il nuovo pulsante. Il blocco diventa:

```tsx
            {!excelMode ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3 py-1.5 text-sm font-medium text-[var(--warning)] hover:opacity-90"
                >
                  Carica Excel
                </button>
                <button
                  type="button"
                  onClick={caricaInterventiDelGiorno}
                  className="rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-surface)] px-3 py-1.5 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-surface-muted)]"
                  title="Carica gli interventi geocodificati del giorno dal database"
                >
                  Carica interventi del giorno
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={clearExcel}
                className="rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)] px-3 py-1.5 text-sm font-medium text-[oklch(0.18_0.05_95)] hover:opacity-90"
              >
                Chiudi Excel
              </button>
            )}
```

- [ ] **Step 10: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 11: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(wp1): mappa — sorgente 'interventi del giorno' e salvataggio via distribuzione" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Gate finali e chiusura WP

- [ ] **Step 1: Gate completi verdi**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npm run lint`
Expected: nessun errore.
Run: `npm run test`
Expected: tutti i test verdi (inclusi i 6 nuovi di `mappaInterventi.test.ts`).

- [ ] **Step 2: Verifica accettazione (manuale, a cura dell'utente con `npm run dev`)**

Checklist di accettazione (NON avviare `npm run dev` da subagent — lo lancia l'utente):
1. GET `/api/interventi/da-pianificare?data=<giorno con interventi>&committente=acea` ritorna `{ interventi: Task[] }` validi (solo geocodificati, stato `da_assegnare`/`assegnato`).
2. Nella mappa: "Carica interventi del giorno" popola la lista; il pannello distribuzione compare (gli interventi hanno già lat/lng → `excelGeocoded >= 2`).
3. Distribuendo e salvando in sorgente "interventi": gli interventi risultano `assegnato` con `staff_id`/`ordine`/`assegnato_at`; esiste il token agenda per ogni `(staff_id, data)`; l'agenda `/r/[token]` mostra gli interventi.
4. Sorgente "excel": comportamento invariato (salvataggio `mappa_piani` + torre).

- [ ] **Step 3: Chiusura WP**

Verifica di essere sul branch corretto e allineato:

```bash
git fetch origin
git status -sb
git log --oneline origin/main..HEAD
```

Poi merge fast-forward in `main` ed eliminazione del branch (il **push lo lancia l'utente**):

```bash
git switch main
git merge --ff-only feat/wp1-mappa-interventi-del-giorno
# push: lo esegue l'utente (push diretto su main bloccato per l'assistant)
git branch -d feat/wp1-mappa-interventi-del-giorno
```

---

## Note di implementazione

- **Niente migration:** `interventi` e `agenda_token` esistono già; non creare file `.sql`.
- **`excelGeocoded`:** non va modificato. Conta i task con coordinate; gli interventi dal DB le hanno già → il pannello distribuzione appare senza ri-geocodifica.
- **`buildEsecutorePins` NON usato** per la sorgente "interventi": gli interventi DB non hanno colonna OPERATORE da auto-abbinare; la selezione operatori è manuale via il picker esistente.
- **`mappa_piani` intatto:** la sorgente "interventi" non scrive su `mappa_piani` né chiama `/api/mappa/piani/interventi`; quel flusso resta solo per la sorgente "excel".
