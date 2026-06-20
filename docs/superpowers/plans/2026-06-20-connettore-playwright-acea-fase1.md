# Connettore Playwright ACEA — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-demand, l'app fa partire l'agente locale che via Playwright accede ad ACEA, esporta e rinfresca la colonna `Stato Operazione` (per `Ordine`) nel master `LIMITAZIONI CON ORDINE.xlsx`.

**Architecture:** Estende l'agente Node `tools/limitazioni-sync` (pattern app=cervello via tick). Un pulsante in `/hub/agente` alza il flag one-shot `forza_acea_stato`; al tick l'agente lancia Playwright (Edge), login user+password, filtri fissi→Cerca→Esporta, poi riusa la meccanica Excel esistente per agganciare per `Ordine` e sovrascrivere `Stato Operazione`. Logica pura testata (parse/aggiorna/lock) + driver Playwright sottile + orchestratore con driver iniettabile.

**Tech Stack:** Node ESM (`.mjs`, `type: module`), `exceljs ^4.4`, `playwright` (channel `msedge`), vitest (`.test.ts`), Next.js App Router + Supabase (lato app).

## Global Constraints

- **Linguaggio agente:** ESM puro (`.mjs`), file in `tools/limitazioni-sync/`. Test = `.test.ts` accanto al modulo, che importano il `.mjs`. Eseguiti con `npx vitest run <path>`.
- **Playwright:** browser via `channel: 'msedge'` (default), niente download del browser, **nessun diritto admin**. `import()` **dinamico** di Playwright (mai caricato nei tick normali).
- **Credenziali ACEA:** solo in `config.json` locale (già gitignored). Mai su Vercel, mai in git, mai dentro il report inviato all'app.
- **Scrittura master:** SOLO `acea.masterPath` (cartella DUNNING), mai i master della sync (`cfg.cartella`). Colonna `Stato Operazione` con policy **sovrascrivi-sempre** (traccia il valore precedente). Le altre colonne (`Data`, `Esecutore`, `NOTE`, …) **mai toccate**. Backup datato prima di salvare.
- **Match:** colonne risolte **per nome dal config** via `risolviColonna` (robusto a maiuscole/accenti/NBSP), non per gli alias di `rilevaColonne`.
- **Riuso:** `excelIO.mjs` (`caricaWorkbook`/`backupFile`/`salva`), `match.mjs` (`norm`), `colonne.mjs` (`risolviColonna`), `apiAgente.mjs` (`tick`/`inviaReport`).
- **SQL:** le migration si applicano via Supabase MCP `apply_migration` **oppure** consegnando la SQL all'utente (preferenza utente: SQL in chat solo su richiesta esplicita). Mai SQL spontanea inline.
- **Branch:** `feat/connettore-playwright-acea` (già esistente).
- **Baseline rossa:** `npm run lint`/`npx vitest run` hanno fallimenti pre-esistenti; il gate è "nessun nuovo problema dai file di questo WP" (verifica mirata sui file toccati).

---

### Task 1: Dipendenze, config di esempio, gitignore

**Files:**
- Modify: `tools/limitazioni-sync/package.json`
- Modify: `tools/limitazioni-sync/config.example.json`
- Modify: `tools/limitazioni-sync/.gitignore`
- Create: `tools/limitazioni-sync/smoke-edge.mjs`

- [ ] **Step 1: Aggiungi `playwright` alle dipendenze dell'agente**

In `package.json`, sezione `dependencies`:

```json
  "dependencies": {
    "exceljs": "^4.4.0",
    "playwright": "^1.49.0"
  }
```

- [ ] **Step 2: Estendi `config.example.json` con la sezione `acea`**

```jsonc
{
  "endpointUrl": "https://<TUO-DOMINIO-VERCEL>/api/export/limitazioni-massive",
  "exportKey": "INCOLLA-QUI-LO-STESSO-SEGRETO-DI-VERCEL",
  "cartella": "C:\\Users\\edgardo.perrelli\\Plenzich s.p.a\\Commesse - Documenti\\ANNO 2026\\CP 20260002_ACEA_GU IDRICHE L2\\8_LAVORI\\LIMITAZIONI MASSIVE",
  "acea": {
    "loginUrl": "https://<PORTALE-ACEA>/login",
    "username": "<UTENTE-ACEA>",
    "password": "<PASSWORD-ACEA>",
    "browser": "msedge",
    "masterPath": "C:\\Users\\edgardo.perrelli\\Plenzich s.p.a\\Commesse - Documenti\\ANNO 2026\\CP 20260002_ACEA_GU IDRICHE L2\\8_LAVORI\\DUNNING\\2026\\LIMITAZIONI CON ORDINE.xlsx",
    "foglio": "PIANIFICAZIONE",
    "download": "C:\\Users\\edgardo.perrelli\\Desktop\\tools\\_acea_download",
    "debug": "C:\\Users\\edgardo.perrelli\\Desktop\\tools\\_acea_debug",
    "login": { "campoUser": "<SELETTORE-INPUT-USER>", "campoPass": "<SELETTORE-INPUT-PASS>", "bottoneLogin": "<SELETTORE-BOTTONE-LOGIN>" },
    "ricerca": {
      "filtri": [],
      "bottoneCerca": "<SELETTORE-BOTTONE-CERCA>",
      "bottoneEsporta": "<SELETTORE-BOTTONE-ESPORTA>"
    },
    "export": { "foglio": null, "colonnaOdl": "Ordine", "colonnaStato": "Stato Operazione" },
    "masterColonnaOdl": "Ordine",
    "masterColonnaStato": "Stato Operazione",
    "sovrascriviStato": true
  }
}
```

