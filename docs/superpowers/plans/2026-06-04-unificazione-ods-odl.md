# Unificazione ODS/ODL/ODSIN → campo unico `odl` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare l'identificativo committente (oggi diviso tra `odl` e `odsin`) in un unico campo `odl` con etichetta utente "ODS/ODL", in tutto il flusso rapportini-live + parser + DB, senza perdere dati e con retrocompatibilità per snapshot esistenti.

**Architecture:** Il parser produce un solo `Task.odl` (merge di colonna ODL + colonna ODS/ODSIN/CODICE/Id). La voce di rapportino e l'export usano `odl`; il catalogo campi-info espone la chiave `odl` ("ODS/ODL") con alias di lettura `odsin`. La colonna DB `rapportino_voci.odsin` viene rinominata `odl` (migrazione two-phase, lanciata dall'utente). `interventi.odl` resta invariato (è già canonico).

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Supabase (Postgres) · ExcelJS / xlsx · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-unificazione-ods-odl-design.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `utils/routing/excelParser.ts` | Modifica | Helper `resolveOdl` + merge in `parseExcelToTasks`; header "ODS"/"ODS/ODL" |
| `utils/routing/types.ts` | Modifica | Rimuove `Task.odsin` (cleanup finale) |
| `utils/rapportini/infoCampi.ts` | Modifica | Chiave `odl`/"ODS/ODL" + alias legacy `odsin` |
| `lib/rapportini/exportStandard.ts` | Modifica | `RapportinoVoce.odsin → odl` |
| `utils/rapportini/buildVoci.ts` | Modifica | `VoceSnapshot.odsin → odl`; `taskToVoce` copia `task.odl` |
| `lib/interventi/voceInterventoLink.ts` | Modifica | `VoceLinkKey`: un solo `odl` |
| `lib/interventi/taskToIntervento.ts` | Modifica | `odl: task.odl` (no fallback odsin) |
| `utils/routing/manualAssignments.ts` | Modifica | Regola ODS su `task.odl` |
| `app/api/mappa/rapportini/genera/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/api/interventi/risincronizza/route.ts` | Modifica | Chiave linker da `raw.odl ?? raw.odsin` |
| `app/r/[token]/page.tsx`, `app/hub/rapportini/eseguiti/page.tsx`, `app/hub/rapportini/contenuto/[id]/page.tsx`, `app/api/mappa/rapportini/export/route.ts`, `scripts/sync-esiti-rapportini.ts` | Modifica | Select/map colonna `odl` |
| `app/api/admin/rapportino-template/route.ts` | Modifica | Zod enum accetta `odl` (+ `odsin` tollerato) |
| `components/modules/rapportini/RapportinoForm.tsx` | Modifica | Tipo `Voce.odsin → odl` |
| `components/modules/mappa/ManualTaskModal.tsx` | Modifica | Campo + label "ODSIN" → "ODS/ODL" |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Modifica | Costruzione Task + header template |
| `app/hub/rapportini/massiva/page.tsx`, `app/hub/rapportini/clientela/page.tsx` | Modifica | Header Excel "ODSIN" → "ODS/ODL" |
| `supabase/migrations/20260604000000_unifica_ods_odl.sql` | Crea | Rinomina colonna + migrazione JSON |
| `*.test.ts` (8 file) | Modifica/Crea | Aggiorna aspettative + nuovi casi |

> **Regola commit:** `git add` SOLO dei file elencati in ogni task. MAI `git add -A` (eviti `tsconfig.tsbuildinfo` e `.claude/settings.local.json`).

---

## Task 1: Parser — identificativo `odl` unificato (TDD)

