# Editor template a sotto-moduli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ristrutturare l'editor del template rapportini in 4 sotto-moduli (Titolo, Header, Dettagli, Campi), ognuno con i suoi controlli + un'anteprima focalizzata della parte di card che produce.

**Architecture:** Si scorpora `VoceCard` in 4 parti visive (`VoceTitolo`, `VoceHeaderInfo`, `VoceDettagli`, `VoceCampi`) ricomposte da `VoceCard` (resa operatore invariata). L'editor rimuove l'anteprima unica e affianca a ogni sezione la sua parte con i dati d'esempio.

**Tech Stack:** Next.js 15, TypeScript, React, Tailwind. Nessuna nuova dipendenza.

**Spec:** [docs/superpowers/specs/2026-06-06-template-editor-sottomoduli-design.md](../specs/2026-06-06-template-editor-sottomoduli-design.md)

**Branch:** `feat/template-editor-sottomoduli` (da `main`).

> ⚠️ Sessioni concorrenti attive: **leggi i file attuali prima di modificarli**. Il codice qui sotto riflette lo stato corrente.

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `components/modules/rapportini/VoceCard.tsx` | Modifica | Scorpora `VoceTitolo`/`VoceHeaderInfo`/`VoceDettagli`/`VoceCampi`; `VoceCard` li ricompone (iso-resa) |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Modifica | Rimuove anteprima unica; 4 sotto-moduli (controlli + anteprima di parte) |

Nessun test automatico nuovo (componenti React, no infra di test nel repo). Verifica: `tsc` + iso-resa + manuale.

---

## Task 1: Scorpora `VoceCard` in parti riusabili

**Files:**
- Modify: `components/modules/rapportini/VoceCard.tsx`

> READ il file attuale prima. La resa per l'operatore (via `VoceFocus`) deve restare **identica**.

- [ ] **Step 1: Riscrivi `VoceCard.tsx`** aggiungendo i 4 sotto-componenti esportati e facendo ricomporre `VoceCard`. Sostituisci l'intero file con:

```tsx
'use client';

import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';

export type VoceCardData = VoceInfo & { risposte: Record<string, unknown> };

/** Titolo della voce. */
export function VoceTitolo({ voce, titoloCampi, indice }: { voce: VoceCardData; titoloCampi: InfoChiave[]; indice: number }) {
  return <h1 className="text-xl font-bold text-[var(--brand-text-main)]">{titoloVoce(voce, titoloCampi, indice)}</h1>;
}

/** Header: indirizzo (link Maps) + "Punto esatto" (se abilitato) + fascia. */
export function VoceHeaderInfo({ voce, coordinataAbilitata }: { voce: VoceCardData; coordinataAbilitata: boolean }) {
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  return (
    <div className="mt-2.5 space-y-1.5 text-[14.5px] text-[var(--brand-text-main)]">
      {indirizzo && (
        <a href={mapsUrlFromAddress(valoreInfo(voce, 'via'), valoreInfo(voce, 'comune'), valoreInfo(voce, 'cap'))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
          <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
          <span>{indirizzo}</span>
        </a>
      )}
      {coordinataAbilitata && coordinata && (
        <a href={mapsUrlFromCoordinate(coordinata)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
          <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>
          <span>Punto esatto · {coordinata}</span>
        </a>
      )}
      {fascia && (
        <div className="flex items-center gap-2">
          <svg className="h-[17px] w-[17px] shrink-0 text-[var(--brand-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <span>{fascia}</span>
        </div>
      )}
    </div>
  );
}

/** "Dettagli anagrafici" (esclude la coordinata, che è nell'header). */
export function VoceDettagli({ voce, dettaglio }: { voce: VoceCardData; dettaglio: TemplateInfoCampo[] }) {
  const dett = dettaglio
    .filter((c) => c.chiave !== 'coordinate')
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
  if (dett.length === 0) return null;
  return (
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
  );
}

/** Campi da compilare: campi "altri" + crocette "Lavorazioni". */
export function VoceCampi({ campi, voce, disabilitato, onChange }: { campi: TemplateCampo[]; voce: VoceCardData; disabilitato: boolean; onChange: (chiave: string, valore: unknown) => void }) {
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  return (
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
  );
}

/** Card di una voce, condivisa da VoceFocus (operatore) e dall'anteprima del template. */
export function VoceCard({
  voce, indice, campi, dettaglio, titoloCampi, stato, disabilitato, onChange,
  headerRight, approvazioneStato, motivoRifiuto,
}: {
  voce: VoceCardData;
  indice: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  stato: StatoVoce;
  disabilitato: boolean;
  onChange: (chiave: string, valore: unknown) => void;
  headerRight?: React.ReactNode;
  approvazioneStato?: string | null;
  motivoRifiuto?: string | null;
}) {
  const badge = badgeVoceManuale(approvazioneStato ?? null);
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const bordo = stato === 'eseguito' ? 'border-[var(--success)]' : stato === 'non_eseguito' ? 'border-[var(--danger)]' : 'border-[var(--brand-border)]';

  return (
    <section className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
      <div className="flex items-start justify-between gap-3">
        <VoceTitolo voce={voce} titoloCampi={titoloCampi} indice={indice} />
        {headerRight}
      </div>
      {badge && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
          {badge.label}
          {badge.tono === 'attesa' && ' — in attesa di approvazione dalla centrale'}
          {badge.tono === 'rifiutato' && motivoRifiuto ? ` · ${motivoRifiuto}` : ''}
        </div>
      )}
      <VoceHeaderInfo voce={voce} coordinataAbilitata={coordinataAbilitata} />
      <VoceDettagli voce={voce} dettaglio={dettaglio} />
      <VoceCampi campi={campi} voce={voce} disabilitato={disabilitato} onChange={onChange} />
    </section>
  );
}
```

