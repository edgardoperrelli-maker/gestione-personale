# Rapportini offline — Fase 2c-i: Cassetto "da risolvere" + Invio offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Mostrare all'operatore un **cassetto "da risolvere"** con gli elementi della coda bloccati (link scaduto / rifiutati) e il motivo, invece del generico blocco "non modificabile". (2) Permettere l'**invio del rapportino anche offline**: si accoda e parte al ritorno della rete; un 409 "voci in sospeso" (intervento manuale in approvazione) viene **ritentato** invece di bloccare l'operatore.

**Architecture:** La distinzione 409-ritentabile è una funzione pura testata (`inviaRitentabile`); l'orchestratore (`sync.ts`) la usa per classificare l'esito dell'`invia`. `handleInvia` resta online-diretto quando c'è rete (feedback immediato sul banner "voci in sospeso") ma **accoda** quando è offline. `useStatoSync` espone la lista degli elementi bloccati; un nuovo componente `CassettoDaRisolvere` la mostra e sostituisce il blocco full-screen generico.

**Tech Stack:** Next.js 15 App Router, React 19, IndexedDB (data layer Fase 1/2), vitest 2 (env node).

---

## Contesto di partenza (esistente — leggere prima)

- `lib/offline/sync.ts` — `inviaElemento(item): Promise<number>` (rami voce/agenda/foto/manuale/invia, ritorna `r.status` o `0` su rete); `sincronizzaToken(token)` cicla, classifica con `classificaEsito(status)` (completato/bloccato/ritenta), su 'ritenta' fa `break`, su 'bloccato' marca l'item `stato:'bloccato'` con `ultimoErrore=motivo`. Il ramo `invia` fa `POST /api/r/${token}/invia` e ritorna `r.status`.
- `lib/offline/syncPlan.ts` — `classificaEsito(status): EsitoSync` (`{esito:'completato'|'ritenta'|'bloccato', motivo?}`).
- `lib/offline/useStatoSync.ts` — `useStatoSync(token)` ritorna `{inAttesa, bloccati, perVoce, online, sincronizzaOra}`; conta `bloccati` (items con `stato==='bloccato'`).
- `lib/offline/db.ts` — `dbOutbox {perToken, put, rimuovi}`.
- `lib/offline/types.ts` — `OutboxItem` (con `ultimoErrore?`, `type`, `payload`).
- `components/modules/rapportini/RapportinoForm.tsx`:
  - stato (righe ~107-111): `bloccoSospese`/`setBloccoSospese`, `bloccatoInvia`/`setBloccatoInvia`, `const { perVoce: outboxPerVoce, bloccati } = useStatoSync(token)`, `const bloccato = bloccati > 0 || bloccatoInvia`.
  - `handleInvia` (righe ~246-276): online-diretto; offline → `alert`. 409 `voci_in_sospeso` → `setBloccoSospese`; altri 409 → `setBloccatoInvia`.
  - render (righe ~280-296): se `bloccato && !inviato` ritorna un blocco full-screen "Rapportino non più modificabile…"; `bannerSospese` per `bloccoSospese`.
- Server `app/api/r/[token]/invia/route.ts` → 409 con body `{ error: 'voci_in_sospeso', inSospeso?: n }` (ritentabile) oppure altri 409 `non_modificabile` (terminale).

> **Convenzione:** commit italiano `feat(offline)`/`fix(offline)`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. SEMPRE `cd "C:/Users/Edgardo/Desktop/gestione-personale-main/.claude/worktrees/rapportini-offline"`. Logica pura con `npx vitest run`; wiring con `npx tsc --noEmit` + `npx eslint` (NON `npm run build`).

## Struttura file (2c-i)

**Creati:**
- `lib/offline/inviaRitentabile.ts` + `.test.ts` — predicato puro per il 409 ritentabile.
- `components/offline/CassettoDaRisolvere.tsx` — UI elementi bloccati.

**Modificati:**
- `lib/offline/sync.ts` — `inviaElemento` ritorna `{status, ritentabile?}`; `sincronizzaToken` classifica l'`invia` con `inviaRitentabile`.
- `lib/offline/useStatoSync.ts` — espone `bloccatiItems`.
- `components/modules/rapportini/RapportinoForm.tsx` — `handleInvia` accoda offline; render del cassetto al posto del blocco generico.

---

### Task 1: `inviaRitentabile` (logica pura)

**Files:** Create `lib/offline/inviaRitentabile.ts` + `lib/offline/inviaRitentabile.test.ts`

