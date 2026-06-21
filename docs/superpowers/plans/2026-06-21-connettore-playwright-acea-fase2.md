# Connettore Playwright ACEA — Fase 2 (assegnazione ODL agli operatori) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app comanda, via l'agente Node + Playwright, la scrittura delle assegnazioni operatore→ODL sul portale ACEA, leggendo le assegnazioni dal piano in app (`interventi`).

**Architecture:** Pattern "app=cervello via tick" già usato in Fase 1. L'utente pianifica sull'Excel (`Data`+`Esecutore`) → l'agente legge nel modulo Assegnazione AI → "Procedi" crea il piano in app (`interventi`, fonte di verità) → un pulsante alza un flag one-shot → al tick l'agente recupera dall'app gli `interventi` ACEA del giorno e Playwright assegna ogni ODL nel Cruscotto. Modulo Assegnazione AI riorganizzato per commessa (Italgas/Acea) e, dentro Acea, per attività (Limitazioni Massive/Dunning/future), data-driven da `agente_file_config`.

**Tech Stack:** Next.js (App Router, route `nodejs`), Supabase (prod `aceztqfebringeaebvce`, MCP `apply_migration`), agente Node ESM in `tools/limitazioni-sync` (Playwright `channel:'msedge'`, exceljs/jszip), Vitest.

## Global Constraints

- **Lingua**: codice/commenti in italiano, coerenti con la base esistente.
- **`tools/` è escluso dal `tsconfig`**: l'agente Node NON rompe il build Vercel; le sue modifiche vanno propagate al PC del lavoro a mano (robocopy).
- **Scrittura su ACEA = solo agente sul PC del lavoro** (browser/credenziali/rete). Vercel non raggiunge ACEA.
- **Fonte di verità = `interventi`**, mai l'Excel. La scrittura ACEA legge dall'app.
- **Scrittura ACEA per-giorno sull'intera commessa ACEA** (`interventi.committente='acea'`): la divisione per attività è solo per lettura/anteprima/procedi/storico.
- **Dry-run**: il giro di assegnazione NON salva su ACEA e NON marca `acea_assegnazioni_log` come `assegnato`.
- **Idempotenza**: gli ODL già `assegnato` reale per quel giorno non vengono rispinti.
- **Selettori SAP UI5 instabili**: SOLO locatori per ruolo/etichetta/testo + digitazione diretta (mai ID `__input1`).
- **Auth**: endpoint agente con `x-export-key` (`chiaveValida`); endpoint admin con `requireAdmin`.
- **Migration**: applicate via MCP in prod; si tiene comunque il file in `supabase/migrations/` per traccia.
- **ATTGIORN / verifica = FUORI SCOPE** (filone Italgas): nessun flusso ATTGIORN qui.
- **Baseline test**: `npm run lint`/`vitest` hanno rossi pre-esistenti fuori da `tools/limitazioni-sync`; il gate è "verde sui file toccati".
- **Git**: branch da `origin/main` (il main locale è spesso indietro); push refspec `<branch>:main` con ok esplicito.

---

## File Structure

**Nuovi (app):**
- `app/api/admin/agente/acea-assegna/route.ts` — POST admin: alza i flag one-shot.
- `app/api/agente/acea-assegnazioni/route.ts` — GET agente: lista ODL→operatore da `interventi`.
- `lib/agente/assegnabiliAcea.ts` — PURO: filtra gli `interventi` da assegnare (esclude i già fatti, risolve il nome).
- `lib/agente/raggruppaCommessaAttivita.ts` — PURO: raggruppa le righe pianificabili per commessa→attività (per i tab).

**Modificati (app):**
- `app/api/agente/tick/route.ts` — nuovi flag nel tick.
- `app/api/agente/report/route.ts` — `tipo:'acea-assegna'` → scrive `acea_assegnazioni_log`.
- `app/api/admin/agente/assegnazioni/route.ts` — filtro opzionale `committente`/`attivita`.
- `app/hub/assegnazione-ai/page.tsx` — passa al client anche lo stato dei flag ACEA.
- `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx` — tab commessa/attività + pulsante "Scrivi su ACEA".

**Nuovi (agente Node):**
- `tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs` — PURO: override grafia nome.
- `tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs` — PURO: mappa le righe del master DUNNING (colonne esplicite) a "grezze".
- `tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs` — driver Playwright di scrittura (stub calibrabile).
- `tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs` — orchestratore.
- Test: `*.test.ts` accanto ai moduli puri.

**Modificati (agente Node):**
- `tools/limitazioni-sync/lib/acea/driver.mjs` — estrae `apriCruscotto` (riuso login/iframe).
- `tools/limitazioni-sync/lib/apiAgente.mjs` — helper `fetchAceaAssegnazioni`.
- `tools/limitazioni-sync/agente.mjs` — ramo `main()` per `ris.aceaAssegna` + lettura master DUNNING.
- `tools/limitazioni-sync/config.example.json` — colonne master DUNNING + `acea.operatori`.

**Nuovi (DB):**
- `supabase/migrations/20260621000000_acea_assegna.sql`

---

## Phase 1 — DB + registro

### Task 1: Migration colonne/flag + tabella log + seed registro

**Files:**
- Create: `supabase/migrations/20260621000000_acea_assegna.sql`

**Interfaces:**
- Produces: colonne `agente_config.forza_acea_assegna` (bool), `acea_assegna_data` (date), `acea_assegna_dry` (bool); tabella `acea_assegnazioni_log`; riga `agente_file_config` per `LIMITAZIONI CON ORDINE.xlsx`.

- [ ] **Step 1: Scrivere il file migration**

```sql
-- Fase 2 ACEA: flag one-shot "assegna su ACEA" + log idempotenza + registro DUNNING.

-- 1) flag one-shot sul singleton agente_config
alter table agente_config add column if not exists forza_acea_assegna boolean not null default false;
alter table agente_config add column if not exists acea_assegna_data date;
alter table agente_config add column if not exists acea_assegna_dry boolean not null default true;

-- 2) log delle assegnazioni spinte su ACEA (idempotenza + storico esiti)
create table if not exists acea_assegnazioni_log (
  id uuid primary key default gen_random_uuid(),
  data_assegnazione date not null,
  odl text not null,
  matricola text,
  comune text,
  staff_id text,
  operatore_acea text,
  intervento_id uuid,
  esito text not null,            -- 'assegnato' | 'saltato' | 'fallito'
  motivo text,
  dry_run boolean not null default false,
  run_id uuid,
  creato_il timestamptz not null default now()
);
create index if not exists acea_assegnazioni_log_data_idx on acea_assegnazioni_log (data_assegnazione);
-- un ODL non può risultare "assegnato" reale due volte nello stesso giorno
create unique index if not exists acea_assegnazioni_log_odl_uq
  on acea_assegnazioni_log (data_assegnazione, odl) where dry_run = false and esito = 'assegnato';

alter table acea_assegnazioni_log enable row level security;
drop policy if exists acea_assegnazioni_log_all_auth on acea_assegnazioni_log;
create policy acea_assegnazioni_log_all_auth on acea_assegnazioni_log
  for all to authenticated using (true) with check (true);

-- 3) registro DUNNING (template_id da impostare a mano con l'id del template "+" DUNNING)
insert into agente_file_config (file, committente, attivita, template_id)
values ('LIMITAZIONI CON ORDINE.xlsx', 'acea', 'DUNNING', null)
on conflict (file) do nothing;
```

- [ ] **Step 2: Applicare la migration in prod via MCP**