> Confronto iso-resa: la `<section>` ricomposta produce lo stesso markup di prima (titolo → `VoceTitolo`, header → `VoceHeaderInfo`, dettagli → `VoceDettagli`, campi → `VoceCampi`; i margini `mt-2.5`/`mt-3.5`/`mt-4` sono sui root dei sotto-componenti). Se il file attuale ha aggiunte concorrenti, **preservale**.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/VoceCard.tsx
git commit -m "refactor(rapportini): scorpora VoceCard in VoceTitolo/Header/Dettagli/Campi (resa invariata)"
```

---

## Task 2: Editor a 4 sotto-moduli

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

> READ il file attuale. Verifica con `tsc` + manuale.

- [ ] **Step 1: Cambia l'import di `VoceCard`** con i sotto-componenti. Sostituisci:
```ts
import { VoceCard } from '@/components/modules/rapportini/VoceCard';
```
con:
```ts
import { VoceTitolo, VoceHeaderInfo, VoceDettagli, VoceCampi } from '@/components/modules/rapportini/VoceCard';
```

- [ ] **Step 2: Aggiungi un helper `AnteprimaBox`** (riquadro anteprima riusabile). Inseriscilo a livello di modulo, vicino agli altri helper in cima al file (es. dopo `function newCampo(...)`):
```tsx
function AnteprimaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima</p>
      <div className="mx-auto max-w-[420px] rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rimuovi l'anteprima unica.** Elimina l'intero blocco "Anteprima operatore (live)" (il `<div className="sticky top-4 z-10 ...">` con dentro `<VoceCard .../>`), comprese le sue righe di apertura/commento. (`anteprimaDettaglio` e `anteprimaVoce` calcolati prima del `return` **restano**: servono ai sotto-moduli.)

- [ ] **Step 4: Sotto-modulo "Titolo voce"** — nella sezione "Intestazione della card": cambia il titolo `<h3>` da `Intestazione della card` a `Titolo voce`, e **prima della chiusura** `</div>` di quella card, aggiungi l'anteprima:
```tsx
              <AnteprimaBox>
                <VoceTitolo voce={anteprimaVoce} titoloCampi={titoloCampi} indice={0} />
              </AnteprimaBox>
```

