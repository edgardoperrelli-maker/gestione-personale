# Hardening affidabilità foto richieste manuali — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il recupero delle foto delle richieste manuali automatico e verificato (l'app ri-manda finché il server conferma la persistenza), e blindare la RLS del bucket.

**Architecture:** Server self-healing nel ramo idempotenza di `/intervento-manuale` (ri-carica i file mancanti dal re-invio + verifica) e contratto `fotoComplete` su ogni risposta; client (`lib/offline/sync.ts`) che rilascia i blob solo a `fotoComplete: true` riusando il flag `ritentabile`; migration che rimuove le policy RLS `to authenticated` del bucket. Logica di decisione isolata in due helper puri testati in TDD.

**Tech Stack:** Next.js route handlers (Node runtime), Supabase Storage via `supabaseAdmin` (service_role), IndexedDB outbox offline, vitest.

## Global Constraints

- Tutte le scritture/letture storage del bucket `interventi-foto` passano dal server con `supabaseAdmin` (service_role).
- Baseline lint/test del repo è rossa: i gate valgono come "nessun NUOVO problema dai file toccati" (`npx tsc --noEmit` pulito; `npx eslint <file>` pulito; `npx vitest run <file di test nuovi>` verde).
- Lingua dei commenti/commit: italiano, coerente col repo.
- Esecuzione in **worktree isolato** creato da `origin/main` (vedi Setup). Migration RLS applicata via MCP `apply_migration` al deploy. Push `git push origin HEAD:main` solo con OK esplicito dell'utente.

## Setup (pre-task)

Creare il worktree isolato e la junction `node_modules` (per far girare tsc/eslint/vitest):

```bash
cd "C:/Users/Edgardo/Desktop/gestione-personale-main"
git fetch origin
git worktree add -b fix/foto-self-healing "C:/Users/Edgardo/Desktop/gp-selfheal-wt" origin/main
```
PowerShell (junction):
```powershell
New-Item -ItemType Junction -Path "C:\Users\Edgardo\Desktop\gp-selfheal-wt\node_modules" -Target "C:\Users\Edgardo\Desktop\gestione-personale-main\node_modules"
```
Tutti i path delle task sono relativi a `C:/Users/Edgardo/Desktop/gp-selfheal-wt/`.

---

### Task 1: Helper puro `slotDaRiparare`

**Files:**
- Create: `lib/interventi/manuali/riparazioneFoto.ts`
- Test: `lib/interventi/manuali/riparazioneFoto.test.ts`

**Interfaces:**
- Produces:
  - `type RigaFotoEsistente = { slot_chiave: string; storage_path: string }`
  - `function slotDaRiparare<F>(righeEsistenti: RigaFotoEsistente[], fotoRicevute: Array<{ chiave: string; file: F }>, pathPresenti: Set<string>): Array<{ chiave: string; storagePath: string; file: F }>`

- [ ] **Step 1: Write the failing test**

`lib/interventi/manuali/riparazioneFoto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { slotDaRiparare } from './riparazioneFoto';

const righe = [
  { slot_chiave: 'vecchio', storage_path: 'req/vecchio_x.jpg' },
  { slot_chiave: 'nuovo', storage_path: 'req/nuovo_x.jpg' },
  { slot_chiave: 'minibag', storage_path: 'req/minibag_x.jpg' },
];

describe('slotDaRiparare', () => {
  it('nessuno se tutti i file sono presenti', () => {
    const presenti = new Set(righe.map((r) => r.storage_path));
    expect(slotDaRiparare(righe, [{ chiave: 'vecchio', file: 'F' }], presenti)).toEqual([]);
  });

  it('ripara solo gli slot col file mancante E con foto nel re-invio', () => {
    const presenti = new Set(['req/vecchio_x.jpg']); // nuovo e minibag mancano
    const ricevute = [{ chiave: 'nuovo', file: 'Fn' }]; // ho solo "nuovo"
    expect(slotDaRiparare(righe, ricevute, presenti)).toEqual([
      { chiave: 'nuovo', storagePath: 'req/nuovo_x.jpg', file: 'Fn' },
    ]);
  });

  it('non ripara se manca il file ma il re-invio non porta quella foto', () => {
    const presenti = new Set<string>(); // tutti mancanti
    expect(slotDaRiparare(righe, [], presenti)).toEqual([]);
  });

  it('ripara tutti gli slot mancanti se il re-invio li porta tutti', () => {
    const presenti = new Set<string>();
    const ricevute = [
      { chiave: 'vecchio', file: 'a' }, { chiave: 'nuovo', file: 'b' }, { chiave: 'minibag', file: 'c' },
    ];
    expect(slotDaRiparare(righe, ricevute, presenti).map((s) => s.chiave)).toEqual(['vecchio', 'nuovo', 'minibag']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx vitest run lib/interventi/manuali/riparazioneFoto.test.ts`
