# Redesign "Assegnazioni AI" — Fase 1 (ristrutturazione UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare `/hub/assegnazione-ai` da pagina monolitica a **hub gerarchico drill-down** (Commessa → Attività → Azione) con breadcrumb e stato in URL, riusando i flussi/endpoint esistenti e i primitivi del design system.

**Architecture:** Una `page.tsx` server carica i dati di entrambe le aree (pianificabili + giri agente). Un client-shell legge lo stato di navigazione dall'URL (`?commessa&attivita&azione`) e monta il livello giusto: griglie di card navigabili (L0/L1/L2) o una **foglia-azione**. Le foglie incapsulano i flussi esistenti chiamando gli stessi endpoint admin. Componenti pesanti estratti dal monolite (anteprima, pannello ACEA) e riusati.

**Tech Stack:** Next.js App Router (Server + Client Components), React, TypeScript, Tailwind + token `var(--…)`, primitivi `@/components/*` (DESIGN.md), Supabase (solo lettura server).

**Spec:** `docs/superpowers/specs/2026-06-22-redesign-assegnazioni-ai-modulo-design.md`

## Global Constraints

- **Design system = DESIGN.md.** Usa i primitivi `@/components/Button`, `@/components/Card` (`Card/CardHeader/CardContent/CardFooter`), `@/components/Badge`, `@/components/ui/DatePicker`, `@/components/ui/Dialog`, `@/components/Tabs`. Colori SOLO via `var(--token)`/utility `@theme`. Testo su fill accentati = `var(--on-primary)` (mai `text-white`). Spie stato = `var(--status-*)`. Sentence case. Niente hex/oklch nel markup, niente glow/gradienti/oro.
- **PREREQUISITO base branch:** i primitivi e i token sopra devono esistere sul branch base. Verificare a inizio implementazione (`ls components/Button.* components/Card.* components/ui/DatePicker.* components/Badge.* components/Tabs.*`). Se mancano sul branch scelto, fermarsi e concordare la base col controller (il redesign "sobrio" potrebbe vivere su un branch diverso da `origin/main`).
- **`/hub/agente` NON si tocca** (resta il modulo di configurazione/diagnostica).
- **Endpoint invariati in Fase 1**: `acea-stato`, `leggi-pianificabili`, `anteprima`, `assegna`, `scarta`, `acea-assegna`, `acea-esiti`, `esegui-ora`, `assegnazioni`. Nessuna migration.
- **Navigazione**: stato in URL query (`commessa`,`attivita`,`azione`) via `useSearchParams`+`router.push` client-side (no reload server per drill). Back del browser coerente.
- **Driver Playwright e comandi PowerShell**: fuori scope.
- Baseline repo: lint/test hanno rossi pre-esistenti altrove → gate = verde/pulito sui file toccati + `next build` ok.

---

### Task 1: page.tsx server — dati combinati

**Files:**
- Modify: `app/hub/assegnazione-ai/page.tsx`

**Interfaces:**
- Produces (props del nuovo shell): `righe: RigaPianificabile[]`, `fileConfig: FileConfig[]`, `pianificaData: string|null`, `runs: AgenteRunRow[]`, `online: { minutiDaContatto: number|null; ultimoContatto: string|null }`.

- [ ] **Step 1: Carica anche runs + online (oltre ai dati già presenti)**

In `page.tsx`, aggiungi al `Promise.all` la lettura dei giri e dell'ultimo contatto (replica del pattern di `app/hub/agente/page.tsx:61-65`). Esempio:

```ts
const [{ data: cfg }, { data: righe }, { data: fileCfg }, { data: runRows }] = await Promise.all([
  supabaseAdmin.from('agente_config').select('pianifica_data, ultimo_contatto_il').eq('id', 1).maybeSingle(),
  supabaseAdmin.from('agente_pianificabili').select('*').order('comune', { ascending: true }).order('riga', { ascending: true }),
  supabaseAdmin.from('agente_file_config').select('*'),
  supabaseAdmin.from('agente_run').select('*').order('creato_il', { ascending: false }).limit(30),
]);
const ultimoContatto = (cfg as { ultimo_contatto_il?: string | null } | null)?.ultimo_contatto_il ?? null;
const minutiDaContatto = ultimoContatto ? Math.max(0, Math.floor((Date.now() - new Date(ultimoContatto).getTime()) / 60000)) : null;
```

