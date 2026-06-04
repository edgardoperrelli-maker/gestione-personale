# WP2b — Interventi a 2 operatori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riconoscere gli interventi che richiedono 2 operatori e permettere all'ufficio di appaiare manualmente un secondo operatore durante la distribuzione sulla mappa, con l'intervento visibile in entrambe le sequenze.

**Architecture:** Un helper puro (`coppiaA2.ts`) per la validazione della coppia, il parsing additivo di "Num Risorse" in `excelParser.ts`, e lo stato runtime + UI nel file caldo `MappaOperatoriClient.tsx`. Nessuna migration, nessuna API, nessuna persistenza del 2° operatore.

**Tech Stack:** TypeScript, Vitest, React 19. Niente migration.

**Spec:** `docs/superpowers/specs/2026-06-04-wp2b-squadre-a2-design.md`

**Regole operative (da `docs/superpowers/roadmap-handoff.md`):**
- `git add` SOLO i file di ogni task (mai `-A`); mai committare `tsconfig.tsbuildinfo` né `.claude/settings.local.json`.
- Niente `npm run dev` dentro un subagent.
- Footer di OGNI commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/wp2b-squadre-a2` (già creato; spec già committata).
- Lint: baseline repo già rossa (memoria `lint-baseline-rosso`); verifica i file con `npx eslint <path>` (0 nuovi), e per il file caldo registra la baseline pre-edit.

---

## File Structure

| File | Responsabilità |
|------|----------------|
| `utils/routing/coppiaA2.ts` (Create) | `isCoppiaValida` — validazione pura della coppia. |
| `utils/routing/coppiaA2.test.ts` (Create) | Test vitest. |
| `utils/routing/excelParser.ts` (Modify) | `numRisorse` in `ColMap` + `requiresTwoOperators` da "Num Risorse". |
| `utils/routing/excelParser.test.ts` (Modify) | `detectFormat` mappa "Num Risorse". |
| `components/modules/mappa/MappaOperatoriClient.tsx` (Modify, CALDO, ULTIMO) | Stato `secondoOperatore`/`pairingTaskId`, badge, selettore, righe "supporto", reset. |

---

## Task 1: Helper coppia (`coppiaA2.ts`, TDD)

**Files:**
- Create: `utils/routing/coppiaA2.ts`
- Test: `utils/routing/coppiaA2.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/routing/coppiaA2.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCoppiaValida } from './coppiaA2';