Expected: FAIL (`slotDaRiparare` non esiste / modulo non trovato).

- [ ] **Step 3: Write minimal implementation**

`lib/interventi/manuali/riparazioneFoto.ts`:
```ts
// PURA: decide quali slot foto ri-caricare al re-invio idempotente.
// Uno slot va riparato sse il suo file NON è presente nello storage E il re-invio
// porta una foto con la stessa chiave. Generico su F per testabilità senza File.
export type RigaFotoEsistente = { slot_chiave: string; storage_path: string };

export function slotDaRiparare<F>(
  righeEsistenti: RigaFotoEsistente[],
  fotoRicevute: Array<{ chiave: string; file: F }>,
  pathPresenti: Set<string>,
): Array<{ chiave: string; storagePath: string; file: F }> {
  const perChiave = new Map(fotoRicevute.map((f) => [f.chiave, f.file]));
  const out: Array<{ chiave: string; storagePath: string; file: F }> = [];
  for (const r of righeEsistenti) {
    if (pathPresenti.has(r.storage_path)) continue; // file già presente
    const file = perChiave.get(r.slot_chiave);
    if (file === undefined) continue; // non riparabile senza la foto nel re-invio
    out.push({ chiave: r.slot_chiave, storagePath: r.storage_path, file });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx vitest run lib/interventi/manuali/riparazioneFoto.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/riparazioneFoto.ts lib/interventi/manuali/riparazioneFoto.test.ts
git commit -m "feat(foto-manuali): helper puro slotDaRiparare (slot foto da ri-caricare)"
```

---

### Task 2: Helper puro `deveRilasciareFoto`

**Files:**
- Modify: `lib/offline/syncPlan.ts` (aggiunge una funzione esportata in fondo)
- Test: `lib/offline/syncPlan.test.ts` (aggiunge un blocco describe)

**Interfaces:**
- Produces: `function deveRilasciareFoto(status: number, fotoComplete: boolean): boolean`

- [ ] **Step 1: Write the failing test** (append a `lib/offline/syncPlan.test.ts`)

Aggiornare la riga import in cima al file:
```ts
import { ordineInvio, classificaEsito, deveRilasciareFoto } from './syncPlan';
```
Aggiungere in fondo al file:
```ts
describe('deveRilasciareFoto', () => {
  it('rilascia solo con 2xx E fotoComplete', () => {
    expect(deveRilasciareFoto(200, true)).toBe(true);
    expect(deveRilasciareFoto(201, true)).toBe(true);
  });
  it('non rilascia se 2xx ma foto incomplete', () => {
    expect(deveRilasciareFoto(200, false)).toBe(false);
  });
  it('non rilascia su errori (5xx, 4xx, rete)', () => {
    expect(deveRilasciareFoto(502, true)).toBe(false);
    expect(deveRilasciareFoto(422, true)).toBe(false);
    expect(deveRilasciareFoto(0, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx vitest run lib/offline/syncPlan.test.ts`
Expected: FAIL (`deveRilasciareFoto` non esportata).

- [ ] **Step 3: Write minimal implementation** (append a `lib/offline/syncPlan.ts`)

```ts
/**
 * Decide se il sync può RILASCIARE i blob foto di una richiesta manuale: solo quando il
 * server ha risposto 2xx E ha confermato che tutte le foto sono persistite (fotoComplete).
 * Altrimenti i blob restano in IndexedDB per il retry automatico.
 */
export function deveRilasciareFoto(status: number, fotoComplete: boolean): boolean {
  return status >= 200 && status < 300 && fotoComplete === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx vitest run lib/offline/syncPlan.test.ts`
