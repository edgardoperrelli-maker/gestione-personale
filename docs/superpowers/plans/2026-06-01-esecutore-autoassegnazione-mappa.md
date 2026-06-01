# Auto-assegnazione da colonna Esecutore + Copia link visibile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caricando un Excel con la colonna "Esecutore" valorizzata, il modulo mappa auto-seleziona gli operatori, fissa ogni intervento al suo esecutore, distribuisce (in automatico dopo la geocodifica) e mantiene il flusso normale; inoltre rende il pulsante "Copia link" del rapportino più visibile.

**Architecture:** Una funzione pura (`utils/routing/esecutore.ts`) abbina i nomi Esecutore agli operatori dell'anagrafica e produce i "pin" task→operatore. Il client (`MappaOperatoriClient.tsx`) costruisce i pin al caricamento, auto-seleziona gli operatori, e `distributeToOps` rispetta i pin riusando il percorso `manualPre` (assegnazioni forzate) già esistente; le righe non pinnate seguono il bilanciamento normale. Un `useEffect` lancia la distribuzione una volta a geocodifica completata.

**Tech Stack:** Next.js 15, React 19, TypeScript, xlsx, Vitest, Tailwind (tema Aurea `--brand-*`).

**Spec:** `docs/superpowers/specs/2026-06-01-esecutore-autoassegnazione-mappa-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `utils/routing/excelParser.ts` | Riconoscere l'header "Esecutore" → popola `task._operatore` | Modify |
| `utils/routing/esecutore.ts` (+ test) | `matchEsecutore` + `buildEsecutorePins` (puri) | Create |
| `utils/routing/index.ts` | Re-export di `matchEsecutore`/`buildEsecutorePins` | Modify |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Stato pin/avvisi; auto-assegnazione in `handleFileChange`; pin in `distributeToOps`; auto-distribuzione; UI avviso + Copia link | Modify |

**Fatto chiave:** in `distributeToOps`, `result` unisce `manualPre.get(i)` + `preAssigned.get(i)` + auto-bilanciati (riga ~1714-1719). Aggiungendo i task pinnati a `manualPre` e a `manualAssignedIds` **prima** del calcolo di `afterManual`, i pin vengono esclusi da ZTL/bilanciamento e inclusi nel bucket del loro operatore.

**Match operatore:** `op.id` = staff_id; `op.displayName` = "COGNOME NOME". Il valore Esecutore è un cognome (es. `PASTORELLI`).

---

## Task 1: Il parser riconosce "Esecutore"

**Files:** Modify `utils/routing/excelParser.ts`

- [ ] **Step 1: Estendere il pattern della colonna operatore.** In `detectFormat`, nel ramo "Export Dati / Geocall", sostituire la riga (≈151):

```ts
    operatore: findCol(headers, [/^operatore$/, /^risorsa$/, /^tecnico$/, /^nome (operatore|tecnico|risorsa)$/]),
```
con:
```ts
    operatore: findCol(headers, [/^operatore$/, /^risorsa$/, /^tecnico$/, /^esecutore$/, /^addetto$/, /^nome (operatore|tecnico|risorsa)$/]),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**
```bash
git add utils/routing/excelParser.ts
git commit -m "feat(mappa): il parser riconosce la colonna Esecutore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Nota: nessun unit test qui — `parseExcelToTasks` legge un `File` (difficile da testare in isolamento). Coperto dai test della Task 2 e dalla verifica manuale (Task 7). Il valore finisce già in `task._operatore` (excelParser righe ~242/267), nessun'altra modifica.

---

## Task 2: Logica pura `esecutore.ts`

**Files:**
- Create: `utils/routing/esecutore.ts`
- Create (test): `utils/routing/esecutore.test.ts`
- Modify: `utils/routing/index.ts`

- [ ] **Step 1: Scrivere il test (fallisce)** — `utils/routing/esecutore.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { matchEsecutore, buildEsecutorePins } from './esecutore';

const ops = [
  { id: 's1', displayName: 'PASTORELLI MARIO' },
  { id: 's2', displayName: 'DE SANTIS ALESSANDRO' },
  { id: 's3', displayName: 'ROSSI LUIGI' },
  { id: 's4', displayName: 'ROSSI ANNA' },
];

