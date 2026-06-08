# Anteprima live template rapportino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere nelle *Impostazioni → Template rapportini* un'anteprima live della scheda operatore, che si aggiorna mentre si compone il template.

**Architecture:** Si estrae il contenuto della card da `VoceFocus` in un componente condiviso `VoceCard` (resa invariata per l'operatore). L'editor template renderizza `<VoceCard>` con una voce d'esempio fissa + gli stati live (`infoCampi`, `campi`, `titoloCampi`), in un pannello sticky.

**Tech Stack:** Next.js 15 (client component), TypeScript, React, Tailwind. Vitest per la funzione pura. Nessuna nuova dipendenza.

**Spec:** [docs/superpowers/specs/2026-06-06-anteprima-template-rapportino-design.md](../specs/2026-06-06-anteprima-template-rapportino-design.md)

**Branch:** `fix/template-save-coordinate-400` (deploy insieme al fix del 400 sul salvataggio template).

> ⚠️ **Nota:** sessioni concorrenti hanno evoluto `VoceFocus` (badge "interventi manuali" / approvazione) e aggiunto il tipo campo `foto`. **Leggi il file attuale prima di estrarre.** Il codice qui sotto riflette lo stato corrente.

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `utils/rapportini/sampleVoce.ts` | Crea | Dati d'esempio: `SAMPLE_VOCE_INFO` + `sampleRisposte(campi)` |
| `utils/rapportini/sampleVoce.test.ts` | Crea | Test di `sampleRisposte` |
| `components/modules/rapportini/VoceCard.tsx` | Crea | Card della voce (titolo, indirizzo/coordinata, dettagli, lavorazioni), condivisa |
| `components/modules/rapportini/VoceFocus.tsx` | Modifica | Usa `<VoceCard>`; resta il wrapper a tutto schermo (nav) |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Modifica | Pannello "Anteprima operatore" sticky con `<VoceCard>` live |

---

## Task 1: Dati d'esempio (`sampleVoce.ts`)

**Files:**
- Create: `utils/rapportini/sampleVoce.ts`
- Test: `utils/rapportini/sampleVoce.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/sampleVoce.test.ts
import { describe, it, expect } from 'vitest';
import { sampleRisposte, SAMPLE_VOCE_INFO } from './sampleVoce';
import type { TemplateCampo } from './buildVoci';

describe('sampleRisposte', () => {
  it('genera un valore d\'esempio coerente per ogni tipo', () => {
    const campi: TemplateCampo[] = [
      { chiave: 'a', etichetta: 'A', tipo: 'crocetta', ordine: 1 },
      { chiave: 'b', etichetta: 'B', tipo: 'testo', ordine: 2 },
      { chiave: 'c', etichetta: 'C', tipo: 'numero', ordine: 3 },
      { chiave: 'd', etichetta: 'D', tipo: 'select', opzioni: ['X', 'Y'], ordine: 4 },
    ];
    const r = sampleRisposte(campi);
    expect(typeof r.a).toBe('boolean');
    expect(r.b).toBe('esempio');
    expect(r.c).toBe('1');
    expect(r.d).toBe('X');
  });
  it('select senza opzioni → fallback', () => {
    expect(sampleRisposte([{ chiave: 's', etichetta: 'S', tipo: 'select', ordine: 1 }]).s).toBe('Opzione');
  });
  it('template vuoto → {}', () => {
    expect(sampleRisposte([])).toEqual({});
  });
  it('SAMPLE_VOCE_INFO contiene la coordinata d\'esempio', () => {
    expect(SAMPLE_VOCE_INFO.coordinate).toBe('41.853305, 12.782855');
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisce**

Run: `npx vitest run utils/rapportini/sampleVoce.test.ts`
Expected: FAIL — `Failed to resolve import "./sampleVoce"`.

- [ ] **Step 3: Implementa**

```ts
// utils/rapportini/sampleVoce.ts
import type { TemplateCampo } from './buildVoci';

/** Valori anagrafici d'esempio per l'anteprima del template (tutti i campi info + coordinata). */
export const SAMPLE_VOCE_INFO = {
  nominativo: 'Mario Rossi',
  matricola: 'MAT0012345',
  pdr: '00594202203925',
  odl: '20043151148',
  via: 'VIA ROMA 1',
  comune: 'Roma',
  cap: '00184',
  recapito: '333 1234567',
  attivita: 'S-PR-007',
  accessibilita: 'Libero',
  fascia_oraria: '08:00-10:00',
  coordinate: '41.853305, 12.782855',
} as const;

/** Risposte d'esempio per i campi del template, così l'anteprima appare "compilata". */
export function sampleRisposte(campi: TemplateCampo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  campi.forEach((c, i) => {
    switch (c.tipo) {
      case 'crocetta': out[c.chiave] = i % 2 === 0; break;
      case 'numero': out[c.chiave] = '1'; break;
      case 'select': out[c.chiave] = c.opzioni?.[0] ?? 'Opzione'; break;
      case 'testo': out[c.chiave] = 'esempio'; break;
      default: break; // foto / altri tipi: nessun valore d'esempio
    }
  });
  return out;
}
```

- [ ] **Step 4: Esegui e verifica che passa**

Run: `npx vitest run utils/rapportini/sampleVoce.test.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/sampleVoce.ts utils/rapportini/sampleVoce.test.ts
git commit -m "feat(rapportini): dati d'esempio per l'anteprima template (sampleVoce)"
```

---

## Task 2: Estrai `VoceCard` condivisa

**Files:**
- Create: `components/modules/rapportini/VoceCard.tsx`
- Modify: `components/modules/rapportini/VoceFocus.tsx`

> Nessun unit test (componenti React: no infrastruttura nel repo). Verifica: `tsc` + iso-resa operatore. **READ `VoceFocus.tsx` corrente prima di iniziare.**

- [ ] **Step 1: Crea `VoceCard.tsx`** (contenuto della `<section>` di VoceFocus, con `headerRight` al posto di `SaveBadge`)

```tsx
'use client';

import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';

export type VoceCardData = VoceInfo & { risposte: Record<string, unknown> };

/** Card di una voce (titolo, indirizzo/coordinata, dettagli, lavorazioni).
 *  Condivisa da VoceFocus (operatore) e dall'anteprima del template. */
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
  const titolo = titoloVoce(voce, titoloCampi, indice);
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const dett = dettaglio
    .filter((c) => c.chiave !== 'coordinate')
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  const bordo = stato === 'eseguito' ? 'border-[var(--success)]' : stato === 'non_eseguito' ? 'border-[var(--danger)]' : 'border-[var(--brand-border)]';

  return (
    <section className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--brand-text-main)]">{titolo}</h1>
        {headerRight}
      </div>
      {badge && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
          {badge.label}
          {badge.tono === 'attesa' && ' — in attesa di approvazione dalla centrale'}
          {badge.tono === 'rifiutato' && motivoRifiuto ? ` · ${motivoRifiuto}` : ''}
        </div>
      )}

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
  );
}
```

- [ ] **Step 2: Riscrivi `VoceFocus.tsx`** per usare `<VoceCard>` (resta il wrapper a tutto schermo + nav). Sostituisci l'INTERO file con:

```tsx
'use client';