- [ ] **Step 1: test (failing)** — `lib/offline/inviaRitentabile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inviaRitentabile } from './inviaRitentabile';

describe('inviaRitentabile', () => {
  it('409 voci_in_sospeso → ritentabile', () => {
    expect(inviaRitentabile(409, { error: 'voci_in_sospeso', inSospeso: 2 })).toBe(true);
  });
  it('409 di altro tipo → NON ritentabile (terminale)', () => {
    expect(inviaRitentabile(409, { error: 'non_modificabile' })).toBe(false);
    expect(inviaRitentabile(409, {})).toBe(false);
    expect(inviaRitentabile(409, null)).toBe(false);
  });
  it('status non-409 → NON ritentabile', () => {
    expect(inviaRitentabile(200, { error: 'voci_in_sospeso' })).toBe(false);
    expect(inviaRitentabile(403, { error: 'voci_in_sospeso' })).toBe(false);
  });
});
```
Run `npx vitest run lib/offline/inviaRitentabile.test.ts` → FAIL.

- [ ] **Step 2: implementa** `lib/offline/inviaRitentabile.ts`:

```ts
/**
 * True se l'esito dell'invio (`/api/r/[token]/invia`) è temporaneo e va RITENTATO,
 * non bloccato: caso `409 { error: 'voci_in_sospeso' }` (un intervento manuale è in
 * attesa di approvazione → l'invio diventerà possibile, non è un errore definitivo).
 */
export function inviaRitentabile(status: number, corpo: unknown): boolean {
  return status === 409 && (corpo as { error?: string } | null)?.error === 'voci_in_sospeso';
}
```
Run → PASS.

- [ ] **Step 3: commit**
```
git add lib/offline/inviaRitentabile.ts lib/offline/inviaRitentabile.test.ts
git commit -m "feat(offline): predicato invio ritentabile (409 voci in sospeso)"
```

---

### Task 2: sync.ts usa `inviaRitentabile` per l'invio

**Files:** Modify `lib/offline/sync.ts`

