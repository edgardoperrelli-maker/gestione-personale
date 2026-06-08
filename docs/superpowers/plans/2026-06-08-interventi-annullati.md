# Interventi annullati nei rapportini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'ufficio di annullare/ripristinare interventi dalla pianificazione; gli annullati restano nel rapportino digitale ma rossi, non cliccabili, e non bloccano l'invio.

**Architecture:** Riusa il flusso "Sposta → Salva → genera". Un campo `Task.annullato` (client) si propaga al Salva: l'intervento diventa `stato='annullato'`, la voce riceve `_annullato` in `raw_json` (come `_nuovo`). Il digitale legge il flag dalla voce (snapshot, niente join su `intervento_id`). Nessuna migrazione.

**Tech Stack:** Next.js 15, Supabase JS, React 19, vitest (test co-locati `*.test.ts`).

**Comando test:** `npx vitest run <path>` (dalla cartella del worktree).

---

## File Structure

| File | Responsabilità |
|------|----------------|
| `utils/routing/types.ts` | aggiungere `Task.annullato?` |
| `lib/interventi/taskToIntervento.ts` | `stato` = `'annullato'` se task annullato |
| `lib/interventi/planInterventiForPiano.ts` | preservare solo i `completato` (gli `annullato` da-mappa seguono il task → reversibili) |
| `utils/rapportini/buildVoci.ts` | `taskToVoce` propaga `annullato` |
| `lib/interventi/sincronizzaRapportini.ts` | scrive `_annullato` in `raw_json` della voce |
| `utils/rapportini/riepilogo.ts` | `daFare`/esiti escludono le voci annullate |
| `app/r/[token]/page.tsx` | mappa `raw_json._annullato` → `Voce.annullato` |
| `components/modules/rapportini/RapportinoForm.tsx` | riga voce rossa/badge/non cliccabile + invio |
| `components/modules/mappa/MappaOperatoriClient.tsx` | toggle Annulla/Ripristina + stile riga |

---

## Task 1: `Task.annullato` + `taskToIntervento`

**Files:**
- Modify: `utils/routing/types.ts`
- Modify: `lib/interventi/taskToIntervento.ts`
- Test: `lib/interventi/taskToIntervento.test.ts`

- [ ] **Step 1: Aggiungi il campo al tipo `Task`**

In `utils/routing/types.ts`, dentro `interface Task`, dopo `esito?: string | null;` aggiungi:
```ts
  /** Marcato annullato dall'ufficio in pianificazione (non da fare; voce rossa nel rapportino). */
  annullato?: boolean;
```

- [ ] **Step 2: Scrivi il test che fallisce**

In `lib/interventi/taskToIntervento.test.ts`, aggiungi (adatta gli import al file esistente):
```ts
import { describe, it, expect } from 'vitest';
import { taskToIntervento } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';

const ctx = { committente: 'acea', data: '2026-06-10', staffId: 's1', pianoId: 'p1', territorioId: null };
const baseTask = (over: Partial<Task> = {}): Task => ({ id: 't1', odl: 'ODL1', indirizzo: 'Via 1', cap: '00100', citta: 'Roma', priorita: 0, fascia_oraria: '', ...over });

describe('taskToIntervento — stato annullato', () => {
  it('task annullato → intervento stato "annullato"', () => {
    expect(taskToIntervento(baseTask({ annullato: true }), ctx).stato).toBe('annullato');
  });
  it('task normale → intervento stato "assegnato"', () => {
    expect(taskToIntervento(baseTask(), ctx).stato).toBe('assegnato');
  });
});
```

- [ ] **Step 3: Esegui — deve fallire**

Run: `npx vitest run lib/interventi/taskToIntervento.test.ts`
Expected: FAIL (stato è sempre `'assegnato'`).

- [ ] **Step 4: Implementa**

In `lib/interventi/taskToIntervento.ts`:
- nel tipo `InterventoDaMappa`, cambia `stato: 'assegnato';` in `stato: 'assegnato' | 'annullato';`
- nel `return` di `taskToIntervento`, cambia `stato: 'assegnato',` in `stato: task.annullato ? 'annullato' : 'assegnato',`

- [ ] **Step 5: Esegui — deve passare**