**Files:**
- Modify: `utils/routing/excelParser.ts`
- Test: `utils/routing/excelParser.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `utils/routing/excelParser.test.ts`, **modifica la riga 2** dell'import esistente (NON aggiungere un secondo import) da:
```ts
import { detectFormat } from './excelParser';
```
a:
```ts
import { detectFormat, resolveOdl } from './excelParser';
```

Poi aggiungi in fondo al file:
```ts
describe('resolveOdl — identificativo ODS/ODL unico', () => {
  it('preferisce la colonna ODL grezza', () => {
    expect(resolveOdl('ODL123', '20043151148', 'PDR9')).toBe('ODL123');
  });
  it('senza ODL usa la colonna ODS/ODSIN (numero pulito)', () => {
    expect(resolveOdl('', '20043151148', '')).toBe('20043151148');
  });
  it('estrae il 200xxxxxxxx quando il campo ODS ha testo extra', () => {
    expect(resolveOdl('', 'ABC 20012345678 XY', '')).toBe('20012345678');
  });
  it('fallback al PDR se non c\'è altro', () => {
    expect(resolveOdl('', '', 'PDR-9')).toBe('PDR-9');
  });
  it('tutto vuoto → stringa vuota', () => {
    expect(resolveOdl('', '', '')).toBe('');
  });
});

