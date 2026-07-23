# DESIGN — Gestione Personale (Plenzich)

> **Riferimento di design canonico.** Questo file è la *base* da seguire per ogni nuova UI o modifica visiva. Quando crei/ritocchi un'interfaccia, attieniti a questi token, primitivi e convenzioni — non reinventare colori, ombre o componenti.
>
> **Fonti di verità nel codice:** i token vivono in [`app/globals.css`](app/globals.css); i primitivi in [`components/`](components) e [`components/ui/`](components/ui). Se questo file e il codice divergono, **vince il codice** — ma aggiorna questo file.

## 1. Direzione: "Cockpit" (console operativa enterprise)

Stile **console direzionale, pulita e leggibile** (evoluzione 2026-07-22 del "sobrio enterprise"; identità "Aurea neon" abbandonata da tempo). Direzione E+ scelta dal committente: mockup canonico in [`docs/design/mockup-cockpit.html`](docs/design/mockup-cockpit.html), spec `docs/superpowers/specs/2026-07-22-redesign-cockpit.md`.

Principi:
1. **Light-first su canvas.** Il contenuto vive su un **canvas grigio freddo**; le card sono bianche. Il dark è una variante sobria, non il default.
2. **Un solo accento zaffiro** (blu profondo, hue 260). Porta il peso di azioni primarie, link, stato attivo. Tutto il resto è grigio freddo neutro.
2bis. **I numeri comandano.** Dove i motori espongono già dei contatori, il modulo apre con card-KPI (barra colorata a sinistra, valore mono tabulare). Mai inventare metriche.
3. **Profondità piatta.** Niente glow/gradienti. La profondità nasce da *bordo 1px + ombra tenue*.
4. **Gerarchia per tipografia,** non per colore: titoli per dimensione/peso, non per tinte accese.
5. **Semantici calmi** (success/warning/danger), usati col contagocce.
6. **Focus sempre visibile** (ring blu) e contrasti AA.

## 2. Tema (light-first)

- Il **light è il default**: lo script inline in [`app/layout.tsx`](app/layout.tsx) aggiunge la classe `.light` su `<html>` salvo `localStorage 'theme' === 'dark'`.
- I **valori dark** stanno in `:root`; i **valori light** in `html.light` (in `globals.css`). Aggiungendo/togliendo `.light` si commuta.
- Il toggle è in [`components/layout/TopBar.tsx`](components/layout/TopBar.tsx) (`toggleTheme`).
- **Ogni token va definito in ENTRAMBI i blocchi** (`:root` e `html.light`). Mai rimuovere/rinominare un token esistente: si cambia solo il *valore*; i nuovi token sono **additivi**.

## 3. Colore (token)

Valori reali in OKLCH. Usali sempre via `var(--token)` (o le utility Tailwind `bg-brand-primary`, `text-brand-text-main`, … esportate in `@theme`).

### Superfici e testo

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--app-bg` / `--brand-bg` | `0.965 0.006 250` (canvas) | `0.20 0.012 255` | sfondo pagina (canvas, le card bianche ci galleggiano sopra) |
| `--brand-surface` (`--card-bg`) | `1 0 0` (bianco) | `0.24 0.014 255` | card, superfici, input |
| `--brand-surface-muted` | `0.965 0.006 250` | `0.225 0.013 255` | header tabella, zebra, hover |
| `--brand-border` | `0.92 0.006 250` | `0.32 0.012 255` | bordo standard 1px |
| `--brand-border-strong` | `0.86 0.008 250` | `0.40 0.012 255` | divisori marcati, bordo bottoni secondary |
| `--brand-text-main` | `0.27 0.02 255` | `0.94 0.006 255` | testo principale |
| `--brand-text-muted` | `0.50 0.02 255` | `0.70 0.012 255` | testo secondario, label |
| `--brand-text-subtle` | `0.62 0.015 255` | `0.56 0.012 255` | placeholder, caption |

### Accento zaffiro

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--brand-primary` | `0.42 0.14 260` | `0.66 0.15 260` | fill primario, link, attivo |
| `--brand-primary-hover` | `0.35 0.12 260` | `0.72 0.15 260` | hover primario |
| `--brand-primary-soft` | `…/0.10` | `…/0.18` | sfondo chip/nav attiva |
| `--primary-text` | `0.40 0.14 260` | `0.80 0.12 260` | **testo-accento** su soft/surface |
| `--on-primary` | `1 0 0` (bianco) | `0.20 0.012 255` (scuro) | **testo su fill accentato** (vedi nota WCAG) |