- [ ] **Step 2: Passa i nuovi props al nuovo shell**

```tsx
return (
  <AssegnazioniAiClient
    righe={(righe ?? []) as RigaPianificabile[]}
    fileConfig={(fileCfg ?? []) as FileConfig[]}
    pianificaData={ultimoContatto != null ? (cfg as { pianifica_data?: string | null } | null)?.pianifica_data ?? null : null}
    runs={(runRows ?? []) as AgenteRunRow[]}
    online={{ minutiDaContatto, ultimoContatto }}
  />
);
```
Import: `AssegnazioniAiClient` (nuovo, Task 3) + `type { AgenteRunRow } from '@/lib/agente/uiTypes'`. Mantieni il gate ruolo/`allowedModules.includes('assegnazione-ai')` invariato.

- [ ] **Step 3: Verifica build del server component**

Run: `npx tsc --noEmit 2>&1 | grep "hub/assegnazione-ai/page" || echo "OK page"`
Expected: `OK page`.

- [ ] **Step 4: Commit**

```bash
git add app/hub/assegnazione-ai/page.tsx
git commit -m "feat(assegnazioni-ai): page carica runs+online per le foglie del redesign"
```

---

### Task 2: Navigazione (URL state) + Breadcrumb

**Files:**
- Create: `components/modules/assegnazione-ai/useAceaNav.ts`
- Create: `components/modules/assegnazione-ai/Breadcrumb.tsx`
- Test: `lib/agente/aceaNav.test.ts` (logica pura di parsing/labels)

**Interfaces:**
- Produces: `type NavState = { commessa: string|null; attivita: string|null; azione: string|null }`; `useAceaNav(): { nav: NavState; vai(next: Partial<NavState>): void; risali(to: 'root'|'commessa'|'attivita'): void }`; `BREADCRUMB_LABELS`; `<Breadcrumb nav segments onNavigate />`.
- La logica PURA di derivazione segment/label sta in `lib/agente/aceaNav.ts` (testabile senza router).

- [ ] **Step 1: Write the failing test (logica pura)**

```ts
// lib/agente/aceaNav.test.ts
import { describe, it, expect } from 'vitest';
import { breadcrumbSegments } from './aceaNav';

describe('breadcrumbSegments', () => {
  it('root → vuoto', () => {
    expect(breadcrumbSegments({ commessa: null, attivita: null, azione: null })).toEqual([]);
  });
  it('commessa+attivita+azione → 3 segmenti con label', () => {
    const s = breadcrumbSegments({ commessa: 'acea', attivita: 'lm', azione: 'assegna' });
    expect(s.map((x) => x.label)).toEqual(['ACEA', 'Limitazioni massive', 'Assegna ODL']);
    expect(s.map((x) => x.level)).toEqual(['commessa', 'attivita', 'azione']);
  });
});
```

- [ ] **Step 2: Run test (fail)** — `npx vitest run lib/agente/aceaNav.test.ts` → FAIL (modulo assente).

- [ ] **Step 3: Implement `lib/agente/aceaNav.ts`**

