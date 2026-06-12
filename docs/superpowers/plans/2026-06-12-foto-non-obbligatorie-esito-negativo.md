# Foto non obbligatorie su esito negativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando un intervento ha **esito negativo** (assente / non eseguito / negativo / KO / select=NO), le **foto obbligatorie non sono più richieste** in nessun punto (rapportino standard, modale manuale lato UI/server/offline). Il risanamento (foto prima/dopo misuratori) resta invariato.

**Architecture:** Un helper puro `haEsitoNegativo(risposte, campi)` (in `voceColore.ts`, riusa la logica già esistente che colora la voce di rosso). Le tre validazioni foto saltano il controllo quando l'esito è negativo.

**Tech Stack:** TypeScript, Vitest, Next.js route handler, React.

---

## File Structure
- **Modificati (logica):** `utils/rapportini/voceColore.ts` (+test) — nuovo `haEsitoNegativo`.
- **Modificati (validazioni):** `utils/rapportini/fotoObbligatorieMancanti.ts` (+test), `lib/offline/validateManuale.ts` (+test), `components/modules/rapportini/ModaleInterventoManuale.tsx`, `app/api/r/[token]/intervento-manuale/route.ts`.
- **Invariato:** `utils/rapportini/righeIncomplete.ts` (risanamento: niente esito negativo).

## Note gate
Baseline lint/test già rossa su main → verifica mirata: `npx tsc --noEmit` (solo errori baseline e2e/playwright), `npx eslint <file>`, `npx vitest run <testfile>`.

---

### Task 1: `haEsitoNegativo` (voceColore.ts, TDD)

**Files:**
- Modify: `utils/rapportini/voceColore.ts`
- Modify: `utils/rapportini/voceColore.test.ts`

- [ ] **Step 1: Aggiungi i test** in `utils/rapportini/voceColore.test.ts`

Aggiungi `haEsitoNegativo` all'import esistente da `'./voceColore'`. Assicurati che ci sia `import type { TemplateCampo } from './buildVoci';` (aggiungilo se manca). In fondo al file aggiungi:
```ts
describe('haEsitoNegativo', () => {
  const campi: TemplateCampo[] = [
    { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 1 },
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'crocetta', ordine: 2 },
    { chiave: 'esito', etichetta: 'Esito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 3 },
  ];
  it('crocetta negativa spuntata → true', () => {
    expect(haEsitoNegativo({ assente: true }, campi)).toBe(true);
  });
  it('select su NO → true', () => {
    expect(haEsitoNegativo({ esito: 'NO' }, campi)).toBe(true);
  });
  it('solo positivi → false', () => {
    expect(haEsitoNegativo({ eseguito: true, esito: 'SI' }, campi)).toBe(false);
  });
  it('niente compilato → false', () => {
    expect(haEsitoNegativo({}, campi)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run utils/rapportini/voceColore.test.ts`
Expected: FAIL (`haEsitoNegativo` non esportata).

- [ ] **Step 3: Implementa** in `utils/rapportini/voceColore.ts`

Aggiungi in fondo al file (riusa le helper private `nomeNegativo` e la regex `NEG_SELECT` già definite nel file):
```ts
/** True se un campo "negativo" (crocetta o select) è valorizzato → esito negativo. */
export function haEsitoNegativo(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): boolean {
  for (const c of campi) {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') {
      if (v === true && nomeNegativo(c)) return true;
    } else if (c.tipo === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s !== '' && (NEG_SELECT.test(s) || nomeNegativo(c))) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run utils/rapportini/voceColore.test.ts`
