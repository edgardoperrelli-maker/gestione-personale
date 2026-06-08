# Editor template a sezioni operatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimappare i 4 sotto-moduli dell'editor template sulle schermate operatore (Card in lista, Dettaglio card, Dettaglio anagrafica, Lista azioni da fare), con anteprima reale di ciascuna.

**Architecture:** Si estrae la riga della lista da `RapportinoLista` in un componente esportato `RigaVoceCard` (resa lista operatore invariata). L'editor: il sotto-modulo 1 mostra la riga (`RigaVoceCard` con riga d'esempio); il 2 mostra titolo + header (`VoceTitolo`+`VoceHeaderInfo`); 3 e 4 usano `VoceDettagli`/`VoceCampi` (rinomine).

**Tech Stack:** Next.js 15, TypeScript, React, Tailwind. Nessuna nuova dipendenza.

**Spec:** [docs/superpowers/specs/2026-06-08-template-editor-sezioni-operatore-design.md](../specs/2026-06-08-template-editor-sezioni-operatore-design.md)

**Branch:** `feat/template-editor-sezioni-operatore` (da `main`).

> ⚠️ Sessioni concorrenti attive: **leggi i file attuali prima di modificarli**. I numeri di riga qui sotto sono indicativi.

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `components/modules/rapportini/RapportinoLista.tsx` | Modifica | Scorpora ed esporta `RigaVoceCard`; la lista lo usa (iso-resa) |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Modifica | 4 sotto-moduli rimappati + `anteprimaRiga` |

Nessun test automatico nuovo (componenti React). Verifica: `tsc` + iso-resa + manuale.

---

## Task 1: Scorpora `RigaVoceCard` da `RapportinoLista`

**Files:**
- Modify: `components/modules/rapportini/RapportinoLista.tsx`

> READ il file attuale. La resa della **lista** per l'operatore deve restare **identica**.

- [ ] **Step 1: Aggiungi il componente esportato `RigaVoceCard`.** Inseriscilo dopo la const `CHIP` (e prima di `const FILTRI` o di `export function RapportinoLista`). È la riga `<button>` attuale, con `chip`/`bordo`/`num` calcolati internamente:

```tsx
export function RigaVoceCard({ riga: r, onApri }: { riga: RigaVoce; onApri: (index: number) => void }) {
  const chip = CHIP[r.stato];
  const bordo = r.annullato ? 'border-l-[3px] border-l-[var(--danger)]' : r.stato === 'eseguito' ? 'border-l-[3px] border-l-[var(--success)]' : r.stato === 'non_eseguito' ? 'border-l-[3px] border-l-[var(--danger)]' : '';
  const num = r.annullato ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : r.stato === 'eseguito' ? 'bg-[var(--success-soft)] text-[var(--success)]' : r.stato === 'non_eseguito' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]';
  return (
    <button
      type="button"
      onClick={r.annullato ? undefined : () => onApri(r.index)}
      className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] p-3 text-left transition ${r.annullato ? 'cursor-not-allowed border-[var(--danger)] bg-[var(--danger-soft)]' : 'bg-[var(--brand-surface)] active:border-[var(--brand-primary)]'} ${bordo}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${num}`}>{r.index + 1}</span>
      <span className={`min-w-0 flex-1 ${r.annullato ? 'opacity-70' : ''}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {r.annullato && (
            <span className="shrink-0 rounded-full bg-[var(--danger)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none text-white">
              Annullato
            </span>
          )}
          {r.nuovo && (
            <span className="shrink-0 rounded-full bg-[var(--brand-gold)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none text-[oklch(0.16_0.06_245)]">
              Nuovo
            </span>
          )}
          {r.badge && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none ${r.badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
              {r.badge.label}
            </span>
          )}
          <span className={`min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--brand-text-main)] ${r.annullato ? 'line-through' : ''}`}>{r.titolo}</span>
          {(r.attivita || r.fascia) && (
            <span className="shrink-0 whitespace-nowrap text-[11.5px] font-medium text-[var(--brand-text-muted)]">
              {[r.attivita, r.fascia].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--brand-text-muted)]">{r.sub}</span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
        </span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}
```

- [ ] **Step 2: Usa `RigaVoceCard` nel `.map`.** Sostituisci il blocco corrente che mappa `visibili` (da `visibili.map((r) => { const chip = ...; ... return (<button ...> ... </button>); })`) con:

```tsx
          visibili.map((r) => <RigaVoceCard key={r.index} riga={r} onApri={onApri} />)
```