describe('matchEsecutore', () => {
  it('abbina per cognome singolo', () => {
    expect(matchEsecutore('PASTORELLI', ops)?.id).toBe('s1');
  });
  it('abbina cognome composto multi-token', () => {
    expect(matchEsecutore('DE SANTIS', ops)?.id).toBe('s2');
  });
  it('ignora maiuscole/minuscole e spazi extra', () => {
    expect(matchEsecutore('  pastorelli ', ops)?.id).toBe('s1');
  });
  it('ritorna null se non trovato', () => {
    expect(matchEsecutore('BIANCHI', ops)).toBeNull();
  });
  it('ritorna null se ambiguo (più match)', () => {
    expect(matchEsecutore('ROSSI', ops)).toBeNull();
  });
});

describe('buildEsecutorePins', () => {
  it('costruisce pin, operatori da selezionare e non abbinati', () => {
    const tasks = [
      { id: 't1', _operatore: 'PASTORELLI' },
      { id: 't2', _operatore: 'PASTORELLI' },
      { id: 't3', _operatore: 'DE SANTIS' },
      { id: 't4', _operatore: 'BIANCHI' },
      { id: 't5' },
    ];
    const res = buildEsecutorePins(tasks, ops);
    expect(res.pins).toEqual({ t1: 's1', t2: 's1', t3: 's2' });
    expect([...res.operatoriDaSelezionare].sort()).toEqual(['s1', 's2']);
    expect(res.nonAbbinati).toEqual(['BIANCHI']);
  });
  it('nessun esecutore → tutto vuoto', () => {
    const res = buildEsecutorePins([{ id: 't1' }], ops);
    expect(res.pins).toEqual({});
    expect(res.operatoriDaSelezionare).toEqual([]);
    expect(res.nonAbbinati).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test → FAIL**

Run: `npx vitest run utils/routing/esecutore.test.ts`
Expected: FAIL (`Cannot find module './esecutore'`).

- [ ] **Step 3: Implementare** — `utils/routing/esecutore.ts`

```ts
export type OpLite = { id: string; displayName: string };

/** Normalizza in token: maiuscole, senza accenti, solo alfanumerici. */
function tokens(s: string): string[] {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // togli accenti (combining diacritics)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Abbina un nome (es. "PASTORELLI") a un operatore: match se TUTTI i token del
 * nome sono presenti nei token del displayName. Nessun match o più match → null.
 */
export function matchEsecutore<T extends OpLite>(nome: string, operators: T[]): T | null {
  const needle = tokens(nome);
  if (needle.length === 0) return null;
  const matches = operators.filter((op) => {
    const hay = new Set(tokens(op.displayName));
    return needle.every((t) => hay.has(t));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Costruisce i pin task→operatore dai task che hanno `_operatore`. */
export function buildEsecutorePins<T extends OpLite>(
  tasks: { id: string; _operatore?: string }[],
  operators: T[],
): { pins: Record<string, string>; operatoriDaSelezionare: string[]; nonAbbinati: string[] } {
  const pins: Record<string, string> = {};
  const selezionati = new Set<string>();
  const nonAbbinati = new Set<string>();
  for (const t of tasks) {
    const nome = (t._operatore ?? '').trim();
    if (!nome) continue;
    const op = matchEsecutore(nome, operators);
    if (op) {
      pins[t.id] = op.id;
      selezionati.add(op.id);
    } else {
      nonAbbinati.add(nome.toUpperCase());
    }
  }
  return { pins, operatoriDaSelezionare: [...selezionati], nonAbbinati: [...nonAbbinati] };
}
```

- [ ] **Step 4: Re-export** — in `utils/routing/index.ts` aggiungere:
```ts
export { matchEsecutore, buildEsecutorePins } from './esecutore';
```

- [ ] **Step 5: Eseguire i test → PASS**

Run: `npx vitest run utils/routing/esecutore.test.ts`
Expected: PASS (7 assert).

- [ ] **Step 6: Typecheck + commit**
```bash
npx tsc --noEmit
git add utils/routing/esecutore.ts utils/routing/esecutore.test.ts utils/routing/index.ts
git commit -m "feat(mappa): matchEsecutore + buildEsecutorePins puri + test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stato + auto-assegnazione in `handleFileChange`

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import.** Aggiungere `buildEsecutorePins` all'import esistente da `@/utils/routing` (riga ~10):
```ts
import { geocodeTask, optimizeRoute, optimizeRouteByFascia, parseExcelToTasks, buildEsecutorePins } from '@/utils/routing';
```

- [ ] **Step 2: Stato.** Subito dopo `const [savedDistribution, setSavedDistribution] = useState(false);` (riga ~693) aggiungere:
```ts
  // Auto-assegnazione da colonna Esecutore
  const [esecutorePins, setEsecutorePins] = useState<Record<string, string>>({});
  const [esecutoreWarnings, setEsecutoreWarnings] = useState<string[]>([]);
  const esecutoreAutoDistributedRef = useRef(false);
```

- [ ] **Step 3: Auto-assegnazione nel `handleFileChange`.** Sostituire la coda della funzione (le righe da `setDistribution(null);` fino a `}, []);`, ≈1292-1297):
```ts
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedOps([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);
  }, []);
```
con:
```ts
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);

    // ── Auto-assegnazione da colonna Esecutore ──
    esecutoreAutoDistributedRef.current = false;
    const { pins, operatoriDaSelezionare, nonAbbinati } = buildEsecutorePins(filtered, operatorOptions);
    setEsecutorePins(pins);
    setEsecutoreWarnings(nonAbbinati);
    if (operatoriDaSelezionare.length > 0) {
      const counts: Record<string, number> = {};
      for (const sid of Object.values(pins)) counts[sid] = (counts[sid] ?? 0) + 1;
      const autoOps: OpConfig[] = operatoriDaSelezionare.map((staffId) => {
        const operator = operatorOptions.find((o) => o.id === staffId)!;
        const isRepOnDay = operator.reperibileDates.includes(planningDate);
        const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
        const base = usesHome
          ? { lat: operator.homeLat!, lng: operator.homeLng! }
          : operator.startLat != null && operator.startLng != null
            ? { lat: operator.startLat, lng: operator.startLng }
            : null;
        const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;
        return { id: staffId, name: operator.displayName, qty: counts[staffId] ?? 0, base, startAddress };
      });
      setSelectedOps(autoOps);
    } else {
      setSelectedOps([]);
    }
  }, [operatorOptions, planningDate]);
