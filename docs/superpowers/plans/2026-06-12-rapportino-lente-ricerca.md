# Lente di ricerca nel rapportino operatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel rapportino standard dell'operatore, una piccola **lente** (stessa dimensione del "+", sopra di esso, in basso a destra) che al tap si espande **verso sinistra** in un campetto: scrivendo via / ODS-ODL / matricola (anche parziale) la lista dei suoi ordini si filtra; la ✕ chiude e azzera. Niente scanner.

**Architecture:** Stato `ricerca` in `RapportinoForm`; componente `LenteRicerca` (FAB a scomparsa) lo aggiorna; `RapportinoLista` riceve `ricerca` e filtra le righe (oltre al filtro di stato). Match in funzione pura testata. Il risanamento (lista civici) è fuori scope.

**Tech Stack:** React client components, Tailwind, Vitest.

---

## File Structure
- **Nuovi:** `utils/rapportini/rigaMatchRicerca.ts` (+`.test.ts`), `components/modules/rapportini/LenteRicerca.tsx`.
- **Modificati:** `components/modules/rapportini/RapportinoLista.tsx` (RigaVoce + prop `ricerca` + filtro), `components/modules/rapportini/RapportinoForm.tsx` (campi cercabili, stato, render lente).

## Note gate
Baseline lint/test già rossa su main → verifica mirata: `npx tsc --noEmit` (solo errori baseline e2e/playwright), `npx eslint <file>`, `npx vitest run <testfile>`.

---

### Task 1: `rigaMatchRicerca` (funzione pura, TDD)

**Files:**
- Create: `utils/rapportini/rigaMatchRicerca.ts`
- Test: `utils/rapportini/rigaMatchRicerca.test.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

```ts
import { describe, it, expect } from 'vitest';
import { rigaMatchRicerca } from './rigaMatchRicerca';

const riga = { matricola: '99A023041', via: 'Corso Garibaldi 131', odl: '912228701' };

