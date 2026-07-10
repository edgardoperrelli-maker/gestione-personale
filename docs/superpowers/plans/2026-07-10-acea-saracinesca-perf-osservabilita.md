# Ottimizzazione query + osservabilità sync Saracinesca DUNNING Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far scalare il costo di `GET /api/export/acea-saracinesche` con quanti record hanno la saracinesca valorizzata (non con tutto lo storico completato), e rendere visibile quando la scrittura saracinesca del giro DUNNING funziona/smette di funzionare.

**Architecture:** Inversione dell'ordine di query nell'endpoint (parte da `rapportino_voci` filtrata sulle due chiavi saracinesca, poi risale a `interventi` solo per quegli id) + tre fix di osservabilità indipendenti (campo `saracinesca` sulle righe del report, log agente, timeout esplicito sul fetch best-effort).

**Tech Stack:** Next.js route handler + Supabase (`supabaseAdmin`), Node.js agente (`.mjs`, ESM), Vitest.

## Global Constraints

- Copertura dati INVARIATA: nessun filtro su `committente`/`intervento_tipo`, nessuna finestra data — l'ottimizzazione cambia SOLO come viene costruita la query, non cosa viene incluso nel risultato finale.
- Nessuna modifica alla funzione pura `aggregaSaracinescaPerOdl` (`lib/limitazione/aceaSaracinesche.ts`) — resta la stessa, già testata.
- Sintassi Supabase per filtri su colonna JSON: `.not('risposte->>chiave', 'is', null)` — pattern già verificato in uso in questo repo (`app/api/admin/interventi-manuali/[id]/approva/route.ts:58-59`).
- Il fetch saracinesche resta SEMPRE best-effort: nessun cambiamento in questo piano deve far sì che un suo fallimento (timeout incluso) blocchi la scrittura dello Stato Operazione.
- Nessuna migration DB: nessuna nuova colonna, nessuna nuova tabella.

---

## Task 1: Endpoint — query guidata da `rapportino_voci`

**Files:**
- Modify: `app/api/export/acea-saracinesche/route.ts` (riscrittura completa del corpo di `GET`)

**Interfaces:**
- Consumes: `aggregaSaracinescaPerOdl` e `RigaSaracinescaDb` da `@/lib/limitazione/aceaSaracinesche` (INVARIATI, nessuna modifica alla loro firma).
- Produces: stessa risposta HTTP di prima — `{ count: number, righe: { odl: string, saracinesca: 'SI' }[] }` — nessun cambiamento di contratto per Task 3 (`fetchSaracinesche`), che continua a funzionare senza modifiche.