```

> Nota: la dependency array di `handleFileChange` passa da `[]` a `[operatorOptions, planningDate]` perché ora la funzione li legge (evita valori stale). La logica base/startAddress replica quella di `toggleOp` (riga ~1463-1470).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): pin esecutore + auto-selezione operatori al caricamento" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `distributeToOps` rispetta i pin esecutore

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Inserire il blocco pin.** In `distributeToOps`, subito DOPO la riga che costruisce `manualAssignedIds` (≈1661-1663) e PRIMA della riga `const afterManual = geocoded.filter((t) => !manualAssignedIds.has(t.id));` (≈1664), inserire:

```ts
    // ── Pin esecutore: forza i task al loro operatore (come le assegnazioni manuali) ──
    if (Object.keys(esecutorePins).length > 0) {
      for (const t of geocoded) {
        const staffId = esecutorePins[t.id];
        if (!staffId) continue;
        if (manualAssignedIds.has(t.id)) continue; // già preso da una regola manuale
        const i = idxByStaff.get(staffId);
        if (i == null) continue; // operatore non selezionato → lascia al flusso normale
        manualPre.get(i)!.push(t);
        manualAssignedIds.add(t.id);
      }
    }
```

- [ ] **Step 2: Aggiornare la dependency array** di `distributeToOps` (≈1766) aggiungendo `esecutorePins`:
```ts
  }, [selectedOps, allTasks, ztlZones, manualRules, operatorLocks, esecutorePins]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): distribuzione rispetta i pin esecutore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Auto-distribuzione dopo la geocodifica

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Aggiungere l'effetto.** Subito DOPO la definizione di `distributeToOps` (dopo la sua riga di chiusura `}, [...]);` ≈1766), inserire:

```ts
  // Auto-distribuzione dopo la geocodifica per i file con colonna Esecutore
  useEffect(() => {
    const total = geocodingProgress?.total ?? 0;
    const done = geocodingProgress?.done ?? 0;
    if (
      total > 0 &&
      done === total &&
      Object.keys(esecutorePins).length > 0 &&
      selectedOps.length > 0 &&
      !distribution &&
      !esecutoreAutoDistributedRef.current
    ) {
      esecutoreAutoDistributedRef.current = true;
      distributeToOps();
    }
  }, [geocodingProgress, esecutorePins, selectedOps, distribution, distributeToOps]);
```