(Il markup della riga e il calcolo `chip`/`bordo`/`num` ora vivono in `RigaVoceCard`. `CHIP` e il tipo `RigaVoce` sono nello stesso file.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/RapportinoLista.tsx
git commit -m "refactor(rapportini): scorpora RigaVoceCard da RapportinoLista (resa lista invariata)"
```

---

## Task 2: Rimappa i 4 sotto-moduli dell'editor

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

> READ il file attuale. Verifica con `tsc` + manuale.

- [ ] **Step 1: Import.** Modifica l'import da `VoceCard` (ora importa `VoceCard`) in:
```ts
import { VoceTitolo, VoceHeaderInfo, VoceDettagli, VoceCampi } from '@/components/modules/rapportini/VoceCard';
```
Aggiungi due import:
```ts
import { RigaVoceCard, type RigaVoce } from '@/components/modules/rapportini/RapportinoLista';
```
e aggiungi `titoloVoce` all'import esistente da `@/utils/rapportini/infoCampi` (che già importa `INFO_CAMPI_DISPONIBILI, infoCampiDefault, partitionInfoCampi, resolveInfoCampi, ...`):
```ts
import {
  INFO_CAMPI_DISPONIBILI,
  infoCampiDefault,
  partitionInfoCampi,
  resolveInfoCampi,
  titoloVoce,
  type InfoChiave,
  type TemplateInfoCampo,
} from '@/utils/rapportini/infoCampi';
```

- [ ] **Step 2: Riga d'esempio.** Dopo la riga `const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) };` aggiungi:
```ts
  const anteprimaRiga: RigaVoce = {
    index: 0,
    titolo: titoloVoce(anteprimaVoce, titoloCampi, 0),
    sub: [SAMPLE_VOCE_INFO.via, SAMPLE_VOCE_INFO.comune].filter(Boolean).join(' · '),
    attivita: SAMPLE_VOCE_INFO.attivita,
    fascia: SAMPLE_VOCE_INFO.fascia_oraria,
    stato: 'da_fare',
  };
```

- [ ] **Step 3: Sotto-modulo 1 — "Card nella lista interventi".** Nella sezione attuale "Titolo voce":
  - Rinomina il commento `{/* ── Titolo voce ── */}` in `{/* ── Card nella lista interventi ── */}`.
  - Rinomina il titolo `<h3>...>Titolo voce</h3>` in `<h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Card nella lista interventi</h3>`.
  - Sostituisci la preview nell'`<AnteprimaBox>`:
```tsx
              <AnteprimaBox>
                <RigaVoceCard riga={anteprimaRiga} onApri={() => {}} />
              </AnteprimaBox>
```
  (rimpiazza la riga `<VoceCard voce={anteprimaVoce} indice={0} campi={campi} dettaglio={anteprimaDettaglio} titoloCampi={titoloCampi} stato="da_fare" disabilitato onChange={() => {}} />`)

- [ ] **Step 4: Sotto-modulo 2 — "Dettaglio card".** Nella sezione attuale "Header intervento":
  - Rinomina il commento `{/* ── Header intervento ── */}` in `{/* ── Dettaglio card ── */}`.
  - Rinomina il titolo in `<h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio card</h3>`.
  - Nell'`<AnteprimaBox>`, aggiungi `<VoceTitolo>` PRIMA di `<VoceHeaderInfo>`:
```tsx
              <AnteprimaBox>
                <VoceTitolo voce={anteprimaVoce} titoloCampi={titoloCampi} indice={0} />
                <VoceHeaderInfo voce={anteprimaVoce} coordinataAbilitata={infoCampi.some((c) => c.chiave === 'coordinate')} />
              </AnteprimaBox>
```

- [ ] **Step 5: Sotto-modulo 3 — "Dettaglio anagrafica".** Nella sezione "Dettagli anagrafici": rinomina il titolo `<h3>...>Dettagli anagrafici</h3>` in `<h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio anagrafica</h3>`. (Anteprima `<VoceDettagli>` invariata; lista `info_campi` invariata, `coordinate` resta esclusa.)

- [ ] **Step 6: Sotto-modulo 4 — "Lista azioni da fare".** Nella sezione "Campi": rinomina il titolo `<h3>...>Campi da compilare</h3>` (o `Campi`) in `<h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Lista azioni da fare</h3>`. (Anteprima `<VoceCampi>` invariata.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore. (`VoceCard` non è più importato dall'editor; `VoceTitolo`/`RigaVoceCard`/`RigaVoce`/`titoloVoce` sì.)

- [ ] **Step 8: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(rapportini): editor template a sezioni operatore (lista/dettaglio/anagrafica/azioni)"
```

---

## Task 3: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: test del progetto verdi. *Nota:* file falliti in `.claude/worktrees/.../node_modules/` o in altri `.claude/worktrees/...` = rumore di worktree concorrenti, ignorali; nessun fallimento in `utils/`, `lib/`, `app/`, `components/`.

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit
npx eslint components/modules/rapportini/RapportinoLista.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
```
Expected: tsc pulito; eslint senza nuovi problemi sui file toccati.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build ok.

- [ ] **Step 4: Verifiche manuali (anteprima Vercel, dopo deploy con OK utente)**

1. **Iso-resa operatore:** la **lista** `/r/[token]` (righe con n°, titolo, attività·fascia, indirizzo, chip stato, badge) e la **card** restano identiche.
2. **Editor:** i 4 sotto-moduli sono "Card nella lista interventi", "Dettaglio card", "Dettaglio anagrafica", "Lista azioni da fare", ognuno con controlli + anteprima della rispettiva schermata.
3. **Reattività:** cambiando i campi del titolo → cambia l'anteprima della **riga** (sotto-modulo 1) e il titolo nella **testata** (sotto-modulo 2); toggle coordinate (sotto-modulo 2) → compare/sparisce "Punto esatto"; campi info (sotto-modulo 3) → cambia i Dettagli; campi (sotto-modulo 4) → cambia le azioni.

---

## Note per chi esegue

- **Iso-resa:** Task 1 non deve cambiare la resa della lista per l'operatore; Task 2 non tocca `VoceCard`/`VoceFocus`.
- **Niente API/DB/Excel.**
- **Deploy:** branch `feat/template-editor-sezioni-operatore`; a fine, su OK utente, ff in `main` (Vercel).