Non esiste un file di test dedicato per questa route (stessa convenzione già seguita in PR #73 per questo stesso file — verificato: nessuna route export in questo repo ha un test dedicato). La verifica è tramite lettura statica + confronto con `app/api/admin/interventi-manuali/[id]/approva/route.ts` per la sintassi del filtro JSON.

- [ ] **Step 1: Riscrivi la route**

Sostituisci l'INTERO contenuto di `app/api/export/acea-saracinesche/route.ts` con:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from '@/lib/limitazione/aceaSaracinesche';

export const runtime = 'nodejs';

type VoceRow = {
  intervento_id: string | null;
  risposte: Record<string, unknown> | null;
};

type InterventoRow = {
  id: string;
  odl: string | null;
};

/** Pagina tutte le righe di rapportino_voci la cui `risposte->>chiave` è valorizzata. */
async function leggiVociConChiave(chiave: 'sostituzione_valvola' | 'sost_valvola'): Promise<VoceRow[]> {
  const PAGE = 1000;
  const out: VoceRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id, risposte')
      .not(`risposte->>${chiave}`, 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as VoceRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Storico completo (nessun filtro su committente/intervento_tipo, nessuna finestra data): serve a
 * coprire anche gli ODL ACEA con saracinesca sostituita su tipi diversi da "limitazione/massiva"
 * (es. Sospensione fornitura, Rimozione misuratore per morosità), che l'export lim-massive esclude.
 *
 * Query GUIDATA da rapportino_voci (non da interventi): il costo scala con quanti rapportino_voci
 * hanno le chiavi saracinesca valorizzate (poche centinaia), non con TUTTO lo storico completato
 * (potenzialmente decine di migliaia) — evita di avvicinarsi al timeout della function.
 */
export async function GET(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  try {
    // 1) rapportino_voci con ALMENO una delle due chiavi saracinesca valorizzata (due query
    //    separate: evita di introdurre una sintassi .or() composita senza precedenti nel repo).
    const [vociA, vociB] = await Promise.all([
      leggiVociConChiave('sostituzione_valvola'),
      leggiVociConChiave('sost_valvola'),
    ]);
    const voci = [...vociA, ...vociB];

    // 2) odl dei soli interventi COMPLETATI toccati sopra — query piccola: scala col numero di voci
    //    con saracinesca valorizzata, non con lo storico intero.
    const idsUnici = [...new Set(voci.map((v) => v.intervento_id).filter((id): id is string => !!id))];
    const odlById = new Map<string, string | null>();
    const IN_CHUNK = 200;
    for (let i = 0; i < idsUnici.length; i += IN_CHUNK) {
      const chunk = idsUnici.slice(i, i + IN_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .eq('stato', 'completato')
        .not('odl', 'is', null)
        .in('id', chunk);
      if (error) throw error;
      for (const row of (data ?? []) as InterventoRow[]) odlById.set(row.id, row.odl);
    }

    // 3) mappa alla shape attesa dalla funzione pura di aggregazione, escludendo le voci di
    //    interventi non completati/senza odl (assenti da odlById).
    const righeDb: RigaSaracinescaDb[] = [];
    for (const v of voci) {
      if (!v.intervento_id) continue;
      const odl = odlById.get(v.intervento_id);
      if (odl === undefined) continue;
      righeDb.push({
        odl,
        sostituzione_valvola: v.risposte?.['sostituzione_valvola'],
        sost_valvola: v.risposte?.['sost_valvola'],
      });
    }

    // 4) aggrega (funzione pura testata — INVARIATA)
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
Expected: nessun errore riferito a `app/api/export/acea-saracinesche/route.ts`.

- [ ] **Step 3: Lint**

Run: `npx eslint app/api/export/acea-saracinesche/route.ts`
Expected: nessun errore.

- [ ] **Step 4: Verifica statica per confronto**

Leggi `app/api/admin/interventi-manuali/[id]/approva/route.ts` (righe 55-59) e conferma che il
pattern `.not('col','is',null)` su colonna piatta e `.ilike('risposte->>sigillo', val)` su colonna
JSON sono lo stesso meccanismo di filtro (colonna passata come stringa) usato da
`leggiVociConChiave` in questo file — nessuna sintassi nuova introdotta. Annota nel report che
questo confronto è stato fatto (nessun comando da eseguire, è una verifica di lettura).

- [ ] **Step 5: Commit**

```bash
git add app/api/export/acea-saracinesche/route.ts
git commit -m "perf(acea): query saracinesche guidata da rapportino_voci, non dallo storico intero"
```

---

## Task 2: `aggiornaStatoXlsx` — valorizza il campo `saracinesca` nelle righe del report

**Files:**
- Modify: `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs`
- Modify: `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task.
- Produces: gli oggetti in `rep.righe` con `tipo: 'acea-stato'` o `tipo: 'acea-saracinesca'` guadagnano
  un campo `saracinesca: 'SI'` quando la saracinesca è stata scritta su quella riga in questo giro.
  Nessun altro campo del return object cambia. `lib/agente/storicoExport.ts` già legge
  `ro.saracinesca` (nessuna modifica lì necessaria — il campo, quando presente, verrà già raccolto).

Questo file è automazione ACEA in produzione (non nella lista `guard-acea.mjs`, ma scrittura
chirurgica su un Excel reale) — segui il brief alla lettera, non introdurre variazioni oltre a
quanto descritto qui.

- [ ] **Step 1: Scrivi i test che falliscono**

In `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`, aggiungi in fondo al file, PRIMA
della chiusura finale `});` del `describe('aggiornaStatoXlsx', ...)`:

```typescript
  it('righe: riga acea-saracinesca (solo saracinesca, stato invariato) valorizza il campo saracinesca', async () => {
    const file = path.join(dir, 'righe-saracinesca-sola.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'Ricevuto' }], // stato invariato
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0].tipo).toBe('acea-saracinesca');
    expect(rep.righe[0].saracinesca).toBe('SI');
  });

  it('righe: riga acea-stato con saracinesca insieme valorizza ANCHE il campo saracinesca sulla stessa riga', async () => {
    const file = path.join(dir, 'righe-saracinesca-e-stato.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PIANIFICAZIONE');
    ws.addRow(['Ordine', 'Stato Operazione', 'Saracinesca']);
    ws.addRow([957276080, 'Ricevuto', '']);
    await wb.xlsx.writeFile(file);

    const saracinescaMap = new Map([['957276080', 'SI']]);
    const rep = await aggiornaStatoXlsx(
      file, [{ ordine: '957276080', stato: 'completato' }], // stato CAMBIA
      {
        foglio: 'PIANIFICAZIONE', masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione',
        masterColonnaSaracinesca: 'Saracinesca', saracinescaMap,
      },
    );

    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0].tipo).toBe('acea-stato');
    expect(rep.righe[0].saracinesca).toBe('SI');
  });
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`
Expected: FAIL sui 2 nuovi test — `rep.righe[0].saracinesca` è `undefined`.

- [ ] **Step 3: Implementa**

In `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs`, sostituisci il blocco del loop
principale (dalla riga che inizia con `const tagsAutomazione = [];` fino alla chiusura del `for`
che contiene `if (toccataSaracinesca && !toccataStato) { ... }`) con:

```javascript
    const tagsAutomazione = [];
    let toccataStato = false;
    let rigaStatoRef = null;

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
        rigaStatoRef = {
          riga: n, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
          esecutore: '', esito: nuovo, sigillo: '', data: '', note: precedente ? `era: ${precedente}` : '',
        };
        righe.push(rigaStatoRef);
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

    // Riporta la saracinesca scritta nello storico (righe): sulla riga 'acea-stato' se già presente,
    // altrimenti come riga dedicata 'acea-saracinesca' — così il run-export e il log dell'agente
    // mostrano quando la scrittura saracinesca è avvenuta (prima il campo restava sempre vuoto).
    if (toccataSaracinesca) {
      if (rigaStatoRef) {
        rigaStatoRef.saracinesca = 'SI';
      } else {
        righe.push({
          riga: n, odl: ordine, tipo: 'acea-saracinesca', comune: '', matricola: '',
          esecutore: '', esito: '', sigillo: '', data: '', note: '', saracinesca: 'SI',
        });
      }
    }
  }
