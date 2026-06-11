# Rapportini offline — Fase 2b: Foto offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'operatore di allegare **foto offline** ai campi del rapportino: la foto (compressa) viene salvata come blob in IndexedDB e accodata; alla riapertura l'anteprima si vede comunque (letta dal blob locale); appena torna la rete il sync la carica su storage e riscrive il path reale nelle risposte. Niente più dipendenza dalla rete per scattare/allegare.

**Architecture:** `uploadFotoVoce` non fa più un POST diretto: chiama `accodaFoto` che salva il blob (`dbBlob`), accoda un elemento `foto` in `dbOutbox` (con `clientKey` univoco) e restituisce un **placeholder** `blob-locale:<blobId>` che viene scritto nella risposta della voce. L'orchestratore di sync della Fase 1 (branch `foto`) carica il blob, ottiene il path e riscrive la risposta. `CampoFotoInput` mostra l'anteprima dal blob quando la risposta è un placeholder. La logica del placeholder è in un helper puro testato; il wiring (db + componenti) si verifica con `tsc`/`eslint` + QA su Vercel.

**Tech Stack:** Next.js 15 App Router, React 19, IndexedDB (data layer Fase 1), `crypto.randomUUID()`, vitest 2 (env node).

---

## Contesto di partenza (esistente — leggere prima)

- `components/modules/rapportini/RapportinoForm.tsx` → `uploadFotoVoce(chiave, file): Promise<string|null>` (righe ~191-211): oggi POSTa `/api/r/${token}/foto-campo`, ottiene `path`, `setRisposta(voceId, chiave, path)`. `voceId` viene da `voceIdUploadRef.current`. Usa `mountedRef`. Ci sono già: `setVoci`, `latestRisposteRef`, `persistiVoce` (importato in 2a), `sincronizzaToken` (importato in 2a), `token`.
- `components/modules/rapportini/CampoInput.tsx` → `CampoFotoInput` (righe ~97-209): comprime con `comprimiImmagine` (da `./CampoFoto`), chiama `useUploadFoto()` → `uploadFoto(campo.chiave, compressed)`, su path → `onChange(path)` + `uploadStato='ok'`. Tiene `localFile` per l'anteprima di sessione (object URL). `hasFotoEsistente = !localFile && typeof valore === 'string' && valore.length > 0` → mostra "✓ Già presente" (nessuna anteprima per i path già salvati).
- `lib/offline/db.ts` → `dbBlob {salva(id, blob), leggi(id), rimuovi(id)}`, `dbOutbox {perToken, put, rimuovi}`, `indexedDbDisponibile()`.
- `lib/offline/types.ts` → `PayloadFoto = { voceId, chiave, blobId, clientKey }`; `OutboxItem` variante `foto`.
- `lib/offline/persistVoce.ts` → `persistiVoce(token, voceId, risposte, now)`.
- `lib/offline/sync.ts` → branch `foto` (Fase 1): legge il blob, POSTa `/api/r/${token}/foto-campo` con `file`+`clientKey`, su ok riscrive `dbLavoro[voce].risposte[chiave]=path`, ri-accoda la voce (id canonico) e rimuove il blob. `sincronizzaToken(token)`.

> **Convenzione:** commit in italiano `feat(offline)`/`test(offline)`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. SEMPRE `cd "C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline"`. Logica pura con `npx vitest run`; wiring con `npx tsc --noEmit` + `npx eslint` (NON `npm run build`).

## Struttura file (Fase 2b)

**Creati:**
- `lib/offline/fotoPlaceholder.ts` + `.test.ts` — `placeholderFoto`/`isPlaceholderFoto`/`blobIdDaPlaceholder` (puro).
- `lib/offline/persistFoto.ts` — `accodaFoto(token, voceId, chiave, blob)` + `leggiBlobFoto(placeholder)` (wiring db).

**Modificati:**
- `components/modules/rapportini/RapportinoForm.tsx` — `uploadFotoVoce` via `accodaFoto` (offline-first, race-safe).
- `components/modules/rapportini/CampoInput.tsx` — `CampoFotoInput` anteprima dal blob per i placeholder.

---

### Task 1: helper placeholder foto (puro)

**Files:** Create `lib/offline/fotoPlaceholder.ts` + `lib/offline/fotoPlaceholder.test.ts`

