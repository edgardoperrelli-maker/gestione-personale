# Sync limitazioni massive → file ACEA su SharePoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni sera l'app aggiorna i file Excel ACEA delle limitazioni massive su SharePoint (esito eseguito/No, esecutore, data, sigillo sugli ODL lavorati; interventi manuali extra in fondo), senza intervento manuale e senza IT/Azure.

**Architecture:** Due componenti che parlano via un contratto JSON. **(A)** Un endpoint Next.js protetto da segreto condiviso espone le limitazioni lavorate (già tradotte per il file) leggendo da Supabase. **(B)** Un agente Node.js sul PC di lavoro (Utilità di pianificazione, 21:00) scarica quel JSON, apre i file `.xlsx` nella cartella OneDrive sincronizzata, aggancia per ODL→matricola e scrive solo BM/BN/BO/BQ nelle celle vuote, aggiunge le extra in fondo, fa backup e log. OneDrive sincronizza su SharePoint.

**Tech Stack:** Next.js 15 (route handler `nodejs`), Supabase (`supabaseAdmin`), TypeScript, Vitest. Agente: Node.js ESM (`.mjs`) standalone + `exceljs` (bundled). Spec: `docs/superpowers/specs/2026-06-16-sync-limitazioni-massive-sharepoint-design.md`.

**Nota sui due componenti:** Part 1 (endpoint) e Part 2 (agente) sono testabili indipendentemente — l'agente si prova con `lavori` iniettati (fixture), l'endpoint con `interventi` reali. Il contratto JSON che li unisce è il tipo `RigaLimMassive` (Task 3).

**Contratto JSON (output endpoint, una riga per limitazione lavorata):**
```jsonc
{ "id":"<uuid intervento>", "odl":"912231020", "matricola":"20000020750",
  "comune":"ZAGAROLO", "via":"VIA CANCELLATA GRANDE 32", "esecutore":"CIARALLO",
  "data_esecuzione":"2026-06-03", "esito":"eseguito"|"No"|null,
  "esito_motivo":"Nessun passaggio"|null, "sigillo":"AA728566", "manuale":false }
```

**Baseline rossa (memoria):** `npm run lint` e `npx vitest run` interi sono già rossi su main. I gate qui sono **mirati**: `npx vitest run <file di questo WP>` deve passare; non introdurre nuovi errori nei file toccati.

---

## File Structure

**Part 1 — Endpoint (app):**
- Create `lib/limitazione/exportLimMassive.ts` — funzioni PURE: `cognomeDaDisplayName`, `esitoFileDaIntervento`, `buildRigaLimMassive` + tipi `RigaLimMassive`/`RigaDb`.
- Create `lib/limitazione/exportLimMassive.test.ts` — unit.
- Create `app/api/export/limitazioni-massive/route.ts` — route handler: auth segreto, query interventi+staff+voci, assembla JSON.

**Part 2 — Agente locale (`tools/limitazioni-sync/`):**
- Create `tools/limitazioni-sync/package.json`, `config.example.json`, `.gitignore`, `README.md`.
- Create `tools/limitazioni-sync/lib/colonne.mjs` — rilevamento colonne per intestazione (PURE).
- Create `tools/limitazioni-sync/lib/match.mjs` — normalizzazione/aggancio/extra (PURE).
- Create `tools/limitazioni-sync/lib/scrittura.mjs` — policy celle (PURE).
- Create `tools/limitazioni-sync/lib/finestra.mjs` — calcolo from/to (PURE).
- Create `tools/limitazioni-sync/lib/excelIO.mjs` — exceljs: carica/intestazione/backup/salva (I/O).
- Create `tools/limitazioni-sync/lib/fetchLavori.mjs` — chiamata endpoint (I/O).
- Create `tools/limitazioni-sync/agente.mjs` — orchestrazione + log + entry.
- Create i `*.test.ts` co-locati per le funzioni PURE e per excelIO/orchestratore (Vitest li scopre via `**/*.test.ts`; importano i `.mjs`).

**Convenzione indici colonna:** `rilevaColonne` ritorna indici **0-based** sull'array `header` (riga intestazione senza il buco iniziale di exceljs). exceljs usa colonne **1-based** → in scrittura si usa sempre `row.getCell(col + 1)`.

---

## PART 1 — Endpoint app

### Task 1: Pure `cognomeDaDisplayName`

**Files:**
- Create: `lib/limitazione/exportLimMassive.ts`
- Test: `lib/limitazione/exportLimMassive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/limitazione/exportLimMassive.test.ts
import { describe, it, expect } from 'vitest';
import { cognomeDaDisplayName } from './exportLimMassive';

describe('cognomeDaDisplayName', () => {
  it('prende il primo token (cognome) in maiuscolo', () => {
    expect(cognomeDaDisplayName('CIARALLO SIMONE')).toBe('CIARALLO');
    expect(cognomeDaDisplayName('PASTORELLI LUIGI')).toBe('PASTORELLI');
  });
  it('gestisce stringa vuota e spazi', () => {
    expect(cognomeDaDisplayName('')).toBe('');
    expect(cognomeDaDisplayName('  rossi  ')).toBe('ROSSI');
    expect(cognomeDaDisplayName(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: FAIL — "Failed to resolve import './exportLimMassive'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/limitazione/exportLimMassive.ts
/** display_name "COGNOME NOME" (maiuscolo) → solo il cognome (primo token), maiuscolo. */
export function cognomeDaDisplayName(displayName: string | null | undefined): string {
  const s = String(displayName ?? '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0].toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/exportLimMassive.ts lib/limitazione/exportLimMassive.test.ts
git commit -m "feat(lim-export): cognomeDaDisplayName (primo token)"
```

---

### Task 2: Pure `esitoFileDaIntervento`

