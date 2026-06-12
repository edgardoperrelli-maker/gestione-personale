# Azioni obbligatorie nei template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di marcare i campi non-foto di un template "Solo interventi manuali" come obbligatori, e mostrare un avviso non bloccante all'invio della modale manuale se restano vuoti.

**Architecture:** Riusa il flag `campo.obbligatoria` già presente nello schema (nessuna modifica DB). Una funzione pura calcola i campi obbligatori mancanti; l'editor espone la checkbox per i campi non-foto (solo template `solo_manuale`); la modale manuale avvisa in `handleInvia`.

**Tech Stack:** Next.js + React client components, Vitest, Tailwind.

---

## File Structure
- **Nuovi:** `lib/interventi/manuali/campiObbligatoriMancanti.ts` (+`.test.ts`) — funzione pura.
- **Modificati:**
  - `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` — checkbox "Obbligatoria" per campi non-foto, gated `soloManuale`.
  - `components/modules/rapportini/ModaleInterventoManuale.tsx` — avviso non bloccante in `handleInvia`.

## Note sui gate
La baseline `npm run lint` / `npx vitest run` è già rossa su main: verifica **mirata** ai file del WP — `npx tsc --noEmit` (solo errori baseline e2e/playwright), `npx eslint <file>`, `npx vitest run <testfile>` per la pura.

---

### Task 1: `campiObbligatoriMancanti` (funzione pura, TDD)

**Files:**
- Create: `lib/interventi/manuali/campiObbligatoriMancanti.ts`
- Test: `lib/interventi/manuali/campiObbligatoriMancanti.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { campiObbligatoriMancanti } from './campiObbligatoriMancanti';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campo = (over: Partial<TemplateCampo>): TemplateCampo => ({
  chiave: 'c', etichetta: 'C', tipo: 'testo', ordine: 1, ...over,
});

describe('campiObbligatoriMancanti', () => {
  it('testo/select obbligatori vuoti → mancanti; foto e non-obbligatori ignorati', () => {
    const campi = [
      campo({ chiave: 'nota', etichetta: 'Nota', tipo: 'testo', obbligatoria: true }),
      campo({ chiave: 'esito', etichetta: 'Esito', tipo: 'select', obbligatoria: true }),
      campo({ chiave: 'foto1', etichetta: 'Foto', tipo: 'foto', obbligatoria: true }),
      campo({ chiave: 'fac', etichetta: 'Facolt', tipo: 'testo' }),
    ];
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Nota', 'Esito']);
  });

  it('crocetta obbligatoria: mancante se non true', () => {
    const campi = [campo({ chiave: 'fatto', etichetta: 'Fatto', tipo: 'crocetta', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Fatto']);
    expect(campiObbligatoriMancanti(campi, { fatto: false })).toEqual(['Fatto']);
    expect(campiObbligatoriMancanti(campi, { fatto: true })).toEqual([]);
  });

  it('numero: 0 NON è mancante; vuoto/assente sì', () => {
    const campi = [campo({ chiave: 'q', etichetta: 'Q', tipo: 'numero', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, { q: 0 })).toEqual([]);
    expect(campiObbligatoriMancanti(campi, { q: '' })).toEqual(['Q']);
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Q']);
  });

  it('tutti compilati → []', () => {
    const campi = [campo({ chiave: 'nota', etichetta: 'Nota', tipo: 'testo', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, { nota: 'ok' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run lib/interventi/manuali/campiObbligatoriMancanti.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa la funzione**

```ts
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** True se il valore del campo è "vuoto" ai fini dell'obbligatorietà. */
function valoreMancante(campo: TemplateCampo, v: unknown): boolean {
  if (campo.tipo === 'crocetta') return v !== true;
  if (campo.tipo === 'numero') return v == null || (typeof v === 'string' && v.trim() === '');
  // testo / select (default): manca se non è una stringa non vuota
  return !(typeof v === 'string' && v.trim() !== '');
}

