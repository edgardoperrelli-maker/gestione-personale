# Redesign vista pianificazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riorganizzare visivamente la vista `/hub/mappa?vista=pianifica` (striscia di fasi + header snellito + barra «Conferma piano») senza modificare alcuna logica.

**Architecture:** Un solo helper puro nuovo (`computePlanningPhase`, derivato dallo state esistente) e due componenti presentazionali nuovi (`PhaseStrip`, `MenuDropdown`). Tutto il resto è editing in-place del JSX di `MappaOperatoriClient.tsx`: stessi handler, stesse condizioni, solo posizione e stile diversi.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind v4 con variabili `--brand-*`, vitest. Nessuna SQL, nessun nuovo endpoint.

**Vincolo assoluto:** redesign puro. Nessuna modifica ad algoritmi, state, `useEffect`, handler o route. La fase corrente guida **solo** stile e riposizionamento; non aggiunge mai una condizione che blocchi un'azione oggi possibile.

---

## File structure

- Create `lib/mappa/planningPhase.ts` — helper puro `computePlanningPhase` + metadati fasi.
- Create `lib/mappa/planningPhase.test.ts` — test unitari.
- Create `components/modules/mappa/PhaseStrip.tsx` — striscia di fasi (presentazionale).
- Create `components/modules/mappa/MenuDropdown.tsx` — menu a tendina riutilizzabile (presentazionale).
- Modify `components/modules/mappa/MappaOperatoriClient.tsx` — integrazione layout (in-place).

---

## Task 0: Branch di lavoro

- [ ] **Step 1: Crea il branch dal main aggiornato**

Siamo su `main` (branch di default): si lavora su un branch dedicato, mai commit diretti su main.

Run:
```
git checkout -b redesign/vista-pianificazione
```
Expected: `Switched to a new branch 'redesign/vista-pianificazione'`

- [ ] **Step 2: Aggiungi spec e piano già scritti**

Run:
```
git add docs/superpowers/specs/2026-06-15-redesign-vista-pianificazione-design.md docs/superpowers/plans/2026-06-15-redesign-vista-pianificazione.md
git commit -m "docs(mappa): spec + piano redesign vista pianificazione"
```

---

## Task 1: Helper puro `computePlanningPhase` (TDD)

**Files:**
- Create: `lib/mappa/planningPhase.ts`
- Test: `lib/mappa/planningPhase.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { computePlanningPhase, PLANNING_PHASES, type PlanningPhaseInput } from './planningPhase';

const base: PlanningPhaseInput = {
  setupDone: false, isEditMode: false, totalTasks: 0, appointmentCount: 0,
  geocoded: 0, isGeocoding: false, hasDistribution: false, currentPianoId: false,
};

describe('computePlanningPhase', () => {
  it('1 = setup quando il modale non è ancora confermato', () => {
    expect(computePlanningPhase(base)).toBe(1);
  });
  it('salta il setup in edit mode', () => {
    expect(computePlanningPhase({ ...base, isEditMode: true })).toBe(2);
  });
  it('2 = interventi quando non ci sono task né appuntamenti', () => {
    expect(computePlanningPhase({ ...base, setupDone: true })).toBe(2);
  });
  it('3 = geocodifica quando ci sono task non ancora geocodificati', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 3 })).toBe(3);
  });
  it('3 = geocodifica mentre è in corso', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, isGeocoding: true })).toBe(3);
  });
  it('4 = operatori quando geocodifica completa e nessuna distribuzione', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10 })).toBe(4);
  });
  it('5 = distribuzione creata ma non salvata', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, hasDistribution: true })).toBe(5);
  });
  it('6 = conferma quando il piano è salvato', () => {
    expect(computePlanningPhase({ ...base, setupDone: true, totalTasks: 10, geocoded: 10, hasDistribution: true, currentPianoId: true })).toBe(6);
  });
  it('espone 6 fasi in ordine', () => {
    expect(PLANNING_PHASES.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run lib/mappa/planningPhase.test.ts`