**Files:**
- Modify: `lib/limitazione/exportLimMassive.ts`
- Test: `lib/limitazione/exportLimMassive.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append in exportLimMassive.test.ts
import { esitoFileDaIntervento } from './exportLimMassive';

describe('esitoFileDaIntervento', () => {
  it('positivo → eseguito', () => {
    expect(esitoFileDaIntervento('completato', 'eseguito_positivo')).toBe('eseguito');
  });
  it('completato non positivo → No', () => {
    expect(esitoFileDaIntervento('completato', null)).toBe('No');
    expect(esitoFileDaIntervento('completato', 'accesso_negato')).toBe('No');
    expect(esitoFileDaIntervento('completato', 'contatore_non_trovato')).toBe('No');
  });
  it('non completato → null (non lavorato)', () => {
    expect(esitoFileDaIntervento('assegnato', 'eseguito_positivo')).toBeNull();
    expect(esitoFileDaIntervento(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: FAIL — "esitoFileDaIntervento is not a function".

- [ ] **Step 3: Add the implementation**

```ts
// append in exportLimMassive.ts
/** 'eseguito' se positivo, 'No' se lavorato-ma-non-positivo, null se non lavorato. */
export function esitoFileDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): 'eseguito' | 'No' | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? 'eseguito' : 'No';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/exportLimMassive.ts lib/limitazione/exportLimMassive.test.ts
git commit -m "feat(lim-export): esitoFileDaIntervento (eseguito/No/null)"
```

---

### Task 3: Pure `buildRigaLimMassive` + tipi

**Files:**
- Modify: `lib/limitazione/exportLimMassive.ts`
- Test: `lib/limitazione/exportLimMassive.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append in exportLimMassive.test.ts
import { buildRigaLimMassive, type RigaDb } from './exportLimMassive';

const base: RigaDb = {
  id: 'uuid-1', odl: ' 912231020 ', matricola_contatore: '20000020750',
  comune: 'ZAGAROLO', indirizzo: 'VIA CANCELLATA GRANDE 32', esito: 'eseguito_positivo',
  esito_motivo: null, stato: 'completato', data: '2026-06-03',
  committente: 'acea', origine: 'pianificato', display_name: 'CIARALLO SIMONE', sigillo: 'AA728566',
};

