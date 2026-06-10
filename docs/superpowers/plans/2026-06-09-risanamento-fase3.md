# Risanamento — Fase 3 (Assegnazione & generazione link) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generare rapportini di tipo risanamento riusando la mappa: i civici si caricano come task con attività "RESINE", il template risanamento si preseleziona in automatico, e il rapportino eredita `tipo='risanamento'`.

**Architecture:** Helper puri riconoscono l'attività RESINE e risolvono il template risanamento. `MappaOperatoriClient` preseleziona quel template quando il piano ha task RESINE. `sincronizzaRapportini` salva lo snapshot `tipo` sul rapportino (colonna `rapportini.tipo`, già creata in Fase 1).

**Tech Stack:** Next.js 15, TypeScript, Supabase, Vitest, React 19.

**Vincoli:** Nessuna migration nuova (`rapportini.tipo` e `rapportino_template.tipo` esistono dalla Fase 1). Gate locali: unit test helper, `tsc`, `eslint` (baseline rossa → mirato), `npm run build`. Branch `feat/risanamento-fase3`. NO push senza ok. **Attenzione sessioni concorrenti**: verificare `git branch --show-current` prima di ogni commit.

---

## File Structure
- Create: `lib/risanamento/templateRisanamento.ts` (+ test) — helper puri.
- Modify: `lib/interventi/sincronizzaRapportini.ts` — select template `tipo` + snapshot `tipo` su INSERT/UPDATE.
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — `tipo` nei tipi dei template + preselezione automatica.

---

## Task 1: Helper riconoscimento RESINE + risoluzione template (TDD)

**Files:** Create `lib/risanamento/templateRisanamento.ts` + `lib/risanamento/templateRisanamento.test.ts`

- [ ] **Step 1: Test che fallisce** — `lib/risanamento/templateRisanamento.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAttivitaRisanamento, pianoHaRisanamento, risolviTemplateRisanamento, ATTIVITA_RISANAMENTO } from './templateRisanamento';

describe('isAttivitaRisanamento', () => {
  it('riconosce RESINE (case/trim insensitive)', () => {
    expect(isAttivitaRisanamento('RESINE')).toBe(true);
    expect(isAttivitaRisanamento(' resine ')).toBe(true);
    expect(isAttivitaRisanamento('Resine')).toBe(true);
  });
  it('rifiuta altre attività o vuoto', () => {
    expect(isAttivitaRisanamento('S-PR-007')).toBe(false);
    expect(isAttivitaRisanamento('')).toBe(false);
    expect(isAttivitaRisanamento(null)).toBe(false);
    expect(isAttivitaRisanamento(undefined)).toBe(false);
  });
  it('la costante è RESINE', () => {
    expect(ATTIVITA_RISANAMENTO).toBe('RESINE');
  });
});

describe('pianoHaRisanamento', () => {
  it('true se almeno un task ha attività RESINE', () => {
    expect(pianoHaRisanamento([{ attivita: 'X' }, { attivita: 'RESINE' }])).toBe(true);
  });
  it('false se nessun task RESINE o lista vuota', () => {
    expect(pianoHaRisanamento([{ attivita: 'X' }])).toBe(false);
    expect(pianoHaRisanamento([])).toBe(false);
  });
});

describe('risolviTemplateRisanamento', () => {
  const t = (id: string, tipo: string, nome: string, active = true) => ({ id, tipo, nome, active });
  it('primo template attivo tipo=risanamento per nome', () => {
    const res = risolviTemplateRisanamento([t('1', 'standard', 'A'), t('3', 'risanamento', 'Zeta'), t('2', 'risanamento', 'Alfa')]);
    expect(res).toBe('2'); // 'Alfa' < 'Zeta'
  });
  it('ignora i non-risanamento e i non-attivi', () => {
    expect(risolviTemplateRisanamento([t('1', 'standard', 'A'), t('2', 'risanamento', 'B', false)])).toBeNull();
  });
  it('null se nessun template risanamento', () => {
    expect(risolviTemplateRisanamento([t('1', 'standard', 'A')])).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run lib/risanamento/templateRisanamento.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `lib/risanamento/templateRisanamento.ts`:
```ts
/** Nome dell'attività che identifica un intervento di risanamento colonne. */
export const ATTIVITA_RISANAMENTO = 'RESINE';

