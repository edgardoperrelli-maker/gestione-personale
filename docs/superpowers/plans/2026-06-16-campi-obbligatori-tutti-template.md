# Campi "Obbligatoria" su tutti i template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di marcare "Obbligatoria" ogni campo non-foto su tutti i template e bloccare l'invio del rapportino standard (con elenco) se un campo obbligatorio è vuoto, senza toccare lo stato voce, i salvataggi o il flusso foto.

**Architecture:** Un check separato al momento dell'invio in `RapportinoForm`, ricalcando lo schema già usato per le foto (`fotoObbligatorieMancantiDettaglio` → `ModaleFotoMancanti`). Nuovo helper puro `campiObbligatoriMancantiVoci` (riusa `campiObbligatoriMancanti` esistente, che filtra `tipo !== 'foto'`) + nuova modale bloccante `ModaleCampiMancanti`. Asterisco sui campi non-foto in `CampoInput`. Editor: il checkbox diventa disponibile su tutti i template. NESSUNA modifica a `voceColore`/`voceMancante`/salvataggi/pipeline foto/risanamento.

**Tech Stack:** Next.js 15 / React 19 client components, TypeScript, Tailwind v4 (`--brand-*`), vitest 2 (funzioni pure).

**Baseline (memo "Lint/test baseline rosso"):** lint/test globali già rossi su file estranei (e2e/playwright). Gate mirati: `npx eslint <file>` pulito e `npx vitest run <file>` verde sui file del task. Worktree: `.claude/worktrees/campi-obbligatori-tutti-template`, base `4e51bf2`, `node_modules` già installato.

---

### Task 1: Helper `campiObbligatoriMancantiVoci` (TDD)

**Files:**
- Create: `utils/rapportini/campiObbligatoriVoci.ts`
- Test: `utils/rapportini/campiObbligatoriVoci.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/rapportini/campiObbligatoriVoci.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { campiObbligatoriMancantiVoci } from './campiObbligatoriVoci';
import type { TemplateCampo } from './buildVoci';

const campo = (chiave: string, over: Partial<TemplateCampo> = {}): TemplateCampo =>
  ({ chiave, etichetta: chiave.toUpperCase(), tipo: 'testo', ordine: 1, ...over });

describe('campiObbligatoriMancantiVoci', () => {
  it('nessun campo obbligatorio → nessuna voce', () => {
    const campi = [campo('nota')];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('campo obbligatorio vuoto → voce con etichetta mancante', () => {
    const campi = [campo('firma', { obbligatoria: true, etichetta: 'Firma' })];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Mario', campi: ['Firma'] },
    ]);
  });

  it('campo obbligatorio compilato → nessuna mancanza', () => {
    const campi = [campo('firma', { obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: { firma: 'ok' } }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('salta le voci manuali (create dal +)', () => {
    const campi = [campo('firma', { obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: {}, manuale: true }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('ignora i campi foto obbligatori (li gestisce la pipeline foto)', () => {
    const campi = [campo('contatore', { tipo: 'foto', obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('più campi mancanti nella stessa voce + più voci, con index originale', () => {
    const campi = [
      campo('a', { obbligatoria: true, etichetta: 'A' }),
      campo('b', { obbligatoria: true, etichetta: 'B' }),
    ];
    const voci = [
      { nominativo: 'Uno', risposte: { a: 'x' } }, // manca B
      { nominativo: 'Due', risposte: {} },         // mancano A, B
    ];
    expect(campiObbligatoriMancantiVoci(voci, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Uno', campi: ['B'] },
      { index: 1, titolo: 'Due', campi: ['A', 'B'] },
    ]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/campiObbligatoriVoci.test.ts`
Expected: FAIL ("Failed to resolve import './campiObbligatoriVoci'").

- [ ] **Step 3: Implementa l'helper**

Create `utils/rapportini/campiObbligatoriVoci.ts`:

```ts
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
import { titoloVoce, type VoceInfo, type InfoChiave } from '@/utils/rapportini/infoCampi';

/** Una voce con campi NON-foto obbligatori vuoti: titolo del task + etichette dei campi mancanti. */
export interface CampoMancanteVoce {
  index: number;
  titolo: string;
  campi: string[];
}

/**
 * Dettaglio dei campi NON-foto obbligatori vuoti, per voce (task). Parallelo a
 * `fotoObbligatorieMancantiDettaglio`: salta le voci manuali (create dal "+"). Riusa
 * `campiObbligatoriMancanti`, che filtra già `tipo !== 'foto'`: le foto non entrano mai qui.
 */
export function campiObbligatoriMancantiVoci(
  voci: Array<VoceInfo & { risposte: Record<string, unknown> | null; manuale?: boolean }>,
  campi: TemplateCampo[],
  titoloCampi: InfoChiave[] = [],
): CampoMancanteVoce[] {
  const out: CampoMancanteVoce[] = [];
  voci.forEach((v, index) => {
    if (v.manuale) return;
    const mancanti = campiObbligatoriMancanti(campi, v.risposte ?? {});
    if (mancanti.length > 0) out.push({ index, titolo: titoloVoce(v, titoloCampi, index), campi: mancanti });
  });
  return out;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/campiObbligatoriVoci.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Lint**

Run: `npx eslint utils/rapportini/campiObbligatoriVoci.ts utils/rapportini/campiObbligatoriVoci.test.ts`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add utils/rapportini/campiObbligatoriVoci.ts utils/rapportini/campiObbligatoriVoci.test.ts
git commit -m "feat(rapportini): helper campiObbligatoriMancantiVoci (per voce, esclude foto)"
```

---

