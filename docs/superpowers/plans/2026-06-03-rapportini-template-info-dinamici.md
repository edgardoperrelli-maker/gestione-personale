# Rapportini — Template con informazioni dinamiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere configurabile per-template quali informazioni del DB appaiono nel rapportino (oltre ai campi compilabili), riflesso sia nel rapportino elettronico sia nell'export Excel; come prerequisito far leggere la `MATRICOLA` dall'import.

**Architecture:** Una nuova colonna `info_campi` (jsonb) su `rapportino_template`, snapshot in `rapportini.info_snapshot` alla generazione. Un unico modulo `utils/rapportini/infoCampi.ts` è la sorgente di verità delle colonne info, usato da form ed export. Fallback agli 11 campi storici quando lo snapshot è vuoto → retrocompatibilità totale.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres jsonb), ExcelJS + SheetJS (`xlsx`), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-rapportini-template-info-dinamici-design.md`

**Convenzione commit:** ogni commit termina con la riga
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
(omessa negli esempi per brevità).

**Comandi:** test = `npm test` (vitest run) o `npx vitest run <file>`; type-check = `npx tsc --noEmit`.

---

## File map

| File | Responsabilità | Azione |
|------|----------------|--------|
| `utils/rapportini/infoCampi.ts` | Sorgente di verità campi info (tipi, lista, resolve, valore) | Create |
| `utils/rapportini/infoCampi.test.ts` | Test del modulo | Create |
| `supabase/migrations/20260603000000_rapportini_info_campi.sql` | Colonne `info_campi`/`info_snapshot` + seed Standard | Create |
| `utils/routing/excelParser.ts` | Legge `MATRICOLA` nel formato "Export Dati"; esporta `detectFormat` | Modify |
| `utils/routing/excelParser.test.ts` | Test detectFormat (matricola) | Create |
| `app/api/admin/rapportino-template/route.ts` | Validazione + persistenza `info_campi` | Modify |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | UI "Informazioni da mostrare" | Modify |
| `app/api/mappa/rapportini/genera/route.ts` | Snapshot `info_snapshot` | Modify |
| `app/r/[token]/page.tsx` | Legge/passa `info_snapshot` | Modify |
| `components/modules/rapportini/RapportinoForm.tsx` | Render info dinamico | Modify |
| `lib/rapportini/exportStandard.ts` | Builder export dinamico unico | Modify |
| `lib/rapportini/exportStandard.test.ts` | Test builder dinamico | Create |
| `app/api/mappa/rapportini/export/route.ts` | Usa builder unico + `info_snapshot` | Modify |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Export ZIP dinamico + `MATRICOLA` nel template scaricabile | Modify |

---

## Task 1: Modulo sorgente-di-verità `infoCampi.ts`

**Files:**
- Create: `utils/rapportini/infoCampi.ts`
- Test: `utils/rapportini/infoCampi.test.ts`

- [ ] **Step 1: Write the failing test**

`utils/rapportini/infoCampi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  resolveInfoCampi,
  infoCampiDefault,
  valoreInfo,
  INFO_CAMPI_DISPONIBILI,
} from './infoCampi';

describe('resolveInfoCampi', () => {
  it('snapshot vuoto → tutti gli 11 di default', () => {
    const r = resolveInfoCampi([]);
    expect(r).toHaveLength(11);
    expect(r.map((c) => c.chiave)).toEqual(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));
    expect(r[1]).toMatchObject({ chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 2 });
  });

  it('null/undefined → default', () => {
    expect(resolveInfoCampi(null)).toHaveLength(11);
    expect(resolveInfoCampi(undefined)).toHaveLength(11);
  });

  it('ordina per ordine e rispetta le etichette custom', () => {
    const r = resolveInfoCampi([
      { chiave: 'matricola', etichetta: 'MATR. CONTATORE', ordine: 2 },
      { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 1 },
    ]);
    expect(r.map((c) => c.chiave)).toEqual(['via', 'matricola']);
    expect(r[0].etichetta).toBe('INDIRIZZO');
    expect(r[1].etichetta).toBe('MATR. CONTATORE');
  });

  it('ignora chiavi sconosciute', () => {
    const r = resolveInfoCampi([
      { chiave: 'matricola', etichetta: 'M', ordine: 1 },
      { chiave: 'fantasia' as never, etichetta: 'X', ordine: 2 },
    ]);
    expect(r.map((c) => c.chiave)).toEqual(['matricola']);
  });

  it('etichetta vuota → default della chiave', () => {
    const r = resolveInfoCampi([{ chiave: 'cap', etichetta: '  ', ordine: 1 }]);
    expect(r[0].etichetta).toBe('CAP');
  });
});