Run: `npx vitest run lib/interventi/taskToIntervento.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add utils/routing/types.ts lib/interventi/taskToIntervento.ts lib/interventi/taskToIntervento.test.ts
git commit -m "feat(interventi): Task.annullato → intervento stato annullato"
```

---

## Task 2: `planInterventi` — annullati da-mappa reversibili

Oggi `planInterventi` preserva i terminali (`completato`/`annullato`). Perché il ripristino funzioni, gli `annullato` (che per i piani arrivano solo dall'ufficio, l'operatore non annulla) devono **seguire il task**: preservare solo i `completato`, ricreare gli altri dai task correnti.

**Files:**
- Modify: `lib/interventi/planInterventiForPiano.ts`
- Test: `lib/interventi/planInterventiForPiano.test.ts`

- [ ] **Step 1: Test che fallisce**

In `lib/interventi/planInterventiForPiano.test.ts` aggiungi un caso:
```ts
it('un intervento annullato esistente NON viene preservato: segue i task (reversibile)', () => {
  const out = planInterventi({
    piano: { data: '2026-06-10' }, pianoId: 'p1', territorioId: null,
    operatori: [{ staff_id: 's1', tasks: [{ id: 't1', odl: 'ODL1', indirizzo: 'V', cap: '0', citta: 'R', priorita: 0, fascia_oraria: '' }] }],
    esistenti: [{ id: 'i1', odl: 'ODL1', stato: 'annullato' }],
  });
  // l'annullato esistente è tra gli eliminabili (sarà ricreato dal task come 'assegnato')
  expect(out.idDaEliminare).toContain('i1');
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: FAIL (oggi `i1` è preservato perché `annullato` è terminale).

- [ ] **Step 3: Implementa**

In `lib/interventi/planInterventiForPiano.ts`, cambia la definizione:
```ts
const isTerminale = (stato: string) => stato === 'completato' || stato === 'annullato';
```
in:
```ts
// Solo i 'completato' sono esiti reali da preservare. Gli 'annullato' dei piani arrivano
// dall'ufficio (in pianificazione) e devono seguire i task → reversibili.
const isTerminale = (stato: string) => stato === 'completato';
```

- [ ] **Step 4: Esegui suite del file — deve passare (incluso il nuovo caso, senza regressioni)**

Run: `npx vitest run lib/interventi/planInterventiForPiano.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/planInterventiForPiano.ts lib/interventi/planInterventiForPiano.test.ts
git commit -m "feat(interventi): annullati da-mappa seguono i task (reversibili), preserva solo completati"
```

---

## Task 3: voce `_annullato` (buildVoci + motore)

**Files:**
- Modify: `utils/rapportini/buildVoci.ts`
- Modify: `lib/interventi/sincronizzaRapportini.ts`
- Test: `lib/interventi/sincronizzaRapportini.test.ts`

- [ ] **Step 1: `taskToVoce` propaga `annullato`**

In `utils/rapportini/buildVoci.ts`:
- nel tipo `VoceSnapshot`, dopo `raw_json: unknown;` aggiungi `annullato?: boolean;`
- in `taskToVoce`, nel return, dopo `raw_json: task,` aggiungi `annullato: Boolean(task.annullato),`

- [ ] **Step 2: il motore scrive `_annullato` nel raw_json della voce**

In `lib/interventi/sincronizzaRapportini.ts`, nel map dell'insert voci, cambia la riga:
```ts
        const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo };
```
in:
```ts
        const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo, _annullato: Boolean(v.annullato) };