- [ ] **Step 5: Sotto-modulo "Header intervento"** (NUOVO) — inseriscilo **subito dopo** la card "Titolo voce" (ex Intestazione) e **prima** della sezione "Informazioni da mostrare":
```tsx
            {/* ── Header intervento ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Header intervento</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Indirizzo e fascia oraria arrivano dai dati importati (non configurabili). Qui attivi la coordinata &quot;Punto esatto&quot;.
              </p>
              <label className="flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                <input
                  type="checkbox"
                  checked={infoCampi.some((c) => c.chiave === 'coordinate')}
                  onChange={() => toggleInfo('coordinate')}
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
                Mostra coordinate (link &quot;Punto esatto&quot;)
              </label>
              <AnteprimaBox>
                <VoceHeaderInfo voce={anteprimaVoce} coordinataAbilitata={infoCampi.some((c) => c.chiave === 'coordinate')} />
              </AnteprimaBox>
            </div>
```

- [ ] **Step 6: Sotto-modulo "Dettagli anagrafici"** — nella sezione "Informazioni da mostrare":
  - Cambia il titolo `<h3>` da `Informazioni da mostrare` a `Dettagli anagrafici`.
  - Nella lista, **non renderizzare la riga `coordinate`**: cambia `{infoCampi.map((c, idx) => (` in `{infoCampi.map((c, idx) => (c.chiave === 'coordinate' ? null : (` e chiudi con `)))}` invece di `))}`. (L'indice `idx` resta quello reale dell'array → `moveInfo`/`toggleInfo` continuano a funzionare; la coordinata si gestisce nell'Header.)
  - Nel picker "aggiungi", escludi `coordinate`: cambia `INFO_CAMPI_DISPONIBILI.filter((d) => !infoCampi.some((c) => c.chiave === d.chiave))` in `INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !infoCampi.some((c) => c.chiave === d.chiave))`.
  - **Prima della chiusura** `</div>` di questa card, aggiungi l'anteprima:
```tsx
              <AnteprimaBox>
                <VoceDettagli voce={anteprimaVoce} dettaglio={anteprimaDettaglio} />
              </AnteprimaBox>
```

- [ ] **Step 7: Sotto-modulo "Campi da compilare"** — nella sezione "Campi": cambia il titolo `<h3>` da `Campi` a `Campi da compilare`, e **prima della chiusura** `</div>` di quella card (dopo il pulsante "＋ Aggiungi campo"), aggiungi:
```tsx
              <AnteprimaBox>
                <VoceCampi campi={campi} voce={anteprimaVoce} disabilitato onChange={() => {}} />
              </AnteprimaBox>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 9: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(rapportini): editor template a 4 sotto-moduli con anteprima per sezione"
```

---

## Task 3: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: tutti i test del progetto verdi. *Nota:* file falliti in `.claude/worktrees/.../node_modules/` = rumore worktree concorrente, ignorali; nessun fallimento in `utils/`, `lib/`, `app/`, `components/`.

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npx tsc --noEmit
npx eslint components/modules/rapportini/VoceCard.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
```
Expected: tsc pulito; eslint senza nuovi problemi sui file toccati.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build ok.

- [ ] **Step 4: Verifiche manuali (anteprima Vercel, dopo deploy con OK utente)**

1. **Iso-resa operatore:** `/r/[token]` scheda voce **identica** a prima (titolo, header con indirizzo/Punto esatto/fascia, Dettagli anagrafici, Lavorazioni, badge manuale).
2. **Editor:** *Impostazioni → Template rapportini* mostra i 4 sotto-moduli (Titolo voce, Header intervento, Dettagli anagrafici, Campi da compilare), ognuno con controlli + anteprima della sua parte; niente più anteprima unica.
3. **Reattività:** modificando titolo → cambia l'anteprima Titolo; toggle coordinate nell'Header → compare/sparisce "Punto esatto"; aggiungi/ordina campi info nei Dettagli → cambia l'anteprima Dettagli (e `coordinate` NON è nella lista); aggiungi un campo crocetta/testo → cambia l'anteprima Campi.

---

## Note per chi esegue

- **Iso-resa operatore:** Task 1 non deve cambiare nulla per l'operatore. Parti dal file attuale; se ci sono aggiunte concorrenti in `VoceCard`, preservale nei sotto-componenti.
- **Niente API/DB/Excel:** solo componenti + editor.
- **Deploy:** branch `feat/template-editor-sottomoduli`; a fine, su OK utente, ff in `main` (Vercel).
