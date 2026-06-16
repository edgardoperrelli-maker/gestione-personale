# Richiesta manuale "+" — Parte B: no doppio lavoro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Una richiesta manuale "+" si compila una sola volta: campi azione obbligatori bloccanti all'invio, e all'approvazione l'intervento nasce già `completato/eseguito_positivo` (niente ri-esitazione).

**Architecture:** Due modifiche isolate. (1) helper puro `richiestaToIntervento` → record `completato` + `esito='eseguito_positivo'`. (2) modale operatore: blocco bloccante sui campi obbligatori. Nessuna migration.

**Tech Stack:** Next.js (React client), TypeScript, vitest.

---

### Task 1: richiestaToIntervento crea l'intervento completato

**Files:**
- Modify: `lib/interventi/manuali/richiestaToIntervento.ts`
- Test: `lib/interventi/manuali/richiestaToIntervento.test.ts`

- [ ] **Step 1: Aggiorna il test (asserzioni stato/esito)**

In `richiestaToIntervento.test.ts`, nel primo test sostituisci la riga:

```ts
      stato: 'assegnato',
```

con:

```ts
      stato: 'completato',
      esito: 'eseguito_positivo',
```

E aggiungi un test dedicato dopo il primo `it(...)`:

```ts
  it('crea l’intervento già completato a esito positivo (il + è sempre positivo)', () => {
    const r = richiestaToIntervento(dati, ctx);
    expect(r.stato).toBe('completato');
    expect(r.esito).toBe('eseguito_positivo');
  });
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/interventi/manuali/richiestaToIntervento.test.ts`
Expected: FAIL — `stato` è `'assegnato'`, `esito` non esiste.

- [ ] **Step 3: Aggiorna l'implementazione**

In `richiestaToIntervento.ts`, nel tipo `InterventoManualeRecord` sostituisci:

```ts
  stato: 'assegnato';
```

con:

```ts
  stato: 'completato';
  esito: 'eseguito_positivo';
```

e nel `return` della funzione `richiestaToIntervento` sostituisci:

```ts
    stato: 'assegnato',
```

con:

```ts
    stato: 'completato',
    esito: 'eseguito_positivo',
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run lib/interventi/manuali/richiestaToIntervento.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (uso in approva route)**

Run: `npx tsc --noEmit 2>&1 | grep -iE "richiestaToIntervento|approva/route" || echo "OK"`
Expected: `OK` — la `approva/route.ts` inserisce il record così com'è (nessun campo nuovo richiesto altrove).

- [ ] **Step 6: Commit**

```bash
git add lib/interventi/manuali/richiestaToIntervento.ts lib/interventi/manuali/richiestaToIntervento.test.ts
git commit -m "feat(manuali): approvazione crea l'intervento gia completato/eseguito_positivo"
```

---

### Task 2: Campi azione obbligatori bloccanti nella modale

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`

- [ ] **Step 1: Rendi bloccante la validazione obbligatori**

In `handleInvia` sostituisci (righe ~84-87):

```ts
    const mancanti = campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0 && !window.confirm(`Mancano ${mancanti.length} campi obbligatori da compilare: ${mancanti.join(', ')}. Inviare comunque?`)) {
      return;
    }
```

con:

```ts
    const mancanti = campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0) {
      setErrore(`Compila i campi obbligatori: ${mancanti.join(', ')}.`);
      return;
    }
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx`
Expected: nessun errore (la funzione `window.confirm` non è più usata; `setErrore` già esistente).

Run: `npx tsc --noEmit 2>&1 | grep -i "ModaleInterventoManuale" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx
git commit -m "feat(manuali): campi azione obbligatori bloccanti all'invio del +"
```

---

### Task 3: Verifica complessiva

**Files:** nessuno (verifica)

- [ ] **Step 1: Suite interventi + manuali**

Run: `npx vitest run lib/interventi/`
Expected: tutti verdi (incluso `richiestaToIntervento` aggiornato).

- [ ] **Step 2: Typecheck globale (baseline invariata)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0` (baseline attuale), nessun errore nei file toccati.

- [ ] **Step 3: Verifica funzionale post-deploy**

Dopo il deploy: approvare una richiesta "+" in Lista attesa → l'intervento creato risulta
`completato/eseguito_positivo` (query read-only):

```sql
select stato, esito, count(*) from interventi where origine='manuale' group by stato, esito;
```

Expected: i nuovi approvati incrementano `completato/eseguito_positivo`, non `assegnato`.

---

## Self-Review (esito)

- **Copertura spec:** campi obbligatori bloccanti → Task 2; approvazione = completato/esito → Task 1; foto senza lavoro → nessuna modifica (interventi_manuali_foto invariato); no migration → rispettato.
- **Placeholder:** nessuno.
- **Coerenza tipi:** `InterventoManualeRecord.stato='completato'` + `esito='eseguito_positivo'` coerenti tra tipo, return e test. `taskToIntervento` non toccato.