describe('infoCampiDefault', () => {
  it('produce 11 campi con ordine 1..11', () => {
    const d = infoCampiDefault();
    expect(d).toHaveLength(11);
    expect(d.map((c) => c.ordine)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('valoreInfo', () => {
  it('estrae e trimma; null → stringa vuota', () => {
    expect(valoreInfo({ matricola: ' M1 ' }, 'matricola')).toBe('M1');
    expect(valoreInfo({ matricola: null }, 'matricola')).toBe('');
    expect(valoreInfo({}, 'pdr')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: FAIL — `Failed to resolve import './infoCampi'`.

- [ ] **Step 3: Write the implementation**

`utils/rapportini/infoCampi.ts`:
```ts
export type InfoChiave =
  | 'nominativo' | 'matricola' | 'pdr' | 'odsin' | 'via'
  | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria';

export interface TemplateInfoCampo {
  chiave: InfoChiave;
  etichetta: string;
  ordine: number;
}

/** Gli 11 campi anagrafici selezionabili, con etichetta di default. */
export const INFO_CAMPI_DISPONIBILI: { chiave: InfoChiave; etichettaDefault: string }[] = [
  { chiave: 'nominativo', etichettaDefault: 'NOMINATIVO' },
  { chiave: 'matricola', etichettaDefault: 'MATRICOLA' },
  { chiave: 'pdr', etichettaDefault: 'PDR' },
  { chiave: 'odsin', etichettaDefault: 'ODSIN' },
  { chiave: 'via', etichettaDefault: 'VIA' },
  { chiave: 'comune', etichettaDefault: 'COMUNE' },
  { chiave: 'cap', etichettaDefault: 'CAP' },
  { chiave: 'recapito', etichettaDefault: 'RECAPITO' },
  { chiave: 'attivita', etichettaDefault: 'ATTIVITA' },
  { chiave: 'accessibilita', etichettaDefault: 'ACCESSIBILITA' },
  { chiave: 'fascia_oraria', etichettaDefault: 'FASCIA ORARIA' },
];

const CHIAVI_NOTE = new Set<string>(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));

function defaultEtichetta(chiave: InfoChiave): string {
  return INFO_CAMPI_DISPONIBILI.find((c) => c.chiave === chiave)?.etichettaDefault ?? chiave;
}

/** Config di default = tutti gli 11 nell'ordine canonico (comportamento storico). */
export function infoCampiDefault(): TemplateInfoCampo[] {
  return INFO_CAMPI_DISPONIBILI.map((c, i) => ({
    chiave: c.chiave,
    etichetta: c.etichettaDefault,
    ordine: i + 1,
  }));
}

/**
 * Risolve lo snapshot in una lista ordinata di campi info.
 * - filtra le chiavi sconosciute
 * - ordina per `ordine`
 * - snapshot vuoto/assente → fallback a tutti gli 11 (comportamento attuale)
 */
export function resolveInfoCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): TemplateInfoCampo[] {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return infoCampiDefault();
  return snapshot
    .filter((c) => c && CHIAVI_NOTE.has(c.chiave))
    .map((c) => ({
      chiave: c.chiave,
      etichetta: (c.etichetta ?? '').trim() || defaultEtichetta(c.chiave),
      ordine: typeof c.ordine === 'number' ? c.ordine : 0,
    }))
    .sort((a, b) => a.ordine - b.ordine);
}

/** Record voce con i campi anagrafici (sottoinsieme di rapportino_voci). */
export type VoceInfo = Partial<Record<InfoChiave, string | null | undefined>>;

/** Estrae il valore (string) di un campo info da una voce. */
export function valoreInfo(voce: VoceInfo, chiave: InfoChiave): string {
  const v = voce[chiave];
  return v == null ? '' : String(v).trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: PASS (3 describe, 8 it).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/infoCampi.ts utils/rapportini/infoCampi.test.ts
git commit -m "feat(rapportini): modulo infoCampi (sorgente di verità campi info)"
```

---

## Task 2: Migration `info_campi` / `info_snapshot`

**Files:**
- Create: `supabase/migrations/20260603000000_rapportini_info_campi.sql`

> Nota: il file migrazione viene committato nel repo (pattern del progetto). L'**applicazione al DB Supabase la esegue l'utente** (o su sua richiesta esplicita fornisco la SQL da lanciare). Non applicare automaticamente.

- [ ] **Step 1: Create the migration file**

`supabase/migrations/20260603000000_rapportini_info_campi.sql`:
```sql
-- Rapportini: campi informativi dinamici per template + snapshot per rapportino
alter table rapportino_template
  add column if not exists info_campi jsonb not null default '[]';
alter table rapportini
  add column if not exists info_snapshot jsonb not null default '[]';

-- Seed: il template Standard mostra gli 11 campi nell'ordine attuale (comportamento invariato)
update rapportino_template
set info_campi = '[
  {"chiave":"nominativo","etichetta":"NOMINATIVO","ordine":1},
  {"chiave":"matricola","etichetta":"MATRICOLA","ordine":2},
  {"chiave":"pdr","etichetta":"PDR","ordine":3},
  {"chiave":"odsin","etichetta":"ODSIN","ordine":4},
  {"chiave":"via","etichetta":"VIA","ordine":5},
  {"chiave":"comune","etichetta":"COMUNE","ordine":6},
  {"chiave":"cap","etichetta":"CAP","ordine":7},
  {"chiave":"recapito","etichetta":"RECAPITO","ordine":8},
  {"chiave":"attivita","etichetta":"ATTIVITA","ordine":9},
  {"chiave":"accessibilita","etichetta":"ACCESSIBILITA","ordine":10},
  {"chiave":"fascia_oraria","etichetta":"FASCIA ORARIA","ordine":11}
]'::jsonb
where is_default = true and (info_campi is null or info_campi = '[]'::jsonb);
```

- [ ] **Step 2: Verify SQL syntax by reading**

Rileggi il file: nessun `;` mancante, JSON valido (11 oggetti), `where` limita al template default.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260603000000_rapportini_info_campi.sql
git commit -m "feat(rapportini): migration info_campi/info_snapshot + seed Standard"
```

---

## Task 3: Parser legge `MATRICOLA` (formato Export Dati)

**Files:**
- Modify: `utils/routing/excelParser.ts` (export `detectFormat`; riga ~153)
- Test: `utils/routing/excelParser.test.ts`

- [ ] **Step 1: Write the failing test**

`utils/routing/excelParser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectFormat } from './excelParser';

const HEADER = [
  'CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE',
  'Tipo OdL(CdL)/Servizio', 'Fascia Appuntamento/Blocco', 'PdR / Impianto', 'Nominativo',
];

describe('detectFormat — Export Dati', () => {
  it('mappa la colonna MATRICOLA', () => {
    const cols = detectFormat(HEADER);
    expect(cols).not.toBeNull();
    expect(cols!.matricola).toBe(1);
    expect(cols!.via).toBe(4); // Indirizzo
    expect(cols!.nominativo).toBe(10);
  });

  it('senza MATRICOLA → matricola null (parsing intatto)', () => {
    const cols = detectFormat([
      'CO', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE', 'PdR / Impianto', 'Nominativo',
    ]);
    expect(cols!.matricola).toBeNull();
    expect(cols!.via).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `detectFormat` non esportato (`detectFormat is not a function`).

- [ ] **Step 3: Export `detectFormat`**

In `utils/routing/excelParser.ts`, riga 72, aggiungi `export`:
```ts
export function detectFormat(headerRow: unknown[]): ColMap | null {
```

- [ ] **Step 4: Leggi la colonna MATRICOLA nel ramo "Export Dati"**

In `utils/routing/excelParser.ts`, nel `return` del ramo "Export Dati / Geocall" (riga ~153), sostituisci:
```ts
    matricola: null,
```
con:
```ts
    matricola: findCol(headers, [/^matricola$/, /matricola/]),
```
(È l'occorrenza dentro al blocco che inizia con `const via = findCol(headers, [/^indirizzo$/, ...])` a riga ~140 — NON quelle nei rami ATTGIORN/Massiva.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS (2 it).

- [ ] **Step 6: Run full suite (no regressions)**

Run: `npm test`
Expected: tutti verdi (inclusi i test routing esistenti).

- [ ] **Step 7: Commit**

```bash
git add utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(interventi): il parser legge MATRICOLA nel formato Export Dati"
```

---

## Task 4: API template — validazione e persistenza `info_campi`

**Files:**
- Modify: `app/api/admin/rapportino-template/route.ts`

- [ ] **Step 1: Aggiungi lo schema info + estendi TemplateSchema**

Dopo `CampoSchema` (riga ~26), aggiungi:
```ts
const InfoCampoSchema = z.object({
  chiave: z.enum([
    'nominativo', 'matricola', 'pdr', 'odsin', 'via',
    'comune', 'cap', 'recapito', 'attivita', 'accessibilita', 'fascia_oraria',
  ]),
  etichetta: z.string().min(1),
  ordine: z.number().int(),
});
```
Modifica `TemplateSchema`:
```ts
const TemplateSchema = z.object({
  nome: z.string().min(1),
  campi: z.array(CampoSchema).min(1),
  info_campi: z.array(InfoCampoSchema).default([]),
  active: z.boolean().optional().default(true),
});
```

- [ ] **Step 2: GET — includi `info_campi` nella select**

Riga ~33:
```ts
    .select('id, nome, campi, info_campi, is_default, active, created_at, updated_at')
```

- [ ] **Step 3: POST — persisti `info_campi`**

Riga ~44:
```ts
    .insert({ nome: parsed.data.nome, campi: parsed.data.campi, info_campi: parsed.data.info_campi, active: parsed.data.active }).select('id').single();
```

- [ ] **Step 4: PATCH — includi `info_campi` tra le chiavi aggiornabili**

Riga ~56:
```ts
  for (const k of ['nome', 'campi', 'info_campi', 'active'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/rapportino-template/route.ts
git commit -m "feat(rapportini): API template accetta e salva info_campi"
```

---

## Task 5: Editor template — sezione "Informazioni da mostrare"

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: Import del modulo info**

In cima (dopo l'import di `TemplateCampo`, riga 3):
```ts
import {
  INFO_CAMPI_DISPONIBILI,
  infoCampiDefault,
  resolveInfoCampi,
  type InfoChiave,
  type TemplateInfoCampo,
} from '@/utils/rapportini/infoCampi';
```

- [ ] **Step 2: Estendi il tipo `Template` e lo stato**

Nel type `Template` (riga ~5) aggiungi:
```ts
  info_campi?: TemplateInfoCampo[];
```
Dopo lo stato `campi` (riga ~39) aggiungi:
```ts
  const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);
```

- [ ] **Step 3: Popola `infoCampi` in load/new**

In `loadTemplate` (riga ~50), dopo `setCampi(...)`:
```ts
    setInfoCampi(resolveInfoCampi(tpl.info_campi));
```
In `startNew` (riga ~57), dopo `setCampi([newCampo(1)])`:
```ts
    setInfoCampi(infoCampiDefault());
```

- [ ] **Step 4: Helper per selezione/ordine/etichetta**

Dopo `moveCampo` (riga ~103) aggiungi:
```ts
  function toggleInfo(chiave: InfoChiave) {
    setInfoCampi((prev) => {
      if (prev.some((c) => c.chiave === chiave)) {
        return prev.filter((c) => c.chiave !== chiave).map((c, i) => ({ ...c, ordine: i + 1 }));
      }
      const def = INFO_CAMPI_DISPONIBILI.find((c) => c.chiave === chiave)!;
      return [...prev, { chiave, etichetta: def.etichettaDefault, ordine: prev.length + 1 }];
    });
  }

  function updateInfoEtichetta(chiave: InfoChiave, etichetta: string) {
    setInfoCampi((prev) => prev.map((c) => (c.chiave === chiave ? { ...c, etichetta } : c)));
  }

  function moveInfo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setInfoCampi((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((c, i) => ({ ...c, ordine: i + 1 }));
    });
  }
```

- [ ] **Step 5: Includi `info_campi` nel payload di salvataggio**

In `handleSave`, dentro `payload` (riga ~117), dopo la riga `campi: campi.map(...)`:
```ts
        info_campi: infoCampi.map((c, i) => ({ ...c, ordine: i + 1 })),
```

- [ ] **Step 6: Render della sezione (prima della sezione "Campi")**

Subito prima del blocco `{/* ── Campi ── */}` (riga ~255), inserisci:
```tsx
            {/* ── Informazioni da mostrare ──────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Informazioni da mostrare</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Scegli quali dati del DB compaiono nel rapportino e nell'Excel, in che ordine e con quale etichetta.
                Nessuna selezione = mostra tutti gli 11 campi di default.
              </p>

              <div className="space-y-2">
                {infoCampi.map((c, idx) => (
                  <div key={c.chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                    <input
                      type="text"
                      value={c.etichetta}
                      onChange={(e) => updateInfoEtichetta(c.chiave, e.target.value)}
                      className="flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                    />
                    <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{c.chiave}</span>
                    <button type="button" onClick={() => moveInfo(idx, -1)} disabled={idx === 0}
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                    <button type="button" onClick={() => moveInfo(idx, 1)} disabled={idx === infoCampi.length - 1}
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                    <button type="button" onClick={() => toggleInfo(c.chiave)}
                      className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {INFO_CAMPI_DISPONIBILI.filter((d) => !infoCampi.some((c) => c.chiave === d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleInfo(d.chiave)}
                    className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                    ＋ {d.etichettaDefault}
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 8: Verifica manuale**

`npm run dev` → Impostazioni → Template rapportini → seleziona "Standard": vedi gli 11 campi elencati; deseleziona/riordina/rinomina; "Salva modifiche" → ricarica → lo stato persiste.

- [ ] **Step 9: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(rapportini): editor template — sezione Informazioni da mostrare"
```

---

## Task 6: Generazione — snapshot `info_snapshot`

**Files:**
- Modify: `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Select del template con `info_campi`**

Riga ~19:
```ts
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi, info_campi').eq('id', templateId).single();
```

- [ ] **Step 2: Salva `info_snapshot` in insert**

Riga ~48-51, nell'oggetto `.insert({...})` aggiungi `info_snapshot`:
```ts
          piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
          template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], token, stato: 'in_corso', expires_at: expires,
```

- [ ] **Step 3: Salva `info_snapshot` in update**

Riga ~55-56:
```ts
        await supabaseAdmin.from('rapportini')
          .update({ template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], expires_at: expires }).eq('id', rapId);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/api/mappa/rapportini/genera/route.ts
git commit -m "feat(rapportini): genera salva info_snapshot dal template"
```

---

## Task 7: Rapportino elettronico — render info dinamico

**Files:**
- Modify: `app/r/[token]/page.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: page — leggi `info_snapshot`**

In `app/r/[token]/page.tsx`, la select del rapportino (riga ~83):
```ts
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot')
```

- [ ] **Step 2: page — passa `infoCampi` al form**

Import in cima:
```ts
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
```
Nel render `<RapportinoForm ... />` (riga ~137) aggiungi la prop:
```tsx
        infoCampi={(rap.info_snapshot ?? []) as TemplateInfoCampo[]}
```

- [ ] **Step 3: form — props + import**

In `components/modules/rapportini/RapportinoForm.tsx`, import (dopo riga 4):
```ts
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
```
Nel type `Props` (riga ~26) aggiungi:
```ts
  infoCampi: TemplateInfoCampo[];
```
Nella firma del componente (riga ~93) aggiungi `infoCampi` ai parametri destrutturati:
```ts
export default function RapportinoForm({
  token,
  rapportino,
  voci: vociIniziali,
  campiSnapshot,
  infoCampi,
  readOnly: readOnlyIniziale,
}: Props) {
```

- [ ] **Step 4: form — passa `infoCampi` a ogni VoceCard**

Nel map delle voci (riga ~279-289), aggiungi la prop:
```tsx
            <VoceCard
              key={voce.id}
              voce={voce}
              indice={idx + 1}
              campi={campi}
              infoCampi={infoCampi}
              disabilitato={disabilitato}
              saveState={saveStates[voce.id] ?? 'idle'}
              onChange={(chiave, valore) => setRisposta(voce.id, chiave, valore)}
            />
```

- [ ] **Step 5: VoceCard — firma + render dinamico**

Nella firma di `VoceCard` (riga ~318-332) aggiungi `infoCampi`:
```ts
function VoceCard({
  voce,
  indice,
  campi,
  infoCampi,
  disabilitato,
  saveState,
  onChange,
}: {
  voce: Voce;
  indice: number;
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  disabilitato: boolean;
  saveState: SaveState;
  onChange: (chiave: string, valore: unknown) => void;
}) {
```
Sostituisci l'array `anagrafica` hardcoded (righe ~333-345) con:
```ts
  const anagrafica = resolveInfoCampi(infoCampi)
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce as VoceInfo, c.chiave) }))
    .filter((r) => r.value !== '');
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Verifica manuale**

Genera un rapportino con un template che mostra solo (es.) Matricola + Indirizzo → apri `/r/<token>`: l'anagrafica mostra solo quei due campi con le etichette scelte.

- [ ] **Step 8: Commit**

```bash
git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): rapportino elettronico mostra i campi info del template"
```

---

## Task 8: Export Excel — builder dinamico unico

**Files:**
- Modify: `lib/rapportini/exportStandard.ts`
- Test: `lib/rapportini/exportStandard.test.ts`
- Modify: `app/api/mappa/rapportini/export/route.ts`

- [ ] **Step 1: Write the failing test**

`lib/rapportini/exportStandard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildRapportinoXlsx } from './exportStandard';

async function readBack(buf: Buffer): Promise<unknown[][]> {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
}

describe('buildRapportinoXlsx', () => {
  it('colonne dinamiche: info_snapshot + ORDINE + campi', async () => {
    const rap = {
      staff_name: 'Mario', data: '2026-06-03',
      info_snapshot: [
        { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
        { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 2 },
      ],
      campi_snapshot: [
        { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
        { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
      ],
    };
    const voci = [{ ordine: 1, matricola: 'M1', via: 'VIA ROMA 1', risposte: { att_cess: true, note: 'ok' } }];
    const rows = await readBack(await buildRapportinoXlsx(rap as never, voci as never));
    expect((rows[5] as unknown[]).slice(0, 5)).toEqual(['MATRICOLA', 'INDIRIZZO', 'ORDINE', 'ATT/CESS', 'Note']);
    expect((rows[6] as unknown[]).slice(0, 5)).toEqual(['M1', 'VIA ROMA 1', 1, 'X', 'ok']);
  });

  it('info_snapshot vuoto → fallback agli 11 campi', async () => {
    const rap = { staff_name: 'X', data: '2026-06-03', info_snapshot: [], campi_snapshot: [] };
    const rows = await readBack(await buildRapportinoXlsx(rap as never, [] as never));
    expect((rows[5] as unknown[]).slice(0, 12)).toEqual([
      'NOMINATIVO', 'MATRICOLA', 'PDR', 'ODSIN', 'VIA', 'COMUNE', 'CAP', 'RECAPITO', 'ATTIVITA', 'ACCESSIBILITA', 'FASCIA ORARIA', 'ORDINE',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/rapportini/exportStandard.test.ts`
Expected: FAIL — `buildRapportinoXlsx` non esportato.

- [ ] **Step 3: Aggiorna gli import e il tipo `RapportinoRow`**

In `lib/rapportini/exportStandard.ts`, dopo gli import esistenti (riga ~5) aggiungi:
```ts
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
```
Nel type `RapportinoRow` (riga ~72) aggiungi:
```ts
  info_snapshot?: unknown;
```

- [ ] **Step 4: Aggiungi il builder dinamico**

Aggiungi (es. subito dopo `loadTemplate`, riga ~103):
```ts
/**
 * Builder Excel dinamico: colonne = info del template (in ordine) + ORDINE +
 * campi compilabili. Snapshot info vuoto → fallback agli 11 campi storici.
 */
export async function buildRapportinoXlsx(
  rapportino: RapportinoRow,
  voci: RapportinoVoce[],
): Promise<Buffer> {
  const wb = await loadTemplate();
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Foglio template non valido in Rapportino.xlsx.');

  const info = resolveInfoCampi((rapportino.info_snapshot ?? []) as TemplateInfoCampo[]);
  const campi = (Array.isArray(rapportino.campi_snapshot) ? rapportino.campi_snapshot : []) as TemplateCampo[];
  const campiOrd = [...campi].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));

  ws.getCell('B2').value = toDDMMYYYY(rapportino.data);
  ws.getCell('B4').value = safeStr(rapportino.staff_name);

  const headers = [...info.map((c) => c.etichetta), 'ORDINE', ...campiOrd.map((c) => c.etichetta)];
  const hrow = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => { hrow.getCell(i + 1).value = label; });
  for (let c = headers.length + 1; c <= 26; c++) hrow.getCell(c).value = null; // pulisci celle residue
  hrow.commit();

  const ordered = [...voci].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  let rowIdx = DATA_START_ROW;
  for (const v of ordered) {
    const rr = ws.getRow(rowIdx);
    const ordine = v.ordine ?? rowIdx - HEADER_ROW;
    const risposte = (v.risposte ?? {}) as Record<string, unknown>;
    let col = 1;
    for (const c of info) {
      rr.getCell(col).value = valoreInfo(v as VoceInfo, c.chiave);
      if (c.chiave === 'fascia_oraria') rr.getCell(col).numFmt = '@';
      col++;
    }
    rr.getCell(col).value = ordine; col++;
    for (const campo of campiOrd) {
      const raw = risposte[campo.chiave];
      rr.getCell(col).value = raw === true ? 'X' : raw == null ? '' : String(raw);
      col++;
    }
    rr.commit();
    rowIdx++;
  }

  const totalCols = info.length + 1 + campiOrd.length;
  for (let c = 1; c <= totalCols; c++) {
    let maxLen = 8;
    for (let r = HEADER_ROW; r < rowIdx; r++) {
      const val = ws.getRow(r).getCell(c).value as unknown;
      const s = val == null ? '' : String((val as { text?: unknown })?.text ?? val);
      maxLen = Math.max(maxLen, s.length + 2);
    }
    ws.getColumn(c).width = Math.min(60, maxLen);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/rapportini/exportStandard.test.ts`
Expected: PASS (2 it).

- [ ] **Step 6: Rimuovi i builder obsoleti e aggiorna la route**

Verifica che gli unici importatori dei simboli vecchi siano la route export:
Run: `npx vitest run` non serve; esegui una ricerca: gli usi di `buildRapportinoStandardXlsx`, `buildRapportinoGenericXlsx`, `isStandardSnapshot`, `STANDARD_KEYS` devono comparire solo in `lib/rapportini/exportStandard.ts` e `app/api/mappa/rapportini/export/route.ts`.

In `app/api/mappa/rapportini/export/route.ts`:
- Import (riga ~4-11) → sostituisci con:
```ts
import {
  buildRapportinoXlsx,
  toDDMMYYYY,
  type RapportinoRow,
  type RapportinoVoce,
} from '@/lib/rapportini/exportStandard';
```
- `VOCI_COLS` (riga ~20) invariato. `RAP_COLS` (riga ~22):
```ts
const RAP_COLS = 'id, staff_name, data, campi_snapshot, info_snapshot, template_id';
```
- Sostituisci `buildXlsxFor` (riga ~40-47) con un riferimento diretto: rimuovi la funzione e usa `buildRapportinoXlsx(rap, voci)` nei due punti di chiamata (riga ~85 e ~113).

In `lib/rapportini/exportStandard.ts`: elimina `buildRapportinoStandardXlsx`, `buildRapportinoGenericXlsx`, `isStandardSnapshot`, la costante `HEADERS`, `STANDARD_KEYS` e l'import `risposteToStandardRow` (se non più usati). Mantieni `loadTemplate`, `toDDMMYYYY`, `safeStr`, `HEADER_ROW`, `DATA_START_ROW`, i tipi.

> `utils/rapportini/excelMapping.ts` e il suo test restano invariati (usati altrove/innocui).

- [ ] **Step 7: Type-check + suite**

Run: `npx tsc --noEmit` → nessun errore.
Run: `npm test` → tutti verdi.

- [ ] **Step 8: Commit**

```bash
git add lib/rapportini/exportStandard.ts lib/rapportini/exportStandard.test.ts app/api/mappa/rapportini/export/route.ts
git commit -m "feat(rapportini): export Excel a colonne dinamiche da info_snapshot"
```

---

## Task 9: Mappa — export ZIP dinamico + MATRICOLA nel template scaricabile

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import del modulo info + util voce**

In cima al file (tra gli import esistenti):
```ts
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { taskToVoce } from '@/utils/rapportini/buildVoci';
```

- [ ] **Step 2: Estendi lo stato `rapTemplates` con campi/info_campi**

Trova la dichiarazione di stato `rapTemplates` (tipo attuale `Array<{ id; nome; is_default? }>`). Estendi il tipo a:
```ts
  Array<{ id: string; nome: string; is_default?: boolean; campi?: TemplateCampo[]; info_campi?: TemplateInfoCampo[] }>
```
(`TemplateCampo` è già importato dal form/buildVoci nel file; se non lo è, aggiungi `import type { TemplateCampo } from '@/utils/rapportini/buildVoci';`). Il fetch a riga ~1590 già riceve l'intero template (con `campi`/`info_campi` dopo Task 4): nessuna modifica al fetch necessaria, solo al tipo dell'array `arr` a riga ~1591:
```ts
        const arr: Array<{ id: string; nome: string; is_default?: boolean; campi?: TemplateCampo[]; info_campi?: TemplateInfoCampo[] }> = Array.isArray(list) ? list : [];
```

- [ ] **Step 3: `exportDistribution` — header/righe dinamici**

In `exportDistribution`, prima del loop sugli operatori (riga ~1927), calcola la config dal template selezionato:
```ts
      const tplSel = rapTemplates.find((t) => t.id === rapTemplateId);
      const infoCols = resolveInfoCampi(tplSel?.info_campi ?? null);
      const campiCols = [...(tplSel?.campi ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
```
Sostituisci il blocco intestazioni (riga ~1941-1961) con:
```ts
        const hrow = ws.getRow(6);
        const headerLabels = [...infoCols.map((c) => c.etichetta), 'ORDINE', ...campiCols.map((c) => c.etichetta)];
        headerLabels.forEach((t, i) => { hrow.getCell(i + 1).value = t; });
        for (let c = headerLabels.length + 1; c <= 26; c++) hrow.getCell(c).value = null;
        hrow.commit();
```
Sostituisci il blocco righe dati (riga ~1979-2001, il `sorted.forEach`) con:
```ts
        sorted.forEach((t, idx) => {
          const rr = ws.getRow(7 + idx);
          const vi = taskToVoce(t, idx + 1) as VoceInfo;
          let col = 1;
          for (const c of infoCols) {
            if (c.chiave === 'fascia_oraria') {
              rr.getCell(col).value = extractReportTime(t.fascia_oraria || '');
              rr.getCell(col).numFmt = '@';
            } else {
              rr.getCell(col).value = valoreInfo(vi, c.chiave);
            }
            col++;
          }
          rr.getCell(col).value = idx + 1; col++;
          for (let k = 0; k < campiCols.length; k++) { rr.getCell(col).value = ''; col++; }
          rr.commit();
        });
```
Aggiorna l'auto-larghezza (riga ~2003-2012) usando il numero di colonne dinamico:
```ts
        const totalCols = infoCols.length + 1 + campiCols.length;
        for (let c = 1; c <= totalCols; c++) {
          let maxLen = 8;
          for (let r = 6; r < 7 + sorted.length; r++) {
            const v = ws.getRow(r).getCell(c).value as any;
            const s = v == null ? '' : String(v?.text ?? v);
            maxLen = Math.max(maxLen, s.length + 2);
          }
          ws.getColumn(c).width = Math.min(60, maxLen);
        }
```

- [ ] **Step 4: `downloadTemplate` — aggiungi la colonna MATRICOLA**

Sostituisci `headers`/`examples`/`!cols` in `downloadTemplate` (riga ~2126-2137) con:
```ts
    const headers = [
      'CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE',
      'Tipo OdL(CdL)/Servizio', 'Fascia Appuntamento/Blocco',
      'PdR / Impianto', 'Nominativo', 'Tempo Esecuzione', 'Num Risorse',
    ];
    const examples = [
      ['FIRENZE', 'MAT00012345', '10570366', '20043151148', 'VIA MOLINA 4', '50013', 'CAMPI BISENZIO', 'S-PR-007', '08:00-10:00', '00594202203925', 'Mario Rossi', '30', '1'],
      ['FIRENZE', 'MAT00067890', '10529574', '20043043524', 'VIA DEI MALCONTENTI 1', '50122', 'FIRENZE', 'S-PR-053', '08:00-10:00', '00594201242775', 'Lucia Bianchi', '30', '1'],
      ['ROMA', 'MAT00099999', '20100001', '30012345678', 'VIA NAZIONALE 10', '00184', 'ROMA', 'S-MR-002', '10:00-12:00', '00596100174001', 'Giuseppe Verdi', '15', '2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    ws['!cols'] = [8, 14, 10, 16, 30, 8, 20, 20, 22, 18, 24, 8, 8].map((w) => ({ wch: w }));
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Verifica manuale**

1. "Scarica Template" → il file ha la colonna `MATRICOLA` in seconda posizione.
2. Importa quel file, pianifica, "Genera ZIP": i fogli per operatore hanno le colonne del template selezionato (info scelte + ORDINE + esiti) e la matricola valorizzata.

- [ ] **Step 7: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): export ZIP dinamico dal template + MATRICOLA nel template scaricabile"
```

---

## Self-review (eseguita)

**Spec coverage:**
- §3 modello dati → Task 2. ✓
- §4 modulo infoCampi → Task 1. ✓
- §5.1 editor → Task 5. ✓
- §5.2 API → Task 4. ✓
- §5.3 generazione → Task 6. ✓
- §5.4 rapportino elettronico → Task 7. ✓
- §5.5 export (server + ZIP) → Task 8 + Task 9. ✓
- §5.6 matricola (parser + template scaricabile) → Task 3 + Task 9 step 4. ✓
- §7 retrocompat → fallback `resolveInfoCampi` testato (Task 1) + seed (Task 2). ✓
- §8 testing → Task 1/3/8. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step di codice mostra il codice. ✓

**Type consistency:** `TemplateInfoCampo`/`InfoChiave`/`VoceInfo`/`resolveInfoCampi`/`valoreInfo`/`infoCampiDefault`/`INFO_CAMPI_DISPONIBILI`/`buildRapportinoXlsx` usati con firme coerenti in tutti i task. ✓

**Note/rischi:**
- Il test export legge il workbook con SheetJS e confronta solo le prime N celle (`.slice`) per robustezza rispetto a eventuale styling residuo del template.
- L'applicazione della migration (Task 2) è a carico dell'utente; il codice che legge `info_campi`/`info_snapshot` va in errore-soft (fallback) finché le colonne non esistono, ma per i nuovi salvataggi serve la migration applicata.