> I valori `<…>` (selettori, URL, credenziali) restano segnaposto **nel file di esempio**; vengono riempiti nel `config.json` reale al Task 15 (calibrazione). Il codice non contiene segnaposto: legge questi valori dal config.

- [ ] **Step 3: Estendi `.gitignore`**

```
node_modules/
config.json
_backup/
_log/
_acea_download/
_acea_debug/
acea.lock
_prova-acea.mjs
```

> `smoke-edge.mjs` **non** va in gitignore: è uno strumento riutilizzabile, lo committiamo. `_prova-acea.mjs` (Task 15) è usa-e-getta → ignorato.

- [ ] **Step 4: Crea lo smoke-test `smoke-edge.mjs`** (verifica Edge headless, è anche il check del Task 0 operativo)

```js
// Smoke-test: verifica che Playwright sappia lanciare l'Edge installato (senza admin).
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
await p.goto('https://example.com');
console.log('OK - Edge headless funziona. Titolo:', await p.title());
await b.close();
```

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/package.json tools/limitazioni-sync/config.example.json tools/limitazioni-sync/.gitignore tools/limitazioni-sync/smoke-edge.mjs
git commit -m "chore(acea): dipendenza playwright + config esempio + smoke-test"
```

---

### Task 2: `lock.mjs` — lock file anti-sovrapposizione (TDD)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/lock.mjs`
- Test: `tools/limitazioni-sync/lib/acea/lock.test.ts`

**Interfaces:**
- Produces: `acquisisci(lockPath, { nowMs?, staleMs? }) => boolean` (true se acquisito, false se un giro è già attivo); `rilascia(lockPath) => void`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tools/limitazioni-sync/lib/acea/lock.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquisisci, rilascia } from './lock.mjs';

const lockPath = path.join(os.tmpdir(), `acea-test-${process.pid}.lock`);
afterEach(() => { try { fs.unlinkSync(lockPath); } catch { /* noop */ } });

describe('lock', () => {
  it('acquisisce su file assente e scrive il lock', () => {
    expect(acquisisci(lockPath, { nowMs: 1000 })).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
  });
  it('rifiuta se un lock recente è attivo', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    expect(acquisisci(lockPath, { nowMs: 2000, staleMs: 600000 })).toBe(false);
  });
  it('acquisisce se il lock è stale (oltre staleMs)', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    expect(acquisisci(lockPath, { nowMs: 1000 + 700000, staleMs: 600000 })).toBe(true);
  });
  it('rilascia rimuove il file (idempotente)', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    rilascia(lockPath);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(() => rilascia(lockPath)).not.toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/lock.test.ts`
Expected: FAIL — `Cannot find module './lock.mjs'`.

- [ ] **Step 3: Implementa `lock.mjs`**

```js
// tools/limitazioni-sync/lib/acea/lock.mjs
// I/O: lock file per impedire due giri ACEA in parallelo (tick frequenti).
import fs from 'node:fs';

/** Acquisisce il lock. False se ne esiste uno scritto da meno di staleMs. */
export function acquisisci(lockPath, { nowMs = Date.now(), staleMs = 10 * 60 * 1000 } = {}) {
  try {
    const { ms } = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (typeof ms === 'number' && nowMs - ms < staleMs) return false; // giro attivo
  } catch { /* assente o illeggibile → procedi */ }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ms: nowMs }), 'utf8');
  return true;
}

/** Rilascia il lock (idempotente). */
export function rilascia(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* già assente */ }
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/lock.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/lock.mjs tools/limitazioni-sync/lib/acea/lock.test.ts
git commit -m "feat(acea): lock file anti-sovrapposizione"
```

---

### Task 3: `parseExport.mjs` — parsing dell'export ACEA (TDD)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/parseExport.mjs`
- Test: `tools/limitazioni-sync/lib/acea/parseExport.test.ts`

