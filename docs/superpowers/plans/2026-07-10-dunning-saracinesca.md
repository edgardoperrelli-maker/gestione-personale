# Popola colonna "Saracinesca" nel master DUNNING Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far scrivere all'agente "SI" nella colonna "Saracinesca" del master DUNNING ("LIMITAZIONI CON ORDINE.xlsx"), per ogni Ordine per cui il nostro DB registra una saracinesca sostituita — indipendentemente dal cambio di Stato Operazione in quel giro.

**Architecture:** Nuovo endpoint app (`GET /api/export/acea-saracinesche`) aggrega `odl→SI` da TUTTO lo storico DB (nessun filtro tipo/data). L'agente lo interroga best-effort SOLO per il target `dunning`, costruisce una mappa e la passa alla scrittura chirurgica XLSX esistente (`aggiornaStatoXlsx`), che ora scrive anche la colonna Saracinesca (riempi-vuote + conflitto-safe) e compone il marcatore "Automazione" senza perdere i tag già scritti in giri precedenti.

**Tech Stack:** Next.js route handler + Supabase (`supabaseAdmin`), Node.js agente (`.mjs`, ESM), Vitest, ExcelJS/JSZip per la manipolazione xlsx.

## Global Constraints

- Copertura dati: TUTTI gli interventi `stato='completato'` con `odl` e saracinesca valorizzati — NESSUN filtro su `intervento_tipo`/`committente`, NESSUNA finestra data (spec: 196 interventi `acea` completati con saracinesca SI, di cui 23 con tipo diverso da limitazione/massiva — vanno coperti tutti).
- Chiave di aggancio: SOLO Ordine (non Ordine+Matricola).
- Colonna master DUNNING: nome esatto `"Saracinesca"`.
- Righe target: TUTTE le righe master con quell'Ordine, indipendentemente dal cambio di Stato Operazione nel giro corrente.
- Marcatore Automazione: le righe toccate SOLO per la saracinesca devono comunque integrare "Automazione" con il tag `Saracinesca` (mai lasciarla invariata, mai perdere i tag già presenti).
- Fetch saracinesche: SEMPRE best-effort — un suo fallimento non deve mai bloccare o alterare la scrittura dello Stato Operazione.
- Conflitto (cella Saracinesca già valorizzata con un valore DIVERSO): mai sovrascritta, riportata.
- File automazione ACEA BLINDATI (`aggiornaStatoXlsx.mjs`, `eseguiGiroAcea.mjs`): il lavoro va fatto in worktree isolato → PR, non commit diretti su main.

---

## Task 1: Aggregazione pura `aggregaSaracinescaPerOdl`

**Files:**
- Create: `lib/limitazione/aceaSaracinesche.ts`
- Test: `lib/limitazione/aceaSaracinesche.test.ts`

**Interfaces:**
- Consumes: `valoreSaracinesca(sostituzioneValvola: unknown, sostValvola: unknown): string` da `lib/limitazione/exportLimMassive.ts` (già esistente e testata — normalizza booleano→"SI", scarta path-foto).
- Produces: `aggregaSaracinescaPerOdl(righe: RigaSaracinescaDb[]): RigaSaracinescaOdl[]` e i tipi `RigaSaracinescaDb`, `RigaSaracinescaOdl` — usati da Task 2 (route).

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/limitazione/aceaSaracinesche.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from './aceaSaracinesche';

