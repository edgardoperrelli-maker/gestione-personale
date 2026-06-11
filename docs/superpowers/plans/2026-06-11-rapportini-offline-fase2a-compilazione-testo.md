# Rapportini offline — Fase 2a: Compilazione testo offline (local-first) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare il form rapportino (`RapportinoForm`) al data layer offline della Fase 1, così l'operatore può compilare i campi **testo/select/crocetta/numero** anche senza rete: ogni modifica è scritta subito in locale (`lavoro`) e accodata (`outbox`), sopravvive a reload/chiusura offline, e si sincronizza in silenzio al ritorno della connessione. Una pillola di stato e un badge per-voce mostrano lo stato di sincronizzazione. Le **foto** restano online-dirette (Fase 2b).

**Architecture:** Local-first. `setRisposta` non fa più un POST diretto: scrive in `dbLavoro` e fa upsert di un elemento `voce` in `dbOutbox` (id canonico `idOutboxVoce`), poi `avviaSyncAutomatica` svuota la coda quando c'è rete. Al mount il form **reidrata** le risposte locali sopra i dati del server e salva uno **snapshot** per la consultazione offline. La logica testabile (merge reidratazione, costruzione elemento outbox, derivazione stato badge) è estratta in helper puri con test vitest; il wiring di `RapportinoForm` resta sottile e si verifica con `tsc` + QA su Vercel.

**Tech Stack:** Next.js 15 App Router, React 19, IndexedDB (data layer Fase 1 in `lib/offline/`), vitest 2 (env node).

---

## Contesto di partenza (codice esistente — leggere prima di modificare)

- `components/modules/rapportini/RapportinoForm.tsx` — form client. Punti chiave (numeri di riga indicativi, VERIFICARE leggendo il file):
  - `saveVoce(voceId)` (~127): POST `/api/r/${token}/voce` con `{voceId, risposte}` + retry/backoff in memoria + gestione 409 (`setBloccato`).
  - `setRisposta(voceId, chiave, valore)` (~163): aggiorna stato + `latestRisposteRef` + debounce → `saveVoce`.
  - `uploadFotoVoce` (~200): upload foto online (NON si tocca in 2a).
  - `handleInvia` (~259): POST `/api/r/${token}/invia`.
  - `saveStates` (record voceId→SaveState) passato a `VoceFocus` come `saveState`.
  - Props: `token`, `rapportino {staff_name, data}`, `voci`, `campiSnapshot`, `infoCampi`, ecc.
- `components/modules/rapportini/SaveBadge.tsx` — `SaveState = 'idle'|'saving'|'saved'|'error'`; `SaveBadge({state})`.
- `lib/offline/` (Fase 1, già presenti e testati):
  - `types.ts`: `OutboxItem`, `LavoroVoce = {chiave, token, voceId, risposte, aggiornatoIl}`, `PayloadVoce`.
  - `db.ts`: `dbLavoro {salva, perToken, rimuovi}`, `dbOutbox {tutti, perToken, put, rimuovi}`, `indexedDbDisponibile()`.
  - `outboxModel.ts`: `applicaUpsert(esistenti, nuovo)`, `chiaveCoalescing`.
  - `ids.ts`: `idOutboxVoce(token, voceId)` = `voce:${token}:${voceId}`.
  - `sync.ts`: `sincronizzaToken(token)`, `avviaSyncAutomatica(token): () => void`.
  - `snapshot.ts`: `salvaSnapshot(token, tipo, dati)`, `leggiSnapshot(token)`.
- `app/r/[token]/page.tsx` — Server Component che passa i dati a `RapportinoForm`.

> **Convenzione:** commit in italiano, prefisso `feat(offline)`/`test(offline)`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. SEMPRE eseguire i comandi dal worktree (`cd "C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline"`). Verificare la logica pura con `npx vitest run <file>`; il wiring con `npx tsc --noEmit` (NON `npm run build`: fallisce su una route admin pre-esistente).

## Struttura file (Fase 2a)

