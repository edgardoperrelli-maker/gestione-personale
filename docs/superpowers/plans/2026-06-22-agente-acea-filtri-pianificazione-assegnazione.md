# Fix filtri ACEA (pianificazione dunning + assegnazione stato odl) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escludere dalla pianificazione gli ordini DUNNING chiusi (`completato`/`annullato`) e dall'assegnazione su ACEA gli ordini non-assegnabili (`completo`/`DA RICHIEDERE`), portando lo `stato odl` dal master fino alla selezione — senza toccare il driver Playwright.

**Architecture:** Una sola lettura del master porta lo `stato odl` fino a `agente_pianificabili`. Il filtro "chiusi" si applica in import (pure function condivisa), il filtro "non-assegnabili" si applica nell'endpoint che prepara la lista per il driver. La pianificazione resta invariata. Il driver e i comandi PowerShell non si toccano.

**Tech Stack:** Node ESM (agente `tools/limitazioni-sync`, `.mjs`), Next.js route handlers + TypeScript (`app/`, `lib/agente`), Vitest, Supabase (Postgres prod `aceztqfebringeaebvce`).

**Spec:** `docs/superpowers/specs/2026-06-22-agente-acea-filtri-pianificazione-assegnazione-design.md`

## Global Constraints

- **NON toccare** il meccanismo di assegnazione: `assegnaInterventi.mjs`, `eseguiGiroAceaAssegna.mjs`, `driver.mjs`, `risolviNomeOperatore.mjs`, `assegna-odl.mjs`. "Al Playwright devono arrivare gli ordini già da lavorare; la logica a monte."
- **Hook di blindatura** (`.claude/hooks/guard-acea.mjs`): le modifiche a `leggiMasterAcea.mjs` (Task 3) e `app/api/agente/acea-assegnazioni/route.ts` (Task 9) fanno scattare un prompt di conferma. È voluto — confermare, sono modifiche richieste.
- **Pianificazione (anteprima/Procedi) invariata**: non modificare `anteprima/route.ts` né `assegna/route.ts`.
- **Base branch**: worktree da `origin/main` (mai il branch `restyle/aurea-light`). App → push refspec `HEAD:main` (con ok utente) → Vercel. `tools/` → mirror Drive + robocopy sul PC (ad **agente spento**), non passa da Vercel.
- **Default stati** (configurabili, valori reali da validare): chiusi = `['completato','annullato']`; non-assegnabili = `['completo','da richiedere']`. Match: sottostringa **normalizzata** (NFD/strip-accenti/lowercase/trim/collapse).
- **Naming**: campo grezzo del reader = `statoRaw`; campo propagato in `agente_pianificabili` e payload = `statoOdl` (camel) / colonna DB `stato_odl` (snake).
- Baseline repo: `npm run lint`/`vitest` hanno rossi pre-esistenti fuori dai file toccati. Gate = verde sui file toccati.

---

### Task 1: Helper agente `statiOdl.mjs` (classifica stato chiuso)

**Files:**
- Create: `tools/limitazioni-sync/lib/statiOdl.mjs`
- Test: `tools/limitazioni-sync/lib/statiOdl.test.ts`

**Interfaces:**
- Consumes: `normNome` da `./colonne.mjs` (NFD/strip-accenti/lowercase/collapse).
- Produces: `STATI_CHIUSI: string[]`, `matchStato(cella, lista): boolean`, `isChiuso(cella, lista=STATI_CHIUSI): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/statiOdl.test.ts
import { describe, it, expect } from 'vitest';
import { isChiuso, matchStato } from './statiOdl.mjs';

describe('isChiuso', () => {
  it('riconosce gli stati chiusi di default (accenti/maiuscole/spazi)', () => {
    expect(isChiuso('Completato')).toBe(true);
    expect(isChiuso('  ANNULLATO ')).toBe(true);
    expect(isChiuso('completato il 22/06')).toBe(true);
  });
  it('non chiude gli stati aperti né la cella vuota', () => {
    expect(isChiuso('')).toBe(false);
    expect(isChiuso('da richiedere')).toBe(false);
    expect(isChiuso('completo')).toBe(false); // "completo" != "completato"
  });
});

describe('matchStato', () => {
  it('lista custom', () => {
    expect(matchStato('Completo', ['completo', 'da richiedere'])).toBe(true);
    expect(matchStato('assegnato', ['completo', 'da richiedere'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/statiOdl.test.ts`