describe('detectFormat — header "ODS"', () => {
  it('riconosce una colonna intitolata "ODS" come odl', () => {
    const cm = detectFormat(['ODS', 'Indirizzo', 'CAP', 'Comune']);
    expect(cm).not.toBeNull();
    expect(cm!.odl).toBe(0);
    expect(cm!.via).toBe(1);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `resolveOdl` non esportata; `cm.odl` undefined per header "ODS".

- [ ] **Step 3: Implementazione**

In `utils/routing/excelParser.ts`, nella funzione `detectFormat`, sostituisci la riga 76:
```ts
  const odl = findCol(headers, [/^codice[_\s]*odl$/, /^odl$/]);
```
con:
```ts
  const odl = findCol(headers, [/^codice[_\s]*odl$/, /^odl$/, /^ods$/, /^ods\s*\/\s*odl$/]);
```

Subito dopo la funzione `extractOdsin` (dopo riga 194), aggiungi l'helper esportato:
```ts
/**
 * Identificativo ODS/ODL unico (ODL = ODS = ODSIN sono la stessa cosa).
 * Priorità: colonna ODL grezza → colonna ODS/ODSIN (numero 200xxxxxxxx estratto, altrimenti grezzo)
 * → estrazione/valore dal PDR. `extractOdsin` resta come normalizzatore quando il campo ha testo extra.
 */
export function resolveOdl(odlRaw: string, odsAltRaw: string, pdrRaw: string): string {
  if (odlRaw) return odlRaw;
  if (odsAltRaw) return extractOdsin(odsAltRaw) || odsAltRaw;
  return extractOdsin(pdrRaw) || pdrRaw || '';
}
```

In `parseExcelToTasks`, sostituisci il blocco righe 249-254:
```ts
    const odl = colMap.odl != null ? str(row[colMap.odl]) : (colMap.pdR != null ? str(row[colMap.pdR]) : '');
    const odsin =
      (colMap.odsin != null ? extractOdsin(row[colMap.odsin]) : undefined) ??
      extractOdsin(odl) ??
      (colMap.pdR != null ? extractOdsin(row[colMap.pdR]) : undefined) ??
      (colMap.odsin != null ? (str(row[colMap.odsin]) || undefined) : undefined);
```
con:
```ts
    const odlRaw = colMap.odl != null ? str(row[colMap.odl]) : '';
    const odsAltRaw = colMap.odsin != null ? str(row[colMap.odsin]) : '';
    const pdrRaw = colMap.pdR != null ? str(row[colMap.pdR]) : '';
    const odl = resolveOdl(odlRaw, odsAltRaw, pdrRaw);
    const odsin = odl || undefined; // compat: rimosso del tutto nel Task 6
```

> Nota: `task.odsin` resta presente (compat) finché il Task 6 non lo elimina insieme a `Task.odsin`. Nessun consumer si rompe nel frattempo.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS — vecchi test + 6 nuovi verdi.

- [ ] **Step 5: Commit**

```bash
git add utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(parser): identificativo ODS/ODL unico (resolveOdl + header ODS)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Catalogo campi-info + export server (`odl`/"ODS/ODL" + alias) (TDD)

**Files:**
- Modify: `utils/rapportini/infoCampi.ts`, `lib/rapportini/exportStandard.ts`
- Test: `utils/rapportini/infoCampi.test.ts`, `lib/rapportini/exportStandard.test.ts`

- [ ] **Step 1: Aggiorna i test (falliscono)**

In `utils/rapportini/infoCampi.test.ts`:
- riga 67, sostituisci `'odsin'` con `'odl'`:
```ts
    expect(dettaglio.map((c) => c.chiave)).toEqual(['matricola', 'pdr', 'odl', 'cap', 'recapito', 'attivita', 'accessibilita']);
```
- aggiungi un nuovo test dentro `describe('resolveInfoCampi', ...)`:
```ts
  it('alias legacy: chiave "odsin" viene normalizzata a "odl"', () => {
    const r = resolveInfoCampi([{ chiave: 'odsin' as never, etichetta: 'ODSIN', ordine: 1 }]);
    expect(r).toHaveLength(1);
    expect(r[0].chiave).toBe('odl');
    expect(r[0].etichetta).toBe('ODSIN'); // l'etichetta salvata viene conservata
  });
```

In `lib/rapportini/exportStandard.test.ts`, righe 33-35, sostituisci `'ODSIN'` con `'ODS/ODL'`:
```ts
    expect((rows[5] as unknown[]).slice(0, 12)).toEqual([
      'NOMINATIVO', 'MATRICOLA', 'PDR', 'ODS/ODL', 'VIA', 'COMUNE', 'CAP', 'RECAPITO', 'ATTIVITA', 'ACCESSIBILITA', 'FASCIA ORARIA', 'ORDINE',
    ]);
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts lib/rapportini/exportStandard.test.ts`
Expected: FAIL — chiave `odl` non nota / etichetta ancora "ODSIN".

- [ ] **Step 3: Implementazione `infoCampi.ts`**

In `utils/rapportini/infoCampi.ts`:
- riga 2 (tipo `InfoChiave`): sostituisci `'odsin'` con `'odl'`:
```ts
  | 'nominativo' | 'matricola' | 'pdr' | 'odl' | 'via'
```
- riga 16 (`INFO_CAMPI_DISPONIBILI`): sostituisci la entry odsin:
```ts
  { chiave: 'odl', etichettaDefault: 'ODS/ODL' },
```
- in `resolveInfoCampi`, sostituisci il blocco `return snapshot…` (righe 51-58):
```ts
  return snapshot
    .filter((c) => c && CHIAVI_NOTE.has(c.chiave))
    .map((c) => ({
      chiave: c.chiave,
      etichetta: (c.etichetta ?? '').trim() || defaultEtichetta(c.chiave),
      ordine: typeof c.ordine === 'number' ? c.ordine : 0,
    }))
    .sort((a, b) => a.ordine - b.ordine);
```
con:
```ts
  const CHIAVE_ALIAS: Record<string, InfoChiave> = { odsin: 'odl' };
  return snapshot
    .map((c) => (c && CHIAVE_ALIAS[c.chiave as string]
      ? { ...c, chiave: CHIAVE_ALIAS[c.chiave as string] }
      : c))
    .filter((c) => c && CHIAVI_NOTE.has(c.chiave))
    .map((c) => ({
      chiave: c.chiave,
      etichetta: (c.etichetta ?? '').trim() || defaultEtichetta(c.chiave),
      ordine: typeof c.ordine === 'number' ? c.ordine : 0,
    }))
    .sort((a, b) => a.ordine - b.ordine);
```

- [ ] **Step 4: Implementazione `exportStandard.ts`**

In `lib/rapportini/exportStandard.ts`, riga 27, sostituisci `odsin?: string | null;` con:
```ts
  odl?: string | null;
```

- [ ] **Step 5: Verifica che passino**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts lib/rapportini/exportStandard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add utils/rapportini/infoCampi.ts utils/rapportini/infoCampi.test.ts lib/rapportini/exportStandard.ts lib/rapportini/exportStandard.test.ts
git commit -m "feat(rapportini): campo-info odl 'ODS/ODL' + alias legacy odsin + export" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Voce + aggancio intervento su `odl` (TDD)

> Unito: rinominare `VoceSnapshot.odsin→odl` e togliere `odsin` da `VoceLinkKey` toccano gli stessi call site (`genera` legge `v.odsin`). Vanno insieme perché ogni commit compili.

**Files:**
- Modify: `utils/rapportini/buildVoci.ts`, `lib/interventi/voceInterventoLink.ts`, `app/api/mappa/rapportini/genera/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/api/interventi/risincronizza/route.ts`
- Test: `utils/rapportini/buildVoci.test.ts`, `lib/interventi/voceInterventoLink.test.ts`

- [ ] **Step 1: Aggiorna i test (falliscono)**

In `utils/rapportini/buildVoci.test.ts`, righe 5 e 7, sostituisci `odsin` con `odl`:
```ts
    const t = { id: 'x1', odl: 'O1', pdr: 'P1', indirizzo: 'Via A 1', citta: 'Roma', cap: '00100', nominativo: 'Mario', matricola: 'M1', recapito: '333', accessibilita: 'OK', attivita: 'S-AI-051', fascia_oraria: '8-12' };
    const v = taskToVoce(t, 3);
    expect(v).toMatchObject({ task_id: 'x1', ordine: 3, odl: 'O1', pdr: 'P1', via: 'Via A 1', comune: 'Roma', cap: '00100', nominativo: 'Mario', attivita: 'S-AI-051', fascia_oraria: '8-12' });
```

In `lib/interventi/voceInterventoLink.test.ts`, righe 14-18, sostituisci il test con:
```ts
  it('aggancia per ODL (voce.odl)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iO', odl: 'ODL-9' })]);
    expect(link({ staff_id: 's1', odl: 'ODL-9' })).toBe('iO');
  });
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run utils/rapportini/buildVoci.test.ts lib/interventi/voceInterventoLink.test.ts`
Expected: FAIL.

- [ ] **Step 3: `buildVoci.ts`**

- riga 8 (`VoceSnapshot`): `odsin?: string;` → `odl?: string;`
- riga 19 (`taskToVoce`): `odsin: task.odsin,` → `odl: task.odl,`

- [ ] **Step 4: `voceInterventoLink.ts`**

- righe 15-21 (`VoceLinkKey`): rimuovi `odsin`:
```ts
export type VoceLinkKey = {
  staff_id: string | null;
  odl?: string | null;
  matricola?: string | null;
  pdr?: string | null;
};
```
- riga 65: `get(byOdl, s, voce.odl, voce.odsin) ??` → `get(byOdl, s, voce.odl) ??`

- [ ] **Step 5: Call site `genera/route.ts` (righe 92-99)**

Sostituisci:
```ts
            const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
            const intervento_id = resolveIntervento({
              staff_id: op.staff_id,
              odl: raw.odl as string | null | undefined,
              odsin: (raw.odsin as string | null | undefined) ?? v.odsin,
              matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
              pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
            });
