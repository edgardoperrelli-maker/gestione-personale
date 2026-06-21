# Redesign sobrio — Piano 1: Fondamenta (token + sweep) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rivalorizzare i token di `app/globals.css` dalla palette "Aurea neon" a quella "sobria enterprise" (light-first, blu unico, grigi freddi, no glow) e bonificare il testo-su-accento hardcoded, così che l'intera app cambi pelle via cascata con i bottoni leggibili in entrambi i temi.

**Architecture:** Approccio A della spec — si cambiano i **valori** dei token `--brand-*`/`--app-bg`/semantici (nomi stabili, ~200 call-site invariati) nei due blocchi esistenti `:root` (dark) e `html.light` (light); si aggiungono token **additivi** (`--on-primary`, `--primary-text`, `--status-*`, `--chart-*`, `--overlay`); si sostituisce il navy magico `oklch(0.16_0.06_245)` con `var(--on-primary)` nei 51 file che lo usano. Light-first è già attivo (commit `3683020`, non si tocca).

**Tech Stack:** Next.js 15, Tailwind v4 (`@import "tailwindcss"` + `@theme inline`), CSS custom properties OKLCH, Geist. Verifica: `npm run build` + controllo visivo nel browser (`npm run dev`).

## Global Constraints

- **Nessuna SQL**, nessun cambio schema, nessuna modifica a logica dati/API/permessi.
- **Nomi token STABILI**: rivalorizzare i `--brand-*`/`--app-bg`/`--card-bg`/`--success`/`--warning`/`--danger`/`--info` esistenti; i nomi nuovi sono **solo additivi**. Mai rinominare/rimuovere token esistenti.
- **Light-first già fatto** (commit `3683020` in `app/layout.tsx`): NON toccare la logica tema di `layout.tsx`/`TopBar.tsx`. Struttura `globals.css` invariata: `:root` = dark, `html.light` = light.
- **Preservare il toggle dark/light**: ogni token va definito sia in `:root` sia in `html.light`.
- **Non rompere** offline/PWA/foto/scanner di `/r`, né geocoding/Leaflet.
- **Branch**: lavorare su `restyle/aurea-light` (già checked out). NON toccare i file acea non committati (`tools/limitazioni-sync/...`, `assegnaInterventi.mjs`) né `.claude/settings.local.json`/`AGENTS.md`. Commit mirati (solo i file di ogni task). Niente push senza ok esplicito.
- **Valori WCAG verificati** (spec App. A): 21/23 coppie passano AA; `--on-primary` è **tema-specifico** (bianco in light, scuro in dark) — questo è il motivo del sweep.
- Lint/test baseline già rossa → gate = "nessun **nuovo** errore dai file toccati".

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `app/globals.css` | Tutti i token di tema (dark `:root` + light `html.light`), `@theme inline`, body, stili globali input/scrollbar | Modify (Task 1) |
| 51 file `*.tsx` con `text-[oklch(0.16_0.06_245)]` | Testo su accento dei bottoni primari | Modify via sweep (Task 2) |
| `components/modules/rapportini/FabInterventoManuale.tsx` | FAB "+" intervento manuale | Modify (Task 2) |