describe('aggregaSaracinescaPerOdl', () => {
  it('SI (booleano) → l\'ODL entra nel risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '957276080', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('SI (stringa) → l\'ODL entra nel risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '957276080', sostituzione_valvola: 'SI', sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('dedup: due righe sullo stesso odl, una SI e una vuota → SI vince, un solo risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '111', sostituzione_valvola: null, sost_valvola: null },
      { odl: '111', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '111', saracinesca: 'SI' }]);
  });

  it('valore diverso da SI (es. "NO" o testo libero) → l\'odl NON entra', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '222', sostituzione_valvola: 'NO', sost_valvola: null },
      { odl: '333', sostituzione_valvola: 'inserimento valvola', sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('percorso foto (path/link) → scartato, l\'odl NON entra', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '444', sostituzione_valvola: null, sost_valvola: 'rapportini/abc/x.jpg' },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('odl vuoto o null → riga ignorata anche se saracinesca SI', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: null, sostituzione_valvola: true, sost_valvola: null },
      { odl: '  ', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('odl trimmato nell\'output', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '  957276080  ', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('array vuoto → risultato vuoto', () => {
    expect(aggregaSaracinescaPerOdl([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/limitazione/aceaSaracinesche.test.ts`
Expected: FAIL — `Cannot find module './aceaSaracinesche'` (il file sorgente non esiste ancora).

- [ ] **Step 3: Scrivi l'implementazione minima**

Crea `lib/limitazione/aceaSaracinesche.ts`:

```typescript
import { valoreSaracinesca } from './exportLimMassive';

const t = (v: string | null | undefined): string => String(v ?? '').trim();

/** Riga grezza per l'aggregazione: un intervento completato con odl + le due chiavi possibili
 *  della saracinesca dal rapportino (stesse due chiavi di lib/limitazione/exportLimMassive.ts). */
export type RigaSaracinescaDb = {
  odl: string | null;
  sostituzione_valvola: unknown;
  sost_valvola: unknown;
};

/** Riga di output: un ODL per cui il DB registra una saracinesca sostituita. */
export type RigaSaracinescaOdl = {
  odl: string;
  saracinesca: 'SI';
};

/**
 * Aggrega le righe DB per ODL: un ODL entra nel risultato se ALMENO UN intervento completato su
 * quell'ODL ha la saracinesca sostituita (valore letterale "SI", case-insensitive). Dedup per odl
 * (un odl con più righe, anche miste, compare una sola volta se almeno una è SI). Righe con odl
 * vuoto, o la cui saracinesca non è "SI" (vuota, "NO", testo libero, path-foto), vengono scartate.
 */
export function aggregaSaracinescaPerOdl(righe: RigaSaracinescaDb[]): RigaSaracinescaOdl[] {
  const odlConSaracinesca = new Set<string>();
  for (const r of righe) {
    const odl = t(r.odl);
    if (!odl) continue;
    const sar = valoreSaracinesca(r.sostituzione_valvola, r.sost_valvola);
    if (sar.toUpperCase() === 'SI') odlConSaracinesca.add(odl);
  }
  return [...odlConSaracinesca].map((odl) => ({ odl, saracinesca: 'SI' as const }));
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run lib/limitazione/aceaSaracinesche.test.ts`
Expected: PASS (8 test)

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/aceaSaracinesche.ts lib/limitazione/aceaSaracinesche.test.ts
git commit -m "feat(acea): aggrega saracinesca per ODL da tutto lo storico DB"
```

---

## Task 2: Endpoint `GET /api/export/acea-saracinesche`

**Files:**
- Create: `app/api/export/acea-saracinesche/route.ts`

**Interfaces:**
- Consumes: `aggregaSaracinescaPerOdl` e i tipi da Task 1 (`@/lib/limitazione/aceaSaracinesche`); `chiaveValida(req: Request): boolean` da `@/lib/apiExportKey`; `supabaseAdmin` da `@/lib/supabaseAdmin`.
- Produces: risposta HTTP `{ count: number, righe: { odl: string, saracinesca: 'SI' }[] }` — consumata da Task 3 (`fetchSaracinesche`).

Non esiste un file di test dedicato per le altre route export di questo repo (es. `app/api/export/limitazioni-massive/route.ts` non ne ha): la correttezza della route è coperta dal test della funzione pura (Task 1); la verifica di questa route è manuale (Step 3).

- [ ] **Step 1: Scrivi la route**

Crea `app/api/export/acea-saracinesche/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from '@/lib/limitazione/aceaSaracinesche';

export const runtime = 'nodejs';

type InterventoRow = {
  id: string;
  odl: string | null;
};

/**
 * Storico completo (nessun filtro su committente/intervento_tipo, nessuna finestra data): serve a
 * coprire anche gli ODL ACEA con saracinesca sostituita su tipi diversi da "limitazione/massiva"
 * (es. Sospensione fornitura, Rimozione misuratore per morosità), che l'export lim-massive esclude.
 */
export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  try {
    // 1) interventi completati con odl valorizzato
    const PAGE = 1000;
    const interventi: InterventoRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .eq('stato', 'completato')
        .not('odl', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as InterventoRow[];
      interventi.push(...rows);
      if (rows.length < PAGE) break;
    }

    // 2) valori saracinesca da rapportino_voci (stesse due chiavi di lim-massive)
    const odlById = new Map(interventi.map((i) => [i.id, i.odl]));
    const IN_CHUNK = 200;
    const ids = interventi.map((i) => i.id);
    const righeDb: RigaSaracinescaDb[] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { data: voci, error } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', chunk);
      if (error) throw error;
      for (const v of (voci ?? []) as Array<{
        intervento_id: string | null;
        risposte: Record<string, unknown> | null;
      }>) {
        if (!v.intervento_id) continue;
        righeDb.push({
          odl: odlById.get(v.intervento_id) ?? null,
          sostituzione_valvola: v.risposte?.['sostituzione_valvola'],
          sost_valvola: v.risposte?.['sost_valvola'],
        });
      }
    }

    // 3) aggrega (funzione pura testata)
    const righe = aggregaSaracinescaPerOdl(righeDb);

    return NextResponse.json(
      { count: righe.length, righe },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore riferito a `app/api/export/acea-saracinesche/route.ts` o `lib/limitazione/aceaSaracinesche.ts`.

- [ ] **Step 3: Verifica manuale locale (dev server)**

Run: `npm run dev` (in un terminale separato, lascialo in background), poi in un altro terminale:

```bash
curl -s -H "x-export-key: $LIM_MASSIVE_EXPORT_KEY" http://localhost:3000/api/export/acea-saracinesche | head -c 500
```

Expected: JSON `{"count":<N>,"righe":[{"odl":"...","saracinesca":"SI"}, ...]}` con `count` vicino a 196 (verificato via SQL nella spec — il numero esatto può differire leggermente per nuovi interventi completati nel frattempo). Senza header → `401 {"error":"Chiave non valida."}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/export/acea-saracinesche/route.ts
git commit -m "feat(acea): endpoint export saracinesca per ODL (storico completo)"
```

---

## Task 3: Client agente `fetchSaracinesche`

**Files:**
- Modify: `tools/limitazioni-sync/lib/apiAgente.mjs` (aggiungi in fondo al file, dopo `fetchAceaAssegnazioni`)
- Modify: `tools/limitazioni-sync/lib/apiAgente.test.ts` (aggiungi un nuovo blocco `describe`)

**Interfaces:**
- Consumes: nessuna dipendenza da altri task (fetch semplice, come `fetchAceaAssegnazioni`).
- Produces: `fetchSaracinesche({ baseUrl: string, exportKey: string }, fetchImpl?: typeof fetch): Promise<{ odl: string, saracinesca: string }[]>` — usata da Task 5 (`eseguiGiroAcea.mjs`). Lancia (throw) su risposta non-ok o payload inatteso — la gestione best-effort (catch) è responsabilità del chiamante (Task 5), non di questa funzione (stesso pattern di `fetchLavori`/`fetchAceaAssegnazioni`, che lanciano entrambe).

- [ ] **Step 1: Scrivi il test che fallisce**

In `tools/limitazioni-sync/lib/apiAgente.test.ts`, aggiungi in fondo al file (dopo il blocco `describe('inviaReport', ...)`):

```typescript
import { fetchSaracinesche } from './apiAgente.mjs';
```

(aggiungi `fetchSaracinesche` all'import esistente in cima al file, riga 3: `import { baseUrlDaEndpoint, tick, inviaReport, fetchSaracinesche } from './apiAgente.mjs';` — NON serve un secondo import separato, usa questo).

Poi aggiungi in fondo al file:

```typescript
describe('fetchSaracinesche', () => {
  it('GET /api/export/acea-saracinesche con header chiave → righe', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 1, righe: [{ odl: '957276080', saracinesca: 'SI' }] }),
    }));
    const righe = await fetchSaracinesche(
      { baseUrl: 'https://app.vercel.app', exportKey: 'K' },
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/export/acea-saracinesche');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(righe).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('risposta non ok → throw con status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'errore' }));
    await expect(
      fetchSaracinesche({ baseUrl: 'https://x', exportKey: 'K' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/500/);
  });

  it('risposta senza array righe → throw', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ count: 0 }) }));
    await expect(
      fetchSaracinesche({ baseUrl: 'https://x', exportKey: 'K' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/righe/);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: FAIL — `fetchSaracinesche` non è esportata da `apiAgente.mjs`.

- [ ] **Step 3: Implementa**

In `tools/limitazioni-sync/lib/apiAgente.mjs`, aggiungi in fondo al file (dopo `fetchAceaAssegnazioni`, riga 62):

```javascript

/** GET /api/export/acea-saracinesche → righe [{odl, saracinesca}] (header x-export-key). Lancia
 *  su errore: la gestione best-effort (il giro ACEA non deve mai bloccarsi per questo) è del
 *  chiamante, non di questa funzione — stesso pattern di fetchLavori/fetchAceaAssegnazioni. */
export async function fetchSaracinesche({ baseUrl, exportKey }, fetchImpl = fetch) {
  const url = `${baseUrl}/api/export/acea-saracinesche`;
  const res = await fetchImpl(url, { headers: { 'x-export-key': exportKey } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`GET ${url} ${res.status}: ${corpo}`);
  }
  const json = await res.json();
  if (!Array.isArray(json.righe)) {
    throw new Error(`Risposta endpoint inattesa (manca 'righe'): ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.righe;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: PASS (tutti i test del file, inclusi i 3 nuovi)

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/apiAgente.mjs tools/limitazioni-sync/lib/apiAgente.test.ts
git commit -m "feat(acea): client agente per l'endpoint saracinesche"
```

---

## Task 4: `aggiornaStatoXlsx` — scrive la colonna Saracinesca + compone Automazione

**Files:**
- Modify: `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs`
- Modify: `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task (funzione pura su xlsx, riceve `saracinescaMap` già costruita — la costruzione è compito di Task 5).
- Produces: `aggiornaStatoXlsx(masterPath, righeExport, { foglio, masterColonnaOdl, masterColonnaStato, masterColonnaAutomazione, masterColonnaSaracinesca, saracinescaMap, daChiedere, backup })` con return esteso: `{ erroreColonne, aggiornate, invariate, daChiedere, saracinescaScritte, conflitti, nonAgganciate, righe }`. I due nuovi campi `saracinescaScritte: number` e `conflitti: {riga, odl, campo, esistente, nuovo}[]` sono usati da Task 5.

Questo file è **BLINDATO** (automazione ACEA): le modifiche vanno fatte con consapevolezza, senza toccare la logica esistente dello Stato Operazione/DA CHIEDERE oltre a quanto descritto qui.

- [ ] **Step 1: Scrivi i test che fallisce**

In `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`, aggiungi in fondo al file (dopo l'ultimo test, prima della chiusura `});` del `describe('aggiornaStatoXlsx', ...)`  — quindi PRIMA della riga finale `});` a riga 225):

```typescript
  // --- SARACINESCA (dal nostro DB): riempi-vuote, indipendente dallo stato, integra Automazione ---
  it('saracinesca: riempie la cella vuota per ODL agganciato, indipendentemente dal cambio stato', async () => {
    const file = path.join(dir, 'saracinesca-riempi.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '']); // stato NON cambia in questo giro
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file,
      [{ ordine: '957276080', stato: 'Ricevuto' }], // stato invariato
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(1);
    expect(rep.aggiornate).toBe(0); // lo stato NON è cambiato
    expect(rep.invariate).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI');
  });

  it('saracinesca: cella già "SI" → salta senza riscrivere (idempotente)', async () => {
    const file = path.join(dir, 'saracinesca-idempotente.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'SI']);
    await wb.xlsx.writeFile(file);
    const prima = fs.readFileSync(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(0);
    expect(rep.conflitti).toEqual([]);
    expect(fs.readFileSync(file).equals(prima)).toBe(true);
  });

  it('saracinesca: cella con valore DIVERSO già presente → conflitto, mai sovrascritta', async () => {
    const file = path.join(dir, 'saracinesca-conflitto.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'NO']); // compilato a mano diversamente
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(0);
    expect(rep.conflitti).toEqual([{ riga: 2, odl: '957276080', campo: 'saracinesca', esistente: 'NO', nuovo: 'SI' }]);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('NO'); // NON sovrascritta
  });

  it('saracinesca + stato cambiano sulla STESSA riga: entrambe scritte, Automazione compone i due tag', async () => {
    const file = path.join(dir, 'saracinesca-e-stato.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Automazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '', '']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'completato' }], // stato CAMBIA
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaAutomazione: 'Automazione', masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.aggiornate).toBe(1);
    expect(rep.saracinescaScritte).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    const w = chk.getWorksheet('PIANIFICAZIONE')!;
    expect(w.getRow(2).getCell(2).value).toBe('completato');
    expect(w.getRow(2).getCell(3).value).toBe('SI + Stato Operazione + Saracinesca');
    expect(w.getRow(2).getCell(4).value).toBe('SI');
    // report.righe: una SOLA riga (tipo acea-stato), non una entry duplicata per la saracinesca
    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0].tipo).toBe('acea-stato');
  });

  it('saracinesca: integra il tag "Saracinesca" senza perdere un tag "Stato Operazione" già scritto in un giro precedente', async () => {
    const file = path.join(dir, 'saracinesca-integra.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Automazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', 'SI + Stato Operazione', '']); // già marcata da un giro precedente
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }], // stato invariato in QUESTO giro
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaAutomazione: 'Automazione', masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.saracinescaScritte).toBe(1);
    const chk = new ExcelJS.Workbook();
    await chk.xlsx.readFile(file);
    expect(chk.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI + Stato Operazione + Saracinesca');
  });

  it('saracinesca: colonna assente dal master → soft-skip, nessun errore, lo stato si aggiorna comunque', async () => {
    const file = path.join(dir, 'saracinesca-assente.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione']); // NESSUNA colonna Saracinesca
    ws.addRow([957276080, 'Ricevuto']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'completato' }],
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    expect(rep.saracinescaScritte).toBe(0);
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`
Expected: FAIL sui 6 nuovi test — `rep.saracinescaScritte` è `undefined`, la colonna Saracinesca non viene scritta.

- [ ] **Step 3: Implementa**

Sostituisci in `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs` il blocco da `/**\n * Aggiorna in modo chirurgico masterPath...` (riga 132) fino alla fine del file (riga 239) con:

```javascript
/** Compone il marcatore Automazione aggiungendo i tag mancanti, senza duplicarli né perdere quelli
 *  già presenti da giri precedenti. Es.: '' + ['Stato Operazione'] → 'SI + Stato Operazione';
 *  'SI + Stato Operazione' + ['Saracinesca'] → 'SI + Stato Operazione + Saracinesca'; se un tag è
 *  già presente resta invariato (idempotente, niente doppioni). */
function componiAutomazione(valoreEsistente, tagsDaAggiungere) {
  const pulisci = (s) => String(s ?? '').trim();
  const esistenti = pulisci(valoreEsistente)
    .split('+')
    .map(pulisci)
    .filter((s) => s && s !== 'SI');
  for (const tag of tagsDaAggiungere) {
    const t = pulisci(tag);
    if (t && !esistenti.includes(t)) esistenti.push(t);
  }
  return ['SI', ...esistenti].join(' + ');
}

/**
 * Aggiorna in modo chirurgico masterPath: per ogni ODL agganciato che cambia, scrive lo
 * Stato Operazione e (se masterColonnaAutomazione è data) il marcatore "SI + <colonna>".
 * Se masterColonnaSaracinesca + saracinescaMap sono dati, scrive anche "SI" nella colonna
 * Saracinesca per OGNI riga con un Ordine presente in saracinescaMap — indipendentemente dal
 * cambio di Stato Operazione in questo giro (riempi-vuote: mai sovrascrive un valore diverso già
 * presente, lo segnala come conflitto).
 * @returns {Promise<{erroreColonne:boolean, aggiornate:number, invariate:number, daChiedere:number,
 *   saracinescaScritte:number, conflitti:object[], nonAgganciate:string[], righe:object[]}>}
 */
export async function aggiornaStatoXlsx(masterPath, righeExport, {
  foglio, masterColonnaOdl, masterColonnaStato, masterColonnaAutomazione,
  masterColonnaSaracinesca, saracinescaMap, daChiedere, backup,
}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(masterPath));

  // 1) risolvi il foglio → sheetN.xml
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetEl = (wb.match(new RegExp(`<sheet[^>]*name="${foglio}"[^>]*/>`)) || [])[0];
  if (!sheetEl) throw new Error(`Foglio "${foglio}" non trovato nel master.`);
  const rid = (sheetEl.match(/r:id="([^"]+)"/) || [])[1];
  const target = (rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
  const sheetPath = 'xl/' + String(target).replace(/^\/?xl\//, '').replace(/^\/?/, '');
  let sheet = await zip.file(sheetPath).async('string');

  const ssFile = zip.file('xl/sharedStrings.xml');
  const ss = ssFile ? parseSharedStrings(await ssFile.async('string')) : [];

  // 2) riga di intestazione rilevata in modo dinamico (la prima, entro le prime righe, che contiene
  //    sia la colonna Ordine sia la colonna Stato) → poi le lettere colonna da QUELLA riga.
  const { riga: rigaHeader, xml: headerRow } = trovaRigaHeader(
    sheet, ss, [masterColonnaOdl, masterColonnaStato].filter(Boolean),
  );
  const colOdl = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaOdl, ss, rigaHeader) : null;
  const colStato = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaStato, ss, rigaHeader) : null;
  const colAutomazione = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaAutomazione, ss, rigaHeader) : null; // opzionale
  const colSaracinesca = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaSaracinesca, ss, rigaHeader) : null; // opzionale
  if (!colOdl || !colStato) {
    return { erroreColonne: true, aggiornate: 0, invariate: 0, nonAgganciate: [], righe: [] };
  }

  // 3) indice export per ODL. L'export è a livello OPERAZIONE: lo stesso Ordine può comparire su più
  //    righe → a parità di Ordine si tiene lo stato più avanzato (deterministico, niente "ultimo vince").
  const mappa = new Map();
  for (const r of righeExport) {
    if (!r.ordine) continue;
    const prev = mappa.get(r.ordine);
    mappa.set(r.ordine, prev === undefined ? r.stato : statoPiuAvanzato(prev, r.stato));
  }

  // 4) scorri le righe dati, raccogli le sostituzioni
  const visti = new Set();
  let aggiornate = 0;
  let invariate = 0;
  let daChiedereScritte = 0;
  let saracinescaScritte = 0;
  const righe = [];
  const conflitti = [];
  const sostituzioni = [];
  const sAttrDi = (cella) => (cella ? ((cella.attrs.match(/\bs="[^"]*"/) || [''])[0]) : '');
  for (const rm of sheet.matchAll(/<row r="(\d+)"[\s\S]*?<\/row>/g)) {
    const n = +rm[1];
    if (n <= rigaHeader) continue; // salta riga-titolo + intestazione
    const ordine = norm(valoreCella(trovaCella(rm[0], `${colOdl}${n}`), ss));
    if (!ordine) continue;
    const statoCell = trovaCella(rm[0], `${colStato}${n}`);
    const precedente = String(valoreCella(statoCell, ss)).trim();

    const tagsAutomazione = [];
    let toccataStato = false;

    if (mappa.has(ordine)) {
      visti.add(ordine);
      const nuovo = String(mappa.get(ordine) ?? '').trim();
      if (precedente === nuovo) {
        invariate++;
      } else {
        sostituzioni.push({ ref: `${colStato}${n}`, vecchia: statoCell ? statoCell.full : null, nuova: cellaInline(`${colStato}${n}`, sAttrDi(statoCell), nuovo), riga: n });
        tagsAutomazione.push(masterColonnaStato);
        toccataStato = true;
        aggiornate++;
        righe.push({
          riga: n, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
          esecutore: '', esito: nuovo, sigillo: '', data: '', note: precedente ? `era: ${precedente}` : '',
        });
      }
    } else if (daChiedere && precedente === '') {
      // ODL non presente nell'export (aggiunto a mano) + stato vuoto → "DA CHIEDERE"
      sostituzioni.push({ ref: `${colStato}${n}`, vecchia: statoCell ? statoCell.full : null, nuova: cellaInline(`${colStato}${n}`, sAttrDi(statoCell), 'DA CHIEDERE'), riga: n });
      daChiedereScritte++;
      righe.push({
        riga: n, odl: ordine, tipo: 'da-chiedere', comune: '', matricola: '',
        esecutore: '', esito: 'DA CHIEDERE', sigillo: '', data: '', note: '',
      });
    }

    // Saracinesca (dal nostro DB): indipendente dal cambio di stato in questo giro. Riempi-vuote,
    // mai sovrascrive un valore diverso già presente (protegge un dato compilato a mano).
    let toccataSaracinesca = false;
    if (colSaracinesca && saracinescaMap && saracinescaMap.has(ordine)) {
      const saraCell = trovaCella(rm[0], `${colSaracinesca}${n}`);
      const precedenteSara = String(valoreCella(saraCell, ss)).trim();
      const nuovoSara = String(saracinescaMap.get(ordine) ?? '').trim();
      if (precedenteSara === '') {
        sostituzioni.push({ ref: `${colSaracinesca}${n}`, vecchia: saraCell ? saraCell.full : null, nuova: cellaInline(`${colSaracinesca}${n}`, sAttrDi(saraCell), nuovoSara), riga: n });
        tagsAutomazione.push('Saracinesca');
        toccataSaracinesca = true;
        saracinescaScritte++;
      } else if (precedenteSara !== nuovoSara) {
        conflitti.push({ riga: n, odl: ordine, campo: 'saracinesca', esistente: precedenteSara, nuovo: nuovoSara });
      }
    }

    // marcatore Automazione: integra i tag di ciò che è stato scritto su QUESTA riga in questo giro,
    // senza mai perdere i tag già presenti da giri precedenti (componiAutomazione legge la cella).
    if (colAutomazione && tagsAutomazione.length > 0) {
      const autoCell = trovaCella(rm[0], `${colAutomazione}${n}`);
      const valoreEsistente = String(valoreCella(autoCell, ss)).trim();
      const nuovoAuto = componiAutomazione(valoreEsistente, tagsAutomazione);
      if (nuovoAuto !== valoreEsistente) {
        sostituzioni.push({ ref: `${colAutomazione}${n}`, vecchia: autoCell ? autoCell.full : null, nuova: cellaInline(`${colAutomazione}${n}`, sAttrDi(autoCell), nuovoAuto), riga: n });
      }
    }

    if (toccataSaracinesca && !toccataStato) {
      righe.push({
        riga: n, odl: ordine, tipo: 'acea-saracinesca', comune: '', matricola: '',
        esecutore: '', esito: '', sigillo: '', data: '', note: '',
      });
    }
  }

  const nonAgganciate = [...mappa.keys()].filter((o) => !visti.has(o));

  // 5) nessuna modifica → non toccare il file (niente write, niente backup)
  if (sostituzioni.length === 0) {
    return { erroreColonne: false, aggiornate: 0, invariate, daChiedere: 0, saracinescaScritte: 0, conflitti, nonAgganciate, righe: [] };
  }

  // 6) applica le sostituzioni sul testo del foglio (ref unici → replace sicuro; insert in ordine)
  for (const s of sostituzioni) {
    if (s.vecchia) {
      sheet = sheet.replace(s.vecchia, s.nuova);
    } else {
      sheet = sheet.replace(new RegExp(`<row r="${s.riga}"[\\s\\S]*?</row>`), (rowXml) => inserisciInOrdine(rowXml, s.ref, s.nuova));
    }
  }

  // 7) backup (se fornito) POI riscrivi SOLO il foglio modificato; tutto il resto resta invariato
  zip.file(sheetPath, sheet);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (typeof backup === 'function') backup();
  fs.writeFileSync(masterPath, outBuf);

  return { erroreColonne: false, aggiornate, invariate, daChiedere: daChiedereScritte, saracinescaScritte, conflitti, nonAgganciate, righe };
}
```

- [ ] **Step 4: Esegui TUTTI i test del file e verifica che passino**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`
Expected: PASS — sia i test preesistenti (invariati nel comportamento) sia i 6 nuovi.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts
git commit -m "feat(acea): scrivi colonna Saracinesca nel master + componi marcatore Automazione"
```

---

## Task 5: `eseguiGiroAcea` — recupera la saracinesca (best-effort, solo DUNNING) e la passa alla scrittura

**Files:**
- Modify: `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs`
- Modify: `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`

**Interfaces:**
- Consumes: `fetchSaracinesche` da Task 3 (`../apiAgente.mjs`); `aggiornaStatoXlsx` con i nuovi parametri/ritorni da Task 4; `norm` da `../match.mjs` (già esistente).
- Produces: `eseguiGiroAcea({ cfg, stamp, target, driver, nowMs, baseUrl, exportKey, fetchSaracinesche })` — il report ritornato include ora `saracinescaScritte: number` e `file[0].conflitti` popolato (prima sempre `[]`). Usato da Task 6 (`agente.mjs`).

- [ ] **Step 1: Scrivi i test che falliscono**

In `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`, aggiungi in fondo al file, PRIMA dell'ultima riga `});` di chiusura del `describe('eseguiGiroAcea', ...)` (riga 86):

```typescript
  it('DUNNING: scrive la Saracinesca dal nostro DB (best-effort, indipendente dallo stato)', async () => {
    const masterPath = path.join(dir, 'master_sara.xlsx');
    const exportPath = path.join(dir, 'export_sara.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Ricevuto', ''], // stato invariato in questo giro, ma la saracinesca va scritta
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'Ricevuto'],
    ]);

    const fetchSaracinesche = async () => [{ odl: '957276080', saracinesca: 'SI' }];
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 1000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(report.saracinescaScritte).toBe(1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(3).value).toBe('SI');
  });

  it('DUNNING: fetch saracinesche fallito → best-effort, il giro stato completa comunque', async () => {
    const masterPath = path.join(dir, 'master_sara_err.xlsx');
    const exportPath = path.join(dir, 'export_sara_err.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Intervento Richiesto', ''],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    const fetchSaracinesche = async () => { throw new Error('rete giù'); };
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 1000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(report.erroreGlobale).toBeUndefined();
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.saracinescaScritte).toBe(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(masterPath);
    expect(wb.getWorksheet('PIANIFICAZIONE')!.getRow(2).getCell(2).value).toBe('completato');
  });

  it('target zagarolo: NON chiama fetchSaracinesche (la saracinesca di ZAGAROLO arriva dal giro cartella)', async () => {
    const masterPath = path.join(dir, 'master_zag.xlsx');
    const exportPath = path.join(dir, 'export_zag.xlsx');
    await scriviXlsx(masterPath, 'Foglio1', [
      ['ORDINE', 'stato odl'],
      [957276080, 'Ricevuto'],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    let chiamato = false;
    const fetchSaracinesche = async () => { chiamato = true; return []; };
    const cfgZag = cfg(masterPath);
    cfgZag.acea.zagarolo = {
      masterPath, foglio: 'Foglio1', masterColonnaOdl: 'ORDINE', masterColonnaStato: 'stato odl',
      masterColonnaSaracinesca: 'saracinesca',
    };
    await eseguiGiroAcea({
      cfg: cfgZag, target: 'zagarolo', stamp: 's', driver: async () => exportPath, nowMs: 1000,
      baseUrl: 'https://app.vercel.app', exportKey: 'K', fetchSaracinesche,
    });

    expect(chiamato).toBe(false);
  });

  it('senza baseUrl/exportKey (main() non li passa ancora) → NON chiama fetchSaracinesche, nessun errore', async () => {
    const masterPath = path.join(dir, 'master_nobase.xlsx');
    const exportPath = path.join(dir, 'export_nobase.xlsx');
    await scriviXlsx(masterPath, 'PIANIFICAZIONE', [
      ['Ordine', 'Stato Operazione', 'Saracinesca'],
      [957276080, 'Ricevuto', ''],
    ]);
    await scriviXlsx(exportPath, 'Esportazione SAPUI5', [
      ['Ordine', 'Stato Operazione'],
      [957276080, 'completato'],
    ]);

    let chiamato = false;
    const fetchSaracinesche = async () => { chiamato = true; return []; };
    const cfgConSara = cfg(masterPath);
    cfgConSara.acea.masterColonnaSaracinesca = 'Saracinesca';
    const report = await eseguiGiroAcea({
      cfg: cfgConSara, stamp: 's', driver: async () => exportPath, nowMs: 1000, fetchSaracinesche,
    });

    expect(chiamato).toBe(false);
    expect(report.file[0].aggiornate).toBe(1);
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`
Expected: FAIL sui 4 nuovi test — `report.saracinescaScritte` è `undefined`, `chiamato` resta `false` quando dovrebbe essere `true` nel primo test.

- [ ] **Step 3: Implementa**

Sostituisci l'intero contenuto di `tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs` con:

```javascript
// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs
// Orchestrazione: lock → driver(export) → parse → aggiorna master (chirurgico) → report.
import path from 'node:path';
import { backupFile } from '../excelIO.mjs';
import { norm } from '../match.mjs';
import { parseExport } from './parseExport.mjs';
import { aggiornaStatoXlsx } from './aggiornaStatoXlsx.mjs';
import { acquisisci, rilascia } from './lock.mjs';
import { loginEdEsporta } from './driver.mjs';
import { fetchSaracinesche as fetchSaracinescheDefault } from '../apiAgente.mjs';

function reportBase(extra) {
  return { tipo: 'acea-stato', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], ...extra };
}

/** Mappa odl(norm)→'SI' dalle righe dell'endpoint saracinesche. Best-effort: qualunque errore
 *  ritorna null (nessuna scrittura saracinesca in questo giro; lo Stato Operazione non è toccato). */
async function caricaSaracinescaMap({ baseUrl, exportKey, fetchSaracinesche }) {
  try {
    const righe = await fetchSaracinesche({ baseUrl, exportKey });
    const m = new Map();
    for (const r of righe) {
      const odl = norm(r.odl);
      if (odl) m.set(odl, String(r.saracinesca ?? '').trim() || 'SI');
    }
    return m;
  } catch (e) {
    console.error(`[lim-sync] fetchSaracinesche fallito (best-effort): ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function eseguiGiroAcea({
  cfg, stamp, target = 'dunning', driver = loginEdEsporta, nowMs = Date.now(),
  baseUrl, exportKey, fetchSaracinesche = fetchSaracinescheDefault,
}) {
  const acea = cfg.acea;
  // target 'zagarolo' = override masterPath/foglio/colonne + regola DA CHIEDERE.
  // login/ricerca/export/download restano CONDIVISI (stesso download per entrambi i target).
  const a = (target === 'zagarolo' && acea.zagarolo) ? { ...acea, ...acea.zagarolo } : acea;
  const lockPath = path.join(path.dirname(a.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).' });
  }
  try {
    const fileExport = await driver(a, { stamp });
    const { righe, erroreColonne } = await parseExport(fileExport, {
      foglio: a.export?.foglio, colonnaOdl: a.export.colonnaOdl, colonnaStato: a.export.colonnaStato,
      colonnaOperatore: a.export?.colonnaOperatore, colonnaOperatoreNome: a.export?.colonnaOperatoreNome,
      // Causa di scostamento ACEA (per il SAL "pagato": solo causali E). Default sul nome standard
      // dell'export; se la colonna manca, parseExport degrada morbido (causale '').
      colonnaCausale: a.export?.colonnaCausale ?? 'Causa dello scostamento',
    });
    if (erroreColonne) {
      return reportBase({ erroreGlobale: `Export: colonne "${a.export.colonnaOdl}"/"${a.export.colonnaStato}" non trovate.` });
    }

    // Pre-marcatura proattiva: assegnatario CORRENTE per-ODL dall'export (se è configurata la colonna
    // operatore). L'app la usa per pre-segnare gli ODL già assegnati alla risorsa giusta prima del giro
    // di assegnazione. Dedup per ODL (primo vince); solo righe con un assegnatario valorizzato.
    const preMap = new Map();
    for (const r of righe) {
      const odl = String(r.ordine ?? '').trim();
      const ass = String(r.operatore ?? '').trim();
      if (odl && ass && !preMap.has(odl)) preMap.set(odl, ass);
    }
    const preassegnati = [...preMap.entries()].map(([odl, assegnatario]) => ({ odl, assegnatario }));

    // Snapshot PORTALE per la Produzione economica (SAL/audit): foto corrente ODL→stato dall'intero
    // export ACEA (non solo le righe cambiate). L'app la ingerisce in acea_portale_snapshot.
    const portaleSnapshot = righe
      .filter((r) => String(r.ordine ?? '').trim())
      .map((r) => ({
        odl: String(r.ordine).trim(),
        stato: String(r.stato ?? ''),
        operatore: String(r.operatore ?? '').trim() || undefined,
        causa: String(r.causale ?? '').trim() || undefined,
      }));

    // Saracinesca (dal nostro DB, non dal Cruscotto): SOLO per il DUNNING e solo se la colonna è
    // configurata e l'app ha fornito baseUrl/exportKey. Best-effort: un fetch fallito non deve mai
    // bloccare la scrittura dello Stato Operazione.
    const saracinescaMap = (target === 'dunning' && a.masterColonnaSaracinesca && baseUrl && exportKey)
      ? await caricaSaracinescaMap({ baseUrl, exportKey, fetchSaracinesche })
      : null;

    // Scrittura CHIRURGICA: tocca solo le celle di Stato Operazione/Saracinesca/Automazione (preserva
    // AutoFiltro, formattazione, ordine righe, altri fogli). Backup solo se ci sono modifiche da scrivere.
    const rep = await aggiornaStatoXlsx(a.masterPath, righe, {
      foglio: a.foglio,
      masterColonnaOdl: a.masterColonnaOdl,
      masterColonnaStato: a.masterColonnaStato,
      masterColonnaAutomazione: a.masterColonnaAutomazione,
      masterColonnaSaracinesca: a.masterColonnaSaracinesca,
      saracinescaMap,
      daChiedere: a.daChiedereSeVuoto === true,
      backup: () => backupFile(a.masterPath, stamp),
    });
    if (rep.erroreColonne) {
      return reportBase({ lavori: righe.length, erroreGlobale: `Master: colonne "${a.masterColonnaOdl}"/"${a.masterColonnaStato}" non trovate.` });
    }

    return reportBase({
      target,
      lavori: righe.length,
      file: [{
        file: path.basename(a.masterPath), master: true, aggiornate: rep.aggiornate,
        extraAggiunte: 0, conflitti: rep.conflitti ?? [], colonneAssenti: [], righe: rep.righe, saltato: false, errore: null,
      }],
      extraNonCollocate: rep.nonAgganciate.map((odl) => ({ odl })),
      invariate: rep.invariate,
      daChiedere: rep.daChiedere ?? 0,
      saracinescaScritte: rep.saracinescaScritte ?? 0,
      preassegnati,
      portaleSnapshot,
    });
  } catch (e) {
    return reportBase({ erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
```

- [ ] **Step 4: Esegui TUTTI i test del file e verifica che passino**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts`
Expected: PASS — sia i 3 test preesistenti sia i 4 nuovi.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts
git commit -m "feat(acea): recupera la saracinesca dal DB (best-effort) per il giro DUNNING"
```

---

## Task 6: Wiring `agente.mjs` — passa `baseUrl`/`exportKey` al giro ACEA

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs:566`

**Interfaces:**
- Consumes: `eseguiGiroAcea` con i nuovi parametri opzionali `baseUrl`/`exportKey` da Task 5.
- Produces: nessuna nuova interfaccia (wiring interno all'entrypoint `main()`).

`main()` non ha test dedicati in questo repo (è l'entrypoint CLI, guardato da `if (process.argv[1] === ...)`) — `agente.test.ts` esiste ma testa solo `eseguiGiro` (il giro cartella), non `main()`. La verifica di questo task è una lettura del diff (Step 2), non un test automatico.

- [ ] **Step 1: Modifica la chiamata**

In `tools/limitazioni-sync/agente.mjs`, riga 566, `baseUrl` è già in scope (definito riga 514: `const baseUrl = baseUrlDaEndpoint(cfg.endpointUrl);`). Sostituisci:

```javascript
      const report = await eseguiGiroAcea({ cfg, stamp, target: aceaTarget });
```

con:

```javascript
      const report = await eseguiGiroAcea({ cfg, stamp, target: aceaTarget, baseUrl, exportKey: cfg.exportKey });
```

- [ ] **Step 2: Verifica il diff**

Run: `git diff tools/limitazioni-sync/agente.mjs`
Expected: una sola riga modificata (566), nessun altro cambiamento. Conferma che `baseUrl` e `cfg.exportKey` sono già usati identicamente poche righe sopra (riga 568: `await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });`) — stesso pattern, nessun nuovo import necessario.

- [ ] **Step 3: Esegui la suite completa del pacchetto agente per assicurarti di non aver rotto nulla**

Run: `npx vitest run tools/limitazioni-sync`
Expected: PASS su tutti i file (incluso `agente.test.ts`, che non tocca `main()` e quindi non è impattato).

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "fix(acea): passa baseUrl/exportKey al giro ACEA (serve al fetch saracinesche)"
```

---

## Task 7: Config — colonna Saracinesca per il DUNNING

**Files:**
- Modify: `tools/limitazioni-sync/config.example.json:24-31`

**Interfaces:**
- Consumes: nessuna.
- Produces: chiave `acea.masterColonnaSaracinesca` letta da `eseguiGiroAcea.mjs` (Task 5) tramite `a.masterColonnaSaracinesca`.

Il `config.json` REALE (`tools/limitazioni-sync/config.json`) è gitignored e vive solo su questo PC — NON viene toccato da questo task (lo aggiorna Claude manualmente dopo il merge, vedi "Dopo il merge" in fondo al piano). Questo task tocca solo il template committato.

- [ ] **Step 1: Aggiungi la chiave al template**

In `tools/limitazioni-sync/config.example.json`, dopo la riga 31 (`"masterColonnaAttivita": "Operazione testo breve",`), aggiungi:

```json
    "masterColonnaSaracinesca": "Saracinesca",
```

Il blocco risultante (righe 23-32) deve leggere:

```json
    "masterColonnaOdl": "Ordine",
    "masterColonnaStato": "Stato Operazione",
    "masterColonnaAutomazione": "Automazione",
    "masterColonnaEsecutore": "Esecutore",
    "masterColonnaData": "Data",
    "masterColonnaMatricola": "Matricola misuratore",
    "masterColonnaIndirizzo": "INDIRIZZO",
    "masterColonnaComune": "Località",
    "masterColonnaAttivita": "Operazione testo breve",
    "masterColonnaSaracinesca": "Saracinesca",
```

- [ ] **Step 2: Verifica che il JSON sia valido**

Run: `node -e "JSON.parse(require('fs').readFileSync('tools/limitazioni-sync/config.example.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add tools/limitazioni-sync/config.example.json
git commit -m "docs(acea): documenta masterColonnaSaracinesca nel template di config"
```

---

## Task 8: Verifica finale (suite completa + typecheck + lint)

**Files:** nessuna modifica — solo verifica.

**Interfaces:** nessuna.

- [ ] **Step 1: Suite di test completa**

Run: `npx vitest run`
Expected: PASS su tutti i file (nessuna regressione fuori dai file toccati nei task precedenti).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Lint sui file toccati**

Run: `npx eslint app/api/export/acea-saracinesche/route.ts lib/limitazione/aceaSaracinesche.ts lib/limitazione/aceaSaracinesche.test.ts tools/limitazioni-sync/lib/apiAgente.mjs tools/limitazioni-sync/lib/apiAgente.test.ts tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs tools/limitazioni-sync/lib/acea/eseguiGiroAcea.test.ts tools/limitazioni-sync/agente.mjs`
Expected: nessun nuovo errore (la baseline lint del repo è nota essere rossa altrove — vedi promemoria progetto — ma questi file specifici devono uscire puliti).

- [ ] **Step 4: Riepilogo per la PR**

Non è un comando — prepara mentalmente/per iscritto un elenco di cosa la PR contiene, da usare nella descrizione:
- Nuovo endpoint `GET /api/export/acea-saracinesche` (storico completo, no filtro tipo/data).
- Agente: nuovo client `fetchSaracinesche`, wiring in `eseguiGiroAcea` (solo target `dunning`, best-effort).
- `aggiornaStatoXlsx`: scrive la colonna Saracinesca (riempi-vuote + conflitto-safe) e compone il marcatore Automazione senza perdere i tag precedenti.
- Config template aggiornato con `masterColonnaSaracinesca`.
- Nessuna modifica al flusso ZAGAROLO/lim-massive (verificato dal test "target zagarolo: NON chiama fetchSaracinesche").

---

## Dopo il merge (manuale, fuori da questo piano — lo esegue Claude su questo PC)

Questi passi NON sono task del piano (toccano stato esterno al repo: file gitignored, processo agente live) e vanno eseguiti dopo che la PR è mergiata su `main`:

1. `git pull` nel repo principale su questo PC (l'agente gira da qui, non dai worktree).
2. Aggiungere `"masterColonnaSaracinesca": "Saracinesca"` al blocco `acea` di `tools/limitazioni-sync/config.json` (il file reale, non il template).
3. Riavviare l'agente (il driver/giro ACEA è tenuto in cache dal motore ES — modifiche a questi file richiedono un riavvio per essere caricate, come da promemoria progetto).
4. Il nuovo endpoint `/api/export/acea-saracinesche` va live su Vercel automaticamente al merge (deploy automatico) — nessuna azione manuale lato app.
