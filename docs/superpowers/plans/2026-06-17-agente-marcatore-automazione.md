# Agente — marcatore "AUTOMAZIONE = SI" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usano checkbox (`- [ ]`).

**Goal:** Nuovo campo mappabile `automazione` che scrive `SI` nella colonna scelta su ogni riga che l'agente modifica (pianificate toccate + extra aggiunte), distinto dal `marcatore` (AGGIUNTA APP, solo extra).

**Architecture:** Additivo, riusa la mappa per nome + policy prudente. App: `CAMPI_MAPPABILI` + etichette. Agente: costante `SI` + scrittura sulle righe toccate. No migration. Spec: `docs/superpowers/specs/2026-06-17-agente-marcatore-automazione-design.md`.

**Tech Stack:** TypeScript/Vitest (app), agente Node ESM. Gate mirati (`npx vitest run <file>`, `npx tsc --noEmit` senza nuovi errori, `node --check`).

---

### Task 1: `automazione` in `CAMPI_MAPPABILI`

**Files:**
- Modify: `lib/agente/decisione.ts`
- Test: `lib/agente/decisione.test.ts`

- [ ] **Step 1: Aggiorna i test**

In `lib/agente/decisione.test.ts`, nel test che fa `expect(CAMPI_MAPPABILI).toEqual([...])` (≈ riga 150), aggiungi `'automazione'` in coda dopo `'marcatore'`. Aggiungi inoltre:
```ts
it('accetta una regola automazione', () => {
  const r = validaMappatura([{ campo: 'automazione', colonna: 'AUTOMAZIONE', abilitato: true }]);
  expect(r.ok).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run lib/agente/decisione.test.ts`
Expected: FAIL (l'array non contiene ancora `automazione`).

- [ ] **Step 3: Implementa**

In `lib/agente/decisione.ts`, array `CAMPI_MAPPABILI`, aggiungi `'automazione'` in coda:
```ts
export const CAMPI_MAPPABILI = [
  'esecutore', 'data', 'esito', 'sigillo', 'matricola',
  'via', 'pdr', 'nominativo', 'comune', 'saracinesca', 'marcatore', 'automazione',
] as const;
```

- [ ] **Step 4: Run → PASS** (`npx vitest run lib/agente/decisione.test.ts components/modules/agente/`)

- [ ] **Step 5: Commit**

```bash
git add lib/agente/decisione.ts lib/agente/decisione.test.ts
git commit -m "feat(agente): automazione tra i campi mappabili"
```

---

### Task 2: etichette editor (`Automazione` + fix `Saracinesca`)

**Files:**
- Modify: `components/modules/agente/ColonneCard.tsx`

> Componente client senza unit test dedicato: gate `tsc` + `eslint`.

- [ ] **Step 1: Aggiungi le etichette**

In `components/modules/agente/ColonneCard.tsx`, nella mappa `ETICHETTA_CAMPO`, aggiungi (dopo `comune: 'Comune',` e accanto a `marcatore`):
```ts
  saracinesca: 'Saracinesca',
  marcatore: 'Marcatore (solo extra)',
  automazione: 'Automazione',
```
(Mantieni le voci esistenti; aggiungi solo `saracinesca` e `automazione`.)

- [ ] **Step 2: Gate + Commit**

Run: `npx tsc --noEmit` → nessun nuovo errore. `npx eslint components/modules/agente/ColonneCard.tsx` → pulito.
```bash
git add components/modules/agente/ColonneCard.tsx
git commit -m "feat(agente-ui): etichette Automazione + Saracinesca nell'editor mappa"
```

---

### Task 3: agente `eseguiGiro` scrive `SI` sulle righe toccate

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`
- Test: `tools/limitazioni-sync/agente.test.ts`

- [ ] **Step 1: Costante + risoluzione colonna**

In `tools/limitazioni-sync/agente.mjs`:
- vicino a `export const MARKER = 'AGGIUNTA APP';` aggiungi `export const MARKER_AUTOMAZIONE = 'SI';`
- nel loop che separa le regole (dove c'è `if (regola.campo === 'marcatore') { regolaMarcatore = regola; continue; }`), aggiungi dopo:
```js
        if (regola.campo === 'automazione') { regolaAutomazione = regola; continue; }
```
e dichiara `let regolaAutomazione = null;` accanto a `let regolaMarcatore = null;`
- dopo la risoluzione di `markerCol`, aggiungi la risoluzione della colonna automazione (per nome):
```js
      // indice della colonna automazione (marcatore "SI" sulle righe toccate).
      let automazioneCol = -1;
      if (regolaAutomazione) {
        automazioneCol = risolviColonna(header, regolaAutomazione.colonna);
        if (automazioneCol < 0) { colonneAssenti.add(regolaAutomazione.colonna); fileReport.colonneAssenti = [...colonneAssenti]; }
      }
```

- [ ] **Step 2: Helper di scrittura del marcatore**

Subito dopo la definizione di `scriviCella` (dentro il `try`, prima del loop "1) righe pianificate"), aggiungi:
```js
      // scrive "SI" nella colonna automazione (prudente: vuota->scrivi, uguale->salta, diversa->conflitto).
      const scriviAutomazione = (row) => {
        if (automazioneCol < 0) return;
        const cell = row.getCell(automazioneCol + 1);
        const d = decidiScrittura(cell.value, MARKER_AUTOMAZIONE);
        if (d.azione === 'scrivi') { cell.value = d.valore; }
        else if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, campo: 'automazione', esistente: d.esistente, nuovo: d.valore });
        }
      };
