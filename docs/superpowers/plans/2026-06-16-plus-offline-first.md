# "+" operatore offline-first (Fase 1 anti-perdita) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il flusso "+" (intervento manuale + scansione matricola) offline-first: niente pratiche perse, scansione senza vicolo cieco offline, pulsante sync 🔄 sempre visibile.

**Architecture:** Si riusa l'infrastruttura coda offline esistente (`dbBlob`/`dbOutbox`, ramo `manuale` in `lib/offline/sync.ts`, `richiestaId` idempotente). Si aggiunge il pezzo mancante (`accodaManuale`) e si collega la modale; la scansione offline rivela sempre l'inserimento a mano; il pill di sync prende un pulsante 🔄 sempre visibile.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, IndexedDB (adapter `lib/offline/db.ts`), vitest (node), Playwright (e2e harness `/offline-e2e`).

**Working dir (worktree):** `C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline` — tutti i comandi vanno eseguiti da qui.

**Nota baseline:** `npm run lint` e `npx vitest run` complessivi sono già rossi su main; i gate valgono come "nessun problema NUOVO dai file toccati" (verifiche mirate).

---

### Task 1: `idOutboxManuale` (id outbox idempotente)

**Files:**
- Modify: `lib/offline/ids.ts`
- Test: `lib/offline/ids.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/offline/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { idOutboxVoce, idOutboxManuale } from './ids';

describe('id outbox', () => {
  it('voce → voce:token:voceId', () => {
    expect(idOutboxVoce('tok', 'v1')).toBe('voce:tok:v1');
  });
  it('manuale → manuale:token:richiestaId (idempotente per richiesta)', () => {
    expect(idOutboxManuale('tok', 'r-9')).toBe('manuale:tok:r-9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/offline/ids.test.ts`
Expected: FAIL — `idOutboxManuale` is not exported.

- [ ] **Step 3: Add the function**

Append to `lib/offline/ids.ts`:

```ts
/**
 * Id canonico di un elemento outbox di tipo 'manuale'. Idempotente per `richiestaId`
 * (la stessa richiesta non crea doppioni in coda; il server deduplica con lo stesso id).
 */
export function idOutboxManuale(token: string, richiestaId: string): string {
  return `manuale:${token}:${richiestaId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/offline/ids.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/ids.ts lib/offline/ids.test.ts
git commit -m "feat(offline): idOutboxManuale (id outbox idempotente per richiesta)"
```

---

### Task 2: `costruisciManualeOutbox` (builder puro)

**Files:**
- Create: `lib/offline/manualeOutbox.ts`
- Test: `lib/offline/manualeOutbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/offline/manualeOutbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { costruisciManualeOutbox } from './manualeOutbox';
import type { PayloadManuale } from './types';

const payload: PayloadManuale = {
  richiestaId: 'r-1',
  committente: 'acea',
  anagrafica: { nominativo: 'Rossi' },
  risposte: { esito: 'ok' },
  note: null,
  fotoBlobRefs: [{ chiave: 'foto1', blobId: 'bl-1' }],
};

describe('costruisciManualeOutbox', () => {
  it('crea un item manuale con id idempotente e payload completo', () => {
    const item = costruisciManualeOutbox('tok', payload, 1234);
    expect(item.id).toBe('manuale:tok:r-1');
    expect(item.type).toBe('manuale');
    expect(item.token).toBe('tok');
    expect(item.createdAt).toBe(1234);
    expect(item.tentativi).toBe(0);
    expect(item.stato).toBe('in_attesa');
    expect(item.payload).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/offline/manualeOutbox.test.ts`
Expected: FAIL — module `./manualeOutbox` not found.

- [ ] **Step 3: Implement the builder**

Create `lib/offline/manualeOutbox.ts`:

```ts
import { idOutboxManuale } from './ids';
import type { OutboxItem, PayloadManuale } from './types';

/** Costruisce l'elemento outbox canonico per una richiesta manuale ("+"). */
export function costruisciManualeOutbox(
  token: string,
  payload: PayloadManuale,
  now: number,
): Extract<OutboxItem, { type: 'manuale' }> {
  return {
    id: idOutboxManuale(token, payload.richiestaId),
    type: 'manuale',
    token,
    createdAt: now,
    tentativi: 0,
    stato: 'in_attesa',
    payload,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/offline/manualeOutbox.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/offline/manualeOutbox.ts lib/offline/manualeOutbox.test.ts
git commit -m "feat(offline): costruisciManualeOutbox (builder item coda manuale)"
```

---

### Task 3: `accodaManuale` (wiring IndexedDB)

**Files:**
- Create: `lib/offline/persistManuale.ts`

Nota: tocca IndexedDB (`dbBlob`/`dbOutbox`), non testabile in vitest-node (come `accodaFoto`). È coperto dall'e2e nel Task 7. Qui si verifica solo che compili.

- [ ] **Step 1: Implement `accodaManuale`**

Create `lib/offline/persistManuale.ts`:

```ts
import { dbBlob, dbOutbox, indexedDbDisponibile } from './db';
import { costruisciManualeOutbox } from './manualeOutbox';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export type DatiManualeOffline = {
  committente: CommittenteManuale;
  anagrafica: Record<string, unknown>;
  risposte: Record<string, unknown>;
  note?: string | null;
  /** Foto per slot: chiave campo → File scelto. */
  fotoFiles: Record<string, File>;
};

/**
 * Accoda una richiesta manuale ("+") offline-first: salva i blob foto in IndexedDB e
 * mette in coda l'item `manuale` (idempotente per `richiestaId`). L'invio è poi gestito
 * dal ramo `manuale` di `lib/offline/sync.ts` (online subito, oppure alla sync).
 * Best-effort: ritorna null se IndexedDB/crypto non sono disponibili (il chiamante
 * ripiega sul fetch online). NON lancia mai: i dati di campo non si perdono.
 */
export async function accodaManuale(
  token: string,
  dati: DatiManualeOffline,
  now: number,
): Promise<{ richiestaId: string } | null> {
  if (!indexedDbDisponibile() || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    return null;
  }
  try {
    const richiestaId = crypto.randomUUID();
    const fotoBlobRefs: Array<{ chiave: string; blobId: string }> = [];
    for (const [chiave, file] of Object.entries(dati.fotoFiles)) {
      const blobId = crypto.randomUUID();
      await dbBlob.salva(blobId, file);
      fotoBlobRefs.push({ chiave, blobId });
    }
    const item = costruisciManualeOutbox(
      token,
      {
        richiestaId,
        committente: dati.committente,
        anagrafica: dati.anagrafica,
        risposte: dati.risposte,
        note: dati.note ?? null,
        fotoBlobRefs,
      },
      now,
    );
    await dbOutbox.put(item);
    return { richiestaId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "persistManuale|manualeOutbox" || echo "ok"`
Expected: `ok` (nessun errore nei file nuovi).

- [ ] **Step 3: Commit**

```bash
git add lib/offline/persistManuale.ts
git commit -m "feat(offline): accodaManuale (coda offline del + manuale, foto incluse)"
```

---

### Task 4: collegare `ModaleInterventoManuale` alla coda

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Importare gli helper nella modale**

In `components/modules/rapportini/ModaleInterventoManuale.tsx`, dopo gli import esistenti delle limitazioni (dopo la riga `import type { VoceMatricola } from '@/lib/limitazione/matchVociMatricola';`) aggiungere:

```ts
import { accodaManuale } from '@/lib/offline/persistManuale';
import { sincronizzaToken } from '@/lib/offline/sync';
```

- [ ] **Step 2: Cambiare il tipo del prop `onCreata`**

Nella firma dei props della modale, sostituire:

```ts
  onCreata: () => void;
```

con:

```ts
  /** 'inviata' = partita subito (online); 'in-coda' = salvata offline, partirà alla sync. */
  onCreata: (stato: 'inviata' | 'in-coda') => void;
```

- [ ] **Step 3: Riscrivere `handleInvia` (offline-first + fallback)**

Sostituire l'intera funzione `handleInvia` con:

```ts
  const handleInvia = async () => {
    if (!committente) return;
    const mancanti = campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0 && !window.confirm(`Mancano ${mancanti.length} campi obbligatori da compilare: ${mancanti.join(', ')}. Inviare comunque?`)) {
      return;
    }
    setInviando(true);
    setErrore(null);

    // Offline-first: accoda in IndexedDB (la pratica non si perde MAI), poi sincronizza.
    const esito = await accodaManuale(token, { committente, anagrafica, risposte, fotoFiles: foto }, Date.now());
    if (esito) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      void sincronizzaToken(token);
      setInviando(false);
      onCreata(online ? 'inviata' : 'in-coda');
      return;
    }

    // Fallback (IndexedDB non disponibile): invio diretto online, come da comportamento storico.
    try {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({ committente, anagrafica, risposte }));
      for (const c of slotFoto) {
        const f = foto[c.chiave];
        if (f) fd.append(`foto:${c.chiave}`, f, f.name);
      }
      const res = await fetch(`/api/r/${token}/intervento-manuale`, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; dettaglio?: string; mancanti?: string[] };
        throw new Error(messaggioErroreManuale(j, res.status));
      }
      onCreata('inviata');
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setInviando(false);
    }
  };
```

- [ ] **Step 4: Aggiornare `onCreata` in `RapportinoForm` + banner "in coda"**

In `components/modules/rapportini/RapportinoForm.tsx`:

(a) Aggiungere lo stato dopo `const [fotoMancanti, setFotoMancanti] = useState...` (o vicino agli altri `useState`):

```ts
  const [avvisoManuale, setAvvisoManuale] = useState<string | null>(null);
```

(b) Sostituire il prop `onCreata` della `<ModaleInterventoManuale ...>` (attualmente `onCreata={() => { setModaleAperta(false); window.location.reload(); }}`) con:

```tsx
          onCreata={(stato) => {
            setModaleAperta(false);
            if (stato === 'inviata') {
              window.location.reload();
            } else {
              // Offline: la pratica è in coda. Niente reload (la cache non mostrerebbe la
              // nuova voce); conferma all'operatore e tenta una sync appena possibile.
              setAvvisoManuale('Richiesta salvata: verrà inviata alla sincronizzazione.');
              void sincronizzaToken(token);
            }
          }}
```

(c) Subito dopo `<OfflineStatusPill token={token} />` aggiungere il banner:

```tsx
      {avvisoManuale && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3 text-sm text-[var(--brand-text-main)]">
          <span>{avvisoManuale}</span>
          <button type="button" onClick={() => setAvvisoManuale(null)} className="shrink-0 text-xs font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>
      )}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "ModaleInterventoManuale|RapportinoForm" || echo "ok"`
Expected: `ok`.

- [ ] **Step 6: Lint dei file toccati**

Run: `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx`
Expected: nessun errore nuovo.

- [ ] **Step 7: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(offline): il + manuale accoda offline (no perdita) + banner 'in coda'"
```

---

### Task 5: scansione matricola — rete di sicurezza offline

**Files:**
- Modify: `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`

Nota: componente UI (node senza jsdom) → niente unit test; verifica via tsc + browser.

- [ ] **Step 1: Aggiungere lo stato `offline`**

In `CercaMatricolaLimitazione`, accanto agli altri `useState`, aggiungere:

```ts
  const [offline, setOffline] = useState(false);
```

E nel `reset()` aggiungere `setOffline(false);` (così ogni nuova ricerca riparte pulita). Il `reset` diventa:

```ts
  const reset = () => {
    setErrore(null); setCercato(false); setSuggerimenti([]); setSuggVoci([]);
    setAltroOperatore(null); setMisuratore(null); setOffline(false);
  };
```

- [ ] **Step 2: Gestire offline e errore di rete in `cerca` (niente vicolo cieco)**

Sostituire il corpo di `cerca` dopo il match locale (dal `setCercando(true);` in poi) con:

```ts
    // Suggerimenti "simili" calcolati in locale (servono anche offline).
    const simili = matricoleSimili(
      v,
      vociAttive.filter((x): x is VoceMatricola & { matricola: string } => x.matricola != null && x.matricola !== ''),
      5,
    );

    // OFFLINE: niente censimento dal server → mostra subito la via "Inserisci a mano".
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSuggVoci(simili);
      setSuggerimenti([]);
      setOffline(true);
      setCercato(true);
      return;
    }

    setCercando(true);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      if (!res.ok) { setErrore('Ricerca non riuscita.'); setSuggVoci(simili); setOffline(true); setCercato(true); return; }
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore; altroOperatore: string | null }
        | { trovato: false; suggerimenti: CensitoMisuratore[]; altroOperatore: string | null };
      setAltroOperatore(j.altroOperatore);
      setSuggVoci(simili);
      if (j.trovato) {
        setMisuratore(j.misuratore);
        if (!j.altroOperatore) { onTrovato(j.misuratore); return; }
      } else {
        setSuggerimenti(j.suggerimenti);
      }
      setCercato(true);
    } catch {
      // Errore di rete: NON un vicolo cieco → rivela l'inserimento a mano.
      setSuggVoci(simili);
      setOffline(true);
      setCercato(true);
    } finally {
      setCercando(false);
    }
```

(Questo rimuove le precedenti `setSuggVoci(simili)` duplicate dentro il `try`: il calcolo dei simili ora è unico, prima del fetch.)

- [ ] **Step 3: Mostrare la nota offline nel pannello risultati**

Dentro il blocco `{cercato && (...)}`, nel ramo `else` (quello con `suggVoci`/`suggerimenti`), subito prima del paragrafo `{suggVoci.length === 0 && suggerimenti.length === 0 && (...)}`, aggiungere:

```tsx
              {offline && (
                <p className="rounded-lg border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] px-3 py-2 text-xs font-semibold text-[var(--warning-fg,#92400e)]">
                  Offline: censimento non disponibile. Inserisci i dati a mano: verranno verificati alla sincronizzazione.
                </p>
              )}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "CercaMatricolaLimitazione" || echo "ok"`
Expected: `ok`.

- [ ] **Step 5: Lint**

Run: `npx eslint components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`
Expected: nessun errore nuovo.

- [ ] **Step 6: Commit**

```bash
git add components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx
git commit -m "fix(offline): scansione matricola offline non blocca (rivela 'inserisci a mano')"
```

---

### Task 6: pulsante sync 🔄 sempre visibile

**Files:**
- Modify: `lib/offline/useStatoSync.ts`
- Modify: `components/offline/OfflineStatusPill.tsx`

- [ ] **Step 1: `sincronizzaOra` ritorna una Promise (per animare l'icona)**

In `lib/offline/useStatoSync.ts`:

(a) Sostituire `sincronizzaOra`:

```ts
  const sincronizzaOra = useCallback(
    () => sincronizzaToken(token).then(() => aggiorna()),
    [token, aggiorna],
  );
```

(b) Aggiornare il tipo di ritorno della hook:

```ts
export function useStatoSync(token: string): StatoSync & { sincronizzaOra: () => Promise<void> } {
```

- [ ] **Step 2: Pulsante 🔄 sempre visibile nel pill**

Sostituire l'intero `OfflineStatusPill.tsx` con:

```tsx
'use client';

import { useState } from 'react';
import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Striscia di stato sincronizzazione per le pagine operatore.
 * Stato a sinistra (offline/in attesa/sincronizzato/da risolvere) + pulsante 🔄
 * sempre visibile a destra: forza la sincronizzazione e gira durante l'invio.
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online, sincronizzaOra } = useStatoSync(token);
  const [girando, setGirando] = useState(false);

  let testo: string;
  let cls: string;
  if (bloccati > 0) {
    testo = `${bloccati} da risolvere`;
    cls = 'bg-[var(--danger-soft)] text-[var(--danger)]';
  } else if (inAttesa > 0) {
    testo = online ? `Sincronizzazione… (${inAttesa})` : `Offline · ${inAttesa} in attesa`;
    cls = 'bg-[var(--warning-soft,#fef3c7)] text-[var(--warning-fg,#92400e)]';
  } else {
    testo = online ? 'Tutto sincronizzato' : 'Offline';
    cls = online ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]';
  }

  const onSync = async () => {
    if (girando) return;
    setGirando(true);
    try {
      await sincronizzaOra();
    } finally {
      setGirando(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        {testo}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={girando}
        aria-label="Sincronizza ora"
        title={online ? 'Sincronizza ora' : 'Offline: i dati sono salvati, partiranno alla connessione'}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        Sincronizza
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "useStatoSync|OfflineStatusPill" || echo "ok"`
Expected: `ok`.

- [ ] **Step 4: Lint**

Run: `npx eslint lib/offline/useStatoSync.ts components/offline/OfflineStatusPill.tsx`
Expected: nessun errore nuovo.

- [ ] **Step 5: Commit**

```bash
git add lib/offline/useStatoSync.ts components/offline/OfflineStatusPill.tsx
git commit -m "feat(offline): pulsante sync sempre visibile (icona che gira durante l'invio)"
```

---

### Task 7: e2e — intervento manuale offline → sync

**Files:**
- Modify: `app/offline-e2e/HarnessClient.tsx`
- Modify: `e2e/offline.spec.ts`

- [ ] **Step 1: Esporre `accodaManuale` nell'harness**

In `app/offline-e2e/HarnessClient.tsx`:

(a) Aggiungere l'import:

```ts
import { accodaManuale } from '@/lib/offline/persistManuale';
```

(b) Aggiungere alla `interface Window['__offline']` la riga:

```ts
      accodaManuale: typeof accodaManuale;
```

(c) Aggiungere `accodaManuale,` nell'oggetto assegnato a `window.__offline`.

- [ ] **Step 2: Scrivere il test e2e**

Aggiungere in fondo a `e2e/offline.spec.ts`:

```ts
test('intervento manuale offline → in coda → al sync arriva a /intervento-manuale', async ({ page, context }) => {
  const TOKM = 'e2e-manuale';
  let manualeUpload = 0;
  await page.route('**/api/r/**/intervento-manuale', async (route) => {
    manualeUpload += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/offline-e2e');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  // OFFLINE: accoda una richiesta manuale con una foto.
  await context.setOffline(true);
  await page.evaluate(async (t) => {
    const file = new File([new Blob(['fake'], { type: 'image/jpeg' })], 'f.jpg', { type: 'image/jpeg' });
    await window.__offline!.accodaManuale(
      t,
      { committente: 'acea', anagrafica: { nominativo: 'Rossi' }, risposte: { esito: 'ok' }, fotoFiles: { foto1: file } },
      Date.now(),
    );
  }, TOKM);
  const coda = await page.evaluate((t) => window.__offline!.codaPerToken(t), TOKM);
  expect(coda.some((i) => i.type === 'manuale')).toBe(true);
  expect(manualeUpload).toBe(0);

  // ONLINE: sincronizza → la richiesta parte e la coda si svuota.
  await context.setOffline(false);
  await page.evaluate((t) => window.__offline!.sincronizzaToken(t), TOKM);
  await expect.poll(() => manualeUpload).toBeGreaterThan(0);
  await expect.poll(async () => (await page.evaluate((t) => window.__offline!.codaPerToken(t), TOKM)).length).toBe(0);
});
```

- [ ] **Step 3: Eseguire l'e2e**

Run: `PLAYWRIGHT_BROWSERS_PATH="$HOME/AppData/Local/ms-playwright" npx playwright test`
Expected: 3 test PASS (i 2 esistenti + il nuovo manuale).

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "HarnessClient|offline.spec" || echo "ok"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/offline-e2e/HarnessClient.tsx e2e/offline.spec.ts
git commit -m "test(offline): e2e intervento manuale offline → sync → /intervento-manuale"
```

---

### Task 8: verifica complessiva Fase 1

**Files:** nessuno (gate di verifica).

- [ ] **Step 1: tsc pulito**

Run: `npx tsc --noEmit 2>&1 | head -20; echo "[exit ${PIPESTATUS[0]}]"`
Expected: `[exit 0]`.

- [ ] **Step 2: eslint dei file toccati**

Run:
```bash
npx eslint lib/offline/ids.ts lib/offline/manualeOutbox.ts lib/offline/persistManuale.ts lib/offline/useStatoSync.ts components/offline/OfflineStatusPill.tsx components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx app/offline-e2e/HarnessClient.tsx e2e/offline.spec.ts
```
Expected: nessun output (pulito).

- [ ] **Step 3: unit offline**

Run: `npx vitest run lib/offline 2>&1 | grep -E "Test Files|Tests "`
Expected: tutti PASS (inclusi `ids.test.ts`, `manualeOutbox.test.ts`).

- [ ] **Step 4: e2e**

Run: `PLAYWRIGHT_BROWSERS_PATH="$HOME/AppData/Local/ms-playwright" npx playwright test`
Expected: 3 PASS.

- [ ] **Step 5: handoff al controller**

Niente push qui: il controller fa fetch + rebase su `origin/main` + push via refspec con OK dell'utente, e aggiorna la memoria.

## Self-review (controllo copertura spec)

- Bug 2 (manuale offline) → Task 1-4, 7. ✓
- Bug 1 (scansione offline) → Task 5. ✓
- Pulsante sync 🔄 → Task 6. ✓
- Fase 2 (cache censimento) → fuori scope, documentata nella spec. ✓
- Niente placeholder; tipi coerenti (`PayloadManuale`, `idOutboxManuale`, `costruisciManualeOutbox`, `accodaManuale`, `onCreata('inviata'|'in-coda')`). ✓