```

- [ ] **Step 3: Test motore (estende il fake esistente)**

In `lib/interventi/sincronizzaRapportini.test.ts`, aggiungi in fondo:
```ts
describe('sincronizzaRapportini — voce annullata', () => {
  it('un task annullato produce una voce con raw_json._annullato = true', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1', annullato: true }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1') as { raw_json?: { _annullato?: boolean } } | undefined;
    expect(voce?.raw_json?._annullato).toBe(true);
  });
});
```

- [ ] **Step 4: Esegui — deve passare**

Run: `npx vitest run lib/interventi/sincronizzaRapportini.test.ts utils/rapportini/buildVoci.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/buildVoci.ts lib/interventi/sincronizzaRapportini.ts lib/interventi/sincronizzaRapportini.test.ts
git commit -m "feat(rapportini): voce annullata propaga _annullato in raw_json"
```

---

## Task 4: riepilogo esclude le annullate (invio sbloccato)

**Files:**
- Modify: `utils/rapportini/riepilogo.ts`
- Test: `utils/rapportini/riepilogo.test.ts`

- [ ] **Step 1: Test che fallisce**

In `utils/rapportini/riepilogo.test.ts` aggiungi:
```ts
it('le voci annullate non contano in daFare (invio possibile)', () => {
  const campi = [{ chiave: 'esito', etichetta: 'Esito', tipo: 'crocetta' as const, ordine: 0 }];
  const r = riepilogoRapportino(
    [{ risposte: {}, annullato: true }, { risposte: { esito: true }, annullato: false }],
    campi,
  );
  expect(r.daFare).toBe(0);
  expect(r.annullati).toBe(1);
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `npx vitest run utils/rapportini/riepilogo.test.ts`
Expected: FAIL (la voce annullata conta in daFare; `annullati` non esiste).

- [ ] **Step 3: Implementa**

In `utils/rapportini/riepilogo.ts`:
- in `RiepilogoRapportino`, dopo `daFare: number;` aggiungi `annullati: number;`
- la firma di `riepilogoRapportino` diventa:
```ts
export function riepilogoRapportino(
  voci: { risposte: Record<string, unknown>; annullato?: boolean }[],
  campi: TemplateCampo[],
): RiepilogoRapportino {
```
- nel ciclo, salta le annullate e contale a parte:
```ts
  let eseguiti = 0;
  let nonEseguiti = 0;
  let daFare = 0;
  let annullati = 0;
  for (const v of voci) {
    if (v.annullato) { annullati += 1; continue; }
    const s = statoVoce(v.risposte, campi);
    if (s === 'eseguito') eseguiti += 1;
    else if (s === 'non_eseguito') nonEseguiti += 1;
    else daFare += 1;
  }
```
- nel return aggiungi `annullati`:
```ts
  return { eseguiti, nonEseguiti, daFare, annullati, totali: voci.length, lavorazioni };
```

- [ ] **Step 4: Esegui — deve passare (e nessuna regressione sugli altri test del file)**

Run: `npx vitest run utils/rapportini/riepilogo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/riepilogo.ts utils/rapportini/riepilogo.test.ts
git commit -m "feat(rapportini): riepilogo esclude le voci annullate da daFare"
```

---

## Task 5: il digitale legge `_annullato` (page → Voce)

**Files:**
- Modify: `app/r/[token]/page.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (tipo Voce)

- [ ] **Step 1: page mappa il flag**

In `app/r/[token]/page.tsx`, nel map che costruisce `voci` (dove c'è `nuovo: Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo),`), aggiungi subito dopo:
```ts
    annullato: Boolean((v.raw_json as { _annullato?: unknown } | null)?._annullato),
```

- [ ] **Step 2: tipo `Voce` del form**

In `components/modules/rapportini/RapportinoForm.tsx`, nel tipo `Voce` (export `type Voce`), dopo `nuovo?: boolean;` (o campo equivalente) aggiungi:
```ts
  annullato?: boolean;
```

- [ ] **Step 3: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore su `page.tsx`/`RapportinoForm.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): digitale legge il flag annullato dalla voce"
```

---

## Task 6: rendering voce annullata + invio (RapportinoForm)

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: il riepilogo riceve `annullato`**

`riepilogoRapportino(voci, campi)` (riga ~192) ora conta correttamente perché le `voci` hanno `annullato` (Task 5). `inviabile = riepilogo.daFare === 0 && voci.length > 0` resta invariato e ora **ignora le annullate**. Nessuna modifica qui se non verificare che `voci` passate includano `annullato`.

- [ ] **Step 2: la riga porta il flag annullato**

Nel `useMemo` che costruisce `righe` (riga ~195), aggiungi `annullato: v.annullato` all'oggetto riga:
```ts
        return { index: idx, titolo, sub, attivita, fascia, stato: statoVoce(v.risposte, campi), nuovo: v.nuovo, annullato: v.annullato, badge: badgeVoceManuale(v.approvazione_stato ?? null) };