import { type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { SaveBadge, type SaveState } from './SaveBadge';
import { VoceCard, type VoceCardData } from './VoceCard';

export type VoceFocusData = VoceCardData;

export function VoceFocus({
  voce, indice, totale, campi, dettaglio, titoloCampi, disabilitato, stato, saveState,
  onChange, onPrev, onNext, onClose, approvazioneStato, motivoRifiuto,
}: {
  voce: VoceFocusData;
  indice: number;
  totale: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  disabilitato: boolean;
  stato: StatoVoce;
  saveState: SaveState;
  onChange: (chiave: string, valore: unknown) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  approvazioneStato?: string | null;
  motivoRifiuto?: string | null;
}) {
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
        <VoceCard
          voce={voce}
          indice={indice}
          campi={campi}
          dettaglio={dettaglio}
          titoloCampi={titoloCampi}
          stato={stato}
          disabilitato={disabilitato}
          onChange={onChange}
          headerRight={<SaveBadge state={saveState} />}
          approvazioneStato={approvazioneStato}
          motivoRifiuto={motivoRifiuto}
        />
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

> Confronta col file originale: il markup della `<section>` è ora in `VoceCard`; `SaveBadge` viaggia come `headerRight`. Se nel frattempo `VoceFocus` ha props aggiuntive (es. nuovi campi del badge), **propagale a VoceCard** mantenendo la resa.

- [ ] **Step 3: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore. (Se `RapportinoForm` importa `VoceFocusData`, continua a funzionare: è ri-esportato.)

- [ ] **Step 4: Commit**

```bash
git add components/modules/rapportini/VoceCard.tsx components/modules/rapportini/VoceFocus.tsx
git commit -m "refactor(rapportini): estrai VoceCard condivisa da VoceFocus (resa invariata)"
```

---

## Task 3: Pannello "Anteprima operatore" nell'editor

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

> Verifica: `tsc` + manuale. **READ il file corrente** (lo stato/render può essere cambiato per concorrenza).

- [ ] **Step 1: Import**

In testa al file, estendi l'import da `infoCampi` con `partitionInfoCampi` e aggiungi gli import di `VoceCard` e dei dati d'esempio:

```ts
import {
  INFO_CAMPI_DISPONIBILI,
  infoCampiDefault,
  resolveInfoCampi,
  partitionInfoCampi,
  type InfoChiave,
  type TemplateInfoCampo,
} from '@/utils/rapportini/infoCampi';
import { VoceCard } from '@/components/modules/rapportini/VoceCard';
import { SAMPLE_VOCE_INFO, sampleRisposte } from '@/utils/rapportini/sampleVoce';
```

- [ ] **Step 2: Calcola voce e dettagli d'anteprima**

Dentro il componente, prima del `return` (dopo gli helper, vicino agli altri derivati), aggiungi:

```ts
  const anteprimaDettaglio = partitionInfoCampi(infoCampi).dettaglio;
  const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) };
```

- [ ] **Step 3: Aggiungi il pannello sticky come PRIMO figlio dell'editor**

Trova il ramo editor `) : (` seguito da `<>` (apertura del frammento dell'editor, dove sotto c'è la card "Nome template"). Inserisci, **subito dopo `<>`** e prima della card "Nome template":

```tsx
            {/* ── Anteprima operatore (live) ──────────────────────────────── */}
            <div className="sticky top-4 z-10 rounded-2xl border border-[var(--brand-primary)] bg-[var(--brand-surface)] p-4 shadow-sm">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Anteprima operatore</h3>
              <p className="mb-3 text-xs text-[var(--brand-text-muted)]">
                Come apparirà la scheda all&apos;operatore (dati d&apos;esempio). Si aggiorna mentre componi il template.
              </p>
              <div className="mx-auto max-h-[70vh] max-w-[420px] overflow-y-auto">
                <VoceCard
                  voce={anteprimaVoce}
                  indice={0}
                  campi={campi}
                  dettaglio={anteprimaDettaglio}
                  titoloCampi={titoloCampi}
                  stato="da_fare"
                  disabilitato
                  onChange={() => {}}
                />
              </div>
            </div>
```

- [ ] **Step 4: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(rapportini): anteprima operatore live nell'editor del template"
```

---

## Task 4: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: tutti i test del progetto verdi (i nuovi `sampleVoce` inclusi). *Nota:* eventuali file falliti dentro `.claude/worktrees/.../node_modules/` sono rumore di un worktree concorrente — ignorali; non devono esserci fallimenti in `utils/`, `lib/`, `app/`, `components/`.

- [ ] **Step 2: Typecheck + lint dei file toccati**

Run:
```bash
npx tsc --noEmit
npx eslint utils/rapportini/sampleVoce.ts utils/rapportini/sampleVoce.test.ts components/modules/rapportini/VoceCard.tsx components/modules/rapportini/VoceFocus.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
```
Expected: tsc pulito; eslint senza nuovi problemi sui file elencati.

- [ ] **Step 3: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 4: Verifiche manuali (anteprima Vercel, dopo deploy con OK utente)**

1. **Iso-resa operatore:** apri un rapportino digitale `/r/[token]`, scheda di una voce → **identica** a prima dell'estrazione (titolo, indirizzo cliccabile, "Punto esatto" se coordinata, dettagli, lavorazioni, badge manuale se presente).
2. **Anteprima editor:** *Impostazioni → Template rapportini* → seleziona/crea un template → il pannello "Anteprima operatore" mostra la scheda d'esempio e **si aggiorna** mentre: rinomini etichette info, riordini campi, aggiungi/togli campi crocetta/testo, cambi l'intestazione/titolo.
3. **Coordinate:** aggiungi il campo **COORDINATE** ai campi info → in anteprima compare il link "Punto esatto · 41.853305, 12.782855".

---

## Note per chi esegue

- **Resa invariata operatore:** l'estrazione `VoceCard` NON deve cambiare nulla per l'operatore. Se trovi differenze di markup tra il file attuale e quello del piano (per via di feature concorrenti), **parti dal file attuale** e sposta la `<section>` in `VoceCard` preservando tutto, inclusi badge/approvazione.
- **Niente API/DB/Excel/migration:** solo componenti + dati d'esempio.
- **Deploy:** sullo stesso branch del fix 400; a fine, su OK utente, ff in `main` (Vercel) — l'utente riceve salvataggio COORDINATE + anteprima insieme.
