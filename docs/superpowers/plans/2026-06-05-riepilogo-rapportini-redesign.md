# Redesign modulo Riepilogo rapportini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere leggibile il modulo riepilogo rapportini con filtri e raggruppamento Giorno→Territorio, gestire i duplicati operatore alla generazione con conferma di sovrascrittura, e nascondere le colonne vuote in vista contenuto ed export.

**Architecture:** Logica di dominio isolata in utility pure e testabili (`groupByDayTerritory`, `filtraRapportini`, `rilevaConflitti`, `colonneVisibili`); i componenti React e le route API consumano queste utility. La sovrascrittura usa un preflight a due fasi sull'API `genera` (risposta `409` con i conflitti, poi richiamata con `overwrite`). Nessuna modifica allo schema DB.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (`supabaseAdmin`), ExcelJS (export), Vitest (test). Comando test singolo: `npx vitest run <path>`.

Spec di riferimento: [docs/superpowers/specs/2026-06-05-riepilogo-rapportini-redesign-design.md](../specs/2026-06-05-riepilogo-rapportini-redesign-design.md)

**Le 3 fasi sono indipendenti** e possono essere eseguite/committate separatamente. Ordine consigliato: A (più isolata) → B → C.

---

## FASE A — Colonne vuote (vista contenuto + export Excel)

### Task A1: utility `colonneVisibili`

**Files:**
- Create: `utils/rapportini/colonneVisibili.ts`
- Test: `utils/rapportini/colonneVisibili.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/rapportini/colonneVisibili.test.ts
import { describe, it, expect } from 'vitest';
import { campoHaValore, colonneVisibili } from './colonneVisibili';
import type { TemplateInfoCampo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

const info: TemplateInfoCampo[] = [
  { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
  { chiave: 'pdr', etichetta: 'PDR', ordine: 2 },
  { chiave: 'via', etichetta: 'VIA', ordine: 3 },
];
const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('campoHaValore', () => {
  it('crocetta: solo true conta come valorizzato', () => {
    expect(campoHaValore('crocetta', true)).toBe(true);
    expect(campoHaValore('crocetta', false)).toBe(false);
    expect(campoHaValore('crocetta', undefined)).toBe(false);
  });
  it('testo/numero: non vuoto conta come valorizzato', () => {
    expect(campoHaValore('testo', 'x')).toBe(true);
    expect(campoHaValore('testo', '  ')).toBe(false);
    expect(campoHaValore('numero', 0)).toBe(true);
    expect(campoHaValore('testo', null)).toBe(false);
  });
});

describe('colonneVisibili', () => {
  it('tiene solo info popolate e campi valorizzati in almeno una voce', () => {
    const voci = [
      { matricola: 'M1', pdr: '', via: 'VIA ROMA', risposte: { att_cess: false, note: 'ok' } },
      { matricola: '', pdr: '', via: 'VIA PO', risposte: { att_cess: false, note: '' } },
    ];
    const { info: i, campi: c } = colonneVisibili(info, campi, voci);
    expect(i.map((x) => x.chiave)).toEqual(['matricola', 'via']); // pdr vuota → esclusa
    expect(c.map((x) => x.chiave)).toEqual(['note']);             // att_cess mai true → esclusa
  });
  it('nessuna voce → nessuna colonna', () => {
    const { info: i, campi: c } = colonneVisibili(info, campi, []);
    expect(i).toEqual([]);
    expect(c).toEqual([]);
  });
  it('crocetta spuntata in almeno una voce → colonna visibile', () => {
    const voci = [{ risposte: { att_cess: true } }];
    const { campi: c } = colonneVisibili(info, campi, voci);
    expect(c.map((x) => x.chiave)).toEqual(['att_cess']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/rapportini/colonneVisibili.test.ts`
Expected: FAIL — "Failed to resolve import './colonneVisibili'".

- [ ] **Step 3: Write minimal implementation**

```ts
// utils/rapportini/colonneVisibili.ts
import { valoreInfo, type TemplateInfoCampo, type VoceInfo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

/** true se il valore di un campo template è "popolato" (le crocette contano solo se true). */
export function campoHaValore(tipo: string, val: unknown): boolean {
  if (tipo === 'crocetta') return val === true;
  return val != null && String(val).trim() !== '';
}

export type VoceColonne = VoceInfo & { risposte?: Record<string, unknown> | null };

/** Filtra info e campi mantenendo solo le colonne popolate in almeno una voce. */
export function colonneVisibili(
  info: TemplateInfoCampo[],
  campi: TemplateCampo[],
  voci: VoceColonne[],
): { info: TemplateInfoCampo[]; campi: TemplateCampo[] } {
  const infoVis = info.filter((c) => voci.some((v) => valoreInfo(v, c.chiave) !== ''));
  const campiVis = campi.filter((c) =>
    voci.some((v) => campoHaValore(c.tipo, (v.risposte ?? {})[c.chiave])),
  );
  return { info: infoVis, campi: campiVis };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/rapportini/colonneVisibili.test.ts`