**Creati:**
- `lib/offline/rehydrate.ts` + `.test.ts` — `mergeLavoro(voci, lavori)` (puro).
- `lib/offline/voceOutbox.ts` + `.test.ts` — `costruisciVoceOutbox(...)` + `statoBadgeDaOutbox(...)` (puri).
- `lib/offline/persistVoce.ts` — `persistiVoce(token, voceId, risposte)` + `reidrataVoci(token, voci)` (wiring db sottile).
- `lib/offline/useStatoSync.ts` — hook stato coda per-token.
- `components/offline/OfflineStatusPill.tsx` — pillola di stato + "Sincronizza ora".

**Modificati:**
- `components/modules/rapportini/SaveBadge.tsx` — aggiunge stati `queued` e `bloccato`.
- `components/modules/rapportini/RapportinoForm.tsx` — reidratazione, save local-first, stato badge da outbox, pillola, snapshot, invia via outbox.

---

### Task 1: `mergeLavoro` — reidratazione (logica pura)

**Files:** Create `lib/offline/rehydrate.ts` + `lib/offline/rehydrate.test.ts`

- [ ] **Step 1: test (failing)** — `lib/offline/rehydrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeLavoro } from './rehydrate';
import type { LavoroVoce } from './types';

type V = { id: string; risposte: Record<string, unknown> };
const lav = (voceId: string, risposte: Record<string, unknown>, aggiornatoIl = 1): LavoroVoce =>
  ({ chiave: `tok:${voceId}`, token: 'tok', voceId, risposte, aggiornatoIl });

describe('mergeLavoro', () => {
  it('sovrascrive le risposte della voce con quelle locali', () => {
    const voci: V[] = [{ id: 'v1', risposte: { a: 1 } }, { id: 'v2', risposte: { b: 2 } }];
    const out = mergeLavoro(voci, [lav('v1', { a: 9, c: 3 })]);
    expect(out[0].risposte).toEqual({ a: 9, c: 3 });
    expect(out[1].risposte).toEqual({ b: 2 }); // v2 senza lavoro locale resta invariata
  });
  it('ignora lavori senza voce corrispondente', () => {
    const voci: V[] = [{ id: 'v1', risposte: {} }];
    const out = mergeLavoro(voci, [lav('zzz', { x: 1 })]);
    expect(out).toHaveLength(1);
    expect(out[0].risposte).toEqual({});
  });
  it('non muta gli oggetti voce in input', () => {
    const voci: V[] = [{ id: 'v1', risposte: { a: 1 } }];
    const out = mergeLavoro(voci, [lav('v1', { a: 2 })]);
    expect(voci[0].risposte).toEqual({ a: 1 }); // input invariato
    expect(out[0]).not.toBe(voci[0]);
  });
});
```
Run `npx vitest run lib/offline/rehydrate.test.ts` → FAIL.

- [ ] **Step 2: implementa** `lib/offline/rehydrate.ts`:

```ts
import type { LavoroVoce } from './types';

/**
 * Reidratazione: sovrascrive le `risposte` di ogni voce con la versione locale
 * (`lavoro`) se presente. L'operatore è l'unico editor del suo token → la copia
 * locale è la più recente. Non muta gli input (ritorna nuovi oggetti per le voci toccate).
 */
export function mergeLavoro<T extends { id: string; risposte: Record<string, unknown> }>(
  voci: T[],
  lavori: LavoroVoce[],
): T[] {
  if (lavori.length === 0) return voci;
  const perVoce = new Map(lavori.map((l) => [l.voceId, l.risposte]));
  return voci.map((v) => (perVoce.has(v.id) ? { ...v, risposte: perVoce.get(v.id)! } : v));
}
```
Run → PASS.

- [ ] **Step 3: commit**
```
git add lib/offline/rehydrate.ts lib/offline/rehydrate.test.ts
git commit -m "feat(offline): mergeLavoro reidratazione voci (logica pura)"
```

---

### Task 2: `costruisciVoceOutbox` + `statoBadgeDaOutbox` (logica pura)

**Files:** Create `lib/offline/voceOutbox.ts` + `lib/offline/voceOutbox.test.ts`