I 51 file del sweep (da `grep`): `app/auth/sign-in/page.tsx`, `components/Button.tsx`, `components/Tabs.tsx`, `components/ui/DatePicker.tsx`, `components/ExportAssignmentsDialog.tsx`, `components/NewAssignmentDialog.tsx`, `components/EditAssignmentDialog.tsx`, `components/InsertReperibileDialog.tsx`, `components/trasferta/TrasfertaAlert.tsx`, `components/offline/ModaleSincronizza.tsx`, `components/offline/FabSync.tsx`, `components/layout/SettingsSubNav.tsx`, `app/impostazioni/{codici-allegato10/CodiciAllegato10Client,hotel/HotelClient,zone-ztl/ZtlZoneClient,utenze/UtenzeClient,gruppo-attivita/GruppoAttivitaClient,territori/TerritoriClient,territori/NewTerritoryModal,risanamento-misuratori/ImportMisuratoriClient,template-rapportini/TemplateRapportiniClient,template-rapportini/SchedeTipo,personale/PersonaleClient,personale/NewOperatorModal}.tsx`, `app/hub/hotel-calendar/{page,SendRequestModal}.tsx`, `components/modules/rapportini/{VoceFocus,TaskViaFocus,CampoInput,CampoFoto,RapportinoLista,RapportinoEditor,ModaleInterventoManuale,ModaleFotoMancanti,ModaleCampiMancanti,CondividiPdfButton,risanamento/RisanamentoView,limitazione/CercaMatricolaLimitazione}.tsx`, `components/modules/cronoprogramma-personale/{CronoSplitView,CronoGridView,CronoCalendarView}.tsx`, `components/modules/mappa/{MappaOperatoriClient,ManualTaskModal,riepilogo/ModaleScaricaFoto,riepilogo/CardTerritorio}.tsx`, `components/modules/interventi/{InterventiAssegnabili,RiconsegnaClient,GeocodePanel}.tsx`, `components/modules/lista-attesa/{PannelloRevisioneRichiesta,CodaRichiesteManuali,CaricaFotoRichiesta}.tsx`.

---

## Task 1: Rivalorizzazione token `globals.css`

**Files:**
- Modify: `app/globals.css` (blocchi `:root` righe 3-77, `html.light` righe 80-154, `@theme inline` righe 156-198, `body` righe 200-217, stili globali 221-263)

**Interfaces:**
- Consumes: niente (è la base).
- Produces: i token rivalorizzati + i token additivi `--on-primary`, `--primary-text`, `--status-ok/ko/warn/progress/idle` (+ `-soft`), `--on-danger`, `--on-warning`, `--on-marker`, `--overlay`, `--chart-1..8`, definiti sia in dark sia in light. Questi nomi sono usati dal Task 2 (`--on-primary`) e dai piani successivi.

- [ ] **Step 1: Sostituire l'intero blocco `:root` (dark sobrio).** Sostituisci le righe 3-77 (da `:root {` a `}` incluso) con:

```css
:root {
  --sidebar-bg-from: oklch(0.22 0.012 255);
  --sidebar-bg-to:   oklch(0.20 0.012 255);
  --sidebar-border:  oklch(0.32 0.012 255 / 0.6);
  --sidebar-text:    oklch(0.94 0.006 255);
  --sidebar-muted:   oklch(0.70 0.012 255);

  --brand-bg:             oklch(0.20 0.012 255);
  --brand-surface:        oklch(0.24 0.014 255);
  --brand-surface-muted:  oklch(0.225 0.013 255);

  --brand-primary:        oklch(0.70 0.15 255);
  --brand-primary-hover:  oklch(0.76 0.15 255);
  --brand-primary-soft:   oklch(0.70 0.15 255 / 0.18);
  --brand-primary-border: oklch(0.70 0.15 255 / 0.40);
  --brand-nav-active-bg:  oklch(0.70 0.15 255 / 0.16);

  --brand-gold:           oklch(0.80 0.13 75);
  --brand-gold-soft:      oklch(0.80 0.13 75 / 0.18);

  --brand-magenta:        oklch(0.68 0.12 350);
  --brand-magenta-soft:   oklch(0.68 0.12 350 / 0.16);
  --brand-green:          oklch(0.74 0.15 150);
  --brand-green-soft:     oklch(0.74 0.15 150 / 0.16);
  --brand-violet:         oklch(0.66 0.14 295);
  --brand-violet-soft:    oklch(0.66 0.14 295 / 0.16);

  --brand-border:         oklch(0.32 0.012 255);
  --brand-border-strong:  oklch(0.40 0.012 255);

  --brand-text-main:      oklch(0.94 0.006 255);
  --brand-text-muted:     oklch(0.70 0.012 255);
  --brand-text-subtle:    oklch(0.56 0.012 255);

  --kpi-rosso-bg:        oklch(0.70 0.15 255 / 0.16);
  --kpi-rosso-text:      oklch(0.82 0.12 255);
  --kpi-rosso-icon:      oklch(0.70 0.15 255);
  --kpi-giallo-bg:       oklch(0.80 0.13 75 / 0.16);
  --kpi-giallo-text:     oklch(0.84 0.11 80);
  --kpi-giallo-icon:     oklch(0.80 0.13 75);
  --kpi-terracotta-bg:   oklch(0.72 0.17 25 / 0.16);
  --kpi-terracotta-text: oklch(0.80 0.14 30);
  --kpi-terracotta-icon: oklch(0.72 0.17 25);
  --kpi-grafite-bg:      oklch(0.74 0.15 150 / 0.16);
  --kpi-grafite-text:    oklch(0.80 0.13 150);
  --kpi-grafite-icon:    oklch(0.74 0.15 150);

  --success:      oklch(0.74 0.15 150);
  --success-soft: oklch(0.74 0.15 150 / 0.18);
  --warning:      oklch(0.80 0.13 75);
  --warning-soft: oklch(0.80 0.13 75 / 0.18);
  --danger:       oklch(0.72 0.17 25);
  --danger-soft:  oklch(0.72 0.17 25 / 0.18);
  --info:         oklch(0.70 0.15 255);
  --info-soft:    oklch(0.70 0.15 255 / 0.18);
  --viola:        oklch(0.66 0.14 300);
  --viola-soft:   oklch(0.66 0.14 300 / 0.16);

  --app-bg:     oklch(0.20 0.012 255);
  --card-bg:    oklch(0.24 0.014 255);
  --card-bd:    oklch(0.32 0.012 255);
  --we-bg:      oklch(0.225 0.013 255);
  --hol-bg:     oklch(0.72 0.17 25 / 0.12);
  --today-ring: oklch(0.70 0.15 255);

  --shadow-sm:    0 1px 2px rgba(0,0,0,0.30);
  --shadow-md:    0 2px 8px rgba(0,0,0,0.35);
  --shadow-lg:    0 10px 28px rgba(0,0,0,0.42);
  --shadow-hover: 0 2px 8px rgba(0,0,0,0.35);
  --btn-primary-glow:       0 1px 2px rgba(0,0,0,0.30);
  --btn-primary-glow-hover: 0 2px 8px rgba(0,0,0,0.35);

  --text-gold-soft: oklch(0.70 0.012 255);
  --border-light:   oklch(0.32 0.012 255);

  /* additivi redesign sobrio (dark) */
  --on-primary:   oklch(0.20 0.012 255);
  --on-danger:    oklch(0.20 0.012 255);
  --on-warning:   oklch(0.20 0.012 255);
  --on-marker:    oklch(0.20 0.012 255);
  --primary-text: oklch(0.82 0.12 255);
  --overlay:      oklch(0 0 0 / 0.60);

  --status-ok:        oklch(0.74 0.15 150);
  --status-ok-soft:   oklch(0.74 0.15 150 / 0.18);
  --status-ko:        oklch(0.72 0.17 25);
  --status-ko-soft:   oklch(0.72 0.17 25 / 0.18);
  --status-warn:      oklch(0.80 0.13 75);
  --status-warn-soft: oklch(0.80 0.13 75 / 0.18);
  --status-progress:      oklch(0.70 0.15 255);
  --status-progress-soft: oklch(0.70 0.15 255 / 0.18);
  --status-idle:      oklch(0.55 0.012 255);
  --status-idle-soft: oklch(0.55 0.012 255 / 0.18);

  --chart-1: oklch(0.70 0.15 255);
  --chart-2: oklch(0.74 0.15 150);
  --chart-3: oklch(0.80 0.13 75);
  --chart-4: oklch(0.72 0.17 25);
  --chart-5: oklch(0.66 0.10 300);
  --chart-6: oklch(0.72 0.10 200);
  --chart-7: oklch(0.62 0.04 255);
  --chart-8: oklch(0.78 0.03 255);
}
```