```

- [ ] **Step 3: Marca le righe pianificate toccate e le extra**

Nel loop "1) righe pianificate", sostituisci:
```js
        if (toccata) fileReport.aggiornate++;
```
con:
```js
        if (toccata) { fileReport.aggiornate++; scriviAutomazione(row); }
```
Nel loop "2) extra", dopo il blocco marcatore (`if (markerCol >= 0) { ... }`) e prima di `fileReport.extraAggiunte++;`, aggiungi:
```js
        scriviAutomazione(row);
```

- [ ] **Step 4: Estendi l'e2e**

In `tools/limitazioni-sync/agente.test.ts`: aggiungi una colonna `AUTOMAZIONE` all'intestazione della fixture e una regola `{ campo:'automazione', colonna:'AUTOMAZIONE', abilitato:true }` alla `mappatura` passata a `eseguiGiro`. Asserisci:
- la riga pianificata effettivamente lavorata ha `'SI'` nella colonna AUTOMAZIONE;
- la riga extra aggiunta ha `'SI'` nella colonna AUTOMAZIONE;
- una riga **non** agganciata (o agganciata ma non toccata) ha la cella AUTOMAZIONE **vuota**.
(Mantieni gli assert esistenti su esito/saracinesca.)

- [ ] **Step 5: Run → PASS + check sintassi**

Run: `npx vitest run tools/limitazioni-sync/` → tutti PASS.
Run: `node --check tools/limitazioni-sync/agente.mjs` → ok.

- [ ] **Step 6: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/agente.test.ts
git commit -m "feat(lim-sync): marcatore AUTOMAZIONE=SI sulle righe lavorate"
```

---

## PART 2 — Deploy (manuale)

### Task 4

- [ ] Suite mirata verde: `npx vitest run lib/agente/ tools/limitazioni-sync/ components/modules/agente/`; `npx tsc --noEmit` 0 nuovi errori.
- [ ] Con OK utente: `git push origin feat/agente-marcatore-automazione:main` → Vercel.
- [ ] Ricopia sul PC **solo** `tools/limitazioni-sync/agente.mjs`.
- [ ] In `/hub/agente`: abilita **Automazione**, mappa la colonna `AUTOMAZIONE`, testa con **Esegui ora**.

---

## Self-Review
- Campo `automazione` (CAMPI_MAPPABILI T1 · etichette T2 · agente T3): ✅
- Distinto da `marcatore` (AGGIUNTA APP, solo extra): ✅ colonne separate.
- `SI` solo su righe toccate (pianificate `toccata` + extra), non su agganciate-non-toccate: ✅
- Idempotente/prudente (vuota→SI, uguale→salta, diversa→conflitto): ✅
- Nessuna migration; deploy = push + ricopia agente.mjs: ✅