Expected: PASS (tutti, inclusi i 4 nuovi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/voceColore.ts utils/rapportini/voceColore.test.ts
git commit -m "feat(rapportini): haEsitoNegativo (rileva esito negativo della voce)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `contaFotoObbligatorieMancanti` salta le voci negative

**Files:**
- Modify: `utils/rapportini/fotoObbligatorieMancanti.ts`
- Modify: `utils/rapportini/fotoObbligatorieMancanti.test.ts`

- [ ] **Step 1: Aggiungi il test** in `utils/rapportini/fotoObbligatorieMancanti.test.ts`

READ il file per vedere la forma di `campi` e `PATH` usati. Aggiungi un test che dimostra che una voce con esito negativo NON conta le foto mancanti. Usa un campo crocetta "Assente" nel template e una voce con `assente: true` e foto mancante:
```ts
  it('voce con esito negativo → foto non obbligatorie (0 mancanti)', () => {
    const campiNeg = [
      { chiave: 'a', etichetta: 'Foto A', tipo: 'foto', obbligatoria: true, ordine: 1 },
      { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 2 },
    ] as never;
    expect(contaFotoObbligatorieMancanti([{ risposte: { assente: true } }], campiNeg)).toBe(0);
  });
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`
Expected: FAIL (oggi conterebbe 1 foto mancante).

- [ ] **Step 3: Implementa**

In `utils/rapportini/fotoObbligatorieMancanti.ts` aggiungi l'import:
```ts
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
```
e nel loop `for (const v of voci)`, subito dopo `const risposte = v.risposte ?? {};`, aggiungi:
```ts
    if (haEsitoNegativo(risposte, campi)) continue; // esito negativo → foto non obbligatorie
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`
Expected: PASS (tutti).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/fotoObbligatorieMancanti.ts utils/rapportini/fotoObbligatorieMancanti.test.ts
git commit -m "feat(rapportini): foto obbligatorie saltate sulle voci con esito negativo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `validaManualeClient` esito-aware

**Files:**
- Modify: `lib/offline/validateManuale.ts`
- Modify: `lib/offline/validateManuale.test.ts`

- [ ] **Step 1: Aggiungi il test** in `lib/offline/validateManuale.test.ts`

Aggiungi (riusa la const `campi` già nel file, che ha una foto obbligatoria; aggiungi un campo crocetta negativo passando un template esteso):
```ts
  it('esito negativo → foto non obbligatorie (ok anche senza foto)', () => {
    const campiNeg = [
      ...campi,
      { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 2 } as TemplateCampo,
    ];
    const r = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campiNeg,
      slotFotoPresenti: { foto_contatore: false },
      risposte: { assente: true },
    });
    expect(r.ok).toBe(true);
  });
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run lib/offline/validateManuale.test.ts`
Expected: FAIL (oggi `risposte` non è una prop accettata / la foto manca → non ok).

- [ ] **Step 3: Implementa**

In `lib/offline/validateManuale.ts`:
- aggiungi l'import:
```ts
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
```
- aggiungi `risposte?: Record<string, unknown>;` ai parametri di `args`.
- sostituisci la riga `const esito = validaFotoObbligatorie(args.campiTemplate, args.slotFotoPresenti);` con:
```ts
  const esito = haEsitoNegativo(args.risposte ?? {}, args.campiTemplate)
    ? { ok: true as const, mancanti: [] as string[] }
    : validaFotoObbligatorie(args.campiTemplate, args.slotFotoPresenti);
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run lib/offline/validateManuale.test.ts`
Expected: PASS (tutti).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/validateManuale.ts lib/offline/validateManuale.test.ts
git commit -m "feat(rapportini): validaManualeClient salta le foto su esito negativo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Modale + route — salta foto su esito negativo

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Modale**

READ `ModaleInterventoManuale.tsx`. Aggiungi l'import:
```ts
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
```
Trova il calcolo di `esitoFoto` (usa `validaFotoObbligatorie(campiEsito, …)`). Sostituiscilo con la versione che salta se l'esito è negativo:
```ts
  const esitoFoto = haEsitoNegativo(risposte, campiEsito)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(
        campiEsito,
        Object.fromEntries(slotFoto.map((c) => [c.chiave, foto[c.chiave] != null])),
      );
```
(`risposte` e `campiEsito` sono già nello scope del componente. Mantieni invariato il resto.)

- [ ] **Step 2: Route**

READ `app/api/r/[token]/intervento-manuale/route.ts`. Aggiungi l'import:
```ts
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
```
Trova la validazione foto (`const esito = validaFotoObbligatorie(campiTemplate, Object.fromEntries(slotFoto.map((c) => [c.chiave, fileBySlot.has(c.chiave)])));`). Sostituiscila con:
```ts
  const esito = haEsitoNegativo(dati.risposte, campiTemplate)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(
        campiTemplate,
        Object.fromEntries(slotFoto.map((c) => [c.chiave, fileBySlot.has(c.chiave)])),
      );
```
(`dati.risposte` e `campiTemplate` sono già definiti sopra nello stesso handler. Il `if (!esito.ok) return … 422` resta invariato.)

- [ ] **Step 3: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx "app/api/r/[token]/intervento-manuale/route.ts"`
Expected: nessun nuovo errore (baseline e2e/playwright a parte).

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(rapportini): modale+route saltano le foto obbligatorie su esito negativo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale
- [ ] `npx vitest run utils/rapportini/voceColore.test.ts utils/rapportini/fotoObbligatorieMancanti.test.ts lib/offline/validateManuale.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → nessun errore introdotto dal WP.
- [ ] Smoke sul deploy: intervento con esito negativo (es. crocetta "Assente" / select "NO") → si invia **senza** foto; con esito positivo le foto obbligatorie restano richieste.

## Fuori scope
- Risanamento (`righeIncomplete`): niente esito negativo, invariato.
- Note obbligatorie su esito negativo: invariate (logica separata in `voceColore`).