Expected: PASS (3 describe, tutti verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/colonneVisibili.ts utils/rapportini/colonneVisibili.test.ts
git commit -m "feat(rapportini): utility colonneVisibili (nasconde colonne vuote)"
```

---

### Task A2: applica `colonneVisibili` alla vista contenuto

**Files:**
- Modify: `app/hub/rapportini/contenuto/[id]/page.tsx`

> Componente server: nessun test automatico (no testing-library nel progetto). Verifica manuale a fine task.

- [ ] **Step 1: Importa l'utility**

In testa al file, sotto gli import esistenti di `infoCampi`, aggiungi:

```ts
import { colonneVisibili } from '@/utils/rapportini/colonneVisibili';
```

- [ ] **Step 2: Calcola le colonne visibili dopo aver risolto `info`, `campi`, `voci`**

Subito dopo la riga `const voci = (vociRows ?? []) as Array<...>;` aggiungi:

```ts
  const { info: infoVis, campi: campiVis } = colonneVisibili(info, campi, voci);
```

- [ ] **Step 3: Usa `infoVis`/`campiVis` nel render**

Nel `<thead>` e nel `<tbody>` sostituisci le iterazioni `info.map(...)` → `infoVis.map(...)` e `campi.map(...)` → `campiVis.map(...)` (4 occorrenze totali: 2 nell'header, 2 nelle celle). La colonna `#` resta invariata.

- [ ] **Step 4: Verifica build/lint del file toccato**

Run: `npx eslint app/hub/rapportini/contenuto/[id]/page.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Verifica manuale**

Apri un rapportino con colonne vuote (es. solo VIA/COMUNE popolate): le colonne interamente "—" (MATRICOLA, PDR, ODS/ODL, CAP, RECAPITO, ATTIVITA, crocette mai spuntate) non devono comparire. `#` sempre presente.

- [ ] **Step 6: Commit**

```bash
git add app/hub/rapportini/contenuto/[id]/page.tsx
git commit -m "feat(rapportini): nascondi colonne vuote nella vista contenuto"
```

---

### Task A3: applica `colonneVisibili` all'export Excel

**Files:**
- Modify: `lib/rapportini/exportStandard.ts`
- Test: `lib/rapportini/exportStandard.test.ts`

- [ ] **Step 1: Write the failing test** (aggiungi dentro il `describe('buildRapportinoXlsx', ...)` esistente)

```ts
  it('nasconde le colonne interamente vuote (info e campi)', async () => {
    const rap = {
      staff_name: 'Mario', data: '2026-06-03',
      info_snapshot: [
        { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
        { chiave: 'pdr', etichetta: 'PDR', ordine: 2 },
        { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 3 },
      ],
      campi_snapshot: [
        { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
        { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
      ],
    };
    const voci = [
      { ordine: 1, matricola: 'M1', pdr: '', via: 'VIA ROMA 1', risposte: { att_cess: false, note: 'ok' } },
    ];
    const rows = await readBack(await buildRapportinoXlsx(rap as never, voci as never));
    // PDR (info vuota) e ATT/CESS (crocetta mai spuntata) sono assenti
    expect((rows[5] as unknown[]).slice(0, 4)).toEqual(['MATRICOLA', 'INDIRIZZO', 'ORDINE', 'Note']);
    expect((rows[6] as unknown[]).slice(0, 4)).toEqual(['M1', 'VIA ROMA 1', 1, 'ok']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/rapportini/exportStandard.test.ts`
Expected: FAIL — l'header contiene ancora `PDR`/`ATT/CESS`.

- [ ] **Step 3: Implementa il filtro in `buildRapportinoXlsx`**

In `lib/rapportini/exportStandard.ts` aggiungi l'import:

```ts
import { colonneVisibili } from '@/utils/rapportini/colonneVisibili';
```

Dopo le righe che definiscono `info` e `campiOrd` (≈ righe 85-87), inserisci:

```ts
  const { info: infoVis, campi: campiVis } = colonneVisibili(info, campiOrd, voci as never[]);
```

Poi sostituisci gli usi successivi: `info` → `infoVis` e `campiOrd` → `campiVis` nelle righe che costruiscono `headers` (≈92), il loop celle info (≈105) e il loop celle campi (≈111), e nel calcolo `totalCols` (≈120):

```ts
  const headers = [...infoVis.map((c) => c.etichetta), 'ORDINE', ...campiVis.map((c) => c.etichetta)];
  // ...
    for (const c of infoVis) { /* invariato, usa c */ }
  // ...
    for (const campo of campiVis) { /* invariato, usa campo */ }
  // ...
  const totalCols = infoVis.length + 1 + campiVis.length;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/rapportini/exportStandard.test.ts`
Expected: PASS (entrambi i test originali + il nuovo).

- [ ] **Step 5: Commit**

```bash
git add lib/rapportini/exportStandard.ts lib/rapportini/exportStandard.test.ts
git commit -m "feat(rapportini): export Excel esclude le colonne vuote"
```

---

## FASE B — Riepilogo: filtri + raggruppamento Giorno→Territorio

### Task B1: utility `groupByDayTerritory`

**Files:**
- Modify: `utils/rapportini/groupByDay.ts` (aggiunge `piano_creato_at` a `RapRiepilogo`)
- Create: `utils/rapportini/groupByDayTerritory.ts`
- Test: `utils/rapportini/groupByDayTerritory.test.ts`

- [ ] **Step 1: Estendi il tipo `RapRiepilogo`**

In `utils/rapportini/groupByDay.ts` modifica la definizione del tipo:

```ts
export type RapRiepilogo = RapportinoStato & {
  piano_id: string;
  territorio: string | null;
  piano_creato_at?: string | null;
};
```

- [ ] **Step 2: Write the failing test**

```ts
// utils/rapportini/groupByDayTerritory.test.ts
import { describe, it, expect } from 'vitest';
import { groupByDayTerritory } from './groupByDayTerritory';
import type { RapRiepilogo } from './groupByDay';

function rap(p: Partial<RapRiepilogo>): RapRiepilogo {
  return {
    id: 'r', staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
    data: '2026-06-04', expires_at: '', submitted_at: null, url: '',
    statoCalcolato: 'valido', nVoci: 0, piano_id: 'p1', territorio: 'CORCIANO',
    piano_creato_at: '2026-06-04T09:00:00Z', ...p,
  };
}

describe('groupByDayTerritory', () => {
  it('unisce due piani dello stesso territorio/giorno in un solo gruppo territorio', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', staff_id: 's1', piano_id: 'p1', piano_creato_at: '2026-06-04T09:00:00Z' }),
      rap({ id: 'b', staff_id: 's2', piano_id: 'p2', piano_creato_at: '2026-06-04T14:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].territori).toHaveLength(1);
    expect(out[0].territori[0].etichetta).toBe('CORCIANO');
    expect(out[0].territori[0].piani.map((p) => p.piano_id)).toEqual(['p1', 'p2']); // ordinati per creato_at
    expect(out[0].territori[0].nOperatori).toBe(2);
  });

  it('normalizza maiuscole/spazi del territorio', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', piano_id: 'p1', territorio: 'CORCIANO' }),
      rap({ id: 'b', piano_id: 'p2', territorio: 'corciano ' }),
    ]);
    expect(out[0].territori).toHaveLength(1);
  });

  it('territorio null/vuoto → gruppo "Senza territorio" separato e in fondo', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', piano_id: 'p1', territorio: null }),
      rap({ id: 'b', piano_id: 'p2', territorio: 'ALFA' }),
    ]);
    expect(out[0].territori.map((t) => t.etichetta)).toEqual(['ALFA', 'Senza territorio']);
  });

  it('ordina i giorni in modo decrescente', () => {
    const out = groupByDayTerritory([
      rap({ id: 'a', data: '2026-06-03' }),
      rap({ id: 'b', data: '2026-06-05' }),
    ]);
    expect(out.map((g) => g.data)).toEqual(['2026-06-05', '2026-06-03']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run utils/rapportini/groupByDayTerritory.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 4: Write implementation**

```ts
// utils/rapportini/groupByDayTerritory.ts
import type { RapRiepilogo } from './groupByDay';

export type PianoGruppo = {
  piano_id: string;
  creato_at: string | null;
  operatori: RapRiepilogo[];
};
export type TerritorioGruppo = {
  chiave: string;        // normalizzata
  etichetta: string;     // visualizzata
  piani: PianoGruppo[];
  nOperatori: number;
};
export type GiornoTerritori = { data: string; territori: TerritorioGruppo[] };

const SENZA = ' senza'; // chiave speciale: ordina sempre per ultima

function chiaveTerritorio(t: string | null): string {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
}

export function groupByDayTerritory(raps: RapRiepilogo[]): GiornoTerritori[] {
  const byDay = new Map<string, Map<string, TerritorioGruppo>>();

  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const terrMap = byDay.get(r.data)!;
    const ck = chiaveTerritorio(r.territorio);
    if (!terrMap.has(ck)) {
      terrMap.set(ck, {
        chiave: ck,
        etichetta: ck === SENZA ? 'Senza territorio' : (r.territorio ?? '').trim(),
        piani: [],
        nOperatori: 0,
      });
    }
    const terr = terrMap.get(ck)!;
    let piano = terr.piani.find((p) => p.piano_id === r.piano_id);
    if (!piano) {
      piano = { piano_id: r.piano_id, creato_at: r.piano_creato_at ?? null, operatori: [] };
      terr.piani.push(piano);
    }
    piano.operatori.push(r);
    terr.nOperatori++;
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // giorni desc
    .map(([data, terrMap]) => ({
      data,
      territori: [...terrMap.values()]
        .map((t) => ({
          ...t,
          piani: t.piani
            .slice()
            .sort((p, q) => (p.creato_at ?? '').localeCompare(q.creato_at ?? '')),
        }))
        .sort((a, b) => {
          if (a.chiave === SENZA) return 1;
          if (b.chiave === SENZA) return -1;
          return a.etichetta.localeCompare(b.etichetta);
        }),
    }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run utils/rapportini/groupByDayTerritory.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add utils/rapportini/groupByDay.ts utils/rapportini/groupByDayTerritory.ts utils/rapportini/groupByDayTerritory.test.ts
git commit -m "feat(rapportini): raggruppamento riepilogo per giorno e territorio"
```

---

### Task B2: utility `filtraRapportini` (filtri client-side)

**Files:**
- Create: `utils/rapportini/filtraRapportini.ts`
- Test: `utils/rapportini/filtraRapportini.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/rapportini/filtraRapportini.test.ts
import { describe, it, expect } from 'vitest';
import { filtraRapportini, type FiltriRiepilogo } from './filtraRapportini';
import type { RapRiepilogo } from './groupByDay';

function rap(p: Partial<RapRiepilogo>): RapRiepilogo {
  return {
    id: 'r', staff_id: 's', staff_name: 'Mario Rossi', token: 't', stato: 'in_corso',
    data: '2026-06-04', expires_at: '', submitted_at: null, url: '',
    statoCalcolato: 'valido', nVoci: 0, piano_id: 'p1', territorio: 'CORCIANO', ...p,
  };
}
const vuoto: FiltriRiepilogo = { territorio: '', operatore: '', stati: [], q: '' };

describe('filtraRapportini', () => {
  it('filtri vuoti → tutto invariato', () => {
    const list = [rap({ id: 'a' }), rap({ id: 'b' })];
    expect(filtraRapportini(list, vuoto)).toHaveLength(2);
  });
  it('filtra per territorio (case-insensitive)', () => {
    const list = [rap({ id: 'a', territorio: 'CORCIANO' }), rap({ id: 'b', territorio: 'ALFA' })];
    expect(filtraRapportini(list, { ...vuoto, territorio: 'corciano' }).map((r) => r.id)).toEqual(['a']);
  });
  it('filtra per stato calcolato', () => {
    const list = [rap({ id: 'a', statoCalcolato: 'inviato' }), rap({ id: 'b', statoCalcolato: 'valido' })];
    expect(filtraRapportini(list, { ...vuoto, stati: ['inviato'] }).map((r) => r.id)).toEqual(['a']);
  });
  it('ricerca testuale su nome operatore', () => {
    const list = [rap({ id: 'a', staff_name: 'Anna Bianchi' }), rap({ id: 'b', staff_name: 'Mario Rossi' })];
    expect(filtraRapportini(list, { ...vuoto, q: 'bianchi' }).map((r) => r.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/rapportini/filtraRapportini.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Write implementation**

```ts
// utils/rapportini/filtraRapportini.ts
import type { RapRiepilogo } from './groupByDay';

export type FiltriRiepilogo = {
  territorio: string;                  // '' = tutti
  operatore: string;                   // '' = tutti (match su staff_id o nome)
  stati: Array<'valido' | 'scaduto' | 'inviato'>; // [] = tutti
  q: string;                           // ricerca testuale libera
};

export function filtraRapportini(list: RapRiepilogo[], f: FiltriRiepilogo): RapRiepilogo[] {
  const terr = f.territorio.trim().toLowerCase();
  const op = f.operatore.trim().toLowerCase();
  const q = f.q.trim().toLowerCase();
  return list.filter((r) => {
    if (terr && (r.territorio ?? '').trim().toLowerCase() !== terr) return false;
    if (op && (r.staff_name ?? '').trim().toLowerCase() !== op && r.staff_id.toLowerCase() !== op) return false;
    if (f.stati.length && !f.stati.includes(r.statoCalcolato)) return false;
    if (q) {
      const hay = `${r.staff_name ?? ''} ${r.territorio ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/rapportini/filtraRapportini.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/filtraRapportini.ts utils/rapportini/filtraRapportini.test.ts
git commit -m "feat(rapportini): utility filtri client-side per il riepilogo"
```

---

### Task B3: API riepilogo restituisce `piano_creato_at`

**Files:**
- Modify: `app/api/mappa/rapportini/riepilogo/route.ts`

> Route server, nessun test automatico. Verifica manuale via risposta JSON.

- [ ] **Step 1: Includi `created_at` nella query dei piani e mappalo**

Nel blocco che carica i piani (`supabaseAdmin.from('mappa_piani').select('id, territorio')`), cambia in:

```ts
    const { data: piani } = await supabaseAdmin.from('mappa_piani').select('id, territorio, created_at').in('id', pianoIds);
```

Sostituisci la struttura di appoggio per conservare anche `created_at`:

```ts
  const pianoInfoById: Record<string, { territorio: string | null; creato_at: string | null }> = {};
  if (pianoIds.length) {
    const { data: piani } = await supabaseAdmin.from('mappa_piani').select('id, territorio, created_at').in('id', pianoIds);
    (piani ?? []).forEach((p: { id: string; territorio: string | null; created_at: string | null }) => {
      pianoInfoById[p.id] = { territorio: p.territorio ?? null, creato_at: p.created_at ?? null };
    });
  }
```

- [ ] **Step 2: Esponi `piano_creato_at` nell'output**

Nel `list.map((r) => ({ ... }))` finale sostituisci la riga del territorio con:

```ts
    territorio: pianoInfoById[r.piano_id]?.territorio ?? null,
    piano_creato_at: pianoInfoById[r.piano_id]?.creato_at ?? null,
```

- [ ] **Step 3: Verifica lint + manuale**

Run: `npx eslint app/api/mappa/rapportini/riepilogo/route.ts`
Expected: nessun nuovo errore.
Manuale: `GET /api/mappa/rapportini/riepilogo` → ogni elemento ha `piano_creato_at`.

> Se la colonna `created_at` non esistesse su `mappa_piani`, l'ordinamento piani degrada in modo sicuro (creato_at `null` → ordine di inserimento). In tal caso usare un fallback su un'altra colonna temporale del piano in fase di esecuzione.

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/rapportini/riepilogo/route.ts
git commit -m "feat(rapportini): riepilogo espone piano_creato_at"
```

---

### Task B4: refactor componente `RiepilogoRapportini` (filtri + Giorno→Territorio)

**Files:**
- Create: `components/modules/mappa/riepilogo/FiltriRiepilogo.tsx`
- Create: `components/modules/mappa/riepilogo/CardTerritorio.tsx`
- Modify: `components/modules/mappa/RiepilogoRapportini.tsx`

> Componenti client, nessun test automatico. Verifica manuale a fine task.

- [ ] **Step 1: Crea `FiltriRiepilogo.tsx`**

```tsx
'use client';
import type { FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';

const STATI: Array<{ k: 'valido' | 'scaduto' | 'inviato'; label: string }> = [
  { k: 'inviato', label: 'Inviato' },
  { k: 'valido', label: 'In corso' },
  { k: 'scaduto', label: 'Scaduto' },
];

export default function FiltriRiepilogo({
  filtri, setFiltri, territori, operatori,
}: {
  filtri: Filtri;
  setFiltri: (f: Filtri) => void;
  territori: string[];
  operatori: { id: string; nome: string }[];
}) {
  const toggleStato = (k: 'valido' | 'scaduto' | 'inviato') => {
    setFiltri({
      ...filtri,
      stati: filtri.stati.includes(k) ? filtri.stati.filter((s) => s !== k) : [...filtri.stati, k],
    });
  };
  const sel = 'rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={filtri.territorio} onChange={(e) => setFiltri({ ...filtri, territorio: e.target.value })}>
        <option value="">Territorio: tutti</option>
        {territori.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className={sel} value={filtri.operatore} onChange={(e) => setFiltri({ ...filtri, operatore: e.target.value })}>
        <option value="">Operatore: tutti</option>
        {operatori.map((o) => <option key={o.id} value={o.nome}>{o.nome}</option>)}
      </select>
      {STATI.map((s) => (
        <button
          key={s.k}
          onClick={() => toggleStato(s.k)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            filtri.stati.includes(s.k)
              ? 'border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
              : 'border border-[var(--brand-border)] text-[var(--brand-text-muted)]'
          }`}
        >
          {s.label}
        </button>
      ))}
      <input
        className={`${sel} flex-1 min-w-[140px]`}
        placeholder="🔍 cerca operatore / territorio…"
        value={filtri.q}
        onChange={(e) => setFiltri({ ...filtri, q: e.target.value })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crea `CardTerritorio.tsx`**

```tsx
'use client';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { TerritorioGruppo, PianoGruppo } from '@/utils/rapportini/groupByDayTerritory';

function fmtOra(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function CardTerritorio({
  terr, dataLabel, copiedToken, onCopia, onRiapri, onEliminaPiano, onRimuoviOp, confirmPiano, setConfirmPiano, confirmOp, setConfirmOp, busy,
}: {
  terr: TerritorioGruppo;
  dataLabel: string;
  copiedToken: string | null;
  onCopia: (r: RapportinoStato & { url: string; token: string }) => void;
  onRiapri: (pianoId: string) => string; // ritorna href
  onEliminaPiano: (pianoId: string) => void;
  onRimuoviOp: (pianoId: string, staffId: string) => void;
  confirmPiano: string | null;
  setConfirmPiano: (v: string | null) => void;
  confirmOp: string | null;
  setConfirmOp: (v: string | null) => void;
  busy: boolean;
}) {
  const multiPiano = terr.piani.length > 1;
  const azioniPiano = (p: PianoGruppo) => (
    <span className="flex items-center gap-2 text-[11px]">
      <a href={onRiapri(p.piano_id)} className="font-medium text-[var(--brand-primary)] hover:opacity-90">↗ Riapri</a>
      {confirmPiano === p.piano_id ? (
        <>
          <button onClick={() => onEliminaPiano(p.piano_id)} disabled={busy} className="font-semibold text-[var(--danger)] disabled:opacity-50">Elimina piano</button>
          <button onClick={() => setConfirmPiano(null)} className="text-[var(--brand-text-muted)]">No</button>
        </>
      ) : (
        <button onClick={() => setConfirmPiano(p.piano_id)} className="text-[var(--brand-text-muted)] hover:text-[var(--danger)]">🗑 Elimina</button>
      )}
    </span>
  );

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-3 py-2">
        <span className="text-sm font-semibold">
          {terr.etichetta}
          {multiPiano && <span className="ml-2 rounded-full border border-[var(--brand-primary-border)] px-2 py-0.5 text-[10px] text-[var(--brand-primary)]">{terr.piani.length} piani</span>}
        </span>
        {multiPiano
          ? <span className="text-xs text-[var(--brand-text-muted)]">{terr.nOperatori} operatori</span>
          : <span className="flex items-center gap-3"><span className="text-xs text-[var(--brand-text-muted)]">{terr.nOperatori} operatori</span>{azioniPiano(terr.piani[0])}</span>}
      </div>

      {terr.piani.map((p) => (
        <div key={p.piano_id}>
          {multiPiano && (
            <div className="flex items-center justify-between bg-[var(--brand-surface-muted)] px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase text-[var(--brand-text-muted)]">Piano · creato {fmtOra(p.creato_at)}</span>
              {azioniPiano(p)}
            </div>
          )}
          <ul className="divide-y divide-[var(--brand-border)]">
            {p.operatori.map((r) => {
              const badge = statoBadge(r.statoCalcolato);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.staff_name ?? 'Operatore'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                    <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                    <button onClick={() => onCopia(r)} className="rounded bg-[var(--brand-primary)] px-2 py-0.5 font-semibold text-[oklch(0.16_0.06_245)]">{copiedToken === r.token ? '✓' : '🔗'}</button>
                    <a href={whatsappHref(r.staff_name, dataLabel, r.url)} target="_blank" rel="noopener noreferrer" className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[var(--success)]">📲</a>
                    <a href={`/hub/rapportini/contenuto/${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">👁</a>
                    <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">⤓</a>
                    {confirmOp === r.id ? (
                      <>
                        <button onClick={() => onRimuoviOp(p.piano_id, r.staff_id)} disabled={busy} className="rounded border border-[var(--danger)] px-2 py-0.5 font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
                        <button onClick={() => setConfirmOp(null)} className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)]">No</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmOp(r.id)} className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)] hover:text-[var(--danger)]">✕</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Riscrivi `RiepilogoRapportini.tsx` per usare filtri + raggruppamento territorio**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RapportinoStato } from '@/utils/rapportini/links';
import { type RapRiepilogo } from '@/utils/rapportini/groupByDay';
import { groupByDayTerritory } from '@/utils/rapportini/groupByDayTerritory';
import { filtraRapportini, type FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';
import FiltriRiepilogo from './riepilogo/FiltriRiepilogo';
import CardTerritorio from './riepilogo/CardTerritorio';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

const PERIODI = [
  { k: '7', label: 'Ultimi 7 giorni', giorni: 7 },
  { k: '30', label: 'Ultimi 30 giorni', giorni: 30 },
  { k: '90', label: 'Ultimi 90 giorni', giorni: 90 },
];

export default function RiepilogoRapportini() {
  const [raps, setRaps] = useState<RapRiepilogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');
  const [filtri, setFiltri] = useState<Filtri>({ territorio: '', operatore: '', stati: [], q: '' });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmPiano, setConfirmPiano] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const giorni = PERIODI.find((p) => p.k === periodo)?.giorni ?? 30;
      const from = new Date(Date.now() - giorni * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${from}&to=${to}`);
      const data = await res.json();
      setRaps(Array.isArray(data) ? (data as RapRiepilogo[]) : []);
    } catch {
      setRaps([]);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { carica(); }, [carica]);

  const territori = useMemo(
    () => [...new Set(raps.map((r) => (r.territorio ?? '').trim()).filter(Boolean))].sort(),
    [raps],
  );
  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    raps.forEach((r) => { if (r.staff_name) m.set(r.staff_id, r.staff_name); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [raps]);

  const giorni = useMemo(() => groupByDayTerritory(filtraRapportini(raps, filtri)), [raps, filtri]);

  const copia = async (r: RapportinoStato & { url: string; token: string }) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch { /* noop */ }
  };
  const eliminaPiano = async (pianoId: string) => {
    setBusy(true);
    try { await fetch(`/api/mappa/piani?id=${pianoId}`, { method: 'DELETE' }); await carica(); }
    finally { setBusy(false); setConfirmPiano(null); }
  };
  const rimuoviOperatore = async (pianoId: string, staffId: string) => {
    setBusy(true);
    try { await fetch(`/api/mappa/piani/operatore?pianoId=${pianoId}&staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' }); await carica(); }
    finally { setBusy(false); setConfirmOp(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Riepilogo rapportini</h2>
        <a href="/hub/rapportini/eseguiti" className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90">📋 Tutti gli interventi eseguiti</a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          {PERIODI.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
        <FiltriRiepilogo filtri={filtri} setFiltri={setFiltri} territori={territori} operatori={operatori} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--brand-text-muted)]">Caricamento riepilogo...</div>
      ) : giorni.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun rapportino per i filtri selezionati.
        </div>
      ) : (
        giorni.map((g) => (
          <div key={g.data} className="space-y-3">
            <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(g.data)}</h3>
            {g.territori.map((terr) => (
              <CardTerritorio
                key={`${g.data}-${terr.chiave}`}
                terr={terr}
                dataLabel={fmtData(g.data)}
                copiedToken={copiedToken}
                onCopia={copia}
                onRiapri={(pianoId) => `/hub/mappa?vista=pianifica&pianoId=${pianoId}`}
                onEliminaPiano={eliminaPiano}
                onRimuoviOp={rimuoviOperatore}
                confirmPiano={confirmPiano}
                setConfirmPiano={setConfirmPiano}
                confirmOp={confirmOp}
                setConfirmOp={setConfirmOp}
                busy={busy}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verifica lint dei file toccati**

Run: `npx eslint components/modules/mappa/RiepilogoRapportini.tsx components/modules/mappa/riepilogo/FiltriRiepilogo.tsx components/modules/mappa/riepilogo/CardTerritorio.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Verifica manuale**

`/hub/mappa?vista=riepilogo`: i filtri funzionano (periodo ricarica, gli altri filtrano live); due piani sullo stesso territorio/giorno appaiono in **una sola card** con mini-header per piano; con un solo piano le azioni stanno sull'header. Copia link / WhatsApp / Vedi / Excel / Rimuovi / Elimina piano funzionano come prima.

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/RiepilogoRapportini.tsx components/modules/mappa/riepilogo/
git commit -m "feat(rapportini): riepilogo con filtri e card per territorio"
```

---

## FASE C — Sovrascrittura duplicati in generazione

### Task C1: utility `rilevaConflitti`

**Files:**
- Create: `utils/rapportini/rilevaConflitti.ts`
- Test: `utils/rapportini/rilevaConflitti.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// utils/rapportini/rilevaConflitti.test.ts
import { describe, it, expect } from 'vitest';
import { rilevaConflitti } from './rilevaConflitti';

const base = {
  pianoId: 'pNew', territorio: 'CORCIANO', data: '2026-06-04',
  operatori: [{ staff_id: 's1', staff_name: 'A' }, { staff_id: 's2', staff_name: 'B' }],
};

describe('rilevaConflitti', () => {
  it('conflitto cross-piano stesso territorio/data/operatore', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: 'corciano ', data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ staff_id: 's1', piano_id_esistente: 'pOld', submitted: false });
  });
  it('ignora rapportini dello stesso piano', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pNew', territorio: 'CORCIANO', data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toEqual([]);
  });
  it('ignora territorio diverso e data diversa', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [
        { id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: 'ALFA', data: '2026-06-04', stato: 'in_corso', submitted_at: null },
        { id: 'r2', staff_id: 's2', piano_id: 'pOld', territorio: 'CORCIANO', data: '2026-06-03', stato: 'in_corso', submitted_at: null },
      ],
    });
    expect(out).toEqual([]);
  });
  it('territorio del piano corrente null → nessun conflitto', () => {
    const out = rilevaConflitti({
      ...base, territorio: null,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: null, data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toEqual([]);
  });
  it('submitted=true se inviato o submitted_at valorizzato', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's2', piano_id: 'pOld', territorio: 'CORCIANO', data: '2026-06-04', stato: 'inviato', submitted_at: null }],
    });
    expect(out[0].submitted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/rapportini/rilevaConflitti.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Write implementation**

```ts
// utils/rapportini/rilevaConflitti.ts
export type RapEsistente = {
  id: string; staff_id: string; piano_id: string;
  territorio: string | null; data: string;
  stato: string; submitted_at: string | null;
};
export type Conflitto = {
  staff_id: string; staff_name: string | null;
  territorio: string | null; data: string;
  rapportino_id: string; piano_id_esistente: string; submitted: boolean;
};

const norm = (t: string | null) => (t ?? '').trim().toLowerCase();

export function rilevaConflitti(args: {
  pianoId: string;
  territorio: string | null;
  data: string;
  operatori: { staff_id: string; staff_name: string | null }[];
  esistenti: RapEsistente[];
}): Conflitto[] {
  const terr = norm(args.territorio);
  if (terr === '') return []; // territorio mancante non genera conflitti
  const out: Conflitto[] = [];
  for (const op of args.operatori) {
    const hit = args.esistenti.find(
      (e) => e.piano_id !== args.pianoId && e.staff_id === op.staff_id && e.data === args.data && norm(e.territorio) === terr,
    );
    if (hit) {
      out.push({
        staff_id: op.staff_id, staff_name: op.staff_name,
        territorio: args.territorio, data: args.data,
        rapportino_id: hit.id, piano_id_esistente: hit.piano_id,
        submitted: hit.stato === 'inviato' || hit.submitted_at != null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/rapportini/rilevaConflitti.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/rilevaConflitti.ts utils/rapportini/rilevaConflitti.test.ts
git commit -m "feat(rapportini): utility rilevaConflitti per duplicati cross-piano"
```

---

### Task C2: API `genera` con preflight conflitti + `overwrite`

**Files:**
- Modify: `app/api/mappa/rapportini/genera/route.ts`

> Route server, nessun test automatico (logica testata in C1). Verifica manuale.

- [ ] **Step 1: Importa l'utility e leggi il parametro `overwrite`**

Aggiungi import:

```ts
import { rilevaConflitti, type RapEsistente } from '@/utils/rapportini/rilevaConflitti';
```

Cambia la destrutturazione del body:

```ts
    const { pianoId, templateId, overwrite } = await req.json() as { pianoId?: string; templateId?: string; overwrite?: 'replace' | 'skip' };
```

- [ ] **Step 2: Carica anche il `territorio` del piano**

Cambia la query del piano:

```ts
    const { data: piano } = await supabaseAdmin.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).single();
```

- [ ] **Step 3: Preflight conflitti dopo aver caricato `ops`**

Subito dopo il caricamento di `ops` (e prima della pulizia orfani), inserisci:

```ts
    const operatoriPiano = (ops ?? []).map((o) => ({ staff_id: String(o.staff_id), staff_name: (o.staff_name as string | null) ?? null }));

    // Candidati: rapportini di ALTRI piani, stessa data, stessi operatori.
    const { data: altriRaps } = await supabaseAdmin
      .from('rapportini')
      .select('id, staff_id, piano_id, data, stato, submitted_at')
      .eq('data', piano.data)
      .neq('piano_id', pianoId)
      .in('staff_id', operatoriPiano.map((o) => o.staff_id));

    // Risolvi il territorio dei piani candidati.
    const altriPianoIds = [...new Set((altriRaps ?? []).map((r) => r.piano_id as string))];
    const terrByPiano: Record<string, string | null> = {};
    if (altriPianoIds.length) {
      const { data: altriPiani } = await supabaseAdmin.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
      (altriPiani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
    }
    const esistenti: RapEsistente[] = (altriRaps ?? []).map((r) => ({
      id: r.id as string, staff_id: String(r.staff_id), piano_id: r.piano_id as string,
      territorio: terrByPiano[r.piano_id as string] ?? null, data: r.data as string,
      stato: r.stato as string, submitted_at: (r.submitted_at as string | null) ?? null,
    }));

    const conflicts = rilevaConflitti({
      pianoId, territorio: piano.territorio ?? null, data: piano.data,
      operatori: operatoriPiano, esistenti,
    });

    // Fase 1: ci sono conflitti e l'utente non ha ancora deciso → 409.
    if (conflicts.length > 0 && !overwrite) {
      return NextResponse.json({ conflicts }, { status: 409 });
    }

    const staffInConflitto = new Set(conflicts.map((c) => c.staff_id));
    if (overwrite === 'replace' && conflicts.length > 0) {
      await supabaseAdmin.from('rapportini').delete().in('id', conflicts.map((c) => c.rapportino_id));
    }
```

- [ ] **Step 4: In modalità `skip`, escludi gli operatori in conflitto dal loop**

Cambia l'inizio del loop di generazione da `for (const op of ops ?? []) {` a:

```ts
    for (const op of ops ?? []) {
      if (overwrite === 'skip' && staffInConflitto.has(String(op.staff_id))) continue;
```

- [ ] **Step 5: Verifica lint + manuale**

Run: `npx eslint app/api/mappa/rapportini/genera/route.ts`
Expected: nessun nuovo errore.
Manuale: genera con un operatore già presente su altro piano stesso territorio/giorno → risposta `409 { conflicts: [...] }`; con `overwrite:'replace'` il vecchio sparisce e resta il nuovo; con `overwrite:'skip'` il vecchio resta e l'operatore non viene rigenerato.

- [ ] **Step 6: Commit**

```bash
git add app/api/mappa/rapportini/genera/route.ts
git commit -m "feat(rapportini): genera con preflight conflitti e overwrite replace/skip"
```

---

### Task C3: dialog di conferma sovrascrittura nella UI mappa

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

> Componente client, nessun test automatico. Verifica manuale a fine task.

- [ ] **Step 1: Aggiungi stato per i conflitti**

Vicino agli altri `useState` dei rapportini (es. accanto a `rapGenerating`/`rapError`), aggiungi:

```tsx
  const [rapConflicts, setRapConflicts] = useState<Array<{ staff_id: string; staff_name: string | null; territorio: string | null; data: string; submitted: boolean }> | null>(null);
  const [overwriteInviati, setOverwriteInviati] = useState(false);
```

- [ ] **Step 2: Estrai il corpo della generazione in una funzione con `overwrite`**

Sostituisci `generaRapportini` con una versione che accetta l'opzione e gestisce il `409`:

```tsx
  const eseguiGenerazione = useCallback(async (overwrite?: 'replace' | 'skip') => {
    if (!currentPianoId || !rapTemplateId) return;
    setRapGenerating(true);
    setRapError(null);
    try {
      const res = await fetch('/api/mappa/rapportini/genera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pianoId: currentPianoId, templateId: rapTemplateId, overwrite }),
      });
      const data = await res.json();
      if (res.status === 409 && Array.isArray(data?.conflicts)) {
        setRapConflicts(data.conflicts);
        return;
      }
      if (!res.ok || data?.error) {
        setRapError(data?.error ?? 'Errore durante la generazione.');
        return;
      }
      setRapConflicts(null);
      setOverwriteInviati(false);
      await caricaRapportini(currentPianoId);
    } catch {
      setRapError('Errore durante la generazione.');
    } finally {
      setRapGenerating(false);
    }
  }, [currentPianoId, rapTemplateId, caricaRapportini]);

  const generaRapportini = useCallback(() => {
    if (!rapTemplateId) {
      setRapError('Nessun modello attivo. Crea un template in Impostazioni → Template rapportini.');
      return;
    }
    void eseguiGenerazione();
  }, [eseguiGenerazione, rapTemplateId]);
```

- [ ] **Step 3: Aggiungi il modale di conferma nel JSX**

Vicino agli altri overlay del componente, aggiungi (i conflitti `submitted` richiedono la spunta `overwriteInviati` per abilitare "Sovrascrivi"):

```tsx
  {rapConflicts && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRapConflicts(null)}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">Rapportini già esistenti</h3>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Questi operatori hanno già un rapportino su questo territorio/giorno da un altro piano:
        </p>
        <ul className="my-3 max-h-52 space-y-1 overflow-y-auto text-sm">
          {rapConflicts.map((c) => (
            <li key={c.staff_id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-1.5">
              <span>{c.staff_name ?? c.staff_id}</span>
              {c.submitted && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]">già inviato</span>}
            </li>
          ))}
        </ul>
        {rapConflicts.some((c) => c.submitted) && (
          <label className="mb-3 flex items-center gap-2 text-xs text-[var(--danger)]">
            <input type="checkbox" checked={overwriteInviati} onChange={(e) => setOverwriteInviati(e.target.checked)} />
            Sovrascrivi anche i rapportini già inviati (i dati compilati andranno persi)
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => { setRapConflicts(null); setOverwriteInviati(false); }} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm">Annulla</button>
          <button onClick={() => void eseguiGenerazione('skip')} disabled={rapGenerating} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm disabled:opacity-50">Salta esistenti</button>
          <button
            onClick={() => void eseguiGenerazione('replace')}
            disabled={rapGenerating || (rapConflicts.some((c) => c.submitted) && !overwriteInviati)}
            className="rounded-lg bg-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Sovrascrivi tutti
          </button>
        </div>
      </div>
    </div>
  )}
```

- [ ] **Step 4: Verifica lint dei file toccati**

Run: `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Verifica manuale**

Genera per un piano con un operatore già presente su altro piano stesso territorio/giorno: compare il modale. "Salta esistenti" non tocca i vecchi; "Sovrascrivi tutti" li rimpiazza. Se un conflitto è "già inviato", "Sovrascrivi tutti" resta disabilitato finché non spunti la conferma.

- [ ] **Step 6: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(rapportini): dialog conferma sovrascrittura alla generazione"
```

---

## Self-review (coperta dall'autore del piano)

- **Copertura spec:** Filtri + raggruppamento territorio (B1–B4) ✓ · sovrascrittura preflight/replace/skip + inviati protetti (C1–C3) ✓ · colonne vuote web+Excel (A1–A3) ✓ · `piano_creato_at` (B3) ✓ · nessuna migrazione SQL ✓.
- **Coerenza tipi:** `RapRiepilogo` esteso con `piano_creato_at` (B1) e usato in B2/B4; `colonneVisibili(info, campi, voci)` firma identica in A1/A2/A3; `rilevaConflitti` ritorna `Conflitto` con `rapportino_id`/`piano_id_esistente`/`submitted` usati in C2/C3; `FiltriRiepilogo` type usato in B2/B4.
- **Note esecuzione:** i componenti React non hanno test automatici (no testing-library nel progetto) → verifica manuale esplicita in ogni task UI. Lint: la baseline è già rossa, validare solo i file toccati con `npx eslint <path>`.

## Aperti (decidibili in esecuzione)
- Etichetta mini-header piano: `creato HH:MM` (default) vs indice progressivo.
- Eventuale fallback temporale se `mappa_piani.created_at` non esistesse (B3).