- [ ] **Step 1: test (failing)** — `lib/offline/fotoPlaceholder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placeholderFoto, isPlaceholderFoto, blobIdDaPlaceholder } from './fotoPlaceholder';

describe('fotoPlaceholder', () => {
  it('placeholderFoto produce blob-locale:<id>', () => {
    expect(placeholderFoto('abc')).toBe('blob-locale:abc');
  });
  it('isPlaceholderFoto riconosce i placeholder', () => {
    expect(isPlaceholderFoto('blob-locale:abc')).toBe(true);
    expect(isPlaceholderFoto('rapportini/rap1/foto.jpg')).toBe(false);
    expect(isPlaceholderFoto(123)).toBe(false);
    expect(isPlaceholderFoto(undefined)).toBe(false);
    expect(isPlaceholderFoto('')).toBe(false);
  });
  it('blobIdDaPlaceholder estrae l\'id (o null)', () => {
    expect(blobIdDaPlaceholder('blob-locale:abc')).toBe('abc');
    expect(blobIdDaPlaceholder('rapportini/x.jpg')).toBeNull();
    expect(blobIdDaPlaceholder(undefined)).toBeNull();
  });
});
```
Run `npx vitest run lib/offline/fotoPlaceholder.test.ts` → FAIL.

- [ ] **Step 2: implementa** `lib/offline/fotoPlaceholder.ts`:

```ts
const PREFISSO = 'blob-locale:';

/** Valore-placeholder per una foto non ancora caricata su storage (riferisce un blob locale). */
export function placeholderFoto(blobId: string): string {
  return `${PREFISSO}${blobId}`;
}

/** True se il valore di una risposta è un placeholder foto (blob locale non ancora caricato). */
export function isPlaceholderFoto(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFISSO) && v.length > PREFISSO.length;
}

/** Estrae il blobId da un placeholder, o null se non è un placeholder. */
export function blobIdDaPlaceholder(v: unknown): string | null {
  return isPlaceholderFoto(v) ? v.slice(PREFISSO.length) : null;
}
```
Run → PASS.

- [ ] **Step 3: commit**
```
git add lib/offline/fotoPlaceholder.ts lib/offline/fotoPlaceholder.test.ts
git commit -m "feat(offline): helper placeholder foto (logica pura)"
```

---

### Task 2: `accodaFoto` + `leggiBlobFoto` (wiring db)

**Files:** Create `lib/offline/persistFoto.ts`

- [ ] **Step 1: implementa** `lib/offline/persistFoto.ts`:

```ts
import { dbBlob, dbOutbox, indexedDbDisponibile } from './db';
import { placeholderFoto, blobIdDaPlaceholder } from './fotoPlaceholder';

/** Id deterministico dell'elemento outbox foto per (token, voce, campo): una foto per campo. */
function idFoto(token: string, voceId: string, chiave: string): string {
  return `foto:${token}:${voceId}:${chiave}`;
}

/**
 * Accoda una foto offline: salva il blob, accoda l'elemento `foto` (clientKey univoco)
 * e restituisce il placeholder da scrivere nella risposta del campo. Se per quel campo
 * c'era già una foto in coda non ancora caricata, la sostituisce (retake) rimuovendo il
 * blob precedente. Best-effort: ritorna null se IndexedDB non è disponibile.
 */
export async function accodaFoto(
  token: string,
  voceId: string,
  chiave: string,
  blob: Blob,
  now: number,
): Promise<string | null> {
  if (!indexedDbDisponibile()) return null;
  try {
    const id = idFoto(token, voceId, chiave);
    // Retake: rimuovi il blob della foto precedente ancora in coda per lo stesso campo.
    const esistenti = await dbOutbox.perToken(token);
    const prior = esistenti.find((i) => i.id === id && i.type === 'foto');
    if (prior && prior.type === 'foto') {
      await dbBlob.rimuovi(prior.payload.blobId);
    }
    const blobId = crypto.randomUUID();
    const clientKey = crypto.randomUUID();
    await dbBlob.salva(blobId, blob);
    await dbOutbox.put({
      id, type: 'foto', token, createdAt: now, tentativi: 0, stato: 'in_attesa',
      payload: { voceId, chiave, blobId, clientKey },
    });
    return placeholderFoto(blobId);
  } catch {
    return null;
  }
}

/** Legge il blob locale di una foto a partire dal suo placeholder (per l'anteprima). */
export async function leggiBlobFoto(placeholder: unknown): Promise<Blob | undefined> {
  const blobId = blobIdDaPlaceholder(placeholder);
  if (!blobId || !indexedDbDisponibile()) return undefined;
  try {
    return await dbBlob.leggi(blobId);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: verifica tsc** — `npx tsc --noEmit 2>&1 | grep "persistFoto"` → vuoto.

- [ ] **Step 3: commit**
```
git add lib/offline/persistFoto.ts
git commit -m "feat(offline): accodaFoto + leggiBlobFoto (coda foto offline)"
```

---

### Task 3: `uploadFotoVoce` offline-first (RapportinoForm)

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

Sostituisce il POST diretto con: accoda la foto (blob + coda) → scrivi il placeholder nella risposta (persistenza immediata, NON via debounce, per evitare che un salvataggio debounced sovrascriva il path reale dopo il sync) → avvia il sync. Mantiene la firma `(chiave, file) => Promise<string|null>` attesa da `CampoFotoInput`.

- [ ] **Step 1: import.** Aggiungi in cima:
```ts
import { accodaFoto } from '@/lib/offline/persistFoto';
```

- [ ] **Step 2: sostituisci `uploadFotoVoce`.** Rimpiazza l'intero callback `uploadFotoVoce` con:
```ts
  const uploadFotoVoce = useCallback(
    async (chiave: string, file: File): Promise<string | null> => {
      const voceId = voceIdUploadRef.current;
      if (!voceId || !mountedRef.current) return null;
      const now = Date.now();
      // Accoda la foto (blob in IndexedDB + elemento outbox). Ritorna il placeholder.
      const placeholder = await accodaFoto(token, voceId, chiave, file, now);
      if (!placeholder || !mountedRef.current) return placeholder;
      // Scrivi il placeholder nella risposta e PERSISTI subito (no debounce) per evitare
      // che un salvataggio successivo sovrascriva il path reale riscritto dal sync.
      const risposteCorrenti = { ...(latestRisposteRef.current[voceId] ?? {}), [chiave]: placeholder };
      latestRisposteRef.current[voceId] = risposteCorrenti;
      setVoci((prev) => prev.map((v) => (v.id === voceId ? { ...v, risposte: risposteCorrenti } : v)));
      await persistiVoce(token, voceId, risposteCorrenti, now);
      void sincronizzaToken(token);
      return placeholder;
    },
    [token],
  );