> Il `ref` garantisce un solo avvio automatico per file (viene resettato a `false` nel `handleFileChange` della Task 3). Dopo un "Azzera" non ri-distribuisce da solo; al caricamento di un nuovo file riparte.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): auto-distribuzione dopo geocodifica per file con esecutore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: UI — avviso esecutori non abbinati + "Copia link" prominente

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Banner avviso.** Nel pannello "Distribuisci tra operatori", subito DOPO il `</div>` che chiude l'intestazione `flex items-center justify-between` (quella con il testo "Distribuisci tra operatori" e il bottone "Seleziona +"/"Chiudi -", ≈riga 2233) e PRIMA del blocco `{showOpPicker && (`, inserire:

```tsx
                {esecutoreWarnings.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-2.5 py-1.5 text-[10px] text-[var(--warning)]">
                    ⚠ Esecutori non riconosciuti (distribuiti automaticamente): {esecutoreWarnings.join(', ')}
                  </div>
                )}
```

- [ ] **Step 2: "Copia link" prominente.** Nel blocco per-operatore (l'IIFE `{(() => { const r = rapByStaff.get(op.id); ... })()}`, ≈righe 2374-2406), sostituire il `<div className="mt-1 flex flex-wrap items-center gap-1"> ... </div>` interno con la versione che mette **Copia link** per primo e in stile primario cyan:

```tsx
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLink(r)}
                                      className="rounded bg-[var(--brand-primary)] px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.16_0.06_245)] hover:bg-[var(--brand-primary-hover)]"
                                    >
                                      {copiedToken === r.token ? '✓ Copiato!' : '🔗 Copia link'}
                                    </button>
                                    <a
                                      href={whatsappHref(r.staff_name, rapDataLabel, r.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--success)] hover:opacity-80"
                                    >
                                      WhatsApp
                                    </a>
                                    <a
                                      href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                                      className="rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                                    >
                                      Excel
                                    </a>
                                  </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): avviso esecutori non abbinati + Copia link prominente" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verifica end-to-end

**Files:** nessuno (solo verifica). Serve l'app + Supabase (`npm run dev`) e il template allegato (`template_mappa_operatori_con_nominativo (2).xlsx`, colonna Esecutore = "PASTORELLI").

- [ ] **Step 1: Suite test + tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tutti i test PASS (incl. i nuovi di `esecutore.test.ts`), nessun errore di tipo.

- [ ] **Step 2: Flusso esecutore (file allegato)**
  1. Mappa → importa il template → l'operatore corrispondente a "PASTORELLI" risulta **già selezionato** con il numero di interventi giusto (se "PASTORELLI" è in anagrafica).
  2. Geocodifica → a fine geocodifica la **distribuzione parte da sola**, con tutti gli interventi su PASTORELLI.
  3. Salva → Genera rapportini → accanto all'operatore compare **"🔗 Copia link"** ben visibile (cyan), poi WhatsApp ed Excel.

- [ ] **Step 3: Nome non in anagrafica**
  - Carica un file con un Esecutore inesistente (o modifica una cella) → compare il **banner giallo** "Esecutori non riconosciuti…"; quelle righe vengono comunque distribuite.

- [ ] **Step 4: File misto / senza esecutore**
  - File senza colonna Esecutore → comportamento invariato (nessuna auto-selezione, nessuna auto-distribuzione, si distribuisce a mano come prima).

- [ ] **Step 5: Copia link**
  - Click su "🔗 Copia link" → l'URL `…/r/<token>` è negli appunti (toggle "✓ Copiato!").

---

## Note per chi esegue

- **Nessuna SQL / migrazione.**
- Il pin esecutore riusa il percorso `manualPre`: i task pinnati vengono aggiunti a `manualPre`+`manualAssignedIds` prima di `afterManual`, quindi esclusi da ZTL/bilanciamento e inclusi nel bucket dell'operatore (riga ~1714-1719 di `distributeToOps`).
- Coerenza tipi: `matchEsecutore`/`buildEsecutorePins` (Task 2) usati in `handleFileChange` (Task 3); `esecutorePins` (stato Task 3) letto da `distributeToOps` (Task 4) e dall'effetto di auto-distribuzione (Task 5).
- `handleFileChange` cambia deps da `[]` a `[operatorOptions, planningDate]`: necessario perché ora legge questi valori.
- Si mantiene il campo ad-hoc `_operatore` (convenzione esistente), nessuna modifica al tipo `Task`.