- [ ] **Step 1: test (failing)** — `lib/offline/voceOutbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { costruisciVoceOutbox, statoBadgeDaOutbox } from './voceOutbox';
import type { OutboxItem } from './types';

describe('costruisciVoceOutbox', () => {
  it('crea un elemento voce con id canonico e payload', () => {
    const it = costruisciVoceOutbox('tok', 'v1', { a: 1 }, 1234);
    expect(it.id).toBe('voce:tok:v1');
    expect(it.type).toBe('voce');
    expect(it.token).toBe('tok');
    expect(it.createdAt).toBe(1234);
    expect(it.stato).toBe('in_attesa');
    expect(it.payload).toEqual({ voceId: 'v1', risposte: { a: 1 } });
  });
});

describe('statoBadgeDaOutbox', () => {
  const base = (stato: OutboxItem['stato']): OutboxItem =>
    ({ id: 'voce:tok:v1', type: 'voce', token: 'tok', createdAt: 1, tentativi: 0, stato, payload: { voceId: 'v1', risposte: {} } });
  it('nessun elemento → saved (tutto sincronizzato)', () => {
    expect(statoBadgeDaOutbox(undefined)).toBe('saved');
  });
  it('in_attesa → queued', () => {
    expect(statoBadgeDaOutbox(base('in_attesa'))).toBe('queued');
  });
  it('in_invio → saving', () => {
    expect(statoBadgeDaOutbox(base('in_invio'))).toBe('saving');
  });
  it('errore → queued (in attesa di rete, non un errore definitivo)', () => {
    expect(statoBadgeDaOutbox(base('errore'))).toBe('queued');
  });
  it('bloccato → bloccato', () => {
    expect(statoBadgeDaOutbox(base('bloccato'))).toBe('bloccato');
  });
});
```
Run → FAIL.

- [ ] **Step 2: implementa** `lib/offline/voceOutbox.ts`:

```ts
import { idOutboxVoce } from './ids';
import type { OutboxItem, SaveStateOffline } from './types';

/** Costruisce l'elemento outbox canonico per il salvataggio di una voce. */
export function costruisciVoceOutbox(
  token: string,
  voceId: string,
  risposte: Record<string, unknown>,
  now: number,
): Extract<OutboxItem, { type: 'voce' }> {
  return {
    id: idOutboxVoce(token, voceId),
    type: 'voce',
    token,
    createdAt: now,
    tentativi: 0,
    stato: 'in_attesa',
    payload: { voceId, risposte },
  };
}

/**
 * Mappa lo stato dell'elemento outbox della voce nello stato del badge UI.
 * `errore` (rete) viene mostrato come "in attesa di rete" (queued), non come errore
 * definitivo: l'errore vero per l'operatore è solo `bloccato` (link scaduto, ecc.).
 */
export function statoBadgeDaOutbox(item: OutboxItem | undefined): SaveStateOffline {
  if (!item) return 'saved';
  switch (item.stato) {
    case 'in_invio': return 'saving';
    case 'bloccato': return 'bloccato';
    default: return 'queued'; // in_attesa | errore
  }
}
```

- [ ] **Step 3: aggiungi il tipo `SaveStateOffline` a `lib/offline/types.ts`.** In fondo a `lib/offline/types.ts` aggiungi:
```ts
/** Stato del badge di salvataggio lato form (estende i casi UI). */
export type SaveStateOffline = 'idle' | 'saving' | 'saved' | 'error' | 'queued' | 'bloccato';
```
Run `npx vitest run lib/offline/voceOutbox.test.ts` → PASS.

- [ ] **Step 4: commit**
```
git add lib/offline/voceOutbox.ts lib/offline/voceOutbox.test.ts lib/offline/types.ts
git commit -m "feat(offline): costruzione voce outbox + stato badge (logica pura)"
```

---

### Task 3: `persistVoce` — wiring db (browser)

**Files:** Create `lib/offline/persistVoce.ts`

- [ ] **Step 1: implementa** `lib/offline/persistVoce.ts`:

```ts
import { dbLavoro, dbOutbox, indexedDbDisponibile } from './db';
import { applicaUpsert } from './outboxModel';
import { costruisciVoceOutbox } from './voceOutbox';
import { mergeLavoro } from './rehydrate';

/**
 * Salva localmente le risposte di una voce e accoda (coalescente) il salvataggio
 * remoto. Best-effort: se IndexedDB non è disponibile non lancia.
 * Ritorna true se è stato persistito in locale.
 */
export async function persistiVoce(
  token: string,
  voceId: string,
  risposte: Record<string, unknown>,
  now: number,
): Promise<boolean> {
  if (!indexedDbDisponibile()) return false;
  try {
    await dbLavoro.salva({ chiave: `${token}:${voceId}`, token, voceId, risposte, aggiornatoIl: now });
    const esistenti = await dbOutbox.perToken(token);
    const aggiornata = applicaUpsert(esistenti, costruisciVoceOutbox(token, voceId, risposte, now));
    const item = aggiornata.find((i) => i.id === `voce:${token}:${voceId}`);
    if (item) await dbOutbox.put(item);
    return true;
  } catch {
    return false;
  }
}

/** Reidrata le voci con le risposte locali salvate per il token. Best-effort. */
export async function reidrataVoci<T extends { id: string; risposte: Record<string, unknown> }>(
  token: string,
  voci: T[],
): Promise<T[]> {
  if (!indexedDbDisponibile()) return voci;
  try {
    const lavori = await dbLavoro.perToken(token);
    return mergeLavoro(voci, lavori);
  } catch {
    return voci;
  }
}
```

- [ ] **Step 2: verifica tsc** — `npx tsc --noEmit 2>&1 | grep "lib/offline/persistVoce"` → vuoto.

- [ ] **Step 3: commit**
```
git add lib/offline/persistVoce.ts
git commit -m "feat(offline): persistiVoce + reidrataVoci (wiring IndexedDB)"
```

---

### Task 4: hook `useStatoSync` (browser)

**Files:** Create `lib/offline/useStatoSync.ts`

- [ ] **Step 1: implementa** `lib/offline/useStatoSync.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { dbOutbox, indexedDbDisponibile } from './db';
import { sincronizzaToken } from './sync';
import type { OutboxItem } from './types';

export type StatoSync = {
  inAttesa: number;   // in_attesa | in_invio | errore
  bloccati: number;   // richiedono intervento (cassetto "da risolvere")
  perVoce: Record<string, OutboxItem>; // voceId → elemento (per il badge)
  online: boolean;
};

/**
 * Stato della coda per un token: conteggi + mappa per-voce + online/offline.
 * Si aggiorna a intervallo, agli eventi online/offline, e quando torna in primo piano.
 * Espone `sincronizzaOra` per il pulsante manuale.
 */
export function useStatoSync(token: string): StatoSync & { sincronizzaOra: () => void } {
  const [stato, setStato] = useState<StatoSync>({ inAttesa: 0, bloccati: 0, perVoce: {}, online: true });

  const aggiorna = useCallback(async () => {
    if (!indexedDbDisponibile()) return;
    try {
      const items = await dbOutbox.perToken(token);
      const perVoce: Record<string, OutboxItem> = {};
      let inAttesa = 0;
      let bloccati = 0;
      for (const it of items) {
        if (it.type === 'voce') perVoce[it.payload.voceId] = it;
        if (it.stato === 'bloccato') bloccati += 1;
        else inAttesa += 1;
      }
      setStato({ inAttesa, bloccati, perVoce, online: typeof navigator === 'undefined' ? true : navigator.onLine });
    } catch {
      /* best-effort */
    }
  }, [token]);

  const sincronizzaOra = useCallback(() => {
    void sincronizzaToken(token).then(() => aggiorna());
  }, [token, aggiorna]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    void aggiorna();
    const id = window.setInterval(aggiorna, 3000);
    const onOnline = () => { sincronizzaOra(); };
    const onVis = () => { if (document.visibilityState === 'visible') void aggiorna(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', aggiorna);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', aggiorna);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [aggiorna, sincronizzaOra]);

  return { ...stato, sincronizzaOra };
}
```

- [ ] **Step 2: verifica tsc** — `npx tsc --noEmit 2>&1 | grep "useStatoSync"` → vuoto.

- [ ] **Step 3: commit**
```
git add lib/offline/useStatoSync.ts
git commit -m "feat(offline): hook useStatoSync (stato coda per-token)"
```

---

### Task 5: `SaveBadge` con stati `queued` e `bloccato`

**Files:** Modify `components/modules/rapportini/SaveBadge.tsx`

- [ ] **Step 1: estendi il componente.** Sostituisci INTERAMENTE `components/modules/rapportini/SaveBadge.tsx` con:

```tsx
'use client';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'queued' | 'bloccato';

export function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string }> = {
    saving: { label: 'salvataggio…', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)] border-[var(--brand-border)]' },
    saved: { label: 'salvato ✓', cls: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent' },
    error: { label: 'non salvato — riprova', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent' },
    queued: { label: 'in attesa di rete', cls: 'bg-[var(--warning-soft,#fef3c7)] text-[var(--warning-fg,#92400e)] border-transparent' },
    bloccato: { label: 'da risolvere', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent' },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`} aria-live="polite">
      {(state === 'saving' || state === 'queued') && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
```

- [ ] **Step 2: verifica** — `npx tsc --noEmit 2>&1 | grep "SaveBadge"` → vuoto. `npx eslint components/modules/rapportini/SaveBadge.tsx` → nessun errore.

> Nota: `SaveState` ora coincide con `SaveStateOffline` (Task 2). Consumatori esistenti (`VoceFocus`, `RapportinoForm`) usano un sottoinsieme: nessuna rottura.

- [ ] **Step 3: commit**
```
git add components/modules/rapportini/SaveBadge.tsx
git commit -m "feat(offline): SaveBadge stati 'in attesa di rete' e 'da risolvere'"
```

---

### Task 6: `OfflineStatusPill`

**Files:** Create `components/offline/OfflineStatusPill.tsx`

- [ ] **Step 1: implementa** `components/offline/OfflineStatusPill.tsx`:

```tsx
'use client';

import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Pillola di stato sincronizzazione per le pagine operatore.
 * Offline/in attesa → conteggio; tutto sincronizzato → conferma; bloccati → avviso.
 * Mostra "Sincronizza ora" quando c'è qualcosa in coda.
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online, sincronizzaOra } = useStatoSync(token);

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

  return (
    <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        {testo}
      </span>
      {inAttesa > 0 && online && (
        <button
          type="button"
          onClick={sincronizzaOra}
          className="rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
        >
          Sincronizza ora
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: verifica** — `npx tsc --noEmit 2>&1 | grep "OfflineStatusPill"` → vuoto.

- [ ] **Step 3: commit**
```
git add components/offline/OfflineStatusPill.tsx
git commit -m "feat(offline): pillola di stato sincronizzazione operatore"
```

---

### Task 7: Wiring di `RapportinoForm` (local-first)

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

Obiettivo: (a) reidratare al mount; (b) `setRisposta` salva in locale + accoda invece del POST diretto; (c) il `saveState` per voce deriva dalla coda; (d) montare la pillola; (e) avviare la sync automatica; (f) salvare lo snapshot; (g) `handleInvia` accoda l'invio. Le foto restano invariate (Fase 2b).

> Leggere il file PRIMA. Gli anchor sotto sono indicativi.

- [ ] **Step 1: import dei moduli offline.** In cima al file, dopo gli import esistenti, aggiungi:
```ts
import { reidrataVoci, persistiVoce } from '@/lib/offline/persistVoce';
import { statoBadgeDaOutbox } from '@/lib/offline/voceOutbox';
import { useStatoSync } from '@/lib/offline/useStatoSync';
import { avviaSyncAutomatica, sincronizzaToken } from '@/lib/offline/sync';
import { salvaSnapshot } from '@/lib/offline/snapshot';
import { OfflineStatusPill } from '@/components/offline/OfflineStatusPill';
```

- [ ] **Step 2: avvia sync + snapshot al mount.** Dopo gli `useEffect` esistenti (dopo quello che pulisce i timer, ~riga 120), aggiungi:
```ts
  // Avvio sincronizzazione automatica + salvataggio snapshot per la consultazione offline.
  useEffect(() => {
    salvaSnapshot(token, 'rapportino', {
      rapportino, voci: vociOrdinate, campiSnapshot, infoCampi, titoloCampi,
    });
    const stop = avviaSyncAutomatica(token);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
```

- [ ] **Step 3: reidratazione al mount.** Subito dopo lo `useState` `voci` (~riga 86), aggiungi un effetto che applica le risposte locali:
```ts
  // Reidratazione: sovrappone le risposte salvate offline ai dati del server.
  useEffect(() => {
    let attivo = true;
    void reidrataVoci(token, vociOrdinate).then((reidratate) => {
      if (!attivo) return;
      setVoci(reidratate);
      reidratate.forEach((v) => { latestRisposteRef.current[v.id] = v.risposte; });
    });
    return () => { attivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
```

- [ ] **Step 4: stato coda per i badge.** Dopo gli altri hook di stato (~riga 97), aggiungi:
```ts
  const { perVoce: outboxPerVoce } = useStatoSync(token);
```

- [ ] **Step 5: `setRisposta` local-first.** Sostituisci il corpo di `setRisposta` (la versione attuale fa `setSaveState('saving')` + debounce→`saveVoce` che POSTa). Nuova versione: aggiorna lo stato, scrive in locale, accoda, e lascia che la sync giri (niente POST diretto):
```ts
  const setRisposta = useCallback(
    (voceId: string, chiave: string, valore: unknown) => {
      if (disabilitato) return;
      const now = Date.now();
      let risposteAggiornate: Record<string, unknown> = {};
      setVoci((prev) =>
        prev.map((v) => {
          if (v.id !== voceId) return v;
          const risposte = { ...v.risposte, [chiave]: valore };
          risposteAggiornate = risposte;
          latestRisposteRef.current[voceId] = risposte;
          return { ...v, risposte };
        }),
      );
      // Persisti in locale + accoda (debounce per non scrivere a ogni tasto).
      clearTimeout(timersRef.current[voceId]);
      timersRef.current[voceId] = setTimeout(() => {
        void persistiVoce(token, voceId, latestRisposteRef.current[voceId] ?? risposteAggiornate, Date.now())
          .then(() => sincronizzaToken(token));
      }, DEBOUNCE_MS);
    },
    [disabilitato, token],
  );
```

- [ ] **Step 6: `flushVoce` immediato.** Sostituisci `flushVoce` per persistere+sincronizzare subito (usato da "Salva e avanti"):
```ts
  const flushVoce = useCallback(
    (voceId: string) => {
      if (disabilitato) return;
      clearTimeout(timersRef.current[voceId]);
      void persistiVoce(token, voceId, latestRisposteRef.current[voceId] ?? {}, Date.now())
        .then(() => sincronizzaToken(token));
    },
    [disabilitato, token],
  );
```

- [ ] **Step 7: badge per voce dalla coda.** Dove si calcola il `saveState` passato a `VoceFocus` (nel render del ramo `vista === 'focus'`, attualmente `saveState={saveStates[voci[indiceCorrente].id] ?? 'idle'}`), sostituisci con la derivazione dalla coda:
```tsx
          saveState={statoBadgeDaOutbox(outboxPerVoce[voci[indiceCorrente].id])}
```
Rimuovi lo stato `saveStates`/`setSaveState`/`setSaveStates` e il vecchio `saveVoce` (non più usati: il salvataggio passa da `persistiVoce`+sync). Rimuovi anche `attemptsRef`/`MAX_BACKOFF_MS` se diventano inutilizzati. (Mantieni `bloccato`/`setBloccato` solo se ancora usati dal banner; se `saveVoce` era l'unico a settarli, il blocco ora arriva dalla coda → vedi Step 8.)

- [ ] **Step 8: gestione "bloccato" dalla coda.** Il vecchio 409 era gestito in `saveVoce`. Ora un elemento `bloccato` in coda indica link scaduto/non modificabile. Sostituisci la condizione del banner `bloccato` esistente con una derivata dalla coda: usa `const { bloccati } = useStatoSync(token)` (già disponibile da Step 4 estendendo il destructuring) e mostra il banner "Rapportino non più modificabile…" quando `bloccati > 0`. Mantieni il messaggio esistente.

- [ ] **Step 9: pillola in cima.** Nel `return` principale, come primo figlio del `<div className="mx-auto max-w-[480px]">` (vista lista) — o sopra il contenuto — inserisci `<OfflineStatusPill token={token} />`.

- [ ] **Step 10: `handleInvia` via coda.** Sostituisci il POST diretto di `handleInvia` con l'accodamento di un elemento `invia` + sync immediata, mantenendo la UX (stato `inviando`, gestione esito). Implementazione:
```ts
  const handleInvia = useCallback(async () => {
    if (disabilitato || inviando || !inviabile) return;
    setInviando(true);
    try {
      const { dbOutbox } = await import('@/lib/offline/db');
      await dbOutbox.put({ id: `invia:${token}`, type: 'invia', token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: {} });
      const vuota = await sincronizzaToken(token);
      // Se online e tutto sincronizzato, l'invio è andato: rifletti lo stato inviato.
      if (vuota && typeof navigator !== 'undefined' && navigator.onLine) {
        setInviato(true);
        setReadOnly(true);
        setVista('lista');
      }
      // Altrimenti l'invio resta in coda e parte appena la rete/tutto-sincronizzato lo consente.
    } catch {
      window.alert('Invio non riuscito. Riprova.');
    } finally {
      if (mountedRef.current) setInviando(false);
    }
  }, [disabilitato, inviando, inviabile, token]);
```
> Nota: la gestione del 409 "voci in sospeso" (banner dedicato) resta da raffinare in Fase 2c (oggi un 409 finisce `bloccato`). Per 2a è accettabile: l'invio offline si accoda e parte al ripristino.

- [ ] **Step 11: verifica** — `npx tsc --noEmit 2>&1 | grep -E "RapportinoForm|rapportini"` → nessun errore NUOVO introdotto dalle modifiche (ignora errori pre-esistenti). `npx eslint components/modules/rapportini/RapportinoForm.tsx` → nessun errore nuovo. Esegui anche `npx vitest run lib/offline` → tutti verdi.

- [ ] **Step 12: commit**
```
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(offline): RapportinoForm local-first (lavoro+outbox+reidratazione+pillola)"
```

---

### Task 8: Verifica complessiva Fase 2a

- [ ] **Step 1:** `npx vitest run lib/offline` → tutti i test offline (Fase 1 + rehydrate + voceOutbox) verdi.
- [ ] **Step 2:** `npx tsc --noEmit` → nessun errore nei file della feature (offline + rapportini toccati).
- [ ] **Step 3 (QA su Vercel preview):** apri `/r/<token>` online → compila un campo testo → DevTools Application: `rapportini-offline` IndexedDB ha `lavoro` + `outbox`; passa offline → compila un altro campo → ricarica offline: i valori restano (reidratazione) e il badge mostra "in attesa di rete"; torna online → la coda si svuota, badge "salvato", pillola "Tutto sincronizzato". Verifica a DB Supabase che le `risposte` siano arrivate.
- [ ] **Step 4:** commit di chiusura `chore(offline): verifica Fase 2a` (vuoto se nulla da committare).

---

## Self-Review (eseguita)

**Copertura spec (Fase 2 — parte testo):** reidratazione → Task 1,3,7; save local-first + coalescing → Task 2,3,7; stato badge "in attesa di rete" → Task 2,5,7; pillola di stato + "Sincronizza ora" → Task 4,6,7; trigger sync automatici → Task 7 (`avviaSyncAutomatica`) + hook; snapshot consultazione → Task 7. **Foto offline → Fase 2b. Cassetto "da risolvere" dettagliato + Background Sync + e2e → Fase 2c.**

**Placeholder:** nessun TODO; ogni step ha codice/comando completo. Le note "da raffinare in 2c" (invia 409) indicano scope esplicitamente differito, non lavoro non specificato qui.

**Coerenza tipi:** `SaveStateOffline`/`SaveState` allineati (Task 2,5); `idOutboxVoce`/`costruisciVoceOutbox`/`persistiVoce` coerenti; `useStatoSync` ritorna `perVoce`/`inAttesa`/`bloccati` usati in Task 7.

**Limite di verifica:** il wiring dei componenti non è coperto da unit test (env node, niente jsdom); la verifica reale è su **preview Vercel** (vedi Task 8 Step 3) + i test puri (rehydrate, voceOutbox).

---

## Prossimi sotto-piani

- **Fase 2b — Foto offline:** `uploadFotoVoce` → coda blob (`dbBlob`) + `clientKey` univoco + placeholder; anteprima da blob alla riapertura (CampoFotoInput legge il blob se `valore` è un placeholder); il sync carica e riscrive il path.
- **Fase 2c — Cassetto "da risolvere" + Background Sync + e2e:** UI dedicata per gli elementi `bloccato` (link scaduto/rifiutato, con motivo), registrazione Background Sync nel SW (Android), gestione invia 409 "voci in sospeso", test e2e Playwright in modalità offline.