```ts
// lib/agente/aceaNav.ts — PURO: label e segmenti del breadcrumb per l'hub Assegnazioni AI.
export type NavState = { commessa: string | null; attivita: string | null; azione: string | null };

export const COMMESSA_LABEL: Record<string, string> = { acea: 'ACEA' };
export const ATTIVITA_LABEL: Record<string, string> = { lm: 'Limitazioni massive', dunning: 'Dunning' };
export const AZIONE_LABEL: Record<string, string> = {
  'aggiorna-odl': 'Aggiorna ODL',
  'aggiorna-stato': 'Aggiorna stato ODL',
  assegna: 'Assegna ODL',
  'assegna-interventi': 'Assegna interventi',
  sincronizza: 'Sincronizza rapportini',
};

export type Segment = { level: 'commessa' | 'attivita' | 'azione'; key: string; label: string };

export function breadcrumbSegments(nav: NavState): Segment[] {
  const out: Segment[] = [];
  if (nav.commessa) out.push({ level: 'commessa', key: nav.commessa, label: COMMESSA_LABEL[nav.commessa] ?? nav.commessa });
  if (nav.attivita) out.push({ level: 'attivita', key: nav.attivita, label: ATTIVITA_LABEL[nav.attivita] ?? nav.attivita });
  if (nav.azione) out.push({ level: 'azione', key: nav.azione, label: AZIONE_LABEL[nav.azione] ?? nav.azione });
  return out;
}
```

- [ ] **Step 4: Run test (pass)** — `npx vitest run lib/agente/aceaNav.test.ts` → PASS.

- [ ] **Step 5: Implement `useAceaNav.ts` (hook URL-state)**

```ts
'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { NavState } from '@/lib/agente/aceaNav';

export function useAceaNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const nav: NavState = { commessa: sp.get('commessa'), attivita: sp.get('attivita'), azione: sp.get('azione') };

  const push = useCallback((next: NavState) => {
    const qs = new URLSearchParams();
    if (next.commessa) qs.set('commessa', next.commessa);
    if (next.attivita) qs.set('attivita', next.attivita);
    if (next.azione) qs.set('azione', next.azione);
    router.push(qs.toString() ? `${pathname}?${qs}` : pathname);
  }, [router, pathname]);

  const vai = useCallback((p: Partial<NavState>) => push({ ...nav, ...p }), [nav, push]);
  const risali = useCallback((to: 'root' | 'commessa' | 'attivita') => {
    if (to === 'root') push({ commessa: null, attivita: null, azione: null });
    else if (to === 'commessa') push({ commessa: nav.commessa, attivita: null, azione: null });
    else push({ commessa: nav.commessa, attivita: nav.attivita, azione: null });
  }, [nav, push]);

  return { nav, vai, risali };
}
```

- [ ] **Step 6: Implement `Breadcrumb.tsx`** (primitivi/token; segmento cliccabile risale)

Render: una riga con «← Indietro» (risale di un livello) + i segmenti `breadcrumbSegments(nav)` separati da `/`, ciascuno un `Button variant="ghost" size="sm"` che chiama `onNavigate(level)`; l'ultimo segmento non cliccabile (testo `--brand-text-main`). Usa `var(--brand-text-muted)` per i separatori. Props: `{ nav: NavState; onNavigate: (level: 'root'|'commessa'|'attivita') => void }`. Niente nuovo colore.

- [ ] **Step 7: Commit**

```bash
git add lib/agente/aceaNav.ts lib/agente/aceaNav.test.ts components/modules/assegnazione-ai/useAceaNav.ts components/modules/assegnazione-ai/Breadcrumb.tsx
git commit -m "feat(assegnazioni-ai): navigazione drill-down via URL + breadcrumb"
```

---

### Task 3: Shell `AssegnazioniAiClient` (router dei livelli)

**Files:**
- Create: `components/modules/assegnazione-ai/AssegnazioniAiClient.tsx`

**Interfaces:**
- Consumes: props da Task 1; `useAceaNav` (Task 2); griglie (Task 4); foglie (Task 7-9).
- Produces: il componente client esportato di default usato da `page.tsx`.

- [ ] **Step 1: Implement lo shell**