- [ ] **Step 2: Sostituire l'intero blocco `html.light` (light sobrio, default).** Sostituisci le righe 80-154 (da `html.light {` a `}` incluso; lascia il commento `/* ===== Tema chiaro ... */` sopra o aggiornalo) con:

```css
html.light {
  --sidebar-bg-from: oklch(1 0 0);
  --sidebar-bg-to:   oklch(0.985 0.003 250);
  --sidebar-border:  oklch(0.92 0.006 250 / 0.9);
  --sidebar-text:    oklch(0.27 0.02 255);
  --sidebar-muted:   oklch(0.50 0.02 255);

  --brand-bg:             oklch(0.985 0.003 250);
  --brand-surface:        oklch(1 0 0);
  --brand-surface-muted:  oklch(0.975 0.004 250);

  --brand-primary:        oklch(0.55 0.17 255);
  --brand-primary-hover:  oklch(0.48 0.17 255);
  --brand-primary-soft:   oklch(0.55 0.17 255 / 0.10);
  --brand-primary-border: oklch(0.55 0.17 255 / 0.35);
  --brand-nav-active-bg:  oklch(0.55 0.17 255 / 0.10);

  --brand-gold:           oklch(0.52 0.11 70);
  --brand-gold-soft:      oklch(0.62 0.13 75 / 0.16);

  --brand-magenta:        oklch(0.50 0.16 350);
  --brand-magenta-soft:   oklch(0.50 0.16 350 / 0.12);
  --brand-green:          oklch(0.50 0.13 150);
  --brand-green-soft:     oklch(0.50 0.13 150 / 0.14);
  --brand-violet:         oklch(0.50 0.16 295);
  --brand-violet-soft:    oklch(0.50 0.16 295 / 0.12);

  --brand-border:         oklch(0.92 0.006 250);
  --brand-border-strong:  oklch(0.86 0.008 250);

  --brand-text-main:      oklch(0.27 0.02 255);
  --brand-text-muted:     oklch(0.50 0.02 255);
  --brand-text-subtle:    oklch(0.62 0.015 255);

  --kpi-rosso-bg:        oklch(0.55 0.17 255 / 0.10);
  --kpi-rosso-text:      oklch(0.42 0.16 255);
  --kpi-rosso-icon:      oklch(0.55 0.17 255);
  --kpi-giallo-bg:       oklch(0.62 0.13 75 / 0.16);
  --kpi-giallo-text:     oklch(0.45 0.10 70);
  --kpi-giallo-icon:     oklch(0.52 0.11 70);
  --kpi-terracotta-bg:   oklch(0.52 0.20 25 / 0.10);
  --kpi-terracotta-text: oklch(0.45 0.18 25);
  --kpi-terracotta-icon: oklch(0.52 0.20 25);
  --kpi-grafite-bg:      oklch(0.50 0.13 150 / 0.12);
  --kpi-grafite-text:    oklch(0.40 0.12 150);
  --kpi-grafite-icon:    oklch(0.50 0.13 150);

  --success:      oklch(0.50 0.13 150);
  --success-soft: oklch(0.50 0.13 150 / 0.12);
  --warning:      oklch(0.52 0.11 70);
  --warning-soft: oklch(0.62 0.13 75 / 0.16);
  --danger:       oklch(0.52 0.20 25);
  --danger-soft:  oklch(0.52 0.20 25 / 0.10);
  --info:         oklch(0.55 0.17 255);
  --info-soft:    oklch(0.55 0.17 255 / 0.10);
  --viola:        oklch(0.50 0.16 300);
  --viola-soft:   oklch(0.50 0.16 300 / 0.12);

  --app-bg:     oklch(0.985 0.003 250);
  --card-bg:    oklch(1 0 0);
  --card-bd:    oklch(0.92 0.006 250);
  --we-bg:      oklch(0.975 0.004 250);
  --hol-bg:     oklch(0.52 0.20 25 / 0.07);
  --today-ring: oklch(0.55 0.17 255);

  --shadow-sm:    0 1px 2px rgba(16,24,40,0.05);
  --shadow-md:    0 1px 3px rgba(16,24,40,0.08);
  --shadow-lg:    0 8px 24px rgba(16,24,40,0.10);
  --shadow-hover: 0 1px 3px rgba(16,24,40,0.08);
  --btn-primary-glow:       0 1px 2px rgba(16,24,40,0.05);
  --btn-primary-glow-hover: 0 1px 3px rgba(16,24,40,0.08);

  --text-gold-soft: oklch(0.50 0.02 255);
  --border-light:   oklch(0.92 0.006 250);

  /* additivi redesign sobrio (light) */
  --on-primary:   oklch(1 0 0);
  --on-danger:    oklch(1 0 0);
  --on-warning:   oklch(1 0 0);
  --on-marker:    oklch(0.27 0.02 255);
  --primary-text: oklch(0.42 0.16 255);
  --overlay:      oklch(0.20 0.02 255 / 0.35);

  --status-ok:        oklch(0.50 0.13 150);
  --status-ok-soft:   oklch(0.50 0.13 150 / 0.12);
  --status-ko:        oklch(0.52 0.20 25);
  --status-ko-soft:   oklch(0.52 0.20 25 / 0.10);
  --status-warn:      oklch(0.52 0.11 70);
  --status-warn-soft: oklch(0.62 0.13 75 / 0.16);
  --status-progress:      oklch(0.55 0.17 255);
  --status-progress-soft: oklch(0.55 0.17 255 / 0.10);
  --status-idle:      oklch(0.62 0.015 255);
  --status-idle-soft: oklch(0.62 0.015 255 / 0.14);

  --chart-1: oklch(0.55 0.17 255);
  --chart-2: oklch(0.50 0.13 150);
  --chart-3: oklch(0.52 0.11 70);
  --chart-4: oklch(0.52 0.20 25);
  --chart-5: oklch(0.50 0.14 300);
  --chart-6: oklch(0.50 0.10 200);
  --chart-7: oklch(0.50 0.03 255);
  --chart-8: oklch(0.66 0.02 255);
}
```