Expected: FAIL — `Failed to resolve import "./planningPhase"`.

- [ ] **Step 3: Implementa l'helper**

```ts
export type PlanningPhase = 1 | 2 | 3 | 4 | 5 | 6;

export interface PlanningPhaseInput {
  /** modale setup confermato */
  setupDone: boolean;
  /** piano riaperto dal registro */
  isEditMode: boolean;
  /** allTasks.length (excel + template) */
  totalTasks: number;
  /** appuntamenti filtrati per giorno */
  appointmentCount: number;
  /** task con lat/lng valide */
  geocoded: number;
  /** geocodifica in corso */
  isGeocoding: boolean;
  /** distribution !== null */
  hasDistribution: boolean;
  /** !!currentPianoId (piano salvato) */
  currentPianoId: boolean;
}

export interface PhaseMeta { id: PlanningPhase; key: string; label: string; }

export const PLANNING_PHASES: PhaseMeta[] = [
  { id: 1, key: 'setup',        label: 'Setup' },
  { id: 2, key: 'interventi',   label: 'Interventi' },
  { id: 3, key: 'geocodifica',  label: 'Geocodifica' },
  { id: 4, key: 'operatori',    label: 'Operatori' },
  { id: 5, key: 'distribuzione',label: 'Distribuzione' },
  { id: 6, key: 'conferma',     label: 'Conferma' },
];

/**
 * Fase corrente DERIVATA dallo state esistente: pura orientazione visiva,
 * non è una nuova fonte di verità e non altera alcun comportamento.
 * Pensata per il flusso principale Excel / interventi-del-giorno.
 */
export function computePlanningPhase(s: PlanningPhaseInput): PlanningPhase {
  if (!s.setupDone && !s.isEditMode) return 1;
  if (s.hasDistribution && s.currentPianoId) return 6;
  if (s.hasDistribution) return 5;
  if (s.totalTasks === 0 && s.appointmentCount === 0) return 2;
  if (s.totalTasks > 0 && (s.isGeocoding || s.geocoded < s.totalTasks)) return 3;
  return 4;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run lib/mappa/planningPhase.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Lint del file nuovo**

Run: `npx eslint lib/mappa/planningPhase.ts lib/mappa/planningPhase.test.ts`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```
git add lib/mappa/planningPhase.ts lib/mappa/planningPhase.test.ts
git commit -m "feat(mappa): helper puro computePlanningPhase per la striscia di fasi"
```

---

## Task 2: Componente `PhaseStrip` (presentazionale)

**Files:**
- Create: `components/modules/mappa/PhaseStrip.tsx`

- [ ] **Step 1: Crea il componente**

Usa le variabili tema `--brand-*` già in uso nel modulo (niente hex fuori palette).

```tsx
import React from 'react';
import { PLANNING_PHASES, type PlanningPhase } from '@/lib/mappa/planningPhase';

/**
 * Striscia di fasi: spunta le fasi fatte, evidenzia la corrente, attenua le
 * future (che restano comunque visibili). Puramente presentazionale.
 */