```
con:
```ts
            const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
            const intervento_id = resolveIntervento({
              staff_id: op.staff_id,
              odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
              matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
              pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
            });
```

- [ ] **Step 6: Call site `voce/route.ts` (righe 48-54)**

Sostituisci:
```ts
      const found = resolve({
        staff_id: rapAny.staff_id,
        odl: raw.odl as string | null | undefined,
        odsin: raw.odsin as string | null | undefined,
        matricola: raw.matricola as string | null | undefined,
        pdr: raw.pdr as string | null | undefined,
      });
```
con:
```ts
      const found = resolve({
        staff_id: rapAny.staff_id,
        odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined),
        matricola: raw.matricola as string | null | undefined,
        pdr: raw.pdr as string | null | undefined,
      });
```

- [ ] **Step 7: Call site `risincronizza/route.ts` (righe 60-66)**

Sostituisci:
```ts
        const interventoId = resolve({
          staff_id: rap.staff_id,
          odl: raw.odl as string | null | undefined,
          odsin: raw.odsin as string | null | undefined,
          matricola: raw.matricola as string | null | undefined,
          pdr: raw.pdr as string | null | undefined,
        });
```
con:
```ts
        const interventoId = resolve({
          staff_id: rap.staff_id,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined),
          matricola: raw.matricola as string | null | undefined,
          pdr: raw.pdr as string | null | undefined,
        });