describe('isCoppiaValida', () => {
  const sel = ['a', 'b', 'c'];
  it('2° valido: diverso dal principale e tra i selezionati', () => {
    expect(isCoppiaValida('a', 'b', sel)).toBe(true);
  });
  it('2° uguale al principale → false', () => {
    expect(isCoppiaValida('a', 'a', sel)).toBe(false);
  });
  it('2° non tra i selezionati → false', () => {
    expect(isCoppiaValida('a', 'z', sel)).toBe(false);
  });
  it('2° null o undefined o vuoto → false', () => {
    expect(isCoppiaValida('a', null, sel)).toBe(false);
    expect(isCoppiaValida('a', undefined, sel)).toBe(false);
    expect(isCoppiaValida('a', '', sel)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/coppiaA2.test.ts`
Expected: FAIL — modulo `./coppiaA2` inesistente.

- [ ] **Step 3: Implementa il modulo**

Crea `utils/routing/coppiaA2.ts`:

```ts
/**
 * Valida la scelta del secondo operatore per un intervento a 2 persone:
 * deve essere valorizzato, diverso dal principale e tra gli operatori selezionati.
 * Puro.
 */
export function isCoppiaValida(
  principaleId: string,
  secondoId: string | null | undefined,
  idsSelezionati: string[],
): boolean {
  if (!secondoId) return false;
  if (secondoId === principaleId) return false;
  return idsSelezionati.includes(secondoId);
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/routing/coppiaA2.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint utils/routing/coppiaA2.ts utils/routing/coppiaA2.test.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/coppiaA2.ts utils/routing/coppiaA2.test.ts
git commit -m "feat(wp2b): isCoppiaValida — validazione pura della coppia a-2" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: "Num Risorse" → `requiresTwoOperators` (`excelParser`)

**Files:**
- Modify: `utils/routing/excelParser.ts`
- Modify: `utils/routing/excelParser.test.ts`

**Contesto:** `detectFormat(headerRow)` (esportata) ritorna una `ColMap`. Il formato "Export Dati" usa header leggibili via `findCol`. Il template della mappa ha una colonna "Num Risorse" (valori 1/2). Pattern identico a quello usato per `durata` in WP2a.

- [ ] **Step 1: Aggiorna il test (TDD)**

In `utils/routing/excelParser.test.ts`, aggiungi in fondo:

```ts
describe('detectFormat · numRisorse', () => {
  it('mappa la colonna "Num Risorse" nel formato Export Dati', () => {
    const header = ['Indirizzo', 'CAP', 'Comune', 'Fascia', 'Num Risorse'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.numRisorse).toBe(4);
  });
  it('numRisorse = null se la colonna non esiste', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune']);
    expect(cm).not.toBeNull();
    expect(cm!.numRisorse).toBeNull();
  });
});
```

> Nota: `detectFormat` è già importato in `excelParser.test.ts` (aggiunto in WP2a). Riusa l'import esistente; non duplicarlo.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `ColMap` non ha `numRisorse`.

- [ ] **Step 3: Aggiungi `numRisorse` a `ColMap` e ai formati**

In `utils/routing/excelParser.ts`:

a) Nel tipo `ColMap`, aggiungi dopo `durata: number | null;`:

```ts
  numRisorse: number | null;
```

b) Nel ramo **ATTGIORN** del `return`, aggiungi dopo `durata: null,`:

```ts
      numRisorse: null,
```

c) In ENTRAMBI i `return` del ramo **Massiva**, aggiungi dopo `durata: null,`:

```ts
      numRisorse: null,
```

d) Nel ramo **Export Dati** (ultimo `return`), aggiungi dopo `durata: findCol(...),`:

```ts
    numRisorse: findCol(headers, [/num.*risors/, /^risorse$/, /n.*risorse/, /^operatori$/, /num.*operatori/]),
```

- [ ] **Step 4: Popola `requiresTwoOperators` nella costruzione del Task**

In `parseExcelToTasks`, dentro l'oggetto `task`, aggiungi dopo `durata_min: colMap.durata != null ? ... : undefined,`:

```ts
      requiresTwoOperators:
        colMap.numRisorse != null ? (Number.parseInt(str(row[colMap.numRisorse]), 10) >= 2 || undefined) : undefined,
```

- [ ] **Step 5: Esegui i test, type-check, lint**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS.
Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint utils/routing/excelParser.ts utils/routing/excelParser.test.ts`
Expected: nessun problema.

- [ ] **Step 6: Commit**

```bash
git add utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(wp2b): requiresTwoOperators dalla colonna Num Risorse (excelParser)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mappa — appaiamento manuale del 2° operatore (file CALDO, ULTIMO)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

> ⚠️ FILE CALDO. `git fetch` + rebase su `main` prima. Le righe possono shiftare: usa le ancore di testo.

- [ ] **Step 1: Fetch + rebase**

```bash
git fetch origin
git rebase origin/main
```
Expected: rebase pulito. In caso di conflitto, risolvere preservando le modifiche di `main`, poi `git rebase --continue`.

- [ ] **Step 2: Registra la baseline eslint**

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Annota il conteggio (es. "24 problems"). Gli edit non devono aumentarlo.

- [ ] **Step 3: Import dell'helper**

Dopo `import { formatEtaMin } from '@/utils/routing/timeEngine';` aggiungi:

```ts
import { isCoppiaValida } from '@/utils/routing/coppiaA2';
```

- [ ] **Step 4: Nuovi stati**

Subito dopo la riga `const [movingTaskId, setMovingTaskId] = useState<string | null>(null);`, aggiungi:

```ts
  const [secondoOperatore, setSecondoOperatore] = useState<Record<string, string>>({});
  const [pairingTaskId, setPairingTaskId] = useState<string | null>(null);
```

- [ ] **Step 5: Reset delle coppie**

In `clearExcel`, subito dopo `setShowOpPicker(false);` aggiungi:

```ts
    setSecondoOperatore({});
    setPairingTaskId(null);
```

In `handleFileChange`, subito dopo `setDistribution(null);` aggiungi:

```ts
    setSecondoOperatore({});
    setPairingTaskId(null);
```

In `caricaInterventiDelGiorno`, subito dopo `setDistribution(null);` aggiungi:

```ts
      setSecondoOperatore({});
      setPairingTaskId(null);
```

In `distributeToOps`, subito dopo la riga di apertura `const distributeToOps = useCallback(() => {` (come prima istruzione del corpo) aggiungi:

```ts
    setSecondoOperatore({});
    setPairingTaskId(null);
```

- [ ] **Step 6: Badge "2 operatori" + info 2° nel task**

Nel blocco `tasks.map((t, idx) => { ... })` dell'operatore attivo, subito DOPO l'IIFE dell'ETA (che termina con `})()}` dopo la riga `ETA {formatEtaMin(...)}`), aggiungi:

```tsx
                                {t.requiresTwoOperators && (() => {
                                  const secId = secondoOperatore[t.id];
                                  const secOp = secId ? selectedOps.find((o) => o.id === secId) : null;
                                  return (
                                    <div className="text-[var(--brand-violet)]">
                                      2 operatori{secOp ? ` · con ${secOp.name}` : ''}
                                    </div>
                                  );
                                })()}
```

- [ ] **Step 7: Bottone "2° op" accanto a "Sposta"**

Subito DOPO il bottone "Sposta" (il `</button>` che chiude `Sposta`), aggiungi:

```tsx
                              {t.requiresTwoOperators && (
                                <button
                                  type="button"
                                  onClick={() => setPairingTaskId(pairingTaskId === t.id ? null : t.id)}
                                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${pairingTaskId === t.id ? 'border-[var(--brand-violet)] bg-[var(--brand-violet-soft)] text-[var(--brand-violet)]' : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--brand-violet)] hover:text-[var(--brand-violet)]'}`}
                                >
                                  2° op
                                </button>
                              )}