describe('rigaMatchRicerca', () => {
  it('query vuota → true', () => {
    expect(rigaMatchRicerca(riga, '')).toBe(true);
    expect(rigaMatchRicerca(riga, '   ')).toBe(true);
  });
  it('match parziale su via (case-insensitive)', () => {
    expect(rigaMatchRicerca(riga, 'garib')).toBe(true);
  });
  it('match su ODS/ODL', () => {
    expect(rigaMatchRicerca(riga, '9122')).toBe(true);
  });
  it('match su matricola normalizzata (anche con spazi/trattini nella query)', () => {
    expect(rigaMatchRicerca(riga, 'a023041')).toBe(true);
    expect(rigaMatchRicerca(riga, 'A-023 041')).toBe(true);
  });
  it('nessun match → false; campi assenti gestiti', () => {
    expect(rigaMatchRicerca(riga, 'zzz999')).toBe(false);
    expect(rigaMatchRicerca({}, 'garib')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run utils/rapportini/rigaMatchRicerca.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa**

```ts
export type RigaRicercabile = { matricola?: string | null; via?: string | null; odl?: string | null };

const low = (s: unknown): string => String(s ?? '').toLowerCase();
const normMat = (s: unknown): string => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** True se la riga matcha la ricerca su via / ODS-ODL (substring) o matricola (normalizzata). Query vuota → true. */
export function rigaMatchRicerca(riga: RigaRicercabile, q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  const lq = low(t);
  if (low(riga.via).includes(lq)) return true;
  if (low(riga.odl).includes(lq)) return true;
  const mq = normMat(t);
  if (mq && normMat(riga.matricola).includes(mq)) return true;
  return false;
}
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run utils/rapportini/rigaMatchRicerca.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/rigaMatchRicerca.ts utils/rapportini/rigaMatchRicerca.test.ts
git commit -m "feat(rapportini): rigaMatchRicerca (match ricerca su via/ODL/matricola)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `RapportinoLista` — campi cercabili + filtro ricerca

**Files:**
- Modify: `components/modules/rapportini/RapportinoLista.tsx`

- [ ] **Step 1: Estendi il tipo `RigaVoce`**

READ il file. Nel tipo `RigaVoce` (riga ~10) aggiungi tre campi opzionali:
```ts
export type RigaVoce = { index: number; titolo: string; sub: string; attivita?: string; fascia?: string; stato: StatoVoce; nuovo?: boolean; annullato?: boolean; nota?: string; badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null; matricola?: string; via?: string; odl?: string };
```

- [ ] **Step 2: Import + prop `ricerca`**

Aggiungi in cima l'import:
```ts
import { rigaMatchRicerca } from '@/utils/rapportini/rigaMatchRicerca';
```
Aggiungi `ricerca` al tipo delle props della funzione `RapportinoLista` (dopo `inviato: boolean;`):
```ts
  ricerca?: string;
```
e ai parametri destrutturati (con default), es. dopo `inviato,`:
```ts
  ricerca = '',
```

- [ ] **Step 3: Applica il filtro ricerca**

Sostituisci il blocco esistente:
```ts
  const visibili = righe.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );
  const conteggi: Record<Filtro, number> = {
    tutti: righe.length,
    dafare: righe.filter((r) => r.stato === 'da_fare').length,
    completati: righe.filter((r) => r.stato !== 'da_fare').length,
  };
```
con:
```ts
  const righeCercate = righe.filter((r) => rigaMatchRicerca(r, ricerca));
  const visibili = righeCercate.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );
  const conteggi: Record<Filtro, number> = {
    tutti: righeCercate.length,
    dafare: righeCercate.filter((r) => r.stato === 'da_fare').length,
    completati: righeCercate.filter((r) => r.stato !== 'da_fare').length,
  };
```

- [ ] **Step 4: Riga "N risultati" quando si cerca**

Subito DOPO la chiusura del `<div ...>` che contiene i filtri di stato (il blocco `FILTRI.map(...)`), e PRIMA del `<div className="rapp-scroll ...">`, inserisci:
```tsx
        {ricerca.trim() && (
          <p className="mt-2 px-1 text-xs text-[var(--brand-text-subtle)]">
            {righeCercate.length} risultat{righeCercate.length === 1 ? 'o' : 'i'} per «{ricerca.trim()}»
          </p>
        )}
```

- [ ] **Step 5: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/RapportinoLista.tsx`
Expected: nessun nuovo errore (la prop `ricerca` è opzionale → nessun call-site rotto).

- [ ] **Step 6: Commit**

```bash
git add components/modules/rapportini/RapportinoLista.tsx
git commit -m "feat(rapportini): RapportinoLista filtra per ricerca (via/ODL/matricola)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `LenteRicerca` + wiring in `RapportinoForm`

**Files:**
- Create: `components/modules/rapportini/LenteRicerca.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Crea il componente** `components/modules/rapportini/LenteRicerca.tsx`

```tsx
'use client';

import { useState } from 'react';

/** Lente compatta in basso a destra (sopra il "+"); al tap si espande verso sinistra in un campo di ricerca. */
export function LenteRicerca({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [aperto, setAperto] = useState(false);
  const chiudi = () => { onChange(''); setAperto(false); };

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-label="Cerca tra i tuoi ordini"
        className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-lg transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 items-center gap-2 rounded-full border-2 border-[var(--brand-primary)] bg-[var(--brand-surface)] py-1 pl-3 pr-1 shadow-lg">
      <button type="button" onClick={chiudi} aria-label="Chiudi ricerca" className="text-[var(--brand-text-muted)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <input
        autoFocus
        type="text"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Via, ODS/ODL o matricola"
        aria-label="Cerca"
        className="w-40 bg-transparent text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none"
      />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: RapportinoForm — import, stato, campi cercabili**

READ `components/modules/rapportini/RapportinoForm.tsx`. Aggiungi l'import:
```ts
import { LenteRicerca } from './LenteRicerca';
```
Aggiungi lo stato (vicino agli altri `useState`, es. dopo `const [filtro, setFiltro] = useState<Filtro>('tutti');`):
```ts
  const [ricerca, setRicerca] = useState('');
```
Nel `righe` useMemo, dentro l'oggetto ritornato per ogni voce, aggiungi i tre campi cercabili (accanto a `stato: statoVoce(...)`):
```ts
        matricola: valoreInfo(v, 'matricola'), via: valoreInfo(v, 'via'), odl: valoreInfo(v, 'odl'),
```

- [ ] **Step 3: RapportinoForm — passa `ricerca` e renderizza la lente**

Aggiungi `ricerca={ricerca}` alle props di `<RapportinoLista ... />`.
Trova il blocco `{vista === 'lista' && (<FabInterventoManuale … />)}` e inserisci SUBITO PRIMA la lente (gated: niente risanamento):
```tsx
      {tipo !== 'risanamento' && vista === 'lista' && (
        <LenteRicerca value={ricerca} onChange={setRicerca} />
      )}
```
(`tipo`, `vista`, `ricerca`, `setRicerca` sono già nello scope. La lente sta a `bottom 9.5rem`, il "+" resta a `5.5rem` → non si sovrappongono.)

- [ ] **Step 4: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/LenteRicerca.tsx components/modules/rapportini/RapportinoForm.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/rapportini/LenteRicerca.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): lente di ricerca a scomparsa nel rapportino operatore

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale
- [ ] `npx vitest run utils/rapportini/rigaMatchRicerca.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → nessun errore introdotto dal WP.
- [ ] Smoke sul deploy: nel rapportino standard, in basso a destra c'è la lente sopra il "+"; tap → si apre il campo verso sinistra; scrivendo "garib"/un ODL/una matricola la lista si filtra; ✕ ripristina i 25 ordini.

## Fuori scope
- Risanamento (lista civici) — la lente non compare.
- Scanner nella ricerca (escluso volutamente).