/** True se l'attività indica risanamento (case-insensitive, trim). */
export function isAttivitaRisanamento(attivita: unknown): boolean {
  return String(attivita ?? '').trim().toUpperCase() === ATTIVITA_RISANAMENTO;
}

/** True se almeno un task del piano ha attività di risanamento. */
export function pianoHaRisanamento(tasks: Array<{ attivita?: string | null }>): boolean {
  return Array.isArray(tasks) && tasks.some((t) => isAttivitaRisanamento(t?.attivita));
}

/** Primo template attivo con tipo='risanamento' (ordine per nome IT), o null. */
export function risolviTemplateRisanamento(
  templates: Array<{ id: string; tipo?: string | null; active?: boolean; nome: string }>,
): string | null {
  const cand = templates
    .filter((t) => t.tipo === 'risanamento' && t.active !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  return cand[0]?.id ?? null;
}
```

- [ ] **Step 4: Esegui** `npx vitest run lib/risanamento/templateRisanamento.test.ts` → PASS.

- [ ] **Step 5: Lint** `npx eslint lib/risanamento/templateRisanamento.ts lib/risanamento/templateRisanamento.test.ts --max-warnings=0` → vuoto.

- [ ] **Step 6: Commit** (verifica prima `git branch --show-current` = `feat/risanamento-fase3`)
```bash
git add lib/risanamento/templateRisanamento.ts lib/risanamento/templateRisanamento.test.ts
git commit -m "feat(risanamento): helper riconoscimento RESINE + risoluzione template" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Snapshot `tipo` sul rapportino (sincronizzaRapportini)

**Files:** Modify `lib/interventi/sincronizzaRapportini.ts`

Leggi il file per ancorare gli edit. Il nome colonna sul rapportino è **`tipo`** (creata in Fase 1, migration 20260609010000), NON `tipo_snapshot`.

- [ ] **Step 1: Select template include `tipo`.** Trova la query del template (≈ riga 37): `.from('rapportino_template').select('id, campi, info_campi')...`. Aggiungi `tipo`:
```ts
const { data: tpl } = await db.from('rapportino_template').select('id, campi, info_campi, tipo').eq('id', opts.templateId).single();
```
Se `tpl` è tipizzato esplicitamente, aggiungi `tipo?: string | null` al suo tipo.

- [ ] **Step 2: INSERT include `tipo`.** Nel blocco `db.from('rapportini').insert({...})` (≈ riga 128), aggiungi `tipo` dopo `info_snapshot`:
```ts
template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', token, stato: 'in_corso', expires_at: expires,
```

- [ ] **Step 3: UPDATE include `tipo`.** Nel `patch` dell'UPDATE (≈ riga 139-141), aggiungi `tipo`:
```ts
const patch: Record<string, unknown> = {
  template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', expires_at: expires,
};
```

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "sincronizzaRapportini"` → vuoto.

- [ ] **Step 5: Lint** `npx eslint lib/interventi/sincronizzaRapportini.ts --max-warnings=0` → vuoto (o solo eventuali problemi preesistenti non introdotti da questo diff; verifica con `git show HEAD:...` se dubbio).

- [ ] **Step 6: Commit** (verifica branch)
```bash
git add lib/interventi/sincronizzaRapportini.ts
git commit -m "feat(risanamento): snapshot del tipo template sul rapportino generato" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Preselezione automatica del template risanamento (mappa)

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

File grande: leggilo per individuare i punti esatti (i riferimenti di riga sotto sono indicativi e possono essere shiftati).

- [ ] **Step 1: Import helper.** In cima al file, aggiungi:
```ts
import { pianoHaRisanamento, risolviTemplateRisanamento } from '@/lib/risanamento/templateRisanamento';
```

- [ ] **Step 2: `tipo` nei tipi dei template.** Lo stato `rapTemplates` (≈ riga 719) e l'array nel fetch (≈ riga 1813) usano un tipo inline `Array<{ id: string; nome: string; is_default?: boolean; solo_manuale?: boolean; campi?: ...; info_campi?: ... }>`. Aggiungi `tipo?: string;` a ENTRAMBE le occorrenze del tipo inline (state e fetch), così:
```ts
Array<{ id: string; nome: string; is_default?: boolean; solo_manuale?: boolean; tipo?: string; campi?: TemplateCampo[]; info_campi?: TemplateInfoCampo[] }>
```

- [ ] **Step 3: useEffect di preselezione.** Lo stato dei task assegnati è `distribution` (`DistEntry[] | null`, ≈ riga 679); ogni `DistEntry` ha `.tasks: Task[]`. Aggiungi questo `useEffect` (vicino agli altri useEffect del componente, dopo la dichiarazione di `distribution` e di `rapTemplates`/`setRapTemplateId`):
```ts
  // Risanamento: se il piano ha task con attività RESINE, preseleziona il template risanamento.
  useEffect(() => {
    if (rapTemplates.length === 0 || !distribution) return;
    const tasks = distribution.flatMap((d) => d.tasks);
    if (!pianoHaRisanamento(tasks)) return;
    const tplId = risolviTemplateRisanamento(rapTemplates);
    if (tplId) setRapTemplateId(tplId);
  }, [distribution, rapTemplates]);
```
La preselezione dipende da `[distribution, rapTemplates]`: scatta quando i task del piano (o i template) cambiano, NON quando l'admin cambia manualmente il dropdown (`rapTemplateId` non è fra le dipendenze) — così un override manuale successivo non viene sovrascritto. `d.tasks` è `Task[]` e `Task.attivita?: string` (utils/routing/types.ts), compatibile con `pianoHaRisanamento`.

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "MappaOperatoriClient"` → vuoto.

- [ ] **Step 5: Lint** `npx eslint "components/modules/mappa/MappaOperatoriClient.tsx" --max-warnings=0` → vuoto (o solo problemi preesistenti non introdotti).

- [ ] **Step 6: Commit** (verifica branch)
```bash
git add "components/modules/mappa/MappaOperatoriClient.tsx"
git commit -m "feat(risanamento): preseleziona il template risanamento quando il piano ha attività RESINE" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verifica finale

- [ ] **Step 1:** `npx vitest run lib/risanamento/templateRisanamento.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "risanamento|sincronizzaRapportini|MappaOperatoriClient"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file toccati → puliti (a meno di problemi preesistenti documentati).
- [ ] **Step 4:** `npm run build` → ok.
- [ ] **Step 5:** Riepilogo: Fase 3 pronta sul branch; nessuna migration nuova; l'attività "RESINE" va creata in Impostazioni → Gruppo Attività (config, niente codice). Rendering operativo/scanner (Fase 4) e chiusura/PDF (Fase 5) restano per dopo.

---

## Self-review (copertura spec Fase 3)
- Helper RESINE + risoluzione template (Sezione 1 spec) → Task 1 ✓
- Preselezione automatica del template (Sezione 2 spec) → Task 3 ✓
- Snapshot `tipo` sul rapportino (Sezione 3 spec) → Task 2 ✓
- Voci-civico (Sezione 4 spec): nessun cambiamento a `taskToVoce` → nessun task (corretto, è già così; le voci-civico nascono dai task come oggi) ✓
- Caricamento civici (import/manuale mappa): riuso esistente, nessun task ✓
- Attività "RESINE" come dato di config → Task 4 Step 5 (nota) ✓
- Fuori scope (Fase 4/5) → nessun task li tocca ✓

## Note tipi
- Colonna rapportino = `tipo` (non `tipo_snapshot`). Valori `'standard'|'risanamento'` coerenti con Fase 1 (CHECK) e Fase 2 (template.tipo).
- Helper firma: `risolviTemplateRisanamento(templates) → string | null` usata nel client (Task 3) sui `rapTemplates` (che ora hanno `tipo`).
- `pianoHaRisanamento(tasks)` accetta `Array<{attivita?}>`; i Task del progetto hanno `attivita?: string` (utils/routing/types.ts).
