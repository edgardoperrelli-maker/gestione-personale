# Elimina intervento in pianificazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un pulsante **Elimina** accanto ad Annulla nella card del task in pianificazione, che rimuove l'intervento in modo totale e definitivo (sparisce dal rapportino dell'operatore e dall'intervento canonico).

**Architecture:** Elimina rimuove il task dalla distribuzione lato client; al *Salva* la pipeline esistente (`sincronizzaRapportini` ricostruisce le voci, `ensureInterventiForPiano` rigenera gli interventi) fa sparire voce + intervento "assegnato". Per i task **già annullati** (intervento canonico terminale, preservato in rigenerazione) un passo server **esplicito** nel PUT del piano cancella l'intervento canonico per identità, senza toccare l'invariante della rigenerazione.

**Tech Stack:** Next.js (App Router, route handlers), React (client component), Supabase JS, TypeScript, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-10-elimina-intervento-pianificazione-design.md](../specs/2026-06-10-elimina-intervento-pianificazione-design.md)

---

## File Structure

| File | Responsabilità | Tipo |
|------|----------------|------|
| `lib/interventi/planInterventiForPiano.ts` | esporta `identitaIntervento`; nuovo `idAnnullatiDaEliminare` (selezione pura degli id da cancellare) | Modify |
| `lib/interventi/planInterventiForPiano.test.ts` | test del nuovo helper | Modify |
| `utils/mappa/appendTask.ts` | nuovo `removeTaskFromOperator` (mutazione pura della distribuzione + ricalcolo rotta) | Modify |
| `utils/mappa/appendTask.test.ts` | test del nuovo helper | Modify |
| `app/api/mappa/piani/route.ts` | PUT accetta `eliminati` e cancella gli interventi annullati orfani | Modify |
| `components/modules/mappa/MappaOperatoriClient.tsx` | stato `eliminatiAnnullati`, handler `eliminaTask`, pulsante Elimina, payload Salva | Modify |

---

### Task 1: Helper puri `identitaIntervento` (export) + `idAnnullatiDaEliminare`

**Files:**
- Modify: `lib/interventi/planInterventiForPiano.ts`
- Test: `lib/interventi/planInterventiForPiano.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/interventi/planInterventiForPiano.test.ts`, aggiorna l'import in cima e aggiungi il `describe` in fondo al file (dopo la chiusura del `describe('planInterventi', ...)`):

```typescript
import { planInterventi, identitaIntervento, idAnnullatiDaEliminare } from './planInterventiForPiano';
```