```

- [ ] **Step 8: Verifica test + typecheck**

Run: `npx vitest run utils/rapportini/buildVoci.test.ts lib/interventi/voceInterventoLink.test.ts && npx tsc -p tsconfig.json`
Expected: PASS test + tsc senza errori.

- [ ] **Step 9: Commit**

```bash
git add utils/rapportini/buildVoci.ts utils/rapportini/buildVoci.test.ts lib/interventi/voceInterventoLink.ts lib/interventi/voceInterventoLink.test.ts app/api/mappa/rapportini/genera/route.ts app/api/r/[token]/voce/route.ts app/api/interventi/risincronizza/route.ts
git commit -m "refactor(rapportini): voce e aggancio intervento su odl unico" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `taskToIntervento` + `manualAssignments` usano `odl` (TDD)

**Files:**
- Modify: `lib/interventi/taskToIntervento.ts`, `utils/routing/manualAssignments.ts`
- Test: `lib/interventi/taskToIntervento.test.ts`, `utils/routing/manualAssignments.test.ts`

- [ ] **Step 1: Aggiorna i test (falliscono)**

In `lib/interventi/taskToIntervento.test.ts`:
- riga 8: rimuovi `odsin: '',`
- righe 48-50: sostituisci il test con:
```ts
  it('odl vuoto → null', () => {
    expect(taskToIntervento({ ...task, odl: '' }, ctx).odl).toBeNull();
  });
```

In `utils/routing/manualAssignments.test.ts`, sostituisci ogni `odsin:` con `odl:` (righe 32, 58, 94, 108):
```ts
  it('ODS su odl', () => { expect(matchesRule(task({ odl: 'ods-1' }), rule({ filtroOds: ['ODS-1'] }))).toBe(true); });
```
```ts
    const tasks = [task({ id: 'a', odl: 'O1', cap: '00044' })];
```
```ts
    const tasks = [task({ id: 'a', odl: 'O1' })];
```
```ts
    const tasks = [task({ id: 'a', indirizzo: 'Via Roma 12, Frascati', odl: undefined })];
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run lib/interventi/taskToIntervento.test.ts utils/routing/manualAssignments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementazione**

In `lib/interventi/taskToIntervento.ts`, riga 39, sostituisci:
```ts
    odl: (task.odl && task.odl.trim()) || (task.odsin && task.odsin.trim()) || null,
```
con:
```ts
    odl: (task.odl && task.odl.trim()) || null,
```

In `utils/routing/manualAssignments.ts`, riga 37, sostituisci:
```ts
  const ods = normValue(task.odsin);
```
con:
```ts
  const ods = normValue(task.odl);
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run lib/interventi/taskToIntervento.test.ts utils/routing/manualAssignments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/taskToIntervento.ts lib/interventi/taskToIntervento.test.ts utils/routing/manualAssignments.ts utils/routing/manualAssignments.test.ts
git commit -m "refactor(interventi/mappa): odl unico in taskToIntervento e regole ODS" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Letture DB + UI (rename `odsin → odl`, etichette "ODS/ODL")

**Files (modify):** `app/r/[token]/page.tsx`, `app/hub/rapportini/eseguiti/page.tsx`, `app/hub/rapportini/contenuto/[id]/page.tsx`, `app/api/mappa/rapportini/export/route.ts`, `scripts/sync-esiti-rapportini.ts`, `app/api/admin/rapportino-template/route.ts`, `components/modules/rapportini/RapportinoForm.tsx`, `components/modules/mappa/ManualTaskModal.tsx`, `components/modules/mappa/MappaOperatoriClient.tsx`, `app/hub/rapportini/massiva/page.tsx`, `app/hub/rapportini/clientela/page.tsx`

Nessun unit test: verifica con `npx tsc`. Modifiche puntuali:

- [ ] **Step 1: `app/r/[token]/page.tsx`**
  - Tipo voce (riga ~18): `odsin: string | null;` → `odl: string | null;`
  - Select (riga 111): nella stringa, `pdr, odsin, via` → `pdr, odl, via`
  - Map (riga 121): `odsin: v.odsin ?? undefined,` → `odl: v.odl ?? undefined,`

- [ ] **Step 2: Select-string (solo rinomina `odsin`→`odl` nella stringa di `.select(...)`)**
  - `app/hub/rapportini/eseguiti/page.tsx:53`
  - `app/hub/rapportini/contenuto/[id]/page.tsx:62`
  - `app/api/mappa/rapportini/export/route.ts:19`

