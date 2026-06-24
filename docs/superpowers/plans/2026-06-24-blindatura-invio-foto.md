# Blindatura invio foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantire che le foto degli interventi manuali non vengano mai perse: nessun POST concorrente può cancellare i file di un altro, e il telefono trattiene i blob finché la durabilità non è confermata.

**Architecture:** Due fasi. Fase 1 (server) rende `storage_path` unico per-tentativo, trasforma il conflitto PK in risposta idempotente e usa una verifica di esistenza byte-aware → ogni rollback rimuove solo i propri file. Fase 2 (client + approvazione) introduce il campo `durabile` e il rilascio differito dei blob con conferma a banda minima, più un avviso forzabile in approvazione quando mancano foto.

**Tech Stack:** Next.js (route handlers, runtime nodejs), Supabase (`supabaseAdmin` storage+DB), IndexedDB offline layer, vitest.

## Global Constraints

- Lingua del codice/commenti: italiano (come il resto del repo).
- Nessuna migrazione SQL. Tutto app-only.
- Baseline lint/test del repo già rossa (vedi memoria `lint-baseline-rosso`): i gate valgono come "nessun nuovo problema dai file toccati" → verifica mirata con `npx vitest run <file>`.
- Bucket privato `interventi-foto`; tutto via `supabaseAdmin` (service_role).
- Retro-compatibilità offline: una risposta server priva dei nuovi campi deve essere trattata in modo prudenziale (non rilasciare i blob).
- Spec di riferimento: `docs/superpowers/specs/2026-06-24-blindatura-invio-foto-design.md`.

---

## FASE 1 — Server: stop alla cancellazione (deployabile da sola)

### Task 1: Helper puri `pathFotoTentativo` + `isViolazionePk`

**Files:**
- Create: `lib/interventi/manuali/fotoStorageHardening.ts`
- Test: `lib/interventi/manuali/fotoStorageHardening.test.ts`

**Interfaces:**
- Produces:
  - `pathFotoTentativo(richiestaId: string, chiave: string, identificativo: string, tentativo: string, ext: string): string`
  - `isViolazionePk(error: { code?: string } | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/interventi/manuali/fotoStorageHardening.test.ts
import { describe, it, expect } from 'vitest';
import { pathFotoTentativo, isViolazionePk } from './fotoStorageHardening';

describe('pathFotoTentativo', () => {
  it('include richiestaId, slot, identificativo, tentativo ed estensione', () => {
    expect(pathFotoTentativo('req1', 'sigillatura', '912231812', 'ab12cd34', 'jpg'))
      .toBe('req1/sigillatura_912231812_ab12cd34.jpg');
  });
  it('tentativi diversi → path diversi (no collisione tra POST concorrenti)', () => {
    const a = pathFotoTentativo('req1', 'foto', 'X', 'aaaaaaaa', 'jpg');
    const b = pathFotoTentativo('req1', 'foto', 'X', 'bbbbbbbb', 'jpg');
    expect(a).not.toBe(b);
  });
});

describe('isViolazionePk', () => {
  it('codice 23505 → true', () => { expect(isViolazionePk({ code: '23505' })).toBe(true); });
  it('altri codici → false', () => { expect(isViolazionePk({ code: '23503' })).toBe(false); });
  it('null/undefined → false', () => { expect(isViolazionePk(null)).toBe(false); expect(isViolazionePk(undefined)).toBe(false); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/manuali/fotoStorageHardening.test.ts`
Expected: FAIL — modulo `./fotoStorageHardening` inesistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/interventi/manuali/fotoStorageHardening.ts
// PURE: costruzione storage_path unico per-tentativo + riconoscimento conflitto PK Postgres.

/** Path foto con suffisso per-tentativo: due POST concorrenti non scrivono mai sullo stesso oggetto. */
export function pathFotoTentativo(
  richiestaId: string,
  chiave: string,
  identificativo: string,
  tentativo: string,
  ext: string,
): string {
  return `${richiestaId}/${chiave}_${identificativo}_${tentativo}.${ext}`;
}

