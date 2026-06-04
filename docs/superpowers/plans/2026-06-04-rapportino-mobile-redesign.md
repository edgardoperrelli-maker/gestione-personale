# Redesign mobile rapportino digitale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare la pagina pubblica `/r/[token]` da lista di card altissime a un'esperienza mobile ibrida **Lista + Focus**, con header fisso + riepilogo, menu a tendina per i dettagli anagrafici, scrollbar a tema ed esito obbligatorio per l'invio.

**Architecture:** Refactor **solo frontend** di `app/r/[token]/page.tsx` e `components/modules/rapportini/RapportinoForm.tsx`. Si estraggono **helper puri** testabili (`riepilogo.ts`, `partitionInfoCampi`) e si scompone il form in sotto-componenti presentazionali (`IntestazioneRiepilogo`, `RapportinoLista`, `VoceFocus`, `CampoInput`, `SaveBadge`). Nessuna modifica a DB/API/generazione: si riusano `campi_snapshot`, `info_snapshot`, le rotte `/voce` e `/invia`, e `voceEsitoColore`.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Vitest.

**Spec:** [docs/superpowers/specs/2026-06-04-rapportino-mobile-redesign-design.md](../specs/2026-06-04-rapportino-mobile-redesign-design.md)
**Mockup di riferimento (visivo):** [docs/superpowers/mockups/rapportino-redesign.html](../mockups/rapportino-redesign.html)

---

## File structure

| File | Responsabilità | Stato |
|---|---|---|
| `utils/rapportini/riepilogo.ts` | `statoVoce` + `riepilogoRapportino` (puri) | **nuovo** |
| `utils/rapportini/riepilogo.test.ts` | test dei due helper | **nuovo** |
| `utils/rapportini/infoCampi.ts` | aggiunge `INFO_PRIMARI` + `partitionInfoCampi` | modifica |
| `utils/rapportini/infoCampi.test.ts` | test di `partitionInfoCampi` | modifica |
| `app/globals.css` | classe `.rapp-scroll` (scrollbar ciano) | modifica |
| `components/modules/rapportini/SaveBadge.tsx` | badge salvataggio + tipo `SaveState` | **nuovo** |
| `components/modules/rapportini/CampoInput.tsx` | rendering di un campo compilabile | **nuovo** |
| `components/modules/rapportini/IntestazioneRiepilogo.tsx` | header: nome, data, riepilogo, avanzamento | **nuovo** |
| `components/modules/rapportini/RapportinoLista.tsx` | vista Lista (header fisso + filtro + righe + invio) | **nuovo** |
| `components/modules/rapportini/VoceFocus.tsx` | vista Focus (sommario + dettagli + campi + nav) | **nuovo** |
| `components/modules/rapportini/RapportinoForm.tsx` | orchestratore (stato, autosave, invio, switch vista) | refactor |
| `app/r/[token]/page.tsx` | layout full-bleed per il form | modifica |

**Convenzioni di progetto:** test con `import { describe, it, expect } from 'vitest'` e import relativi (`./riepilogo`); alias `@/` per import non relativi nei componenti; classi Tailwind con valori arbitrari `bg-[var(--brand-surface)]` come nel form attuale; commit in italiano conventional-commits con trailer `Co-Authored-By`.

---

## Task 1: Helper puri `statoVoce` + `riepilogoRapportino` (TDD)

**Files:**
- Create: `utils/rapportini/riepilogo.ts`
- Test: `utils/rapportini/riepilogo.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `utils/rapportini/riepilogo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { statoVoce, riepilogoRapportino } from './riepilogo';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
  { chiave: 'mini_bag', etichetta: 'MINI BAG', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
];

describe('statoVoce', () => {
  it('select SI → eseguito', () => expect(statoVoce({ eseguito: 'SI' }, campi)).toBe('eseguito'));
  it('select NO → non_eseguito', () => expect(statoVoce({ eseguito: 'NO' }, campi)).toBe('non_eseguito'));
  it('crocetta positiva → eseguito', () => expect(statoVoce({ cambio: true }, campi)).toBe('eseguito'));
  it('vuoto → da_fare', () => expect(statoVoce({}, campi)).toBe('da_fare'));
  it('solo note → da_fare', () => expect(statoVoce({ note: 'x' }, campi)).toBe('da_fare'));
});