```

- [ ] **Step 8: Selettore del 2° operatore**

Subito DOPO il blocco del selettore "Sposta" (il `)}` che chiude `{isMoving && ( ... )}`), aggiungi:

```tsx
                            {pairingTaskId === t.id && (
                              <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[var(--brand-border)] pt-1.5">
                                <span className="w-full text-[10px] text-[var(--brand-text-subtle)]">2° operatore:</span>
                                {selectedOps.map((o) => {
                                  if (!isCoppiaValida(distribution![activeOpIdx].staffId, o.id, selectedOps.map((x) => x.id))) return null;
                                  const isSel = secondoOperatore[t.id] === o.id;
                                  return (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onClick={() => {
                                        setSecondoOperatore((p) => ({ ...p, [t.id]: o.id }));
                                        setPairingTaskId(null);
                                      }}
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${isSel ? 'border-[var(--brand-violet)] bg-[var(--brand-violet-soft)] text-[var(--brand-violet)]' : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--brand-violet)]'}`}
                                    >
                                      {o.name}
                                    </button>
                                  );
                                })}
                                {secondoOperatore[t.id] && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSecondoOperatore((p) => {
                                        const n = { ...p };
                                        delete n[t.id];
                                        return n;
                                      });
                                      setPairingTaskId(null);
                                    }}
                                    className="rounded-full border border-[var(--brand-border)] px-2 py-0.5 text-[10px] text-[var(--brand-text-subtle)] hover:border-[var(--warning)] hover:text-[var(--warning)]"
                                  >
                                    Rimuovi
                                  </button>
                                )}
                              </div>
                            )}
