# Aggancio interventi aggiuntivi al gruppo rapportini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sì che gli interventi aggiunti (manuale/template) a un piano riaperto dal Riepilogo rapportini si aggancino agli stessi rapportini (link digitale + Excel) senza creare nuovi link e senza rimescolare le assegnazioni già fatte.

**Architecture:** Una funzione pura `appendTaskToOperator` aggiunge un task a un solo operatore preservando gli altri (niente ridistribuzione cieca). La modale manuale mostra solo gli operatori del gruppo riaperto; l'esecutore vuoto lascia il task "non assegnato" (assegnabile a mano dalla mappa). Il `Salva distribuzione` rigenera automaticamente le voci dei rapportini riusando i token esistenti (stesso link, risposte preservate).

**Tech Stack:** Next.js 15 (App Router), TypeScript 5 strict, React 19, Supabase, Leaflet, vitest. Nessuna nuova dipendenza (regola #3 `AGENTS.md`).

**Riferimento spec:** `docs/superpowers/specs/2026-06-05-aggancio-interventi-rapportini-design.md`

**Nota sul testing:** il progetto ha solo vitest per funzioni pure (nessun harness per componenti React: niente jsdom/testing-library). Quindi la **Task 1** ha test automatici reali; le Task 2–7 (modifiche a hook/JSX e route) si verificano con `npx tsc --noEmit`, `npm run build` e la checklist manuale (Task 8). Questo è esplicito e voluto.

**Baseline lint già rossa** (vedi memoria progetto): valutare il lint **solo sui file toccati**, l'obiettivo è "nessun nuovo problema".

---

### Task 1: Funzione pura `appendTaskToOperator` + test (TDD)

**Files:**
- Create: `utils/mappa/appendTask.ts`
- Test: `utils/mappa/appendTask.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/mappa/appendTask.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appendTaskToOperator, type RoutableEntry, type OptimizeFn } from './appendTask';
import type { Task } from '@/utils/routing/types';

function task(id: string, lat?: number, lng?: number): Task {
  return { id, odl: '', indirizzo: `via ${id}`, cap: '00100', citta: 'Roma', priorita: 0, fascia_oraria: '', lat, lng };
}

// optimize deterministico fittizio: non riordina, km = numero task, polyline dai task con coordinate.
const fakeOptimize: OptimizeFn = (tasks) => ({
  orderedTasks: tasks,
  totalDistanceKm: tasks.length,
  polyline: tasks.filter((t) => t.lat != null && t.lng != null).map((t) => ({ lat: t.lat!, lng: t.lng! })),
  schedule: [],
});

type Entry = RoutableEntry & { op: string; staffId: string; color: string; startAddress: string | null };

function entry(staffId: string, tasks: Task[]): Entry {
  return { op: staffId, staffId, color: '#000', startAddress: null, base: null, tasks, km: 0, polyline: [], schedule: [] };
}

describe('appendTaskToOperator', () => {
  it("aggiunge il task all'operatore giusto e ricalcola la sua rotta", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const out = appendTaskToOperator(dist, 1, task('b2'), fakeOptimize);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b1', 'b2']);
    expect(out[1].km).toBe(2);
  });

  it('preserva intatte le altre entry', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1')])];
    const out = appendTaskToOperator(dist, 1, task('b2'), fakeOptimize);
    expect(out[0]).toEqual(dist[0]);
  });

  it('non muta input (purezza)', () => {
    const dist = [entry('A', [task('a1')])];
    const snap = JSON.parse(JSON.stringify(dist));
    appendTaskToOperator(dist, 0, task('a2'), fakeOptimize);
    expect(dist).toEqual(snap);
  });

  it('indice fuori range → distribuzione invariata (stesso riferimento)', () => {
    const dist = [entry('A', [task('a1')])];
    expect(appendTaskToOperator(dist, 5, task('x'), fakeOptimize)).toBe(dist);
    expect(appendTaskToOperator(dist, -1, task('x'), fakeOptimize)).toBe(dist);
  });

  it('conserva i campi extra della entry (color, startAddress, staffId)', () => {
    const dist = [entry('A', [task('a1')])];
    const out = appendTaskToOperator(dist, 0, task('a2'), fakeOptimize);
    expect(out[0]).toMatchObject({ op: 'A', staffId: 'A', color: '#000', startAddress: null });
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/mappa/appendTask.test.ts`
Expected: FAIL — `Failed to resolve import "./appendTask"` (il modulo non esiste ancora).

- [ ] **Step 3: Implementa la funzione pura**

Create `utils/mappa/appendTask.ts`:

```ts
import type { OperatorBase, RouteResult, ScheduleEntry, Task } from '@/utils/routing/types';

/** Sottoinsieme di una entry di distribuzione che la funzione legge e aggiorna. */
export type RoutableEntry = {
  tasks: Task[];
  km: number;
  polyline: Array<{ lat: number; lng: number }>;
  base: OperatorBase | null;
  schedule?: ScheduleEntry[];
};

/** Firma compatibile con `optimizeRouteByFascia`. */
export type OptimizeFn = (tasks: Task[], base?: OperatorBase) => RouteResult;

/**
 * Aggiunge `task` all'operatore in posizione `toIdx`, ricalcolando SOLO la sua
 * rotta e lasciando intatte tutte le altre entry. Funzione pura: non muta l'input.
 * Difensivo: indice fuori range → ritorna la distribuzione originale invariata.
 */
export function appendTaskToOperator<E extends RoutableEntry>(
  distribution: E[],
  toIdx: number,
  task: Task,
  optimize: OptimizeFn,
): E[] {
  if (toIdx < 0 || toIdx >= distribution.length) return distribution;
  const next = distribution.map((entry) => ({ ...entry, tasks: [...entry.tasks] })) as E[];
  const target = next[toIdx];
  const tasks = [...target.tasks, task];
  const res = optimize(tasks, target.base ?? undefined);
  next[toIdx] = {
    ...target,
    tasks: res.orderedTasks,
    km: res.totalDistanceKm,
    polyline: res.polyline,
    schedule: res.schedule,
  } as E;
  return next;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/mappa/appendTask.test.ts`
Expected: PASS — 5 test verdi.

- [ ] **Step 5: Commit**

```bash
git add utils/mappa/appendTask.ts utils/mappa/appendTask.test.ts
git commit -m "feat(mappa): appendTaskToOperator (aggancio task a un operatore, preserva gli altri)"
```

---

### Task 2: GET rapportini espone `template_id` + tipo `RapportinoStato`

**Files:**
- Modify: `app/api/mappa/rapportini/route.ts:12-18`
- Modify: `utils/rapportini/links.ts:1-13`

- [ ] **Step 1: Aggiungi `template_id` alla query e al cast**

In `app/api/mappa/rapportini/route.ts`, sostituisci:

```ts
  const { data: raps } = await supabaseAdmin.from('rapportini')
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data').eq('piano_id', pianoId);
  const list = (raps ?? []) as Array<{
    id: string; staff_id: string; staff_name: string | null; token: string;
    stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string;
    submitted_at: string | null; data: string;
  }>;
```

con:

```ts
  const { data: raps } = await supabaseAdmin.from('rapportini')
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data, template_id').eq('piano_id', pianoId);
  const list = (raps ?? []) as Array<{
    id: string; staff_id: string; staff_name: string | null; token: string;
    stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string;
    submitted_at: string | null; data: string; template_id: string | null;
  }>;
```

(L'output usa già `...r`, quindi `template_id` viene incluso automaticamente.)

- [ ] **Step 2: Aggiungi `template_id` al tipo `RapportinoStato`**

In `utils/rapportini/links.ts`, sostituisci:

```ts
  submitted_at: string | null;
  url: string;
```

con:

```ts
  submitted_at: string | null;
  template_id?: string | null;
  url: string;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore.

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/rapportini/route.ts utils/rapportini/links.ts
git commit -m "feat(rapportini): esponi template_id nello stato rapportini del piano"
```

---

### Task 3: Al reopen preserva il template esistente

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — `caricaRapportini` (~1676), effetto template di default (~1687)

- [ ] **Step 1: `caricaRapportini` imposta `rapTemplateId` dal template esistente**

Sostituisci il corpo di `caricaRapportini`:

```ts
  const caricaRapportini = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
      const data = await res.json();
      setRapStato(Array.isArray(data) ? data : []);
    } catch {
      setRapStato([]);
    }
  }, []);
```

con:

```ts
  const caricaRapportini = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
      const data = await res.json();
      const list: RapportinoStato[] = Array.isArray(data) ? data : [];
      setRapStato(list);
      // Preserva il modello già usato dai rapportini esistenti: così la rigenerazione
      // non cambia il template e non crea link nuovi.
      const tpl = list.find((r) => r.template_id)?.template_id;
      if (tpl) setRapTemplateId(tpl);
    } catch {
      setRapStato([]);
    }
  }, []);
```

- [ ] **Step 2: l'effetto del template di default non sovrascrive un template già scelto**

Nell'effetto che carica i template (`/api/admin/rapportino-template`), sostituisci:

```ts
        const def = arr.find((t) => t.is_default) ?? arr[0];
        if (def) setRapTemplateId(def.id);
```

con:

```ts
        const def = arr.find((t) => t.is_default) ?? arr[0];
        // Non sovrascrivere un template già impostato (es. da un piano riaperto):
        // l'updater funzionale rende l'ordine di risoluzione delle fetch irrilevante.
        if (def) setRapTemplateId((cur) => cur || def.id);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): al reopen preserva il template dei rapportini esistenti"
```

---

### Task 4: La modale manuale mostra solo gli operatori del gruppo

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — render `ManualTaskModal` (~3294)

- [ ] **Step 1: Passa gli operatori del gruppo quando esiste una distribuzione**

Sostituisci:

```tsx
      {manualModalOpen && (
        <ManualTaskModal
          operators={operatorOptions.map((o) => ({ id: o.id, displayName: o.displayName }))}
          onClose={() => setManualModalOpen(false)}
          onAdd={addManualTask}
        />
      )}
```

con:

```tsx
      {manualModalOpen && (
        <ManualTaskModal
          operators={
            distribution && selectedOps.length > 0
              ? selectedOps.map((o) => ({ id: o.id, displayName: o.name }))
              : operatorOptions.map((o) => ({ id: o.id, displayName: o.displayName }))
          }
          onClose={() => setManualModalOpen(false)}
          onAdd={addManualTask}
        />
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): modale manuale limitata agli operatori del gruppo riaperto"
```

---

### Task 5: `addManualTask` — append all'operatore o non assegnato (niente ridistribuzione cieca)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — import (~10), `addManualTask` (~1909)

- [ ] **Step 1: Importa `appendTaskToOperator`**

Sotto l'import esistente da `@/utils/routing` (riga ~10), aggiungi:

```ts
import { appendTaskToOperator } from '@/utils/mappa/appendTask';
```

- [ ] **Step 2: Riscrivi la coda di `addManualTask`**

Sostituisci, da `const geocoded = await geocodeTask(task);` fino alla fine della `useCallback`:

```ts
    const geocoded = await geocodeTask(task);
    setExcelTasks((prev) => [...prev, geocoded]);
    setExcelMode(true);
    if (operator) {
      setEsecutorePins((prev) => ({ ...prev, [task.id]: operator.id }));
      setSelectedOps((prev) => {
        if (prev.some((o) => o.id === operator.id)) return prev;
        const isRepOnDay = operator.reperibileDates.includes(planningDate);
        const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
        const base = usesHome
          ? { lat: operator.homeLat!, lng: operator.homeLng! }
          : operator.startLat != null && operator.startLng != null
            ? { lat: operator.startLat, lng: operator.startLng }
            : null;
        const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;
        return [...prev, { id: operator.id, name: operator.displayName, qty: 0, base, startAddress }];
      });
    }
    if (distribution) distributeToOps();
  }, [operatorOptions, planningDate, distribution, distributeToOps]);
```

con:

```ts
    const geocoded = await geocodeTask(task);
    setExcelTasks((prev) => [...prev, geocoded]);
    setExcelMode(true);

    // Nessun esecutore → l'intervento resta NON assegnato: compare in "Non assegnate"
    // e sulla mappa (marker giallo), assegnabile a mano con assignUnassignedTask.
    if (!operator) {
      setUnassignedTasks((prev) => [...prev, geocoded]);
      return;
    }

    setEsecutorePins((prev) => ({ ...prev, [task.id]: operator.id }));

    // Operatore già nel gruppo (piano riaperto) → aggancia SOLO a lui, preservando
    // le assegnazioni degli altri (niente ridistribuzione cieca).
    const idx = distribution ? distribution.findIndex((d) => d.staffId === operator.id) : -1;
    if (distribution && idx >= 0) {
      setDistribution((prev) => (prev ? appendTaskToOperator(prev, idx, geocoded, optimizeRouteByFascia) : prev));
      return;
    }

    // Operatore non ancora nel gruppo (piano in costruzione) → aggiungilo e ridistribuisci.
    setSelectedOps((prev) => {
      if (prev.some((o) => o.id === operator.id)) return prev;
      const isRepOnDay = operator.reperibileDates.includes(planningDate);
      const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
      const base = usesHome
        ? { lat: operator.homeLat!, lng: operator.homeLng! }
        : operator.startLat != null && operator.startLng != null
          ? { lat: operator.startLat, lng: operator.startLng }
          : null;
      const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;
      return [...prev, { id: operator.id, name: operator.displayName, qty: 0, base, startAddress }];
    });
    if (distribution) distributeToOps();
  }, [operatorOptions, planningDate, distribution, distributeToOps]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "fix(mappa): intervento manuale aggancia un solo operatore (o resta non assegnato)"
```

---

### Task 6: `+ Aggiungi da template` → task non assegnati (niente ridistribuzione)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — `handleTemplateFileChange` (~1464)

- [ ] **Step 1: I task da template entrano come "non assegnati"**

Sostituisci:

```ts
      setTemplateTasks(geocoded);
      setTemplateGeocoding(null);

      if (distribution) {
        distributeToOps();
      }
```

con:

```ts
      // Il file template non ha colonna esecutore → i task entrano come NON assegnati
      // (assegnabili a mano dalla mappa), senza ridistribuire il piano esistente.
      // Restano nel pool (templateTasks → allTasks) per un'eventuale "Distribuisci".
      setTemplateTasks((prev) => [...prev, ...geocoded]);
      setUnassignedTasks((prev) => [...prev, ...geocoded]);
      setTemplateGeocoding(null);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore. (`setTemplateTasks` resta usato → nessun warning di variabile inutilizzata.)

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "fix(mappa): interventi da template entrano come non assegnati (assegnazione manuale)"
```

---

### Task 7: `saveDistribution` — auto-genera rapportini (stesso link) + avviso non assegnati + selettore template

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — `saveDistribution` (~1567-1668), gating selettore template (~2691)

- [ ] **Step 1: Avviso sui task non assegnati prima del salvataggio (ramo excel)**

In `saveDistribution`, individua il **ramo excel** (indentazione 4 spazi, NON quello dentro `if (sorgente === 'interventi')` che è a 6 spazi). Sostituisci (l'inclusione di `const operatori = ...` rende l'`old_string` univoco):

```ts
    setSavingDistribution(true);
    setSavedDistribution(false);
    try {
      const operatori = selectedOps.map((op, idx) => {
```

con:

```ts
    // Avviso: i task non assegnati non finiscono in alcun operatore del piano.
    if (unassignedTasks.length > 0) {
      const ok = window.confirm(
        `Ci sono ${unassignedTasks.length} interventi non assegnati: resteranno fuori dal piano finché non li assegni a un operatore. Salvare comunque?`,
      );
      if (!ok) return;
    }

    setSavingDistribution(true);
    setSavedDistribution(false);
    try {
      const operatori = selectedOps.map((op, idx) => {
```

- [ ] **Step 2: Auto-genera/aggiorna i rapportini dopo il salvataggio**

Dentro `if (res.ok) { ... }`, dopo il blocco `if (pid) { try { ... interventi ... } catch { ... } }` e prima della chiusura del blocco interno, aggiungi la generazione rapportini. Sostituisci:

```ts
          } catch {
            alert('Torre: errore di rete nella creazione interventi.');
          }
        }
      }
    } finally {
      setSavingDistribution(false);
    }
  }, [currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks, sorgente]);
```

con:

```ts
          } catch {
            alert('Torre: errore di rete nella creazione interventi.');
          }

          // Auto, sempre: genera/aggiorna i rapportini riusando i token esistenti
          // (stesso link digitale + Excel; risposte già date preservate dal merge lato server).
          // Best-effort: non blocca il salvataggio del piano.
          if (rapTemplateId) {
            try {
              const rg = await fetch('/api/mappa/rapportini/genera', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pianoId: pid, templateId: rapTemplateId }),
              });
              if (rg.ok) {
                // Ricarica lo stato rapportini (nVoci aggiornato) in modo deterministico,
                // senza dipendere da `caricaRapportini` (definito più sotto → eviti la TDZ nelle deps).
                try {
                  const r2 = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
                  const d2 = await r2.json();
                  setRapStato(Array.isArray(d2) ? d2 : []);
                } catch { /* l'effetto su savedDistribution ricarica comunque */ }
              } else {
                const ej = (await rg.json().catch(() => ({}))) as { error?: string };
                setRapError(ej.error ?? 'Aggiornamento rapportini non riuscito.');
              }
            } catch {
              setRapError("Errore di rete nell'aggiornamento dei rapportini.");
            }
          } else {
            setRapError('Nessun modello rapportino attivo: rapportini non aggiornati.');
          }
        }
      }
    } finally {
      setSavingDistribution(false);
    }
  }, [currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks, sorgente, unassignedTasks, rapTemplateId]);
```

- [ ] **Step 3: Mostra il selettore template/rigenera quando esiste un piano salvato**

Sostituisci l'apertura del blocco condizionale (riga ~2691):

```tsx
                          {savedDistribution && currentPianoId && (
```

con:

```tsx
                          {currentPianoId && (
```

(Così su un piano riaperto il selettore template e il pulsante manuale "Rigenera rapportini" restano visibili anche dopo aver aggiunto interventi, quando `savedDistribution` torna `false`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, nessun errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): salva distribuzione rigenera i rapportini (stesso link) + avviso non assegnati"
```

---

### Task 8: Verifica finale (build, lint, test) + checklist manuale

**Files:** nessuna modifica (solo verifiche).

- [ ] **Step 1: Test automatici**

Run: `npm run test`
Expected: PASS, inclusi i 5 test di `utils/mappa/appendTask.test.ts`. Nessun test rotto.

- [ ] **Step 2: Lint sui file toccati (no nuovi problemi)**

Run: `npx eslint utils/mappa/appendTask.ts utils/mappa/appendTask.test.ts components/modules/mappa/MappaOperatoriClient.tsx app/api/mappa/rapportini/route.ts utils/rapportini/links.ts`
Expected: nessun NUOVO errore introdotto dalle nostre modifiche (la baseline del repo è già rossa altrove; valutare solo i nostri file).

- [ ] **Step 3: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori di tipo/compilazione.

- [ ] **Step 4: Checklist manuale sull'anteprima Vercel**

Da eseguire dopo il push (anteprima HTTPS), seguendo il flusso reale:

1. Riepilogo rapportini → **Riapri** un gruppo con rapportini già generati → la pianificazione si ricarica con gli operatori e i task del piano.
2. **+ Aggiungi manuale** → la tendina **Esecutore mostra solo gli operatori del gruppo** (non tutto il DB).
3. Aggiungi con un operatore del gruppo → l'intervento entra **solo** in quell'operatore; gli altri operatori e i loro task **restano invariati**.
4. **+ Aggiungi manuale** con **Esecutore vuoto** → l'intervento appare in **"Non assegnate"** e come marker giallo → assegnalo a mano dalla mappa/lista.
5. **+ Aggiungi attività da template** (file) → i task entrano come "Non assegnate".
6. **Salva distribuzione** → con task non assegnati compare l'avviso di conferma.
7. Dopo il salvataggio: il link del rapportino dell'operatore è **lo stesso** di prima (token invariato), l'**Excel** scaricato dal Riepilogo contiene la nuova voce, e le **risposte già compilate** sono intatte.
8. Verifica che **non sia comparso un nuovo operatore/nuovo link** nel Riepilogo.

- [ ] **Step 5: Finalizzazione branch**

Quando la checklist manuale è OK e l'utente conferma: usa la skill `superpowers:finishing-a-development-branch` per il merge ff in `main`, push ed eliminazione del branch.

---

## Riepilogo file toccati

```
Nuovi:
  utils/mappa/appendTask.ts
  utils/mappa/appendTask.test.ts
Modificati:
  app/api/mappa/rapportini/route.ts        (GET: + template_id)
  utils/rapportini/links.ts                (RapportinoStato: + template_id?)
  components/modules/mappa/MappaOperatoriClient.tsx
    - import appendTaskToOperator
    - caricaRapportini (imposta rapTemplateId dal template esistente)
    - effetto template default (updater funzionale, non sovrascrive)
    - render ManualTaskModal (operatori = gruppo)
    - addManualTask (append all'operatore / non assegnato)
    - handleTemplateFileChange (template → non assegnati)
    - saveDistribution (auto-genera rapportini + avviso non assegnati)
    - gating selettore template (currentPianoId)
```

Nessuna modifica a `genera/route.ts`, `export/route.ts`, `piani/route.ts` (già corretti per lo scopo).