> ⚠️ **`--on-primary` è tema-specifico**: bianco in light, scuro in dark. È il fix WCAG (testo bianco su blu chiaro in dark fallirebbe 2.7:1). Usalo per il testo di QUALSIASI bottone/badge a fondo pieno accentato (primary/success/warning/danger) — **mai** `text-white` o un colore fisso.

### Semantici e stato

`--success` `--warning` `--danger` `--info` (+ varianti `-soft` a bassa alpha). Per i **pallini/indicatori di stato** usa i token dedicati (uguali ai semantici ma con nome d'intento):

| Stato | Token | = | Light | Dark |
|---|---|---|---|---|
| ok / fatto / approvato | `--status-ok` | success | `0.50 0.13 150` | `0.74 0.15 150` |
| ko / non fatto / rifiutato | `--status-ko` | danger | `0.52 0.20 25` | `0.72 0.17 25` |
| warn / in attesa | `--status-warn` | warning | `0.52 0.11 70` | `0.80 0.13 75` |
| in corso / progress | `--status-progress` | primary | `0.42 0.14 260` | `0.66 0.15 260` |
| idle / neutro / offline | `--status-idle` | grigio | `0.62 0.015 255` | `0.55 0.012 255` |

(+ `-soft` per i fondi; + `--on-danger`/`--on-warning` per il testo sui fill pieni.)

### Grafici (recharts) e altro

- `--chart-1 … --chart-8`: scala categorica sobria (blu, verde, ambra, rosso, viola, teal, ardesia, grigio). **recharts non risolve `var()` negli attributi SVG** → leggili a runtime con l'hook `useChartColors()` ([`components/modules/performance/palette.ts`](components/modules/performance/palette.ts)).
- `--overlay`: fondo semitrasparente di modali/drawer.
- `--on-marker`: testo leggibile sui marker mappa colorati (MapLibre, marker DOM).
- `--phone-bezel` / `--phone-screen`: cornice e schermo dell'anteprima-telefono (Azioni operatori). Il bezel resta scuro in entrambi i temi (è un device), lo schermo segue `--brand-bg`.
- Decorativi desaturati `--brand-gold` / `--brand-magenta` / `--brand-green` / `--brand-violet`: **da evitare come accenti** (esistono per retro-compatibilità). Niente oro/magenta neon.

## 4. Tipografia

- Font: **Geist** (`--font-geist`, da `next/font`).
- **Dati numerici in Geist Mono** (`--font-geist-mono`, esposto come `--font-mono` in `@theme`): KPI, importi €, matricole, celle numeriche di tabella usano `font-mono tabular-nums` — le colonne si allineano otticamente.
- **Sentence case** sempre. Niente Title Case né ALL CAPS gridato (label maiuscole solo piccole, con tracking ridotto).
- Pesi: **titoli 600**, **corpo 400**, **label/bottoni 500**. (Niente 700/bold "urlato".)
- Scala (convenzione, via classi Tailwind — non ci sono token `--text-*`): `text-xs`(12) caption · `text-sm`(13) dati densi · `text-sm/base`(14) corpo · `text-base/lg`(16) sottotitoli · `text-xl`(20) titoli sezione · `text-2xl`(26) titoli pagina. **Niente dimensioni a mezzo pixel** (`text-[14.5px]` ecc.).

## 5. Raggi, ombre, densità, motion

- **Raggi** (token in `@theme`): `--radius-sm` 4 · `--radius-md` 6 · `--radius-lg` 10 · `--radius-xl` 14. Card a `lg`/`xl`, input/bottoni a `md`, pill/badge pieni (`rounded-full`). Usa `rounded-[var(--radius-md)]` ecc.
- **Ombre — elevazione a 3 livelli** (valori a doppio strato ambient+key, redesign premium 2026-07-22): livello 1 superfici in flusso (card, tabelle) = bordo 1px + `--shadow-sm`; livello 2 sovrapposti (popover, dropdown, datepicker) = `--shadow-md`; livello 3 modali/drawer = `--shadow-lg` + `--overlay`. **Mai glow.**
- **Densità bilanciata**: tabelle/liste **compatte** (righe ~32–36px, padding ridotto, header sticky su `--brand-surface-muted`); form/dettaglio/modali **ariosi**.
- **Motion**: framer-motion (`lib/animations.ts`, `PageTransitionWrapper`). Sobrio: hover lift ~1px, durate 150–200ms; overlay (Dialog, drawer, dropdown, palette) con enter/exit via `AnimatePresence` (enter 150–200ms, exit più rapido). `prefers-reduced-motion` è garantito globalmente da `components/layout/MotionProvider.tsx` (`MotionConfig reducedMotion="user"` nel root layout) — i transform collassano, resta l'opacità. Non aggiungere animazioni dove non ci sono.

## 6. Accessibilità

- **Focus ring blu 2px sempre visibile**: input/select/textarea l'hanno via la regola globale in `globals.css`; su bottoni/link/azioni aggiungi `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]`.
- Contrasti AA verificati (vedi appendice nel design doc `docs/superpowers/specs/2026-06-22-redesign-design-system-sobrio-design.md`).
- Modali: usa il primitivo `Dialog` (role/aria/focus-trap/ESC).

## 7. Primitivi — usa questi, non markup ad-hoc

Import e props principali (le props sono compatibili coi call-site esistenti):

| Componente | Import | Note |
|---|---|---|
| **Button** | `@/components/Button` (default) | `variant`: `primary` \| `secondary` \| `outline` \| `ghost` \| `soft` \| `danger` \| `gold`; `size`: `sm`\|`md`\|`lg`; `animated`; **`loading`** (spinner + `aria-busy` + disabilitato). Primary usa `--on-primary`. |
| **Card** | `{ Card, CardHeader, CardContent, CardFooter }` da `@/components/Card` | superficie bianca, bordo 1px, ombra `sm`, raggio `xl`; `interactive` (focusabile da tastiera)/`animated`. |
| **Input** | `@/components/Input` (default) | prop `error?`; focus ring blu 2px; stili `disabled` e hover bordo. |
| **Select** | `@/components/ui/Select` (default) | prop `error?`; stili `disabled` e hover. |
| **Textarea** | `@/components/ui/Textarea` (default) | prop `error?`; stili `disabled` e hover. |
| **Badge** | `@/components/Badge` (default) | `variant`: `primary`\|`muted`\|`success`\|`warning`\|`danger`\|`gold` + **stati** `ok`\|`ko`\|`warn`\|`idle`\|`progress`. |
| **Tabs** | `@/components/Tabs` (default) | stile **underline**; props `{ value, onValueChange, items }`; `items[].disabled?`. **Solo filtri di dato in pagina** — le viste di modulo usano le fogliette (§7bis). |
| **Dialog** | `@/components/ui/Dialog` (default) | `{ open, onClose, title, children, footer, variant, busy }`; `variant="sheet"` = bottom-sheet mobile; animato (enter/exit); `busy` blocca Escape/overlay/Chiudi. Focus-trap + ESC + `aria-modal`. |
| **ConfirmDialog** | `@/components/ui/ConfirmDialog` (default) | conferme brand (`danger?`, `loading?`) — **sostituisce `confirm()` nativo**. |
| **Toast** | `{ toast, Toaster }` da `@/components/ui/Toast` | `toast.success/error/info('…')` — **sostituisce `alert()` nativo**. `Toaster` montato in AppShell (i portali token lo montano nel proprio layout). |
| **Skeleton** | `@/components/ui/Skeleton` (default) | shimmer sobrio per caricamenti con forma nota; dimensioni via className. |
| **DatePicker** | `@/components/ui/DatePicker` | calendario popover a tema; prop `error?`. |
| **MultiSelect** | `@/components/ui/MultiSelect` (default) | checkbox in popover; prop `error?`. |
| **FogliettaCard** | `@/components/ui/FogliettaCard` (default) | card di landing modulo: `{ href, title, description?, icon?, count? }`. |
| **Breadcrumb** | `@/components/ui/Breadcrumb` (default) | `{ items: { label, href? }[] }`; ultima voce = pagina corrente (`aria-current`). |
| **ObjectHeader** | `@/components/ui/ObjectHeader` (default) + `{ StatusRibbon }` | card di testa modulo: `{ title, sub?, ribbon?, actions? }`. Ribbon solo per stati REALI. |
| **KpiCard / KpiStrip** | `{ KpiCard, KpiDelta, KpiStrip }` da `@/components/ui/KpiCard` | KPI cockpit: `{ label, value, trend?, tone?, spark? }`; barra colorata a sinistra, valore mono. Solo numeri già esposti dai motori. |
| **FilterBar** | `{ FilterBar, FilterPill, AddFilterButton }` da `@/components/ui/FilterBar` | filtri componibili: pill rimovibili (✕) + «+ Filtro»; lo stato resta nella pagina. |
| **DetailDrawer** | `{ DrawerSplit, DetailDrawer, DrawerSection, DrawerKv }` da `@/components/ui/DetailDrawer` | scheda del record a destra della tabella (click riga), senza cambiare pagina. `className` per layout a scroll interno. |
| **ProgressPill** | `@/components/ui/ProgressPill` (default) | avanzamento compatto `n/m` con barretta (es. foto in riga tabella). |

Icone moduli: SVG a linee in [`components/layout/moduleIcons.tsx`](components/layout/moduleIcons.tsx) (`stroke="currentColor"`, `strokeWidth` ~1.6, linecap/linejoin round). Nessuna libreria icone esterna.

## 7bis. IA dei moduli — fogliette, non tab

Regola ibrida (spec premium 2026-07-22):
- **Vista di modulo** (contesti diversi nello stesso modulo, es. Storico/Riconsegna, Coda/Registro) → **foglietta**: landing con `FogliettaCard` + route dedicata + `Breadcrumb` di rientro.
- **Filtro di dato** (stessa pagina, stesso dataset, es. "Tutti / Da fare / Completati") → resta in pagina con `Tabs` (segmented). Trasformare i filtri in pagine rallenta gli operatori.

## 7ter. Pattern cockpit (spec 2026-07-22-redesign-cockpit.md)

- **Testa di modulo**: `ObjectHeader` (titolo + sottotitolo + azioni primarie a destra). Le pagine-foglietta con `Breadcrumb` (viste figlie) restano sul pattern slim.
- **Card-contatore = filtri rapidi**: dove i contatori sono cliccabili (Interventi, Misuratori) restano `<button aria-pressed>` con look KPI: barra colorata a sinistra, label uppercase piccola, valore `font-mono tabular-nums`.
- **Filtri componibili**: barra con ricerca libera + pill dei filtri strutturati attivi (rimozione = patch + ricarica immediata) + «+ Filtro» che apre il pannello completo.
- **Dettaglio senza cambiare pagina**: click sulla riga → `DetailDrawer` a destra (da `xl`); riga selezionata con fondo soft + inset rail zaffiro; i bottoni-riga fanno `stopPropagation`.

## 8. Navigazione (shell)

- Sidebar raggruppata in **4 sezioni**: **Pianificazione · Operatività · Analisi · Sistema**, via il campo additivo `group` su `AppModuleDefinition` in [`lib/moduleAccess.ts`](lib/moduleAccess.ts) (+ `groupLabels`/`GROUP_ORDER` in [`lib/appNavigation.ts`](lib/appNavigation.ts)). `section` resta separato (gating/middleware): **non** riusarlo per i gruppi.
- Voce attiva: `bg-[var(--brand-primary-soft)]` + testo `--primary-text` + **barra 3px a sinistra** + focus ring. Hover = `--brand-surface-muted`. Collapse con `transition-[width]` 200ms.
- **TopBar**: pill di ricerca centrale (⌘K) + NovitaCenter + campanella admin + **user menu** (avatar a iniziali → nome, ruolo, toggle tema, Esci). Wordmark in topbar solo su mobile (il brand vive nella sidebar).
- **Command palette** (`components/layout/CommandPalette.tsx`): Ctrl/⌘-K, entries derivate da `appNavigation` (mai duplicare la lista), filtro su `allowedModules`.
- **Drawer mobile**: slide-in animato, focus-trap, scroll-lock del body, `role=dialog`.
- Per aggiungere un modulo: aggiungi la voce in `APP_MODULES` (con `group`) e l'icona in `moduleIcons.tsx` — sidebar e ⌘K la vedono da soli.

## 9. Do / Don't

✅ **Do**
- Usa `var(--token)` / le utility `@theme` per ogni colore.
- Usa i primitivi (`Button`, `Card`, `Input`, `Dialog`, …).
- `--on-primary` per il testo su fill accentati; `--status-*` per i pallini di stato.
- Tabelle dense + header sticky; form ariosi.
- Focus ring blu su tutto ciò che è interattivo.

❌ **Don't**
- Niente hex/oklch hardcoded nel markup (`text-[oklch(...)]`, `bg-emerald-500`, `#22c55e`, `text-white` su fill). Tokenizza.
- Niente glow, gradienti neon, oro/magenta come accenti.
- Niente `alert()`/`confirm()` nativi → usa `toast.*` e `ConfirmDialog`.
- Niente `var()` passato a recharts (SVG) o al paint WebGL di MapLibre → risolvi con `getComputedStyle`/`useChartColors` (i marker DOM di MapLibre invece accettano `var()` direttamente).
- Non rinominare/rimuovere token esistenti; aggiungi additivi.
- Niente ALL CAPS / dimensioni a mezzo pixel / `rounded-2xl` fuori scala.

## 10. Riferimenti

- Token: [`app/globals.css`](app/globals.css) · Primitivi: [`components/`](components), [`components/ui/`](components/ui) · Shell: [`components/layout/`](components/layout).
- Spec completa (con contrasti WCAG e razionale): `docs/superpowers/specs/2026-06-22-redesign-design-system-sobrio-design.md`.
- Piani di implementazione: `docs/superpowers/plans/2026-06-22-redesign-*.md`.

*Stato: base "Sobrio → Premium" in produzione (PR #164, 2026-07-22); evoluzione **"Cockpit" (direzione E+)** attuata lo stesso giorno: accento zaffiro hue 260, canvas grigio freddo, ObjectHeader/KpiCard/FilterBar/DetailDrawer/ProgressPill, pattern §7ter su Interventi/hub/Misuratori/Assistenza/Consuntivazione/PI/Performance/Impostazioni/Assegnazioni AI. Spec: `docs/superpowers/specs/2026-07-22-redesign-cockpit.md` (mockup `docs/design/mockup-cockpit.html`). Aggiorna questo file quando cambi token, primitivi o convenzioni.*