- [ ] **Step 3: Aggiornare la scala raggi in `@theme inline`.** Sostituisci le 4 righe `--radius-*` (righe 194-197) con la scala sobria:

```css
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-xl: 14px;
```

- [ ] **Step 4: Appiattire lo sfondo `body` (via gradienti neon).** Sostituisci il blocco `body { ... }` (righe 200-209) e il blocco `html.light body { ... }` (righe 211-217) con:

```css
body {
  background: var(--app-bg);
  background-attachment: fixed;
  color: var(--brand-text-main);
  font-family: var(--font-geist), "Geist", system-ui, -apple-system, sans-serif;
  line-height: 1.35;
}
```

(Rimuovi del tutto la regola `html.light body { ... }`: ora il `body` usa `var(--app-bg)` che è già tema-aware.)

- [ ] **Step 5: Focus ring blu 2px sugli input globali.** Sostituisci la riga `box-shadow: 0 0 0 1px var(--brand-primary);` (riga 229) con:

```css
  box-shadow: 0 0 0 2px var(--brand-primary);
```

- [ ] **Step 6: Scrollbar sobrie.** Aggiorna due punti:
  - `.sidebar-scrollbar::-webkit-scrollbar-thumb` (riga 246): cambia `background: rgba(255,255,255,0.15);` → `background: var(--brand-border-strong);`
  - `.rapp-scroll` (righe 259-263): sostituisci le due occorrenze di `oklch(0.80 0.16 215 / 0.55)` con `var(--brand-primary)` (così la scrollbar del rapportino segue il blu sobrio).

- [ ] **Step 7: Build di verifica.**

Run: `npm run build`
Expected: build completata senza errori (il CSS compila; nessun nuovo errore TS). Se fallisce, leggere l'errore: tipicamente una graffa `}` mancante in un blocco sostituito — ricontrollare Step 1/2.