Leggere il file PRIMA. Obiettivo: `inviaElemento` deve restituire, oltre allo status, un flag `ritentabile` (vero solo per l'`invia` 409 `voci_in_sospeso`); `sincronizzaToken` usa quel flag per classificare 'ritenta' invece di 'bloccato'.

- [ ] **Step 1: import.** In cima a `lib/offline/sync.ts` aggiungi:
```ts
import { inviaRitentabile } from './inviaRitentabile';
```

- [ ] **Step 2: cambia il tipo di ritorno di `inviaElemento`** da `Promise<number>` a `Promise<{ status: number; ritentabile?: boolean }>`. In TUTTI i rami che oggi fanno `return <numero>` (es. `return r.status;`, `return 200;`, `return 0;`) avvolgi in `return { status: <numero> };`. Per il ramo `invia` specificamente, sostituisci:
```ts
    // invia
    const r = await fetch(`/api/r/${item.token}/invia`, { method: 'POST' });
    return r.status;
```
con:
```ts
    // invia
    const r = await fetch(`/api/r/${item.token}/invia`, { method: 'POST' });
    let corpo: unknown = null;
    if (r.status === 409) corpo = await r.json().catch(() => null);
    return { status: r.status, ritentabile: inviaRitentabile(r.status, corpo) };
```
E il `catch` finale che oggi fa `return 0;` diventa `return { status: 0 };`.

- [ ] **Step 3: aggiorna `sincronizzaToken`.** Dove oggi fa:
```ts
      const status = await inviaElemento(item);
      const esito = classificaEsito(status);
```
sostituisci con:
```ts
      const { status, ritentabile } = await inviaElemento(item);
      const esito = ritentabile ? ({ esito: 'ritenta' } as const) : classificaEsito(status);
```
(Il resto del ciclo — completato→rimuovi, bloccato→put, ritenta→marcaErrore+break — resta invariato.)

- [ ] **Step 4: verifica** — `npx tsc --noEmit 2>&1 | grep "sync.ts"` → vuoto. `npx vitest run lib/offline` → tutti verdi (i test esistenti di syncPlan/outbox non toccano inviaElemento, restano verdi).

- [ ] **Step 5: commit**
```
git add lib/offline/sync.ts
git commit -m "fix(offline): invio 409 voci-in-sospeso ritentato (non bloccato) dal sync"
```

---

### Task 3: `useStatoSync` espone `bloccatiItems`

**Files:** Modify `lib/offline/useStatoSync.ts`

- [ ] **Step 1: estendi il tipo `StatoSync`.** Aggiungi il campo `bloccatiItems: OutboxItem[];` al type `StatoSync`.

- [ ] **Step 2: popola `bloccatiItems`** dentro `aggiorna`. Dove si calcolano i conteggi nel ciclo `for (const it of items)`, raccogli anche gli elementi bloccati. Sostituisci il blocco di conteggio con:
```ts
      const perVoce: Record<string, OutboxItem> = {};
      const bloccatiItems: OutboxItem[] = [];
      let inAttesa = 0;
      let bloccati = 0;
      for (const it of items) {
        if (it.type === 'voce') perVoce[it.payload.voceId] = it;
        if (it.stato === 'bloccato') { bloccati += 1; bloccatiItems.push(it); }
        else inAttesa += 1;
      }
      setStato({ inAttesa, bloccati, bloccatiItems, perVoce, online: typeof navigator === 'undefined' ? true : navigator.onLine });
```
E aggiorna lo `useState` iniziale per includere `bloccatiItems: []`.

- [ ] **Step 3: verifica** — `npx tsc --noEmit 2>&1 | grep "useStatoSync"` → vuoto. `npx eslint lib/offline/useStatoSync.ts` → nessun errore.

- [ ] **Step 4: commit**
```
git add lib/offline/useStatoSync.ts
git commit -m "feat(offline): useStatoSync espone la lista elementi bloccati"
```

---

### Task 4: componente `CassettoDaRisolvere`

**Files:** Create `components/offline/CassettoDaRisolvere.tsx`

Mostra un riquadro con gli elementi bloccati (motivo da `ultimoErrore`), un'etichetta leggibile del tipo, e l'invito a contattare l'ufficio. Permette di **rimuovere** un elemento bloccato dalla coda (così l'operatore può sbloccare il form se l'elemento è irrecuperabile).

- [ ] **Step 1: implementa** `components/offline/CassettoDaRisolvere.tsx`:

```tsx
'use client';

import { dbOutbox } from '@/lib/offline/db';
import type { OutboxItem } from '@/lib/offline/types';

const ETICHETTA: Record<OutboxItem['type'], string> = {
  voce: 'Compilazione intervento',
  foto: 'Foto',
  agenda: 'Esito intervento',
  manuale: 'Intervento manuale',
  invia: 'Invio rapportino',
};

/**
 * Cassetto "da risolvere": elenca gli elementi della coda offline che non si possono
 * sincronizzare (link scaduto, rifiutati). Mostra il motivo e consente di rimuoverli
 * dalla coda (l'operatore contatta l'ufficio per i casi recuperabili).
 */
export function CassettoDaRisolvere({
  items,
  onRimosso,
}: {
  items: OutboxItem[];
  onRimosso: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
      <div className="mb-2 text-sm font-bold text-[var(--danger)]">
        {items.length === 1 ? '1 elemento da risolvere' : `${items.length} elementi da risolvere`}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--brand-surface)] p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--brand-text-main)]">{ETICHETTA[it.type]}</div>
              <div className="text-xs text-[var(--brand-text-muted)]">{it.ultimoErrore ?? 'Non sincronizzabile'}</div>
            </div>
            <button
              type="button"
              onClick={async () => { await dbOutbox.rimuovi(it.id); onRimosso(); }}
              className="shrink-0 rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--danger)]"
            >
              Rimuovi
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-[var(--danger)]">Per i casi recuperabili (es. link scaduto) contatta l&apos;ufficio.</div>
    </div>
  );
}
```

- [ ] **Step 2: verifica** — `npx tsc --noEmit 2>&1 | grep "CassettoDaRisolvere"` → vuoto. `npx eslint components/offline/CassettoDaRisolvere.tsx` → nessun errore.

- [ ] **Step 3: commit**
```
git add components/offline/CassettoDaRisolvere.tsx
git commit -m "feat(offline): componente cassetto 'da risolvere'"
```

---

### Task 5: wiring in `RapportinoForm` (invio offline + cassetto)

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: import.** Aggiungi:
```ts
import { CassettoDaRisolvere } from '@/components/offline/CassettoDaRisolvere';
import { dbOutbox } from '@/lib/offline/db';
```
(`dbOutbox` serve per accodare l'invio offline; se è già importato, non duplicare.)

- [ ] **Step 2: prendi `bloccatiItems` e `sincronizzaOra` dall'hook.** Estendi il destructuring esistente:
```ts
  const { perVoce: outboxPerVoce, bloccati, bloccatiItems, sincronizzaOra } = useStatoSync(token);
```

- [ ] **Step 3: invio offline.** In `handleInvia`, sostituisci il ramo offline (l'`alert` + `return`) con l'accodamento:
```ts
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await dbOutbox.put({ id: `invia:${token}`, type: 'invia', token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: {} });
      setInviato(true);
      setReadOnly(true);
      setVista('lista');
      window.alert('Rapportino messo in coda: verrà inviato appena torna la rete.');
      return;
    }
```
> L'invio accodato parte ai trigger di sync; se incontra un 409 "voci in sospeso" viene ritentato (Task 2), non blocca. Gli altri 409 finiscono nel cassetto "da risolvere".

- [ ] **Step 4: sostituisci il blocco full-screen generico col cassetto.** Sostituisci il blocco:
```tsx
  if (bloccato && !inviato) {
    return (
      <div className="mx-auto max-w-[480px] px-3 py-6">
        <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
          Rapportino non più modificabile. Aggiorna la pagina o contatta l&apos;ufficio.
        </div>
      </div>
    );
  }
```
con:
```tsx
  if (bloccato && !inviato) {
    return (
      <div className="mx-auto max-w-[480px] px-3 py-6">
        {bloccatoInvia && (
          <div className="mb-3 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
            Rapportino non più inviabile (link scaduto o già inviato). Contatta l&apos;ufficio.
          </div>
        )}
        <CassettoDaRisolvere items={bloccatiItems} onRimosso={sincronizzaOra} />
      </div>
    );
  }
```
(Così l'operatore vede QUALI elementi sono bloccati e perché, e può rimuoverli; `onRimosso={sincronizzaOra}` aggiorna lo stato dopo la rimozione.)

- [ ] **Step 5: verifica** — `npx tsc --noEmit 2>&1 | grep "RapportinoForm"` → vuoto. `npx eslint components/modules/rapportini/RapportinoForm.tsx` → nessun errore (se `dbOutbox` risulta già importato da prima, evita il doppio import). `npx vitest run lib/offline` → verde.

- [ ] **Step 6: commit**
```
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(offline): invio offline accodato + cassetto 'da risolvere' nel form"
```

---

### Task 6: Verifica complessiva 2c-i

- [ ] **Step 1:** `npx vitest run lib/offline` → tutti verdi (incluso `inviaRitentabile`).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errori.
- [ ] **Step 3:** `npx eslint lib/offline/sync.ts lib/offline/useStatoSync.ts lib/offline/inviaRitentabile.ts components/offline/CassettoDaRisolvere.tsx components/modules/rapportini/RapportinoForm.tsx` → nessun errore.
- [ ] **Step 4 (QA su Vercel preview):** (a) **invio offline:** compila tutto online, vai offline, premi "Invia" → messaggio "messo in coda", torna online → l'invio parte (POST `/api/r/.../invia`), il rapportino risulta inviato. (b) **cassetto:** simula un elemento bloccato (es. usa un token scaduto in un secondo intervento) → compare il cassetto con motivo e "Rimuovi". (c) **voci in sospeso:** con un intervento manuale in attesa di approvazione, l'invio online mostra il banner soft (non blocca); l'invio offline accodato ritenta finché non viene approvato.
- [ ] **Step 5:** commit di chiusura `chore(offline): verifica 2c-i` (vuoto se nulla).

---

## Self-Review (eseguita)

**Copertura:** invio offline accodato → Task 5; 409 voci_in_sospeso ritentato (no lockout) → Task 1,2; cassetto "da risolvere" con motivo + rimozione → Task 3,4,5.

**Placeholder:** nessun TODO; ogni step ha codice/comando completo.

**Coerenza tipi:** `inviaRitentabile(status, corpo)` usato in `sync.ts`; `inviaElemento` nuovo tipo `{status, ritentabile?}` allineato con `sincronizzaToken`; `bloccatiItems: OutboxItem[]` da `useStatoSync` usato in `CassettoDaRisolvere`/`RapportinoForm`; `dbOutbox.put` dell'`invia` usa la variante `type:'invia'` con `payload:{}`.

**Limite di verifica:** il wiring/UX si verifica su preview Vercel; la logica pura (`inviaRitentabile`) è testata.

---

## Prossimi sotto-piani 2c

- **2c-ii — Background Sync (Android):** handler `sync` nel service worker che drena la coda di tutti i token (`sincronizzaToken` lato SW) anche ad app chiusa; registrazione del tag sync dal client quando ci sono elementi in coda. Limite noto: non supportato su iOS Safari.
- **2c-iii — e2e Playwright offline:** test in browser reale del data layer offline (IndexedDB + sync con fetch mockato): compila → offline → ricarica → online → verifica sync.