Usa lo strumento MCP Supabase `apply_migration` con name `acea_assegna` e il contenuto SQL del file. (In assenza di MCP: l'utente la lancia a mano.)
Expected: nessun errore; le colonne e la tabella esistono.

- [ ] **Step 3: Verificare**

Usa MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_name='agente_config' and column_name like 'acea_assegna%' or column_name='forza_acea_assegna';
select count(*) from acea_assegnazioni_log;
select file, committente, attivita from agente_file_config where committente='acea';
```
Expected: 3 colonne nuove; `count = 0`; almeno `ZAGAROLO.xlsx` (LIMITAZIONI MASSIVE) e `LIMITAZIONI CON ORDINE.xlsx` (DUNNING).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260621000000_acea_assegna.sql
git commit -m "feat(acea): migration Fase 2 - flag assegna + log idempotenza + registro DUNNING"
```

---

## Phase 2 — Agente: lettura master DUNNING (READ)

### Task 2: Config esempio per le colonne del master DUNNING

**Files:**
- Modify: `tools/limitazioni-sync/config.example.json`

**Interfaces:**
- Produces: chiavi `acea.masterColonnaEsecutore`, `acea.masterColonnaData`, `acea.masterColonnaMatricola`, `acea.masterColonnaIndirizzo`, `acea.masterColonnaComune`, `acea.operatori`.

- [ ] **Step 1: Leggere il blocco `acea` esistente in `config.example.json`**

Run: apri `tools/limitazioni-sync/config.example.json` e individua l'oggetto `"acea"`.

- [ ] **Step 2: Aggiungere le chiavi di lettura DUNNING e la mappatura nomi**

Dentro l'oggetto `"acea"` (accanto a `masterColonnaOdl`), aggiungi:

```jsonc
"masterColonnaEsecutore": "Esecutore",
"masterColonnaData": "Data",
"masterColonnaMatricola": "Matricola misuratore",
"masterColonnaIndirizzo": "INDIRIZZO",
"masterColonnaComune": "Località",
"operatori": {
  "Mario Rossi": "ROSSI MARIO"
}
```

(`operatori` è una mappatura opzionale `nome-app → grafia-ACEA`; l'esempio è un placeholder da sostituire dopo il codegen.)

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/config.example.json
git commit -m "feat(acea): config esempio - colonne master DUNNING + mappatura operatori"
```

### Task 3: Modulo puro `leggiMasterAcea` (righe master → grezze)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs`
- Test: `tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts`

**Interfaces:**
- Consumes: `risolviColonna` da `../colonne.mjs`.
- Produces: `mappaRigheMaster(matrix, header, colonne) => grezze[]` dove `grezze` ha la forma attesa da `estraiPianificabili` (`{riga, odl, matricola, indirizzo, comune, esecutore, dataRaw, esitoRaw}`). `colonne` = `{odl, esecutore, data, matricola, indirizzo, comune}` (nomi di intestazione). `matrix` = righe dati come array di celle (0-based), `header` = riga intestazione come array.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { mappaRigheMaster } from './leggiMasterAcea.mjs';

describe('mappaRigheMaster', () => {
  const header = ['Descrizione Stato Ordine', 'Ordine', 'Matricola misuratore', 'INDIRIZZO', 'Località', 'Data', 'Esecutore'];
  const colonne = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località' };

  it('mappa le colonne per nome (robusto alla posizione)', () => {
    const matrix = [['x', '12345', 'M9', 'Via Roma 1', 'ROMA', '2026-06-22', 'ROSSI']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g).toEqual([{ riga: 2, odl: '12345', matricola: 'M9', indirizzo: 'Via Roma 1', comune: 'ROMA', esecutore: 'ROSSI', dataRaw: '2026-06-22', esitoRaw: '' }]);
  });

  it('numera le righe a partire da 2 (header su riga 1)', () => {
    const matrix = [['x', 'A', '', '', '', '', ''], ['x', 'B', '', '', '', '', '']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g.map((r) => r.riga)).toEqual([2, 3]);
  });

  it('cella mancante → stringa vuota', () => {
    const g = mappaRigheMaster([['x', '12345']], header, colonne);
    expect(g[0].matricola).toBe('');
    expect(g[0].esecutore).toBe('');
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/leggiMasterAcea.test.ts`
Expected: FAIL — `mappaRigheMaster` non esiste.

- [ ] **Step 3: Implementare il modulo**

```js
// tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs
// PURO: mappa le righe del master ACEA (colonne risolte per NOME dal config) alla forma "grezza"
// attesa da estraiPianificabili. Bypassa l'auto-rilevamento (che cerca "matricola" esatto e
// salterebbe il DUNNING, dove la colonna è "Matricola misuratore").
import { risolviColonna } from '../colonne.mjs';

const t = (v) => String(v ?? '').trim();

/** matrix: righe dati [riga][cella] (0-based). header: array intestazione. colonne: nomi-colonna. */
export function mappaRigheMaster(matrix, header, colonne) {
  const idx = {
    odl: risolviColonna(header, colonne.odl),
    esecutore: risolviColonna(header, colonne.esecutore),
    data: risolviColonna(header, colonne.data),
    matricola: risolviColonna(header, colonne.matricola),
    indirizzo: risolviColonna(header, colonne.indirizzo),
    comune: risolviColonna(header, colonne.comune),
  };
  const cella = (row, i) => (i >= 0 && row[i] != null ? t(row[i]) : '');
  const out = [];
  for (let r = 0; r < (matrix ?? []).length; r++) {
    const row = matrix[r] ?? [];
    out.push({
      riga: r + 2, // header su riga 1 → prima riga dati = 2
      odl: cella(row, idx.odl),
      matricola: cella(row, idx.matricola),
      indirizzo: cella(row, idx.indirizzo),
      comune: cella(row, idx.comune),
      esecutore: cella(row, idx.esecutore),
      dataRaw: cella(row, idx.data),
      esitoRaw: '', // il master DUNNING non ha "esito" in lettura: sempre pianificabile
    });
  }
  return out;
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/leggiMasterAcea.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs tools/limitazioni-sync/lib/acea/leggiMasterAcea.test.ts
git commit -m "feat(acea): mappaRigheMaster - master DUNNING per colonne esplicite"
```

### Task 4: Cablare la lettura DUNNING in `agente.mjs`

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`

**Interfaces:**
- Consumes: `mappaRigheMaster` (Task 3), `estraiPianificabili` (esistente), `inviaPianificabili`/`caricaWorkbook`/`trovaRigaIntestazione` (esistenti).
- Produces: lettura del master `cfg.acea.masterPath` quando `ris.pianificaData` è impostato, con POST a `/api/agente/pianificabili` (file = basename del master DUNNING).

- [ ] **Step 1: Aggiungere l'import**

In cima a `agente.mjs`, accanto agli altri import:

```js
import { mappaRigheMaster } from './lib/acea/leggiMasterAcea.mjs';
```

- [ ] **Step 2: Aggiungere la funzione di lettura del master DUNNING**

Subito dopo la funzione `leggiPianificabili` (quella che scansiona `cfg.cartella`), aggiungi:

```js
/** Legge il master DUNNING (acea.masterPath) per colonne esplicite e invia le righe pianificabili. */
async function leggiMasterAceaDunning({ baseUrl, exportKey, acea, dataTarget }) {
  if (!acea?.masterPath || !fs.existsSync(acea.masterPath)) return;
  try {
    const wb = await caricaWorkbook(acea.masterPath);
    const ws = acea.foglio ? (wb.getWorksheet(acea.foglio) ?? wb.worksheets[0]) : wb.worksheets[0];
    const rIntest = trovaRigaIntestazione(ws);
    if (rIntest < 0) return;
    const header = (ws.getRow(rIntest).values || []).slice(1);
    const matrix = [];
    for (let r = rIntest + 1; r <= ws.rowCount; r++) {
      matrix.push((ws.getRow(r).values || []).slice(1));
    }
    const colonne = {
      odl: acea.masterColonnaOdl, esecutore: acea.masterColonnaEsecutore, data: acea.masterColonnaData,
      matricola: acea.masterColonnaMatricola, indirizzo: acea.masterColonnaIndirizzo, comune: acea.masterColonnaComune,
    };
    const grezze = mappaRigheMaster(matrix, header, colonne);
    const righe = estraiPianificabili(grezze, dataTarget);
    const file = path.basename(acea.masterPath);
    await inviaPianificabili({ baseUrl, exportKey, file, data: dataTarget, righe });
    console.log(`[lim-sync] pianificabili ACEA ${file} ${dataTarget}: ${righe.length} righe.`);
  } catch (e) {
    console.error(`[lim-sync] leggiMasterAceaDunning fallito: ${e instanceof Error ? e.message : e}`);
  }
}
```

- [ ] **Step 3: Chiamarla nel ramo `pianificaData` di `main()`**

Trova in `main()` il blocco:

```js
  // Lettura "Assegnazione AI": l'app chiede di leggere un giorno specifico (one-shot).
  if (ris.pianificaData) {
    await leggiPianificabili({ baseUrl, exportKey: cfg.exportKey, cartella: cfg.cartella, dataTarget: ris.pianificaData });
  }
```

e sostituiscilo con:

```js
  // Lettura "Assegnazione AI": l'app chiede di leggere un giorno specifico (one-shot).
  if (ris.pianificaData) {
    await leggiPianificabili({ baseUrl, exportKey: cfg.exportKey, cartella: cfg.cartella, dataTarget: ris.pianificaData });
    // master DUNNING (cartella diversa, colonne esplicite): letto solo se configurato.
    if (cfg.acea?.masterPath) {
      await leggiMasterAceaDunning({ baseUrl, exportKey: cfg.exportKey, acea: cfg.acea, dataTarget: ris.pianificaData });
    }
  }
```

- [ ] **Step 4: Verificare che la suite agente resti verde**

Run: `cd tools/limitazioni-sync && npx vitest run`
Expected: PASS (84+ test invariati; `agente.mjs` importa il nuovo modulo senza romperli).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(acea): agente legge il master DUNNING nel ramo pianificaData"
```

---

## Phase 3 — App: ristrutturazione Assegnazione AI (commessa → attività)

### Task 5: Modulo puro `raggruppaCommessaAttivita`

**Files:**
- Create: `lib/agente/raggruppaCommessaAttivita.ts`
- Test: `lib/agente/raggruppaCommessaAttivita.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NodoAttivita = { attivita: string; ids: string[] };
  export type NodoCommessa = { committente: string; attivita: NodoAttivita[]; ids: string[] };
  export function raggruppaCommessaAttivita(
    righe: { id: string; file: string }[],
    fileConfig: { file: string; committente: string; attivita: string }[],
  ): NodoCommessa[];
  ```
  Righe il cui `file` non è in `fileConfig` finiscono sotto committente `'altro'`, attività `'(non configurato)'`. Ordinamento: committenti e attività alfabetici.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { raggruppaCommessaAttivita } from './raggruppaCommessaAttivita';

const cfg = [
  { file: 'ZAGAROLO.xlsx', committente: 'acea', attivita: 'LIMITAZIONI MASSIVE' },
  { file: 'LIMITAZIONI CON ORDINE.xlsx', committente: 'acea', attivita: 'DUNNING' },
  { file: 'ITALGAS.xlsx', committente: 'italgas', attivita: 'MOBILI' },
];

describe('raggruppaCommessaAttivita', () => {
  it('raggruppa per committente e attività', () => {
    const righe = [
      { id: '1', file: 'ZAGAROLO.xlsx' }, { id: '2', file: 'LIMITAZIONI CON ORDINE.xlsx' },
      { id: '3', file: 'ZAGAROLO.xlsx' }, { id: '4', file: 'ITALGAS.xlsx' },
    ];
    const r = raggruppaCommessaAttivita(righe, cfg);
    expect(r.map((c) => c.committente)).toEqual(['acea', 'italgas']);
    const acea = r.find((c) => c.committente === 'acea')!;
    expect(acea.attivita.map((a) => a.attivita)).toEqual(['DUNNING', 'LIMITAZIONI MASSIVE']);
    expect(acea.ids.sort()).toEqual(['1', '2', '3']);
    expect(acea.attivita.find((a) => a.attivita === 'LIMITAZIONI MASSIVE')!.ids.sort()).toEqual(['1', '3']);
  });

  it('file non configurato → committente "altro"', () => {
    const r = raggruppaCommessaAttivita([{ id: '9', file: 'X.xlsx' }], cfg);
    expect(r).toEqual([{ committente: 'altro', ids: ['9'], attivita: [{ attivita: '(non configurato)', ids: ['9'] }] }]);
  });

  it('nessuna riga → nessun nodo', () => {
    expect(raggruppaCommessaAttivita([], cfg)).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npx vitest run lib/agente/raggruppaCommessaAttivita.test.ts`
Expected: FAIL — funzione non definita.

- [ ] **Step 3: Implementare il modulo**

```ts
// lib/agente/raggruppaCommessaAttivita.ts
// PURO: raggruppa le righe pianificabili per commessa (committente) e attività, usando agente_file_config.
export type NodoAttivita = { attivita: string; ids: string[] };
export type NodoCommessa = { committente: string; attivita: NodoAttivita[]; ids: string[] };

type Riga = { id: string; file: string };
type Cfg = { file: string; committente: string; attivita: string };

export function raggruppaCommessaAttivita(righe: Riga[], fileConfig: Cfg[]): NodoCommessa[] {
  const byFile = new Map(fileConfig.map((c) => [c.file, c]));
  // committente -> attività -> ids
  const mappa = new Map<string, Map<string, string[]>>();
  for (const r of righe ?? []) {
    const cfg = byFile.get(r.file);
    const committente = cfg?.committente ?? 'altro';
    const attivita = cfg?.attivita ?? '(non configurato)';
    if (!mappa.has(committente)) mappa.set(committente, new Map());
    const att = mappa.get(committente)!;
    if (!att.has(attivita)) att.set(attivita, []);
    att.get(attivita)!.push(r.id);
  }
  const out: NodoCommessa[] = [];
  for (const committente of [...mappa.keys()].sort()) {
    const att = mappa.get(committente)!;
    const attivita: NodoAttivita[] = [...att.keys()].sort().map((a) => ({ attivita: a, ids: att.get(a)! }));
    out.push({ committente, attivita, ids: attivita.flatMap((a) => a.ids) });
  }
  return out;
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `npx vitest run lib/agente/raggruppaCommessaAttivita.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/agente/raggruppaCommessaAttivita.ts lib/agente/raggruppaCommessaAttivita.test.ts
git commit -m "feat(assegnazione-ai): raggruppaCommessaAttivita - tab commessa/attività"
```

### Task 6: UI a tab commessa/attività nel client Assegnazione AI

**Files:**
- Modify: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Consumes: `raggruppaCommessaAttivita` (Task 5).
- Produces: stato `commessaSel`/`attivitaSel`; l'anteprima viene caricata con i soli `ids` dell'attività selezionata; lo storico filtrato per committente/attività (Task 7 fornisce il filtro server, qui si passano i query param).

- [ ] **Step 1: Importare l'helper e aggiungere lo stato di selezione**

Sotto gli import esistenti:

```tsx
import { raggruppaCommessaAttivita } from '@/lib/agente/raggruppaCommessaAttivita';
```

Dentro il componente, dopo `const cfgByFile = new Map(...)`:

```tsx
  const alberi = raggruppaCommessaAttivita(righe.map((r) => ({ id: r.id, file: r.file })), fileConfig);
  const [commessaSel, setCommessaSel] = useState<string>('');
  const [attivitaSel, setAttivitaSel] = useState<string>('');

  // default selezione: prima commessa/attività disponibili
  useEffect(() => {
    if (alberi.length === 0) { setCommessaSel(''); setAttivitaSel(''); return; }
    const c = alberi.find((x) => x.committente === commessaSel) ?? alberi[0];
    if (c.committente !== commessaSel) setCommessaSel(c.committente);
    const a = c.attivita.find((x) => x.attivita === attivitaSel) ?? c.attivita[0];
    if (a && a.attivita !== attivitaSel) setAttivitaSel(a.attivita);
  }, [idsKey]); // ricalcola quando cambiano le righe lette
```

- [ ] **Step 2: Calcolare gli `ids` dell'attività selezionata e usarli per l'anteprima**

Sostituisci la riga:

```tsx
  const idsKey = righe.map((r) => r.id).join(',');
```

con:

```tsx
  const idsKey = righe.map((r) => r.id).join(',');
  const commessaCorrente = alberi.find((c) => c.committente === commessaSel);
  const attivitaCorrente = commessaCorrente?.attivita.find((a) => a.attivita === attivitaSel);
  const idsAttivita = attivitaCorrente?.ids ?? [];
  const idsAttivitaKey = idsAttivita.join(',');
  const isAcea = commessaSel === 'acea';
```

E cambia l'effetto che carica l'anteprima da `idsKey` a `idsAttivitaKey`:

```tsx
  useEffect(() => { void caricaAnteprima(idsAttivitaKey ? idsAttivitaKey.split(',') : []); }, [idsAttivitaKey, caricaAnteprima]);
```

Nelle due chiamate dentro `procedi()` e `scarta()` che fanno `caricaAnteprima(righe.map((r) => r.id))`, sostituisci con `caricaAnteprima(idsAttivita)`.

- [ ] **Step 3: Renderizzare i tab (commessa + attività) sopra l'anteprima**

Subito dopo la chiusura della `<section>` "Lettura file" (prima del blocco `righe.length === 0 ? ...`), inserisci:

```tsx
      {alberi.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {alberi.map((c) => (
              <button key={c.committente} type="button"
                onClick={() => { setCommessaSel(c.committente); setAttivitaSel(c.attivita[0]?.attivita ?? ''); }}
                className="rounded-xl border px-3 py-1.5 text-sm font-semibold capitalize transition"
                style={{
                  borderColor: c.committente === commessaSel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: c.committente === commessaSel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  color: 'var(--brand-text-main)',
                }}>
                {c.committente} <span style={{ color: 'var(--brand-text-muted)' }}>· {c.ids.length}</span>
              </button>
            ))}
          </div>
          {commessaCorrente && commessaCorrente.attivita.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-1">
              {commessaCorrente.attivita.map((a) => (
                <button key={a.attivita} type="button" onClick={() => setAttivitaSel(a.attivita)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium transition"
                  style={{
                    borderColor: a.attivita === attivitaSel ? 'var(--brand-primary)' : 'var(--brand-border)',
                    backgroundColor: a.attivita === attivitaSel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                    color: 'var(--brand-text-main)',
                  }}>
                  {a.attivita} <span style={{ color: 'var(--brand-text-muted)' }}>· {a.ids.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Verificare il build dei tipi del file toccato**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep AssegnazioneAiClient || echo "nessun errore TS sul file"`
Expected: "nessun errore TS sul file" (o nessuna riga relativa al file).

- [ ] **Step 5: Commit**

```bash
git add components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git commit -m "feat(assegnazione-ai): tab commessa/attività; anteprima per attività selezionata"
```

### Task 7: Filtro committente/attività nello storico

**Files:**
- Modify: `app/api/admin/agente/assegnazioni/route.ts`
- Modify: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Produces: `GET /api/admin/agente/assegnazioni?committente=&attivita=` filtra lo storico per i `file` di quella commessa/attività (join `agente_file_config`).

- [ ] **Step 1: Aggiungere il filtro nell'endpoint**

Sostituisci il corpo della `GET` in `assegnazioni/route.ts` con:

```ts
  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data');
  const committente = searchParams.get('committente');
  const attivita = searchParams.get('attivita');

  // se richiesto, limita ai file della commessa/attività
  let fileFiltro: string[] | null = null;
  if (committente) {
    let cq = supabaseAdmin.from('agente_file_config').select('file').eq('committente', committente);
    if (attivita) cq = cq.eq('attivita', attivita);
    const { data: cfg } = await cq;
    fileFiltro = ((cfg ?? []) as { file: string }[]).map((c) => c.file);
    if (fileFiltro.length === 0) return NextResponse.json({ righe: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let q = supabaseAdmin
    .from('assegnazione_ai_log')
    .select('data_pianificata, comune, file, staff_name, n_interventi, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) q = q.eq('data_pianificata', data);
  if (fileFiltro) q = q.in('file', fileFiltro);

  const { data: righe, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ righe: righe ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
```

- [ ] **Step 2: Passare i filtri da `caricaStorico` nel client**

Sostituisci `caricaStorico` con:

```tsx
  const caricaStorico = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (commessaSel) qs.set('committente', commessaSel);
      if (attivitaSel) qs.set('attivita', attivitaSel);
      const res = await fetch(`/api/admin/agente/assegnazioni?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStorico((j.righe ?? []) as StoricoRiga[]);
    } catch { /* informativo */ }
  }, [commessaSel, attivitaSel]);
```

- [ ] **Step 3: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "assegnazioni/route|AssegnazioneAiClient" || echo "ok"`
Expected: "ok".

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/agente/assegnazioni/route.ts components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git commit -m "feat(assegnazione-ai): storico filtrato per commessa/attività"
```

---

## Phase 4 — App: scrittura su ACEA (endpoint + tick + pulsante)

### Task 8: Modulo puro `assegnabiliAcea` (filtra interventi → lista da assegnare)

**Files:**
- Create: `lib/agente/assegnabiliAcea.ts`
- Test: `lib/agente/assegnabiliAcea.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type InterventoAcea = { id: string; odl: string | null; matricola_contatore: string | null; indirizzo: string | null; comune: string | null; staff_id: string | null };
  export type RigaAssegnabile = { interventoId: string; odl: string; matricola: string; indirizzo: string; comune: string; staffId: string; operatoreAcea: string };
  export function assegnabiliAcea(
    interventi: InterventoAcea[],
    staffById: Record<string, string>,   // staff_id -> display_name
    odlGiaAssegnati: Set<string>,
  ): { righe: RigaAssegnabile[]; scartati: { odl: string | null; motivo: string }[] };
  ```
  Regole: scarta se `odl` vuoto (`motivo:'odl mancante'`), se `staff_id` assente/non in `staffById` (`motivo:'operatore non risolto'`), se `odl` ∈ `odlGiaAssegnati` (`motivo:'già assegnato'`). `operatoreAcea = staffById[staff_id]`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { assegnabiliAcea } from './assegnabiliAcea';

const staff = { s1: 'ROSSI Mario', s2: 'VERDI Anna' };

describe('assegnabiliAcea', () => {
  it('produce le righe assegnabili risolvendo il nome operatore', () => {
    const interventi = [
      { id: 'i1', odl: '111', matricola_contatore: 'M1', indirizzo: 'Via A', comune: 'ROMA', staff_id: 's1' },
    ];
    const r = assegnabiliAcea(interventi, staff, new Set());
    expect(r.righe).toEqual([{ interventoId: 'i1', odl: '111', matricola: 'M1', indirizzo: 'Via A', comune: 'ROMA', staffId: 's1', operatoreAcea: 'ROSSI Mario' }]);
    expect(r.scartati).toEqual([]);
  });

  it('scarta odl mancante, operatore non risolto, già assegnato', () => {
    const interventi = [
      { id: 'i1', odl: '', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 's1' },
      { id: 'i2', odl: '222', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 'sX' },
      { id: 'i3', odl: '333', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 's2' },
    ];
    const r = assegnabiliAcea(interventi, staff, new Set(['333']));
    expect(r.righe).toEqual([]);
    expect(r.scartati).toEqual([
      { odl: '', motivo: 'odl mancante' },
      { odl: '222', motivo: 'operatore non risolto' },
      { odl: '333', motivo: 'già assegnato' },
    ]);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npx vitest run lib/agente/assegnabiliAcea.test.ts`
Expected: FAIL — funzione non definita.

- [ ] **Step 3: Implementare il modulo**

```ts
// lib/agente/assegnabiliAcea.ts
// PURO: dagli interventi ACEA del giorno costruisce la lista (odl→operatore) da spingere su ACEA,
// scartando odl mancanti, operatori non risolti e odl già assegnati (idempotenza).
export type InterventoAcea = { id: string; odl: string | null; matricola_contatore: string | null; indirizzo: string | null; comune: string | null; staff_id: string | null };
export type RigaAssegnabile = { interventoId: string; odl: string; matricola: string; indirizzo: string; comune: string; staffId: string; operatoreAcea: string };

const t = (v: string | null | undefined): string => (v ?? '').trim();

export function assegnabiliAcea(
  interventi: InterventoAcea[],
  staffById: Record<string, string>,
  odlGiaAssegnati: Set<string>,
): { righe: RigaAssegnabile[]; scartati: { odl: string | null; motivo: string }[] } {
  const righe: RigaAssegnabile[] = [];
  const scartati: { odl: string | null; motivo: string }[] = [];
  for (const i of interventi ?? []) {
    const odl = t(i.odl);
    if (!odl) { scartati.push({ odl: i.odl ?? '', motivo: 'odl mancante' }); continue; }
    const staffId = t(i.staff_id);
    const nome = staffId ? staffById[staffId] : undefined;
    if (!nome) { scartati.push({ odl, motivo: 'operatore non risolto' }); continue; }
    if (odlGiaAssegnati.has(odl)) { scartati.push({ odl, motivo: 'già assegnato' }); continue; }
    righe.push({ interventoId: i.id, odl, matricola: t(i.matricola_contatore), indirizzo: t(i.indirizzo), comune: t(i.comune), staffId, operatoreAcea: nome });
  }
  return { righe, scartati };
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `npx vitest run lib/agente/assegnabiliAcea.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add lib/agente/assegnabiliAcea.ts lib/agente/assegnabiliAcea.test.ts
git commit -m "feat(acea): assegnabiliAcea - lista interventi->operatore con idempotenza"
```

### Task 9: Endpoint agente `GET /api/agente/acea-assegnazioni`

**Files:**
- Create: `app/api/agente/acea-assegnazioni/route.ts`

**Interfaces:**
- Consumes: `chiaveValida`, `assegnabiliAcea` (Task 8).
- Produces: `GET ?data=YYYY-MM-DD` → `{ data, righe: RigaAssegnabile[], scartati }`. Seleziona `interventi` `committente='acea'`, `data`, `stato != 'annullato'`; esclude gli ODL già `assegnato` reale in `acea_assegnazioni_log` del giorno.

- [ ] **Step 1: Scrivere la route**

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { assegnabiliAcea, type InterventoAcea } from '@/lib/agente/assegnabiliAcea';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });

  try {
    // interventi ACEA del giorno (con operatore, non annullati)
    const { data: intRaw, error: eInt } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, matricola_contatore, indirizzo, comune, staff_id, stato')
      .eq('committente', 'acea').eq('data', data).neq('stato', 'annullato');
    if (eInt) throw eInt;
    const interventi = ((intRaw ?? []) as Array<InterventoAcea & { stato: string }>);

    // staff_id -> display_name
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById: Record<string, string> = {};
    for (const s of (staffRows ?? []) as { id: string; display_name: string }[]) staffById[String(s.id)] = s.display_name;

    // odl già assegnati (reali) per quel giorno → idempotenza
    const { data: logRows } = await supabaseAdmin
      .from('acea_assegnazioni_log')
      .select('odl').eq('data_assegnazione', data).eq('esito', 'assegnato').eq('dry_run', false);
    const odlGia = new Set(((logRows ?? []) as { odl: string }[]).map((r) => r.odl));

    const { righe, scartati } = assegnabiliAcea(interventi, staffById, odlGia);
    return NextResponse.json({ data, righe, scartati }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore acea-assegnazioni.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "acea-assegnazioni" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add app/api/agente/acea-assegnazioni/route.ts
git commit -m "feat(acea): endpoint agente acea-assegnazioni (interventi ACEA del giorno)"
```

### Task 10: Endpoint admin `POST /api/admin/agente/acea-assegna` (alza i flag)

**Files:**
- Create: `app/api/admin/agente/acea-assegna/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`.
- Produces: alza `forza_acea_assegna=true`, `acea_assegna_data=<data>`, `acea_assegna_dry=<dry>`. Body `{ data: 'YYYY-MM-DD', dry?: boolean }`.

- [ ] **Step 1: Scrivere la route (modello: `acea-stato/route.ts`)**

```ts
// app/api/admin/agente/acea-assegna/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let data = '';
  let dry = true; // default: prudente (dry-run)
  try {
    const body = (await req.json()) as { data?: string; dry?: boolean };
    if (body?.data && /^\d{4}-\d{2}-\d{2}$/.test(body.data)) data = body.data;
    if (body?.dry === false) dry = false;
  } catch { /* body assente */ }
  if (!data) return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_acea_assegna: true, acea_assegna_data: data, acea_assegna_dry: dry, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data, dry });
}
```

- [ ] **Step 2: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "acea-assegna/route" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/agente/acea-assegna/route.ts
git commit -m "feat(acea): endpoint admin acea-assegna (flag one-shot)"
```

### Task 11: Tick — esporre e consumare i nuovi flag

**Files:**
- Modify: `app/api/agente/tick/route.ts`

**Interfaces:**
- Produces: nel JSON di risposta `aceaAssegna` (bool), `aceaAssegnaData` (string|null), `aceaAssegnaDry` (bool). `forza_acea_assegna` azzerato subito dopo la lettura (come `forza_acea_stato`).

- [ ] **Step 1: Estendere `ConfigRow`**

Aggiungi in fondo al type `ConfigRow`:

```ts
  forza_acea_assegna: boolean;
  acea_assegna_data: string | null;
  acea_assegna_dry: boolean;
```

- [ ] **Step 2: Aggiungere le colonne alla `select`**

Nella stringa `.select('… forza_acea_stato, acea_target')`, aggiungi i tre campi:

```ts
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno, forza_giro, forza_scan, pianifica_data, forza_acea_stato, acea_target, forza_acea_assegna, acea_assegna_data, acea_assegna_dry',
```

- [ ] **Step 3: Consumare il flag (azzeramento immediato)**

Subito dopo il blocco che consuma `aceaStato` (`if (aceaStato) { … forza_acea_stato:false … }`), aggiungi:

```ts
    // Assegnazione su ACEA on-demand: flag one-shot, consumato qui.
    const aceaAssegna = config.forza_acea_assegna === true;
    if (aceaAssegna) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_assegna: false }).eq('id', 1);
    }
```

- [ ] **Step 4: Aggiungere i campi alla risposta JSON**

Nel `return NextResponse.json({ … aceaTarget: config.acea_target ?? 'dunning' }, …)`, aggiungi prima della chiusura dell'oggetto:

```ts
        aceaAssegna,
        aceaAssegnaData: config.acea_assegna_data ?? null,
        aceaAssegnaDry: config.acea_assegna_dry !== false,
```

- [ ] **Step 5: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "tick/route" || echo "ok"`
Expected: "ok".

- [ ] **Step 6: Commit**

```bash
git add app/api/agente/tick/route.ts
git commit -m "feat(acea): tick espone/consuma forza_acea_assegna + data + dry"
```

### Task 12: Report — `tipo:'acea-assegna'` scrive `acea_assegnazioni_log`

**Files:**
- Modify: `app/api/agente/report/route.ts`

**Interfaces:**
- Consumes: report dall'agente con `{ tipo:'acea-assegna', dryRun, data, file:[{aggiornate}], righe:[{odl,matricola,comune,staffId,operatoreAcea,interventoId,esito,motivo}] }`.
- Produces: insert in `agente_run` (come oggi) + insert per-riga in `acea_assegnazioni_log` con `run_id`.

- [ ] **Step 1: Catturare l'id del run inserito**

Sostituisci l'insert in `agente_run` con la variante che ritorna l'id:

```ts
    const { data: runRow, error: insErr } = await supabaseAdmin.from('agente_run').insert({
      dry_run: body.dryRun === true,
      lavori: r.lavori,
      aggiornate: r.aggiornate,
      extra: r.extra,
      conflitti: r.conflitti,
      non_collocate: r.nonCollocate,
      errore: body.erroreGlobale ?? null,
      dettaglio: body,
      tipo,
    }).select('id').single();
    if (insErr) throw insErr;
    const runId = (runRow as { id: string } | null)?.id ?? null;
```

- [ ] **Step 2: Scrivere le righe del log per i giri di assegnazione**

Subito dopo (prima dell'update `ultimo_giro_il`), aggiungi:

```ts
    // Giro di assegnazione su ACEA: traccia per-ODL nel log (idempotenza + storico).
    const bodyAssegna = body as unknown as {
      data?: string;
      righe?: Array<{ odl?: string; matricola?: string; comune?: string; staffId?: string; operatoreAcea?: string; interventoId?: string; esito?: string; motivo?: string }>;
    };
    if (tipo === 'acea-assegna' && Array.isArray(bodyAssegna.righe) && bodyAssegna.data) {
      const logRows = bodyAssegna.righe
        .filter((x) => x && typeof x.odl === 'string' && x.odl)
        .map((x) => ({
          data_assegnazione: bodyAssegna.data,
          odl: x.odl as string,
          matricola: x.matricola ?? null,
          comune: x.comune ?? null,
          staff_id: x.staffId ?? null,
          operatore_acea: x.operatoreAcea ?? null,
          intervento_id: x.interventoId ?? null,
          esito: x.esito ?? 'fallito',
          motivo: x.motivo ?? null,
          dry_run: body.dryRun === true,
          run_id: runId,
        }));
      if (logRows.length > 0) {
        const { error: eLog } = await supabaseAdmin.from('acea_assegnazioni_log').insert(logRows);
        if (eLog) console.error('[report] acea_assegnazioni_log insert:', eLog.message);
      }
    }
```

- [ ] **Step 3: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "report/route" || echo "ok"`
Expected: "ok".

- [ ] **Step 4: Commit**

```bash
git add app/api/agente/report/route.ts
git commit -m "feat(acea): report tipo acea-assegna scrive acea_assegnazioni_log"
```

### Task 13: Pulsante "Scrivi su ACEA" nel client (commessa Acea)

**Files:**
- Modify: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/agente/acea-assegna` (Task 10).
- Produces: nella commessa Acea, una card con date-picker (default = `data` dello stato esistente), toggle "Prova/Reale" e bottone che alza il flag.

- [ ] **Step 1: Aggiungere lo stato del pulsante**

Dopo gli altri `useState` del componente:

```tsx
  const [aceaDry, setAceaDry] = useState(true);
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);
```

- [ ] **Step 2: Aggiungere la funzione che alza il flag**

Dopo `procedi()`:

```tsx
  async function scriviAcea() {
    setAceaArming(true); setAceaMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, dry: aceaDry }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setAceaMsg(`Richiesta inviata (${aceaDry ? 'PROVA' : 'REALE'}) per il ${data}: l'agente assegnerà su ACEA al prossimo contatto.`);
      else setAceaMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setAceaArming(false); }
  }
```

- [ ] **Step 3: Renderizzare la card (solo per la commessa Acea)**

Subito dopo il blocco dei tab (Task 6 Step 3), aggiungi:

```tsx
      {isAcea && (
        <section className="rounded-2xl border p-4 space-y-2" style={card}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Scrivi assegnazioni su ACEA</h2>
          <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Spinge sul portale ACEA tutte le assegnazioni della commessa per il giorno selezionato (gli ODL già assegnati vengono saltati). Usa &quot;Prova&quot; per simulare senza scrivere.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--brand-text-main)' }}>Giorno: <strong>{data}</strong></span>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--brand-text-main)' }}>
              <input type="checkbox" checked={aceaDry} onChange={(e) => setAceaDry(e.target.checked)} /> Prova (non scrive)
            </label>
            <button type="button" onClick={() => void scriviAcea()} disabled={aceaArming}
              className="rounded-xl border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60"
              style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}>
              {aceaArming ? 'Invio…' : (aceaDry ? '▶ Prova su ACEA' : '▶ Scrivi su ACEA')}
            </button>
          </div>
          {aceaMsg && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{aceaMsg}</p>}
        </section>
      )}
```

- [ ] **Step 4: Verificare i tipi**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "AssegnazioneAiClient" || echo "ok"`
Expected: "ok".

- [ ] **Step 5: Commit**

```bash
git add components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git commit -m "feat(assegnazione-ai): pulsante Scrivi su ACEA (commessa Acea)"
```

---

## Phase 5 — Agente: scrittura su ACEA (Playwright)

### Task 14: Modulo puro `risolviNomeOperatore`

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs`
- Test: `tools/limitazioni-sync/lib/acea/risolviNomeOperatore.test.ts`

**Interfaces:**
- Produces: `risolviNomeOperatore(nome, operatori) => string`. `operatori` = mappa `{ "<nome-app>": "<grafia-ACEA>" }`. Se la chiave (trim) esiste usa l'override, altrimenti ritorna il nome originale (trim).

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';

describe('risolviNomeOperatore', () => {
  it('applica override quando presente', () => {
    expect(risolviNomeOperatore('Mario Rossi', { 'Mario Rossi': 'ROSSI MARIO' })).toBe('ROSSI MARIO');
  });
  it('passa il nome se non c\'è override', () => {
    expect(risolviNomeOperatore('Anna Verdi', { 'Mario Rossi': 'ROSSI MARIO' })).toBe('Anna Verdi');
  });
  it('mappa assente/null → nome trimmato', () => {
    expect(risolviNomeOperatore('  Anna Verdi  ', undefined)).toBe('Anna Verdi');
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/risolviNomeOperatore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare il modulo**

```js
// tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs
// PURO: applica l'eventuale mappatura nome-app → grafia-ACEA dal config (acea.operatori).
export function risolviNomeOperatore(nome, operatori) {
  const n = String(nome ?? '').trim();
  if (operatori && Object.prototype.hasOwnProperty.call(operatori, n)) {
    return String(operatori[n] ?? '').trim() || n;
  }
  return n;
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/risolviNomeOperatore.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs tools/limitazioni-sync/lib/acea/risolviNomeOperatore.test.ts
git commit -m "feat(acea): risolviNomeOperatore - override grafia nome operatore"
```

### Task 15: `apiAgente.mjs` — helper `fetchAceaAssegnazioni`

**Files:**
- Modify: `tools/limitazioni-sync/lib/apiAgente.mjs`

**Interfaces:**
- Produces: `fetchAceaAssegnazioni({ baseUrl, exportKey, data }, fetchImpl?) => Promise<{data, righe, scartati}>` (GET con header `x-export-key`).

- [ ] **Step 1: Aggiungere l'helper in fondo al file**

```js
/** GET /api/agente/acea-assegnazioni?data= → { data, righe, scartati } (header x-export-key). */
export async function fetchAceaAssegnazioni({ baseUrl, exportKey, data }, fetchImpl = fetch) {
  const url = `${baseUrl}/api/agente/acea-assegnazioni?data=${encodeURIComponent(data)}`;
  const res = await fetchImpl(url, { headers: { 'x-export-key': exportKey } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`GET ${url} ${res.status}: ${corpo}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Verificare che la suite resti verde**

Run: `cd tools/limitazioni-sync && npx vitest run lib/apiAgente`
Expected: PASS (se esistono test; altrimenti `no test files` è accettabile — l'import non rompe).

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/lib/apiAgente.mjs
git commit -m "feat(acea): apiAgente.fetchAceaAssegnazioni"
```

### Task 16: `driver.mjs` — estrarre `apriCruscotto` (riuso login/iframe)

**Files:**
- Modify: `tools/limitazioni-sync/lib/acea/driver.mjs`

**Interfaces:**
- Produces: `apriCruscotto(acea, { stamp }) => Promise<{ browser, page, app, shot }>` (login → tile → iframe → Cruscotto pronto, campo Contratto visibile). `loginEdEsporta` viene rifattorizzato per usarlo (comportamento invariato).

- [ ] **Step 1: Aggiungere `apriCruscotto` (estrae i passi 1–5 esistenti)**

Sopra `loginEdEsporta`, aggiungi:

```js
/** Login + apertura del Cruscotto (passi condivisi tra export e assegnazione).
 *  Ritorna browser/page/app(frameLocator)/shot. Il chiamante DEVE chiudere browser. */
export async function apriCruscotto(acea, { stamp = 'manual' } = {}) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(acea.download, { recursive: true });
  if (acea.debug) fs.mkdirSync(acea.debug, { recursive: true });

  const browser = await chromium.launch({
    channel: acea.browser ?? 'msedge',
    headless: acea.headless !== false,
  });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(acea.timeoutMs ?? 60_000);

  let passo = 'init';
  const shot = async (nome) => {
    if (!acea.debug) return;
    try { await page.screenshot({ path: path.join(acea.debug, `acea-${stamp}-${nome}.png`), fullPage: true }); } catch { /* best effort */ }
  };

  try {
    passo = 'goto-launchpad';
    await page.goto(acea.loginUrl, { waitUntil: 'domcontentloaded' });

    passo = 'relogon';
    const relogon = page.getByRole('button', { name: 'Effettua nuovamente il logon' });
    if (await relogon.isVisible().catch(() => false)) await relogon.click();

    passo = 'login-utente';
    const user = page.getByRole('textbox', { name: 'Account utente' });
    await user.waitFor({ state: 'visible' });
    await user.fill(acea.username);
    await user.press('Enter');

    passo = 'login-password';
    const pass = page.getByRole('textbox', { name: 'Password' });
    await pass.waitFor({ state: 'visible' });
    await pass.fill(acea.password);
    await pass.press('Enter');

    passo = 'apri-app';
    const tile = page.getByRole('link', { name: 'Pianificazione Lavori Idrico' });
    await tile.waitFor({ state: 'visible' });
    await tile.click();

    passo = 'cruscotto';
    const app = page.frameLocator(FRAME);
    const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
    if (!(await contratto.isVisible().catch(() => false))) {
      await app.getByText('Cruscotto schedulazione e pianificazione interventi').first().click();
    }
    await contratto.waitFor({ state: 'visible' });
    await shot('1-form');
    return { browser, page, app, shot };
  } catch (e) {
    await shot(`errore-${passo}`);
    await browser.close();
    throw new Error(`[ACEA driver] login fallito al passo "${passo}": ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

- [ ] **Step 2: Rifattorizzare `loginEdEsporta` per usare `apriCruscotto`**

Sostituisci il corpo di `loginEdEsporta` (dall'apertura browser fino allo `shot('1-form')`) così che usi `apriCruscotto` e mantenga SOLO i passi filtri→ricerca→export. La funzione diventa:

```js
export async function loginEdEsporta(acea, { stamp = 'manual' } = {}) {
  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  const ric = acea.ricerca ?? {};
  let passo = 'post-login';
  try {
    // 6a) Filtro Contratto
    passo = 'filtro-contratto';
    const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
    await contratto.fill(String(ric.contratto ?? ''));
    await contratto.press('Enter');
    await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });

    // 6b) Data pubblicazione lavoro ≥
    passo = 'filtro-data';
    const dataDa = app.getByRole('textbox', { name: /Data pubblicazione lavoro/i }).first();
    await dataDa.fill(String(ric.dataPubblicazioneDa ?? ''));
    await dataDa.press('Enter');

    // 6c) Escludi ODM chiusi → OFF
    passo = 'filtro-switch';
    const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
    const acceso = await sw.getAttribute('aria-checked').catch(() => null);
    const vuoiAcceso = ric.escludiOdmChiusi === true;
    if (acceso === 'true' && !vuoiAcceso) await sw.click();
    else if (acceso === 'false' && vuoiAcceso) await sw.click();
    else if (acceso === null && !vuoiAcceso) await sw.click().catch(() => {});
    await shot('2-filtri');

    // 7) Ricerca
    passo = 'ricerca';
    await app.getByRole('button', { name: 'Ricerca' }).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot('3-risultati');

    // 8) Esportazione → download
    passo = 'esportazione';
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      app.getByRole('button', { name: 'Esportazione' }).click(),
    ]);
    const dest = path.join(acea.download, `acea-${stamp}-${download.suggestedFilename() || 'export.xlsx'}`);
    await download.saveAs(dest);
    await shot('4-scaricato');
    return dest;
  } catch (e) {
    await shot(`errore-${passo}`);
    throw new Error(`[ACEA driver] fallito al passo "${passo}": ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Verificare che la suite agente resti verde**

Run: `cd tools/limitazioni-sync && npx vitest run`
Expected: PASS (84+; il driver non ha unit test ma l'import deve restare valido).

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/driver.mjs
git commit -m "refactor(acea): estrai apriCruscotto da loginEdEsporta (riuso login/iframe)"
```

> **Calibrazione (manuale, PC del lavoro):** dopo questo refactor, verificare che il giro di stato ODL (Fase 1) funzioni ancora con un dry-run reale prima di affidarsi alla Fase 2.

### Task 17: `assegnaInterventi.mjs` — driver di scrittura (stub calibrabile)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs`

**Interfaces:**
- Consumes: `apriCruscotto` (Task 16).
- Produces: `assegnaInterventi(acea, righe, { stamp, dryRun }) => Promise<{ esiti: Array<{ odl, esito:'assegnato'|'fallito', motivo? }> }>`. `righe` = `[{ odl, operatoreAcea, ... }]`. In `dryRun` apre il Cruscotto e cerca ogni ODL ma NON salva.

- [ ] **Step 1: Scrivere lo stub con i punti di aggancio documentati**

```js
// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: per ogni ODL apre la riga nel Cruscotto e assegna l'operatore.
// Selettori SAP UI5 instabili → SOLO locatori per ruolo/etichetta/testo (mai __input1).
//
// ⚠️ DA CALIBRARE sul PC del lavoro col codegen:
//   npx playwright codegen --channel msedge "<loginUrl>"
//   → registrare: ricerca ODL nel Cruscotto, apertura riga, campo "Risorsa"/operatore, salvataggio.
//   Trascrivere qui SOTTO i locatori reali (per ruolo/etichetta), nei punti marcati [CALIBRARE].
import { apriCruscotto } from './driver.mjs';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  try {
    for (const r of righe) {
      let passo = `cerca-${r.odl}`;
      try {
        // [CALIBRARE] 1) cercare/filtrare l'ODL nel Cruscotto
        //   es.: const cerca = app.getByRole('textbox', { name: /Ordine|ODL/i }).first();
        //        await cerca.fill(String(r.odl)); await cerca.press('Enter');

        // [CALIBRARE] 2) aprire la riga dell'ODL
        //   es.: await app.getByRole('row', { name: new RegExp(r.odl) }).first().click();

        // [CALIBRARE] 3) impostare l'operatore (campo "Risorsa"): autocomplete/dropdown/testo
        passo = `assegna-${r.odl}`;
        //   es.: const risorsa = app.getByRole('textbox', { name: /Risorsa|Operatore/i }).first();
        //        await risorsa.fill(r.operatoreAcea); ...selezione voce...

        if (dryRun) {
          await shot(`dry-${r.odl}`);
          esiti.push({ odl: r.odl, esito: 'assegnato', motivo: 'dry-run (non salvato)' });
          continue;
        }

        // [CALIBRARE] 4) salvare l'assegnazione
        passo = `salva-${r.odl}`;
        //   es.: await app.getByRole('button', { name: 'Salva' }).click();
        //        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(`ok-${r.odl}`);
        esiti.push({ odl: r.odl, esito: 'assegnato' });
      } catch (e) {
        await shot(`errore-${passo}`);
        esiti.push({ odl: r.odl, esito: 'fallito', motivo: `passo "${passo}": ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    return { esiti };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Verificare che l'import non rompa la suite**

Run: `cd tools/limitazioni-sync && npx vitest run`
Expected: PASS (lo stub non è importato dai test; nessuna regressione).

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
git commit -m "feat(acea): assegnaInterventi - driver scrittura (stub da calibrare)"
```

### Task 18: Orchestratore `eseguiGiroAceaAssegna.mjs`

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs`
- Test: `tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.test.ts`

**Interfaces:**
- Consumes: `acquisisci`/`rilascia` (lock), `risolviNomeOperatore` (Task 14). `assegna` e `fetchLista` iniettabili per i test.
- Produces:
  ```js
  eseguiGiroAceaAssegna({ cfg, stamp, data, dryRun, nowMs, fetchLista, assegna }) => Promise<report>
  // report: { tipo:'acea-assegna', dryRun, data, lavori, file:[{aggiornate}], righe:[{odl,matricola,comune,staffId,operatoreAcea,interventoId,esito,motivo}], scartati, erroreGlobale? }
  ```
  Default reali (se non iniettati): `fetchLista` = `fetchAceaAssegnazioni`, `assegna` = `assegnaInterventi`. Applica `risolviNomeOperatore` con `cfg.acea.operatori` prima di passare a `assegna`. Lock: se occupato → `{ saltato:true }`.

- [ ] **Step 1: Scrivere i test (lock, mapping nome, esiti)**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eseguiGiroAceaAssegna } from './eseguiGiroAceaAssegna.mjs';

function cfgConDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-assegna-'));
  return { cfg: { acea: { masterPath: path.join(dir, 'm.xlsx'), operatori: { 'ROSSI Mario': 'ROSSI MARIO' } } }, dir };
}

describe('eseguiGiroAceaAssegna', () => {
  it('mappa il nome operatore e riporta gli esiti', async () => {
    const { cfg } = cfgConDir();
    const fetchLista = async () => ({ data: '2026-06-22', righe: [{ odl: '111', matricola: 'M1', comune: 'ROMA', staffId: 's1', operatoreAcea: 'ROSSI Mario', interventoId: 'i1' }], scartati: [] });
    let nomeVisto = '';
    const assegna = async (_acea, righe) => { nomeVisto = righe[0].operatoreAcea; return { esiti: [{ odl: '111', esito: 'assegnato' }] }; };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: false, nowMs: 1000, fetchLista, assegna });
    expect(nomeVisto).toBe('ROSSI MARIO'); // override applicato
    expect(rep.tipo).toBe('acea-assegna');
    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0]).toMatchObject({ odl: '111', esito: 'assegnato', operatoreAcea: 'ROSSI MARIO', interventoId: 'i1' });
    expect(rep.file[0].aggiornate).toBe(1);
  });

  it('lista vuota → nessuna chiamata ad assegna', async () => {
    const { cfg } = cfgConDir();
    const fetchLista = async () => ({ data: '2026-06-22', righe: [], scartati: [{ odl: '9', motivo: 'già assegnato' }] });
    let chiamato = false;
    const assegna = async () => { chiamato = true; return { esiti: [] }; };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: true, nowMs: 1000, fetchLista, assegna });
    expect(chiamato).toBe(false);
    expect(rep.righe).toHaveLength(0);
    expect(rep.scartati).toHaveLength(1);
  });

  it('lock occupato → saltato', async () => {
    const { cfg } = cfgConDir();
    fs.writeFileSync(path.join(path.dirname(cfg.acea.masterPath), 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: true, nowMs: 1500, fetchLista: async () => ({ righe: [] }), assegna: async () => ({ esiti: [] }) });
    expect(rep.saltato).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/eseguiGiroAceaAssegna.test.ts`
Expected: FAIL — modulo non esiste.

- [ ] **Step 3: Implementare l'orchestratore**

```js
// tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs
// Orchestrazione assegnazione su ACEA: lock → fetch lista dall'app → mappa nome → assegna (Playwright) → report.
import path from 'node:path';
import { acquisisci, rilascia } from './lock.mjs';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';
import { fetchAceaAssegnazioni } from '../apiAgente.mjs';
import { assegnaInterventi } from './assegnaInterventi.mjs';

function reportBase(extra) {
  return { tipo: 'acea-assegna', dryRun: false, lavori: 0, file: [{ aggiornate: 0 }], righe: [], scartati: [], ...extra };
}

export async function eseguiGiroAceaAssegna({
  cfg, stamp, data, dryRun = true, nowMs = Date.now(),
  baseUrl, exportKey,
  fetchLista = fetchAceaAssegnazioni, assegna = assegnaInterventi,
}) {
  const acea = cfg.acea;
  const lockPath = path.join(path.dirname(acea.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).', data });
  }
  try {
    const lista = await fetchLista({ baseUrl, exportKey, data });
    const righeIn = Array.isArray(lista?.righe) ? lista.righe : [];
    const scartati = Array.isArray(lista?.scartati) ? lista.scartati : [];
    if (righeIn.length === 0) {
      return reportBase({ dryRun, data, scartati });
    }
    // mappa la grafia del nome operatore per il portale
    const righe = righeIn.map((r) => ({ ...r, operatoreAcea: risolviNomeOperatore(r.operatoreAcea, acea.operatori) }));
    const { esiti } = await assegna(acea, righe, { stamp, dryRun });
    const esitoByOdl = new Map(esiti.map((e) => [e.odl, e]));
    const righeReport = righe.map((r) => {
      const e = esitoByOdl.get(r.odl) ?? { esito: 'fallito', motivo: 'nessun esito dal driver' };
      return { odl: r.odl, matricola: r.matricola ?? '', comune: r.comune ?? '', staffId: r.staffId ?? '', operatoreAcea: r.operatoreAcea, interventoId: r.interventoId ?? null, esito: e.esito, motivo: e.motivo ?? null };
    });
    const aggiornate = righeReport.filter((r) => r.esito === 'assegnato').length;
    return reportBase({ dryRun, data, lavori: righe.length, file: [{ aggiornate }], righe: righeReport, scartati });
  } catch (e) {
    return reportBase({ dryRun, data, erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `cd tools/limitazioni-sync && npx vitest run lib/acea/eseguiGiroAceaAssegna.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.test.ts
git commit -m "feat(acea): orchestratore eseguiGiroAceaAssegna (lock + mapping + report)"
```

### Task 19: Cablare il ramo `aceaAssegna` in `agente.mjs`

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`

**Interfaces:**
- Consumes: `eseguiGiroAceaAssegna` (Task 18), `inviaReport`/`scriviLog` esistenti.
- Produces: in `main()`, quando `ris.aceaAssegna` è true, esegue il giro di assegnazione (import dinamico di Playwright) e invia il report.

- [ ] **Step 1: Aggiungere il ramo dopo quello di `ris.aceaStato`**

Subito dopo il blocco `if (ris.aceaStato) { … }` in `main()`, aggiungi:

```js
  // Giro ASSEGNAZIONE su ACEA on-demand: indipendente da eseguiOra. Playwright via import dinamico.
  if (ris.aceaAssegna && ris.aceaAssegnaData) {
    const now = new Date();
    const dryRun = ris.aceaAssegnaDry !== false;
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-assegna';
    try {
      const { eseguiGiroAceaAssegna } = await import('./lib/acea/eseguiGiroAceaAssegna.mjs');
      const report = await eseguiGiroAceaAssegna({
        cfg, stamp, data: ris.aceaAssegnaData, dryRun,
        baseUrl, exportKey: cfg.exportKey,
      });
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      console.log(`[lim-sync] giro ACEA assegna (${dryRun ? 'PROVA' : 'REALE'}) ${ris.aceaAssegnaData}: assegnate=${report.file?.[0]?.aggiornate ?? 0} scartate=${report.scartati?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
    } catch (e) {
      console.error(`[lim-sync] giro ACEA assegna fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
```

- [ ] **Step 2: Verificare che la suite agente resti verde**

Run: `cd tools/limitazioni-sync && npx vitest run`
Expected: PASS (90+ test: i nuovi moduli puri + gli 84 esistenti).

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(acea): agente esegue il giro di assegnazione su ACEA (ramo aceaAssegna)"
```

---

## Phase 6 — Verifica finale, calibrazione, deploy

### Task 20: Gate test e build

**Files:** nessuno (verifica).

- [ ] **Step 1: Suite agente completa**

Run: `cd tools/limitazioni-sync && npx vitest run`
Expected: PASS (tutti i test, inclusi i 6 nuovi moduli puri).

- [ ] **Step 2: Test mirati app (file toccati)**

Run: `npx vitest run lib/agente/raggruppaCommessaAttivita.test.ts lib/agente/assegnabiliAcea.test.ts`
Expected: PASS.

- [ ] **Step 3: Type-check dei file app toccati**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "acea-assegna|acea-assegnazioni|tick/route|report/route|assegnazioni/route|AssegnazioneAiClient|assegnabiliAcea|raggruppaCommessaAttivita" || echo "nessun errore sui file toccati"`
Expected: "nessun errore sui file toccati".

- [ ] **Step 4: Build Next (sanity, opzionale ma consigliato)**

Run: `npm run build`
Expected: build completata (i fallimenti pre-esistenti fuori scope non riguardano i file nuovi).

### Task 21: Deploy app + propagazione agente

**Files:** nessuno (operativo).

- [ ] **Step 1: Push su main (Vercel auto-deploy)**

Branca da `origin/main`, poi push refspec con ok esplicito:
```bash
git push origin HEAD:main
```
Expected: deploy Vercel parte; endpoint nuovi LIVE.

- [ ] **Step 2: Impostare `template_id` DUNNING in `agente_file_config`**

Via MCP `execute_sql` (sostituire `<id-template-dunning>`):
```sql
update agente_file_config set template_id = '<id-template-dunning>' where file = 'LIMITAZIONI CON ORDINE.xlsx';
```

- [ ] **Step 3: Propagare l'agente al PC del lavoro**

Copiare la sorgente aggiornata nel canale Google Drive e robocopy sul PC del lavoro (preserva config/node_modules) — vedi memoria `agente-update-channel-pc-lavoro`.

- [ ] **Step 4: Config `acea` reale sul PC**

In `config.json` del PC: aggiungere le chiavi di lettura DUNNING (`masterColonnaEsecutore`/`Data`/`Matricola`/`Indirizzo`/`Comune`) e (se serve) `acea.operatori`.

### Task 22: Calibrazione codegen + dry-run reale

**Files:**
- Modify (PC del lavoro): `tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs` (riempire i `[CALIBRARE]`).

- [ ] **Step 1: Registrare il flusso di assegnazione**

Run (PC del lavoro):
```
npx playwright codegen --channel msedge "https://prd-int.launchpad.cfapps.eu10.hana.ondemand.com/site?siteId=57918e45-c3d6-4972-ab13-ca495fc4d7ee&sap-language=it-IT"
```
Registrare: ricerca ODL, apertura riga, campo Risorsa/operatore, salvataggio. Trascrivere i locatori (ruolo/etichetta) nei punti `[CALIBRARE]` di `assegnaInterventi.mjs`. Verificare la grafia esatta del nome operatore → eventuale `acea.operatori`.

- [ ] **Step 2: Dry-run reale dall'app**

Dall'app: `/hub/assegnazione-ai` → commessa **Acea** → scegliere un giorno con poche righe già pianificate (Procedi fatto) → spunta **Prova** → "Prova su ACEA". Attendere il tick. Controllare lo storico/report (`agente_run` tipo `acea-assegna`) e gli screenshot in `acea.debug`.
Expected: l'agente apre il Cruscotto e individua gli ODL senza salvare.

- [ ] **Step 3: Giro reale + verifica a mano**

Ripetere senza **Prova** → "Scrivi su ACEA". Verificare su ACEA che le assegnazioni siano atterrate. Controllare `acea_assegnazioni_log` (esiti `assegnato`).
Expected: assegnazioni presenti sul portale; re-run successivo salta gli ODL già assegnati (idempotenza).

---

## Self-Review (eseguita)

- **Copertura spec**: §4 passo 1 (READ DUNNING) → Task 2-4; passo 2 (anteprima/procedi) = riuso esistente; passo 3 (SCRIVI) → Task 8-13, 14-19; §5 (commessa/attività) → Task 5-7, 13; §6.1 DB → Task 1; §6.2 endpoint → Task 9-12; §6.3 agente → Task 14-19; §7 nomi → Task 2/14/18; §8 idempotenza/dry/errori → Task 1/8/9/17/18; §9 calibrazione → Task 22. ATTGIORN fuori scope: nessun task (corretto).
- **Decisione esplicitata**: la scrittura ACEA è per-giorno sull'intera commessa (`interventi.committente='acea'`), non per-attività (vincolo data-model). Annotato in Global Constraints e Task 9/13.
- **Placeholder**: gli unici "[CALIBRARE]" sono nello stub di `assegnaInterventi.mjs` (Task 17) — intenzionali, da riempire col codegen reale (Task 22), come fu per il driver Fase 1. Nessun TODO/placeholder nel resto.
- **Coerenza tipi**: `RigaAssegnabile` (Task 8) usata identica in Task 9 (endpoint) e Task 18 (orchestratore → report); shape report `acea-assegna` (Task 18) ↔ parsing in `report/route.ts` (Task 12) allineata (`odl/matricola/comune/staffId/operatoreAcea/interventoId/esito/motivo` + `data`); flag tick (Task 11) ↔ consumo agente (Task 19) allineati (`aceaAssegna/aceaAssegnaData/aceaAssegnaDry`).