- [ ] **Step 8: Assert token presenti / neon rimosso.**

Run: `grep -c "radial-gradient" app/globals.css` → Expected: `0`
Run: `grep -c -- "--on-primary" app/globals.css` → Expected: `2` (una per tema)
Run: `grep -c "0.16 215" app/globals.css` → Expected: `0` (niente più ciano neon hue 215)

- [ ] **Step 9: Verifica visiva nel browser (light + dark).**

Run: `npm run dev` (in background), apri `http://localhost:3000`, fai login.
Controlla su `/hub` e `/hub/mappa?vista=pianifica`:
- Default = **tema chiaro** sobrio (sfondo quasi bianco piatto, niente aloni ciano/magenta, accenti **blu** non ciano).
- Toggle tema (TopBar) → **dark sobrio** (slate profondo desaturato, niente glow, accento blu schiarito).
- Testo leggibile, bordi tenui, ombre non-glow.
Nota: alcuni bottoni con testo navy hardcoded appariranno ancora illeggibili in light — è atteso, lo risolve il Task 2.

- [ ] **Step 10: Commit.**

```bash
git add app/globals.css
git commit -m "feat(restyle): rivalorizza token globals.css -> palette sobria (S1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Sweep testo-su-accento + FAB

**Files:**
- Modify: i 51 file `*.tsx` con `text-[oklch(0.16_0.06_245)]` (elenco in File Structure)
- Modify: `components/modules/rapportini/FabInterventoManuale.tsx`

**Interfaces:**
- Consumes: `--on-primary` (Task 1) — bianco in light, scuro in dark; funziona come "testo su qualsiasi fill accentato" in entrambi i temi.
- Produces: niente di nuovo (solo correzione di leggibilità).

- [ ] **Step 1: Enumerare le occorrenze (baseline).**

Run: `grep -rl "oklch(0.16_0.06_245)" --include="*.tsx" .`
Expected: ~51 file (vedi File Structure). Annota il conteggio totale:
Run: `grep -rc "oklch(0.16_0.06_245)" --include="*.tsx" . | grep -v ':0' | awk -F: '{s+=$2} END {print s}'`
Expected: `81`.

- [ ] **Step 2: Spot-check che sia testo-su-accento.** Apri 3 file campione e verifica che `oklch(0.16_0.06_245)` sia il **colore testo** di un elemento con sfondo accentato (`bg-[var(--brand-primary)]`, `bg-[var(--success)]`, ecc.), non testo su sfondo chiaro:
  - `components/modules/rapportini/RapportinoLista.tsx` (riga ~144, pill conteggio)
  - `components/Button.tsx` (variante primary)
  - `app/impostazioni/utenze/UtenzeClient.tsx` (righe ~387/541/617, bottoni)
  Se in un file fosse usato come testo scuro su sfondo CHIARO (raro), escluderlo dal sweep e segnalarlo. (Atteso: tutti su accento → procedere.)

- [ ] **Step 3: Sostituzione di massa.** Esegui il replace del solo valore-colore interno (resta `text-[var(--on-primary)]`):

```bash
grep -rl "oklch(0.16_0.06_245)" --include="*.tsx" . \
  | while IFS= read -r f; do
      sed -i 's/oklch(0\.16_0\.06_245)/var(--on-primary)/g' "$f"
    done
```

- [ ] **Step 4: Verifica zero residui.**

Run: `grep -rc "oklch(0.16_0.06_245)" --include="*.tsx" . | grep -v ':0' | awk -F: '{s+=$2} END {print s+0}'`
Expected: `0`.
Run: `grep -rl "var(--on-primary)" --include="*.tsx" . | wc -l`
Expected: ~51 (i file ora referenziano il token).

- [ ] **Step 5: FAB sobrio.** In `components/modules/rapportini/FabInterventoManuale.tsx`, sostituisci la `className` (riga 10) sostituendo il segmento colore. Da:

```
bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300/40 transition enabled:hover:bg-emerald-600
```

a:

```
bg-[var(--brand-primary)] text-[var(--on-primary)] shadow-[var(--shadow-md)] transition enabled:hover:bg-[var(--brand-primary-hover)]
```

(La riga completa diventa: `className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[var(--on-primary)] shadow-[var(--shadow-md)] transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"`.)