describe('buildRigaLimMassive', () => {
  it('mappa e normalizza una riga pianificata positiva', () => {
    expect(buildRigaLimMassive(base)).toEqual({
      id: 'uuid-1', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO',
      via: 'VIA CANCELLATA GRANDE 32', esecutore: 'CIARALLO', data_esecuzione: '2026-06-03',
      esito: 'eseguito', esito_motivo: null, sigillo: 'AA728566', manuale: false,
    });
  });
  it('riga manuale negativa → manuale true, esito No, motivo nel campo', () => {
    const r = buildRigaLimMassive({
      ...base, odl: null, esito: null, esito_motivo: 'Nessun passaggio',
      committente: 'lim_massive', origine: 'manuale', sigillo: '',
    });
    expect(r.manuale).toBe(true);
    expect(r.esito).toBe('No');
    expect(r.esito_motivo).toBe('Nessun passaggio');
    expect(r.odl).toBe('');
    expect(r.sigillo).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: FAIL — "buildRigaLimMassive is not a function".

- [ ] **Step 3: Add the implementation**

```ts
// append in exportLimMassive.ts
/** Riga di output dell'endpoint: una limitazione lavorata, già tradotta per il file. */
export type RigaLimMassive = {
  id: string;
  odl: string;
  matricola: string;
  comune: string;
  via: string;
  esecutore: string;
  data_esecuzione: string; // 'YYYY-MM-DD'
  esito: 'eseguito' | 'No' | null;
  esito_motivo: string | null;
  sigillo: string;
  manuale: boolean;
};

/** Riga DB (interventi + staff.display_name + sigillo dalla voce). */
export type RigaDb = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null; // 'YYYY-MM-DD'
  committente: string | null;
  origine: string | null;
  display_name: string | null;
  sigillo: string | null;
};

const t = (v: string | null | undefined): string => String(v ?? '').trim();

export function buildRigaLimMassive(r: RigaDb): RigaLimMassive {
  return {
    id: t(r.id),
    odl: t(r.odl),
    matricola: t(r.matricola_contatore),
    comune: t(r.comune),
    via: t(r.indirizzo),
    esecutore: cognomeDaDisplayName(r.display_name),
    data_esecuzione: t(r.data),
    esito: esitoFileDaIntervento(r.stato, r.esito),
    esito_motivo: t(r.esito_motivo) || null,
    sigillo: t(r.sigillo),
    manuale: r.committente === 'lim_massive' || r.origine === 'manuale',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: PASS (tutte e 3 le describe).

- [ ] **Step 5: Lint mirato + Commit**

Run: `npx eslint lib/limitazione/exportLimMassive.ts`
Expected: nessun errore sui file nuovi.

```bash
git add lib/limitazione/exportLimMassive.ts lib/limitazione/exportLimMassive.test.ts
git commit -m "feat(lim-export): buildRigaLimMassive + tipi RigaLimMassive/RigaDb"
```

---

### Task 4: Route handler `GET /api/export/limitazioni-massive`

**Files:**
- Create: `app/api/export/limitazioni-massive/route.ts`
- Riferimento pattern: `app/api/interventi/export/route.ts` (paginazione 1000, mappa staff), `lib/apiAuth.ts`.

> Le route handler non hanno unit test in questo repo: la verifica è **manuale via curl** (Step 4). Il grosso della logica è già testato (Task 1-3).

- [ ] **Step 1: Implementa la route**

```ts
// app/api/export/limitazioni-massive/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildRigaLimMassive,
  type RigaDb,
  type RigaLimMassive,
} from '@/lib/limitazione/exportLimMassive';

export const runtime = 'nodejs';

function chiaveValida(req: Request): boolean {
  const atteso = process.env.LIM_MASSIVE_EXPORT_KEY ?? '';
  const fornito = req.headers.get('x-export-key') ?? '';
  if (!atteso || fornito.length !== atteso.length) return false;
  try {
    return timingSafeEqual(Buffer.from(fornito), Buffer.from(atteso));
  } catch {
    return false;
  }
}

type InterventoRow = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null;
  committente: string | null;
  origine: string | null;
  staff_id: string | null;
};

export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    // 1) interventi limitazione lavorati nella finestra (paginazione: PostgREST taglia a 1000)
    const PAGE = 1000;
    const interventi: InterventoRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select(
          'id, odl, matricola_contatore, comune, indirizzo, esito, esito_motivo, stato, data, committente, origine, staff_id',
        )
        .eq('stato', 'completato')
        .gte('data', from)
        .lte('data', to)
        .or('committente.eq.lim_massive,intervento_tipo.ilike.%limitaz%,intervento_tipo.ilike.%massiv%')
        .order('data', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as InterventoRow[];
      interventi.push(...rows);
      if (rows.length < PAGE) break;
    }

    // 2) mappa staff_id → display_name
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById = new Map<string, string>();
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffById.set(s.id, s.display_name);
    }

    // 3) mappa intervento_id → sigillo (rapportino_voci.risposte->>'sigillo')
    const ids = interventi.map((i) => i.id);
    const sigilloById = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: voci } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', chunk);
      for (const v of (voci ?? []) as Array<{
        intervento_id: string | null;
        risposte: Record<string, unknown> | null;
      }>) {
        if (!v.intervento_id) continue;
        const sig =
          v.risposte && typeof v.risposte['sigillo'] === 'string'
            ? (v.risposte['sigillo'] as string)
            : '';
        if (sig && !sigilloById.has(v.intervento_id)) sigilloById.set(v.intervento_id, sig);
      }
    }

    // 4) costruisci le righe (funzione pura testata)
    const righe: RigaLimMassive[] = interventi.map((i) =>
      buildRigaLimMassive({
        id: i.id,
        odl: i.odl,
        matricola_contatore: i.matricola_contatore,
        comune: i.comune,
        indirizzo: i.indirizzo,
        esito: i.esito,
        esito_motivo: i.esito_motivo,
        stato: i.stato,
        data: i.data,
        committente: i.committente,
        origine: i.origine,
        display_name: i.staff_id ? staffById.get(i.staff_id) ?? null : null,
        sigillo: sigilloById.get(i.id) ?? null,
      } satisfies RigaDb),
    );

    return NextResponse.json(
      { from, to, count: righe.length, righe },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Aggiungi la env var locale**

Aggiungi a `.env.local` (NON committare): `LIM_MASSIVE_EXPORT_KEY=test-segreto-locale`

- [ ] **Step 3: Type-check + lint mirati**

Run: `npx tsc --noEmit` (deve compilare; se la baseline ha già errori altrove, verifica che **nessun nuovo errore** riguardi `app/api/export/limitazioni-massive/route.ts`)
Run: `npx eslint app/api/export/limitazioni-massive/route.ts`
Expected: nessun errore sul file nuovo.

- [ ] **Step 4: Verifica manuale (dev server)**

Run: `npm run dev` poi in un'altra shell:
```bash
curl -s -H "x-export-key: test-segreto-locale" \
  "http://localhost:3000/api/export/limitazioni-massive?from=2026-06-02&to=2026-06-16" | head -c 800
```
Expected: JSON `{ "from":..., "to":..., "count":N, "righe":[ { "odl":..., "esito":"eseguito"|"No", "sigillo":..., "esecutore":... } ] }`. Verifica che almeno una riga ZAGAROLO abbia `sigillo` valorizzato e `esecutore` = solo cognome.
Run (atteso 401): `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/export/limitazioni-massive?from=2026-06-02&to=2026-06-16"` → `401`.

- [ ] **Step 5: Commit**

```bash
git add app/api/export/limitazioni-massive/route.ts
git commit -m "feat(lim-export): endpoint GET /api/export/limitazioni-massive (segreto condiviso)"
```

- [ ] **Step 6: Env var su Vercel (manuale)**

Imposta su Vercel (Project → Settings → Environment Variables) `LIM_MASSIVE_EXPORT_KEY` = un segreto lungo casuale (Production). Annotalo: servirà nel `config.json` dell'agente (Task 5).

---

## PART 2 — Agente locale `tools/limitazioni-sync/`

### Task 5: Scaffold del progetto agente

**Files:**
- Create: `tools/limitazioni-sync/package.json`, `tools/limitazioni-sync/config.example.json`, `tools/limitazioni-sync/.gitignore`, `tools/limitazioni-sync/README.md`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "limitazioni-sync",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Agente locale: aggiorna i file ACEA limitazioni massive su SharePoint da /api/export/limitazioni-massive",
  "dependencies": {
    "exceljs": "^4.4.0"
  }
}
```

- [ ] **Step 2: `config.example.json`**

```json
{
  "endpointUrl": "https://<TUO-DOMINIO-VERCEL>/api/export/limitazioni-massive",
  "exportKey": "INCOLLA-QUI-LO-STESSO-SEGRETO-DI-VERCEL",
  "cartella": "C:\\Users\\edgardo.perrelli\\Plenzich s.p.a\\Commesse - Documenti\\ANNO 2026\\CP 20260002_ACEA_GU IDRICHE L2\\8_LAVORI\\LIMITAZIONI MASSIVE",
  "finestraGiorni": 15,
  "dryRun": true
}
```

- [ ] **Step 3: `.gitignore`**

```gitignore
node_modules/
config.json
_backup/
_log/
```

- [ ] **Step 4: `README.md`** (istruzioni operative; il contenuto dettagliato di installazione è nel Task 12)

```markdown
# Agente limitazioni massive → SharePoint

Aggiorna ogni sera i file Excel ACEA nella cartella OneDrive sincronizzata.

## Setup rapido
1. Copia `config.example.json` in `config.json` e compila `endpointUrl`, `exportKey`, `cartella`.
2. Tieni `"dryRun": true` finché non hai verificato un paio di report.
3. Lancia: `node agente.mjs`  (con il Node portable: `"<path>\node.exe" agente.mjs`).
4. Il report esce a video e in `_log/`. In dryRun NON scrive i file.
5. Quando i report sono ok, metti `"dryRun": false` e crea l'attività pianificata (vedi sezione Pianificazione).

