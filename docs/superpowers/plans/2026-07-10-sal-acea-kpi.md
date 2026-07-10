# SAL ufficiali ACEA nel KPI Produzione economica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingerire i file SAL ufficiali ACEA (`SAL N.xlsx`, cartella CONTABILITA' della commessa) nel modulo KPI Produzione economica, per mostrare alla direzione SAL pagato / Pre-SAL / Fuori SAL / storico SAL — sostituendo l'attuale card "SAL" (che in realtà mostra l'esitato-portale, non il pagato) — e correggere un bug per cui le saracinesche DUNNING non arrivano mai al KPI.

**Architecture:** L'agente Node (`tools/limitazioni-sync`) legge i file `SAL N.xlsx` per NOME colonna (come già fa per il master DUNNING) e li invia via `/api/agente/report` (nuovo campo `salFiles`) a una tabella `acea_sal`. Il loader `lib/produzione/load.ts` calcola Pre-SAL (esitato E% non ancora in un SAL) e Fuori SAL (produzione il cui ODL non è affatto consuntivato) per differenza rispetto ai dati già presenti nel loader; lo storico SAL confronta il Valore APS ufficiale con la valorizzazione a listino (controllo taratura prezzi). Ingestione on-demand da un bottone su `/hub/agente` (flag one-shot, stesso pattern di "Richiedi stato ACEA").

**Tech Stack:** Next.js (App Router) + Supabase (Postgres) + TypeScript, agente Node ESM (`exceljs`), vitest.

## Global Constraints