```
> Nota: `persistiVoce` e `sincronizzaToken` sono già importati (Fase 2a). Il `setRisposta` debounced NON viene usato qui di proposito.

- [ ] **Step 3: verifica** — `npx tsc --noEmit 2>&1 | grep "RapportinoForm"` → vuoto. `npx eslint components/modules/rapportini/RapportinoForm.tsx` → nessun errore (l'array di dipendenze `[token]` è corretto: `voceIdUploadRef`/`mountedRef`/`latestRisposteRef`/`setVoci`/`persistiVoce`/`sincronizzaToken`/`accodaFoto` sono ref/stabili/import).

- [ ] **Step 4: commit**
```
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(offline): uploadFotoVoce offline-first (blob+coda+placeholder)"
```

---

### Task 4: anteprima dal blob nel `CampoFotoInput`

**Files:** Modify `components/modules/rapportini/CampoInput.tsx`

Quando la risposta del campo è un placeholder (foto non ancora caricata), mostra l'anteprima leggendo il blob locale; e tratta il placeholder come "foto presente" (in attesa di rete).

- [ ] **Step 1: import.** In cima a `components/modules/rapportini/CampoInput.tsx`, aggiungi:
```ts
import { isPlaceholderFoto, blobIdDaPlaceholder } from '@/lib/offline/fotoPlaceholder';
import { leggiBlobFoto } from '@/lib/offline/persistFoto';
```

- [ ] **Step 2: anteprima dal blob.** Dentro `CampoFotoInput`, dopo l'`useEffect` esistente che genera la preview da `localFile`, aggiungi un secondo effetto che carica il blob quando il valore è un placeholder e non c'è `localFile` di sessione:
```ts
  // Anteprima da blob locale per le foto in attesa di rete (placeholder), alla riapertura.
  useEffect(() => {
    if (localFile) return; // l'anteprima di sessione ha la precedenza
    if (!isPlaceholderFoto(valore)) return;
    let attivo = true;
    let url: string | null = null;
    void leggiBlobFoto(valore).then((blob) => {
      if (!attivo || !blob) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    });
    return () => { attivo = false; if (url) URL.revokeObjectURL(url); };
  }, [valore, localFile]);
```

- [ ] **Step 3: stato "in attesa di rete".** Aggiorna i flag/etichette per riconoscere il placeholder. Sostituisci la riga:
```ts
  const hasFotoEsistente = !localFile && typeof valore === 'string' && valore.length > 0;