describe('riepilogoRapportino', () => {
  it('conta esiti e da fare', () => {
    const voci = [{ risposte: { eseguito: 'SI' } }, { risposte: { eseguito: 'NO' } }, { risposte: {} }];
    expect(riepilogoRapportino(voci, campi)).toMatchObject({ eseguiti: 1, nonEseguiti: 1, daFare: 1, totali: 3 });
  });
  it('conta le lavorazioni (solo crocette con count>0, in ordine di template)', () => {
    const voci = [
      { risposte: { eseguito: 'SI', cambio: true, mini_bag: true } },
      { risposte: { eseguito: 'SI', cambio: true } },
      { risposte: {} },
    ];
    expect(riepilogoRapportino(voci, campi).lavorazioni).toEqual([
      { chiave: 'cambio', etichetta: 'CAMBIO', count: 2 },
      { chiave: 'mini_bag', etichetta: 'MINI BAG', count: 1 },
    ]);
  });
  it('nessuna crocetta spuntata → lavorazioni vuote', () => {
    expect(riepilogoRapportino([{ risposte: {} }], campi).lavorazioni).toEqual([]);
  });
  it('gate invio: daFare 0 sse tutte con esito', () => {
    expect(riepilogoRapportino([{ risposte: { eseguito: 'SI' } }], campi).daFare).toBe(0);
    expect(riepilogoRapportino([{ risposte: {} }], campi).daFare).toBe(1);
    expect(riepilogoRapportino([], campi).daFare).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/riepilogo.test.ts`
Expected: FAIL — `Failed to resolve import "./riepilogo"` (file inesistente).

- [ ] **Step 3: Implementa l'helper**

Crea `utils/rapportini/riepilogo.ts`:

```ts
import { voceEsitoColore } from './voceColore';
import type { TemplateCampo } from './buildVoci';

export type StatoVoce = 'eseguito' | 'non_eseguito' | 'da_fare';

export interface LavorazioneConteggio {
  chiave: string;
  etichetta: string;
  count: number;
}

export interface RiepilogoRapportino {
  eseguiti: number;
  nonEseguiti: number;
  daFare: number;
  totali: number;
  lavorazioni: LavorazioneConteggio[];
}

/** Stato sintetico di una voce, derivato dall'unica fonte di verità `voceEsitoColore`. */
export function statoVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): StatoVoce {
  const colore = voceEsitoColore(risposte, campi);
  if (colore === 'verde') return 'eseguito';
  if (colore === 'rossa') return 'non_eseguito';
  return 'da_fare';
}

/** Riepilogo dell'intero rapportino: esiti + conteggio lavorazioni (crocette). */
export function riepilogoRapportino(
  voci: { risposte: Record<string, unknown> }[],
  campi: TemplateCampo[],
): RiepilogoRapportino {
  let eseguiti = 0;
  let nonEseguiti = 0;
  let daFare = 0;
  for (const v of voci) {
    const s = statoVoce(v.risposte, campi);
    if (s === 'eseguito') eseguiti += 1;
    else if (s === 'non_eseguito') nonEseguiti += 1;
    else daFare += 1;
  }
  const lavorazioni: LavorazioneConteggio[] = campi
    .filter((c) => c.tipo === 'crocetta')
    .map((c) => ({
      chiave: c.chiave,
      etichetta: c.etichetta,
      count: voci.filter((v) => v.risposte[c.chiave] === true).length,
    }))
    .filter((l) => l.count > 0);
  return { eseguiti, nonEseguiti, daFare, totali: voci.length, lavorazioni };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/riepilogo.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/riepilogo.ts utils/rapportini/riepilogo.test.ts
git commit -m "feat(rapportino): helper puri statoVoce + riepilogoRapportino" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Helper `partitionInfoCampi` (TDD)

**Files:**
- Modify: `utils/rapportini/infoCampi.ts`
- Test: `utils/rapportini/infoCampi.test.ts` (aggiunta in coda)

- [ ] **Step 1: Scrivi il test che fallisce**

In coda a `utils/rapportini/infoCampi.test.ts` aggiungi l'import e il blocco:

```ts
// in cima, aggiorna l'import esistente aggiungendo partitionInfoCampi:
//   import { resolveInfoCampi, infoCampiDefault, valoreInfo, INFO_CAMPI_DISPONIBILI, partitionInfoCampi } from './infoCampi';

describe('partitionInfoCampi', () => {
  it('separa primari e dettaglio dallo snapshot di default', () => {
    const { primari, dettaglio } = partitionInfoCampi([]);
    expect(primari.map((c) => c.chiave)).toEqual(['nominativo', 'via', 'comune', 'fascia_oraria']);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['matricola', 'pdr', 'odsin', 'cap', 'recapito', 'attivita', 'accessibilita']);
  });
  it('rispetta i campi mancanti nello snapshot', () => {
    const { primari, dettaglio } = partitionInfoCampi([
      { chiave: 'nominativo', etichetta: 'N', ordine: 1 },
      { chiave: 'pdr', etichetta: 'P', ordine: 2 },
    ]);
    expect(primari.map((c) => c.chiave)).toEqual(['nominativo']);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['pdr']);
  });
  it('ordina il dettaglio per ordine', () => {
    const { dettaglio } = partitionInfoCampi([
      { chiave: 'cap', etichetta: 'CAP', ordine: 2 },
      { chiave: 'pdr', etichetta: 'PDR', ordine: 1 },
    ]);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['pdr', 'cap']);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: FAIL — `partitionInfoCampi is not a function` / import non risolto.

- [ ] **Step 3: Implementa l'helper**

In `utils/rapportini/infoCampi.ts`, in fondo al file aggiungi:

```ts
/** Le 4 chiavi mostrate sempre nel sommario; tutte le altre vanno in "Dettagli". */
export const INFO_PRIMARI: InfoChiave[] = ['nominativo', 'via', 'comune', 'fascia_oraria'];

/**
 * Partiziona i campi info risolti in `primari` (sommario) e `dettaglio` (menu a tendina).
 * Riusa `resolveInfoCampi` quindi rispetta snapshot/ordine/etichette e i fallback.
 */
export function partitionInfoCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): { primari: TemplateInfoCampo[]; dettaglio: TemplateInfoCampo[] } {
  const risolti = resolveInfoCampi(snapshot);
  const primari = risolti.filter((c) => INFO_PRIMARI.includes(c.chiave));
  const dettaglio = risolti.filter((c) => !INFO_PRIMARI.includes(c.chiave));
  return { primari, dettaglio };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: PASS (test esistenti + 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/infoCampi.ts utils/rapportini/infoCampi.test.ts
git commit -m "feat(rapportino): partitionInfoCampi (primari vs dettaglio)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Scrollbar a tema `.rapp-scroll`

**Files:**
- Modify: `app/globals.css` (in fondo al file)

- [ ] **Step 1: Aggiungi la classe**

In fondo a `app/globals.css` aggiungi:

```css
/* Scrollbar a tema Aurea per i contenitori scrollabili del rapportino pubblico (/r). */
.rapp-scroll { scrollbar-width: thin; scrollbar-color: oklch(0.80 0.16 215 / 0.55) transparent; }
.rapp-scroll::-webkit-scrollbar { width: 8px; }
.rapp-scroll::-webkit-scrollbar-track { background: transparent; }
.rapp-scroll::-webkit-scrollbar-thumb { background: oklch(0.80 0.16 215 / 0.55); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.rapp-scroll::-webkit-scrollbar-thumb:hover { background: var(--brand-primary); }
```

- [ ] **Step 2: Verifica build CSS**

Run: `npm run lint`
Expected: PASS (nessun errore di lint introdotto).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(rapportino): scrollbar a tema (.rapp-scroll)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Estrazione `SaveBadge` e `CampoInput`

Estrazione 1:1 dal form attuale in file dedicati (nessun cambio di comportamento). Il form continua a funzionare con le sue copie interne finché non viene rifattorizzato (Task 8).

**Files:**
- Create: `components/modules/rapportini/SaveBadge.tsx`
- Create: `components/modules/rapportini/CampoInput.tsx`

- [ ] **Step 1: Crea `SaveBadge.tsx`**

```tsx
'use client';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string }> = {
    saving: { label: 'salvataggio…', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)] border-[var(--brand-border)]' },
    saved: { label: 'salvato ✓', cls: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent' },
    error: { label: 'non salvato — riprova', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent' },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`} aria-live="polite">
      {state === 'saving' && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Crea `CampoInput.tsx`**

```tsx
'use client';

import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none disabled:opacity-70';

export function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
}) {
  if (campo.tipo === 'crocetta') {
    const checked = valore === true;
    return (
      <label
        className={`flex min-h-[50px] items-center gap-3 rounded-xl border p-3 transition ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
            : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]'
        } ${disabilitato ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
        />
        <span className="text-sm font-semibold">{campo.etichetta}</span>
      </label>
    );
  }

  const labelEl = (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
      {campo.etichetta}
    </label>
  );

  if (campo.tipo === 'select') {
    return (
      <div>
        {labelEl}
        <select value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— Seleziona —</option>
          {(campo.opzioni ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (campo.tipo === 'numero') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          inputMode="decimal"
          value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <textarea rows={2} value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS (0 errori).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/SaveBadge.tsx components/modules/rapportini/CampoInput.tsx
git commit -m "refactor(rapportino): estrai SaveBadge e CampoInput" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Componente `IntestazioneRiepilogo`

Header con nome, data, riepilogo (pill esiti + chip lavorazioni) e barra avanzamento.

**Files:**
- Create: `components/modules/rapportini/IntestazioneRiepilogo.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client';

import type { RiepilogoRapportino } from '@/utils/rapportini/riepilogo';

export function IntestazioneRiepilogo({
  staffName,
  dataLabel,
  riepilogo,
}: {
  staffName: string;
  dataLabel: string;
  riepilogo: RiepilogoRapportino;
}) {
  const { eseguiti, nonEseguiti, daFare, totali, lavorazioni } = riepilogo;
  const completati = eseguiti + nonEseguiti;
  const pct = totali > 0 ? Math.round((completati / totali) * 100) : 0;
  return (
    <header className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Rapportino</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold text-[var(--brand-text-main)]">{staffName}</h1>
        <span className="shrink-0 text-sm text-[var(--brand-text-muted)]">{dataLabel}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--success)]">✓ {eseguiti} eseguiti</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-bold text-[var(--danger)]">✗ {nonEseguiti} non eseguiti</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--brand-text-subtle)]">{daFare} da fare</span>
      </div>

      {lavorazioni.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lavorazioni.map((l) => (
            <span key={l.chiave} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--brand-text-muted)]">
              {l.etichetta} <b className="text-[var(--brand-primary)]">{l.count}</b>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
        <div className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npm run lint` → PASS

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/IntestazioneRiepilogo.tsx
git commit -m "feat(rapportino): IntestazioneRiepilogo (header + riepilogo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Componente `VoceFocus`

Singolo intervento a tutto schermo: sommario sempre a vista, menu a tendina "Dettagli anagrafici", campi compilabili (crocette in griglia 2 colonne), barra di navigazione.

**Files:**
- Create: `components/modules/rapportini/VoceFocus.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client';

import { valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { SaveBadge, type SaveState } from './SaveBadge';

export type VoceFocusData = VoceInfo & { risposte: Record<string, unknown> };

export function VoceFocus({
  voce,
  indice,
  totale,
  campi,
  dettaglio,
  disabilitato,
  stato,
  saveState,
  onChange,
  onPrev,
  onNext,
  onClose,
}: {
  voce: VoceFocusData;
  indice: number;
  totale: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  disabilitato: boolean;
  stato: StatoVoce;
  saveState: SaveState;
  onChange: (chiave: string, valore: unknown) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const titolo = valoreInfo(voce, 'nominativo') || valoreInfo(voce, 'pdr') || `Voce ${indice + 1}`;
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const dett = dettaglio
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  const bordo = stato === 'eseguito' ? 'border-[var(--success)]' : stato === 'non_eseguito' ? 'border-[var(--danger)]' : 'border-[var(--brand-border)]';
  const isFirst = indice === 0;
  const isLast = indice === totale - 1;

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-semibold text-[var(--brand-primary)]">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 18l-6-6 6-6" /></svg>
          Tutti gli interventi
        </button>
        <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1 text-[13px] font-bold text-[var(--brand-text-muted)]">{indice + 1} / {totale}</span>
      </div>

      <div className="rapp-scroll flex-1 overflow-y-auto px-3 pb-28">
        <section className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--brand-text-main)]">{titolo}</h1>
            <SaveBadge state={saveState} />
          </div>

          <div className="mt-2.5 space-y-1.5 text-[14.5px] text-[var(--brand-text-main)]">
            {indirizzo && (
              <div className="flex items-center gap-2">
                <svg className="h-[17px] w-[17px] shrink-0 text-[var(--brand-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span>{indirizzo}</span>
              </div>
            )}
            {fascia && (
              <div className="flex items-center gap-2">
                <svg className="h-[17px] w-[17px] shrink-0 text-[var(--brand-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>{fascia}</span>
              </div>
            )}
          </div>

          {dett.length > 0 && (
            <details className="group mt-3.5 overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
              <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] font-semibold text-[var(--brand-text-muted)] [&::-webkit-details-marker]:hidden">
                Dettagli anagrafici
                <svg className="h-[18px] w-[18px] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 pt-1">
                {dett.map((r) => (
                  <div key={r.label} className="min-w-0">
                    <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">{r.label}</dt>
                    <dd className="mt-0.5 break-words text-sm text-[var(--brand-text-main)]">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          <div className="mt-4 space-y-3.5">
            {altri.map((campo) => (
              <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} />
            ))}
            {crocette.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Lavorazioni</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {crocette.map((campo) => (
                    <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-2.5 border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <button type="button" onClick={onPrev} disabled={isFirst} className="shrink-0 rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-40">‹</button>
          <button type="button" onClick={onNext} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[oklch(0.16_0.06_245)] shadow-sm transition hover:bg-[var(--brand-primary-hover)]">
            {disabilitato ? (isLast ? 'Torna alla lista' : 'Avanti ›') : isLast ? 'Salva e torna alla lista' : 'Salva e avanti ›'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npm run lint` → PASS

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/VoceFocus.tsx
git commit -m "feat(rapportino): VoceFocus (sommario + dettagli a tendina + nav)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Componente `RapportinoLista`

Vista lista: header fisso (riusa `IntestazioneRiepilogo`), filtro segmentato, elenco scrollabile (`.rapp-scroll`), barra di invio con **esito obbligatorio**.

**Files:**
- Create: `components/modules/rapportini/RapportinoLista.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client';

import type { RiepilogoRapportino, StatoVoce } from '@/utils/rapportini/riepilogo';
import { IntestazioneRiepilogo } from './IntestazioneRiepilogo';

export type RigaVoce = { index: number; titolo: string; sub: string; stato: StatoVoce };
export type Filtro = 'tutti' | 'dafare' | 'completati';

const CHIP: Record<StatoVoce, { label: string; cls: string }> = {
  eseguito: { label: '✓ Fatto', cls: 'bg-[var(--success-soft)] text-[var(--success)]' },
  non_eseguito: { label: 'Non fatto', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' },
  da_fare: { label: 'Da fare', cls: 'border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-subtle)]' },
};

const FILTRI: [Filtro, string][] = [['tutti', 'Tutti'], ['dafare', 'Da fare'], ['completati', 'Completati']];

export function RapportinoLista({
  staffName,
  dataLabel,
  riepilogo,
  righe,
  filtro,
  onFiltro,
  onApri,
  onInvia,
  inviabile,
  inviando,
  readOnly,
  inviato,
}: {
  staffName: string;
  dataLabel: string;
  riepilogo: RiepilogoRapportino;
  righe: RigaVoce[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onApri: (index: number) => void;
  onInvia: () => void;
  inviabile: boolean;
  inviando: boolean;
  readOnly: boolean;
  inviato: boolean;
}) {
  const visibili = righe.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0 px-3 pt-3">
        <IntestazioneRiepilogo staffName={staffName} dataLabel={dataLabel} riepilogo={riepilogo} />
        <div className="mt-3 flex gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-1">
          {FILTRI.map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => onFiltro(k)}
              className={`min-h-[38px] flex-1 rounded-full px-2 py-2 text-sm font-semibold transition ${
                filtro === k ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'text-[var(--brand-text-muted)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="rapp-scroll flex-1 space-y-2.5 overflow-y-auto px-3 pb-28 pt-2">
        {visibili.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento in questo filtro.</p>
        ) : (
          visibili.map((r) => {
            const chip = CHIP[r.stato];
            const bordo = r.stato === 'eseguito' ? 'border-l-[3px] border-l-[var(--success)]' : r.stato === 'non_eseguito' ? 'border-l-[3px] border-l-[var(--danger)]' : '';
            const num = r.stato === 'eseguito' ? 'bg-[var(--success-soft)] text-[var(--success)]' : r.stato === 'non_eseguito' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]';
            return (
              <button
                key={r.index}
                type="button"
                onClick={() => onApri(r.index)}
                className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-left transition active:border-[var(--brand-primary)] ${bordo}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${num}`}>{r.index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-[var(--brand-text-main)]">{r.titolo}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[var(--brand-text-muted)]">{r.sub}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${chip.cls}`}>{chip.label}</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            );
          })
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-[480px] border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          {inviato ? (
            <p className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] py-3 text-center text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</p>
          ) : (
            <>
              {!readOnly && (inviabile ? (
                <p className="mb-1.5 text-center text-xs font-medium text-[var(--success)]">Tutti gli interventi hanno un esito ✓</p>
              ) : (
                <button type="button" onClick={() => onFiltro('dafare')} className="mb-1.5 block w-full text-center text-xs text-[var(--brand-text-muted)] underline">
                  {riepilogo.daFare} {riepilogo.daFare === 1 ? 'intervento da completare' : 'interventi da completare'} · tocca per filtrarli
                </button>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={onInvia}
                  disabled={!inviabile || inviando}
                  className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[oklch(0.16_0.06_245)] shadow-sm transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                >
                  {inviando ? 'Invio in corso…' : 'Invia rapportino'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npm run lint` → PASS

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/RapportinoLista.tsx
git commit -m "feat(rapportino): RapportinoLista (header fisso, filtro, invio con esito obbligatorio)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Refactor `RapportinoForm` (orchestratore)

Sostituisce il contenuto di `RapportinoForm.tsx`: mantiene **identica** la logica di autosave/debounce/backoff e l'API; aggiunge stato vista/indice/filtro, calcolo `riepilogo`, gate d'invio e switch Lista/Focus. Rimuove le definizioni interne `SaveBadge`, `VoceCard`, `CampoInput`, `voceHasEsito` (ora nei componenti dedicati e nel gate).

**Files:**
- Modify (sostituzione completa): `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Sostituisci l'intero file**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { partitionInfoCampi, valoreInfo, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { statoVoce, riepilogoRapportino } from '@/utils/rapportini/riepilogo';
import type { SaveState } from './SaveBadge';
import { RapportinoLista, type RigaVoce, type Filtro } from './RapportinoLista';
import { VoceFocus } from './VoceFocus';

/* ── Tipi ──────────────────────────────────────────────────────────────────── */

export type Voce = {
  id: string;
  ordine: number;
  nominativo?: string;
  matricola?: string;
  pdr?: string;
  odsin?: string;
  via?: string;
  comune?: string;
  cap?: string;
  recapito?: string;
  attivita?: string;
  accessibilita?: string;
  fascia_oraria?: string;
  risposte: Record<string, unknown>;
};

type Props = {
  token: string;
  rapportino: { staff_name: string; data: string };
  voci: Voce[];
  campiSnapshot: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  readOnly: boolean;
};

const DEBOUNCE_MS = 800;
const MAX_BACKOFF_MS = 8000;

function formatData(raw: string): string {
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Componente principale ─────────────────────────────────────────────────── */

export default function RapportinoForm({
  token,
  rapportino,
  voci: vociIniziali,
  campiSnapshot,
  infoCampi,
  readOnly: readOnlyIniziale,
}: Props) {
  const campi = useMemo(() => campiSnapshot.slice().sort((a, b) => a.ordine - b.ordine), [campiSnapshot]);
  const vociOrdinate = useMemo(() => vociIniziali.slice().sort((a, b) => a.ordine - b.ordine), [vociIniziali]);
  const { dettaglio } = useMemo(() => partitionInfoCampi(infoCampi), [infoCampi]);

  const [voci, setVoci] = useState<Voce[]>(vociOrdinate);
  const [readOnly, setReadOnly] = useState(readOnlyIniziale);
  const [bloccato, setBloccato] = useState(false); // 409 non_modificabile
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnlyIniziale);

  const [vista, setVista] = useState<'lista' | 'focus'>('lista');
  const [indiceCorrente, setIndiceCorrente] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('tutti');

  const disabilitato = readOnly || bloccato || inviato;

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestRisposteRef = useRef<Record<string, Record<string, unknown>>>({});
  const attemptsRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    vociOrdinate.forEach((v) => {
      latestRisposteRef.current[v.id] = v.risposte;
    });
  }, [vociOrdinate]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const setSaveState = useCallback((voceId: string, s: SaveState) => {
    setSaveStates((prev) => (prev[voceId] === s ? prev : { ...prev, [voceId]: s }));
  }, []);

  const saveVoce = useCallback(
    async (voceId: string) => {
      if (!mountedRef.current) return;
      const risposte = latestRisposteRef.current[voceId] ?? {};
      setSaveState(voceId, 'saving');
      try {
        const res = await fetch(`/api/r/${token}/voce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voceId, risposte }),
        });
        if (res.status === 409) {
          attemptsRef.current[voceId] = 0;
          if (mountedRef.current) {
            setBloccato(true);
            setSaveState(voceId, 'idle');
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        attemptsRef.current[voceId] = 0;
        if (mountedRef.current) setSaveState(voceId, 'saved');
      } catch {
        if (!mountedRef.current) return;
        setSaveState(voceId, 'error');
        const attempt = (attemptsRef.current[voceId] ?? 0) + 1;
        attemptsRef.current[voceId] = attempt;
        const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        clearTimeout(timersRef.current[voceId]);
        timersRef.current[voceId] = setTimeout(() => {
          void saveVoce(voceId);
        }, delay);
      }
    },
    [token, setSaveState],
  );

  const setRisposta = useCallback(
    (voceId: string, chiave: string, valore: unknown) => {
      if (disabilitato) return;
      setVoci((prev) =>
        prev.map((v) => {
          if (v.id !== voceId) return v;
          const risposte = { ...v.risposte, [chiave]: valore };
          latestRisposteRef.current[voceId] = risposte;
          return { ...v, risposte };
        }),
      );
      attemptsRef.current[voceId] = 0;
      setSaveState(voceId, 'saving');
      clearTimeout(timersRef.current[voceId]);
      timersRef.current[voceId] = setTimeout(() => {
        void saveVoce(voceId);
      }, DEBOUNCE_MS);
    },
    [disabilitato, saveVoce, setSaveState],
  );

  /** Forza il salvataggio immediato di una voce (usato da "Salva e avanti"). */
  const flushVoce = useCallback(
    (voceId: string) => {
      if (disabilitato) return;
      clearTimeout(timersRef.current[voceId]);
      void saveVoce(voceId);
    },
    [disabilitato, saveVoce],
  );

  /* ── Derivati ─────────────────────────────────────────────────────────────── */

  const riepilogo = useMemo(() => riepilogoRapportino(voci, campi), [voci, campi]);
  const inviabile = riepilogo.daFare === 0 && voci.length > 0;

  const righe: RigaVoce[] = useMemo(
    () =>
      voci.map((v, idx) => {
        const titolo = valoreInfo(v, 'nominativo') || valoreInfo(v, 'pdr') || `Voce ${idx + 1}`;
        const sub = [valoreInfo(v, 'via'), valoreInfo(v, 'comune'), valoreInfo(v, 'fascia_oraria')].filter(Boolean).join(' · ');
        return { index: idx, titolo, sub, stato: statoVoce(v.risposte, campi) };
      }),
    [voci, campi],
  );

  /* ── Navigazione ──────────────────────────────────────────────────────────── */

  const onApri = useCallback((index: number) => {
    setIndiceCorrente(index);
    setVista('focus');
  }, []);

  const onClose = useCallback(() => setVista('lista'), []);
  const onPrev = useCallback(() => setIndiceCorrente((i) => Math.max(0, i - 1)), []);

  const onNext = useCallback(() => {
    const corrente = voci[indiceCorrente];
    if (corrente && !disabilitato) flushVoce(corrente.id);
    if (indiceCorrente >= voci.length - 1) setVista('lista');
    else setIndiceCorrente((i) => i + 1);
  }, [voci, indiceCorrente, disabilitato, flushVoce]);

  const handleInvia = useCallback(async () => {
    if (disabilitato || inviando || !inviabile) return;
    setInviando(true);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        setBloccato(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInviato(true);
      setReadOnly(true);
      setVista('lista');
    } catch {
      window.alert('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      if (mountedRef.current) setInviando(false);
    }
  }, [disabilitato, inviando, inviabile, token]);

  /* ── Render ───────────────────────────────────────────────────────────────── */

  if (bloccato && !inviato) {
    return (
      <div className="mx-auto max-w-[480px] px-3 py-6">
        <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
          Rapportino non più modificabile. Aggiorna la pagina o contatta l&apos;ufficio.
        </div>
      </div>
    );
  }

  const dataLabel = formatData(rapportino.data);

  return (
    <div className="mx-auto max-w-[480px]">
      {vista === 'focus' && voci[indiceCorrente] ? (
        <VoceFocus
          voce={voci[indiceCorrente]}
          indice={indiceCorrente}
          totale={voci.length}
          campi={campi}
          dettaglio={dettaglio}
          disabilitato={disabilitato}
          stato={statoVoce(voci[indiceCorrente].risposte, campi)}
          saveState={saveStates[voci[indiceCorrente].id] ?? 'idle'}
          onChange={(chiave, valore) => setRisposta(voci[indiceCorrente].id, chiave, valore)}
          onPrev={onPrev}
          onNext={onNext}
          onClose={onClose}
        />
      ) : (
        <RapportinoLista
          staffName={rapportino.staff_name}
          dataLabel={dataLabel}
          riepilogo={riepilogo}
          righe={righe}
          filtro={filtro}
          onFiltro={setFiltro}
          onApri={onApri}
          onInvia={handleInvia}
          inviabile={inviabile}
          inviando={inviando}
          readOnly={readOnly}
          inviato={inviato}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS (l'export `Voce` resta compatibile con `page.tsx`).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Esegui l'intera suite di test (regressione)**

Run: `npm test`
Expected: PASS (tutti i test, inclusi i nuovi di Task 1-2).

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "refactor(rapportino): RapportinoForm orchestratore lista+focus" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Layout full-bleed in `page.tsx`

Il nuovo form gestisce internamente larghezza (`max-w-[480px]`) e altezza (`h-dvh`). La `Shell` con `max-w-2xl` + padding va usata **solo** per gli stati di errore (`CenteredCard`), non per il form.

**Files:**
- Modify: `app/r/[token]/page.tsx`

- [ ] **Step 1: Aggiorna il return finale del componente**

Sostituisci il blocco finale (da `return (` con `<Shell>` che avvolge `<RapportinoForm .../>`) con:

```tsx
  return (
    <main className="min-h-dvh bg-[var(--brand-bg)] text-[var(--brand-text-main)]">
      <RapportinoForm
        token={token}
        rapportino={{ staff_name: rap.staff_name, data: rap.data }}
        voci={voci}
        campiSnapshot={campiSnapshot}
        infoCampi={(rap.info_snapshot ?? []) as TemplateInfoCampo[]}
        readOnly={stato === 'inviato'}
      />
    </main>
  );
```

Nota: lascia invariati `Shell` e `CenteredCard` (usati dagli stati "non trovato" / "scaduto"). Se ESLint segnala `Shell` come inutilizzato, resta usato da `CenteredCard` — nessuna rimozione.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npm run lint` → PASS

- [ ] **Step 3: Commit**

```bash
git add app/r/[token]/page.tsx
git commit -m "feat(rapportino): layout full-bleed per il form pubblico" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Verifica finale (build, typecheck, test, manuale)

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Suite completa + typecheck + lint**

Run: `npm test` → Expected: tutti PASS
Run: `npx tsc --noEmit` → Expected: 0 errori
Run: `npm run lint` → Expected: 0 errori

- [ ] **Step 2: Build di produzione (sanity)**

Run: `npm run build`
Expected: build completata senza errori di type/lint (la rotta `/r/[token]` compila).

- [ ] **Step 3: Verifica manuale mobile (dev server)**

Avvia `npm run dev`, apri un link `/r/<token>` reale (o di test) **da viewport mobile** (DevTools responsive 375/390/430px) e verifica:
- Lista: header con nome/data + **riepilogo** (eseguiti/non eseguiti/da fare + lavorazioni) + barra avanzamento; **in scroll si muove solo l'elenco**, header e barra "Invia" restano fissi.
- Filtro Tutti / Da fare / Completati funziona.
- Tap su una riga → **Focus**: sommario (nominativo, indirizzo, fascia), menu a tendina "Dettagli anagrafici" chiuso di default che si apre/chiude, crocette in **griglia 2 colonne**.
- Compilando `ESEGUITO` (o crocette) il bordo cambia colore, l'autosave mostra "salvato ✓" e il **riepilogo si aggiorna** tornando in Lista.
- "Salva e avanti ›" passa alla voce successiva; sull'ultima torna alla Lista.
- **Esito obbligatorio**: con almeno una voce "Da fare" il pulsante "Invia rapportino" è **disabilitato** e l'hint "N da completare · tocca per filtrarli" filtra le mancanti; completando tutte le voci → "Invia rapportino" attivo.
- **Scrollbar ciano** (non grigia) nell'elenco e nel Focus.
- Stato **inviato**: tutto in sola lettura, messaggio "Rapportino inviato ✓".

- [ ] **Step 4: Pulizia e commit finale (se necessario)**

Rimuovi eventuali file temporanei. Se il working tree è pulito, nessun commit. Altrimenti:

```bash
git status --short
```

---

## Self-review (eseguita in fase di scrittura del piano)

- **Spec coverage:** Lista+Focus (Task 5-8), header fisso + riepilogo (Task 1,5,8), menu a tendina Dettagli (Task 2,6), esito obbligatorio (Task 1,7,8), scrollbar a tema (Task 3,6,7), responsive (Task 9-10), helper puri testati (Task 1-2). ✔
- **No placeholder:** ogni step ha codice/comandi reali. ✔
- **Coerenza tipi:** `StatoVoce`, `RiepilogoRapportino`, `RigaVoce`, `Filtro`, `SaveState`, `Voce`, `TemplateCampo`, `TemplateInfoCampo` usati con le stesse firme tra i task; `riepilogoRapportino`/`statoVoce`/`partitionInfoCampi`/`valoreInfo` con le firme definite in Task 1-2 e in `infoCampi.ts` esistente. ✔
- **Nessuna modifica API/DB:** rotte `/voce` e `/invia` invariate; props del form invariate (`page.tsx` passa gli stessi dati). ✔