```typescript
describe('idAnnullatiDaEliminare', () => {
  it('seleziona solo gli annullati con identità tra le chiavi eliminate', () => {
    const esistenti = [
      { id: 'a', odl: 'ODL1', stato: 'annullato' },
      { id: 'b', odl: 'ODL2', stato: 'annullato' },
      { id: 'c', odl: 'ODL3', stato: 'assegnato' },
    ];
    const keys = new Set([identitaIntervento({ odl: 'ODL1' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual(['a']);
  });

  it('non tocca gli assegnati anche se la loro identità è nelle chiavi', () => {
    const esistenti = [{ id: 'c', odl: 'ODL3', stato: 'assegnato' }];
    const keys = new Set([identitaIntervento({ odl: 'ODL3' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual([]);
  });

  it('identità composta senza odl (indirizzo+matricola)', () => {
    const esistenti = [
      { id: 'm', odl: null, stato: 'annullato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
    ];
    const keys = new Set([identitaIntervento({ odl: null, matricola_contatore: 'M1', indirizzo: 'Via Roma 1' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual(['m']);
  });

  it('set vuoto → nessuna cancellazione', () => {
    const esistenti = [{ id: 'a', odl: 'ODL1', stato: 'annullato' }];
    expect(idAnnullatiDaEliminare(esistenti, new Set<string>())).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: FAIL — `identitaIntervento`/`idAnnullatiDaEliminare` non esportati (import error).

- [ ] **Step 3: Esporta `identitaIntervento` e implementa `idAnnullatiDaEliminare`**

In `lib/interventi/planInterventiForPiano.ts`, aggiungi `export` alla funzione esistente:

```typescript
export function identitaIntervento(r: {
```

E aggiungi questa funzione subito DOPO `identitaIntervento` (prima di `export function planInterventi`):

```typescript
/**
 * Id degli interventi canonici da cancellare per un'azione ESPLICITA di "Elimina" in
 * pianificazione: tra gli esistenti, solo gli ANNULLATI la cui identità è tra le chiavi
 * inviate dall'utente. Separato da `planInterventi` per NON intaccare l'invariante
 * "in rigenerazione gli annullati non si cancellano mai".
 */
export function idAnnullatiDaEliminare(
  esistenti: InterventoEsistente[],
  chiaviEliminate: Set<string>,
): string[] {
  return esistenti
    .filter((e) => e.stato === 'annullato')
    .filter((e) => {
      const k = identitaIntervento(e);
      return k != null && chiaviEliminate.has(k);
    })
    .map((e) => e.id);
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: PASS (tutti, inclusi i preesistenti di `planInterventi`).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/planInterventiForPiano.ts lib/interventi/planInterventiForPiano.test.ts
git commit -m "feat(interventi): idAnnullatiDaEliminare + export identitaIntervento"
```

---

### Task 2: Helper puro `removeTaskFromOperator`

**Files:**
- Modify: `utils/mappa/appendTask.ts`
- Test: `utils/mappa/appendTask.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `utils/mappa/appendTask.test.ts`, aggiorna l'import in cima e aggiungi il `describe` in fondo:

```typescript
import { appendTaskToOperator, removeTaskFromOperator, type RoutableEntry, type OptimizeFn } from './appendTask';
```

```typescript
describe('removeTaskFromOperator', () => {
  it("rimuove dal giusto operatore e ricalcola la sua rotta", () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1'), task('b2')])];
    const out = removeTaskFromOperator(dist, 1, 'b1', fakeOptimize);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['b2']);
    expect(out[1].km).toBe(1);
  });

  it('operatore senza più task → rotta azzerata', () => {
    const dist = [entry('A', [task('a1')])];
    const out = removeTaskFromOperator(dist, 0, 'a1', fakeOptimize);
    expect(out[0].tasks).toEqual([]);
    expect(out[0].km).toBe(0);
    expect(out[0].polyline).toEqual([]);
    expect(out[0].schedule).toEqual([]);
  });

  it('preserva intatte le altre entry', () => {
    const dist = [entry('A', [task('a1')]), entry('B', [task('b1'), task('b2')])];
    const out = removeTaskFromOperator(dist, 1, 'b1', fakeOptimize);
    expect(out[0]).toEqual(dist[0]);
  });

  it('non muta input (purezza)', () => {
    const dist = [entry('A', [task('a1'), task('a2')])];
    const snap = JSON.parse(JSON.stringify(dist));
    removeTaskFromOperator(dist, 0, 'a1', fakeOptimize);
    expect(dist).toEqual(snap);
  });

  it('indice fuori range o task assente → stesso riferimento', () => {
    const dist = [entry('A', [task('a1')])];
    expect(removeTaskFromOperator(dist, 5, 'a1', fakeOptimize)).toBe(dist);
    expect(removeTaskFromOperator(dist, 0, 'zzz', fakeOptimize)).toBe(dist);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run utils/mappa/appendTask.test.ts`
Expected: FAIL — `removeTaskFromOperator` non esportato (import error).

- [ ] **Step 3: Implementa `removeTaskFromOperator`**

In `utils/mappa/appendTask.ts`, aggiungi in fondo al file:

```typescript
/**
 * Rimuove il task `taskId` dall'operatore in posizione `opIdx`, ricalcolando SOLO la sua
 * rotta. Se l'operatore resta senza task, azzera la rotta (km 0, polyline/schedule vuoti).
 * Funzione pura: non muta l'input. Difensivo: indice fuori range o task assente → ritorna
 * la distribuzione originale invariata (stesso riferimento).
 */
export function removeTaskFromOperator<E extends RoutableEntry>(
  distribution: E[],
  opIdx: number,
  taskId: string,
  optimize: OptimizeFn,
): E[] {
  if (opIdx < 0 || opIdx >= distribution.length) return distribution;
  const idx = distribution[opIdx].tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return distribution;
  const next = distribution.map((entry) => ({ ...entry, tasks: [...entry.tasks] })) as E[];
  const target = next[opIdx];
  target.tasks.splice(idx, 1);
  if (target.tasks.length >= 1) {
    const res = optimize(target.tasks, target.base ?? undefined);
    next[opIdx] = {
      ...target,
      tasks: res.orderedTasks,
      km: res.totalDistanceKm,
      polyline: res.polyline,
      schedule: res.schedule,
    } as E;
  } else {
    next[opIdx] = { ...target, tasks: [], km: 0, polyline: [], schedule: [] } as E;
  }
  return next;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run utils/mappa/appendTask.test.ts`
Expected: PASS (tutti, inclusi i preesistenti di `appendTaskToOperator`).

- [ ] **Step 5: Commit**

```bash
git add utils/mappa/appendTask.ts utils/mappa/appendTask.test.ts
git commit -m "feat(mappa): removeTaskFromOperator (rimozione task + ricalcolo rotta)"
```

---

### Task 3: PUT del piano — cancellazione esplicita degli annullati eliminati

**Files:**
- Modify: `app/api/mappa/piani/route.ts`

Nota: route handler senza infrastruttura di test unit; la logica di selezione è già coperta da Task 1 (`idAnnullatiDaEliminare`). Qui è solo wiring; verifica manuale in Task 6.

- [ ] **Step 1: Aggiungi l'import dell'helper**

In cima a `app/api/mappa/piani/route.ts`, dopo l'import di `rulePayload`:

```typescript
import { idAnnullatiDaEliminare, type InterventoEsistente } from '@/lib/interventi/planInterventiForPiano';
```

- [ ] **Step 2: Leggi `eliminati` dal body del PUT**

Nella funzione `PUT`, sostituisci la riga di destructuring del body:

```typescript
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti, manualiLiberi } = body;
```

con:

```typescript
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti, manualiLiberi, eliminati } = body;
```

- [ ] **Step 3: Cancella gli interventi annullati eliminati dall'utente**

Nella funzione `PUT`, subito DOPO l'insert degli operatori (la riga `if (eOp) throw new Error(eOp.message);` che segue `mappa_piani_operatori.insert(opRows)`), inserisci:

```typescript
    // Elimina definitiva (azione utente in pianificazione): cancella gli interventi canonici
    // ANNULLATI il cui task è stato rimosso dal piano. Scoped a created_from_mappa di QUESTO
    // piano e SOLO alle identità inviate dal client → NON intacca l'invariante della
    // rigenerazione ("gli annullati non si cancellano mai in rigenerazione").
    const chiaviEliminate: string[] = Array.isArray(eliminati)
      ? eliminati.filter((k: unknown): k is string => typeof k === 'string')
      : [];
    if (chiaviEliminate.length > 0) {
      const { data: ann } = await supabaseAdmin
        .from('interventi')
        .select('id, odl, stato, matricola_contatore, indirizzo, intervento_tipo')
        .eq('piano_id', id)
        .eq('created_from_mappa', true)
        .eq('stato', 'annullato');
      const ids = idAnnullatiDaEliminare((ann ?? []) as InterventoEsistente[], new Set(chiaviEliminate));
      if (ids.length > 0) {
        const { error: eDel } = await supabaseAdmin.from('interventi').delete().in('id', ids);
        if (eDel) console.error('[PUT /api/mappa/piani] elimina annullati:', eDel.message);
      }
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore in `app/api/mappa/piani/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/mappa/piani/route.ts
git commit -m "feat(piani): PUT cancella gli interventi annullati eliminati dall'utente"
```

---

### Task 4: Client — pulsante Elimina, handler, stato e payload

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

Nota: componente client senza test unit; la logica pura è coperta da Task 1 e 2. Verifica manuale in Task 6.

- [ ] **Step 1: Aggiungi gli import**

In `components/modules/mappa/MappaOperatoriClient.tsx`, aggiungi (vicino agli altri import in cima al file):

```typescript
import { removeTaskFromOperator } from '@/utils/mappa/appendTask';
import { identitaIntervento } from '@/lib/interventi/planInterventiForPiano';
```

- [ ] **Step 2: Aggiungi lo stato `eliminatiAnnullati`**

Subito dopo la dichiarazione `const [distribution, setDistribution] = useState<DistEntry[] | null>(` … `);` (intorno a riga 680), aggiungi:

```typescript
  // Identità degli interventi GIÀ annullati eliminati dall'utente: inviate al Salva per
  // cancellare anche l'intervento canonico (i terminali sono preservati dalla rigenerazione).
  const [eliminatiAnnullati, setEliminatiAnnullati] = useState<string[]>([]);
```

- [ ] **Step 3: Aggiungi l'handler `eliminaTask`**

Subito dopo la fine di `toggleAnnullaTask` (la riga `}, [distribution]);` che chiude `toggleAnnullaTask`, intorno a riga 2138), aggiungi:

```typescript
  // Elimina definitiva: rimuove il task dal piano (al Salva sparisce voce + intervento).
  // Per i task GIÀ annullati registra l'identità, così il Salva cancella anche l'intervento canonico.
  const eliminaTask = useCallback((taskId: string, opIdx: number) => {
    if (!distribution) return;
    const t = distribution[opIdx]?.tasks.find((x) => x.id === taskId);
    if (!t) return;
    if (!window.confirm("Eliminare definitivamente questo intervento?\nSparirà dal rapportino dell'operatore e non sarà recuperabile.\nL'effetto si applica al Salva.")) return;
    if (t.annullato) {
      const chiave = identitaIntervento({
        odl: t.odl || null,
        matricola_contatore: t.matricola ?? null,
        indirizzo: t.indirizzo ?? null,
        intervento_tipo: t.attivita ?? null,
      });
      if (chiave) setEliminatiAnnullati((prev) => (prev.includes(chiave) ? prev : [...prev, chiave]));
    }
    setDistribution(removeTaskFromOperator(distribution, opIdx, taskId, optimizeRouteByFascia));
  }, [distribution]);
```

- [ ] **Step 4: Aggiungi il pulsante Elimina nella card del task**

In `components/modules/mappa/MappaOperatoriClient.tsx`, individua il blocco del pulsante "Annulla/Ripristina" nella card del task assegnato (intorno a riga 3074):

```tsx
                              {t.stato !== 'completato' && (
                                <button
                                  type="button"
                                  onClick={() => toggleAnnullaTask(t.id, activeOpIdx)}
                                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${t.annullato ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]' : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--danger)] hover:text-[var(--danger)]'}`}
                                >
                                  {t.annullato ? 'Ripristina' : 'Annulla'}
                                </button>
                              )}
```

Subito DOPO la chiusura `)}` di quel blocco, aggiungi:

```tsx
                              {t.stato !== 'completato' && (
                                <button
                                  type="button"
                                  onClick={() => eliminaTask(t.id, activeOpIdx)}
                                  className="shrink-0 rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-text-subtle)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                >
                                  Elimina
                                </button>
                              )}
```

- [ ] **Step 5: Inserisci `eliminati` nel payload del Salva e azzera dopo il salvataggio**

In `saveDistribution`, nel ramo non-`interventi` (intorno a riga 1692), aggiungi `eliminati` all'oggetto `payload`:

```typescript
      const payload = {
        data: planningDate,
        territorio: selectedPlanningTerritory?.name ?? null,
        note: '',
        stato: 'confermato',
        operatori,
        regole: manualRules,
        lucchetti: operatorLocks,
        manualiLiberi: operatorFreeLane,
        eliminati: eliminatiAnnullati,
      };
```

E subito dopo `setSavedDistribution(true);` (nel `if (res.ok)`, intorno a riga 1718), aggiungi:

```typescript
        setEliminatiAnnullati([]);
```

- [ ] **Step 6: Typecheck + lint sui file toccati**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore in `MappaOperatoriClient.tsx`.

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx utils/mappa/appendTask.ts lib/interventi/planInterventiForPiano.ts app/api/mappa/piani/route.ts`
Expected: nessun nuovo problema introdotto dai file modificati (la baseline del repo è già rossa — confronta solo le righe toccate).

- [ ] **Step 7: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): pulsante Elimina intervento in pianificazione"
```

---

### Task 5: Suite di test completa (regressione)

**Files:** nessuna modifica — solo esecuzione.

- [ ] **Step 1: Esegui l'intera suite Vitest**

Run: `npx vitest run`
Expected: PASS. In particolare verdi `lib/interventi/planInterventiForPiano.test.ts`, `utils/mappa/appendTask.test.ts`, e nessuna regressione su `lib/interventi/sincronizzaRapportini.test.ts`.

- [ ] **Step 2: Se qualcosa fallisce, correggi prima di proseguire**

Diagnostica il fallimento (non aggirarlo). Correggi, ri-esegui `npx vitest run` fino al verde. Commit della correzione se necessario.

---

### Task 6: Verifica manuale (smoke) e chiusura

**Files:** nessuna modifica — verifica in app reale.

- [ ] **Step 1: Avvia l'app e apri la pianificazione**

Run: `npm run dev` → apri `/hub/mappa` (vista *Pianifica indirizzi*), genera/riapri un piano con almeno un operatore e qualche intervento.

- [ ] **Step 2: Caso "task attivo"**

Nella card di un task **attivo** (non completato), verifica che compaia **Elimina** accanto ad Annulla. Premi Elimina → compare la conferma → conferma → il task sparisce dalla lista e la rotta dell'operatore si aggiorna. Premi **Salva distribuzione** → riapri il link rapportino dell'operatore e verifica che la voce **non** ci sia più; verifica in **Live** che l'intervento non compaia.

- [ ] **Step 3: Caso "task già annullato"**

Su un altro task premi **Annulla** e **Salva** (deve apparire barrato all'operatore). Poi premi **Elimina** sullo stesso task → conferma → **Salva**. Verifica che la voce sparisca dal rapportino **e** che l'intervento annullato non resti in **Live**/riepiloghi (nessun fantasma).

- [ ] **Step 4: Caso "completato"**

Verifica che su un intervento già **completato** (Fatto/Non fatto dall'operatore) il pulsante **Elimina** **non** compaia (come Annulla).

- [ ] **Step 5: Non-regressione interventi manuali operatore**

Se possibile, su un rapportino con un intervento **manuale aggiunto dall'operatore** (con foto), esegui un Salva del piano e verifica che quella voce manuale **resti** (non venga toccata dall'Elimina/Salva).

- [ ] **Step 6: Chiusura branch**

Invoca la skill `superpowers:finishing-a-development-branch` per decidere merge/PR del branch `feat/elimina-intervento-pianificazione`.

---

## Self-Review (compilata)

- **Copertura spec:** pulsante Elimina accanto ad Annulla (Task 4) ✓; rimozione totale al Salva — voce via `sincronizzaRapportini` + intervento "assegnato" via `ensureInterventiForPiano` (pipeline esistente) e intervento "annullato" via Task 3 ✓; conferma + blocco completati (Task 4) ✓; disponibile anche sugli annullati (Task 3+4) ✓; passo server separato che non tocca l'invariante (Task 1 helper isolato + Task 3 nel PUT, non in `planInterventi`/`ensureInterventiForPiano`) ✓; non nei "Non assegnati" (Task 4 tocca solo la card assegnati) ✓; nessuna SQL/migration ✓.
- **Placeholder:** nessun TBD/TODO; tutti gli step hanno codice/comando concreto.
- **Coerenza tipi:** `identitaIntervento(arg)` / `idAnnullatiDaEliminare(esistenti, Set)` / `removeTaskFromOperator(dist, opIdx, taskId, optimize)` / stato `eliminatiAnnullati: string[]` / chiave payload `eliminati` — usati in modo coerente tra Task 1→4. `InterventoEsistente` e `DistEntry`/`RoutableEntry` riusati dai moduli esistenti.

---

## Execution Handoff

Vedi sotto per la scelta del metodo di esecuzione.