```
con:
```ts
  const inAttesaRete = isPlaceholderFoto(valore);
  const hasFotoEsistente = !localFile && typeof valore === 'string' && valore.length > 0 && !inAttesaRete;
```
Poi, nel blocco dei badge di stato (dove ci sono "✓ Caricata"/"✓ Già presente"), aggiungi un ramo per il placeholder. Subito prima del badge `uploadStato === 'idle' && hasFotoEsistente`, inserisci:
```tsx
        {!busy && inAttesaRete && (
          <span className="text-xs font-semibold text-[var(--warning-fg,#92400e)]">⏳ in attesa di rete</span>
        )}
```
E nel testo del bottone scatta, cambia la condizione `hasFotoEsistente || uploadStato === 'ok'` in `hasFotoEsistente || inAttesaRete || uploadStato === 'ok'` così mostra "📷 Rifai scatto" anche per una foto in coda.

- [ ] **Step 4: verifica** — `npx tsc --noEmit 2>&1 | grep "CampoInput"` → vuoto. `npx eslint components/modules/rapportini/CampoInput.tsx` → nessun errore (il nuovo effetto ha deps `[valore, localFile]`; `blobIdDaPlaceholder` resta importato se usato — se eslint segnala import inutilizzato, rimuovi `blobIdDaPlaceholder` dall'import e tieni solo `isPlaceholderFoto`).

- [ ] **Step 5: commit**
```
git add components/modules/rapportini/CampoInput.tsx
git commit -m "feat(offline): anteprima foto da blob locale (in attesa di rete)"
```

---

### Task 5: Verifica complessiva Fase 2b

- [ ] **Step 1:** `npx vitest run lib/offline` → tutti i test offline (inclusi `fotoPlaceholder`) verdi.
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errori.
- [ ] **Step 3:** `npx eslint components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/CampoInput.tsx lib/offline/persistFoto.ts lib/offline/fotoPlaceholder.ts` → nessun errore.
- [ ] **Step 4 (QA su Vercel preview):** apri `/r/<token>` online → vai in un intervento, **offline**, scatta/allega una foto → l'anteprima si vede; ricarica **offline** → l'anteprima si rivede (dal blob), badge "⏳ in attesa di rete"; torna **online** → il sync carica la foto (Network: POST `/api/r/.../foto-campo`), la risposta passa al path reale; verifica a DB/storage Supabase che la foto sia arrivata. Verifica anche il **retake offline**: riscattare sostituisce il blob (nessun doppio upload).
- [ ] **Step 5:** commit di chiusura `chore(offline): verifica Fase 2b` (vuoto se nulla).

---

## Self-Review (eseguita)

**Copertura spec (Fase 2b):** foto offline (blob + coda + clientKey univoco) → Task 1,2,3; placeholder + anteprima dal blob alla riapertura → Task 1,4; upload + riscrittura path al sync → usa il branch `foto` della Fase 1 (già implementato e testato); retake dedup → Task 2 (id deterministico per campo + rimozione blob precedente).

**Placeholder:** nessun TODO; ogni step ha codice/comando completo.

**Coerenza tipi:** `PayloadFoto {voceId, chiave, blobId, clientKey}` usata in `accodaFoto` coincide con `types.ts` e con il branch `foto` di `sync.ts`; `placeholderFoto`/`isPlaceholderFoto`/`blobIdDaPlaceholder`/`leggiBlobFoto`/`accodaFoto` coerenti tra definizione e uso.

**Race condition (foto→voce):** mitigata in Task 3 persistendo il placeholder in modo sincrono (await `persistiVoce`) prima del sync, e NON usando il `setRisposta` debounced (così nessun salvataggio ritardato sovrascrive il path reale che il sync riscrive). Il branch `foto` di `sync.ts` riscrive `dbLavoro` + ri-accoda la voce con id canonico → l'ordine `ordineInvio` (foto prima della voce) garantisce che il server non riceva mai il placeholder.

**Limite di verifica:** il wiring dei componenti non è coperto da unit test (env node); verifica reale su **preview Vercel** (Task 5 Step 4) + il test puro `fotoPlaceholder`.

---

## Prossimo sotto-piano

- **Fase 2c — Cassetto "da risolvere" + Background Sync + invio offline:** UI per gli elementi `bloccato` (link scaduto/rifiutato con motivo), gestione `invia` 409 `voci_in_sospeso` nella coda (per riabilitare l'invio offline), registrazione Background Sync nel SW (Android), test e2e Playwright in modalità offline.