Expected: FAIL — `Failed to resolve import "./statiOdl.mjs"`.

- [ ] **Step 3: Write minimal implementation**

```js
// tools/limitazioni-sync/lib/statiOdl.mjs
// PURE: classificazione dello "stato odl"/"Stato Operazione" del master ACEA.
import { normNome } from './colonne.mjs';

/** Stati che indicano un ordine CHIUSO → escluso dalla pianificazione. */
export const STATI_CHIUSI = ['completato', 'annullato'];

/** Vero se la cella di stato contiene (per nome normalizzato) uno degli stati della lista. */
export function matchStato(cella, lista) {
  const c = normNome(cella);
  if (!c) return false;
  return (lista ?? []).some((s) => c.includes(normNome(s)));
}

/** Vero se lo stato indica un ordine chiuso (completato/annullato). */
export function isChiuso(cella, lista = STATI_CHIUSI) {
  return matchStato(cella, lista);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/statiOdl.test.ts`
Expected: PASS (2 + 1 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/statiOdl.mjs tools/limitazioni-sync/lib/statiOdl.test.ts
git commit -m "feat(acea): helper statiOdl agente (isChiuso completato/annullato)"
```

---

### Task 2: `estraiPianificabili` scarta i chiusi e porta `statoOdl`

**Files:**
- Modify: `tools/limitazioni-sync/lib/pianificabili.mjs`
- Test: `tools/limitazioni-sync/lib/pianificabili.test.ts`

**Interfaces:**
- Consumes: `isChiuso` da `./statiOdl.mjs` (Task 1); riga grezza con campo `statoRaw` (prodotto da Task 3; assente sul percorso LM → `undefined`).
- Produces: `estraiPianificabili(righe, dataTarget)` ora emette oggetti con campo aggiuntivo `statoOdl: string`.

- [ ] **Step 1: Update the test (failing)**

Sostituisci INTERAMENTE `tools/limitazioni-sync/lib/pianificabili.test.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { estraiPianificabili } from './pianificabili.mjs';

const base = (over: Record<string, unknown> = {}) => ({
  riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO',
  esecutore: 'CIARALLO', dataRaw: '2026-06-19', esitoRaw: '', statoRaw: '', ...over,
});

describe('estraiPianificabili', () => {
  it('tiene solo data==target + esecutore presente + esito vuoto; propaga statoOdl', () => {
    const out = estraiPianificabili([
      base(),
      base({ riga: 3, dataRaw: '2026-06-20' }),            // altra data
      base({ riga: 4, esecutore: '' }),                    // senza esecutore
      base({ riga: 5, esitoRaw: 'eseguito' }),             // già lavorata
    ], '2026-06-19');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO', data: '2026-06-19', esecutore: 'CIARALLO', statoOdl: '' });
  });

  it('scarta gli ordini chiusi (completato/annullato) e propaga lo stato aperto', () => {
    const out = estraiPianificabili([
      base({ riga: 2, statoRaw: 'assegnato' }),            // aperto → tenuto
      base({ riga: 3, statoRaw: 'Completato' }),           // chiuso → scartato
      base({ riga: 4, statoRaw: 'ANNULLATO' }),            // chiuso → scartato
    ], '2026-06-19');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ riga: 2, statoOdl: 'assegnato' });
  });

  it('riga LM senza statoRaw non viene scartata (statoOdl vuoto)', () => {
    const out = estraiPianificabili([base()], '2026-06-19');
    expect(out).toHaveLength(1);
    expect(out[0].statoOdl).toBe('');
  });

  it('normalizza la data via giornoDa (accetta Date/locale)', () => {
    const out = estraiPianificabili([base({ dataRaw: new Date('2026-06-19T00:00:00') })], '2026-06-19');
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/pianificabili.test.ts`
Expected: FAIL — l'oggetto atteso include `statoOdl`, l'attuale output no; il caso "chiusi" non scarta.

- [ ] **Step 3: Implement**

Sostituisci INTERAMENTE `tools/limitazioni-sync/lib/pianificabili.mjs` con:

```js
// tools/limitazioni-sync/lib/pianificabili.mjs
// PURE: filtra le righe del giorno (data target + esecutore presente + esito vuoto + stato non chiuso)
// e propaga `statoOdl` per il filtro di assegnazione a valle.
import { giornoDa } from './dataCella.mjs';
import { isChiuso } from './statiOdl.mjs';

const t = (v) => String(v ?? '').trim();

export function estraiPianificabili(righe, dataTarget) {
  const target = giornoDa(dataTarget) || t(dataTarget);
  const out = [];
  for (const r of righe ?? []) {
    const data = giornoDa(r.dataRaw);
    if (!data || data !== target) continue;
    if (!t(r.esecutore)) continue;
    if (t(r.esitoRaw)) continue;
    if (isChiuso(r.statoRaw)) continue; // ordine chiuso (completato/annullato) → non pianificabile
    out.push({
      riga: r.riga,
      odl: t(r.odl), matricola: t(r.matricola), indirizzo: t(r.indirizzo),
      comune: t(r.comune), data, esecutore: t(r.esecutore),
      statoOdl: t(r.statoRaw),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/pianificabili.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/pianificabili.mjs tools/limitazioni-sync/lib/pianificabili.test.ts
git commit -m "feat(acea): estraiPianificabili scarta i chiusi e propaga statoOdl"
```

---

### Task 3: `mappaRigheMaster` legge la colonna stato (DUNNING) ⚠️ file hook-protected

**Files:**
- Modify: `tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs` (⚠️ guard-acea — confermare il prompt)
- Test: `tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts`

**Interfaces:**
- Consumes: `risolviColonna` (già importato). Nuovo campo opzionale `colonne.stato` (nome colonna).
- Produces: ogni riga grezza ha ora `statoRaw: string` (consumato da `estraiPianificabili`, Task 2). `''` se `colonne.stato` assente.

- [ ] **Step 1: Update the test (failing)**

Sostituisci il blocco `describe('mappaRigheMaster', …)` in `tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts` con:

```ts
describe('mappaRigheMaster', () => {
  const header = ['Stato Operazione', 'Ordine', 'Matricola misuratore', 'INDIRIZZO', 'Località', 'Data', 'Esecutore'];
  const colonne = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località', stato: 'Stato Operazione' };

  it('mappa le colonne per nome e legge lo stato', () => {
    const matrix = [['completato', '12345', 'M9', 'Via Roma 1', 'ROMA', '2026-06-22', 'ROSSI']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g).toEqual([{ riga: 2, odl: '12345', matricola: 'M9', indirizzo: 'Via Roma 1', comune: 'ROMA', esecutore: 'ROSSI', dataRaw: '2026-06-22', esitoRaw: '', statoRaw: 'completato' }]);
  });

  it('numera le righe a partire da 2 (header su riga 1)', () => {
    const matrix = [['', 'A', '', '', '', '', ''], ['', 'B', '', '', '', '', '']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g.map((r) => r.riga)).toEqual([2, 3]);
  });

  it('cella mancante → stringa vuota', () => {
    const g = mappaRigheMaster([['', '12345']], header, colonne);
    expect(g[0].matricola).toBe('');
    expect(g[0].esecutore).toBe('');
  });

  it('stato assente nel config → statoRaw vuoto', () => {
    const colonneNoStato = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località' };
    const g = mappaRigheMaster([['x', '12345', '', '', '', '', '']], header, colonneNoStato);
    expect(g[0].statoRaw).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts`
Expected: FAIL — l'output atteso include `statoRaw`, l'attuale no.

- [ ] **Step 3: Implement** (confermare il prompt dell'hook)

In `mappaRigheMaster`, aggiungi `stato` all'oggetto `idx` e `statoRaw` all'oggetto emesso:

```js
  const idx = {
    odl: risolviColonna(header, colonne.odl),
    esecutore: risolviColonna(header, colonne.esecutore),
    data: risolviColonna(header, colonne.data),
    matricola: risolviColonna(header, colonne.matricola),
    indirizzo: risolviColonna(header, colonne.indirizzo),
    comune: risolviColonna(header, colonne.comune),
    stato: risolviColonna(header, colonne.stato),
  };
```

e nell'oggetto `out.push({...})`:

```js
      esitoRaw: '', // il master DUNNING non ha "esito" in lettura: sempre pianificabile
      statoRaw: cella(row, idx.stato), // Stato Operazione (DUNNING); '' se colonne.stato assente
```

(`risolviColonna(header, undefined)` → `-1` → `cella` ritorna `''`: il percorso LM senza `colonne.stato` resta a `statoRaw: ''`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts
git commit -m "feat(acea): mappaRigheMaster legge la colonna Stato Operazione (statoRaw)"
```

---

### Task 4: `leggiMasterAceaDunning` passa il nome colonna stato

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs` (funzione `leggiMasterAceaDunning`, ~riga 336-339)

**Interfaces:**
- Consumes: `acea.masterColonnaStato` dal config (es. `"Stato Operazione"`).
- Produces: passa `stato` nell'oggetto `colonne` a `mappaRigheMaster` (Task 3).

- [ ] **Step 1: Implement**

Nell'oggetto `colonne` dentro `leggiMasterAceaDunning`, aggiungi la riga `stato`:

```js
    const colonne = {
      odl: acea.masterColonnaOdl, esecutore: acea.masterColonnaEsecutore, data: acea.masterColonnaData,
      matricola: acea.masterColonnaMatricola, indirizzo: acea.masterColonnaIndirizzo, comune: acea.masterColonnaComune,
      stato: acea.masterColonnaStato,
    };
```

- [ ] **Step 2: Verify the agent suite is green (no regression in glue)**

Run: `npx vitest run tools/limitazioni-sync/agente.test.ts`
Expected: PASS (nessuna regressione; la logica di lettura stato è coperta dall'unit test di Task 3).

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(acea): leggiMasterAceaDunning passa masterColonnaStato a mappaRigheMaster"
```

---

### Task 5: Migration — `agente_pianificabili.stato_odl`

**Files:**
- DDL (Postgres prod `aceztqfebringeaebvce`) — la lancia l'utente.

**Interfaces:**
- Produces: colonna `agente_pianificabili.stato_odl text` (nullable), consumata da Task 6 (ingest) e Task 9 (selezione assegnazione).

- [ ] **Step 1: Consegna la SQL all'utente (la lancia lui sul DB prod)**

```sql
alter table agente_pianificabili add column if not exists stato_odl text;
```

- [ ] **Step 2: Verifica che la colonna esista** (SELECT in sola lettura, via MCP)

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'agente_pianificabili' and column_name = 'stato_odl';
```
Expected: una riga `stato_odl | text`.

- [ ] **Step 3: (nessun commit di codice — DDL applicata dall'utente)**

---

### Task 6: Ingest `pianificabili` salva `stato_odl`

**Files:**
- Modify: `app/api/agente/pianificabili/route.ts`

**Interfaces:**
- Consumes: campo `statoOdl` nelle righe del payload (prodotto da Task 2 → inoltrato verbatim da `inviaPianificabili`). Colonna `stato_odl` (Task 5).
- Produces: righe `agente_pianificabili` con `stato_odl` valorizzato.

- [ ] **Step 1: Implement**

In `app/api/agente/pianificabili/route.ts`, estendi `RigaIn` e l'oggetto inserito:

```ts
type RigaIn = { riga?: number; odl?: string; matricola?: string; indirizzo?: string; comune?: string; data?: string; esecutore?: string; statoOdl?: string };
```

```ts
      const rows = righe.map((r) => ({
        file, data,
        riga: Number(r.riga ?? 0),
        odl: r.odl ?? null, matricola: r.matricola ?? null, indirizzo: r.indirizzo ?? null,
        comune: r.comune ?? null, esecutore: r.esecutore ?? null,
        stato_odl: r.statoOdl ?? null,
        scansionato_il: new Date().toISOString(),
      }));
```

- [ ] **Step 2: Verify type-check su file toccato**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore sui file toccati (la baseline può avere errori pre-esistenti altrove).

- [ ] **Step 3: Commit**

```bash
git add app/api/agente/pianificabili/route.ts
git commit -m "feat(acea): ingest pianificabili salva stato_odl"
```

---

### Task 7: Helper app `statoOdl.ts` (classifica non-assegnabile)

**Files:**
- Create: `lib/agente/statoOdl.ts`
- Test: `lib/agente/statoOdl.test.ts`

**Interfaces:**
- Produces: `STATI_NON_ASSEGNABILI: string[]`, `matchStato(cella, lista): boolean`, `isNonAssegnabile(cella, lista=STATI_NON_ASSEGNABILI): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/agente/statoOdl.test.ts
import { describe, it, expect } from 'vitest';
import { isNonAssegnabile, matchStato } from './statoOdl';

describe('isNonAssegnabile', () => {
  it('esclude completo / da richiedere (accenti/maiuscole/spazi)', () => {
    expect(isNonAssegnabile('Completo')).toBe(true);
    expect(isNonAssegnabile('  DA RICHIEDERE ')).toBe(true);
  });
  it('assegna gli stati aperti e ignora la cella vuota', () => {
    expect(isNonAssegnabile('')).toBe(false);
    expect(isNonAssegnabile('assegnato')).toBe(false);
    expect(isNonAssegnabile('ricevuto')).toBe(false);
  });
});

describe('matchStato', () => {
  it('lista custom', () => {
    expect(matchStato('Annullato', ['annullato'])).toBe(true);
    expect(matchStato('assegnato', ['annullato'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/statoOdl.test.ts`
Expected: FAIL — `Cannot find module './statoOdl'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/agente/statoOdl.ts
// PURO: classificazione dello "stato odl" ACEA per decidere l'assegnabilità su ACEA.

/** Stati ordine NON assegnabili su ACEA → esclusi dalla lista passata al driver. */
export const STATI_NON_ASSEGNABILI = ['completo', 'da richiedere'];

function normStato(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Vero se la cella di stato contiene (per nome normalizzato) uno degli stati della lista. */
export function matchStato(cella: string | null | undefined, lista: readonly string[]): boolean {
  const c = normStato(cella);
  if (!c) return false;
  return lista.some((s) => c.includes(normStato(s)));
}

/** Vero se l'ordine NON è assegnabile su ACEA (completo / da richiedere). */
export function isNonAssegnabile(cella: string | null | undefined, lista: readonly string[] = STATI_NON_ASSEGNABILI): boolean {
  return matchStato(cella, lista);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/statoOdl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agente/statoOdl.ts lib/agente/statoOdl.test.ts
git commit -m "feat(acea): helper statoOdl app (isNonAssegnabile completo/da richiedere)"
```

---

### Task 8: `assegnabiliAcea` scarta gli stati non-assegnabili

**Files:**
- Modify: `lib/agente/assegnabiliAcea.ts`
- Test: `lib/agente/assegnabiliAcea.test.ts`

**Interfaces:**
- Consumes: `isNonAssegnabile` da `./statoOdl` (Task 7). `InterventoAcea` ottiene il campo `stato_odl?: string | null`.
- Produces: `assegnabiliAcea(...)` scarta le righe con stato non-assegnabile (motivo `'stato non assegnabile'`); forma di `righe`/`scartati` invariata per il driver.

- [ ] **Step 1: Add the failing test**

Aggiungi a `lib/agente/assegnabiliAcea.test.ts` (dentro il `describe`):

```ts
  it('scarta gli ordini con stato non assegnabile (completo / da richiedere)', () => {
    const interventi = [
      { id: 'i1', odl: '111', matricola_contatore: 'M1', indirizzo: null, comune: null, staff_id: 's1', stato_odl: 'completo' },
      { id: 'i2', odl: '222', matricola_contatore: 'M2', indirizzo: null, comune: null, staff_id: 's2', stato_odl: 'DA RICHIEDERE' },
      { id: 'i3', odl: '333', matricola_contatore: 'M3', indirizzo: null, comune: null, staff_id: 's1', stato_odl: 'assegnato' },
    ];
    const r = assegnabiliAcea(interventi, staff, new Set());
    expect(r.righe.map((x) => x.odl)).toEqual(['333']);
    expect(r.scartati).toEqual([
      { odl: '111', motivo: 'stato non assegnabile' },
      { odl: '222', motivo: 'stato non assegnabile' },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agente/assegnabiliAcea.test.ts`
Expected: FAIL — `111`/`222` non vengono scartati (filtro assente).

- [ ] **Step 3: Implement**

In `lib/agente/assegnabiliAcea.ts`:
1. import in cima: `import { isNonAssegnabile } from './statoOdl';`
2. estendi il type: `export type InterventoAcea = { id: string; odl: string | null; matricola_contatore: string | null; indirizzo: string | null; comune: string | null; staff_id: string | null; stato_odl?: string | null };`
3. nel ciclo, subito dopo il check `if (!odl) {...}`:

```ts
    if (isNonAssegnabile(i.stato_odl)) { scartati.push({ odl, motivo: 'stato non assegnabile' }); continue; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agente/assegnabiliAcea.test.ts`
Expected: PASS (tutti, inclusi i test pre-esistenti — gli interventi senza `stato_odl` → `undefined` → non scartati).

- [ ] **Step 5: Commit**

```bash
git add lib/agente/assegnabiliAcea.ts lib/agente/assegnabiliAcea.test.ts
git commit -m "feat(acea): assegnabiliAcea scarta gli stati non assegnabili (completo/da richiedere)"
```

---

### Task 9: `acea-assegnazioni` route porta `stato_odl` ⚠️ file hook-protected

**Files:**
- Modify: `app/api/agente/acea-assegnazioni/route.ts` (⚠️ guard-acea — confermare il prompt)

**Interfaces:**
- Consumes: colonna `agente_pianificabili.stato_odl` (Task 5); `InterventoAcea.stato_odl` (Task 8).
- Produces: lista `righe` filtrata anche per stato (il driver non vede più gli ODL non-assegnabili).

- [ ] **Step 1: Implement** (confermare il prompt dell'hook)

In `app/api/agente/acea-assegnazioni/route.ts`:
1. select: aggiungi `stato_odl`:

```ts
    const { data: pianRaw, error: ePian } = await supabaseAdmin
      .from('agente_pianificabili')
      .select('id, file, odl, matricola, indirizzo, comune, esecutore, stato_odl')
      .eq('data', data);
```

2. tipo di `pian`: aggiungi `stato_odl: string | null`:

```ts
    const pian = ((pianRaw ?? []) as Array<{ id: string; file: string; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; esecutore: string | null; stato_odl: string | null }>)
      .filter((r) => aceaFiles.has(r.file));
```

3. map a `InterventoAcea`: aggiungi `stato_odl`:

```ts
    const interventi: InterventoAcea[] = pian.map((r) => ({
      id: r.id, odl: r.odl, matricola_contatore: r.matricola, indirizzo: r.indirizzo, comune: r.comune, staff_id: r.esecutore,
      stato_odl: r.stato_odl,
    }));
```

- [ ] **Step 2: Verify type-check su file toccato**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore sui file toccati.

- [ ] **Step 3: Commit**

```bash
git add app/api/agente/acea-assegnazioni/route.ts
git commit -m "feat(acea): acea-assegnazioni porta stato_odl ad assegnabiliAcea (esclude non-assegnabili)"
```

---

### Task 10: Verifica completa + propagazione/deploy

**Files:** nessuno (verifica + rollout).

- [ ] **Step 1: Suite agente verde**

Run: `npx vitest run tools/limitazioni-sync`
Expected: PASS (i nuovi `statiOdl`/`pianificabili`/`leggiMasterAcea` inclusi; nessuna regressione).

- [ ] **Step 2: Suite app agente verde**

Run: `npx vitest run lib/agente`
Expected: PASS (inclusi `statoOdl`, `assegnabiliAcea`).

- [ ] **Step 3: Deploy app (dopo la migration di Task 5)**

Le modifiche app (Task 6, 9) richiedono la colonna `stato_odl` già presente. Con ok utente: `git push origin HEAD:main` (refspec) → Vercel.

- [ ] **Step 4: Propaga l'agente al PC** (a **agente spento**, altrimenti i file sono in uso)

Copia `tools/limitazioni-sync` aggiornato nel mirror `G:\Il mio Drive\limitazioni-sync-aggiornato`; l'utente lancia il robocopy (`/XD node_modules _backup _log _acea_download _acea_debug /XF config.json acea.lock`) e riavvia il task.

- [ ] **Step 5: Dry-run di validazione + valori reali**

Su un giorno con dati DUNNING: verifica che (a) gli ordini `completato`/`annullato` non compaiano tra i pianificabili; (b) "Scrivi su ACEA" non includa gli ODL `completo`/`DA RICHIEDERE`. Conferma i **valori distinti reali** delle colonne `Stato Operazione`/`stato odl` e, se necessario, aggiorna `STATI_CHIUSI`/`STATI_NON_ASSEGNABILI` (o passa a `equals`).

## Criteri di accettazione (dalla spec §11)

1. Pianificazione dunning: `Stato Operazione = completato/annullato` non genera rapportino.
2. Pianificazione LM: invariata (esito `eseguito` escluso; nessun nuovo scarto indebito — riga senza `statoRaw` non viene toccata).
3. Assegnazione blocco: ODL con `stato_odl ∈ {completo, DA RICHIEDERE}` non arrivano al driver.
4. Driver/PowerShell: invariati.
5. Anteprima/Procedi: nessun cambiamento oltre l'esclusione dei chiusi dal Dunning.