### Task 2: Editor — checkbox "Obbligatoria" su tutti i template

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` (riga ~704)

- [ ] **Step 1: Rimuovi la condizione `soloManuale`**

Trova il blocco (commento "Row 2c"):

```tsx
                    {/* Row 2c: obbligatoria (campi non-foto, solo template manuale) */}
                    {soloManuale && campo.tipo !== 'foto' && (
```

Sostituiscilo con:

```tsx
                    {/* Row 2c: obbligatoria (campi non-foto, tutti i template) */}
                    {campo.tipo !== 'foto' && (
```

(Il resto del blocco — la `<label>` con il checkbox — resta invariato.)

- [ ] **Step 2: Type-check + lint mirati**

Run: `npx tsc --noEmit` → nessun nuovo errore su `TemplateRapportiniClient.tsx` (ignora e2e/playwright preesistenti).
Run: `npx eslint app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` → pulito (in particolare nessun "soloManuale unused": resta usato altrove nel file).

- [ ] **Step 3: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(template): checkbox Obbligatoria sui campi non-foto per tutti i template"
```

---

### Task 3: Asterisco sui campi non-foto obbligatori in `CampoInput`

**Files:**
- Modify: `components/modules/rapportini/CampoInput.tsx` (riga ~43 crocetta, ~48-52 labelEl)

- [ ] **Step 1: Asterisco sulla crocetta**

Trova (dentro il ramo `campo.tipo === 'crocetta'`):

```tsx
        <span className="text-sm font-semibold">{campo.etichetta}</span>
```

Sostituiscilo con:

```tsx
        <span className="text-sm font-semibold">
          {campo.etichetta}
          {campo.obbligatoria && <span className="ml-1 text-[var(--danger)]">*</span>}
        </span>
```

- [ ] **Step 2: Asterisco sull'etichetta condivisa (`labelEl`)**

Trova:

```tsx
  const labelEl = (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
      {campo.etichetta}
    </label>
  );
```

Sostituiscilo con:

```tsx
  const labelEl = (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
      {campo.etichetta}
      {campo.obbligatoria && <span className="ml-1 font-bold text-[var(--danger)]">*</span>}
    </label>
  );
```

(La sotto-funzione `CampoFotoInput`, che ha già il proprio asterisco, NON va toccata.)

- [ ] **Step 3: Type-check + lint mirati**

Run: `npx tsc --noEmit` → nessun nuovo errore su `CampoInput.tsx`.
Run: `npx eslint components/modules/rapportini/CampoInput.tsx` → pulito.

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/CampoInput.tsx
git commit -m "feat(rapportini): asterisco sui campi non-foto obbligatori in CampoInput"
```

---

### Task 4: Modale bloccante `ModaleCampiMancanti`

**Files:**
- Create: `components/modules/rapportini/ModaleCampiMancanti.tsx`

Componente presentazionale, analogo a `ModaleFotoMancanti` ma **bloccante** (niente "Invia comunque"). Puro JSX, nessun test unitario (no testing-library nel repo); verifica con eslint + type-check.

- [ ] **Step 1: Crea il componente**

Create `components/modules/rapportini/ModaleCampiMancanti.tsx`:

```tsx
'use client';

import type { CampoMancanteVoce } from '@/utils/rapportini/campiObbligatoriVoci';

/**
 * Avviso pre-invio BLOCCANTE: elenca QUALI task e QUALI campi obbligatori mancano.
 * A differenza delle foto, qui non c'è "Invia comunque": l'operatore deve compilarli.
 */
export function ModaleCampiMancanti({
  voci,
  onControlla,
  onChiudi,
}: {
  voci: CampoMancanteVoce[];
  onControlla: (index: number) => void;
  onChiudi: () => void;
}) {
  const totale = voci.reduce((n, v) => n + v.campi.length, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--brand-text-main)]">Campi obbligatori mancanti</h2>
          <button type="button" onClick={onChiudi} className="text-sm font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Mancano <b>{totale}</b> campi obbligatori su {voci.length} {voci.length === 1 ? 'intervento' : 'interventi'}. Compilali per poter inviare.
        </p>
        <ul className="mt-3 space-y-2">
          {voci.map((v) => (
            <li key={v.index}>
              <button
                type="button"
                onClick={() => onControlla(v.index)}
                className="flex w-full items-start gap-2 rounded-xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--brand-text-main)]">
                    <span className="text-[var(--brand-text-muted)]">{v.index + 1}.</span> {v.titolo}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-[var(--brand-text-muted)]">{v.campi.join(', ')}</span>
                </span>
                <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => onControlla(voci[0].index)}
            className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)]"
          >
            Vai a compilare
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint mirati**

Run: `npx tsc --noEmit` → nessun nuovo errore su `ModaleCampiMancanti.tsx`.
Run: `npx eslint components/modules/rapportini/ModaleCampiMancanti.tsx` → pulito.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/ModaleCampiMancanti.tsx
git commit -m "feat(rapportini): ModaleCampiMancanti bloccante per i campi obbligatori"
```

---

### Task 5: Integrazione blocco all'invio in `RapportinoForm`

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (import ~30, stato ~125, `handleInvia` ~355-362, render ~469)

- [ ] **Step 1: Aggiungi gli import**

Dopo la riga `import { ModaleFotoMancanti } from './ModaleFotoMancanti';` aggiungi:

```tsx
import { campiObbligatoriMancantiVoci, type CampoMancanteVoce } from '@/utils/rapportini/campiObbligatoriVoci';
import { ModaleCampiMancanti } from './ModaleCampiMancanti';
```

- [ ] **Step 2: Aggiungi lo stato**

Dopo la riga `const [fotoMancanti, setFotoMancanti] = useState<FotoMancanteVoce[] | null>(null); // avviso pre-invio` aggiungi:

```tsx
  const [campiMancanti, setCampiMancanti] = useState<CampoMancanteVoce[] | null>(null); // blocco pre-invio
```

- [ ] **Step 3: Check campi obbligatori in `handleInvia` (prima del check foto)**

Trova:

```tsx
  const handleInvia = useCallback(() => {
    if (disabilitato || inviando || !inviabile) return;
    // Foto obbligatorie mai scattate → mostra QUALI task e QUALI tipologie, poi l'operatore
    // decide: andare a scattarle o inviare comunque. Niente foto mancanti → invio diretto.
    const mancanti = fotoObbligatorieMancantiDettaglio(voci, campi, titoloCampi);
    if (mancanti.length > 0) { setFotoMancanti(mancanti); return; }
    void eseguiInvio();
  }, [disabilitato, inviando, inviabile, voci, campi, titoloCampi, eseguiInvio]);
```

Sostituiscilo con:

```tsx
  const handleInvia = useCallback(() => {
    if (disabilitato || inviando || !inviabile) return;
    // Campi obbligatori (non-foto) vuoti → blocco rigido con elenco, PRIMA del check foto.
    const campiObbl = campiObbligatoriMancantiVoci(voci, campi, titoloCampi);
    if (campiObbl.length > 0) { setCampiMancanti(campiObbl); return; }
    // Foto obbligatorie mai scattate → mostra QUALI task e QUALI tipologie, poi l'operatore
    // decide: andare a scattarle o inviare comunque. Niente foto mancanti → invio diretto.
    const mancanti = fotoObbligatorieMancantiDettaglio(voci, campi, titoloCampi);
    if (mancanti.length > 0) { setFotoMancanti(mancanti); return; }
    void eseguiInvio();
  }, [disabilitato, inviando, inviabile, voci, campi, titoloCampi, eseguiInvio]);
```

- [ ] **Step 4: Render della modale**

Trova il blocco che renderizza la modale foto:

```tsx
      {fotoMancanti && fotoMancanti.length > 0 && (
        <ModaleFotoMancanti
          voci={fotoMancanti}
          onControlla={(index) => { setFotoMancanti(null); onApri(index); }}
```

Subito **prima** di quel blocco `{fotoMancanti && …}` aggiungi il blocco della nuova modale:

```tsx
      {campiMancanti && campiMancanti.length > 0 && (
        <ModaleCampiMancanti
          voci={campiMancanti}
          onControlla={(index) => { setCampiMancanti(null); onApri(index); }}
          onChiudi={() => setCampiMancanti(null)}
        />
      )}
```

- [ ] **Step 5: Type-check + lint mirati**

Run: `npx tsc --noEmit` → nessun nuovo errore su `RapportinoForm.tsx` (in particolare `onApri` esiste già ed è usato dalla modale foto).
Run: `npx eslint components/modules/rapportini/RapportinoForm.tsx` → pulito.

- [ ] **Step 6: Commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): blocca l'invio standard se mancano campi obbligatori (elenco + vai a compilare)"
```

---

### Task 6: Verifica finale e non-regressione foto

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Test del nuovo helper**

Run: `npx vitest run utils/rapportini/campiObbligatoriVoci.test.ts`
Expected: PASS (6/6).

- [ ] **Step 2: Test di non-regressione su foto e stato voce (devono restare verdi e invariati)**

Run: `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts utils/rapportini/voceColore.test.ts utils/rapportini/voceMancante.test.ts lib/interventi/manuali/validaFotoObbligatorie.test.ts`
Expected: PASS (nessuna regressione: questi file non sono stati toccati).

- [ ] **Step 3: Lint di tutti i file toccati**

Run: `npx eslint utils/rapportini/campiObbligatoriVoci.ts utils/rapportini/campiObbligatoriVoci.test.ts components/modules/rapportini/ModaleCampiMancanti.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/CampoInput.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
Expected: nessun errore.

- [ ] **Step 4: Type-check completo**

Run: `npx tsc --noEmit`
Expected: solo errori preesistenti su `e2e/offline.spec.ts` e `playwright.config.ts`; nessun errore nei file del task.

- [ ] **Step 5: Smoke manuale (dev server)**

Run: `npm run dev`, login admin. Verifica i criteri di accettazione:
1. `/impostazioni/template-rapportini`, scheda **Classici**, template standard: in "Azioni da fare" il checkbox "Obbligatoria" è ora visibile sui campi non-foto. Marca obbligatorio un campo testo e salva.
2. Apri un rapportino standard pianificato che usa quel template: il campo mostra l'asterisco `*`; lasciandolo vuoto e premendo "Invia" compare la modale "Campi obbligatori mancanti" con l'elenco e l'invio è **bloccato** (niente "Invia comunque"); compilando il campo l'invio procede.
3. Un rapportino con **foto obbligatorie** continua a comportarsi come prima (modale foto con "Invia comunque" invariata).
4. Le voci create dal "+" (manuali) non vengono bloccate dal nuovo check.

- [ ] **Step 6: Commit finale (se lo smoke richiede aggiustamenti)**

Se necessario, applica e committa con `fix(rapportini): <descrizione>`. Altrimenti il task è completo.

---

## Self-Review (eseguito in fase di scrittura)

**Copertura spec:**
- Editor checkbox su tutti i template → Task 2.
- Asterisco campi non-foto → Task 3.
- Helper per voce → Task 1.
- Blocco all'invio standard + modale bloccante → Task 4 + Task 5.
- Voci manuali saltate → Task 1 (Step 3, `if (v.manuale) return`).
- Foto invariate / `tipo !== 'foto'` → Task 1 riusa `campiObbligatoriMancanti` (filtra foto); `CampoFotoInput` non toccato (Task 3); check campi precede ma non sostituisce il check foto (Task 5).
- `voceColore`/`voceMancante`/salvataggi non toccati → nessun task li modifica.
- Risanamento escluso → nessun task lo tocca.
- Non-regressione foto/stato voce → Task 6 (Step 2).

**Placeholder scan:** nessun TBD/TODO; ogni step mostra il codice completo o la sostituzione esatta.

**Consistenza dei nomi:** `campiObbligatoriMancantiVoci`, `CampoMancanteVoce` (`{ index, titolo, campi }`), `ModaleCampiMancanti` (props `voci`/`onControlla`/`onChiudi`), stato `campiMancanti`/`setCampiMancanti`, `onApri(index)` — usati coerentemente tra Task 1, 4, 5. La firma riusata `campiObbligatoriMancanti(campi, risposte)` rispetta l'ordine reale degli argomenti (campi prima).