/** Conflitto di chiave primaria/unique (Postgres 23505) → la richiesta esiste già (duplicato concorrente). */
export function isViolazionePk(error: { code?: string } | null | undefined): boolean {
  return !!error && error.code === '23505';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/manuali/fotoStorageHardening.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/fotoStorageHardening.ts lib/interventi/manuali/fotoStorageHardening.test.ts
git commit -m "feat(foto): helper puri path per-tentativo + isViolazionePk"
```

---

### Task 2: Verifica esistenza byte-aware (`pathMancanti` puro + `fotoPresentiVerificate` server)

**Files:**
- Create: `lib/interventi/manuali/verificaFotoStorage.ts`
- Test: `lib/interventi/manuali/verificaFotoStorage.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabaseAdmin`.
- Produces:
  - `pathMancanti(attesi: string[], presenti: Set<string>): string[]` (puro)
  - `fotoPresentiVerificate(paths: string[]): Promise<Set<string>>` (server; un path è "presente" solo se `createSignedUrl` riesce)

- [ ] **Step 1: Write the failing test (solo la parte pura)**

```ts
// lib/interventi/manuali/verificaFotoStorage.test.ts
import { describe, it, expect } from 'vitest';
import { pathMancanti } from './verificaFotoStorage';

describe('pathMancanti', () => {
  it('ritorna i path non presenti nel set', () => {
    const presenti = new Set(['a/1.jpg', 'a/3.jpg']);
    expect(pathMancanti(['a/1.jpg', 'a/2.jpg', 'a/3.jpg'], presenti)).toEqual(['a/2.jpg']);
  });
  it('tutti presenti → vuoto', () => {
    expect(pathMancanti(['x'], new Set(['x']))).toEqual([]);
  });
  it('set vuoto → tutti mancanti', () => {
    expect(pathMancanti(['x', 'y'], new Set())).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/manuali/verificaFotoStorage.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/interventi/manuali/verificaFotoStorage.ts
// Verifica di ESISTENZA byte-aware: createSignedUrl fallisce quando l'oggetto non esiste
// davvero nel bucket (riga storage.objects assente). Più affidabile di .list() per
// rilevare la cancellazione, ed è lo stesso meccanismo del percorso di lettura del pannello.
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** PURA: i path attesi che NON risultano presenti. */
export function pathMancanti(attesi: string[], presenti: Set<string>): string[] {
  return attesi.filter((p) => !presenti.has(p));
}

/** Server: insieme dei path il cui oggetto è realmente firmabile (= esiste). */
export async function fotoPresentiVerificate(paths: string[]): Promise<Set<string>> {
  const presenti = new Set<string>();
  await Promise.all(
    paths.map(async (p) => {
      const { data, error } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(p, 60);
      if (!error && data?.signedUrl) presenti.add(p);
    }),
  );
  return presenti;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/manuali/verificaFotoStorage.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/verificaFotoStorage.ts lib/interventi/manuali/verificaFotoStorage.test.ts
git commit -m "feat(foto): verifica esistenza byte-aware (createSignedUrl) + pathMancanti"
```

---

### Task 3: route — storage_path per-tentativo + verifica post-upload byte-aware

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

**Interfaces:**
- Consumes: `pathFotoTentativo` (Task 1), `fotoPresentiVerificate` + `pathMancanti` (Task 2).

- [ ] **Step 1: Aggiungi gli import**

In testa al file, dopo gli import esistenti di `@/lib/interventi/manuali/...`, aggiungi:

```ts
import { pathFotoTentativo, isViolazionePk } from '@/lib/interventi/manuali/fotoStorageHardening';
import { fotoPresentiVerificate, pathMancanti } from '@/lib/interventi/manuali/verificaFotoStorage';
```

- [ ] **Step 2: Genera il token tentativo e usa il path per-tentativo**

Subito dopo `const richiestaId = richiestaIdValido(rawDati.richiestaId) ? rawDati.richiestaId : randomUUID();` aggiungi:

```ts
// Token per-esecuzione: due POST concorrenti della stessa richiesta scrivono su path DISTINTI,
// così il rollback di uno non può cancellare i file dell'altro.
const tentativo = randomUUID().slice(0, 8);
```

Nel loop `for (const { chiave, file: f } of received)` sostituisci la riga che costruisce `storagePath`:

```ts
// PRIMA:
//   const storagePath = `${richiestaId}/${chiave}_${identificativoFoto(ids, fotoPriority)}.${ext}`;
// DOPO:
const storagePath = pathFotoTentativo(richiestaId, chiave, identificativoFoto(ids, fotoPriority), tentativo, ext);
```

- [ ] **Step 3: Verifica post-upload byte-aware**

Sostituisci il blocco "VERIFICA POST-UPLOAD" (oggi usa `pathPresentiInStorage`):

```ts
// PRIMA:
//   if (pathCaricati.length > 0) {
//     const presenti = await pathPresentiInStorage(richiestaId);
//     const mancanti = pathCaricati.filter((p) => !presenti.has(p));
//     if (mancanti.length > 0) { ... }
//   }
// DOPO:
if (pathCaricati.length > 0) {
  const presenti = await fotoPresentiVerificate(pathCaricati);
  const mancanti = pathMancanti(pathCaricati, presenti);
  if (mancanti.length > 0) {
    await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
    return NextResponse.json({ error: 'upload_foto_non_persistito' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Typecheck/build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore relativo a `route.ts` (l'helper `pathPresentiInStorage` può restare definito; verrà rimosso nel Task 5 se non più usato).

- [ ] **Step 5: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(foto): storage_path per-tentativo + verifica post-upload byte-aware"
```

---

### Task 4: route — refactor risposta idempotente in helper locale riusabile

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

**Interfaces:**
- Produces (locale al file): `async function rispostaIdempotente(esistente, received): Promise<NextResponse>` che usa `fotoPresentiVerificate`.

- [ ] **Step 1: Estrai la logica idempotente esistente in una funzione locale**

Sopra `export async function POST(...)`, aggiungi (riusa la verifica byte-aware e calcola `fotoOk`):

```ts
type RichiestaEsistente = { id: string; voce_id: string | null; corsia: 'normale' | 'liberi'; intervento_id: string | null };

/** Risposta idempotente per un re-invio con richiestaId già esistente. Ripara i file mancanti se
 *  il re-invio porta le foto (slotDaRiparare) e dichiara `fotoComplete`/`durabile` byte-aware. */
async function rispostaIdempotente(
  esistente: RichiestaEsistente,
  received: Array<{ chiave: string; file: File }>,
): Promise<NextResponse> {
  const reqId = esistente.id;
  const { data: righe } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('slot_chiave, storage_path')
    .eq('richiesta_id', reqId);
  const righeFoto = (righe ?? []) as Array<{ slot_chiave: string; storage_path: string }>;
  const fotoTotali = righeFoto.length;
  let fotoOk = fotoTotali;
  if (fotoTotali > 0) {
    try {
      const presenti = await fotoPresentiVerificate(righeFoto.map((r) => r.storage_path));
      const daRiparare = slotDaRiparare(righeFoto, received, presenti);
      for (const s of daRiparare) {
        if (!s.file.type.startsWith('image/')) continue;
        const buf = Buffer.from(await s.file.arrayBuffer());
        await supabaseAdmin.storage
          .from('interventi-foto')
          .upload(s.storagePath, buf, { contentType: s.file.type || 'image/jpeg', upsert: true });
      }
      const presentiDopo = daRiparare.length > 0 ? await fotoPresentiVerificate(righeFoto.map((r) => r.storage_path)) : presenti;
      fotoOk = righeFoto.filter((r) => presentiDopo.has(r.storage_path)).length;
    } catch {
      fotoOk = 0;
    }
  }
  const complete = fotoOk === fotoTotali;
  return NextResponse.json({
    id: esistente.id,
    voceId: esistente.voce_id,
    corsia: esistente.corsia,
    interventoId: esistente.intervento_id,
    idempotente: true,
    fotoTotali,
    fotoOk,
    fotoComplete: complete,
    durabile: complete,
  });
}
```

- [ ] **Step 2: Usa l'helper al posto del blocco idempotente inline**

Sostituisci il corpo del check idempotente esistente (oggi dentro `if (richiestaIdValido(rawDati.richiestaId)) { ... if (esistente) { <blocco lungo> } }`) con:

```ts
if (richiestaIdValido(rawDati.richiestaId)) {
  const { data: esistente } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, voce_id, corsia, intervento_id')
    .eq('id', rawDati.richiestaId)
    .maybeSingle();
  if (esistente) return rispostaIdempotente(esistente as RichiestaEsistente, received);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore. (`durabile` è additivo nella risposta.)

- [ ] **Step 4: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "refactor(foto): risposta idempotente in helper riusabile + campo durabile"
```

---

### Task 5: route — sposta il check idempotenza prima delle obbligatorie + PK→idempotente

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

**Interfaces:**
- Consumes: `isViolazionePk` (Task 1), `rispostaIdempotente` (Task 4).

- [ ] **Step 1: Anticipa il calcolo di `received` e il check idempotenza**

Sposta il calcolo `const received = partiFotoRicevute(form);` e il blocco `if (richiestaIdValido(rawDati.richiestaId)) { ... return rispostaIdempotente(...) }` **prima** della validazione foto obbligatorie (il blocco `const esito = haEsitoNegativo(...) ? ... : validaFotoObbligatorie(...)` e relativo `if (!esito.ok) return 422`). Così un re-invio idempotente (anche di sola conferma, senza foto) non viene respinto con 422.

L'ordine risultante nella POST deve essere:
1. parse `rawDati`, valida committente + anagrafica, attività di default, costruisci `dati`;
2. `const received = partiFotoRicevute(form);`
3. check idempotenza → `return rispostaIdempotente(...)` se esiste;
4. risoluzione template + `campiEffettivi` + `slotFoto`;
5. `esitoPositivoDefault`;
6. validazione foto obbligatorie (422 se mancano) — **solo per il primo invio**;
7. generazione `richiestaId` + `tentativo`, upload, verifica byte-aware, INSERT.

- [ ] **Step 2: Gestisci il conflitto PK come idempotente nel ramo `eReq`**

Sostituisci il ramo di errore dell'INSERT `interventi_manuali` (oggi rimuove i file + 500):

```ts
// PRIMA:
//   if (eReq) {
//     console.error(...);
//     if (pathCaricati.length > 0) { await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati); }
//     return NextResponse.json({ error: eReq.message }, { status: 500 });
//   }
// DOPO:
if (eReq) {
  console.error('[intervento-manuale] eReq (insert interventi_manuali)', { committente, msg: eReq.message });
  // Pulisci SOLO i propri file (path per-tentativo: non tocca quelli di altri POST).
  if (pathCaricati.length > 0) {
    await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
  }
  // Conflitto PK = duplicato concorrente: la richiesta esiste già → rispondi idempotente
  // invece di un 500 spurio (il vincente ha i suoi file, intatti).
  if (isViolazionePk(eReq as { code?: string })) {
    const { data: gia } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, voce_id, corsia, intervento_id')
      .eq('id', richiestaId)
      .maybeSingle();
    if (gia) return rispostaIdempotente(gia as RichiestaEsistente, received);
  }
  return NextResponse.json({ error: eReq.message }, { status: 500 });
}
```

- [ ] **Step 3: Rimuovi `pathPresentiInStorage` se non più referenziata**

Cerca usi residui di `pathPresentiInStorage` nel file. Se non più usata, rimuovi la funzione (righe ~26-31). Se ancora usata altrove, lasciala.

Run: `grep -n "pathPresentiInStorage" "app/api/r/[token]/intervento-manuale/route.ts"`

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore.

- [ ] **Step 5: Verifica manuale (smoke)**

Verifica logica a mano sul codice: (1) primo invio con foto → upload path-tentativo → verifica byte-aware → INSERT → risposta con `durabile:false` non ancora presente (aggiunto in Fase 2; per ora la risposta finale resta `fotoComplete:true`). (2) re-invio stessa richiestaId → `rispostaIdempotente`. (3) due POST concorrenti → il perdente (PK) pulisce solo i suoi e risponde idempotente.

- [ ] **Step 6: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "fix(foto): check idempotenza prima delle obbligatorie + conflitto PK -> idempotente (stop cancellazione concorrente)"
```

---

### Task 6: route — campo `durabile` sulla risposta del primo invio

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Aggiungi `durabile:false` alla risposta finale del primo invio**

Nella `return NextResponse.json({ ... fotoComplete: true })` finale (fine handler), aggiungi il campo:

```ts
return NextResponse.json({
  id: req2!.id,
  voceId: voceRow!.id,
  corsia,
  interventoId,
  fotoTotali: fotoCaricate.length,
  fotoOk: fotoCaricate.length,
  fotoComplete: true,
  durabile: false, // appena caricato: la durabilità si conferma in un giro successivo (Fase 2)
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(foto): risposta primo invio con durabile:false (gancio Fase 2)"
```

> **CHECKPOINT FASE 1** — A questo punto la cancellazione concorrente è neutralizzata. Deployabile: le richieste col blob ancora sul telefono si auto-guariranno. Si può fermare qui e fare deploy, oppure proseguire con la Fase 2.

---

## FASE 2 — Client + approvazione: affidabilità end-to-end

### Task 7: Helper puri di rilascio differito (`modoInvioManuale`, `esitoInvioManuale`, `deveRilasciareFoto`)

**Files:**
- Modify: `lib/offline/syncPlan.ts`
- Test: `lib/offline/syncPlan.test.ts` (file esistente — aggiungi i `describe`)

**Interfaces:**
- Produces:
  - `GRACE_CONFERMA_MS: number`
  - `modoInvioManuale(item: { caricato?: boolean; confermaDopo?: number }, now: number): 'con_foto' | 'senza_foto' | 'attendi'`
  - `esitoInvioManuale(modo, status: number, durabile: boolean, now: number): EsitoManuale`
  - `deveRilasciareFoto(status: number, durabile: boolean): boolean` (firma aggiornata: `fotoComplete`→`durabile`)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/offline/syncPlan.test.ts (aggiungi in fondo)
import { modoInvioManuale, esitoInvioManuale, deveRilasciareFoto, GRACE_CONFERMA_MS } from './syncPlan';

describe('modoInvioManuale', () => {
  it('non caricato → con_foto (primo invio / riparazione)', () => {
    expect(modoInvioManuale({}, 1000)).toBe('con_foto');
  });
  it('caricato ma prima di confermaDopo → attendi', () => {
    expect(modoInvioManuale({ caricato: true, confermaDopo: 5000 }, 1000)).toBe('attendi');
  });
  it('caricato e oltre confermaDopo → senza_foto (conferma)', () => {
    expect(modoInvioManuale({ caricato: true, confermaDopo: 5000 }, 9000)).toBe('senza_foto');
  });
});

describe('esitoInvioManuale', () => {
  it('2xx + durabile → rilascia', () => {
    expect(esitoInvioManuale('senza_foto', 200, true, 0).tipo).toBe('rilascia');
  });
  it('primo invio 2xx non durabile → attesa_conferma con confermaDopo=now+GRACE', () => {
    const e = esitoInvioManuale('con_foto', 200, false, 1000);
    expect(e).toEqual({ tipo: 'attesa_conferma', confermaDopo: 1000 + GRACE_CONFERMA_MS });
  });
  it('conferma senza foto non durabile → ripara (forza re-upload)', () => {
    expect(esitoInvioManuale('senza_foto', 200, false, 1000).tipo).toBe('ripara');
  });
  it('5xx → ritenta', () => { expect(esitoInvioManuale('con_foto', 500, false, 0).tipo).toBe('ritenta'); });
  it('422 → bloccato', () => { expect(esitoInvioManuale('con_foto', 422, false, 0).tipo).toBe('bloccato'); });
});

describe('deveRilasciareFoto (durabile)', () => {
  it('rilascia solo 2xx && durabile', () => {
    expect(deveRilasciareFoto(200, true)).toBe(true);
    expect(deveRilasciareFoto(200, false)).toBe(false);
    expect(deveRilasciareFoto(500, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/offline/syncPlan.test.ts`
Expected: FAIL — export mancanti / firma `deveRilasciareFoto` diversa.

- [ ] **Step 3: Implement in `syncPlan.ts`**

Aggiorna `deveRilasciareFoto` e aggiungi i nuovi helper:

```ts
// lib/offline/syncPlan.ts (sostituisci deveRilasciareFoto e aggiungi sotto)

/** Rilascia i blob solo se il server conferma la DURABILITÀ (non la semplice presenza immediata). */
export function deveRilasciareFoto(status: number, durabile: boolean): boolean {
  return status >= 200 && status < 300 && durabile === true;
}

/** Finestra minima prima di tentare la conferma differita: supera la finestra di sparizione osservata. */
export const GRACE_CONFERMA_MS = 90_000;

export type ModoInvioManuale = 'con_foto' | 'senza_foto' | 'attendi';

/** Decide come ri-presentare una richiesta manuale: primo invio/riparazione (con foto),
 *  conferma a banda minima (senza foto), oppure attendi la fine della grace. */
export function modoInvioManuale(item: { caricato?: boolean; confermaDopo?: number }, now: number): ModoInvioManuale {
  if (!item.caricato) return 'con_foto';
  if (item.confermaDopo != null && now < item.confermaDopo) return 'attendi';
  return 'senza_foto';
}

export type EsitoManuale =
  | { tipo: 'rilascia' }
  | { tipo: 'attesa_conferma'; confermaDopo: number }
  | { tipo: 'ripara' }
  | { tipo: 'ritenta' }
  | { tipo: 'bloccato'; motivo: string };

/** Transizione post-risposta per l'item manuale. */
export function esitoInvioManuale(modo: ModoInvioManuale, status: number, durabile: boolean, now: number): EsitoManuale {
  if (status < 200 || status >= 300) {
    const base = classificaEsito(status);
    return base.esito === 'ritenta' ? { tipo: 'ritenta' } : { tipo: 'bloccato', motivo: base.esito === 'bloccato' ? base.motivo : 'Richiesta non valida' };
  }
  if (durabile) return { tipo: 'rilascia' };
  if (modo === 'con_foto') return { tipo: 'attesa_conferma', confermaDopo: now + GRACE_CONFERMA_MS };
  return { tipo: 'ripara' };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/offline/syncPlan.test.ts`
Expected: PASS (tutti, inclusi i preesistenti).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/syncPlan.ts lib/offline/syncPlan.test.ts
git commit -m "feat(offline): helper puri rilascio differito blob (durabile, conferma a banda minima)"
```

---

### Task 8: types — campi stato conferma sull'item `manuale`

**Files:**
- Modify: `lib/offline/types.ts:32`

- [ ] **Step 1: Aggiungi `caricato?` e `confermaDopo?` alla variante `manuale`**

Sostituisci la riga della variante `manuale` di `OutboxItem`:

```ts
// PRIMA:
//  | { id: string; type: 'manuale'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; payload: PayloadManuale }
// DOPO:
  | { id: string; type: 'manuale'; token: string; createdAt: number; tentativi: number; stato: OutboxStato; ultimoErrore?: string; caricato?: boolean; confermaDopo?: number; payload: PayloadManuale }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore (campi opzionali, additivi).

- [ ] **Step 3: Commit**

```bash
git add lib/offline/types.ts
git commit -m "feat(offline): campi caricato/confermaDopo sull'item manuale"
```

---

### Task 9: sync — macchina a stati del ramo `manuale`

**Files:**
- Modify: `lib/offline/sync.ts:80-108` (ramo `manuale`) e il loop `sincronizzaToken`

**Interfaces:**
- Consumes: `modoInvioManuale`, `esitoInvioManuale`, `deveRilasciareFoto` (Task 7).

- [ ] **Step 1: Aggiorna gli import di `sync.ts`**

```ts
import { ordineInvio, classificaEsito, deveRilasciareFoto, modoInvioManuale, esitoInvioManuale } from './syncPlan';
```

- [ ] **Step 2: Riscrivi il ramo `manuale` di `inviaElemento`**

Sostituisci il blocco `if (item.type === 'manuale') { ... }` con la macchina a stati (conferma senza foto, riparazione con foto, rilascio su durabile):

```ts
if (item.type === 'manuale') {
  const now = Date.now();
  const modo = modoInvioManuale(item, now);
  if (modo === 'attendi') {
    // Non ancora ora di confermare: lascia l'item in coda senza inviare.
    return { status: 200, ritentabile: true };
  }
  const fd = new FormData();
  fd.append('dati', JSON.stringify({
    richiestaId: item.payload.richiestaId,
    committente: item.payload.committente,
    anagrafica: item.payload.anagrafica,
    risposte: item.payload.risposte,
    note: item.payload.note ?? null,
    parentVoceId: item.payload.parentVoceId ?? null,
  }));
  if (modo === 'con_foto') {
    for (const ref of item.payload.fotoBlobRefs) {
      const blob = await dbBlob.leggi(ref.blobId);
      if (blob) fd.append(`foto:${ref.chiave}`, blob, `${ref.chiave}.jpg`);
    }
  }
  const r = await fetch(`/api/r/${item.token}/intervento-manuale`, { method: 'POST', body: fd });
  let durabile = false;
  if (r.ok) {
    const j = (await r.json().catch(() => ({}))) as { durabile?: boolean };
    durabile = j.durabile === true;
  }
  const esito = esitoInvioManuale(modo, r.status, durabile, now);
  if (esito.tipo === 'rilascia') {
    for (const ref of item.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
    return { status: r.status }; // completato → item rimosso
  }
  if (esito.tipo === 'attesa_conferma') {
    await dbOutbox.put({ ...item, stato: 'in_attesa', caricato: true, confermaDopo: esito.confermaDopo });
    return { status: r.status, ritentabile: true }; // tieni l'item, ritenta (conferma) più tardi
  }
  if (esito.tipo === 'ripara') {
    await dbOutbox.put({ ...item, stato: 'in_attesa', caricato: false, confermaDopo: undefined });
    return { status: r.status, ritentabile: true };
  }
  if (esito.tipo === 'ritenta') return { status: r.status === 0 ? 0 : r.status, ritentabile: true };
  // bloccato
  return { status: r.status };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore.

- [ ] **Step 4: Verifica preesistenti**

Run: `npx vitest run lib/offline/syncPlan.test.ts lib/offline/backgroundSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offline/sync.ts
git commit -m "feat(offline): ramo manuale con conferma differita (tieni i blob finche durabile)"
```

---

### Task 10: approva — gate "foto mancanti" forzabile (server)

**Files:**
- Modify: `app/api/admin/interventi-manuali/[id]/approva/route.ts`

**Interfaces:**
- Consumes: `fotoPresentiVerificate`, `pathMancanti` (Task 2).

- [ ] **Step 1: Import**

```ts
import { fotoPresentiVerificate, pathMancanti } from '@/lib/interventi/manuali/verificaFotoStorage';
```

- [ ] **Step 2: Leggi anche `confermaFotoMancanti` dal body**

```ts
const body = (await req.json()) as { dati_correnti?: DatiInterventoManuale; confermaDuplicato?: boolean; confermaFotoMancanti?: boolean };
```

- [ ] **Step 3: Gate foto mancanti dopo il check matricola, prima del check-and-set**

Subito prima del blocco "CHECK-AND-SET ATOMICO" inserisci:

```ts
// ── GATE FOTO MANCANTI (non bloccante, forzabile) ────────────────────────────
if (body.confermaFotoMancanti !== true) {
  const { data: fotoRows } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('storage_path')
    .eq('richiesta_id', id);
  const paths = ((fotoRows ?? []) as Array<{ storage_path: string }>).map((f) => f.storage_path);
  if (paths.length > 0) {
    const presenti = await fotoPresentiVerificate(paths);
    const mancanti = pathMancanti(paths, presenti);
    if (mancanti.length > 0) {
      return NextResponse.json({ error: 'foto_mancanti', mancanti: mancanti.length }, { status: 409 });
    }
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/interventi-manuali/[id]/approva/route.ts"
git commit -m "feat(approvazione): gate forzabile foto mancanti (no approvazione cieca senza prove)"
```

---

### Task 11: Pannello revisione — avviso forzabile foto mancanti (UI)

**Files:**
- Modify: `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`

- [ ] **Step 1: Stato per l'avviso foto mancanti**

Accanto a `const [dupAvviso, setDupAvviso] = useState<...>(null);` aggiungi:

```tsx
const [fotoAvviso, setFotoAvviso] = useState<number | null>(null);
```

- [ ] **Step 2: Invia `confermaFotoMancanti` e gestisci il 409**

Nella funzione `approva`, aggiorna la firma e il body, e gestisci il nuovo errore. Sostituisci la `approva` esistente con:

```tsx
const approva = async (forza = false, forzaFoto = false) => {
  setBusy(true); setErrore(null);
  try {
    const dati_correnti: DatiInterventoManuale = { committente: iniziali.committente, anagrafica, risposte };
    const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/approva`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dati_correnti, confermaDuplicato: forza, confermaFotoMancanti: forzaFoto }),
    });
    if (res.status === 409) {
      const j = (await res.json().catch(() => ({}))) as { error?: string; matricola?: string; duplicati?: DuplicatoMatricola[]; mancanti?: number };
      if (j.error === 'matricola_duplicata') { setDupAvviso({ matricola: j.matricola ?? '', duplicati: j.duplicati ?? [] }); return; }
      if (j.error === 'foto_mancanti') { setFotoAvviso(j.mancanti ?? 0); return; }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setDupAvviso(null); setFotoAvviso(null);
    onDecisa();
  } catch (e) { setErrore(e instanceof Error ? e.message : 'Errore'); } finally { setBusy(false); }
};
```

- [ ] **Step 3: Callout avviso foto mancanti**

Dopo il blocco `{dupAvviso && (...)}` aggiungi:

```tsx
{fotoAvviso !== null && (
  <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning)] p-3" style={{ backgroundColor: 'var(--warning-soft)' }}>
    <p className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
      &#9888; Mancano {fotoAvviso} foto: l&apos;intervento risulterà senza prove.
    </p>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" animated={false} disabled={busy} onClick={() => setFotoAvviso(null)}>Annulla</Button>
      <Button variant="secondary" size="sm" animated={false} disabled={busy}
        className="border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning-soft)]"
        onClick={() => void approva(false, true)}>Approva comunque</Button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Typecheck/build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add "components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx"
git commit -m "feat(approvazione): avviso forzabile foto mancanti nel pannello revisione"
```

---

## Self-review (compilata)

- **Copertura spec:** (b) Task 3; (a) Task 5; verifica byte-aware Task 2+3; refactor idempotente Task 4; riordino idempotenza Task 5; `durabile` Task 6+7; rilascio differito Task 7+8+9; gate approvazione Task 10+11. ✓
- **Placeholder:** nessuno; codice completo in ogni step.
- **Coerenza tipi:** `durabile` usato in route (Task 4/6) e client (Task 7/9); `pathFotoTentativo`/`isViolazionePk` (Task 1) usati in Task 3/5; `fotoPresentiVerificate`/`pathMancanti` (Task 2) usati in Task 3/4/10; campi `caricato`/`confermaDopo` (Task 8) usati in Task 7/9. ✓
- **Fuori scope confermato:** cron reconcile (d), bonifica orfane odierne, deduplica doppioni.

## Note di deploy

- Fase 1 (Task 1-6) deployabile da sola: ferma la perdita dati. Fase 2 (Task 7-11) completa la garanzia.
- A fine lavoro: push su `main` (Vercel auto-deploy), refspec `worktree-blindatura-invio-foto:main`. Hard refresh lato operatore per la cache del Service Worker.