- Nome file SAL: `SAL N.xlsx` — numero estratto con `/SAL\s*(\d+)/i` (case-insensitive, tollerante a suffissi tipo "SAL 1 - rev.xlsx").
- Pre-SAL = differenza **per ODL** (ODL esitato E% non presente in NESSUN SAL caricato), non per data/cutoff.
- Il SAL è valorizzato con la colonna **"Valore APS"** del file (fonte ufficiale ACEA); Pre-SAL e Fuori SAL restano valorizzati a **listino** (stima).
- Ingestione: **bottone one-shot su `/hub/agente`** ("Leggi SAL"). Niente lettura automatica nel giro serale, niente upload da UI.
- UI: 3 card (SAL pagato / Pre-SAL / Fuori SAL) + tabella storico SAL, sia nella tab `/hub/performance/economica` sia nella vista `/presentazione/produzione-acea`.
- La card "SAL" e la card "scarto" **attuali vengono sostituite**, non affiancate — non devono coesistere due numeri diversi entrambi chiamati "SAL".
- Controllo leggero (niente audit per-ODL nuovo): per ogni SAL, Δ tra Valore APS e valorizzazione a listino + conteggio "ODL sconosciuti" (assenti da DB, master e portale).
- Fix incluso in questa feature (non PR separata): le saracinesche DUNNING (PR #73) non arrivano oggi al KPI — vedi Task 1.
- Fuori scope (YAGNI): upload manuale da UI, audit per-ODL sul SAL, multi-commessa (una sola cartella `salPath`), stima dell'APS sul pre-SAL.
- `config.json` (credenziali reali) è **gitignored** — i task toccano solo `config.example.json`; l'aggiornamento del `config.json` reale su questo PC e l'applicazione della migration al DB di produzione sono passi manuali post-merge (vedi fondo piano), non delegabili a un worktree isolato.
- Nessuno dei file toccati da questo piano è nella lista protetta dell'hook `guard-acea.mjs` (verificato) — nessuna conferma extra attesa durante l'esecuzione.

---

### Task 1: Fix — saracinesche DUNNING nel KPI

**Files:**
- Create: `lib/produzione/saracinescaProdotta.ts`
- Create: `lib/produzione/saracinescaProdotta.test.ts`
- Modify: `lib/produzione/load.ts` (import + una condizione, righe del blocco saracinesca nel loop `masterRows`)

**Interfaces:**
- Produces: `saracinescaProdotta(saracinesca: string | null | undefined, esitoMaster: string | null | undefined, dbEsitoOk: boolean | null | undefined): boolean`

- [ ] **Step 1: Scrivi il test (fallirà: il modulo non esiste ancora)**

```ts
// lib/produzione/saracinescaProdotta.test.ts
import { describe, it, expect } from 'vitest';
import { saracinescaProdotta } from './saracinescaProdotta';

describe('saracinescaProdotta', () => {
  it('non saracinesca -> false a prescindere dal resto', () => {
    expect(saracinescaProdotta('NO', 'eseguito', true)).toBe(false);
    expect(saracinescaProdotta(null, 'eseguito', true)).toBe(false);
  });
  it('ZAGAROLO: esito=eseguito -> true', () => {
    expect(saracinescaProdotta('SI', 'eseguito', null)).toBe(true);
    expect(saracinescaProdotta('SI', 'ESEGUITO', null)).toBe(true); // case-insensitive
  });
  it('ZAGAROLO: esito diverso da eseguito -> false, ANCHE se il DB è positivo (nessun fallback)', () => {
    expect(saracinescaProdotta('SI', 'no', true)).toBe(false);
  });
  it('DUNNING (esito assente dal master): usa il DB', () => {
    expect(saracinescaProdotta('SI', '', true)).toBe(true);
    expect(saracinescaProdotta('SI', null, true)).toBe(true);
  });
  it('DUNNING: DB negativo o assente -> false', () => {
    expect(saracinescaProdotta('SI', '', false)).toBe(false);
    expect(saracinescaProdotta('SI', '', null)).toBe(false);
    expect(saracinescaProdotta('SI', '', undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm test -- saracinescaProdotta`
Expected: FAIL — `Cannot find module './saracinescaProdotta'`

- [ ] **Step 3: Implementa**

```ts
// lib/produzione/saracinescaProdotta.ts
// PURA: decide se una riga master con saracinesca=SI genera PRODUZIONE "Sostituzione saracinesca".
// ZAGAROLO ha la colonna "esito" (eseguito/no): fonte di verità INVARIATA, nessun fallback.
// Il master DUNNING NON ha quella colonna (esito sempre vuoto): la fonte di verità è il nostro DB
// (da cui la PR #73 scrive "SI" in Saracinesca), letto tramite l'ODL positivo.
export function saracinescaProdotta(
  saracinesca: string | null | undefined,
  esitoMaster: string | null | undefined,
  dbEsitoOk: boolean | null | undefined,
): boolean {
  const sara = String(saracinesca ?? '').trim().toUpperCase() === 'SI';
  if (!sara) return false;
  const esito = String(esitoMaster ?? '').trim().toLowerCase();
  if (esito) return esito === 'eseguito';
  return dbEsitoOk === true;
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npm test -- saracinescaProdotta`
Expected: PASS (5 test)

- [ ] **Step 5: Wire in `load.ts`**

In `lib/produzione/load.ts`, aggiungi l'import vicino agli altri import di `lib/produzione`:

```ts
import { saracinescaProdotta } from './saracinescaProdotta';
```

Poi sostituisci la condizione del blocco saracinesca (dentro il `for (const m of masterRows)`):

```ts
    // PRIMA:
    if ((m.saracinesca ?? '').trim().toUpperCase() === 'SI' && (m.esito ?? '').trim().toLowerCase() === 'eseguito') {
```

con:

```ts
    // saracinesca prodotta → voce "Sostituzione saracinesca", IN AGGIUNTA alla limitazione padre.
    // ZAGAROLO: fonte verità = colonna esito del master. DUNNING (senza quella colonna): fonte
    // verità = il nostro DB (positivo sull'ODL) — vedi saracinescaProdotta().
    if (saracinescaProdotta(m.saracinesca, m.esito, dbAudit.get(odl)?.esitoOk)) {
```

Il resto del blocco (righe interne che leggono `info`, `data`, push su `saracinesca`/`produzioneRighe`) resta invariato.

- [ ] **Step 6: Verifica suite completa**

Run: `npm test`
Expected: PASS (nessuna regressione)

- [ ] **Step 7: Commit**

```bash
git add lib/produzione/saracinescaProdotta.ts lib/produzione/saracinescaProdotta.test.ts lib/produzione/load.ts
git commit -m "fix(acea): saracinesche DUNNING nel KPI produzione economica"
```

---

### Task 2: Migration — tabella `acea_sal` + flag agente

**Files:**
- Create: `supabase/migrations/20260710090000_acea_sal.sql`

**Interfaces:**
- Produces: tabella `acea_sal(sal_n, odl, doc_acquisti, posizione, valore, causa, attivita, data_completamento, data_registrazione, raccolto_at, run_id)`, PK `(sal_n, doc_acquisti, posizione)`; colonna `agente_config.forza_acea_sal boolean`.

- [ ] **Step 1: Scrivi la migration**

```sql
-- supabase/migrations/20260710090000_acea_sal.sql
-- SAL ufficiali ACEA (file "SAL N.xlsx" nella cartella CONTABILITA' della commessa): storico
-- ordini pagati per SAL, letti dall'agente via il bottone «Leggi SAL» (/hub/agente). Chiave
-- naturale SAP (Documento acquisti + Posizione): un ODL può avere più posizioni sullo stesso
-- documento; il file può essere ricaricato/corretto da ACEA → delete+insert per sal_n assorbe
-- la correzione (vedi app/api/agente/report/route.ts).
create table if not exists acea_sal (
  sal_n              int not null,
  odl                text not null,
  doc_acquisti       text not null,
  posizione          text not null,
  valore             numeric(10, 2) not null default 0,  -- "Valore APS" (ufficiale ACEA)
  causa              text,                                -- "Causa scostamento"
  attivita           text,                                -- "Operazione testo breve"
  data_completamento date,
  data_registrazione date,
  raccolto_at        timestamptz not null default now(),
  run_id             uuid,
  primary key (sal_n, doc_acquisti, posizione)
);
create index if not exists acea_sal_odl_idx on acea_sal (odl);

alter table acea_sal enable row level security;
drop policy if exists acea_sal_all_auth on acea_sal;
create policy acea_sal_all_auth on acea_sal
  for all to authenticated using (true) with check (true);

-- flag one-shot "Leggi SAL" sul singleton agente_config (stesso pattern di forza_acea_stato).
alter table agente_config add column if not exists forza_acea_sal boolean not null default false;
```

- [ ] **Step 2: Verifica sintassi (nessun DB locale in questo repo — solo lettura)**

Run: `cat supabase/migrations/20260710090000_acea_sal.sql`
Expected: il file esiste, non ci sono errori di battitura evidenti (parentesi bilanciate, `;` finali). L'applicazione reale al DB di produzione è un passo manuale post-merge (vedi fondo piano) — non eseguirla da questo task.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710090000_acea_sal.sql
git commit -m "feat(acea): migration tabella acea_sal + flag forza_acea_sal"
```

---

### Task 3: Logica pura — `lib/produzione/salUfficiale.ts`

**Files:**
- Create: `lib/produzione/salUfficiale.ts`
- Create: `lib/produzione/salUfficiale.test.ts`

**Interfaces:**
- Consumes: `dataDaRaw(raw: string | null | undefined): string | null` da `./dataDaRaw` (esistente).
- Produces:
  - `interface SalRigaGrezza { odl?: string; docAcquisti?: string; posizione?: string; valoreAps?: number; causa?: string; attivita?: string; dataCompletamentoRaw?: string; dataRegistrazioneRaw?: string; }`
  - `interface SalRigaDb { sal_n: number; odl: string; doc_acquisti: string; posizione: string; valore: number; causa: string | null; attivita: string | null; data_completamento: string | null; data_registrazione: string | null; }`
  - `preparaRigheSal(salN: number, grezze: SalRigaGrezza[]): SalRigaDb[]`
  - `interface SalStorico { n: number; mese: string; ordini: number; valoreAps: number; valoreListino: number; deltaListino: number; odlSconosciuti: number; }`
  - `interface SalRigaArricchita extends SalRigaDb { valoreListino: number; }`
  - `riepilogoUnSal(righe: SalRigaArricchita[], odlConosciuti: Set<string>): SalStorico`
  - `odlPagatiDaSal(righeSal: Array<{ odl: string }>): Set<string>`
  - `chiaveSalEffettiva(riga: { odl: string; attivitaKey: string }, saracinescaKey: string, saracinescaFiglioByParent: Map<string, string>): string`

- [ ] **Step 1: Scrivi il test (fallirà: il modulo non esiste ancora)**

```ts
// lib/produzione/salUfficiale.test.ts
import { describe, it, expect } from 'vitest';
import { chiaveSalEffettiva, odlPagatiDaSal, preparaRigheSal, riepilogoUnSal, type SalRigaArricchita } from './salUfficiale';

describe('preparaRigheSal', () => {
  it('mappa i campi e converte le date', () => {
    const out = preparaRigheSal(1, [{
      odl: '957276160', docAcquisti: '4206329130', posizione: '10', valoreAps: 25.46,
      causa: 'EFRE', attivita: 'Limitazione flusso idrico',
      dataCompletamentoRaw: '2026-06-10', dataRegistrazioneRaw: '2026-07-08',
    }]);
    expect(out).toEqual([{
      sal_n: 1, odl: '957276160', doc_acquisti: '4206329130', posizione: '10', valore: 25.46,
      causa: 'EFRE', attivita: 'Limitazione flusso idrico',
      data_completamento: '2026-06-10', data_registrazione: '2026-07-08',
    }]);
  });

  it('scarta le righe senza Ordine', () => {
    expect(preparaRigheSal(1, [{ odl: '', docAcquisti: 'x', posizione: '1', valoreAps: 1 }])).toEqual([]);
  });

  it('dedup per (docAcquisti, posizione)', () => {
    const grezze = [
      { odl: '1', docAcquisti: 'D1', posizione: '10', valoreAps: 5 },
      { odl: '1', docAcquisti: 'D1', posizione: '10', valoreAps: 5 },
    ];
    expect(preparaRigheSal(1, grezze)).toHaveLength(1);
  });

  it('valoreAps non numerico -> 0', () => {
    const out = preparaRigheSal(1, [{ odl: '1', docAcquisti: 'd', posizione: '1', valoreAps: NaN }]);
    expect(out[0].valore).toBe(0);
  });
});

describe('riepilogoUnSal', () => {
  const riga = (over: Partial<SalRigaArricchita>): SalRigaArricchita => ({
    sal_n: 1, odl: '1', doc_acquisti: 'd', posizione: '10', valore: 100, causa: 'EFRE',
    attivita: 'X', data_completamento: '2026-06-15', data_registrazione: '2026-07-08',
    valoreListino: 90, ...over,
  });

  it('somma valore APS e listino, calcola il delta', () => {
    const out = riepilogoUnSal([riga({}), riga({ odl: '2', valore: 50, valoreListino: 50 })], new Set(['1', '2']));
    expect(out).toMatchObject({ n: 1, ordini: 2, valoreAps: 150, valoreListino: 140, deltaListino: 10, odlSconosciuti: 0 });
  });

  it('mese = mese completamento più vecchio (min data)', () => {
    const out = riepilogoUnSal([riga({ data_completamento: '2026-06-30' }), riga({ odl: '2', data_completamento: '2026-06-03' })], new Set(['1', '2']));
    expect(out.mese).toBe('2026-06');
  });

  it('mese vuoto se nessuna riga ha data completamento', () => {
    expect(riepilogoUnSal([riga({ data_completamento: null })], new Set(['1'])).mese).toBe('');
  });

  it('conta gli ODL sconosciuti (assenti dal set)', () => {
    const out = riepilogoUnSal([riga({ odl: 'x' })], new Set(['altro']));
    expect(out.odlSconosciuti).toBe(1);
  });

  it('[] -> n=0, tutti gli aggregati a 0', () => {
    expect(riepilogoUnSal([], new Set())).toMatchObject({ n: 0, ordini: 0, valoreAps: 0, valoreListino: 0, deltaListino: 0, odlSconosciuti: 0, mese: '' });
  });
});

describe('odlPagatiDaSal', () => {
  it('set degli ODL, trim, scarta vuoti', () => {
    const s = odlPagatiDaSal([{ odl: ' 1 ' }, { odl: '2' }, { odl: '' }]);
    expect(s).toEqual(new Set(['1', '2']));
  });
});

describe('chiaveSalEffettiva', () => {
  const figli = new Map([['PADRE1', 'FIGLIO1']]);
  it('riga normale -> il proprio odl', () => {
    expect(chiaveSalEffettiva({ odl: '123', attivitaKey: 'LIMITAZIONE' }, 'SARACINESCA', figli)).toBe('123');
  });
  it("saracinesca -> l'odl figlio", () => {
    expect(chiaveSalEffettiva({ odl: 'PADRE1', attivitaKey: 'SARACINESCA' }, 'SARACINESCA', figli)).toBe('FIGLIO1');
  });
  it('saracinesca senza figlio noto -> stringa vuota', () => {
    expect(chiaveSalEffettiva({ odl: 'IGNOTO', attivitaKey: 'SARACINESCA' }, 'SARACINESCA', figli)).toBe('');
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm test -- salUfficiale`
Expected: FAIL — `Cannot find module './salUfficiale'`

- [ ] **Step 3: Implementa**

```ts
// lib/produzione/salUfficiale.ts
// PURA: SAL ufficiali ACEA (file "SAL N.xlsx" della cartella CONTABILITA'). Ingestione
// (preparaRigheSal), riepilogo per SAL (riepilogoUnSal), e le chiavi di aggancio usate dal
// loader per calcolare Pre-SAL/Fuori SAL (odlPagatiDaSal, chiaveSalEffettiva).
import { dataDaRaw } from './dataDaRaw';

export interface SalRigaGrezza {
  odl?: string;
  docAcquisti?: string;
  posizione?: string;
  valoreAps?: number;
  causa?: string;
  attivita?: string;
  dataCompletamentoRaw?: string;
  dataRegistrazioneRaw?: string;
}

export interface SalRigaDb {
  sal_n: number;
  odl: string;
  doc_acquisti: string;
  posizione: string;
  valore: number;
  causa: string | null;
  attivita: string | null;
  data_completamento: string | null;
  data_registrazione: string | null;
}

/** Mappa le righe grezze lette dall'agente (leggiSal.mjs) alle righe da inserire in acea_sal.
 *  Dedup per (doc_acquisti, posizione) — chiave naturale SAP; scarta le righe senza Ordine. */
export function preparaRigheSal(salN: number, grezze: SalRigaGrezza[]): SalRigaDb[] {
  const seen = new Set<string>();
  const out: SalRigaDb[] = [];
  for (const g of grezze ?? []) {
    const odl = (g.odl ?? '').trim();
    if (!odl) continue;
    const docAcquisti = (g.docAcquisti ?? '').trim();
    const posizione = (g.posizione ?? '').trim();
    const chiave = `${docAcquisti}|${posizione}`;
    if (seen.has(chiave)) continue;
    seen.add(chiave);
    out.push({
      sal_n: salN,
      odl,
      doc_acquisti: docAcquisti,
      posizione,
      valore: Number.isFinite(g.valoreAps) ? Number(g.valoreAps) : 0,
      causa: (g.causa ?? '').trim() || null,
      attivita: (g.attivita ?? '').trim() || null,
      data_completamento: dataDaRaw(g.dataCompletamentoRaw),
      data_registrazione: dataDaRaw(g.dataRegistrazioneRaw),
    });
  }
  return out;
}

export interface SalStorico {
  n: number;
  mese: string; // 'YYYY-MM', '' se nessuna data
  ordini: number;
  valoreAps: number;
  valoreListino: number;
  deltaListino: number;
  odlSconosciuti: number;
}

export interface SalRigaArricchita extends SalRigaDb {
  valoreListino: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Riepiloga un SAL (righe già arricchite col valore-listino). `odlConosciuti`: ODL presenti in
 *  DB, master o portale (conteggio "sconosciuti a noi" — controllo leggero, non un audit per-ODL). */
export function riepilogoUnSal(righe: SalRigaArricchita[], odlConosciuti: Set<string>): SalStorico {
  const n = righe[0]?.sal_n ?? 0;
  const mesi = righe.map((r) => r.data_completamento).filter((d): d is string => !!d).sort();
  const valoreAps = round2(righe.reduce((s, r) => s + r.valore, 0));
  const valoreListino = round2(righe.reduce((s, r) => s + r.valoreListino, 0));
  return {
    n,
    mese: mesi.length > 0 ? mesi[0].slice(0, 7) : '',
    ordini: righe.length,
    valoreAps,
    valoreListino,
    deltaListino: round2(valoreAps - valoreListino),
    odlSconosciuti: righe.filter((r) => !odlConosciuti.has(r.odl)).length,
  };
}

/** Set degli ODL già presenti in almeno un SAL caricato (per il pre-SAL: esitati non ancora pagati). */
export function odlPagatiDaSal(righeSal: Array<{ odl: string }>): Set<string> {
  return new Set(righeSal.map((r) => r.odl.trim()).filter(Boolean));
}

/** Chiave "portale" effettiva di una riga di produzione, per il check pre-SAL/fuori-SAL: le
 *  saracinesche (attivitaKey === saracinescaKey) valgono per l'Odl FIGLIO (quello consuntivato sul
 *  portale), non per l'odl padre della limitazione scritto in riga. '' se non risolvibile
 *  (saracinesca "DA CHIEDERE", mai ordinata). */
export function chiaveSalEffettiva(
  riga: { odl: string; attivitaKey: string },
  saracinescaKey: string,
  saracinescaFiglioByParent: Map<string, string>,
): string {
  if (riga.attivitaKey === saracinescaKey) return saracinescaFiglioByParent.get(riga.odl) ?? '';
  return riga.odl;
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npm test -- salUfficiale`
Expected: PASS (15 test)

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/salUfficiale.ts lib/produzione/salUfficiale.test.ts
git commit -m "feat(acea): logica pura salUfficiale (ingestione + riepilogo SAL)"
```

---

### Task 4: Agente — legge i file SAL per nome colonna

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/leggiSal.mjs`
- Create: `tools/limitazioni-sync/lib/acea/leggiSal.test.ts`

**Interfaces:**
- Consumes: `caricaWorkbook(file)` da `../excelIO.mjs`; `risolviColonna(headers, nome)` da `../colonne.mjs`; `trovaIntestazioneAcea(righe, nomeColonnaChiave, maxScan?)` da `./leggiMasterAcea.mjs` (import in lettura — file protetto dall'hook guard-acea, NON va modificato).
- Produces:
  - `numeroSalDaNome(nomeFile: string): number | null`
  - `leggiFileSal(file: string): Promise<Array<{ odl, docAcquisti, posizione, valoreAps, causa, attivita, dataCompletamentoRaw, dataRegistrazioneRaw }>>`
  - `leggiSal(cartella: string): Promise<Array<{ n: number; file: string; righe: [...] }>>`

- [ ] **Step 1: Scrivi il test (fallirà: il modulo non esiste ancora)**

```ts
// tools/limitazioni-sync/lib/acea/leggiSal.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leggiFileSal, leggiSal, numeroSalDaNome } from './leggiSal.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-sal-'));

async function creaSal(file: string, righe: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  // ordine colonne volutamente diverso dal file reale: prova la lettura per NOME.
  ws.addRow(['Documento acquisti', 'Posizione', 'Ordine', 'Operazione testo breve', 'Causa scostamento', 'Valore APS', 'Data completamento lavori', 'Data registrazione']);
  for (const r of righe) ws.addRow(r);
  await wb.xlsx.writeFile(file);
}

describe('numeroSalDaNome', () => {
  it('estrae il numero da "SAL N.xlsx"', () => {
    expect(numeroSalDaNome('SAL 1.xlsx')).toBe(1);
    expect(numeroSalDaNome('sal 12.xlsx')).toBe(12);
  });
  it('null se non riconoscibile', () => {
    expect(numeroSalDaNome('ZAGAROLO.xlsx')).toBeNull();
    expect(numeroSalDaNome('')).toBeNull();
  });
});

describe('leggiFileSal', () => {
  it('legge per nome colonna, righe senza Ordine scartate', async () => {
    const file = path.join(dir, 'SAL 1.xlsx');
    await creaSal(file, [
      ['4206329130', '10', '957276160', 'Limitazione flusso idrico', 'EFRE', 25.46, new Date('2026-06-10'), new Date('2026-07-08')],
      ['4206329130', '20', '', 'Limitazione flusso idrico', 'EFRE', 25.46, new Date('2026-06-10'), new Date('2026-07-08')],
    ]);
    const righe = await leggiFileSal(file);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ odl: '957276160', docAcquisti: '4206329130', posizione: '10', valoreAps: 25.46, causa: 'EFRE', attivita: 'Limitazione flusso idrico' });
    expect(righe[0].dataCompletamentoRaw).toContain('2026');
  });

  it("[] se la colonna Ordine non c'è", async () => {
    const file = path.join(dir, 'nonsal.xlsx');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['Foo', 'Bar']);
    await wb.xlsx.writeFile(file);
    expect(await leggiFileSal(file)).toEqual([]);
  });
});

describe('leggiSal', () => {
  it('legge solo i file "SAL N" della cartella, numera per nome', async () => {
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-sal-dir-'));
    await creaSal(path.join(cartella, 'SAL 1.xlsx'), [['d1', '10', '111', 'X', 'EFRE', 10, new Date(), new Date()]]);
    await creaSal(path.join(cartella, 'SAL 2.xlsx'), [['d2', '10', '222', 'X', 'EFRE', 20, new Date(), new Date()]]);
    fs.writeFileSync(path.join(cartella, 'ZAGAROLO.xlsx'), 'non-xlsx-content'); // file non-SAL, ignorato per nome (mai aperto)

    const out = await leggiSal(cartella);
    expect(out.map((f) => f.n).sort()).toEqual([1, 2]);
    expect(out.find((f) => f.n === 1)!.righe[0].odl).toBe('111');
  });

  it('[] se la cartella non esiste', async () => {
    expect(await leggiSal(path.join(dir, 'assente'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `npm test -- tools/limitazioni-sync/lib/acea/leggiSal`
Expected: FAIL — `Cannot find module './leggiSal.mjs'`

- [ ] **Step 3: Implementa**

```js
// tools/limitazioni-sync/lib/acea/leggiSal.mjs
// Legge i file "SAL N.xlsx" della cartella CONTABILITA' (export SAP): per NOME colonna, come il
// master DUNNING (leggiMasterAcea.mjs), robusto al riordino delle colonne SAP.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook } from '../excelIO.mjs';
import { risolviColonna } from '../colonne.mjs';
import { trovaIntestazioneAcea } from './leggiMasterAcea.mjs';

const COL = {
  odl: 'Ordine',
  docAcquisti: 'Documento acquisti',
  posizione: 'Posizione',
  valoreAps: 'Valore APS',
  causa: 'Causa scostamento',
  attivita: 'Operazione testo breve',
  dataCompletamento: 'Data completamento lavori',
  dataRegistrazione: 'Data registrazione',
};

const t = (v) => String(v ?? '').trim();

/** Numero SAL dal nome file ("SAL 1.xlsx", "sal 12.xlsx"); null se non riconoscibile. */
export function numeroSalDaNome(nomeFile) {
  const m = t(nomeFile).match(/SAL\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Legge un singolo file SAL. Righe senza Ordine scartate. [] se la colonna Ordine non c'è. */
export async function leggiFileSal(file) {
  const wb = await caricaWorkbook(file);
  const ws = wb.worksheets[0];
  const tutte = [];
  for (let r = 1; r <= ws.rowCount; r++) tutte.push((ws.getRow(r).values || []).slice(1));
  const rIntest = trovaIntestazioneAcea(tutte, COL.odl);
  const header = tutte[rIntest - 1] || [];
  const idx = {
    odl: risolviColonna(header, COL.odl),
    docAcquisti: risolviColonna(header, COL.docAcquisti),
    posizione: risolviColonna(header, COL.posizione),
    valoreAps: risolviColonna(header, COL.valoreAps),
    causa: risolviColonna(header, COL.causa),
    attivita: risolviColonna(header, COL.attivita),
    dataCompletamento: risolviColonna(header, COL.dataCompletamento),
    dataRegistrazione: risolviColonna(header, COL.dataRegistrazione),
  };
  if (idx.odl < 0) return [];
  const cella = (row, i) => (i >= 0 && row[i] != null ? row[i] : null);
  const righe = [];
  for (const row of tutte.slice(rIntest)) {
    const odl = t(cella(row, idx.odl));
    if (!odl) continue;
    righe.push({
      odl,
      docAcquisti: t(cella(row, idx.docAcquisti)),
      posizione: t(cella(row, idx.posizione)),
      valoreAps: Number(cella(row, idx.valoreAps)) || 0,
      causa: t(cella(row, idx.causa)),
      attivita: t(cella(row, idx.attivita)),
      dataCompletamentoRaw: String(cella(row, idx.dataCompletamento) ?? ''),
      dataRegistrazioneRaw: String(cella(row, idx.dataRegistrazione) ?? ''),
    });
  }
  return righe;
}

/** Legge tutti i "SAL N.xlsx" della cartella. [] se la cartella non esiste. Ogni file fallito è
 *  best-effort (loggato, non blocca gli altri). File senza numero SAL riconoscibile: mai aperti. */
export async function leggiSal(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  const files = fs.readdirSync(cartella).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
  const out = [];
  for (const nome of files) {
    const n = numeroSalDaNome(nome);
    if (n == null) continue;
    try {
      const righe = await leggiFileSal(path.join(cartella, nome));
      if (righe.length > 0) out.push({ n, file: nome, righe });
    } catch (e) {
      console.error(`[lim-sync] leggiSal ${nome} fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `npm test -- tools/limitazioni-sync/lib/acea/leggiSal`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/leggiSal.mjs tools/limitazioni-sync/lib/acea/leggiSal.test.ts
git commit -m "feat(acea): agente legge i file SAL N.xlsx per nome colonna"
```

---

### Task 5: API — bottone «Leggi SAL» + flag nel tick

**Files:**
- Create: `app/api/admin/agente/acea-sal/route.ts`
- Modify: `app/api/agente/tick/route.ts`

**Interfaces:**
- Consumes: `requireAdmin()` da `@/lib/apiAuth`; `supabaseAdmin` da `@/lib/supabaseAdmin`.
- Produces: `POST /api/admin/agente/acea-sal` → `{ ok: true }`; il tick risponde con `aceaSal: boolean` (flag one-shot, consumato al momento della risposta, stesso pattern di `aceaStato`).

- [ ] **Step 1: Nuovo endpoint**

```ts
// app/api/admin/agente/acea-sal/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_acea_sal: true, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Estendi il tick**

In `app/api/agente/tick/route.ts`, aggiungi `forza_acea_sal: boolean;` in coda al tipo `ConfigRow` (dopo `acea_assegna_dry: boolean;`):

```ts
  acea_assegna_dry: boolean;
  forza_acea_sal: boolean;
};
```

Sostituisci la stringa `.select(...)` della query `agente_config`:

```ts
// PRIMA:
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno, forza_giro, forza_scan, pianifica_data, forza_acea_stato, acea_target, forza_acea_assegna, acea_assegna_data, acea_assegna_dry',
      )
// DOPO:
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno, forza_giro, forza_scan, pianifica_data, forza_acea_stato, acea_target, forza_acea_assegna, acea_assegna_data, acea_assegna_dry, forza_acea_sal',
      )
```

Dopo il blocco che consuma `forza_acea_assegna` (`const aceaAssegna = config.forza_acea_assegna === true; if (aceaAssegna) { ... }`), aggiungi:

```ts
    // Giro "Leggi SAL" on-demand: flag one-shot, consumato qui.
    const aceaSal = config.forza_acea_sal === true;
    if (aceaSal) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_sal: false }).eq('id', 1);
    }
```

Nell'oggetto JSON di risposta (`return NextResponse.json({ ... }, { headers: ... })`), aggiungi `aceaSal,` subito dopo `aceaAssegnaDry: config.acea_assegna_dry !== false,`:

```ts
        aceaAssegnaDry: config.acea_assegna_dry !== false,
        aceaSal,
      },
```

- [ ] **Step 3: Verifica che il progetto compili**

Run: `npm run build`
Expected: build senza errori TypeScript (nessun test automatico dedicato per questo glue — stesso pattern non testato di `aceaStato`/`aceaAssegna` nello stesso file).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/agente/acea-sal/route.ts app/api/agente/tick/route.ts
git commit -m "feat(acea): endpoint + flag tick per «Leggi SAL»"
```

---

### Task 6: Agente — orchestrazione giro «Leggi SAL»

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`
- Modify: `tools/limitazioni-sync/config.example.json`

**Interfaces:**
- Consumes: `leggiSal(cartella)` da `./lib/acea/leggiSal.mjs` (Task 4); `ris.aceaSal` dalla risposta del tick (Task 5); `inviaReport`/`scriviLog` già esistenti in `agente.mjs`.
- Produces: report `{ tipo: 'acea-sal', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], salFiles: [{ n, file, righe }] }` inviato a `/api/agente/report`.

- [ ] **Step 1: Aggiungi `acea.salPath` a `config.example.json`**

Dentro il blocco `"acea": { ... }` di `tools/limitazioni-sync/config.example.json`, aggiungi (accanto a `masterPath`/`zagarolo`):

```json
    "salPath": "C:\\Users\\<utente>\\Plenzich s.p.a\\Commesse - Documenti\\ANNO 2026\\CP 20260002_ACEA_GU IDRICHE L2\\8_LAVORI\\CONTABILITA'",
```

- [ ] **Step 2: Ramo di dispatch in `agente.mjs`**

In `tools/limitazioni-sync/agente.mjs`, dopo il blocco `if (ris.aceaAssegna && ris.aceaAssegnaData) { ... }` (prima della riga `const { eseguiOra, dryRun, ... } = ris;`), aggiungi:

```js
  // Giro "Leggi SAL" on-demand: indipendente da eseguiOra. Nessun Playwright (solo lettura file
  // dalla cartella CONTABILITA').
  if (ris.aceaSal) {
    const now = new Date();
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-sal';
    try {
      const { leggiSal } = await import('./lib/acea/leggiSal.mjs');
      const salFiles = await leggiSal(cfg.acea?.salPath ?? '');
      const report = { tipo: 'acea-sal', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], salFiles };
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      const righeTot = salFiles.reduce((s, f) => s + f.righe.length, 0);
      console.log(`[lim-sync] giro Leggi SAL: file=${salFiles.length} righe=${righeTot}`);
    } catch (e) {
      console.error(`[lim-sync] giro Leggi SAL fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
```

- [ ] **Step 3: Verifica suite completa**

Run: `npm test`
Expected: PASS (nessuna regressione — questo ramo di orchestrazione non ha un test dedicato, stesso pattern non testato di `ris.aceaStato`/`ris.aceaAssegna` nello stesso file).

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/config.example.json
git commit -m "feat(acea): agente orchestrazione giro «Leggi SAL»"
```

---

### Task 7: Ingestione — `/api/agente/report` scrive `acea_sal`

**Files:**
- Modify: `app/api/agente/report/route.ts`

**Interfaces:**
- Consumes: `preparaRigheSal(salN: number, grezze: SalRigaGrezza[]): SalRigaDb[]` da `@/lib/produzione/salUfficiale` (Task 3).

- [ ] **Step 1: Import**

Aggiungi in cima al file:

```ts
import { preparaRigheSal } from '@/lib/produzione/salUfficiale';
```

- [ ] **Step 2: Blocco di ingestione**

Dopo il blocco che ingerisce `masterSnapshot` (subito prima di `await supabaseAdmin.from('agente_config').update({ ultimo_giro_il: now.toISOString() }).eq('id', 1);`), aggiungi:

```ts
    // Storico SAL ufficiali (file CONTABILITA'): foto per sal_n, sostituita ad ogni giro «Leggi
    // SAL» (il file può essere corretto/ricaricato da ACEA — delete+insert assorbe la correzione).
    const bodySal = body as unknown as {
      salFiles?: Array<{
        n?: number;
        file?: string;
        righe?: Array<{
          odl?: string; docAcquisti?: string; posizione?: string; valoreAps?: number;
          causa?: string; attivita?: string; dataCompletamentoRaw?: string; dataRegistrazioneRaw?: string;
        }>;
      }>;
    };
    if (Array.isArray(bodySal.salFiles)) {
      for (const f of bodySal.salFiles) {
        if (typeof f?.n !== 'number' || !Array.isArray(f.righe)) continue;
        const righe = preparaRigheSal(f.n, f.righe).map((r) => ({ ...r, raccolto_at: now.toISOString(), run_id: runId }));
        const { error: eDel } = await supabaseAdmin.from('acea_sal').delete().eq('sal_n', f.n);
        if (eDel) { console.error('[report] acea_sal delete:', eDel.message); continue; }
        if (righe.length > 0) {
          const { error: eIns } = await supabaseAdmin.from('acea_sal').insert(righe);
          if (eIns) console.error('[report] acea_sal insert:', eIns.message);
        }
      }
    }
```

- [ ] **Step 3: Verifica che il progetto compili**

Run: `npm run build`
Expected: build senza errori TypeScript.

- [ ] **Step 4: Verifica suite completa**

Run: `npm test`
Expected: PASS (`preparaRigheSal` è già coperto dal Task 3; questo blocco di route è glue non testato direttamente, stesso pattern degli altri blocchi snapshot nello stesso file).

- [ ] **Step 5: Commit**

```bash
git add app/api/agente/report/route.ts
git commit -m "feat(acea): report ingerisce i file SAL in acea_sal"
```

---

### Task 8: Loader — Pre-SAL, Fuori SAL, non remunerato, storico SAL

**Files:**
- Modify: `lib/produzione/load.ts`
- Modify: `components/modules/performance/economica/tipi.ts`

**Interfaces:**
- Consumes: `riepilogoUnSal`, `odlPagatiDaSal`, `chiaveSalEffettiva`, tipi `SalStorico`/`SalRigaArricchita` da `./salUfficiale` (Task 3).
- Produces: `ProduzioneEconomica` (e `DatiProduzione` lato client) estesi con:
  - `salStorico: SalStorico[]`
  - `preSal: { n: number; totale: Totale }`
  - `fuoriSal: Totale`
  - `nonRemunerato: Totale`

- [ ] **Step 1: Import**

In `lib/produzione/load.ts`, aggiungi accanto agli altri import di `lib/produzione`:

```ts
import { chiaveSalEffettiva, odlPagatiDaSal, riepilogoUnSal, type SalRigaArricchita, type SalStorico } from './salUfficiale';
```

- [ ] **Step 2: Nuova interfaccia riga + caricamento `acea_sal`**

Aggiungi vicino alle altre interfacce `*Row` (es. dopo `PortaleRow`):

```ts
interface SalRow {
  sal_n: number;
  odl: string;
  doc_acquisti: string;
  posizione: string;
  valore: number;
  causa: string | null;
  attivita: string | null;
  data_completamento: string | null;
  data_registrazione: string | null;
}
```

Estendi il `Promise.all` iniziale in `caricaProduzioneEconomica` per caricare `acea_sal`:

```ts
  // PRIMA:
  const [listinoRows, interventi, masterRows, portaleRows, maps, alias, lavoroRows] = await Promise.all([
    ...
  ]);

  // DOPO:
  const [listinoRows, interventi, masterRows, portaleRows, maps, alias, lavoroRows, salRows] = await Promise.all([
    supabaseAdmin
      .from('acea_listino')
      .select('id, attivita, prezzo, valido_dal, valido_al, attivo')
      .eq('committente', 'acea'),
    caricaInterventiAcea(),
    caricaSnapshot<MasterRow>('acea_master_snapshot', 'odl, voce, attivita, esito, saracinesca, odl_saracinesca, esecutore, data_raw, comune'),
    caricaSnapshot<PortaleRow>('acea_portale_snapshot', 'odl, stato_norm, causa_scostamento'),
    nomi(),
    caricaAliasAttivita(),
    caricaLavoroGiornaliero(from, to),
    caricaSnapshot<SalRow>('acea_sal', 'sal_n, odl, doc_acquisti, posizione, valore, causa, attivita, data_completamento, data_registrazione'),
  ]);
```

- [ ] **Step 3: Dichiara le nuove strutture accumulatrici**

Nel blocco del loop `masterRows` (vicino a `const saracinesca: Array<{ odlFiglio: string; data: string }> = [];`), aggiungi:

```ts
  const saracinescaFiglioByParent = new Map<string, string>();
```

Dentro il blocco `if (saracinescaProdotta(...)) { ... }` (già modificato al Task 1), subito dopo `saracinesca.push({ odlFiglio: ..., data });`, aggiungi:

```ts
      saracinescaFiglioByParent.set(odl, (m.odl_saracinesca ?? '').trim());
```

- [ ] **Step 4: Estrai `rigaEsitataDa` e riscrivi il loop `portaleRows`**

Sostituisci questo intero blocco esistente (dalla dichiarazione di `portaleAudit` alla fine del `for`):

```ts
  // portale per ODL + SAL (limitazioni per ODL + saracinesca per Odl figlio).
  const portaleAudit = new Map<string, PortaleRiga>();
  const salRighe: RigaProduzione[] = [];
  for (const p of portaleRows) {
    const odl = (p.odl ?? '').trim();
    if (!odl) continue;
    // il gas riclassificato (committente effettivo italgas) è fuori dalla vista ACEA (audit + SAL)
    if (effByOdl.get(odl) === 'italgas') continue;
    const statoNorm = (p.stato_norm ?? '').trim();
    portaleAudit.set(odl, { statoNorm });
    // SAL = ciò che ACEA REMUNERA: solo COMPLETATO con causa scostamento pagata (inizia per E).
    // L'audit (portaleAudit) resta su tutti i COMPLETATO; qui filtriamo solo il valorizzato.
    if (statoNorm === 'COMPLETATO' && scostamentoPagato(p.causa_scostamento)) {
      if (saracinescaByFiglio.has(odl)) {
        // Odl figlio di una saracinesca consuntivato → vale la Sostituzione saracinesca (91,12),
        // non una limitazione con attività vuota. Evita la riga fantasma a 0 (niente doppio conteggio).
        const data = saracinescaByFiglio.get(odl) || to;
        salRighe.push({
          odl, voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL, data,
          staffId: '', operatore: '', territorioId: '', territorio: '',
          valore: valore(SARA_KEY, data),
        });
      } else {
        const voce = dbAudit.get(odl)?.voce ?? masterAudit.get(odl)?.voce ?? null;
        const attivitaKey = dbAttivita.get(odl) ?? masterAttivita.get(odl) ?? '';
        const data = dbDataByOdl.get(odl) ?? to;
        salRighe.push({
          odl, voce, kpi: voce != null ? KPI_DA_VOCE[voce] ?? null : null,
          attivitaKey, attivitaLabel: attivitaKey, data,
          staffId: '', operatore: '', territorioId: '', territorio: '',
          valore: valore(attivitaKey, data),
        });
      }
    }
  }
```

con:

```ts
  // Riga "esitata a sistema" per un ODL, valorizzata come limitazione o come saracinesca figlio
  // (stessa logica del blocco SAL preesistente, estratta per essere riusata anche dal ramo
  // "non remunerato" sotto — comportamento identico, solo condivisione del codice).
  const rigaEsitataDa = (odl: string): RigaProduzione => {
    if (saracinescaByFiglio.has(odl)) {
      const data = saracinescaByFiglio.get(odl) || to;
      return {
        odl, voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL, data,
        staffId: '', operatore: '', territorioId: '', territorio: '',
        valore: valore(SARA_KEY, data),
      };
    }
    const voce = dbAudit.get(odl)?.voce ?? masterAudit.get(odl)?.voce ?? null;
    const attivitaKey = dbAttivita.get(odl) ?? masterAttivita.get(odl) ?? '';
    const data = dbDataByOdl.get(odl) ?? to;
    return {
      odl, voce, kpi: voce != null ? KPI_DA_VOCE[voce] ?? null : null,
      attivitaKey, attivitaLabel: attivitaKey, data,
      staffId: '', operatore: '', territorioId: '', territorio: '',
      valore: valore(attivitaKey, data),
    };
  };

  const portaleAudit = new Map<string, PortaleRiga>();
  const odlCompletatoAny = new Set<string>();
  const salRighe: RigaProduzione[] = [];
  const nonRemuneratoRighe: RigaProduzione[] = [];
  for (const p of portaleRows) {
    const odl = (p.odl ?? '').trim();
    if (!odl) continue;
    // il gas riclassificato (committente effettivo italgas) è fuori dalla vista ACEA (audit + SAL)
    if (effByOdl.get(odl) === 'italgas') continue;
    const statoNorm = (p.stato_norm ?? '').trim();
    portaleAudit.set(odl, { statoNorm });
    if (statoNorm !== 'COMPLETATO') continue;
    odlCompletatoAny.add(odl);
    // SAL = ciò che ACEA REMUNERA: solo causa scostamento pagata (inizia per E).
    if (scostamentoPagato(p.causa_scostamento)) {
      salRighe.push(rigaEsitataDa(odl));
    } else {
      // consuntivato dal portale ma causale a nostro carico: esitato, mai remunerato da ACEA.
      nonRemuneratoRighe.push(rigaEsitataDa(odl));
    }
  }
```

- [ ] **Step 5: Pre-SAL, Fuori SAL, non remunerato, storico SAL**

Dopo il blocco `const salAgg = ...; const sal: ProduzioneSal = ...; const scarto = ...;` esistente, aggiungi:

```ts
  const nonRemunerato: Totale = aggregaProduzione(nonRemuneratoRighe).totale;

  const fuoriSalRighe = righeDedup.filter((r) => {
    const k = chiaveSalEffettiva(r, SARA_KEY, saracinescaFiglioByParent);
    return !k || !odlCompletatoAny.has(k);
  });
  const fuoriSal: Totale = aggregaProduzione(fuoriSalRighe).totale;

  // ODL "conosciuti" (controllo leggero dello storico SAL): presenti in DB, master o portale.
  const odlConosciuti = new Set<string>([...dbAudit.keys(), ...masterAudit.keys(), ...portaleAudit.keys()]);
  const odlGiaPagati = odlPagatiDaSal(salRows);
  const salPerN = new Map<number, SalRow[]>();
  for (const r of salRows) {
    if (!salPerN.has(r.sal_n)) salPerN.set(r.sal_n, []);
    salPerN.get(r.sal_n)!.push(r);
  }
  const salStorico: SalStorico[] = [...salPerN.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, righeSalN]) => {
      const arricchite: SalRigaArricchita[] = righeSalN.map((r) => {
        const canonSal = r.attivita ? attivitaCanonica('acea', r.attivita, null, alias) : null;
        const attivitaKey = canonSal?.attivitaKey ?? '';
        const dataVal = r.data_completamento ?? r.data_registrazione ?? to;
        return { ...r, valoreListino: attivitaKey ? valore(attivitaKey, dataVal) : 0 };
      });
      return riepilogoUnSal(arricchite, odlConosciuti);
    });

  const preSalRighe = salRighe.filter((r) => !odlGiaPagati.has(r.odl));
  const preSal = {
    n: (salStorico.length > 0 ? Math.max(...salStorico.map((s) => s.n)) : 0) + 1,
    totale: aggregaProduzione(preSalRighe).totale,
  };
```

- [ ] **Step 6: Estendi `ProduzioneEconomica` e il return**

Nell'interfaccia `ProduzioneEconomica`, aggiungi i 4 campi (dopo `scarto: Totale;`):

```ts
  scarto: Totale;
  salStorico: SalStorico[];
  preSal: { n: number; totale: Totale };
  fuoriSal: Totale;
  nonRemunerato: Totale;
```

Nel `return { ... }` finale di `caricaProduzioneEconomica`, aggiungi i 4 campi (dopo `scarto,`):

```ts
    scarto,
    salStorico,
    preSal,
    fuoriSal,
    nonRemunerato,
```

- [ ] **Step 7: Rispecchia il tipo lato client**

In `components/modules/performance/economica/tipi.ts`, aggiungi l'import e i campi:

```ts
import type { SalStorico } from '@/lib/produzione/salUfficiale';
```

Nell'interfaccia `DatiProduzione`, aggiungi (dopo `scarto: Totale;`):

```ts
  scarto: Totale;
  salStorico: SalStorico[];
  preSal: { n: number; totale: Totale };
  fuoriSal: Totale;
  nonRemunerato: Totale;
```

- [ ] **Step 8: Verifica build e suite**

Run: `npm run build && npm test`
Expected: build pulita; suite verde (Task 3 già copre la logica pura riusata qui; `load.ts` resta senza test diretto, stesso pattern del file preesistente).

- [ ] **Step 9: Commit**

```bash
git add lib/produzione/load.ts components/modules/performance/economica/tipi.ts
git commit -m "feat(acea): loader — preSal, fuoriSal, non remunerato, storico SAL"
```

---

### Task 9: UI — card KPI direzione (SAL pagato / Pre-SAL / Fuori SAL)

**Files:**
- Modify: `components/modules/performance/economica/KpiDirezione.tsx`
- Modify: `components/modules/performance/economica/TrendProduzioneSal.tsx`
- Modify: `components/modules/performance/PerformanceEconomica.tsx`

**Interfaces:**
- Consumes: `dati.salStorico`, `dati.preSal`, `dati.fuoriSal`, `dati.nonRemunerato` da `DatiProduzione` (Task 8).

- [ ] **Step 1: `KpiDirezione.tsx` — sostituisci le card SAL/scarto/% consuntivato**

Aggiungi l'import di `Badge`:

```ts
import Badge from '@/components/Badge';
```

Sostituisci queste 4 righe:

```tsx
      <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini`} accent="pos" />
      <Card titolo="SAL (pagato)" valore={eur(sal)} nota={`${num(dati.sal.totale.conteggio)} ODL · causale E%`} />
      <Card titolo="Da richiedere ad ACEA" valore={eur(dati.scarto.valore)} nota="Produzione − SAL" accent={dati.scarto.valore > 0 ? 'warn' : undefined} />
      <Card titolo="% consuntivato" valore={perc == null ? '—' : `${num(perc)}%`} nota="SAL / Produzione" />
```

con:

```tsx
      <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini · nel periodo`} accent="pos" />
      <Card
        titolo={ultimoSal ? `SAL ${num(ultimoSal.n)} (pagato)` : 'SAL (pagato)'}
        valore={ultimoSal ? eur(ultimoSal.valoreAps) : '—'}
        nota={ultimoSal ? `${num(ultimoSal.ordini)} ODL · ${ultimoSal.mese || '—'} · non dipende dal periodo` : 'Nessun SAL caricato'}
      />
      <Card
        titolo={`Pre-SAL ${num(dati.preSal.n)}`}
        valore={eur(dati.preSal.totale.valore)}
        nota={`${num(dati.preSal.totale.conteggio)} ODL esitati non pagati · vivo oggi`}
        accent={dati.preSal.totale.valore > 0 ? 'warn' : undefined}
      />
      <Card
        titolo="Fuori SAL"
        valore={eur(dati.fuoriSal.valore)}
        nota={`${num(dati.fuoriSal.conteggio)} interventi da esitare · nel periodo`}
        accent={dati.fuoriSal.valore > 0 ? 'warn' : undefined}
      />
```

Sostituisci queste due righe (diventano entrambe inutilizzate: `sal` era letto solo dalla card SAL rimossa, `perc` solo dalla card "% consuntivato" rimossa — nessun altro punto del file le referenzia):

```ts
  const sal = dati.sal.totale.valore;
  const perc = prod > 0 ? Math.round((sal / prod) * 100) : null;
```

con:

```ts
  const ultimoSal = dati.salStorico.length > 0 ? dati.salStorico[dati.salStorico.length - 1] : null;
```

Il file ha UNA sola griglia (`<div className="mb-4 grid ...">`) che contiene anche le card di `{operative && (...)}`: il badge va DOPO il `</div>` che la chiude, subito prima del `);` finale della funzione. Aggiungi il badge condizionale per il non remunerato:

```tsx
      {dati.nonRemunerato.valore > 0 && (
        <div className="mb-4">
          <Badge variant="warning">
            Esitato non remunerato: {eur(dati.nonRemunerato.valore)} ({num(dati.nonRemunerato.conteggio)} ODL, causale a nostro carico)
          </Badge>
        </div>
      )}
```

- [ ] **Step 2: `TrendProduzioneSal.tsx` — relabel "SAL" → "Esitato ACEA"**

Sostituisci:
- `name="SAL (pagato)"` → `name="Esitato ACEA"`
- `'Produzione vs SAL nel tempo (cumulato)'` → `'Produzione vs Esitato ACEA nel tempo (cumulato)'` (compare 2 volte: titolo del grafico e titolo dello stato vuoto — aggiorna entrambi, nello stato vuoto il testo è `'Produzione vs SAL nel tempo'`, aggiornalo a `'Produzione vs Esitato ACEA nel tempo'`).

- [ ] **Step 3: `PerformanceEconomica.tsx` — relabel tabella "Produzione vs SAL per voce"**

Sostituisci:
- Titolo `"Produzione vs SAL per voce"` → `"Produzione vs Esitato ACEA per voce"`
- Header colonna `<th className="py-1 pr-2 text-right">SAL</th>` → `<th className="py-1 pr-2 text-right">Esitato ACEA</th>`

- [ ] **Step 4: Verifica manuale in browser**

Run: `npm run dev` (o equivalente preview già configurato)
Naviga su `/hub/performance/economica`: verifica che compaiano le 3 nuove card (SAL pagato mostrerà "—"/"Nessun SAL caricato" finché il Task 7/agente non ha ingerito dati reali — atteso in questa fase), che non compaiano più due elementi etichettati "SAL" con significati diversi, e che la tabella/trend dicano "Esitato ACEA".

- [ ] **Step 5: Verifica build e suite**

Run: `npm run build && npm test`
Expected: build pulita, suite verde.

- [ ] **Step 6: Commit**

```bash
git add components/modules/performance/economica/KpiDirezione.tsx components/modules/performance/economica/TrendProduzioneSal.tsx components/modules/performance/PerformanceEconomica.tsx
git commit -m "feat(acea): UI — card SAL pagato/Pre-SAL/Fuori SAL, relabel Esitato ACEA"
```

---

### Task 10: UI — storico SAL (tabella) + vista presentazione

**Files:**
- Create: `components/modules/performance/economica/SalStorico.tsx`
- Modify: `components/modules/performance/PerformanceEconomica.tsx`
- Modify: `components/modules/performance/economica/PresentazioneProduzione.tsx`

**Interfaces:**
- Consumes: `dati: DatiProduzione` (Task 8) — nessuna prop aggiuntiva, stesso pattern di `TrendProduzioneSal`/`ComposizioneProduzione`.

- [ ] **Step 1: Componente `SalStorico.tsx`**

```tsx
'use client';
import { eur, num, type DatiProduzione } from './tipi';

/** Storico dei SAL ufficiali caricati (file CONTABILITA'): un SAL per riga, Valore APS ufficiale
 *  vs valorizzazione a listino (controllo leggero di taratura prezzi) + ODL sconosciuti ai nostri dati. */
export default function SalStorico({ dati }: { dati: DatiProduzione }) {
  if (dati.salStorico.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Storico SAL</h3>
        <p className="py-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun SAL caricato. Usa «Leggi SAL» dal modulo Agente.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Storico SAL</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--brand-text-muted)]">
            <th className="py-1 pr-2">SAL</th>
            <th className="py-1 pr-2">Mese</th>
            <th className="py-1 pr-2 text-right">ODL</th>
            <th className="py-1 pr-2 text-right">€ APS (ufficiale)</th>
            <th className="py-1 pr-2 text-right">€ listino</th>
            <th className="py-1 pr-2 text-right">Δ listino</th>
            <th className="py-1 pr-2 text-right">ODL sconosciuti</th>
          </tr>
        </thead>
        <tbody>
          {dati.salStorico.map((s) => (
            <tr key={s.n} className="border-t border-[var(--brand-border)]">
              <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">SAL {s.n}</td>
              <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{s.mese || '—'}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{num(s.ordini)}</td>
              <td className="py-1 pr-2 text-right tabular-nums font-medium">{eur(s.valoreAps)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-[var(--brand-text-muted)]">{eur(s.valoreListino)}</td>
              <td className={`py-1 pr-2 text-right tabular-nums ${Math.abs(s.deltaListino) > 0.01 ? 'text-[var(--warning)]' : 'text-[var(--brand-text-muted)]'}`}>
                {eur(s.deltaListino)}
              </td>
              <td className={`py-1 pr-2 text-right tabular-nums ${s.odlSconosciuti > 0 ? 'text-[var(--warning)]' : 'text-[var(--brand-text-muted)]'}`}>
                {num(s.odlSconosciuti)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire in `PerformanceEconomica.tsx`**

Aggiungi l'import:

```ts
import SalStorico from './economica/SalStorico';
```

Subito dopo il blocco `<div className="mb-4"><TrendProduzioneSal dati={dati} /></div>`, aggiungi:

```tsx
          <div className="mb-4">
            <SalStorico dati={dati} />
          </div>
```

- [ ] **Step 3: Wire in `PresentazioneProduzione.tsx`**

Aggiungi l'import:

```ts
import SalStorico from './SalStorico';
```

Subito dopo `<section className="break-inside-avoid"><TrendProduzioneSal dati={dati} /></section>`, aggiungi:

```tsx
            <section className="break-inside-avoid">
              <SalStorico dati={dati} />
            </section>
```

Aggiorna anche i due testi descrittivi che citano ancora la vecchia definizione di "SAL":

```tsx
// PRIMA:
              Periodo {dataIT(from)} → {dataIT(to)} · Produzione = lavorato valorizzato · SAL = pagato ACEA (causale E%)
```
```tsx
// DOPO:
              Periodo {dataIT(from)} → {dataIT(to)} · Produzione = lavorato valorizzato · SAL = ordini pagati (file ufficiale ACEA)
```

```tsx
// PRIMA:
              Fonte: gestionale (interventi + snapshot master/portale ACEA). SAL = ordini COMPLETATI con causale di
              scostamento pagata (E%). Giornate-uomo = ...
```
```tsx
// DOPO:
              Fonte: gestionale (interventi + snapshot master/portale/SAL ACEA). SAL = ordini pagati dal file
              ufficiale ACEA; Pre-SAL = ordini esitati (COMPLETATO, causale E%) non ancora in un SAL. Giornate-uomo = ...
```

- [ ] **Step 4: Verifica manuale in browser**

Run: `npm run dev`
Naviga su `/hub/performance/economica` e su `/presentazione/produzione-acea`: verifica che la tabella "Storico SAL" compaia in entrambe le viste (stato vuoto atteso finché non è stato letto un file reale).

- [ ] **Step 5: Verifica build e suite**

Run: `npm run build && npm test`
Expected: build pulita, suite verde.

- [ ] **Step 6: Commit**

```bash
git add components/modules/performance/economica/SalStorico.tsx components/modules/performance/PerformanceEconomica.tsx components/modules/performance/economica/PresentazioneProduzione.tsx
git commit -m "feat(acea): UI — tabella storico SAL (tab + presentazione)"
```

---

### Task 11: Export Excel — foglio SAL

**Files:**
- Modify: `lib/produzione/excelInject.ts`
- Modify: `lib/produzione/excelInject.test.ts`
- Modify: `lib/produzione/exportExcel.ts`
- Modify: `app/api/admin/acea/produzione/export/route.ts`

**Interfaces:**
- Consumes: `dati: ProduzioneEconomica` (Task 8, campi `salStorico`/`preSal`/`fuoriSal`/`nonRemunerato`).
- Produces: `fogliSal(dati: ProduzioneEconomica): FoglioSemplice[]` (foglio "Dati - SAL").

- [ ] **Step 1: Aggiorna il fixture del test esistente (compilazione)**

`lib/produzione/excelInject.test.ts` tipizza `mockDati` come `Parameters<typeof mappaCelleProduzione>[0]` (cioè `ProduzioneEconomica`): il Task 8 ha aggiunto 4 campi obbligatori, quindi il fixture ora non compila più. Aggiungi al `mockDati` esistente (dopo `scarto: { conteggio: 1, valore: 100 },`):

```ts
  salStorico: [{ n: 1, mese: '2026-06', ordini: 2, valoreAps: 200, valoreListino: 190, deltaListino: 10, odlSconosciuti: 0 }],
  preSal: { n: 2, totale: { conteggio: 1, valore: 90 } },
  fuoriSal: { conteggio: 1, valore: 80 },
  nonRemunerato: { conteggio: 0, valore: 0 },
```

- [ ] **Step 2: Esegui e verifica che compili (nessun nuovo test ancora)**

Run: `npm test -- excelInject`
Expected: PASS (i test esistenti tornano verdi ora che il fixture è completo).

- [ ] **Step 3: Scrivi il test per `fogliSal` (fallirà: la funzione non esiste ancora)**

Aggiungi in fondo a `lib/produzione/excelInject.test.ts`:

```ts
describe('fogliSal', () => {
  it('un foglio "Dati - SAL" con storico + pre-SAL + fuori SAL + non remunerato', () => {
    const fogli = fogliSal(mockDati as Dati);
    expect(fogli).toHaveLength(1);
    expect(fogli[0].nome).toBe('Dati - SAL');
    const [header, riga1, righeExtra] = fogli[0].righe;
    expect(header).toEqual(['SAL', 'Mese', 'ODL', 'Valore APS EUR', 'Valore listino EUR', 'Delta listino EUR', 'ODL sconosciuti']);
    expect(riga1).toEqual([1, '2026-06', 2, 200, 190, 10, 0]);
    expect(righeExtra[0]).toBe('Pre-SAL 2');
  });
});
```

Aggiorna l'import in cima al file per includere `fogliSal`:

```ts
import { aggiungiFogli, fogliPersonale, fogliSal, iniettaCelle, iniettaTemplate, mappaCelleProduzione } from './excelInject';
```

- [ ] **Step 4: Esegui e verifica che fallisca**

Run: `npm test -- excelInject`
Expected: FAIL — `fogliSal is not a function` (o errore di import)

- [ ] **Step 5: Implementa `fogliSal` in `excelInject.ts`**

Aggiungi in fondo al file (dopo `fogliPersonale`):

```ts
/** Foglio storico SAL ufficiali (file CONTABILITA') + pre-SAL/fuori-SAL/non-remunerato. PURA. */
export function fogliSal(dati: ProduzioneEconomica): FoglioSemplice[] {
  return [
    {
      nome: 'Dati - SAL',
      righe: [
        ['SAL', 'Mese', 'ODL', 'Valore APS EUR', 'Valore listino EUR', 'Delta listino EUR', 'ODL sconosciuti'],
        ...dati.salStorico.map((s): Array<string | number> => [s.n, s.mese, s.ordini, s.valoreAps, s.valoreListino, s.deltaListino, s.odlSconosciuti]),
        [`Pre-SAL ${dati.preSal.n}`, '', dati.preSal.totale.conteggio, dati.preSal.totale.valore, '', '', ''],
        ['Fuori SAL', '', dati.fuoriSal.conteggio, dati.fuoriSal.valore, '', '', ''],
        ['Non remunerato', '', dati.nonRemunerato.conteggio, dati.nonRemunerato.valore, '', '', ''],
      ],
    },
  ];
}
```

- [ ] **Step 6: Esegui e verifica che passi**

Run: `npm test -- excelInject`
Expected: PASS

- [ ] **Step 7: Wire nell'export**

In `app/api/admin/acea/produzione/export/route.ts`, aggiorna l'import:

```ts
import { aggiungiFogli, fogliPersonale, fogliSal, iniettaTemplate, mappaCelleProduzione } from '@/lib/produzione/excelInject';
```

E la chiamata dentro `costruisciBuffer`:

```ts
// PRIMA:
    return await aggiungiFogli(iniettato, fogliPersonale(dati));
// DOPO:
    return await aggiungiFogli(iniettato, [...fogliPersonale(dati), ...fogliSal(dati)]);
```

- [ ] **Step 8: Foglio SAL anche nel fallback ExcelJS (`exportExcel.ts`)**

In `lib/produzione/exportExcel.ts`, dopo il blocco `// ── DATI: SAL per giorno ──` esistente, aggiungi un nuovo foglio:

```ts
  // ── DATI: SAL ufficiali (storico + pre-SAL/fuori-SAL/non remunerato) ──
  const ds = wb.addWorksheet('Dati - SAL');
  ds.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }];
  intestazione(ds.addRow(['SAL', 'Mese', 'ODL', 'Valore APS €', 'Valore listino €', 'Delta listino €', 'ODL sconosciuti']));
  for (const s of dati.salStorico) {
    const r = ds.addRow([`SAL ${s.n}`, s.mese, s.ordini, s.valoreAps, s.valoreListino, s.deltaListino, s.odlSconosciuti]);
    r.getCell(4).numFmt = EUR;
    r.getCell(5).numFmt = EUR;
    r.getCell(6).numFmt = EUR;
  }
  const rPre = ds.addRow([`Pre-SAL ${dati.preSal.n}`, '', dati.preSal.totale.conteggio, dati.preSal.totale.valore, '', '', '']);
  rPre.getCell(4).numFmt = EUR;
  const rFuori = ds.addRow(['Fuori SAL', '', dati.fuoriSal.conteggio, dati.fuoriSal.valore, '', '', '']);
  rFuori.getCell(4).numFmt = EUR;
```

Nell'array `kpi` in cima a `buildWorkbookProduzione`, rinomina l'etichetta:

```ts
// PRIMA:
    ['SAL (consuntivato portale)', dati.sal.totale.valore, true],
// DOPO:
    ['Esitato ACEA (consuntivato portale)', dati.sal.totale.valore, true],
```

Lascia invariato tutto il resto della funzione (colonne "SAL €" nelle tabelle "Dati - per voce"/"Dashboard" e l'etichetta "Scarto Produzione − SAL": è la via di export FALLBACK, usata raramente — la via primaria è il template con grafici nativi, che il Task 9/10 non tocca qui; un relabel esaustivo di questo file non è richiesto dalla spec).

- [ ] **Step 9: Verifica build e suite**

Run: `npm run build && npm test`
Expected: build pulita, suite verde.

- [ ] **Step 10: Commit**

```bash
git add lib/produzione/excelInject.ts lib/produzione/excelInject.test.ts lib/produzione/exportExcel.ts app/api/admin/acea/produzione/export/route.ts
git commit -m "feat(acea): export Excel — foglio SAL (storico + pre-SAL/fuori-SAL)"
```

---

### Task 12: Admin UI — bottone «Leggi SAL» su `/hub/agente`

**Files:**
- Modify: `app/hub/agente/page.tsx`
- Modify: `components/modules/agente/AgenteClient.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/agente/acea-sal` (Task 5); colonna `agente_config.forza_acea_sal` (Task 2).

- [ ] **Step 1: `app/hub/agente/page.tsx` — leggi il flag e passalo**

Accanto a `const forzaAcea = ...`, aggiungi:

```ts
  const forzaAceaSal = (configRow as { forza_acea_sal?: boolean } | null)?.forza_acea_sal === true;
```

Nel JSX `<AgenteClient .../>`, aggiungi la prop:

```tsx
      forzaAceaSal={forzaAceaSal}
```

- [ ] **Step 2: `AgenteClient.tsx` — prop, stato, handler**

Aggiungi `forzaAceaSal: boolean;` al tipo `AgenteClientProps` e destrutturalo nella firma del componente (accanto a `forzaAcea`).

Aggiungi gli state hook (accanto a `aceaArming`/`aceaMsg`):

```ts
  const [salArming, setSalArming] = useState(false);
  const [salMsg, setSalMsg] = useState<string | null>(null);
```

Aggiungi l'handler (accanto a `aggiornaStatoAcea`):

```ts
  async function leggiSal() {
    setSalArming(true); setSalMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-sal', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setSalMsg(res.ok ? 'Richiesta inviata: parte al prossimo contatto dell\'agente.' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setSalMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setSalArming(false);
    }
  }
```

- [ ] **Step 3: Badge "in attesa"**

Estendi la condizione del banner "in attesa" (da `{(forzaGiro || forzaScan || forzaAcea) && (` a `{(forzaGiro || forzaScan || forzaAcea || forzaAceaSal) && (`), e aggiungi il chip, accanto agli altri:

```tsx
            {forzaAceaSal && (
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)' }}>
                leggi SAL
              </span>
            )}
```

- [ ] **Step 4: Bottone**

Nella riga dei controlli (dopo il bottone "Aggiorna stato ODL da ACEA" e il suo `{aceaMsg && ...}`), aggiungi:

```tsx
          <button
            type="button"
            onClick={leggiSal}
            disabled={salArming}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
            title="Legge i file SAL N.xlsx dalla cartella CONTABILITA' e aggiorna lo storico SAL del KPI produzione economica."
          >
            {salArming ? 'Invio…' : 'Leggi SAL'}
          </button>
          {salMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{salMsg}</span>}
```

- [ ] **Step 5: Verifica manuale in browser**

Run: `npm run dev`
Naviga su `/hub/agente`: verifica che compaia il bottone "Leggi SAL", che il click mostri "Richiesta inviata…" e che il banner "in attesa" mostri il chip "leggi SAL" dopo un refresh (flag one-shot settato in DB).

- [ ] **Step 6: Verifica build e suite**

Run: `npm run build && npm test`
Expected: build pulita, suite verde (225+ file, nessuna regressione).

- [ ] **Step 7: Commit**

```bash
git add app/hub/agente/page.tsx components/modules/agente/AgenteClient.tsx
git commit -m "feat(acea): bottone «Leggi SAL» su /hub/agente"
```

---

## Dopo il merge (passi manuali, non delegabili a un worktree)

⚠️ **L'ordine conta** (trovato dalla review finale whole-branch): il tick dell'agente (`app/api/agente/tick/route.ts`) seleziona già `forza_acea_sal` e il loader KPI (`lib/produzione/load.ts`) interroga già `acea_sal` non appena il codice è in produzione — se la migration non è ancora applicata, ogni tick dell'agente va in 500 (niente heartbeat, niente giro serale) e la pagina KPI/presentazione/export lanciano un errore. La migration è additiva e innocua anche col codice vecchio: applicarla **prima** di mergiare/pushare elimina la finestra di rottura.

1. **Applicare la migration al DB di produzione** (Task 2) via Supabase MCP `apply_migration`, con l'ok esplicito dell'utente (deroga puntuale come per le migration precedenti di questa feature) — **PRIMA del merge/push su main**.
2. **Merge/push su main** (deploy Vercel automatico).
3. **Aggiornare il `config.json` reale** su questo PC (agente): aggiungere `acea.salPath` con il valore reale `C:\Users\Edgardo\Plenzich s.p.a\Commesse - Documenti\ANNO 2026\CP 20260002_ACEA_GU IDRICHE L2\8_LAVORI\CONTABILITA'` (il file è gitignored, il merge non lo tocca). Verificare inoltre che i file nella cartella si chiamino esattamente `SAL N.xlsx` (non `PRE-SAL N.xlsx` — dal fix della review finale il parser non li ingerisce più come SAL ufficiale, ma vanno comunque rinominati per essere letti).
4. **`git pull` nel repo principale** (l'agente gira da lì, non dai worktree) — vedi memoria di progetto `aggiorna-agente-su-questo-pc`. Nessun riavvio dell'agente: ricarica il codice ad ogni tick.
5. **Lanciare «Aggiorna stato ODL da ACEA» (target Dunning)** dal modulo Agente, per scrivere/propagare le saracinesche DUNNING del Task 1 e verificare il conteggio via query (~196 attese, vedi spec).
6. **Lanciare «Leggi SAL»** dal modulo Agente con `SAL 1.xlsx` già nella cartella, per popolare `acea_sal` e vedere le card/tabella valorizzate sul KPI.