- [ ] **Step 3: `scripts/sync-esiti-rapportini.ts`**
  - riga 39: `.select('id, odsin, risposte, intervento_id')` → `'id, odl, risposte, intervento_id'`
  - righe 47-48: nel tipo inline `odsin: string | null` → `odl: string | null`; `const k = (v.odsin ?? '').trim();` → `const k = (v.odl ?? '').trim();`

- [ ] **Step 4: `app/api/admin/rapportino-template/route.ts` (righe 27-34)**
  Sostituisci l'enum `InfoCampoSchema.chiave` per accettare `odl` (e tollerare il legacy `odsin`):
```ts
const InfoCampoSchema = z.object({
  chiave: z.enum([
    'nominativo', 'matricola', 'pdr', 'odl', 'odsin', 'via',
    'comune', 'cap', 'recapito', 'attivita', 'accessibilita', 'fascia_oraria',
  ]),
  etichetta: z.string().min(1),
  ordine: z.number().int(),
});
```

- [ ] **Step 5: `components/modules/rapportini/RapportinoForm.tsx` (riga 19)**
  Nel tipo `Voce`: `odsin?: string;` → `odl?: string;`

- [ ] **Step 6: `components/modules/mappa/ManualTaskModal.tsx`**
  - riga 9 (`ManualTaskData`): `odsin: string;` → `odl: string;`
  - riga 27 (stato iniziale): `odsin: ''` → `odl: ''`
  - riga 58 (label+input): sostituisci con:
```tsx
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">ODS/ODL</span><input className={inputCls} value={d.odl} onChange={set('odl')} /></label>
```

- [ ] **Step 7: `components/modules/mappa/MappaOperatoriClient.tsx`**
  - riga 610: `ODS: String(t.odsin ?? '').trim(),` → `ODS: String(t.odl ?? '').trim(),`
  - righe 1916-1918 (costruzione Task da `ManualTaskData`): sostituisci
```ts
      odl: '',
      priorita: 0,
      odsin: data.odsin.trim() || undefined,
```
    con:
```ts
      odl: data.odl.trim(),
      priorita: 0,
```
  - riga 2198 (header template scaricabile): sostituisci `'ODSIN'` con `'ODS/ODL'`. (Il parser ora riconosce l'header "ODS/ODL" via `/^ods\s*\/\s*odl$/`, quindi il template resta importabile.)

- [ ] **Step 8: Header Excel `massiva` e `clientela`**
  - `app/hub/rapportini/massiva/page.tsx:682`: nell'array header `'PDR','ODSIN','VIA'` → `'PDR','ODS/ODL','VIA'` (commento riga 719: `// ODSIN` → `// ODS/ODL`)
  - `app/hub/rapportini/clientela/page.tsx:187`: idem `'ODSIN'` → `'ODS/ODL'` (commento riga 215: `// ODSIN — non disponibile in clientela` → `// ODS/ODL — non disponibile in clientela`)

- [ ] **Step 9: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 10: Commit**

```bash
git add app/r/[token]/page.tsx app/hub/rapportini/eseguiti/page.tsx "app/hub/rapportini/contenuto/[id]/page.tsx" app/api/mappa/rapportini/export/route.ts scripts/sync-esiti-rapportini.ts app/api/admin/rapportino-template/route.ts components/modules/rapportini/RapportinoForm.tsx components/modules/mappa/ManualTaskModal.tsx components/modules/mappa/MappaOperatoriClient.tsx app/hub/rapportini/massiva/page.tsx app/hub/rapportini/clientela/page.tsx
git commit -m "feat(rapportini/mappa): UI e letture DB su odl 'ODS/ODL'" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Cleanup — rimuovi `Task.odsin` e l'output legacy del parser

**Files:**
- Modify: `utils/routing/types.ts`, `utils/routing/excelParser.ts`

- [ ] **Step 1: Rimuovi il campo dal tipo**

In `utils/routing/types.ts`, riga 4, rimuovi `odsin?: string;`.

- [ ] **Step 2: Rimuovi l'output legacy nel parser**

In `utils/routing/excelParser.ts`, in `parseExcelToTasks`:
- rimuovi la riga `const odsin = odl || undefined; // compat: rimosso del tutto nel Task 6`
- nell'oggetto `task` rimuovi la riga `odsin,`

- [ ] **Step 3: Typecheck + test completi**

Run: `npx tsc -p tsconfig.json && npm run test`
Expected: nessun errore TS; tutti i test verdi (eventuali residui `task.odsin` emergerebbero qui — non devono essercene).

- [ ] **Step 4: Commit**

```bash
git add utils/routing/types.ts utils/routing/excelParser.ts
git commit -m "refactor(parser): rimuove Task.odsin (identificativo unico odl)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Migrazione SQL (file)

**Files:**
- Create: `supabase/migrations/20260604000000_unifica_ods_odl.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- Unificazione ODS/ODL/ODSIN → colonna unica rapportino_voci.odl + migrazione campi-info.
-- Spec: docs/superpowers/specs/2026-06-04-unificazione-ods-odl-design.md
-- Strategia two-phase (zero-downtime). FASE 1 prima del deploy del codice; FASE 2 dopo.

-- ── FASE 1 (prima del deploy) ────────────────────────────────────────────────
-- 1a) nuova colonna + backfill (il codice vecchio continua a usare odsin)
alter table rapportino_voci add column if not exists odl text;
update rapportino_voci set odl = odsin where odl is null and odsin is not null;