```

- [ ] **Step 9: Righe "supporto" (l'operatore attivo come 2°)**

Subito DOPO la chiusura del `tasks.map(...)` (cioè dopo `})}` e prima del blocco `{unassignedTasks.length > 0 && (`), aggiungi:

```tsx
                    {(() => {
                      const attivoId = distribution![activeOpIdx].staffId;
                      const supporti = distribution!.flatMap((d) =>
                        d.tasks
                          .filter((t) => secondoOperatore[t.id] === attivoId)
                          .map((t) => ({ t, principale: d.op ?? 'Operatore' })),
                      );
                      if (!supporti.length) return null;
                      return (
                        <div className="mt-3 border-t border-[var(--brand-violet)]/30 pt-2">
                          <div className="mb-1 text-[10px] font-semibold text-[var(--brand-violet)]">
                            Supporto come 2° operatore ({supporti.length})
                          </div>
                          <div className="space-y-1">
                            {supporti.map(({ t, principale }) => (
                              <div key={`sup-${t.id}`} className="rounded-lg border border-[var(--brand-violet)]/20 px-2 py-1 text-xs">
                                <div className="truncate font-medium">{t.odl || t.id}</div>
                                <div className="truncate text-[var(--brand-text-muted)]">{t.indirizzo}{t.citta ? `, ${t.citta}` : ''}</div>
                                <div className="text-[10px] text-[var(--brand-violet)]">supporto a {principale}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
```

- [ ] **Step 10: Type-check e lint**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: stesso conteggio della baseline (Step 2), nessun nuovo problema.

- [ ] **Step 11: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(wp2b): mappa — appaiamento manuale del 2° operatore per gli interventi a-2" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Gate finali e chiusura WP

- [ ] **Step 1: Gate completi**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.
Run: `npx vitest run utils lib app components`
Expected: tutti verdi (inclusi `coppiaA2.test.ts` ed `excelParser.test.ts`). NOTA: usa il filtro sui path per escludere eventuali worktree di altre sessioni sotto `.claude/worktrees/`.

- [ ] **Step 2: Accettazione (manuale, a cura dell'utente con `npm run dev`)**

1. Carica interventi/Excel con un intervento a-2 (Num Risorse=2 o `richiede_due_operatori`).
2. Nella distribuzione, l'intervento mostra il badge "2 operatori" e il bottone "2° op".
3. Scegliendo un 2° operatore, compare "· con [nome]"; selezionando quell'operatore nel pannello, l'intervento appare come "supporto a [principale]".

- [ ] **Step 3: Chiusura WP**

```bash
git fetch origin
git rebase origin/main   # se origin/main è avanzato (altre sessioni)
# poi, per integrare in main: push del branch (lo lancia l'utente)
git push origin feat/wp2b-squadre-a2:main   # ESEGUITO DALL'UTENTE
```

Dopo il push confermato: allinea `main` (`git switch main && git reset --hard origin/main`) ed elimina il branch (`git branch -D feat/wp2b-squadre-a2`).

---

## Note di implementazione
- **Niente migration / API / persistenza del 2°**: tutto runtime nella mappa.
- **`requiresTwoOperators` da DB** già arriva via `mapInterventoToTask` (WP1); questo WP aggiunge solo il ramo Excel.
- **Principale = operatore attivo** (`distribution[activeOpIdx]`), nella cui lista appare l'intervento a-2.
- **Righe "supporto"**: derivate scorrendo tutta la distribuzione per `secondoOperatore[t.id] === attivoId`; sono informative (no km/ETA).