Vedi il piano `docs/superpowers/plans/2026-06-16-sync-limitazioni-massive-sharepoint.md` per i dettagli.
```

- [ ] **Step 5: Installa exceljs in locale (bundle)**

Run: `cd tools/limitazioni-sync && npm install`
Expected: crea `tools/limitazioni-sync/node_modules/exceljs` (ignorato da git).

- [ ] **Step 6: Commit**

```bash
git add tools/limitazioni-sync/package.json tools/limitazioni-sync/config.example.json tools/limitazioni-sync/.gitignore tools/limitazioni-sync/README.md
git commit -m "chore(lim-sync): scaffold agente locale"
```

---

### Task 6: Pure `colonne.mjs` — rilevamento colonne per intestazione

**Files:**
- Create: `tools/limitazioni-sync/lib/colonne.mjs`
- Test: `tools/limitazioni-sync/lib/colonne.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/colonne.test.ts
import { describe, it, expect } from 'vitest';
import { rilevaColonne, isFileMaster, colonnaMarker } from './colonne.mjs';

// Intestazione ACEA reale (indici 0-based): F=5 ORDINE, I=8 MATRICOLA, BF=57 INDIRIZZO,
// BL=63 Località, BM=64 Esecutore, BN=65 data prevista, BO=66 esito, BQ=68 sigillo posato,
// BR=69 stato odl, BS=70 vuota.
function headerAcea(): string[] {
  const h: string[] = [];
  h[5] = 'ORDINE'; h[8] = 'MATRICOLA'; h[57] = 'INDIRIZZO'; h[63] = 'Località';
  h[64] = 'Esecutore'; h[65] = 'data prevista'; h[66] = 'esito';
  h[68] = 'sigillo posato'; h[69] = 'stato odl';
  return h;
}

describe('rilevaColonne', () => {
  it('mappa le colonne note per intestazione', () => {
    const c = rilevaColonne(headerAcea());
    expect(c).toMatchObject({
      odl: 5, matricola: 8, via: 57, comune: 63, esecutore: 64, data: 65, esito: 66, sigillo: 68,
    });
  });
});

describe('isFileMaster', () => {
  it('true se ha la firma minima (odl, matricola, esito, sigillo)', () => {
    expect(isFileMaster(headerAcea())).toBe(true);
  });
  it('false su un file estraneo', () => {
    expect(isFileMaster(['Data', 'Operatore', 'Note'])).toBe(false);
  });
});