-- 1b) migra i JSON campi-info: chiave odsin→odl; etichetta "ODSIN"→"ODS/ODL"
--     (le etichette personalizzate diverse da "ODSIN" vengono conservate)
update rapportino_template t
set info_campi = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(t.info_campi) e)
where t.info_campi @> '[{"chiave":"odsin"}]';

update rapportini r
set info_snapshot = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(r.info_snapshot) e)
where r.info_snapshot @> '[{"chiave":"odsin"}]';

-- ── FASE 2 (dopo che il nuovo codice è in produzione e stabile) ───────────────
-- Ri-backfill (copre eventuali voci scritte dal codice vecchio nella finestra) + drop.
-- update rapportino_voci set odl = odsin where odl is null and odsin is not null;
-- alter table rapportino_voci drop column if exists odsin;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260604000000_unifica_ods_odl.sql
git commit -m "feat(db): migrazione unificazione ODS/ODL (rapportino_voci.odl + JSON)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> La SQL la lancia l'utente (il Supabase MCP non è il DB prod). FASE 1 prima del deploy, FASE 2 (righe commentate) dopo. Vedi spec §5/§7.

---

## Task 8: Verifica finale

**Files:** nessuna modifica.

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: tutti verdi (inclusi i nuovi casi parser/infoCampi).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Lint dei file toccati** (la baseline del repo è già rossa: conta solo che NON ci siano nuovi problemi sui file modificati)

Run: `npx eslint utils/routing/excelParser.ts utils/rapportini/infoCampi.ts utils/rapportini/buildVoci.ts lib/rapportini/exportStandard.ts lib/interventi/voceInterventoLink.ts lib/interventi/taskToIntervento.ts utils/routing/manualAssignments.ts`
Expected: nessun nuovo errore introdotto.

- [ ] **Step 4: Verifica residui**

Ricerca testuale di `odsin` in `app/`, `lib/`, `utils/`, `components/`, `scripts/`: gli unici match attesi sono i fallback `raw.odsin` (genera/voce/risincronizza), l'enum tollerante in `rapportino-template/route.ts` e i commenti. Nessun `task.odsin`, `VoceSnapshot.odsin`, `voce.odsin`, colonna select `odsin`.

- [ ] **Step 5: Nessun commit** se tutto verde.

---

## Note finali (post-implementazione)
- Consegnare all'utente la **SQL** del Task 7 in chat (richiesta esplicita): FASE 1 da lanciare prima/insieme al deploy, FASE 2 dopo.
- Deploy = push su `main` → Vercel. Merge ff/push **solo** con ok esplicito dell'utente.
- **Comportamento intenzionalmente cambiato:** per i file il cui ODS/ODL stava nella colonna ODSIN/CODICE (senza colonna ODL), `task.odl` ora contiene quel valore; questo migliora il dedup `interventi (committente, odl, data)` ma cambia le chiavi rispetto al vecchio fallback su PDR.
```