```tsx
'use client';
import { useAceaNav } from './useAceaNav';
import { Breadcrumb } from './Breadcrumb';
import { CommessaGrid } from './CommessaGrid';
import { AttivitaGrid } from './AttivitaGrid';
import { AzioneGrid } from './AzioneGrid';
import { Foglia } from './foglie/Foglia';
import type { RigaPianificabile, FileConfig } from './tipi';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';

export default function AssegnazioniAiClient(props: {
  righe: RigaPianificabile[]; fileConfig: FileConfig[]; pianificaData: string | null;
  runs: AgenteRunRow[]; online: { minutiDaContatto: number | null; ultimoContatto: string | null };
}) {
  const { nav, vai, risali } = useAceaNav();
  const { commessa, attivita, azione } = nav;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>Assegnazioni AI</h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Operazioni ACEA per commessa e attività.</p>
      </header>

      {commessa && <Breadcrumb nav={nav} onNavigate={risali} />}

      {!commessa && <CommessaGrid onSelect={(c) => vai({ commessa: c, attivita: null, azione: null })} />}
      {commessa && !attivita && <AttivitaGrid commessa={commessa} onSelect={(a) => vai({ attivita: a, azione: null })} />}
      {commessa && attivita && !azione && <AzioneGrid commessa={commessa} attivita={attivita} onSelect={(az) => vai({ azione: az })} />}
      {commessa && attivita && azione && <Foglia nav={nav} {...props} />}
    </main>
  );
}
```

- [ ] **Step 2: Crea `tipi.ts`** spostando i type `RigaPianificabile`, `FileConfig`, `StoricoRiga`, `AceaEsiti*` dal vecchio `AssegnazioneAiClient.tsx` (così foglie e page li importano). Aggiorna l'import in `page.tsx` (Task 1) a `from './…/tipi'`.

- [ ] **Step 3: Verifica typecheck** — `npx tsc --noEmit 2>&1 | grep "assegnazione-ai/AssegnazioniAiClient\|/tipi" || echo OK`. (Le griglie/foglie sono stub finché Task 4-9; in subagent-driven questo task arriva dopo i suoi consumati — vedi ordine.)

- [ ] **Step 4: Commit**

```bash
git add components/modules/assegnazione-ai/AssegnazioniAiClient.tsx components/modules/assegnazione-ai/tipi.ts app/hub/assegnazione-ai/page.tsx
git commit -m "feat(assegnazioni-ai): shell router dei livelli + tipi condivisi"
```

> Nota ordine d'esecuzione: implementare Task 4–9 PRIMA del wiring finale di Task 3, oppure creare stub minimi delle griglie/foglie in questo task e completarli dopo. Il controller decide; le interfacce sono fissate qui.

---

### Task 4: Griglie di navigazione (L0/L1/L2)

**Files:**
- Create: `components/modules/assegnazione-ai/CommessaGrid.tsx`, `AttivitaGrid.tsx`, `AzioneGrid.tsx`

**Interfaces:**
- `CommessaGrid({ onSelect: (c: string) => void })` — 3 `Card`: ACEA (interactive) + 2 disabilitate con `Badge`("in arrivo").
- `AttivitaGrid({ commessa, onSelect })` — per ACEA 2 card: `lm` (Limitazioni massive), `dunning` (Dunning).
- `AzioneGrid({ commessa, attivita, onSelect })` — definisce le azioni per attività:
  - `lm` → `['aggiorna-odl','assegna','sincronizza']`
  - `dunning` → `['aggiorna-stato','assegna-interventi']`
  con label da `AZIONE_LABEL` (`lib/agente/aceaNav.ts`).

- [ ] **Step 1: Implement le 3 griglie con i primitivi**