describe('colonnaMarker', () => {
  it('prima colonna vuota dopo le note (BS=70)', () => {
    expect(colonnaMarker(headerAcea())).toBe(70);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/colonne.test.ts`
Expected: FAIL — impossibile risolvere `./colonne.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/colonne.mjs
// PURE: rilevamento delle colonne del file ACEA per intestazione (robusto a spostamenti).

const ALIAS = {
  odl: ['ordine'],
  matricola: ['matricola'],
  via: ['indirizzo'],
  comune: ['località', 'localita'],
  esecutore: ['esecutore'],
  data: ['data prevista', 'data'],
  esito: ['esito'],
  sigillo: ['sigillo posato', 'sigillo'],
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** headerRow: array di valori della riga di intestazione. Ritorna { chiave: indice0based }. */
export function rilevaColonne(headerRow) {
  const cols = {};
  const cells = (headerRow ?? []).map(norm);
  for (const [chiave, alias] of Object.entries(ALIAS)) {
    let idx = -1;
    for (const a of alias) {
      idx = cells.indexOf(a);
      if (idx >= 0) break;
    }
    if (idx >= 0) cols[chiave] = idx;
  }
  return cols;
}

/** Un file è "master limitazioni" solo se ha la firma minima di colonne. */
export function isFileMaster(headerRow) {
  const c = rilevaColonne(headerRow);
  return ['odl', 'matricola', 'esito', 'sigillo'].every((k) => k in c);
}

/** Indice (0-based) della colonna marcatore "AGGIUNTA APP": prima colonna con intestazione
 *  vuota dopo l'ultima colonna nota; fallback = lunghezza riga (nuova colonna in coda). */
export function colonnaMarker(headerRow) {
  const cells = (headerRow ?? []).map(norm);
  const noti = rilevaColonne(headerRow);
  const valori = Object.values(noti);
  const maxNoto = valori.length ? Math.max(...valori) : -1;
  for (let i = maxNoto + 1; i < cells.length; i++) {
    if (cells[i] === '') return i;
  }
  return cells.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/colonne.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/colonne.mjs tools/limitazioni-sync/lib/colonne.test.ts
git commit -m "feat(lim-sync): rilevaColonne/isFileMaster/colonnaMarker"
```

---

### Task 7: Pure `match.mjs` — normalizzazione, aggancio, extra

**Files:**
- Create: `tools/limitazioni-sync/lib/match.mjs`
- Test: `tools/limitazioni-sync/lib/match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/match.test.ts
import { describe, it, expect } from 'vitest';
import { norm, buildIndice, agganciaRiga, trovaExtra } from './match.mjs';

const lavori = [
  { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', manuale: false },
  { id: 'b', odl: null, matricola: '202315612361', comune: 'ZAGAROLO', manuale: true },
  { id: 'c', odl: null, matricola: '999', comune: 'TIVOLI', manuale: true },
];

describe('norm', () => {
  it('maiuscolo senza spazi', () => {
    expect(norm(' 912 231 020 ')).toBe('912231020');
  });
});

describe('agganciaRiga', () => {
  const idx = buildIndice(lavori);
  it('aggancia per ODL', () => {
    expect(agganciaRiga({ odl: '912231020', matricola: 'x' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[0], via: 'odl',
    });
  });
  it('fallback per matricola nello stesso comune', () => {
    expect(agganciaRiga({ odl: '', matricola: '202315612361' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[1], via: 'matricola',
    });
  });
  it('NON aggancia matricola di comune diverso', () => {
    expect(agganciaRiga({ odl: '', matricola: '999' }, idx, 'ZAGAROLO')).toBeNull();
  });
});

describe('trovaExtra', () => {
  it('solo manuali non consumati', () => {
    const extra = trovaExtra(lavori, new Set(['b']));
    expect(extra.map((l) => l.id)).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/match.test.ts`
Expected: FAIL — impossibile risolvere `./match.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/match.mjs
// PURE: normalizzazione e aggancio tra le righe del file e i lavori dall'app.

/** Normalizza odl/matricola per il confronto: stringa, maiuscolo, senza spazi. */
export function norm(v) {
  return String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
}

/** Indice dei lavori per odl e per (comune|matricola). */
export function buildIndice(lavori) {
  const byOdl = new Map();
  const byComuneMatricola = new Map();
  for (const l of lavori ?? []) {
    if (l.odl) byOdl.set(norm(l.odl), l);
    if (l.matricola) byComuneMatricola.set(norm(l.comune) + '|' + norm(l.matricola), l);
  }
  return { byOdl, byComuneMatricola };
}

/** Aggancia una riga del file: prima per ODL, poi per matricola nel comune del file. */
export function agganciaRiga(rigaFile, indice, comuneFile) {
  const perOdl = rigaFile.odl ? indice.byOdl.get(norm(rigaFile.odl)) : undefined;
  if (perOdl) return { lavoro: perOdl, via: 'odl' };
  const key = norm(comuneFile) + '|' + norm(rigaFile.matricola);
  const perMat = rigaFile.matricola ? indice.byComuneMatricola.get(key) : undefined;
  if (perMat) return { lavoro: perMat, via: 'matricola' };
  return null;
}

/** Extra = lavori manuali non ancora "consumati" da nessuna riga di alcun file. */
export function trovaExtra(lavori, idConsumati) {
  return (lavori ?? []).filter((l) => l.manuale && !idConsumati.has(l.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/match.mjs tools/limitazioni-sync/lib/match.test.ts
git commit -m "feat(lim-sync): norm/buildIndice/agganciaRiga/trovaExtra"
```

---

### Task 8: Pure `scrittura.mjs` — policy celle

**Files:**
- Create: `tools/limitazioni-sync/lib/scrittura.mjs`
- Test: `tools/limitazioni-sync/lib/scrittura.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/scrittura.test.ts
import { describe, it, expect } from 'vitest';
import { decidiScrittura } from './scrittura.mjs';

describe('decidiScrittura', () => {
  it('valore nuovo vuoto → salta', () => {
    expect(decidiScrittura('x', '')).toEqual({ azione: 'salta', valore: '' });
    expect(decidiScrittura(null, null)).toEqual({ azione: 'salta', valore: '' });
  });
  it('cella vuota → scrivi', () => {
    expect(decidiScrittura(null, 'eseguito')).toEqual({ azione: 'scrivi', valore: 'eseguito' });
    expect(decidiScrittura('   ', 'AA1')).toEqual({ azione: 'scrivi', valore: 'AA1' });
  });
  it('cella uguale → salta', () => {
    expect(decidiScrittura('eseguito', 'eseguito')).toEqual({ azione: 'salta', valore: 'eseguito' });
  });
  it('cella diversa già scritta a mano → conflitto (non sovrascrive)', () => {
    expect(decidiScrittura('No', 'eseguito')).toEqual({
      azione: 'conflitto', valore: 'eseguito', esistente: 'No',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/scrittura.test.ts`
Expected: FAIL — impossibile risolvere `./scrittura.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/scrittura.mjs
// PURE: decide cosa scrivere in una cella. Policy: "riempi vuote + segnala conflitti".

const t = (v) => (v == null ? '' : String(v).trim());

/** Ritorna { azione: 'scrivi' | 'salta' | 'conflitto', valore, esistente? }. */
export function decidiScrittura(cellaEsistente, nuovoValore) {
  const nuovo = t(nuovoValore);
  if (nuovo === '') return { azione: 'salta', valore: '' };
  const esistente = t(cellaEsistente);
  if (esistente === '') return { azione: 'scrivi', valore: nuovo };
  if (esistente === nuovo) return { azione: 'salta', valore: nuovo };
  return { azione: 'conflitto', valore: nuovo, esistente };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/scrittura.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/scrittura.mjs tools/limitazioni-sync/lib/scrittura.test.ts
git commit -m "feat(lim-sync): decidiScrittura (riempi vuote + conflitti)"
```

---

### Task 9: Pure `finestra.mjs` — calcolo from/to

**Files:**
- Create: `tools/limitazioni-sync/lib/finestra.mjs`
- Test: `tools/limitazioni-sync/lib/finestra.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tools/limitazioni-sync/lib/finestra.test.ts
import { describe, it, expect } from 'vitest';
import { finestra } from './finestra.mjs';

describe('finestra', () => {
  it('15 giorni inclusivi terminanti oggi', () => {
    expect(finestra('2026-06-16', 15)).toEqual({ from: '2026-06-02', to: '2026-06-16' });
  });
  it('finestra di 1 giorno = solo oggi', () => {
    expect(finestra('2026-06-16', 1)).toEqual({ from: '2026-06-16', to: '2026-06-16' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/finestra.test.ts`
Expected: FAIL — impossibile risolvere `./finestra.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/finestra.mjs
// PURE: from/to come 'YYYY-MM-DD', finestra di `giorni` inclusiva che termina a `oggiIso`.
export function finestra(oggiIso, giorni) {
  const to = oggiIso;
  const d = new Date(oggiIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (giorni - 1));
  const from = d.toISOString().slice(0, 10);
  return { from, to };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/finestra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/finestra.mjs tools/limitazioni-sync/lib/finestra.test.ts
git commit -m "feat(lim-sync): finestra(oggi, giorni) → from/to"
```

---

### Task 10: I/O `excelIO.mjs` — carica, trova intestazione, backup, salva

**Files:**
- Create: `tools/limitazioni-sync/lib/excelIO.mjs`
- Test: `tools/limitazioni-sync/lib/excelIO.test.ts`

- [ ] **Step 1: Write the failing test** (crea un xlsx in cartella temporanea e lo rilegge)

```ts
// tools/limitazioni-sync/lib/excelIO.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { caricaWorkbook, trovaRigaIntestazione, backupFile } from './excelIO.mjs';

async function creaFixture(file: string, headerRowIndex: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  // righe spazzatura sopra l'intestazione
  for (let r = 1; r < headerRowIndex; r++) ws.getRow(r).getCell(1).value = 'junk';
  const h = ws.getRow(headerRowIndex);
  h.getCell(6).value = 'ORDINE';        // F (idx0 5)
  h.getCell(9).value = 'MATRICOLA';     // I (idx0 8)
  h.getCell(67).value = 'esito';        // BO (idx0 66)
  h.getCell(69).value = 'sigillo posato'; // BQ (idx0 68)
  await wb.xlsx.writeFile(file);
}

describe('excelIO', () => {
  it('trova la riga di intestazione e fa il backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFixture(file, 3); // intestazione in riga 3

    const wb = await caricaWorkbook(file);
    const ws = wb.worksheets[0];
    expect(trovaRigaIntestazione(ws)).toBe(3);

    const dest = backupFile(file, '20260616-2100');
    expect(fs.existsSync(dest)).toBe(true);
    expect(path.basename(dest)).toBe('ZAGAROLO__20260616-2100.xlsx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/excelIO.test.ts`
Expected: FAIL — impossibile risolvere `./excelIO.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/excelIO.mjs
// I/O Excel con exceljs: caricamento, ricerca intestazione, backup, salvataggio.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { isFileMaster } from './colonne.mjs';

export async function caricaWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Riga di intestazione (1-based) nei primi `maxScan` righe cercando la firma master; -1 se assente.
 *  exceljs: `row.values` è 1-based con [0] vuoto → slice(1) per allineare agli indici 0-based. */
export function trovaRigaIntestazione(ws, maxScan = 10) {
  const limite = Math.min(maxScan, ws.rowCount);
  for (let r = 1; r <= limite; r++) {
    const valori = ws.getRow(r).values;
    const arr = Array.isArray(valori) ? valori.slice(1) : [];
    if (isFileMaster(arr)) return r;
  }
  return -1;
}

/** Copia di backup datata in <cartella>/_backup/<nome>__<stamp>.xlsx. */
export function backupFile(file, stamp) {
  const dir = path.join(path.dirname(file), '_backup');
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  const dest = path.join(dir, `${base}__${stamp}.xlsx`);
  fs.copyFileSync(file, dest);
  return dest;
}

export async function salva(wb, file) {
  await wb.xlsx.writeFile(file);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/excelIO.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/excelIO.mjs tools/limitazioni-sync/lib/excelIO.test.ts
git commit -m "feat(lim-sync): excelIO (carica/intestazione/backup/salva)"
```

---

### Task 11: I/O `fetchLavori.mjs` — chiamata endpoint

**Files:**
- Create: `tools/limitazioni-sync/lib/fetchLavori.mjs`
- Test: `tools/limitazioni-sync/lib/fetchLavori.test.ts`

- [ ] **Step 1: Write the failing test** (con `fetchImpl` iniettato)

```ts
// tools/limitazioni-sync/lib/fetchLavori.test.ts
import { describe, it, expect } from 'vitest';
import { fetchLavori } from './fetchLavori.mjs';

describe('fetchLavori', () => {
  it('chiama endpoint con header segreto e ritorna righe', async () => {
    let urlChiamato = '';
    let headerKey = '';
    const fakeFetch = async (url: string, opts: { headers: Record<string, string> }) => {
      urlChiamato = url;
      headerKey = opts.headers['x-export-key'];
      return { ok: true, json: async () => ({ righe: [{ id: 'a' }, { id: 'b' }] }) };
    };
    const righe = await fetchLavori(
      { endpointUrl: 'https://x/api/export/limitazioni-massive', exportKey: 'segreto', from: '2026-06-02', to: '2026-06-16' },
      fakeFetch as unknown as typeof fetch,
    );
    expect(righe).toHaveLength(2);
    expect(urlChiamato).toContain('from=2026-06-02');
    expect(urlChiamato).toContain('to=2026-06-16');
    expect(headerKey).toBe('segreto');
  });
  it('lancia su risposta non ok', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'no' });
    await expect(
      fetchLavori({ endpointUrl: 'https://x', exportKey: 'k', from: 'a', to: 'b' }, fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow('401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/lib/fetchLavori.test.ts`
Expected: FAIL — impossibile risolvere `./fetchLavori.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/lib/fetchLavori.mjs
// I/O: scarica i lavori dall'endpoint dell'app. `fetchImpl` iniettabile per i test.
export async function fetchLavori({ endpointUrl, exportKey, from, to }, fetchImpl = fetch) {
  const url = `${endpointUrl}?from=${from}&to=${to}`;
  const res = await fetchImpl(url, { headers: { 'x-export-key': exportKey } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`Endpoint ${res.status}: ${corpo}`);
  }
  const json = await res.json();
  return Array.isArray(json.righe) ? json.righe : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/lib/fetchLavori.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/fetchLavori.mjs tools/limitazioni-sync/lib/fetchLavori.test.ts
git commit -m "feat(lim-sync): fetchLavori (endpoint + header segreto)"
```

---

### Task 12: Orchestratore `agente.mjs` (`eseguiGiro` + `main`) + log

**Files:**
- Create: `tools/limitazioni-sync/agente.mjs`
- Test: `tools/limitazioni-sync/agente.test.ts`

- [ ] **Step 1: Write the failing end-to-end test** (fixture xlsx in temp, `lavori` iniettati, run non-dry)

```ts
// tools/limitazioni-sync/agente.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eseguiGiro } from './agente.mjs';

// crea ZAGAROLO.xlsx con intestazione ACEA (riga 1) + 2 righe pianificate
async function creaFile(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';        // F  odl
  h.getCell(9).value = 'MATRICOLA';     // I  matricola
  h.getCell(58).value = 'INDIRIZZO';    // BF via
  h.getCell(64).value = 'Località';     // BL comune
  h.getCell(65).value = 'Esecutore';    // BM
  h.getCell(66).value = 'data prevista';// BN
  h.getCell(67).value = 'esito';        // BO
  h.getCell(69).value = 'sigillo posato';// BQ
  h.getCell(70).value = 'stato odl';    // BR
  // riga 2: ODL che verrà lavorato
  const r2 = ws.getRow(2);
  r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
  // riga 3: ODL non lavorato (deve restare vuoto)
  const r3 = ws.getRow(3);
  r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
  await wb.xlsx.writeFile(file);
}

describe('eseguiGiro', () => {
  it('compila la riga lavorata, lascia vuota la non lavorata, aggiunge l\'extra', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-e2e-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const lavori = [
      { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
        esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esito_motivo: null,
        sigillo: 'AA728566', manuale: false },
      { id: 'b', odl: '', matricola: '202315612361', comune: 'ZAGAROLO', via: 'VIA Y 2',
        esecutore: 'PASTORELLI', data_esecuzione: '2026-06-04', esito: 'No', esito_motivo: 'Nessun passaggio',
        sigillo: '', manuale: true },
    ];

    const report = await eseguiGiro({ cartella: dir, lavori, dryRun: false, stamp: '20260616-2100' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 compilata
    expect(ws.getRow(2).getCell(65).value).toBe('CIARALLO');   // BM
    expect(ws.getRow(2).getCell(66).value).toBe('2026-06-03'); // BN
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');   // BO
    expect(ws.getRow(2).getCell(69).value).toBe('AA728566');   // BQ
    // riga 3 NON lavorata → resta vuota
    expect(ws.getRow(3).getCell(67).value ?? '').toBe('');
    // extra (id b) aggiunta in fondo con marcatore
    const ultima = ws.getRow(ws.rowCount);
    expect(ultima.getCell(9).value).toBe('202315612361');      // matricola
    expect(ultima.getCell(67).value).toBe('No');               // esito
    expect(ultima.getCell(71).value).toBe('AGGIUNTA APP');     // BS marker (idx0 70 → cell 71)
    // report coerente
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.file[0].extraAggiunte).toBe(1);
    // backup creato
    expect(fs.existsSync(path.join(dir, '_backup', 'ZAGAROLO__20260616-2100.xlsx'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/limitazioni-sync/agente.test.ts`
Expected: FAIL — impossibile risolvere `./agente.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// tools/limitazioni-sync/agente.mjs
// Orchestrazione: scarica i lavori → per ogni file-master aggancia/scrive/aggiunge → backup/salva → log.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione, backupFile, salva } from './lib/excelIO.mjs';
import { rilevaColonne, colonnaMarker } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { decidiScrittura } from './lib/scrittura.mjs';
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';

const MARKER = 'AGGIUNTA APP';

/** Comune prevalente fra le righe dati (per agganciare le matricole al comune giusto). */
function comunePrevalente(ws, rIntest, colComune) {
  const conteggio = new Map();
  for (let r = rIntest + 1; r <= ws.rowCount; r++) {
    const v = norm(ws.getRow(r).getCell(colComune + 1).value);
    if (v) conteggio.set(v, (conteggio.get(v) ?? 0) + 1);
  }
  let best = '';
  let n = -1;
  for (const [k, c] of conteggio) if (c > n) { best = k; n = c; }
  return best;
}

export async function eseguiGiro({ cartella, lavori, dryRun, stamp }) {
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [] };
  const indice = buildIndice(lavori);
  const idConsumati = new Set();
  const comuniConFile = new Set();

  const files = fs
    .readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));

  for (const file of files) {
    const fileReport = {
      file: path.basename(file), master: false, aggiornate: 0, extraAggiunte: 0,
      conflitti: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) { report.file.push(fileReport); continue; } // non master → ignora
      fileReport.master = true;

      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header);
      const comuneFile =
        (col.comune != null ? comunePrevalente(ws, rIntest, col.comune) : '') ||
        norm(path.basename(file, '.xlsx'));
      comuniConFile.add(comuneFile);

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);
        const campi = [
          ['esecutore', hit.lavoro.esecutore],
          ['data', hit.lavoro.data_esecuzione],
          ['esito', hit.lavoro.esito],
          ['sigillo', hit.lavoro.sigillo],
        ];
        let toccata = false;
        for (const [chiave, valore] of campi) {
          if (col[chiave] == null) continue;
          const cell = row.getCell(col[chiave] + 1);
          const d = decidiScrittura(cell.value, valore);
          if (d.azione === 'scrivi') { cell.value = d.valore; toccata = true; }
          else if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: chiave, esistente: d.esistente, nuovo: d.valore });
          }
        }
        if (toccata) fileReport.aggiornate++;
      }

      // 2) extra di questo comune
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      if (extraComune.length) {
        const markerCol = colonnaMarker(header);
        for (const l of extraComune) {
          idConsumati.add(l.id);
          const row = ws.addRow([]);
          const set = (c, v) => { if (c != null && v) row.getCell(c + 1).value = v; };
          set(col.matricola, l.matricola);
          set(col.via, l.via);
          set(col.esecutore, l.esecutore);
          set(col.data, l.data_esecuzione);
          set(col.esito, l.esito);
          set(col.sigillo, l.sigillo);
          row.getCell(markerCol + 1).value = MARKER;
          fileReport.extraAggiunte++;
        }
      }

      if (!dryRun && (fileReport.aggiornate > 0 || fileReport.extraAggiunte > 0)) {
        backupFile(file, stamp);
        await salva(wb, file);
      }
    } catch (e) {
      fileReport.saltato = true;
      fileReport.errore = e instanceof Error ? e.message : String(e);
    }
    report.file.push(fileReport);
  }

  // extra di comuni senza file
  report.extraNonCollocate = trovaExtra(lavori, idConsumati)
    .filter((l) => !comuniConFile.has(norm(l.comune)))
    .map((l) => ({ id: l.id, comune: l.comune, matricola: l.matricola, esecutore: l.esecutore }));

  return report;
}

/** Scrive il report in <cartella>/_log/<stamp>.json. */
function scriviLog(cartella, stamp, report) {
  const dir = path.join(cartella, '_log');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const now = new Date();
  const oggi = now.toISOString().slice(0, 10);
  const { from, to } = finestra(oggi, cfg.finestraGiorni ?? 15);
  const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({ cartella: cfg.cartella, lavori, dryRun: !!cfg.dryRun, stamp });
  scriviLog(cfg.cartella, stamp, report);
  console.log(`[${stamp}] lavori=${lavori.length} dryRun=${!!cfg.dryRun}`);
  console.log(JSON.stringify(report, null, 2));
}

// Esegui main() solo se invocato direttamente (non quando importato nei test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/limitazioni-sync/agente.test.ts`
Expected: PASS.

- [ ] **Step 5: Suite mirata completa del WP + commit**

Run: `npx vitest run tools/limitazioni-sync/ lib/limitazione/exportLimMassive.test.ts`
Expected: tutti i test del WP PASS.

```bash
git add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/agente.test.ts
git commit -m "feat(lim-sync): orchestratore eseguiGiro + main + log"
```

---

### Task 13: Packaging, prova sul campo (dry-run) e pianificazione

> Passi **operativi** (manuali) sul PC di lavoro. Nessun test automatico; la verifica è il report dry-run.

- [ ] **Step 1: Prepara il pacchetto da copiare sul PC**

Sul PC di sviluppo, assicurati che `tools/limitazioni-sync/node_modules/exceljs` esista (Task 5 Step 5). Copia l'intera cartella `tools/limitazioni-sync/` (inclusa `node_modules/`, esclusi `_backup/`, `_log/`, `config.json`) sul PC di lavoro, es. in `C:\Users\edgardo.perrelli\limitazioni-sync\`.

- [ ] **Step 2: Configura sul PC di lavoro**

Copia `config.example.json` → `config.json` e compila:
- `endpointUrl`: l'URL Vercel reale + `/api/export/limitazioni-massive`
- `exportKey`: lo **stesso** segreto messo su Vercel (Task 4 Step 6)
- `cartella`: il percorso reale (verificato dal probe: `C:\Users\edgardo.perrelli\Plenzich s.p.a\…\LIMITAZIONI MASSIVE`)
- `dryRun`: **true**

- [ ] **Step 3: Prima esecuzione in DRY-RUN**

In PowerShell (percorso del Node portable di Task ambiente):
```powershell
& "C:\Users\edgardo.perrelli\node\node-v24.16.0-win-x64\node.exe" "C:\Users\edgardo.perrelli\limitazioni-sync\agente.mjs"
```
Expected: stampa `lavori=N dryRun=true` e un report JSON. **Non** modifica `ZAGAROLO.xlsx`. Apri `_log\<stamp>.json` e verifica: `file[].master=true` per ZAGAROLO, `aggiornate>0`, eventuali `conflitti`/`extraAggiunte`, `extraNonCollocate`.

- [ ] **Step 4: Esecuzione reale + verifica visiva**

Metti `"dryRun": false` nel `config.json`, rilancia il comando dello Step 3. Poi:
- apri `ZAGAROLO.xlsx` in Excel e verifica a vista: BM/BN/BO/BQ compilate sulle righe lavorate, BR (stato odl) e BP (saracinesca) **intatte**, formattazione integra, eventuali righe "AGGIUNTA APP" in fondo;
- verifica che OneDrive abbia sincronizzato (icona ✔ / file visibile su SharePoint web);
- controlla la cartella `_backup\` (copia datata creata).

- [ ] **Step 5: Crea l'attività pianificata (21:00, senza admin)**

In PowerShell (utente normale), una riga sola — adatta i percorsi:
```powershell
$node = "C:\Users\edgardo.perrelli\node\node-v24.16.0-win-x64\node.exe"
$agente = "C:\Users\edgardo.perrelli\limitazioni-sync\agente.mjs"
schtasks /Create /TN "LimitazioniMassiveSync" /TR "`"$node`" `"$agente`"" /SC DAILY /ST 21:00 /F
```
Expected: `SUCCESS: The scheduled task "LimitazioniMassiveSync" has successfully created.` (l'attività gira nella tua sessione, quando sei loggato — è ciò che serve a OneDrive).

- [ ] **Step 6: Prova manuale dell'attività + commit del README aggiornato**

Run: `schtasks /Run /TN "LimitazioniMassiveSync"` → controlla che venga scritto un nuovo `_log\<stamp>.json`.

Aggiorna `tools/limitazioni-sync/README.md` con i comandi reali usati (percorso Node, comando schtasks) e committa:
```bash
git add tools/limitazioni-sync/README.md
git commit -m "docs(lim-sync): istruzioni pacchetto, dry-run e attivita pianificata"
```

---

## Self-Review (compilato in fase di scrittura del piano)

**1. Spec coverage:**
- Endpoint protetto + JSON tradotto → Task 1-4. ✅
- Aggancio ODL→matricola → Task 7 (`agganciaRiga`). ✅
- Scrittura solo BM/BN/BO/BQ, BP/BR intatte → Task 12 (lista `campi` non include BP/BR). ✅
- Policy riempi-vuote + conflitti → Task 8 + uso in Task 12. ✅
- Esito eseguito/No, non-lavorate vuote → Task 2 (`esitoFileDaIntervento` ritorna null se non completato → l'endpoint lo include solo se `stato='completato'`; le righe del file senza lavoro agganciato restano intatte). ✅
- Extra in fondo + marcatore "AGGIUNTA APP" → Task 12. ✅
- Extra di comuni senza file → `extraNonCollocate` nel report → Task 12. ✅
- Selezione file-master per firma colonne (ignora INTERVENTI_*.xlsx) → Task 6 (`isFileMaster`) + Task 10/12. ✅
- Backup datato, dry-run, log, file aperto/lock (try/catch per-file → `saltato`) → Task 10/12/13. ✅
- Sigillo da `rapportino_voci.risposte->>'sigillo'` → Task 4 (mappa sigillo). ✅
- Esecutore = primo token display_name → Task 1. ✅
- Finestra 15 giorni → Task 9 + `main`. ✅
- Attività pianificata 21:00 senza admin → Task 13. ✅

**2. Placeholder scan:** nessun "TBD"/"handle errors"/"simile a"; ogni step ha codice o comando reale. ✅

**3. Type/nome consistency:** `RigaLimMassive`/`RigaDb` definiti in Task 3 e usati in Task 4; campi dei `lavori` (`id, odl, matricola, comune, via, esecutore, data_esecuzione, esito, esito_motivo, sigillo, manuale`) coerenti tra endpoint (Task 3) e agente (Task 7/12); `rilevaColonne`/`isFileMaster`/`colonnaMarker` (Task 6) usati con gli stessi nomi in Task 10/12; convenzione `col + 1` per exceljs ribadita ovunque. ✅