export default function PhaseStrip({ current }: { current: PlanningPhase }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 shadow-sm">
      {PLANNING_PHASES.map((p, i) => {
        const done = p.id < current;
        const active = p.id === current;
        return (
          <React.Fragment key={p.key}>
            {i > 0 && (
              <div
                className={`h-px min-w-[6px] flex-1 ${
                  p.id <= current ? 'bg-[var(--brand-primary)]/40' : 'bg-[var(--brand-border)]'
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-2 border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : done
                    ? 'bg-[var(--success-soft)] text-[var(--success)]'
                    : 'text-[var(--brand-text-subtle)]'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {done ? '✓' : p.id}
              </span>
              <span>{p.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/PhaseStrip.tsx`
Expected: nessun nuovo errore relativo a questo file.

- [ ] **Step 3: Commit**

```
git add components/modules/mappa/PhaseStrip.tsx
git commit -m "feat(mappa): componente PhaseStrip presentazionale"
```

---

## Task 3: Componente `MenuDropdown` (presentazionale)

**Files:**
- Create: `components/modules/mappa/MenuDropdown.tsx`

- [ ] **Step 1: Crea il componente**

Stato locale `open` isolato; chiude su click esterno e su Escape. Le voci mirano agli **stessi handler** già esistenti.

```tsx
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
};

export default function MenuDropdown({
  label,
  items,
  buttonClassName,
  align = 'right',
}: {
  label: ReactNode;
  items: MenuItem[];
  buttonClassName?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const visible = items.filter((it) => !it.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClassName}>
        {label}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1 min-w-[220px] rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {visible.map((it, idx) => (
            <button
              key={idx}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface-muted)] disabled:opacity-40"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/MenuDropdown.tsx`
Expected: nessun nuovo errore relativo a questo file.

- [ ] **Step 3: Commit**

```
git add components/modules/mappa/MenuDropdown.tsx
git commit -m "feat(mappa): componente MenuDropdown riutilizzabile"
```

---

## Task 4: Monta PhaseStrip nel client (additivo, nessuna rimozione)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Aggiungi gli import**

In testa, vicino agli altri import di componenti/helper:
```ts
import PhaseStrip from './PhaseStrip';
import { computePlanningPhase } from '@/lib/mappa/planningPhase';
```

- [ ] **Step 2: Deriva la fase corrente dallo state esistente**

Subito dopo la riga `const needsSaturazione = ...` (zona "Computed"), aggiungi:
```ts
const currentPhase = useMemo(
  () =>
    computePlanningPhase({
      setupDone,
      isEditMode,
      totalTasks: allTasks.length,
      appointmentCount: filteredAppointmentTasks.length,
      geocoded: geocodificati,
      isGeocoding,
      hasDistribution: distribution !== null,
      currentPianoId: !!currentPianoId,
    }),
  [setupDone, isEditMode, allTasks.length, filteredAppointmentTasks.length, geocodificati, isGeocoding, distribution, currentPianoId],
);
```
Nota: tutte le variabili usate esistono già; non si introduce nuovo stato.

- [ ] **Step 3: Renderizza la striscia in cima al return**

Subito dopo la chiusura del blocco modale setup (cerca il commento `{/* Header + filtri */}`) inserisci, **prima** di quel commento:
```tsx
{(setupDone || isEditMode) && <PhaseStrip current={currentPhase} />}
```

- [ ] **Step 4: Type-check + lint mirati**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): striscia di fasi montata in cima alla pianificazione"
```

---

## Task 5: Header snellito — menu «Aggiungi interventi» e «Esporta»

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` (cluster header, oggi righe ~2612-2691)

**Regola:** ogni voce conserva handler e condizione di oggi. Spostare ≠ cambiare. Gli `<input type="file" hidden>` (`fileInputRef`, `fileTemplateInputRef`) restano dove sono.

- [ ] **Step 1: Importa il menu**

```ts
import MenuDropdown, { type MenuItem } from './MenuDropdown';
```

- [ ] **Step 2: Sostituisci i bottoni-sorgente con un unico menu Aggiungi**

Nel cluster header a destra, rimpiazza i bottoni `Scarica Template`, `Carica Excel`, `Carica interventi del giorno`, `Chiudi Excel` con:
```tsx
<MenuDropdown
  buttonClassName="rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--brand-primary)] hover:opacity-90"
  label={<span className="flex items-center gap-1.5">+ Aggiungi interventi ▾</span>}
  items={[
    { label: 'Carica Excel',                 onClick: () => fileInputRef.current?.click() },
    { label: 'Carica interventi del giorno', onClick: caricaInterventiDelGiorno },
    { label: 'Scarica Template',             onClick: downloadTemplate, hidden: excelMode },
    { label: '+ Aggiungi attività da template', onClick: () => fileTemplateInputRef.current?.click(), hidden: !excelMode },
    { label: '+ Aggiungi manuale',           onClick: () => setManualModalOpen(true), hidden: !excelMode },
    { label: 'Chiudi Excel',                 onClick: clearExcel, hidden: !excelMode },
  ]}
/>
```
Le condizioni `hidden` replicano esattamente la visibilità attuale (`!excelMode` per i comandi di caricamento iniziale, `excelMode` per quelli di modifica).

- [ ] **Step 3: Aggiungi il menu Esporta (solo a distribuzione presente)**

Accanto, rendi:
```tsx
{distribution && (
  <MenuDropdown
    buttonClassName="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
    label={<span>Esporta ▾</span>}
    items={[{ label: 'Esporta Excel', onClick: exportDistribution }]}
  />
)}
```

- [ ] **Step 4: Lascia diretti `Nuova pianificazione`, `Azzera` (filtri) e `Percorso ottimale`**

Restano bottoni singoli con le **stesse** condizioni odierne (`!excelMode` per Azzera filtri, `!distribution` per Percorso ottimale).

- [ ] **Step 5: Rimuovi i duplicati nella action-row di distribuzione**

Nella tabella operatori (oggi ~2945-2982) togli i bottoni ora nei menu: `Esporta Excel`, `+ Aggiungi attività da template`, `+ Aggiungi manuale`. Restano `Assegnazioni manuali`, `Distribuisci/Assegna`, `Azzera` (distribuzione).

- [ ] **Step 6: Type-check + lint**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 7: Verifica inventario controlli (manuale)**

Rileggi la tabella inventario nello spec: ogni voce header/sorgente deve esistere ancora e puntare allo stesso handler. Nessun handler rinominato o rimosso.

- [ ] **Step 8: Commit**

```
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): header snellito con menu Aggiungi interventi ed Esporta"
```

---

## Task 6: Barra «Conferma piano» in basso

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

**Sposta** (non riscrive) `Modello` + `Salva distribuzione` + `Genera rapportini` dalla action-row a una barra in fondo. Stessi handler, stesse disabilitazioni.

- [ ] **Step 1: Rimuovi dal blocco distribuzione il select Modello, Salva e Genera**

Togli da ~2986-3035 il `<label>Modello…</label>`, il bottone `Salva distribuzione` e il bottone `Genera rapportini`, mantenendo identiche le espressioni `disabled` e `title` (le riuserai sotto).

- [ ] **Step 2: Aggiungi la barra in fondo al return (prima delle modali)**

Subito prima di `<ManualAssignmentsModal ... />`, inserisci (in-flow, **niente** `position: fixed`):
```tsx
{distribution !== null && (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-4 py-3 shadow-sm">
    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-text-main)]">
      Conferma piano
    </span>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-[var(--brand-text-muted)]">
        <span className="font-medium">Modello:</span>
        <select
          value={rapTemplateId}
          onChange={(e) => setRapTemplateId(e.target.value)}
          title="Modello rapportino"
          className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)]"
        >
          {rapTemplates.length === 0
            ? <option value="">Nessun modello</option>
            : <option value="">— Seleziona modello —</option>}
          {rapTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}{t.is_default ? ' (default)' : ''}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={saveDistribution}
        disabled={savingDistribution || (rapTemplates.length > 0 && !rapTemplateId)}
        title={rapTemplates.length > 0 && !rapTemplateId ? 'Seleziona prima un modello rapportino' : undefined}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          savedDistribution
            ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/40'
            : 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)] hover:bg-[var(--brand-primary-hover)]'
        } disabled:opacity-50`}
      >
        {savingDistribution ? 'Salvataggio...' : savedDistribution && currentPianoId ? '✓ Salvata' : 'Salva distribuzione'}
      </button>
      {currentPianoId && (
        <button
          type="button"
          onClick={generaRapportini}
          disabled={rapGenerating || !rapTemplateId}
          title={!rapTemplateId ? 'Nessun modello attivo' : undefined}
          className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50"
        >
          {rapGenerating ? 'Genero…' : rapStato.length > 0 ? '↻ Rigenera rapportini' : '📋 Genera rapportini'}
        </button>
      )}
    </div>
  </div>
)}
```
Le espressioni di stato (`savingDistribution`, `savedDistribution`, `currentPianoId`, `rapTemplates`, `rapTemplateId`, `rapGenerating`, `rapStato`) sono le stesse di oggi: copia-incolla 1:1, nessuna logica nuova.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 4: Verifica inventario controlli (manuale)**

`Modello`, `Salva distribuzione`, `Genera rapportini` esistono una sola volta (niente duplicati) e con `disabled`/`title` invariati.

- [ ] **Step 5: Commit**

```
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): barra Conferma piano (modello + salva + genera)"
```

---

## Task 7: Enfasi per fase (evidenzia, non nascondere)

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

Applica solo classi di stile guidate da `currentPhase`. **Nessun** blocco viene rimosso dal DOM in base alla fase.

- [ ] **Step 1: Accent al pannello della fase corrente**

Sul contenitore del pannello laterale (oggi riga ~3107, il `<div className="rounded-2xl border ... overflow-y-auto max-h-[540px]">`) aggiungi un bordo accent quando la fase corrente coinvolge il pannello (4, 5, 6):
```tsx
className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm overflow-y-auto max-h-[540px] ${
  currentPhase >= 4 ? 'border-[var(--brand-primary-border)]' : 'border-[var(--brand-border)]'
}`}
```

- [ ] **Step 2: Attenua la zona operatori quando la fase è già oltre**

Sul pannello "Distribuisci tra operatori" (oggi ~2768) aggiungi un'opacità ridotta quando `currentPhase === 6` (già confermato), senza disabilitare nulla:
```tsx
className={`rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2.5 ${currentPhase === 6 ? 'opacity-80' : ''}`}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit` then `npx eslint components/modules/mappa/MappaOperatoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 4: Commit**

```
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "style(mappa): enfasi per fase (accent pannello, attenuazione zone non correnti)"
```

---

## Task 8: Verifica finale

- [ ] **Step 1: Test mirati verdi**

Run: `npx vitest run lib/mappa/planningPhase.test.ts`
Expected: PASS.

- [ ] **Step 2: Lint dei soli file toccati**

Run:
```
npx eslint lib/mappa/planningPhase.ts components/modules/mappa/PhaseStrip.tsx components/modules/mappa/MenuDropdown.tsx components/modules/mappa/MappaOperatoriClient.tsx
```
Expected: nessun errore introdotto dai file del WP (baseline del repo già rossa altrove — non peggiorare).

- [ ] **Step 3: Type-check globale**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

- [ ] **Step 4: Checklist inventario controlli (dallo spec)**

Per ogni riga della tabella inventario nello spec, confermare presenza + stesso handler nel nuovo layout. Segnare eventuali assenze.

- [ ] **Step 5: Test dal vivo in sola lettura**

Avviare `npm run dev`, fare login (l'utente fornisce l'accesso), aprire `/hub/mappa?vista=pianifica`, percorrere le fasi 1→5 (Setup → carica interventi → geocodifica → operatori → distribuisci/sposta) **senza** premere `Salva distribuzione` né `Genera rapportini` (puntano al DB di produzione). Verificare striscia fasi, menu Aggiungi/Esporta, barra Conferma e che ogni comando risponda come prima.

---

## Self-review (autore del piano)

- **Copertura spec:** striscia fasi (Task 1,2,4), header snellito + menu unico (Task 3,5), barra Conferma (Task 6), enfasi non-nascondere (Task 7), inventario controlli (Task 5,6,8), verifica/live read-only (Task 8). Tutte le sezioni dello spec hanno un task.
- **Niente placeholder:** codice completo nei file nuovi; edit in-place con anchor testuali e snippet 1:1 per i pezzi spostati.
- **Coerenza nomi:** `computePlanningPhase`, `PLANNING_PHASES`, `PhaseStrip`, `MenuDropdown`/`MenuItem` usati in modo identico tra task. Handler citati (`caricaInterventiDelGiorno`, `downloadTemplate`, `clearExcel`, `exportDistribution`, `saveDistribution`, `generaRapportini`, `setManualModalOpen`) esistono già nel client.