```
e aggiungi `annullato?: boolean` al tipo `RigaVoce`.

- [ ] **Step 3: render riga rossa/badge/non cliccabile**

Nel componente che renderizza la lista delle righe (vista `'lista'`), per ogni riga:
- se `riga.annullato`: applica classe rossa (`border-[var(--danger)] bg-[var(--danger-soft)]`, testo `line-through`), mostra un badge **"ANNULLATO"** (replica il pattern del badge "NUOVO" già presente per `riga.nuovo`), e **disabilita il click**: `onClick={riga.annullato ? undefined : () => onApri(riga.index)}` con `cursor-not-allowed` quando annullata.

(Il punto esatto è la `.map` sulle `righe` nella vista lista; segui lo stile/JSX già usato per il badge "NUOVO".)

- [ ] **Step 4: Verifica build**

Run: `npx tsc --noEmit` → pulito.
Run: `npx eslint components/modules/rapportini/RapportinoForm.tsx` → nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): voce annullata rossa, badge ANNULLATO, non cliccabile; invio escluso"
```

---

## Task 7: UI pianificazione — toggle Annulla/Ripristina

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: funzione `toggleAnnullaTask` (accanto a `moveTask`, ~riga 2091)**

```ts
  // Annulla/Ripristina un task: marca `annullato` (si applica al Salva, come Sposta)
  const toggleAnnullaTask = useCallback((taskId: string, opIdx: number) => {
    if (!distribution) return;
    const newDist = distribution.map((d) => ({ ...d, tasks: [...d.tasks] }));
    const grp = newDist[opIdx].tasks;
    const idx = grp.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    grp[idx] = { ...grp[idx], annullato: !grp[idx].annullato };
    setDistribution(newDist);
  }, [distribution]);
```

- [ ] **Step 2: pulsante accanto a "Sposta" nella riga task assegnata**

Nella riga del task assegnato (dove c'è il bottone "Sposta", ~riga 2986-2992), accanto ad esso aggiungi — visibile solo se non completato:
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

- [ ] **Step 3: stile riga annullata nella lista**

Nel contenitore della riga task assegnata (il `div` con `key={t.id}` della lista assegnati), aggiungi alla `className` una variante quando `t.annullato`: testo `line-through` e bordo/colore `--danger` (es. concatena `${t.annullato ? 'line-through opacity-70 border-[var(--danger)]/40' : ''}`).

- [ ] **Step 4: (facoltativo) riepilogo annullati nel testo di conferma del Salva**

In `buildRiepilogoConferma` (`utils/rapportini/riepilogoConferma.ts`) gli annullati appaiono già come spostamenti/voci nel diff se cambia l'operatore; per ora NON serve aggiungere righe dedicate (YAGNI). Salta.

- [ ] **Step 5: Verifica**

Run: `npx tsc --noEmit` → pulito.
Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx` → nessun NUOVO errore (baseline pre-esistente esclusa).

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): toggle Annulla/Ripristina intervento in pianificazione"
```

---

## Task 8: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: PASS (inclusi i nuovi test di Task 1–4).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale (dev)**

1. Carica un piano con rapportini già generati; nella lista interventi premi **Annulla** su un intervento → diventa rosso/barrato; premi **Salva** → conferma → il digitale mostra la voce **rossa "ANNULLATO" non cliccabile**.
2. Apri il rapportino digitale: prova a **inviare** lasciando l'annullata non compilata → invio **consentito**.
3. Premi **Ripristina** sullo stesso intervento → Salva → la voce torna **normale e compilabile**.
4. Verifica che un intervento **completato** non mostri il tasto Annulla.

---

## Note

- **Nessuna migrazione**: si usano `interventi.stato='annullato'` (esistente) e il pattern flag-in-`raw_json`.
- **Reversibilità**: garantita perché gli annullati da-mappa seguono il task (Task 2) e la voce ricalcola `_annullato` ad ogni genera.
- **Robustezza**: il rosso/non-cliccabile dipende dal flag nella voce, non dal collegamento `intervento_id` (che può essere null dopo il fix FK).