Expected: PASS (test esistenti + 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/syncPlan.ts lib/offline/syncPlan.test.ts
git commit -m "feat(offline): helper puro deveRilasciareFoto (rilascio blob solo a fotoComplete)"
```

---

### Task 3: Server — verifica DRY + self-healing idempotente + `fotoComplete`

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

**Interfaces:**
- Consumes: `slotDaRiparare`, `RigaFotoEsistente` (Task 1).
- Produces: risposta JSON con `{ ..., fotoTotali, fotoOk, fotoComplete }` su entrambi i rami (creazione e idempotente). `fotoComplete` sempre presente.

- [ ] **Step 1: Aggiungere gli import in cima al file**

Sotto l'import esistente `import { partiFotoRicevute, etichettaSlotFoto } from '@/lib/interventi/manuali/fotoRicevute';` aggiungere:
```ts
import { slotDaRiparare } from '@/lib/interventi/manuali/riparazioneFoto';
```

- [ ] **Step 2: Estrarre l'helper `pathPresentiInStorage` (DRY tra verifica e healing)**

In cima alla funzione del route (subito dopo `export const runtime = 'nodejs';` o accanto alle altre const di modulo), aggiungere una funzione di modulo:
```ts
/** Insieme dei path realmente presenti nel bucket sotto il prefisso della richiesta. */
async function pathPresentiInStorage(richiestaId: string): Promise<Set<string>> {
  const { data: listati } = await supabaseAdmin.storage
    .from('interventi-foto')
    .list(richiestaId, { limit: 1000 });
  return new Set((listati ?? []).map((o) => `${richiestaId}/${o.name}`));
}
```

- [ ] **Step 3: Usare l'helper nel blocco "VERIFICA POST-UPLOAD" già esistente**

Sostituire il corpo della verifica post-upload (il blocco `if (pathCaricati.length > 0) { ... list ... }`) con:
```ts
  if (pathCaricati.length > 0) {
    const presenti = await pathPresentiInStorage(richiestaId);
    const mancanti = pathCaricati.filter((p) => !presenti.has(p));
    if (mancanti.length > 0) {
      await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      return NextResponse.json({ error: 'upload_foto_non_persistito' }, { status: 502 });
    }
  }
```

- [ ] **Step 4: Self-healing nel ramo idempotenza**

Sostituire il blocco idempotenza (`if (richiestaIdValido(rawDati.richiestaId)) { ... if (esistente) { return ... idempotente: true } }`) con:
```ts
  if (richiestaIdValido(rawDati.richiestaId)) {
    const { data: esistente } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, voce_id, corsia, intervento_id')
      .eq('id', rawDati.richiestaId)
      .maybeSingle();
    if (esistente) {
      // Self-healing: ri-carica i file foto mancanti se il re-invio li porta.
      const reqId = esistente.id as string;
      const { data: righe } = await supabaseAdmin
        .from('interventi_manuali_foto')
        .select('slot_chiave, storage_path')
        .eq('richiesta_id', reqId);
      const righeFoto = (righe ?? []) as Array<{ slot_chiave: string; storage_path: string }>;
      const fotoTotali = righeFoto.length;
      let fotoOk = fotoTotali;
      if (fotoTotali > 0) {
        const presenti = await pathPresentiInStorage(reqId);
        const daRiparare = slotDaRiparare(righeFoto, received, presenti);
        for (const s of daRiparare) {
          if (!s.file.type.startsWith('image/')) continue;
          const buf = Buffer.from(await s.file.arrayBuffer());
          await supabaseAdmin.storage
            .from('interventi-foto')
            .upload(s.storagePath, buf, { contentType: s.file.type || 'image/jpeg', upsert: true });
        }
        const presentiDopo = daRiparare.length > 0 ? await pathPresentiInStorage(reqId) : presenti;
        fotoOk = righeFoto.filter((r) => presentiDopo.has(r.storage_path)).length;
      }
      return NextResponse.json({
        id: esistente.id,
        voceId: esistente.voce_id,
        corsia: esistente.corsia,
        interventoId: esistente.intervento_id,
        idempotente: true,
        fotoTotali,
        fotoOk,
        fotoComplete: fotoOk === fotoTotali,
      });
    }
  }
```
(`received` è già `partiFotoRicevute(form)` calcolato più in alto nel route; `slotDaRiparare` è generico e qui `F = File`.)

- [ ] **Step 5: Aggiungere `fotoComplete` alla risposta del ramo CREAZIONE**

Sostituire il `return` finale del route (`return NextResponse.json({ id: req2!.id, voceId: voceRow!.id, corsia, interventoId });`) con:
```ts
  return NextResponse.json({
    id: req2!.id,
    voceId: voceRow!.id,
    corsia,
    interventoId,
    fotoTotali: fotoCaricate.length,
    fotoOk: fotoCaricate.length,
    fotoComplete: true,
  });
```
(Sul ramo creazione, se siamo arrivati qui la verifica post-upload è passata → tutti i file presenti → `fotoComplete: true`.)

- [ ] **Step 6: Verifica tsc + eslint**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx tsc --noEmit && npx eslint "app/api/r/[token]/intervento-manuale/route.ts"`
Expected: nessun output (pulito).

- [ ] **Step 7: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(intervento-manuale): self-healing foto al re-invio + contratto fotoComplete"
```

---

### Task 4: Client — rilascio condizionato a `fotoComplete`

**Files:**
- Modify: `lib/offline/sync.ts` (ramo `type === 'manuale'` e import)

**Interfaces:**
- Consumes: `deveRilasciareFoto` (Task 2); campo `fotoComplete` dalla risposta (Task 3).

- [ ] **Step 1: Aggiornare l'import da `./syncPlan`**

Riga 2 attuale:
```ts
import { ordineInvio, classificaEsito } from './syncPlan';
```
diventa:
```ts
import { ordineInvio, classificaEsito, deveRilasciareFoto } from './syncPlan';
```

- [ ] **Step 2: Sostituire il ramo `manuale` di `inviaElemento`**

Sostituire il blocco `if (item.type === 'manuale') { ... }` con:
```ts
    if (item.type === 'manuale') {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({
        richiestaId: item.payload.richiestaId,
        committente: item.payload.committente,
        anagrafica: item.payload.anagrafica,
        risposte: item.payload.risposte,
        note: item.payload.note ?? null,
        parentVoceId: item.payload.parentVoceId ?? null,
      }));
      for (const ref of item.payload.fotoBlobRefs) {
        const blob = await dbBlob.leggi(ref.blobId);
        if (blob) fd.append(`foto:${ref.chiave}`, blob, `${ref.chiave}.jpg`);
      }
      const r = await fetch(`/api/r/${item.token}/intervento-manuale`, { method: 'POST', body: fd });
      // Il server conferma con fotoComplete che TUTTI i file sono davvero sullo storage.
      // Assente (deploy vecchio) → prudenzialmente false → non rilasciare i blob.
      let fotoComplete = false;
      if (r.ok) {
        const j = (await r.json().catch(() => ({}))) as { fotoComplete?: boolean };
        fotoComplete = j.fotoComplete === true;
      }
      const rilascia = deveRilasciareFoto(r.status, fotoComplete);
      if (rilascia) {
        for (const ref of item.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
      }
      // 2xx ma foto non complete → forza il retry (tieni blob + item in coda).
      return { status: r.status, ritentabile: r.ok && !rilascia };
    }
```

- [ ] **Step 3: Verifica tsc + eslint**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx tsc --noEmit && npx eslint lib/offline/sync.ts`
Expected: nessun output (pulito).

- [ ] **Step 4: Run the full offline test suite (non regressione)**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx vitest run lib/offline`
Expected: PASS (inclusi i nuovi test di syncPlan).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/sync.ts
git commit -m "feat(offline): trattieni i blob foto finche fotoComplete (retry automatico)"
```

---

### Task 5: Migration RLS lockdown bucket

**Files:**
- Create: `supabase/migrations/20260618090000_rls_lockdown_interventi_foto.sql` (timestamp: usare `date +%Y%m%d%H%M%S` alla creazione se si preferisce un valore reale; il nome conta solo per l'ordinamento)

**Interfaces:** nessuna (DDL).

- [ ] **Step 1: Creare il file migration**

`supabase/migrations/20260618090000_rls_lockdown_interventi_foto.sql`:
```sql
-- RLS lockdown del bucket privato 'interventi-foto'.
-- Ogni accesso al bucket passa dal server con service_role (che bypassa la RLS) e le
-- anteprime usano signed URL firmate dal server: nessun client legge/scrive/cancella
-- direttamente. Le policy "to authenticated" sono pura superficie d'attacco → rimosse.
drop policy if exists "interventi_foto_select" on storage.objects;
drop policy if exists "interventi_foto_insert" on storage.objects;
drop policy if exists "interventi_foto_delete" on storage.objects;
```

- [ ] **Step 2: Commit del file migration (l'applicazione su prod avviene via MCP al deploy)**

```bash
git add supabase/migrations/20260618090000_rls_lockdown_interventi_foto.sql
git commit -m "chore(rls): lockdown bucket interventi-foto (rimuove policy to authenticated)"
```

- [ ] **Step 3 (al deploy, con OK utente): applicare via MCP**

Applicare con `apply_migration` (project_id `aceztqfebringeaebvce`, name `rls_lockdown_interventi_foto`) lo stesso SQL del file. Poi verificare con una SELECT che le 3 policy non esistano più:
```sql
select policyname from pg_policies where tablename='objects' and policyname like 'interventi_foto_%';
```
Expected: 0 righe.

---

### Task 6: Verifica finale e push

**Files:** nessuna modifica (gate + deploy).

- [ ] **Step 1: Gate completo nel worktree**

Run: `cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt" && npx tsc --noEmit && npx eslint lib/interventi/manuali/riparazioneFoto.ts lib/offline/syncPlan.ts lib/offline/sync.ts "app/api/r/[token]/intervento-manuale/route.ts" && npx vitest run lib/interventi/manuali/riparazioneFoto.test.ts lib/offline/syncPlan.test.ts`
Expected: tsc/eslint senza output; vitest verde.

- [ ] **Step 2: Verificare il fast-forward su origin/main**

```bash
cd "C:/Users/Edgardo/Desktop/gp-selfheal-wt"
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo FF-OK || echo NON-FF
```
Se `NON-FF`: ribasare su `origin/main` prima del push.

- [ ] **Step 3: Push (richiede OK esplicito dell'utente)**

```bash
git push origin HEAD:main
```

- [ ] **Step 4: Applicare la migration RLS via MCP (Task 5 Step 3) con OK utente.**

- [ ] **Step 5: Cleanup worktree**

PowerShell (rimuovi solo la junction, non il target):
```powershell
[System.IO.Directory]::Delete("C:\Users\Edgardo\Desktop\gp-selfheal-wt\node_modules", $false)
```
```bash
cd "C:/Users/Edgardo/Desktop/gestione-personale-main"
git worktree remove "C:/Users/Edgardo/Desktop/gp-selfheal-wt" --force
git branch -D fix/foto-self-healing
git worktree prune
```

- [ ] **Step 6: Smoke manuale sul deploy**

Con uno stato "riga senza file" (o riusando le richieste note), re-inviare da mobile e verificare: (a) il server ri-carica e verifica; (b) il client tiene i blob finché `fotoComplete`; (c) a buon fine rilascia e l'item sparisce dalla coda. Nel pannello revisione: il placeholder "da re-inviare" deve sparire una volta riparata.

---

## Self-Review (autore del piano)

- **Spec coverage:** §1 idempotenza self-healing → Task 3. §1 contratto fotoComplete → Task 3 (creazione+idempotente). §2 client trattieni-finché-confermato → Task 4 (+ Task 2 helper). §3 RLS → Task 5. §Testing helper puri → Task 1+2; smoke → Task 6 Step 6. Tutte coperte.
- **Placeholder scan:** nessun TBD/TODO; tutti i blocchi codice sono completi. Il solo "timestamp alla creazione" del file migration è un valore d'ordinamento, non un placeholder funzionale (SQL completo).
- **Type consistency:** `slotDaRiparare` (Task 1) usato in Task 3 con `received: Array<{chiave; file: File}>` ⇒ `F = File`, `s.file.type`/`s.file.arrayBuffer()` validi. `deveRilasciareFoto(status, fotoComplete)` (Task 2) usato in Task 4 con la stessa firma. Campo risposta `fotoComplete` prodotto in Task 3 e consumato in Task 4. Coerente.