/** Etichette dei campi NON-foto con `obbligatoria === true` rimasti vuoti. */
export function campiObbligatoriMancanti(
  campi: TemplateCampo[],
  risposte: Record<string, unknown>,
): string[] {
  return campi
    .filter((c) => c.tipo !== 'foto' && c.obbligatoria === true)
    .filter((c) => valoreMancante(c, risposte[c.chiave]))
    .map((c) => c.etichetta);
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run lib/interventi/manuali/campiObbligatoriMancanti.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/campiObbligatoriMancanti.ts lib/interventi/manuali/campiObbligatoriMancanti.test.ts
git commit -m "feat(template): campiObbligatoriMancanti (campi non-foto obbligatori vuoti)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Editor — checkbox "Obbligatoria" sui campi non-foto

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: Aggiungi la riga checkbox**

READ il file. Nella card di ogni campo della sezione "Lista azioni da fare" c'è un blocco `{campo.tipo === 'foto' && ( … )}`
(scope + "Foto obbligatoria") e, subito dopo, il commento `{/* Row 3: azioni */}`. Inserisci **subito prima** di `{/* Row 3: azioni */}`
questo nuovo blocco (mostrato solo per i campi non-foto quando il template è "Solo interventi manuali"):

```tsx
                    {/* Row 2c: obbligatoria (campi non-foto, solo template manuale) */}
                    {soloManuale && campo.tipo !== 'foto' && (
                      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                        <input
                          type="checkbox"
                          checked={campo.obbligatoria === true}
                          onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                        Obbligatoria
                      </label>
                    )}
```

## Context
- `soloManuale` è già uno state del componente (checkbox "Solo interventi manuali").
- `updateCampo(idx, patch)` già esiste e fa il merge del patch sul campo; `obbligatoria` è già nel tipo `TemplateCampo` e nello schema.
- L'auto-save dei template esistenti persiste `campi` automaticamente → il flag viene salvato senza altro.
- NON toccare il blocco foto esistente (`{campo.tipo === 'foto' && …}`): la "Foto obbligatoria" resta com'è.

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
Expected: nessun nuovo errore (baseline e2e/playwright a parte).

- [ ] **Step 3: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(template): checkbox Obbligatoria sui campi non-foto (solo template manuale)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Modale manuale — avviso non bloccante all'invio

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`

- [ ] **Step 1: Importa la funzione pura**

Aggiungi tra gli import in cima al file:
```ts
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
```

- [ ] **Step 2: Aggiungi l'avviso in `handleInvia`**

`handleInvia` inizia con:
```ts
  const handleInvia = async () => {
    if (!committente) return;
    setInviando(true);
```
Inserisci il controllo **tra** `if (!committente) return;` e `setInviando(true);`:
```ts
    const mancanti = campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0 && !window.confirm(`Mancano ${mancanti.length} campi obbligatori da compilare: ${mancanti.join(', ')}. Inviare comunque?`)) {
      return;
    }
```

## Context
- `campiEsito` (i campi esito del committente selezionato) e `risposte` (le risposte compilate nello step 3) sono già
  variabili nello scope del componente, accessibili in `handleInvia`.
- L'avviso è **non bloccante**: se l'utente conferma, l'invio prosegue invariato. Le foto obbligatorie restano gestite
  come oggi (bottone "Invia" disabilitato finché `esitoFoto.ok` è false) — non toccare quella logica.

- [ ] **Step 3: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx
git commit -m "feat(template): avviso non bloccante campi obbligatori all'invio (modale manuale)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale
- [ ] `npx vitest run lib/interventi/manuali/campiObbligatoriMancanti.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → nessun errore introdotto dal WP.
- [ ] Smoke sul deploy: template "Solo interventi manuali" → marca un campo testo come Obbligatoria → "+" → quel committente → lascia il campo vuoto → "Invia richiesta" → compare l'avviso "Inviare comunque?".

## Fuori scope
- Enforcement nel rapportino pianificato standard (invariato).
- Blocco rigido per i campi non-foto (scelto avviso non bloccante).
- Modifiche allo schema DB.
