# Redesign sobrio — Piano 4: Pagine critiche + gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Questo piano è **spec-driven**: la guida dettagliata per ogni pagina è nella spec `docs/superpowers/specs/2026-06-22-redesign-design-system-sobrio-design.md` §9 (note workflow: problemi attuali, azioni concrete, cosa-non-toccare, rischi). Ogni implementer LEGGE i file reali della pagina e applica la rifinitura adattandola.

**Goal:** Rifinire a mano le pagine critiche (layout + gerarchia + densità, non solo colore) usando i token/primitivi dei Piani 1-3, poi gate finale.

**Architecture:** Fondamenta già fatte (token sobri, primitivi Button/Card/Input/Select/Textarea/Badge/Tabs/Dialog, status tokens, shell raggruppata). Qui si applicano alle singole pagine: tabelle dense, gerarchia tipografica, migrazione modali ad-hoc a `Dialog`, sostituzione hex residui, layout. Una pagina = un task = un commit, rivisto isolatamente.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, framer-motion, Leaflet, recharts. Verifica: `npm run build` per task + visivo sul preview Vercel.

## Global Constraints

- Nessuna SQL, nessuna modifica a logica dati/API/permessi/gating.
- **`/r` e flussi condivisi:** NON toccare offline/PWA/service worker/IndexedDB/outbox, pipeline foto/scanner, input file `opacity-0` (mai `display:none`), FAB safe-area. Solo aspetto.
- **Mappa/Leaflet:** non toccare init mappa, tileLayer, fitBounds, popup, cleanup, geocoding, associazione colore→operatore (desaturare i valori, non cambiare cardinalità/mapping). Colori a Leaflet via `getComputedStyle` (no `var()`).
- Token NAMES stabili (token Piani 1-3). Usare i primitivi esistenti (`components/{Button,Card,Input,Badge,Tabs}`, `components/ui/{Select,Textarea,Dialog}`); props compatibili.
- Branch `restyle/aurea-light`. **NIENTE `git push` / `git remote`** (solo commit locali). NON toccare file acea non committati (`tools/*.mjs`, `app/api/agente/acea-assegnazioni/route.ts`, `.claude/*`, `AGENTS.md`). Commit mirati per pagina.
- Verifica = `npm run build` (gate) + visivo sul preview (login). Baseline lint già rossa → gate = "nessun nuovo errore dai file toccati".

## Ordine (lotti, per rischio crescente)

Lotto A: **hub dashboard** · **interventi** · **utenze** (M/M/L, indipendenti).
Lotto B: **mappa** (L, file enorme — censimento hex prima).
Lotto C: **/r rapportino** (L, vincoli offline) · **lista-attesa** (M).
Lotto D: **performance** (M, recharts → `--chart-*`).
Gate finale (S7): build + giro visivo light+dark su tutte + lint mirato.

---

## Task A1: /hub Dashboard (spec §9.1, effort M)

**Files:** `app/hub/page.tsx`, `components/modules/dashboard/{RapportiniKpi,PremialitaPanel,DashboardTodayMap,TodayMapLeaflet}.tsx`

**Azioni (da spec §9.1):**
- `RapportiniKpi`: le 4 tile da blocchi a fondo pieno colorato → **stat-cell sobrie** (`bg-[var(--brand-surface-muted)]`, bordo 1px, numero `text-[var(--brand-text-main)]` text-2xl, label sm13 `text-[var(--brand-text-muted)]` + pallino di stato `--status-*` accanto). Frecce ◀▶: focus ring + (se semplice) icone.
- `PremialitaPanel`: via `--brand-gold` → badge "Admin Plus" neutro/soft (`Badge` muted o primary), "· premio attivo" → `--success`; bordo card da `--brand-primary-border` → `--brand-border`.
- `page.tsx` promo "Live": bordo neutro `--brand-border`, CTA come `Button` soft + focus ring; raggi `rounded-2xl`→`rounded-[var(--radius-xl)]`.
- Avvolgere i blocchi in `Card` condivisa dove sensato per uniformare padding/raggio/ombra.