```

**Attenzione**: questo blocco sostituisce il codice a partire da `const tagsAutomazione = [];`
fino alla riga `}` che chiude il `for (const rm of sheet.matchAll(...))` — verifica che il resto
del file (righe successive: calcolo `nonAgganciate`, il return "nessuna modifica", l'applicazione
delle sostituzioni, il return finale) resti IDENTICO e non venga toccato.

- [ ] **Step 4: Esegui TUTTI i test del file e verifica che passino**

Run: `npx vitest run tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`
Expected: PASS — tutti i test preesistenti (16, incluso il fix della PR #73) PIÙ i 2 nuovi (18
totali). Se un test preesistente si rompe, fermati e riporta BLOCKED: significa una divergenza
dal codice fornito qui, non modificare i test preesistenti per farli passare.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts
git commit -m "feat(acea): valorizza il campo saracinesca nelle righe del report"
```

---

## Task 3: `fetchSaracinesche` — timeout esplicito

**Files:**
- Modify: `tools/limitazioni-sync/lib/apiAgente.mjs`
- Modify: `tools/limitazioni-sync/lib/apiAgente.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task.
- Produces: `fetchSaracinesche({ baseUrl, exportKey, timeoutMs? }, fetchImpl?)` — nuovo parametro
  opzionale `timeoutMs` (default `20000`), retrocompatibile (chi non lo passa ottiene il default).
  Il comportamento di successo/errore-HTTP/payload-malformato resta INVARIATO; si aggiunge solo il
  caso di timeout (nuovo errore con messaggio `"GET <url> timeout dopo <ms>ms"`). Nessuna modifica
  alla firma consumata da `eseguiGiroAcea.mjs` (che non passa `timeoutMs`, userà il default).

- [ ] **Step 1: Scrivi il test che fallisce**

In `tools/limitazioni-sync/lib/apiAgente.test.ts`, aggiungi in fondo al `describe('fetchSaracinesche', ...)` esistente (PRIMA della sua chiusura `});`):

```typescript
  it('timeout: fetch che non risponde entro timeoutMs → throw con messaggio chiaro', async () => {
    const fetchImpl = vi.fn((_url: string, opts: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    await expect(
      fetchSaracinesche(
        { baseUrl: 'https://x', exportKey: 'K', timeoutMs: 20 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/timeout dopo 20ms/);
  });
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: FAIL — il nuovo test timeout non trova il comportamento atteso (oggi `fetchSaracinesche`
non passa `signal` a `fetchImpl`, quindi la promise del mock non si risolve mai e il test va in
timeout di vitest stesso, non con l'errore atteso).

- [ ] **Step 3: Implementa**

In `tools/limitazioni-sync/lib/apiAgente.mjs`, sostituisci la funzione `fetchSaracinesche`
(l'ultima funzione del file) con:

```javascript
/** GET /api/export/acea-saracinesche → righe [{odl, saracinesca}] (header x-export-key). Lancia
 *  su errore (incluso timeout): la gestione best-effort (il giro ACEA non deve mai bloccarsi per
 *  questo) è del chiamante, non di questa funzione — stesso pattern di fetchLavori/fetchAceaAssegnazioni.
 *  `timeoutMs` (default 20s) limita quanto il giro può restare in attesa di un endpoint lento. */
export async function fetchSaracinesche({ baseUrl, exportKey, timeoutMs = 20000 }, fetchImpl = fetch) {
  const url = `${baseUrl}/api/export/acea-saracinesche`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { headers: { 'x-export-key': exportKey }, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`GET ${url} timeout dopo ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

- [ ] **Step 4: Esegui TUTTI i test del file e verifica che passino**

Run: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts`
Expected: PASS — i test preesistenti di `fetchSaracinesche` (incluso quello che verifica
`opts.headers['x-export-key']`, che continua a passare dato che ora `opts` ha anche `signal` ma il
test verifica solo la property `headers`) PIÙ il nuovo test timeout.

- [ ] **Step 5: Commit**

```bash
git add tools/limitazioni-sync/lib/apiAgente.mjs tools/limitazioni-sync/lib/apiAgente.test.ts
git commit -m "feat(acea): timeout esplicito sul fetch best-effort delle saracinesche"
```

---

## Task 4: `agente.mjs` — log del giro ACEA include `saracinescaScritte`

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs:569`

**Interfaces:**
- Consumes: `report.saracinescaScritte` (già presente nel report ritornato da `eseguiGiroAcea`,
  PR #73 — nessuna modifica a `eseguiGiroAcea.mjs` in questo task).
- Produces: nessuna nuova interfaccia (solo testo del log).

`main()` non ha test dedicati in questo repo (entrypoint CLI) — la verifica è tramite lettura del
diff, come già fatto per la modifica equivalente nella PR #73 (Task 6 di quel piano).

- [ ] **Step 1: Modifica la riga di log**

In `tools/limitazioni-sync/agente.mjs`, riga 569, sostituisci:

```javascript
      console.log(`[lim-sync] giro ACEA (${aceaTarget}): aggiornate=${report.file?.[0]?.aggiornate ?? 0} da-chiedere=${report.daChiedere ?? 0} non-agganciate=${report.extraNonCollocate?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
```

con:

```javascript
      console.log(`[lim-sync] giro ACEA (${aceaTarget}): aggiornate=${report.file?.[0]?.aggiornate ?? 0} saracinesca=${report.saracinescaScritte ?? 0} da-chiedere=${report.daChiedere ?? 0} non-agganciate=${report.extraNonCollocate?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
```

- [ ] **Step 2: Verifica il diff**

Run: `git diff tools/limitazioni-sync/agente.mjs`
Expected: una sola riga modificata (569), nessun altro cambiamento.

- [ ] **Step 3: Esegui la suite completa del pacchetto agente**

Run: `npx vitest run tools/limitazioni-sync`
Expected: PASS su tutti i file (nessun test tocca `main()`, quindi nessun impatto atteso).

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs
git commit -m "feat(acea): log del giro ACEA mostra quante saracinesche sono state scritte"
```

---

## Task 5: Verifica finale (suite completa + typecheck + lint)

**Files:** nessuna modifica — solo verifica.

- [ ] **Step 1: Suite di test completa**

Run: `npx vitest run`
Expected: PASS su tutti i file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Lint sui file toccati**

Run: `npx eslint app/api/export/acea-saracinesche/route.ts tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts tools/limitazioni-sync/lib/apiAgente.mjs tools/limitazioni-sync/lib/apiAgente.test.ts tools/limitazioni-sync/agente.mjs`
Expected: nessun errore.

---

## Dopo il merge (manuale, fuori da questo piano)

1. `git pull` nel repo principale su questo PC (l'agente gira da lì).
2. Riavviare l'agente (i file `.mjs` toccati sono importati dall'agente, servono ricaricati).
3. Nessuna modifica al `config.json` (nessun nuovo parametro introdotto).
4. Il nuovo comportamento della query va live su Vercel automaticamente al merge.