**Interfaces:**
- Consumes: `risolviColonna` (`../colonne.mjs`), `norm` (`../match.mjs`).
- Produces:
  - `valoreCella(v) => string|Date` (estrae testo da celle exceljs: rich text/formula/hyperlink).
  - `trovaHeader(ws, nomi[]) => { riga, idx }` (riga 1-based dell'intestazione che contiene TUTTE le `nomi`; `idx[nome]` = indice 0-based; `riga=-1` se assente).
  - `estraiRigheExport(ws, { colonnaOdl, colonnaStato }) => { righe: [{ ordine, stato }], erroreColonne }`.
  - `parseExport(file, { foglio?, colonnaOdl, colonnaStato }) => Promise<{ righe, erroreColonne }>`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tools/limitazioni-sync/lib/acea/parseExport.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { estraiRigheExport, trovaHeader, valoreCella } from './parseExport.mjs';

function ws(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('X');
  rows.forEach((r) => sheet.addRow(r));
  return sheet;
}

describe('valoreCella', () => {
  it('estrae testo da rich text e formula', () => {
    expect(valoreCella({ richText: [{ text: 'A' }, { text: 'B' }] })).toBe('AB');
    expect(valoreCella({ result: 'R', formula: 'X' })).toBe('R');
    expect(valoreCella(null)).toBe('');
    expect(valoreCella(957)).toBe(957);
  });
});

describe('trovaHeader', () => {
  it('trova la riga intestazione che contiene tutte le colonne', () => {
    const sheet = ws([['x'], ['Ordine', 'Stato Operazione'], ['957', 'completato']]);
    const { riga, idx } = trovaHeader(sheet, ['Ordine', 'Stato Operazione']);
    expect(riga).toBe(2);
    expect(idx['Ordine']).toBe(0);
    expect(idx['Stato Operazione']).toBe(1);
  });
  it('riga=-1 se manca una colonna', () => {
    const sheet = ws([['Ordine', 'Altro']]);
    expect(trovaHeader(sheet, ['Ordine', 'Stato Operazione']).riga).toBe(-1);
  });
});

describe('estraiRigheExport', () => {
  it('estrae { ordine, stato } normalizzando l\'ODL e saltando le righe senza ordine', () => {
    const sheet = ws([
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
      [' 957289327 ', 'Ricevuto'],
      ['', 'Intervento Richiesto'],
    ]);
    const { righe, erroreColonne } = estraiRigheExport(sheet, { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' });
    expect(erroreColonne).toBe(false);
    expect(righe).toEqual([
      { ordine: '957276080', stato: 'completato' },
      { ordine: '957289327', stato: 'Ricevuto' },
    ]);
  });
  it('erroreColonne=true se le colonne non ci sono', () => {
    const sheet = ws([['Pippo', 'Pluto'], ['1', '2']]);
    expect(estraiRigheExport(sheet, { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' }).erroreColonne).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/parseExport.test.ts`
Expected: FAIL — `Cannot find module './parseExport.mjs'`.

- [ ] **Step 3: Implementa `parseExport.mjs`**

```js
// tools/limitazioni-sync/lib/acea/parseExport.mjs
// PURE (+ thin I/O): legge l'export ACEA → righe { ordine, stato }.
import ExcelJS from 'exceljs';
import { risolviColonna } from '../colonne.mjs';
import { norm } from '../match.mjs';

/** Testo da una cella exceljs (rich text / formula / hyperlink / data / scalare). */
export function valoreCella(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('result' in v) return v.result ?? '';
  }
  return v;
}

/** Riga intestazione (1-based, entro le prime 10) che contiene TUTTE le `nomi`. */
export function trovaHeader(ws, nomi) {
  const max = Math.min(10, ws.rowCount);
  for (let r = 1; r <= max; r++) {
    const header = (ws.getRow(r).values || []).slice(1).map((c) => {
      const t = valoreCella(c);
      return t == null ? '' : String(t);
    });
    const idx = {};
    let ok = true;
    for (const n of nomi) {
      const i = risolviColonna(header, n);
      if (i < 0) { ok = false; break; }
      idx[n] = i;
    }
    if (ok) return { riga: r, idx };
  }
  return { riga: -1, idx: {} };
}

/** Righe { ordine, stato } dal foglio export. */
export function estraiRigheExport(ws, { colonnaOdl, colonnaStato }) {
  const { riga, idx } = trovaHeader(ws, [colonnaOdl, colonnaStato]);
  if (riga < 0) return { righe: [], erroreColonne: true };
  const righe = [];
  for (let r = riga + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ordine = norm(valoreCella(row.getCell(idx[colonnaOdl] + 1).value));
    if (!ordine) continue;
    const stato = String(valoreCella(row.getCell(idx[colonnaStato] + 1).value) ?? '').trim();
    righe.push({ ordine, stato });
  }
  return { righe, erroreColonne: false };
}

/** Carica il file scaricato e ne estrae le righe. */
export async function parseExport(file, { foglio, colonnaOdl, colonnaStato }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = (foglio && wb.getWorksheet(foglio)) || wb.worksheets[0];
  return estraiRigheExport(ws, { colonnaOdl, colonnaStato });
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/parseExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/parseExport.mjs tools/limitazioni-sync/lib/acea/parseExport.test.ts
git commit -m "feat(acea): parsing export (Ordine + Stato Operazione)"
```

---

### Task 4: `aggiornaStato.mjs` — match per Ordine + scrittura Stato Operazione (TDD)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/aggiornaStato.mjs`
- Test: `tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts`

**Interfaces:**
- Consumes: `trovaHeader`, `valoreCella` (`./parseExport.mjs`), `norm` (`../match.mjs`).
- Produces: `aggiornaStato(ws, righeExport, { masterColonnaOdl, masterColonnaStato }) => { erroreColonne, aggiornate, invariate, nonAgganciate: string[], righe: RigaReport[] }` dove `RigaReport = { riga, odl, tipo:'acea-stato', comune, matricola, esecutore, esito, sigillo, data, note }` (stessa forma di `rigaReport` in `agente.mjs`, consumata da `righeModificate`).

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { aggiornaStato } from './aggiornaStato.mjs';

function master() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('PIANIFICAZIONE');
  ws.addRow(['Ordine', 'Stato Operazione', 'Esecutore']);
  ws.addRow([957276080, 'Intervento Richiesto', 'CIARALLO']);
  ws.addRow([957289327, 'Ricevuto', 'PRATESI']);
  ws.addRow([999999999, 'Intervento Richiesto', '']);
  return ws;
}

describe('aggiornaStato', () => {
  it('sovrascrive Stato Operazione per Ordine, traccia il precedente, non tocca le altre colonne', () => {
    const ws = master();
    const rep = aggiornaStato(ws, [
      { ordine: '957276080', stato: 'completato' },
      { ordine: '957289327', stato: 'Ricevuto' }, // invariata
      { ordine: '111', stato: 'completato' },       // non agganciata
    ], { masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    expect(rep.invariate).toBe(1);
    expect(rep.nonAgganciate).toEqual(['111']);
    expect(ws.getRow(2).getCell(2).value).toBe('completato');
    expect(ws.getRow(2).getCell(3).value).toBe('CIARALLO'); // Esecutore intatto
    expect(rep.righe[0]).toMatchObject({ riga: 2, odl: '957276080', esito: 'completato', note: 'era: Intervento Richiesto' });
  });

  it('erroreColonne=true se mancano le colonne', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('X');
    ws.addRow(['Pippo']);
    const rep = aggiornaStato(ws, [{ ordine: '1', stato: 'x' }], { masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });
    expect(rep.erroreColonne).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts`
Expected: FAIL — `Cannot find module './aggiornaStato.mjs'`.

- [ ] **Step 3: Implementa `aggiornaStato.mjs`**

```js
// tools/limitazioni-sync/lib/acea/aggiornaStato.mjs
// PURE: aggancia le righe del master per Ordine e SOVRASCRIVE Stato Operazione.
import { trovaHeader, valoreCella } from './parseExport.mjs';
import { norm } from '../match.mjs';

export function aggiornaStato(ws, righeExport, { masterColonnaOdl, masterColonnaStato }) {
  const { riga, idx } = trovaHeader(ws, [masterColonnaOdl, masterColonnaStato]);
  if (riga < 0) return { erroreColonne: true, aggiornate: 0, invariate: 0, nonAgganciate: [], righe: [] };
  const iOdl = idx[masterColonnaOdl];
  const iStato = idx[masterColonnaStato];

  const mappa = new Map();
  for (const r of righeExport) if (r.ordine) mappa.set(r.ordine, r.stato);

  const visti = new Set();
  let aggiornate = 0;
  let invariate = 0;
  const righe = [];

  for (let r = riga + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ordine = norm(valoreCella(row.getCell(iOdl + 1).value));
    if (!ordine || !mappa.has(ordine)) continue;
    visti.add(ordine);
    const nuovo = String(mappa.get(ordine) ?? '').trim();
    const cell = row.getCell(iStato + 1);
    const precedente = String(valoreCella(cell.value) ?? '').trim();
    if (precedente === nuovo) { invariate++; continue; }
    cell.value = nuovo === '' ? null : nuovo;
    aggiornate++;
    righe.push({
      riga: r, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
      esecutore: '', esito: nuovo, sigillo: '', data: '',
      note: precedente ? `era: ${precedente}` : '',
    });
  }

  const nonAgganciate = [...mappa.keys()].filter((o) => !visti.has(o));
  return { erroreColonne: false, aggiornate, invariate, nonAgganciate, righe };
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/aggiornaStato.mjs tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts
git commit -m "feat(acea): aggiorna Stato Operazione per Ordine (sovrascrivi-sempre)"
```

---

### Task 5: `driver.mjs` — driver Playwright generico (config-driven)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/driver.mjs`

**Interfaces:**
- Produces: `loginEdEsporta(acea, { stamp }) => Promise<string>` (percorso del file scaricato). I selettori arrivano TUTTI da `acea.login.*` e `acea.ricerca.*`. Nessun unit test (imperativo); validato dal Task 15.

- [ ] **Step 1: Implementa `driver.mjs`**

```js
// tools/limitazioni-sync/lib/acea/driver.mjs
// Imperativo: login ACEA + filtri fissi → Cerca → Esporta → scarica il file.
// Playwright caricato con import() dinamico: i tick normali non lo toccano.
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT = 60_000;

export async function loginEdEsporta(acea, { stamp = 'manual' } = {}) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(acea.download, { recursive: true });
  if (acea.debug) fs.mkdirSync(acea.debug, { recursive: true });

  const browser = await chromium.launch({ channel: acea.browser ?? 'msedge', headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    await page.goto(acea.loginUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.fill(acea.login.campoUser, acea.username);
    await page.fill(acea.login.campoPass, acea.password);
    await page.click(acea.login.bottoneLogin);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    for (const f of acea.ricerca.filtri ?? []) {
      if (f.tipo === 'select') await page.selectOption(f.selettore, f.valore);
      else await page.fill(f.selettore, String(f.valore));
    }
    await page.click(acea.ricerca.bottoneCerca);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.click(acea.ricerca.bottoneEsporta),
    ]);
    const dest = path.join(acea.download, `acea-${stamp}-${download.suggestedFilename()}`);
    await download.saveAs(dest);
    return dest;
  } catch (e) {
    if (acea.debug) {
      try { await page.screenshot({ path: path.join(acea.debug, `acea-errore-${stamp}.png`), fullPage: true }); } catch { /* best effort */ }
    }
    throw e;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Verifica sintassi (import risolvibile)**

Run: `node --check tools/limitazioni-sync/lib/acea/driver.mjs`
Expected: nessun output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/driver.mjs
git commit -m "feat(acea): driver Playwright login+filtri+cerca+esporta (config-driven)"
```

---

### Task 6: `eseguiGiroAcea.mjs` — orchestratore con driver iniettabile (TDD)

**Files:**
- Create: `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs`
- Test: `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`

**Interfaces:**
- Consumes: `caricaWorkbook`/`backupFile`/`salva` (`../excelIO.mjs`), `parseExport`, `aggiornaStato`, `acquisisci`/`rilascia` (`./lock.mjs`), `loginEdEsporta` (`./driver.mjs`).
- Produces: `eseguiGiroAcea({ cfg, stamp, driver?, nowMs? }) => Promise<Report>` con Report **compatibile con `riassumiReport`**: `{ tipo:'acea-stato', dryRun:false, lavori, file:[{file,master,aggiornate,extraAggiunte:0,conflitti:[],colonneAssenti:[],righe,saltato,errore}], extraNonCollocate:[{odl}], invariate?, erroreGlobale? }`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eseguiGiroAcea } from './eseguiGiroAcea.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-giro-'));
afterEach(() => { /* i file restano in tmp, ok per i test */ });

async function scriviXlsx(file: string, foglio: string, rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(foglio);
  rows.forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(file);
}

function cfg(masterPath: string) {
  return {
    acea: {
      masterPath, foglio: 'PIANIFICAZIONE',
      export: { foglio: null, colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione' },
      masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
    },
  };
}

describe('eseguiGiroAcea', () => {
  it('scarica (driver finto), aggiorna il master e ritorna un report compatibile', async () => {
    const masterPath = path.join(dir, 'master.xlsx');
    const exportPath = path.join(dir, 'export.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Esecutore'],
      [957276080, 'Intervento Richiesto', 'CIARALLO'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    const report = await eseguiGiroAcea({
      cfg: cfg(masterPath), stamp: '20260620-1000',
      driver: async () => exportPath, nowMs: 1000,
    });

    expect(report.tipo).toBe('acea-stato');
    expect(report.lavori).toBe(1);
    expect(report.file[0].aggiornate).toBe(1);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('CIARALLO');
  });

  it('se il lock è attivo, salta senza scrivere', async () => {
    const masterPath = path.join(dir, 'master2.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [['Ordine', 'Stato Operazione'], [1, 'x']]);
    fs.writeFileSync(path.join(dir, 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const report = await eseguiGiroAcea({ cfg: cfg(masterPath), stamp: 's', driver: async () => { throw new Error('non deve essere chiamato'); }, nowMs: 2000 });
    expect(report.saltato).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`
Expected: FAIL — `Cannot find module './eseguiGiroAcea.mjs'`.

- [ ] **Step 3: Implementa `eseguiGiroAcea.mjs`**

```js
// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs
// Orchestrazione: lock → driver(export) → parse → aggiorna master → backup/salva → report.
import path from 'node:path';
import { caricaWorkbook, backupFile, salva } from '../excelIO.mjs';
import { parseExport } from './parseExport.mjs';
import { aggiornaStato } from './aggiornaStato.mjs';
import { acquisisci, rilascia } from './lock.mjs';
import { loginEdEsporta } from './driver.mjs';

function reportBase(extra) {
  return { tipo: 'acea-stato', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], ...extra };
}

export async function eseguiGiroAcea({ cfg, stamp, driver = loginEdEsporta, nowMs = Date.now() }) {
  const a = cfg.acea;
  const lockPath = path.join(path.dirname(a.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).' });
  }
  try {
    const fileExport = await driver(a, { stamp });
    const { righe, erroreColonne } = await parseExport(fileExport, {
      foglio: a.export?.foglio, colonnaOdl: a.export.colonnaOdl, colonnaStato: a.export.colonnaStato,
    });
    if (erroreColonne) {
      return reportBase({ erroreGlobale: `Export: colonne "${a.export.colonnaOdl}"/"${a.export.colonnaStato}" non trovate.` });
    }

    const wb = await caricaWorkbook(a.masterPath);
    const ws = (a.foglio && wb.getWorksheet(a.foglio)) || wb.worksheets[0];
    const rep = aggiornaStato(ws, righe, { masterColonnaOdl: a.masterColonnaOdl, masterColonnaStato: a.masterColonnaStato });
    if (rep.erroreColonne) {
      return reportBase({ lavori: righe.length, erroreGlobale: `Master: colonne "${a.masterColonnaOdl}"/"${a.masterColonnaStato}" non trovate.` });
    }

    if (rep.aggiornate > 0) { backupFile(a.masterPath, stamp); await salva(wb, a.masterPath); }

    return reportBase({
      lavori: righe.length,
      file: [{
        file: path.basename(a.masterPath), master: true, aggiornate: rep.aggiornate,
        extraAggiunte: 0, conflitti: [], colonneAssenti: [], righe: rep.righe, saltato: false, errore: null,
      }],
      extraNonCollocate: rep.nonAgganciate.map((odl) => ({ odl })),
      invariate: rep.invariate,
    });
  } catch (e) {
    return reportBase({ erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts
git commit -m "feat(acea): orchestratore giro ACEA (lock+driver+parse+aggiorna+report)"
```

---

### Task 7: Aggancia il giro ACEA in `agente.mjs` → `main()`

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`

**Interfaces:**
- Consumes: `ris.aceaStato` dalla risposta del tick (Task 10); `inviaReport` (già importato); `scriviLog` (già definito).

- [ ] **Step 1: Inserisci il ramo ACEA prima del return anticipato di `eseguiOra`**

In `main()`, **subito dopo** il blocco `if (ris.pianificaData) { … }` e **prima** di `const { eseguiOra, … } = ris;`:

```js
  // Giro ACEA on-demand: indipendente da eseguiOra. Playwright caricato solo qui (import dinamico).
  if (ris.aceaStato) {
    const now = new Date();
    const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea';
    try {
      const { eseguiGiroAcea } = await import('./lib/acea/eseguiGiroAcea.mjs');
      const report = await eseguiGiroAcea({ cfg, stamp });
      try { scriviLog(cfg.cartella, stamp, report); } catch { /* best effort */ }
      await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
      console.log(`[lim-sync] giro ACEA: aggiornate=${report.file?.[0]?.aggiornate ?? 0} non-agganciate=${report.extraNonCollocate?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
    } catch (e) {
      console.error(`[lim-sync] giro ACEA fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
```

- [ ] **Step 2: Verifica sintassi**

Run: `node --check tools/limitazioni-sync/agente.mjs`
Expected: exit 0.

- [ ] **Step 3: Verifica che gli unit test dell'agente restino verdi**

Run: `npx vitest run tools/limitazioni-sync`
Expected: PASS (inclusi i nuovi `lib/acea/*`).

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(acea): aggancia il giro ACEA on-demand in main()"
```

---

### Task 8: Migration DB — `forza_acea_stato` + `agente_run.tipo`

**Files:**
- (DB) nessun file repo; SQL applicata via Supabase MCP `apply_migration` o consegnata all'utente.

- [ ] **Step 1: Applica la migration**

SQL:

```sql
alter table agente_config add column if not exists forza_acea_stato boolean not null default false;
alter table agente_run   add column if not exists tipo text not null default 'sync';
```

Applicazione: tool `apply_migration` (name: `acea_stato_flag_e_tipo`) **oppure** consegna all'utente che la lancia. Non scrivere SQL spontanea in chat se non richiesta.

- [ ] **Step 2: Verifica le colonne**

Esegui (MCP `execute_sql` o lato utente):

```sql
select column_name from information_schema.columns
where table_name in ('agente_config','agente_run')
  and column_name in ('forza_acea_stato','tipo');
```

Expected: due righe (`forza_acea_stato`, `tipo`).

- [ ] **Step 3: Nessun commit** (cambiamento solo DB; annota nel report di esecuzione).

---

### Task 9: Endpoint admin `POST /api/admin/agente/acea-stato`

**Files:**
- Create: `app/api/admin/agente/acea-stato/route.ts`

**Interfaces:**
- Produces: endpoint admin che setta `agente_config.forza_acea_stato = true`.

- [ ] **Step 1: Crea la route (gemella di `esegui-ora`)**

```ts
// app/api/admin/agente/acea-stato/route.ts
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
    .update({ forza_acea_stato: true, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck del file**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun NUOVO errore relativo a questo file (la baseline può avere errori pre-esistenti).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/agente/acea-stato/route.ts
git commit -m "feat(acea): endpoint admin acea-stato (alza forza_acea_stato)"
```

---

### Task 10: Tick — ritorna e consuma `aceaStato`

**Files:**
- Modify: `app/api/agente/tick/route.ts`

- [ ] **Step 1: Aggiungi `forza_acea_stato` al tipo `ConfigRow`**

Nel `type ConfigRow`, aggiungi:

```ts
  forza_acea_stato: boolean;
```

- [ ] **Step 2: Aggiungi la colonna alla SELECT**

Cambia la stringa `.select(...)` aggiungendo `forza_acea_stato`:

```ts
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno, forza_giro, forza_scan, pianifica_data, forza_acea_stato',
      )
```

- [ ] **Step 3: Calcola e consuma il flag (indipendente da `eseguiOra`)**

**Prima** del `return NextResponse.json(...)`, dopo il blocco `if (eseguiOra) { … }`:

```ts
    // Giro ACEA on-demand: flag one-shot, consumato qui (come forza_giro con eseguiOra).
    const aceaStato = config.forza_acea_stato === true;
    if (aceaStato) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_stato: false }).eq('id', 1);
    }
```

- [ ] **Step 4: Aggiungi `aceaStato` alla risposta JSON**

Nel corpo del `NextResponse.json({ … })`, accanto a `pianificaData`:

```ts
        aceaStato,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore su `tick/route.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/api/agente/tick/route.ts
git commit -m "feat(acea): tick ritorna e consuma aceaStato"
```

---

### Task 11: Report — accetta e registra `tipo`

**Files:**
- Modify: `lib/agente/decisione.ts`
- Modify: `app/api/agente/report/route.ts`

- [ ] **Step 1: Estendi il tipo `ReportAgente`**

In `lib/agente/decisione.ts`, nel `type ReportAgente`, aggiungi:

```ts
  tipo?: string;
```

- [ ] **Step 2: Leggi e inserisci `tipo` nella route report**

In `app/api/agente/report/route.ts`, dentro il `try`, prima dell'`insert`:

```ts
    const tipo = typeof body.tipo === 'string' ? body.tipo : 'sync';
```

E nell'oggetto `.insert({ … })` aggiungi:

```ts
      tipo,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore su `report/route.ts` o `decisione.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/agente/decisione.ts app/api/agente/report/route.ts
git commit -m "feat(acea): report registra il tipo del giro (sync|acea-stato)"
```

---

### Task 12: Tipi UI + pagina — passa `forzaAcea` e `tipo`

**Files:**
- Modify: `lib/agente/uiTypes.ts`
- Modify: `app/hub/agente/page.tsx`

- [ ] **Step 1: Aggiungi `tipo` a `AgenteRunRow`**

In `lib/agente/uiTypes.ts`, nel `type AgenteRunRow`, aggiungi:

```ts
  tipo?: string;
```

- [ ] **Step 2: Leggi il flag e passalo al client**

In `app/hub/agente/page.tsx`, accanto a `forzaScan`:

```ts
  const forzaAcea = (configRow as { forza_acea_stato?: boolean } | null)?.forza_acea_stato === true;
```

E nel JSX `<AgenteClient … />` aggiungi la prop:

```tsx
      forzaAcea={forzaAcea}
```

- [ ] **Step 3: Typecheck (fallirà finché AgenteClient non accetta la prop — atteso, fix al Task 13)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errore "Property 'forzaAcea' does not exist" su `page.tsx` → risolto al Task 13. (Non committare ancora se preferisci un build verde; altrimenti committa insieme al Task 13.)

- [ ] **Step 4: Commit (insieme al Task 13)** — vedi Task 13 Step 5.

---

### Task 13: Pulsante "Aggiorna stato ODL da ACEA" in `AgenteClient`

**Files:**
- Modify: `components/modules/agente/AgenteClient.tsx`

- [ ] **Step 1: Aggiungi `forzaAcea` alle props**

Nel `type AgenteClientProps`, aggiungi:

```ts
  forzaAcea: boolean;
```

E nella firma del componente:

```tsx
export default function AgenteClient({ config, runs, files, stato, minutiDaContatto, forzaGiro, forzaScan, forzaAcea }: AgenteClientProps) {
```

- [ ] **Step 2: Aggiungi stato + handler per il giro ACEA**

Dopo `const [armMsg, setArmMsg] = useState<string | null>(null);`:

```tsx
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);

  async function aggiornaStatoAcea() {
    setAceaArming(true); setAceaMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-stato', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setAceaMsg(res.ok ? 'Richiesta inviata: parte al prossimo contatto dell\'agente.' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setAceaArming(false);
    }
  }
```

- [ ] **Step 3: Aggiungi il pulsante nella card Stato (accanto a "Esegui ora")**

Nel blocco `<div className="mt-3 flex items-center gap-3">` che contiene "Esegui ora", aggiungi un secondo pulsante prima della chiusura del `</div>`:

```tsx
          <button
            type="button"
            onClick={aggiornaStatoAcea}
            disabled={aceaArming}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
            title="Playwright accede ad ACEA, esporta e aggiorna la colonna Stato Operazione nel master."
          >
            {aceaArming ? 'Invio…' : 'Aggiorna stato ODL da ACEA'}
          </button>
          {aceaMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{aceaMsg}</span>}
```

- [ ] **Step 4: Mostra "in attesa" anche per il giro ACEA**

Nella condizione del banner `{(forzaGiro || forzaScan) && (` cambiala in:

```tsx
      {(forzaGiro || forzaScan || forzaAcea) && (
```

E dentro il banner, dopo il blocco `{forzaScan && (…)}`, aggiungi:

```tsx
            {forzaAcea && (
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)' }}>
                stato ACEA
              </span>
            )}
```

- [ ] **Step 5: Build/typecheck e commit (con il Task 12)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore su `AgenteClient.tsx`/`page.tsx`/`uiTypes.ts`.

```bash
git add components/modules/agente/AgenteClient.tsx app/hub/agente/page.tsx lib/agente/uiTypes.ts
git commit -m "feat(acea): pulsante Aggiorna stato ODL da ACEA + stato in attesa"
```

---

### Task 14: Badge `tipo` nello Storico

**Files:**
- Modify: `components/modules/agente/StoricoCard.tsx`

- [ ] **Step 1: Mostra un badge "Stato ACEA" per i run di tipo `acea-stato`**

Dentro `<span className="flex items-center gap-2">`, **dopo** il badge `{badge.label}` e prima di `{run.errore && (…)}`:

```tsx
                  {run.tipo === 'acea-stato' && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
                    >
                      Stato ACEA
                    </span>
                  )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore su `StoricoCard.tsx` (il campo `tipo` esiste su `AgenteRunRow` dal Task 12).

- [ ] **Step 3: Commit**

```bash
git add components/modules/agente/StoricoCard.tsx
git commit -m "feat(acea): badge Stato ACEA nello storico giri"
```

---

### Task 15: Calibrazione selettori ACEA (con l'utente, su macchina che raggiunge ACEA)

**Files:**
- Modify (locale, non in git): `config.json` dell'agente sul PC del lavoro.

> Questo task richiede accesso reale ad ACEA → si fa **sul PC del lavoro** (o con l'utente presente). Non è codice: produce i valori `acea.login.*` e `acea.ricerca.*` nel `config.json`.

- [ ] **Step 1: Prerequisito — smoke-test browser superato**

Sul PC del lavoro: `node tools/limitazioni-sync/smoke-edge.mjs` → `OK - Edge headless funziona.` (se fallisce, ripiega su `npx playwright install chromium` e `"browser": "chromium"`).

- [ ] **Step 2: Registra il flusso e cattura i selettori**

Apri il registratore Playwright sul portale:

```bash
npx playwright codegen --channel msedge "https://<PORTALE-ACEA>/login"
```

Esegui a mano: login (utente/password) → imposta i filtri fissi → "Cerca" → "Esporta". Copia dai suggerimenti i selettori **stabili** (preferisci `getByLabel`/`getByRole`/`#id`, evita classi volatili) per: campo utente, campo password, bottone login, ciascun filtro, bottone Cerca, bottone Esporta.

- [ ] **Step 3: Riempi `config.json`**

Compila `acea.loginUrl`, `acea.username`, `acea.password`, `acea.login.{campoUser,campoPass,bottoneLogin}`, `acea.ricerca.filtri[]` (con `selettore`, `tipo`, `valore`), `acea.ricerca.{bottoneCerca,bottoneEsporta}`, `acea.download`, `acea.debug`, `acea.export.foglio` (se l'export non è il primo foglio). Verifica `acea.export.colonnaStato`/`colonnaOdl` aprendo il file scaricato (atteso `Ordine` + `Stato Operazione`).

- [ ] **Step 4: Prova il driver in isolamento (headed per vedere)**

Crea un test usa-e-getta `tools/limitazioni-sync/_prova-acea.mjs`:

```js
import fs from 'node:fs';
import { loginEdEsporta } from './lib/acea/driver.mjs';
const cfg = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const file = await loginEdEsporta(cfg.acea, { stamp: 'prova' });
console.log('Scaricato:', file);
```

Run: `node tools/limitazioni-sync/_prova-acea.mjs`
Expected: stampa il percorso del file scaricato; il file esiste in `acea.download`. Se fallisce, guarda lo screenshot in `acea.debug` e correggi i selettori. Poi elimina `_prova-acea.mjs`.

- [ ] **Step 5: Nessun commit** (config locale). Annota nel report di esecuzione i selettori scelti.

---

### Task 16: Dry-run end-to-end su copia + passaggio a reale

**Files:**
- (operativo) copia del master + UI `/hub/agente`.

- [ ] **Step 1: Punta a una COPIA del master**

Copia `LIMITAZIONI CON ORDINE.xlsx` in una cartella di prova e imposta temporaneamente `acea.masterPath` su quella copia.

- [ ] **Step 2: Avvia il giro dall'app**

In `/hub/agente` clicca **"Aggiorna stato ODL da ACEA"**. Attendi il prossimo tick dell'agente (porta l'attività pianificata a 1–2 min se vuoi reattività).

- [ ] **Step 3: Verifica**

- Lo storico in `/hub/agente` mostra un giro con badge **Stato ACEA**, conteggi `lavori`/`aggiornate` coerenti, 0 errori.
- Nella copia del master: la colonna `Stato Operazione` è rinfrescata per gli `Ordine` presenti; `Data`/`Esecutore`/`NOTE` invariati; esiste un backup in `_backup/`.

- [ ] **Step 4: Passa al master reale**

Rimetti `acea.masterPath` sul file vero in `DUNNING/2026`. Rilancia dall'app e ricontrolla lo storico + il file.

- [ ] **Step 5: Nessun commit** (operativo). Fine Fase 1.

---

## Note di chiusura

- **Fase 2** (Playwright che *scrive* le assegnazioni su ACEA + import `Data`/`Esecutore` via Assegnazione AI, con il gotcha matricola `Matricola misuratore`) ha spec/piano propri — vedi `docs/superpowers/specs/2026-06-19-connettore-playwright-acea-design.md` §10.
- Dopo il merge della Fase 1: ricopia l'agente sul PC del lavoro tramite il canale Drive/robocopy, ed esegui `npm install` nella cartella agente per portare `playwright` nel `node_modules` del PC.