**NON toccare:** logica server (`loadTodayOperators`, `loadKpiPremialita`, gating `canViewPremialita`), `TodayMapLeaflet` init/mappa (solo i marker già tokenizzati nel Piano 2), fetch KPI.

- [ ] **Step 1:** Leggi i file e applica le azioni sopra (adatta alle classi reali).
- [ ] **Step 2:** `npm run build` → pass.
- [ ] **Step 3:** Commit:
```bash
git add app/hub/page.tsx components/modules/dashboard/RapportiniKpi.tsx components/modules/dashboard/PremialitaPanel.tsx components/modules/dashboard/DashboardTodayMap.tsx
git commit -m "feat(restyle): dashboard /hub sobria (KPI stat-cell, no gold, promo neutra)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A2: /hub/interventi Storico (spec §9.4, effort M)

**Files:** `app/hub/interventi/page.tsx`, `components/modules/interventi/{StoricoInterventiClient,StoricoFiltri,StoricoTabella,ModaleFotoVoce,ModaleModificaVoce}.tsx`

**Azioni (da spec §9.4):**
- Tabella densa 32-36px, header sticky `bg-[var(--brand-surface-muted)]`; raggio contenitore `rounded-2xl`→`rounded-[var(--radius-lg)]`.
- `text-white` su primary → `text-[var(--on-primary)]` (StoricoFiltri Cerca, ModaleFotoVoce, ModaleModificaVoce). Bottoni → primitivo `Button`.
- Focus ring blu su TUTTI i `<button>` (paginazione, azioni 📷✎🗑, bulk).
- Modali `ModaleFotoVoce`/`ModaleModificaVoce` → `components/ui/Dialog` (preserva onClose/fetch/upload).
- Esito SI/NO (`StoricoTabella.toneClass`) → `--status-ok`/`--status-ko`. Spinner overlay neutro.
- `InterventiFilters`/`InterventiAssegnabili` NON sono in rotta qui (verifica import prima di toccarli; bassa priorità).

**NON toccare:** fetch/paginazione/abort/debounce, contratti API `/api/interventi/storico` + `/voce/[id]` + `/foto`, gating `isAdminPlus`, helper `lib/interventi/storico/*`.

- [ ] **Step 1:** applica. **Step 2:** `npm run build` pass. **Step 3:** commit (file sopra, msg `feat(restyle): interventi storico sobrio (tabella densa, Dialog, status, focus)`).

---

## Task A3: /impostazioni/utenze (spec §9.6, effort L)

**Files:** `app/impostazioni/utenze/UtenzeClient.tsx` (+ `page.tsx` se serve)

**Azioni (da spec §9.6):**
- Layout da "lista di card-dettaglio chilometrica" → **lista densa (~36px) + dettaglio espandibile / `Dialog`**.
- 3 navy magici (righe ~387/541/617) già a `var(--on-primary)` dallo sweep — verifica; bottoni → `Button` (primary/secondary/ghost/danger).
- Avatar/badge ruolo: da tondi pieni oro/magenta/verde → cerchio neutro + pallino `--status-*` piccolo. Badge "Sensibile"→`Badge warn`, "Segue il ruolo"→`Badge muted`.
- `ModuleSelector`: raggruppa per sezione (overview/modules/system già in `APP_MODULES.section`) + tile compatti + "Seleziona tutti/Nessuno". Stato selezionato bordo `--brand-primary` + bg `--brand-primary-soft`.
- Conferme Elimina/Reset → `Dialog`. Input/Select → primitivi (focus ring 2px). Raggi `rounded-3xl`/`2xl`→ scala. Toast a token sobri.

**NON toccare:** fetch `/api/admin/users` + payload, `lib/moduleAccess.ts` funzioni di autorizzazione e l'invariante `impostazioni ⟺ admin`, gate `page.tsx`, lock `requiresAdminRole`/`isSelf`, macchina stati `showFeedback`/`confirmDelete`/`resetId`.

- [ ] **Step 1:** applica. **Step 2:** `npm run build` pass. **Step 3:** commit (msg `feat(restyle): utenze sobria (lista densa+Dialog, ruoli neutri, ModuleSelector a sezioni)`).

---

## Task B1: /hub/mappa (spec §9.2, effort L) — file enorme

**Files:** `app/hub/mappa/page.tsx`, `components/modules/mappa/{MappaOperatoriClient,PhaseStrip,MenuDropdown,RiepilogoRapportini}.tsx`, `components/modules/mappa/riepilogo/*`

**PRIMA:** censimento esaustivo degli hex e `oklch(...)` inline in `MappaOperatoriClient.tsx` (`grep -n "#\|oklch("`). Riportare l'elenco nel report prima di editare.

**Azioni (da spec §9.2):** palette operatori 8 colori → desaturare/armonizzare (cardinalità 8 e mapping invariati); `#0b1220`→`--on-marker`; polyline→`--status-progress`; pin→`--warning`/`--brand-violet`; Leaflet via `getComputedStyle`. Bottone "Nuova pianificazione" da `danger` pieno → `secondary`. Setup "Configura pianificazione" + ManualTask/ManualAssignments/ModaleScaricaFoto → `Dialog`. Select/date nativi → primitivi. PhaseStrip/badge → `--status-*`. Tab operatori → `Tabs` underline. Densità card territorio ~34px, azioni-icona raggruppate + `aria-label` + focus ring; emoji → icone.

**NON toccare:** state machine fasi, distribuzione/`distributeToOps`/`saveDistribution`/`generaRapportini`, geocoding, init/struttura mappa Leaflet, associazione colore→operatore (solo valori), import/parse Excel, persistenza `mappa_piani*`, dati Riepilogo (`groupByDayTerritory`/`statoBadge` logica), `DatePicker` esistente.

- [ ] **Step 1:** censimento hex. **Step 2:** applica a lotti coerenti. **Step 3:** `npm run build` pass. **Step 4:** commit (msg `feat(restyle): mappa pianificazione+riepilogo sobria (palette desat, status, Dialog, densità)`).

---

## Task C1: /r/[token] rapportino operatore (spec §9.3, effort L) — vincoli offline

**Files:** `app/r/[token]/page.tsx`, `components/modules/rapportini/{RapportinoForm,RapportinoLista,VoceFocus,VoceCard,CampoInput,IntestazioneRiepilogo,LenteRicerca,ModaleCampiMancanti,ModaleFotoMancanti}.tsx` (solo aspetto)

**Azioni (da spec §9.3):** badge "Nuovo" gold → `--warning`/neutro, "Annullato" danger con `--on-danger`; filtri/pill/crocette attive → `--brand-primary-soft` + `--primary-text`; target touch ≥44px su "Chiudi"/"✕"; modali → `Dialog` (variante `sheet`); raggi/tipografia normalizzati alla scala; bordo-stato card → `--status-ok/ko/idle`; focus ring 2px nei campi (via primitivi).

**NON toccare (CRITICO):** offline/sync (`useStatoSync`, `persistiVoce`, `dbOutbox`/`dbLavoro`), service worker, IndexedDB/idempotenza/taskId, pipeline foto/scanner (`CampoFoto`, `comprimiImmagine`, `useUploadFoto`, input file `opacity-0`), logica completezza/invio, FAB offset safe-area, fetch dati server. `CampoInput.tsx` è condiviso: solo classi.

- [ ] **Step 1:** applica (solo aspetto). **Step 2:** `npm run build` pass. **Step 3:** commit (msg `feat(restyle): rapportino /r sobrio (badge/pill/touch/Dialog sheet, no logica offline)`).

---

## Task C2: /hub/lista-attesa (spec §9.5, effort M)

**Files:** `app/hub/lista-attesa/{page.tsx,registro/page.tsx}`, `components/modules/lista-attesa/{CodaRichiesteManuali,PannelloRevisioneRichiesta,RegistroAutorizzazioni,ListaAttesaNav,CaricaFotoRichiesta}.tsx`

**Azioni (da spec §9.5):** pallino live → `--status-ok`/`--status-idle`; gerarchia h2 dominante, micro-label ≥`xs`12; card lista compatte; pannello revisione arioso con primitivi Input/Select/Textarea; avviso duplicato-matricola → callout sobrio o `Dialog`; tabella registro 32-36px sticky; `ListaAttesaNav` → `Tabs` underline (mantieni `next/link`).

**NON toccare:** endpoints `/api/admin/interventi-manuali/[id]/*` + payload, `useRichiesteManualiFeed`, flusso approvazione/409 duplicato, helper puri, foto/storage condivisi con `/r`, `CampoInput.tsx` (solo classe), export CSV.

- [ ] **Step 1:** applica. **Step 2:** `npm run build` pass. **Step 3:** commit (msg `feat(restyle): lista-attesa sobria (status, gerarchia, Tabs, tabella densa)`).

---

## Task D1: /hub/performance (spec §9.7, effort M) — recharts

**Files:** `app/hub/performance/page.tsx`, `components/modules/performance/{palette,PerformancePanel,PerfFilterBar,PerformanceGiornaliera,PerformanceConfronto,PerformanceDistribuzioni,PerformanceDettaglio}.tsx`

**Azioni (da spec §9.7):** `palette.ts` 8 hex neon → `--chart-1..8` (via `var()` in recharts fill; **fallback** `getComputedStyle`→hex se la `var()` non rende nell'SVG — testa 1 grafico). Mantieni le **chiavi** macro. `--brand-gold` "saracinesca"/"Admin Plus" → `--primary-text`/`--warning`/`Badge`. **Tooltip/assi/grid recharts a tema** (estrai `chartTheme`: surface/border/text-main/shadow-md) — oggi tooltip bianco in dark. Donut: `stroke=var(--brand-surface)` 1.5px. Barra filtri in 2 cluster, preset `Button` ghost ~28px. Tabella dettaglio header 500 + `border-strong`, hover riga.

**NON toccare:** `lib/performance/shape.ts`/`load.ts`, le CHIAVI di `MACRO_COLORS` (solo valori), gate `admin_plus`, firme/props componenti, formati it-IT/paginazione.

- [ ] **Step 1:** applica. **Step 2:** `npm run build` pass. **Step 3:** commit (msg `feat(restyle): performance sobria (chart tokens, tooltip/assi a tema, filtri/tabella)`).

---

## Task S7: Gate finale

- [ ] **Step 1:** `npm run build` completo → pass.
- [ ] **Step 2:** `npx eslint <tutti i file toccati nei lotti A-D>` → nessun **nuovo** errore vs baseline (la baseline è già rossa).
- [ ] **Step 3:** Giro visivo sul preview Vercel, **light + dark**, di: /hub, /hub/mappa (pianifica+riepilogo), /hub/interventi, /hub/lista-attesa, /impostazioni/utenze, /hub/performance, /r/<token> di test. Annota difetti.
- [ ] **Step 4:** Se difetti → fix mirati per pagina + ri-verifica. Quando pulito, redesign S1-S7 completo.

## Self-Review (eseguita)

**1. Copertura spec:** ogni pagina §9.1-9.7 → un task A1/A2/A3/B1/C1/C2/D1; gate §S7. `/hub/operational-calendar` escluso (redirect).
**2. Placeholder scan:** è un piano spec-driven (page polish con giudizio): le azioni sono concrete (riferite a spec §9 + token/primitivi reali) ma NON codice completo per ogni riga — appropriato per rifinitura adattiva; ogni task ha file, doNotTouch, verifica e commit espliciti.
**3. Coerenza:** usa i primitivi/token dei Piani 1-3 (nomi verificati). Vincoli offline/Leaflet/permessi ribaditi per pagina.