Ogni nodo navigabile = `<Card interactive>` (DESIGN.md §7) con titolo (`text-base font-semibold`), una riga descrittiva muted, icona da `moduleIcons.tsx`, `onClick={() => onSelect(key)}` + `focus-visible:ring-2 ring-[var(--brand-primary)]`; griglia `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. Card disabilitate: `aria-disabled`, opacità ridotta, `Badge variant="muted"` "in arrivo", nessun onClick. Nessun colore hardcoded.

Descrizioni (sentence case): `aggiorna-odl`/`aggiorna-stato` = "Aggiorna lo stato ODL leggendolo dal portale ACEA"; `assegna`/`assegna-interventi` = "Leggi il file per un giorno e assegna gli interventi (app + ACEA)"; `sincronizza` = "Scrivi gli esiti dei rapportini sul file".

- [ ] **Step 2: Verifica** — `npx tsc --noEmit 2>&1 | grep "assegnazione-ai/\(Commessa\|Attivita\|Azione\)Grid" || echo OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/assegnazione-ai/CommessaGrid.tsx components/modules/assegnazione-ai/AttivitaGrid.tsx components/modules/assegnazione-ai/AzioneGrid.tsx
git commit -m "feat(assegnazioni-ai): griglie navigabili commessa/attivita/azione"
```

---

### Task 5: Estrai `AnteprimaPianificazione`

**Files:**
- Create: `components/modules/assegnazione-ai/AnteprimaPianificazione.tsx`

**Interfaces:**
- `AnteprimaPianificazione({ gruppi, selezione, espansi, caricando, onToggleRiga, onToggleOperatore, onToggleEspandi, onScarta })` dove `gruppi: GruppoOperatore[]`, `selezione: Set<string>`, `espansi: Set<string>`, callbacks come nel monolite.
- Espone anche le costanti `STATO` e l'helper `righeLibere` (oggi nel monolite) se servono internamente.

- [ ] **Step 1: Sposta il blocco JSX dell'anteprima**

Estrai dal vecchio `AssegnazioneAiClient.tsx` il blocco **righe 462-548** (la lista `gruppi.map(...)` con header operatore, checkbox, espansione comuni, tabella interventi, pulsante ✕ scarta) e gli helper `STATO` (46-51), `iniziali` (59-63), `ddmm` (65-68), `righeLibere` (244-246) in questo componente. I callback (`toggleRiga`, `toggleOperatore`, `toggleEspandi`, `scarta`) diventano props. **Conserva la logica identica** (indeterminate checkbox, opacità, stati). Per i colori mantieni i `var(--…)` esistenti; converti dove banale i contenitori a `Card` (DESIGN.md) senza cambiare comportamento.

- [ ] **Step 2: Verifica** — `npx tsc --noEmit 2>&1 | grep "AnteprimaPianificazione" || echo OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/assegnazione-ai/AnteprimaPianificazione.tsx
git commit -m "feat(assegnazioni-ai): estrai componente AnteprimaPianificazione"
```

---

### Task 6: Estrai `PannelloAceaAssegna`

**Files:**
- Create: `components/modules/assegnazione-ai/PannelloAceaAssegna.tsx`

**Interfaces:**
- `PannelloAceaAssegna({ data, odlCount, aceaDry, onToggleDry, onScrivi, arming, msg, esiti, checking, onRicarica })` — riusa i type `AceaEsiti` (da `tipi.ts`).

- [ ] **Step 1: Sposta il blocco JSX del pannello ACEA**

Estrai dal vecchio `AssegnazioneAiClient.tsx` il blocco **righe 363-431** (riga giorno + N ODL, toggle Prova, pulsante Scrivi/Prova, messaggio, e il box "Esito assegnazione ACEA" con riepilogo + tabella per-ODL). I dati/azioni diventano props. Mantieni la logica; usa `Button`/`Badge` dove banale e `var(--status-*)` per gli stati esito.

- [ ] **Step 2: Verifica** — `npx tsc --noEmit 2>&1 | grep "PannelloAceaAssegna" || echo OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/assegnazione-ai/PannelloAceaAssegna.tsx
git commit -m "feat(assegnazioni-ai): estrai componente PannelloAceaAssegna"
```

---

### Task 7: Foglia `AssegnaOdl` (data → leggi → anteprima → 2 azioni)

**Files:**
- Create: `components/modules/assegnazione-ai/foglie/AssegnaOdl.tsx`

**Interfaces:**
- `AssegnaOdl({ nav, righe, fileConfig, pianificaData })`. Filtra `righe`/`fileConfig` per la commessa+attività correnti (mappa `attivita` nav→`agente_file_config.attivita`: `lm`→`'LIMITAZIONI MASSIVE'`, `dunning`→il resto ACEA). Porta dentro gli stati/handler del monolite: `data`, `leggi()`, `caricaAnteprima/anteprima`, `procedi()`, `scarta()`, `scriviAcea()`, `caricaAceaEsiti`, selezione/espansi.

- [ ] **Step 1: Implement la foglia**

Struttura (usa primitivi + `DatePicker`):
1. `Card` "Sincronizza file": `DatePicker` (`data`) + `Button` "Sincronizza file" → `leggi()` (POST `leggi-pianificabili`, copia handler dal monolite righe 176-189) + banner `pianificaData` in attesa.
2. `<AnteprimaPianificazione …/>` (Task 5) alimentata da `caricaAnteprima` (POST `anteprima`, handler righe 139-157) sui soli `ids` dell'attività corrente; selezione/toggle/scarta come monolite (righe 240-269).
3. Barra azioni (sticky, `Card`): contatori (righe 271-282) + `Button primary` **«Crea rapportini (app)»** → `procedi()` (POST `assegna`, righe 191-216).
4. `<PannelloAceaAssegna …/>` (Task 6): per `dunning` attivo (`scriviAcea`, POST `acea-assegna`, righe 218-238 + polling 233); per `lm` mostra il pannello con **«Assegna su ACEA» disabilitato** + nota «in arrivo (Fase 2)», ma «Crea rapportini» attivo. `odlCount` = righe del giorno per quell'attività.

Copia i fetch handler **verbatim** dal monolite (stessi endpoint/payload). Niente `text-white` (usa `Button primary` → `--on-primary`).

- [ ] **Step 2: Verifica** — `npx tsc --noEmit 2>&1 | grep "foglie/AssegnaOdl" || echo OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/assegnazione-ai/foglie/AssegnaOdl.tsx
git commit -m "feat(assegnazioni-ai): foglia AssegnaOdl (leggi+anteprima+crea rapportini+ACEA)"
```

---

### Task 8: Foglia `AggiornaStatoOdl` + auto-refresh post-tick

**Files:**
- Create: `components/modules/assegnazione-ai/foglie/AggiornaStatoOdl.tsx`
- Create: `components/modules/assegnazione-ai/usePollRuns.ts`

**Interfaces:**
- `AggiornaStatoOdl({ nav, runs, online })`. `target` = `nav.attivita === 'lm' ? 'zagarolo' : 'dunning'`.
- `usePollRuns(onTick: () => void, attivo: boolean)` — polling leggero (es. 4 colpi a 15/35/60/90s) che chiama `router.refresh()`/callback; stop a `attivo=false`.

- [ ] **Step 1: Implement la foglia**

`Card` con: spia **Online** (da `online.minutiDaContatto`: ≤2 = `--status-ok` "Online", altrimenti `--status-idle` "Offline · N min fa"); `Button primary` «Aggiorna stato ODL da ACEA» → `POST /api/admin/agente/acea-stato` body `{ target }` (handler analogo a AgenteClient `aggiornaStatoAcea`); messaggio "richiesta inviata, parte al prossimo contatto"; sotto, `<StoricoCard runs={runs.filter(r => r.tipo === 'acea-stato')} />` (riuso `@/components/modules/agente/StoricoCard`). Dopo l'invio attiva `usePollRuns` con `router.refresh()` così lo storico si aggiorna da solo.

- [ ] **Step 2: Verifica** — `npx tsc --noEmit 2>&1 | grep "AggiornaStatoOdl\|usePollRuns" || echo OK`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/assegnazione-ai/foglie/AggiornaStatoOdl.tsx components/modules/assegnazione-ai/usePollRuns.ts
git commit -m "feat(assegnazioni-ai): foglia AggiornaStatoOdl + auto-refresh post-tick"
```