- [ ] **Step 6: Build di verifica.**

Run: `npm run build`
Expected: build OK, nessun nuovo errore. (Il sweep cambia solo stringhe di classe → nessun impatto sui tipi.)

- [ ] **Step 7: Verifica visiva (light + dark).**

Con `npm run dev`, controlla:
- `/impostazioni/utenze` → bottoni primari (Crea utenza/Salva) con **testo bianco leggibile** su blu in light, **testo scuro leggibile** su blu chiaro in dark.
- `/r/<token>` di test (o una pagina che monta i bottoni rapportini) → bottoni primari leggibili; **FAB "+"** ora **blu** (non verde), senza alone.
- Toggle dark: i bottoni primari restano leggibili (testo scuro su blu chiaro).

- [ ] **Step 8: Commit.**

```bash
git add -A -- '*.tsx'
git commit -m "feat(restyle): testo-su-accento -> var(--on-primary) + FAB blu (S2)

Sostituito il navy hardcoded oklch(0.16 0.06 245) in 51 file con il
token tema-specifico --on-primary (bianco in light, scuro in dark);
FAB intervento manuale da emerald a primary. Fix leggibilita' bottoni
primari sotto la palette blu sobria.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> ⚠️ Lo Step 8 usa `git add -A -- '*.tsx'`: aggiunge solo i `.tsx` modificati. Verifica con `git status` che NON entrino i file acea non correlati (sono `.mjs`/config, quindi esclusi dal glob `*.tsx`). Se per sicurezza preferisci, aggiungi i file dall'elenco esplicito.

---

## Self-Review (eseguita)

**1. Copertura spec (S1+S2):** S1 token → Task 1 (tutti i blocchi + additivi + raggi + body + focus + scrollbar). S2 sweep → Task 2 (navy → on-primary, FAB). Le parti S3 (primitivi), S4 (Dialog+status applicati), S5 (shell/IA), S6 (pagine), S7 (gate) **non** sono in questo piano: vedi "Piani successivi".

**2. Placeholder scan:** nessun TBD/TODO; tutti i valori e comandi sono espliciti e completi.

**3. Coerenza tipi/nomi:** i token additivi definiti nel Task 1 (`--on-primary`, `--status-*`, `--primary-text`, `--chart-*`, `--overlay`, `--on-marker`) sono usati con gli stessi nomi nel Task 2 e nei piani successivi. `--on-primary` definito in entrambi i temi (dark scuro / light bianco), coerente con l'uso "testo su accento".

**Nota di verifica del dominio:** è un redesign visivo → il ciclo di test è `npm run build` (compila/typecheck) + **controllo visivo nel browser** in light e dark (non unit test: il progetto non ha render-test setup e non vanno aggiunte dipendenze). Coerente con la spec §12 e con la verifica-grounding.

## Piani successivi (non in questo file)

- **Piano 2 — Primitivi + Dialog + stati (S3+S4):** upgrade `components/{Button,Card,Input,Badge,Tabs}.tsx` sobri + nuovi `components/ui/{Select,Textarea,Dialog}.tsx`; applicare `--status-*` ai pallini live/mappa/agente/TodayMap (sostituendo gli hex, Leaflet via `getComputedStyle`).
- **Piano 3 — Shell + IA gruppi (S5):** campo additivo `group` in `lib/moduleAccess.ts`, `groupLabels` in `lib/appNavigation.ts`, raggruppamento sidebar a 4 sezioni + stato attivo sobrio + TopBar/drawer tokenizzati.
- **Piano 4 — Pagine critiche + gate (S6+S7):** rifinitura a mano di hub/mappa/`/r`/interventi/lista-attesa/utenze/performance (layout+gerarchia) in lotti, poi verifica finale light+dark + lint mirato + build.