---

### Task 9: Foglia `SincronizzaRapportini` + dispatcher `Foglia`

**Files:**
- Create: `components/modules/assegnazione-ai/foglie/SincronizzaRapportini.tsx`
- Create: `components/modules/assegnazione-ai/foglie/Foglia.tsx`

**Interfaces:**
- `SincronizzaRapportini({ runs, online })` — solo LM.
- `Foglia({ nav, righe, fileConfig, pianificaData, runs, online })` — instrada all'azione corretta in base a `nav.azione`.

- [ ] **Step 1: Implement `SincronizzaRapportini`**

`Card`: spia Online; `Button primary` «Esegui ora» → `POST /api/admin/agente/esegui-ora` (handler analogo a AgenteClient `eseguiOra`); messaggio in attesa; `<StoricoCard runs={runs.filter(r => r.tipo === 'sync')} />`; link `Button variant="ghost"` «Configura colonne in Agente» → `/hub/agente`. `usePollRuns` post-invio.

- [ ] **Step 2: Implement `Foglia` dispatcher**

```tsx
export function Foglia({ nav, ...rest }: FogliaProps) {
  switch (nav.azione) {
    case 'aggiorna-odl':
    case 'aggiorna-stato':       return <AggiornaStatoOdl nav={nav} runs={rest.runs} online={rest.online} />;
    case 'assegna':
    case 'assegna-interventi':   return <AssegnaOdl nav={nav} righe={rest.righe} fileConfig={rest.fileConfig} pianificaData={rest.pianificaData} />;
    case 'sincronizza':          return <SincronizzaRapportini runs={rest.runs} online={rest.online} />;
    default:                     return null;
  }
}
```

- [ ] **Step 3: Verifica** — `npx tsc --noEmit 2>&1 | grep "SincronizzaRapportini\|foglie/Foglia" || echo OK`.

- [ ] **Step 4: Commit**

```bash
git add components/modules/assegnazione-ai/foglie/SincronizzaRapportini.tsx components/modules/assegnazione-ai/foglie/Foglia.tsx
git commit -m "feat(assegnazioni-ai): foglia SincronizzaRapportini + dispatcher Foglia"
```

---

### Task 10: Rimozione monolite + verifica integrazione

**Files:**
- Delete: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx` (sostituito dallo shell + componenti).

- [ ] **Step 1: Rimuovi il vecchio client** e assicurati che nessuno lo importi più (`grep -rn "AssegnazioneAiClient" app components` deve dare solo il nuovo `AssegnazioniAiClient`). `page.tsx` già aggiornato (Task 1/3).

- [ ] **Step 2: Build & lint mirato**

Run: `npx next build 2>&1 | tail -20` → nessun errore di compilazione del modulo.
Run: `npx eslint components/modules/assegnazione-ai app/hub/assegnazione-ai/page.tsx` → nessun errore nuovo.
Run: `npx vitest run lib/agente/aceaNav.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -A components/modules/assegnazione-ai app/hub/assegnazione-ai
git commit -m "feat(assegnazioni-ai): rimuovi monolite, hub gerarchico completo"
```

- [ ] **Step 4: Smoke manuale (deploy)**: landing → 3 card (ACEA attiva); ACEA → LM/Dunning; LM → 3 azioni, Dunning → 2; ogni foglia esegue il flusso e l'URL riflette la posizione; back del browser risale; `/hub/agente` invariato.

## Self-check / criteri di accettazione (Fase 1)

1. Drill-down Commessa→Attività→Azione con breadcrumb; stato in URL; back coerente.
2. LM mostra 3 azioni, Dunning 2; commesse non-ACEA disabilitate.
3. Foglie eseguono i flussi esistenti (aggiorna stato, assegna = leggi→anteprima→crea rapportini + ACEA Dunning, sincronizza) con feedback + auto-refresh post-tick.
4. `/hub/agente` invariato; endpoint invariati; nessuna migration.
5. UI conforme a DESIGN.md (primitivi, token, `--on-primary`, `--status-*`, sentence case; niente hex/glow/`text-white`).
6. `next build` ok; eslint pulito sui file toccati; test `aceaNav` verde.

## Note per la Fase 2 (fuori da questo piano)
Assegnazione LM sul portale: flag `tipo`, `agente_config.acea_assegna_tipo`, filtro per tipo in `app/api/agente/acea-assegnazioni/route.ts` (hook-protected), abilitazione «Assegna su ACEA» per LM — dopo verifica feasibility (ODL 912… cercabili sul Cruscotto).
