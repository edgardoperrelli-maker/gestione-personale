# DESIGN — Gestione Personale (Plenzich)

> **Riferimento di design canonico.** Questo file è la *base* da seguire per ogni nuova UI o modifica visiva. Quando crei/ritocchi un'interfaccia, attieniti a questi token, primitivi e convenzioni — non reinventare colori, ombre o componenti.
>
> **Fonti di verità nel codice:** i token vivono in [`app/globals.css`](app/globals.css); i primitivi in [`components/`](components) e [`components/ui/`](components/ui). Se questo file e il codice divergono, **vince il codice** — ma aggiorna questo file.

## 1. Direzione: "Cockpit" (console operativa enterprise)

Stile **console direzionale, pulita e leggibile** (evoluzione 2026-07-22 del "sobrio enterprise"; identità "Aurea neon" abbandonata da tempo). Direzione E+ scelta dal committente: mockup canonico in [`docs/design/mockup-cockpit.html`](docs/design/mockup-cockpit.html), spec `docs/superpowers/specs/2026-07-22-redesign-cockpit.md`.

Principi:
1. **Light-first su canvas.** Il contenuto vive su un **canvas grigio freddo**; le card sono bianche. Dal 2026-07-27 è l'unico tema (§2).
2. **Un solo accento zaffiro** (blu profondo, hue 260). Porta il peso di azioni primarie, link, stato attivo. Tutto il resto è grigio freddo neutro.
2bis. **I numeri comandano.** Dove i motori espongono già dei contatori, il modulo apre con card-KPI (barra colorata a sinistra, valore mono tabulare). Mai inventare metriche.
3. **Profondità piatta.** Niente glow/gradienti. La profondità nasce da *bordo 1px + ombra tenue*.
4. **Gerarchia per tipografia,** non per colore: titoli per dimensione/peso, non per tinte accese.
5. **Semantici calmi** (success/warning/danger), usati col contagocce.
6. **Focus sempre visibile** (ring blu) e contrasti AA.

## 2. Tema — **unico, chiaro** (scuro rimosso il 2026-07-27)

- **L'app è chiara e sola.** `<html className="light">` è scritta staticamente in [`app/layout.tsx`](app/layout.tsx): niente script inline, niente `localStorage`, niente lampo di tema al primo paint. Il **selettore di tema è stato rimosso** dal TopBar — un interruttore con una sola posizione è peggio di nessun interruttore. Anche `themeColor` (barra browser/PWA) ha un solo valore.
- **I valori scuri non esistono più.** Dal 25/07 al 27/07 erano rimasti dormienti in un blocco `:root` che `html.light` ridefiniva per intero: due scale da tenere allineate di cui una non disegnava nulla. Il 27/07 sono stati **rimossi** e i valori chiari **promossi a `:root`**. Conseguenza pratica: la scala è dichiarata **una volta sola**, e non dipende più dalla presenza di una classe su `<html>` — se `.light` sparisse, l'app resterebbe identica.
- **Dove scrivere i valori**: in `:root`, e basta. Non esiste più un secondo blocco da tenere in sincronia.
- **Mai rimuovere o rinominare un token esistente**: si cambia solo il *valore*; i nuovi token sono **additivi**. La rimozione del 27/07 non è un'eccezione a questa regola — sono stati tolti dei **valori duplicati**, non dei token: ogni nome dichiarato prima è dichiarato anche dopo (verificato token per token, `--elevation-1/2/3` compresi, che vivevano solo nel blocco scuro e sarebbero spariti in una fusione ingenua spegnendo ogni `shadow-*` nudo).
- I componenti **mapcn** ([`components/ui/map.tsx`](components/ui/map.tsx)) risolvono il tema per conto proprio e sanno ancora ragionare su chiaro/scuro. Leggono la classe `.light` esplicita sull'`<html>` prima di ricadere su `prefers-color-scheme`: **è per questo che la classe resta**, anche se il CSS non ne ha più bisogno. Toglierla renderebbe la mappa scura su un sistema operativo in dark.

## 3. Colore (token)

Valori reali in OKLCH. Usali sempre via `var(--token)` (o le utility Tailwind `bg-brand-primary`, `text-brand-text-main`, … esportate in `@theme`).

### Superfici e testo

| Token | Valore | Uso |
|---|---|---|
| `--app-bg` / `--brand-bg` | `0.965 0.006 250` (canvas) | sfondo pagina (canvas, le card bianche ci galleggiano sopra) |
| `--brand-surface` (`--card-bg`) | `1 0 0` (bianco) | card, superfici, input |
| `--brand-surface-muted` | `0.965 0.006 250` | header tabella, zebra, hover |
| `--brand-border` | `0.92 0.006 250` | bordo standard 1px |
| `--brand-border-strong` | `0.86 0.008 250` | divisori marcati, bordo bottoni secondary |
| `--brand-text-main` | `0.27 0.02 255` | testo principale |
| `--brand-text-muted` | `0.44 0.02 255` | testo secondario, label |
| `--brand-text-subtle` | `0.54 0.015 255` | placeholder, caption |

> ♿ **La scala di testo è vincolata dal contrasto, non dal gusto.** Tutti e tre i token di testo
> devono rendere ≥ **4,5:1** (WCAG AA, testo normale) su **ognuna** delle tre superfici — e la
> superficie peggiore è `--brand-surface-muted`, non il bianco. La soglia è 4,5 e non 3 perché
> l'esonero "testo grande" parte da 24px, mentre questi token vestono testo da 10 a 16px.
> Il 2026-07-27 `--brand-text-subtle` è passato da `0.62` a `0.54` nel chiaro (rendeva **3,29:1**
> sulla superficie muted, sotto soglia su 116 usi non decorativi). Nello stesso intervento `--brand-text-muted` è sceso da `0.50` a `0.44`: alzare solo
> `subtle` lo aveva portato a ΔL 0.04 da `muted`, cioè **due livelli travestiti da tre**.
> Misure attuali sul caso peggiore: main 13,6:1 · muted 7,0:1 · subtle 4,6:1.
> La guardia è [`lib/design/contrastoToken.test.ts`](lib/design/contrastoToken.test.ts), che legge
> i token da `globals.css` e calcola il contrasto: **cambiare un valore fuori soglia fa fallire i test**.
> Le icone puramente decorative (`aria-hidden`) non sono coperte: non veicolano informazione.
>
> 📏 **I tre livelli devono restare VISIBILMENTE distinti, non solo ordinati.** Distanza minima
> **ΔL 0.08** fra livelli consecutivi (OKLCH L è percettivamente ~uniforme). Scala attuale nel
> chiaro: `0.27` → `0.44` → `0.54`, cioè ΔL 0.17 e 0.10. Anche questa è coperta dal test: alzare
> un token a norma **senza guardare il vicino** è il modo esatto in cui questa scala si è già
> schiacciata una volta.
>
> Non cambiato di proposito: `--sidebar-muted` (`0.50` nel chiaro) resta com'era. È la famiglia
> di token della sidebar, che ha superficie propria e non sta mai accanto al testo di modulo;
> rende 6,0:1 sul suo fondo e non ha bisogno di seguire questa scala.

> Le utility `bg-background` / `bg-muted` / `bg-popover` / `border-border` (convenzione shadcn, usate da [`components/ui/map.tsx`](components/ui/map.tsx) e dai primitivi mapcn) **sono** questi stessi token: `@theme` mappa `--color-background` → `--brand-surface`, `--color-muted` → `--brand-surface-muted`, `--color-border` → `--brand-border`. Non sono un secondo sistema di colore, e non vanno bonificate.

> ⚠️ **Il reset dei bottoni vive in `@layer base`** (`globals.css`). Ci è stato spostato il 2026-07-23: scritto fuori dai layer batteva in cascata ogni utility Tailwind, e **qualsiasi `bg-*` o `border-*` su un `<button>` non disegnava nulla** — la barra comandi di Pianificazione rendeva cinque etichette di testo nudo pur dichiarando un primario accentato. Se aggiungi regole d'elemento in `globals.css`, mettile in `@layer base`, altrimenti spegni silenziosamente le utility di quell'elemento.

### Accento zaffiro

| Token | Valore | Uso |
|---|---|---|
| `--brand-primary` | `0.42 0.14 260` | fill primario, link, attivo |
| `--brand-primary-hover` | `0.35 0.12 260` | hover primario |
| `--brand-primary-soft` | `…/0.10` | sfondo chip/nav attiva |
| `--primary-text` | `0.40 0.14 260` | **testo-accento** su soft/surface |
| `--on-primary` | `1 0 0` (bianco) | **testo su fill accentato** (vedi nota WCAG) |

> ⚠️ **`--on-primary` è il testo sui fondi pieni accentati** (primary/success/warning/danger): oggi vale bianco. Nato tema-specifico — in dark era scuro, perché bianco su blu chiaro rendeva 2,7:1 — resta un token e non una costante, così un domani il valore cambia in un punto solo. Usalo sempre: **mai** `text-white` né un colore fisso.

### Semantici e stato

`--success` `--warning` `--danger` `--info` (+ varianti `-soft` a bassa alpha). Per i **pallini/indicatori di stato** usa i token dedicati (uguali ai semantici ma con nome d'intento):

| Stato | Token | = | Valore |
|---|---|---|---|
| ok / fatto / approvato | `--status-ok` | success | `0.50 0.13 150` |
| ko / non fatto / rifiutato | `--status-ko` | danger | `0.52 0.20 25` |
| warn / in attesa | `--status-warn` | warning | `0.52 0.11 70` |
| in corso / progress | `--status-progress` | primary | `0.42 0.14 260` |
| idle / neutro / offline | `--status-idle` | grigio | `0.62 0.015 255` |

(+ `-soft` per i fondi; + `--on-danger`/`--on-warning` per il testo sui fill pieni.)

> **Quale dei tre usare sul tono warning** (la scelta che sbaglia più spesso): su un **badge/pill di stato** il colore *è* l'informazione → `--status-warn` su `--status-warn-soft`. Su un **banner di testo lungo** il colore serve alla leggibilità, non a dire di che stato si tratta → `--brand-text-main` su `--warning-soft`. `--on-warning` **solo** sul fill pieno. Stessa logica per ok/ko.

### Grafici (recharts) e altro

- `--chart-1 … --chart-8`: scala categorica sobria (blu, verde, ambra, rosso, viola, teal, ardesia, grigio). **recharts non risolve `var()` negli attributi SVG** → leggili a runtime con l'hook `useChartColors()` ([`components/modules/performance/palette.ts`](components/modules/performance/palette.ts)).
- `--overlay`: fondo semitrasparente di modali/drawer.
- `--on-marker`: testo leggibile sui marker mappa colorati (MapLibre, marker DOM).
- `--phone-bezel` / `--phone-screen`: cornice e schermo dell'anteprima-telefono (Azioni operatori). Il bezel resta scuro in entrambi i temi (è un device), lo schermo segue `--brand-bg`.
- `--scanner-veil` / `--scanner-chip` / `--on-scanner`: visore dello scanner barcode del portale operatore ([`ScannerMisuratore.tsx`](components/modules/rapportini/risanamento/ScannerMisuratore.tsx)). Stessa logica del bezel: valori fissi, perché sotto c'è l'immagine della fotocamera e non una superficie del tema — schiarirli spegnerebbe il visore. (Erano identici nei due temi anche prima della rimozione del dark, per la stessa ragione.) Usali al posto di `bg-black/90` + `text-white`.
- ⚠️ **`--warning-fg` non esiste** (e non va creato). Se lo trovi scritto come `var(--warning-fg,#92400e)` stai leggendo un hex cablato che ignora il tema: il testo su fondo `--warning-soft` va su **`--brand-text-main`**; `--on-warning` è solo per il fill *pieno*.
- `--chip-overlay-bd` / `--chip-overlay-bg`: velo dei bottoncini sulle card operatore (Cronoprogramma, Mappa), il cui fondo è **dinamico** — è il colore del territorio. Si invertono col tema: su scuro il bordo schiarisce e il fondo scurisce, su chiaro il contrario, perché un bordo bianco su card chiara sparirebbe. Usali al posto di `border-white/20` + `bg-black/20`.
- Decorativi desaturati `--brand-gold` / `--brand-magenta` / `--brand-green` / `--brand-violet`: **da evitare come accenti** (esistono per retro-compatibilità). Niente oro/magenta neon.

### Testa di modulo

Ogni modulo apre con [`ObjectHeader`](components/ui/ObjectHeader.tsx) — titolo, sottotitolo, `ribbon` di stato, `actions` a destra. **Nessuna testa su misura**: al 2026-07-23 il primitivo è usato da 16 moduli, e Pianificazione era l'ultimo rimasto fuori. Nelle `actions` vale **un solo primario per volta** (l'azione della fase corrente); tutto il resto è `variant="outline"`, e i comandi che ricominciano da capo vanno in coda dopo un separatore. Dove il modulo ha una progressione (fasi, passi), la striscia va **sotto** la testa: prima la pagina dice cos'è, poi a che punto sei.

## 4. Tipografia

- Font: **Geist** (`--font-geist`, da `next/font`).
- **Dati numerici in Geist Mono** (`--font-geist-mono`, esposto come `--font-mono` in `@theme`): KPI, importi €, matricole, celle numeriche di tabella usano `font-mono tabular-nums` — le colonne si allineano otticamente.
- **Sentence case** sempre. Niente Title Case né ALL CAPS gridato (label maiuscole solo piccole, con tracking ridotto).
- Pesi: **titoli 600**, **corpo 400**, **label/bottoni 500**. (Niente 700/bold "urlato".)
- Scala (via classi Tailwind — non ci sono token `--text-*`). Valori **misurati sul reso**, non stimati: `text-xs`=**12** caption e dati densi · `text-sm`=**14** corpo · `text-base`=**16** sottotitoli · `text-lg`=**18** · `text-xl`=**20** titoli sezione e di pagina · `text-2xl`=**24**. **Gli unici gradini in pixel arbitrari sono `text-[11px]` e `text-[13px]`.** Niente mezzi pixel (`text-[14.5px]`), niente valori sotto l'11 e niente display fuori scala: tutto il resto passa dalle utility. Due bonifiche: il 2026-07-23 i 37 mezzi pixel; il **2026-07-27** 89 `text-[10px]` e 31 `text-[9px]` → `text-[11px]`, 2 `text-[12px]` → `text-xs`, e le 4 display sparse (15, 17, 26) al gradino più vicino — il valore dei `KpiCard` invece **resta a 26px come eccezione dichiarata** (sotto). Il 10 e il 9 non sono mai esistiti nel sistema: la scala si ferma a `text-xs`=12 e scende solo di un gradino. La guardia è [`lib/design/scalaTipografica.test.ts`](lib/design/scalaTipografica.test.ts), che scandaglia `app/` e `components/` e **fallisce indicando file e riga**: senza, la scala si sporca di nuovo un componente alla volta.

> 📌 **Eccezioni dichiarate.** Una dimensione fuori scala si tiene solo se è tarata a mano e la taratura è *motivata*; va dichiarata in due posti — qui e nella mappa `ECCEZIONI` della guardia — ed è **legata al file**, così lo stesso valore altrove continua a fallire e l'eccezione non diventa un permesso generico.
>
> | File | Valore | Perché |
> |---|---|---|
> | [`components/ui/KpiCard.tsx`](components/ui/KpiCard.tsx) | `text-[26px]` | Numero hero del KPI, tarato insieme a `leading-none` e `tracking-[-0.02em]`: a `text-2xl` (24) perdeva peso contro la barra di tono. |
>
> La guardia controlla anche che ogni eccezione sia **ancora usata**: quando il valore sparisce dal file, il test chiede di rimuoverla dall'elenco. Un'allowlist che nessuno ripulisce diventa un permesso permanente.

## 5. Raggi, ombre, densità, motion

- **Raggi** (token in `@theme`): `--radius-sm` 4 · `--radius-md` 6 · `--radius-lg` 10 · `--radius-xl` 14. Card a `lg`/`xl`, input/bottoni a `md`, pill/badge pieni (`rounded-full`). Usa `rounded-[var(--radius-md)]` ecc.
- **Ombre — elevazione a 3 livelli** (valori a doppio strato ambient+key, redesign premium 2026-07-22): livello 1 superfici in flusso (card, tabelle) = bordo 1px + `--shadow-sm`; livello 2 sovrapposti (popover, dropdown, datepicker) = `--shadow-md`; livello 3 modali/drawer = `--shadow-lg` + `--overlay`. **Mai glow.**
- ✅ **`shadow-sm` nudo ORA è `--shadow-sm`** (risolto il 2026-07-25). Le tre utility sono ridefinite in `@theme inline` verso gli alias additivi `--elevation-1/2/3`, che puntano ai token: l'utility nuda e `shadow-[var(--shadow-sm)]` rendono **identiche**, e seguono il tema. Entrambe le forme sono valide; la nuda è più leggibile.
  <br>*Perché serviva l'indirezione*: Tailwind v4 **inlinea il proprio default** nell'utility (emette valori letterali, non `var(--shadow-sm)`), quindi la definizione in `:root` non la raggiungeva. Prima del fix le utility nude rendevano alpha ~0.1 contro lo 0.32–0.40 del token — nel tema scuro di allora, **card piatte contro il canvas** — su 48 occorrenze in 18 file (i moduli Impostazioni, Mappa e i controlli mapcn). `--shadow-sm: var(--shadow-sm)` sarebbe stato circolare: da qui gli alias.
  <br>⚠️ Se aggiungi un livello di elevazione, definiscilo in **entrambi** i blocchi tema *e* aggiungi l'alias `--elevation-N` + la riga in `@theme inline`, altrimenti l'utility nuda torna silenziosamente al default Tailwind.
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
| **Button** | `@/components/Button` (default) | `variant`: `primary` \| `secondary` \| `outline` \| `ghost` \| `soft` \| `danger` \| `gold`; `size`: `sm`\|`md`\|`lg`\|**`touch`**; `animated`; **`loading`** (spinner + `aria-busy` + disabilitato). Primary usa `--on-primary`. `touch` = 48px minimi, **solo portale operatore** (§7quater): le altre tre taglie sono tarate sul mouse e `lg` si ferma a ~42px. |
| **Card** | `{ Card, CardHeader, CardContent, CardFooter }` da `@/components/Card` | superficie bianca, bordo 1px, ombra `sm`, raggio `xl`; `interactive` (focusabile da tastiera)/`animated`. |
| **Input** | `@/components/Input` (default) | prop `error?`; focus ring blu 2px; stili `disabled` e hover bordo. |
| **Select** | `@/components/ui/Select` (default) | prop `error?`; stili `disabled` e hover. |
| **Textarea** | `@/components/ui/Textarea` (default) | prop `error?`; stili `disabled` e hover. |
| **Badge** | `@/components/Badge` (default) | `variant`: `primary`\|`muted`\|`success`\|`warning`\|`danger`\|`gold` + **stati** `ok`\|`ko`\|`warn`\|`idle`\|`progress`. |
| **Tabs** | `@/components/Tabs` (default) | stile **underline**; props `{ value, onValueChange, items }`; `items[].disabled?`. **Solo filtri di dato in pagina** — le viste di modulo usano le fogliette (§7bis). |
| **Dialog** | `@/components/ui/Dialog` (default) | `{ open, onClose, title, children, footer, variant, busy }`; `variant="sheet"` = bottom-sheet mobile; animato (enter/exit); `busy` blocca Escape/overlay/Chiudi. Focus-trap + ESC + `aria-modal`. |
| **ConfirmDialog** | `@/components/ui/ConfirmDialog` (default) | conferme brand (`danger?`, `loading?`, `size?`) — **sostituisce `confirm()` nativo**. `size` passa alle due azioni: nel portale operatore va `touch` (§7quater). |
| **Toast** | `{ toast, Toaster }` da `@/components/ui/Toast` | `toast.success/error/info('…')` — **sostituisce `alert()` nativo**. `Toaster` montato in AppShell (i portali token lo montano nel proprio layout). |
| **Skeleton** | `@/components/ui/Skeleton` (default) | shimmer sobrio per caricamenti con forma nota; dimensioni via className. |
| **DatePicker** | `@/components/ui/DatePicker` | calendario popover a tema; prop `error?`. |
| **MultiSelect** | `@/components/ui/MultiSelect` (default) | checkbox in popover; prop `error?`. |
| **FogliettaCard** | `@/components/ui/FogliettaCard` (default) | card di navigazione tra viste di uno stesso modulo (§7bis; NON il launcher-griglia dell'hub): `{ href, title, description?, icon?, count? }`. |
| **ModuleTile** | `@/components/ui/ModuleTile` (default) | tile della griglia-launcher hub/Impostazioni (verso un MODULO): `{ href, title, description?, icon?, action?, descriptionLines?, titleClassName? }`. Senza `action` = `<Link>` a tutta card; con `action` (stella) = div + link-overlay. |
| **Breadcrumb** | `@/components/ui/Breadcrumb` (default) | `{ items: { label, href? }[] }`; ultima voce = pagina corrente (`aria-current`). |
| **ObjectHeader** | `@/components/ui/ObjectHeader` (default) + `{ StatusRibbon }` | card di testa modulo: `{ title, sub?, ribbon?, actions? }`. Ribbon solo per stati REALI. |
| **KpiCard / KpiStrip** | `{ KpiCard, KpiDelta, KpiStrip }` da `@/components/ui/KpiCard` | KPI cockpit: `{ label, value, trend?, tone?, spark? }`; barra colorata a sinistra, valore mono. Solo numeri già esposti dai motori. |
| **StatTile** | `@/components/ui/StatTile` (default) | tessera-statistica densa: `{ label, value, note?, tone?, size? }`; label + valore mono accentato per `tone` + nota; well SENZA bordo (per stare dentro Card/Dialog). Per i KPI hero a piena elevazione usa `KpiCard`. |
| **FilterBar** | `{ FilterBar, FilterPill, AddFilterButton }` da `@/components/ui/FilterBar` | filtri componibili: pill rimovibili (✕) + «+ Filtro»; lo stato resta nella pagina. |
| **DetailDrawer** | `{ DrawerSplit, DetailDrawer, DrawerSection, DrawerKv }` da `@/components/ui/DetailDrawer` | scheda del record a destra della tabella (click riga), senza cambiare pagina. `className` per layout a scroll interno. |
| **ProgressPill** | `@/components/ui/ProgressPill` (default) | avanzamento compatto `n/m` con barretta (es. foto in riga tabella). |

Icone moduli: da **`lucide-react`**, centralizzate in [`components/layout/moduleIcons.tsx`](components/layout/moduleIcons.tsx) — `MODULE_ICONS` (una per `AppModuleKey`), `DASHBOARD_HOME_ICON`, `RIEPILOGO_RAPPORTINI_ICON`. Tutte montate con `className="h-5 w-5"` e `strokeWidth={1.6}` per restare sul tratto di casa. **Non importare lucide direttamente nei moduli di navigazione**: si passa da questo file, così sidebar, launcher dell'hub e ⌘K non possono divergere. (Set precedente disegnato a mano sostituito il 2026-07-23; `lucide-react` era già dipendenza, usata dai controlli mappa in [`components/ui/map.tsx`](components/ui/map.tsx).)

## 7bis. IA dei moduli — fogliette, non tab

Regola ibrida (spec premium 2026-07-22):
- **Vista di modulo** (contesti diversi nello stesso modulo, es. Storico/Riconsegna, Coda/Registro) → **foglietta**: landing con `FogliettaCard` + route dedicata + `Breadcrumb` di rientro.
- **Filtro di dato** (stessa pagina, stesso dataset, es. "Tutti / Da fare / Completati") → resta in pagina con `Tabs` (segmented). Trasformare i filtri in pagine rallenta gli operatori.
- **Launcher-griglia** (hub, Impostazioni) → griglia di MODULI (non viste di un modulo): primitivo condiviso `ModuleTile` (`rounded-[var(--radius-xl)]`, riquadro icona `h-11`). Senza `action` è un `<Link>` a tutta card; con `action` (es. la stella dei preferiti dell'hub) diventa `<div>` + link-overlay (`after:inset-0`) per ospitare l'azione. NON è `FogliettaCard`.

## 7ter. Pattern cockpit (spec 2026-07-22-redesign-cockpit.md)

- **Testa di modulo**: `ObjectHeader` (titolo + sottotitolo + azioni primarie a destra). Le pagine-foglietta con `Breadcrumb` (viste figlie) restano sul pattern slim.
- **Card-contatore = filtri rapidi**: dove i contatori sono cliccabili (Interventi, Misuratori) restano `<button aria-pressed>` con look KPI: barra colorata a sinistra, label uppercase piccola, valore `font-mono tabular-nums`.
- **Filtri componibili**: barra con ricerca libera + pill dei filtri strutturati attivi (rimozione = patch + ricarica immediata) + «+ Filtro» che apre il pannello completo.
- **Dettaglio senza cambiare pagina**: click sulla riga → `DetailDrawer` a destra (da `xl`); riga selezionata con fondo soft + inset rail zaffiro; i bottoni-riga fanno `stopPropagation`.

## 7quater. Portale operatore (campo) — la densità si inverte

Il rapportino operatore (`/r/[token]`, link pubblico senza login) è l'**unica superficie non-desktop** del prodotto: gira su un telefono, in strada, in una sola mano, spesso con i guanti, sotto il sole, e sovente offline. Vive **fuori** dall'`AppShell` (niente sidebar, niente TopBar, niente `ObjectHeader`) e monta il proprio `<Toaster/>`.

Usa **gli stessi token, lo stesso accento zaffiro e la stessa tipografia** della console. Cambia una cosa sola, e cambia al contrario: **la densità**.

| | Console (§5) | Portale operatore |
|---|---|---|
| Comandi | `size="md"` (~36px) | **`size="touch"`** dove il comando è un'azione a sé (barre fisse, foto, modali) |
| Riga di lista | 32–36px, densa | **~62–66px** — è un dato che si tocca, non un bottone: densa quanto il target consente |
| Corpo | `text-xs` 12 per i dati densi | **`text-sm` minimo** sul dato che si legge; 13 per i metadati di seconda riga |
| Minimo assoluto | 12 | **11** — sotto gli 11px non si scende mai, nemmeno sui chip |
| Peso | titoli 600 | **uguale: 600**. Niente `font-bold`/`font-extrabold` "urlato" per compensare lo schermo piccolo: si compensa con la *dimensione*, non col peso |
| Hover | portante | **inesistente** — nessuna affordance può vivere solo in `hover`. Lo stato di pressione è `active:` |

### Le due esigenze in tensione — e come si risolve

Il campo chiede **due cose opposte**: bersagli grandi per un pollice guantato, e **molti dati per schermata** perché scrollare in piedi in strada, con una mano, è il vero costo. Servire solo la prima produce un'interfaccia gonfia in cui l'operatore scorre all'infinito cercando un ODL. **Sono entrambe requisiti, non l'una il prezzo dell'altra.**

Le tre regole che le tengono insieme:

1. **44px di area tappabile ≠ 44px di ingombro visivo.** Il minimo WCAG è sull'*area di tocco*: un cerchio disegnato a 44px con dentro un'icona da 18px è corretto; lo stesso cerchio a 54px spreca 10px di schermo su ogni lato. Disegna al minimo, tocca al minimo — non sommare i due.
2. **La cromatura fissa è un budget, non uno spazio libero.** Pill di stato, testa, filtri e barre fisse **non superano un quarto dell'altezza dello schermo**. Misurato: a 375×812 il tetto è ~200px. Un banner che dice «va tutto bene» non è informazione — si monta solo quando ha qualcosa da dire.
3. **Distingui il comando dal dato.** Una riga di lista non è un bottone: è un dato che si tocca. Va compressa fino al target, non gonfiata fino alla taglia di un comando. Il numero d'ordine, i cerchi e i chevron sono cromatura: si stringono. L'ODL e l'indirizzo sono il lavoro: non si toccano.

> **Scala del root** (`globals.css`): 16px desktop · **17px ≤1024** (tablet) · **16px ≤768** (telefono). Il telefono era a 18px fino al 2026-07-25: ogni `rem` valeva +12,5% e la scala si *ingrandiva* dove lo spazio manca — sul portale operatore costava una voce e mezza per schermata. Riportato a 16; il tablet resta a 17, là lo spazio non è il vincolo.
>
> ⚠️ **Corollario per i target di tocco: NON usare `rem` per dimensionarli.** `h-12` è 3rem, quindi rendeva 54px a root 18 e rende 48px a root 16: la stessa classe cambia bersaglio col breakpoint. I comandi che devono valere esattamente il minimo (FAB, chip circolari) si scrivono in **px assoluti** — `h-[48px] w-[48px]` — così non seguono il root. Il pavimento resta comunque garantito dal `min-height: 44px`/`46px` in `globals.css`, che però **non copre gli `<a>`**: su un link-comando il minimo va scritto a mano (vedi `AZIONE_ICONA` in [`riepilogo/stili.ts`](components/modules/mappa/riepilogo/stili.ts), che usa `max-[769px]:min-h-[46px]`).

Regole aggiuntive, tutte per la stessa ragione (uno schermo al sole, letto di corsa):

- **Niente emoji come icone di comando.** Le emoji si rendono col font di sistema: cambiano per versione di Android e in monocromia 🟢/🔴 diventano indistinguibili. Icone `lucide-react` a `currentColor`, così prendono il token semantico (`--status-ok`/`--status-ko`) e il contrasto è verificato. Vale anche per gli SVG ridisegnati a mano: la libreria è già in dipendenza.
- **Larghezza**: colonna `max-w-[480px]` centrata; verificata a **320 / 375 / 414**. Niente testo cliccabile su due righe.
- **Barre fisse** (invio, navigazione voce): `pb-[calc(...+env(safe-area-inset-bottom))]`, sempre.
- **Nessun enrichment** — vale la regola delle app page.

## 8. Navigazione (shell)

- **Contenitore di pagina** ([`AppShell.tsx`](components/layout/AppShell.tsx)): `mx-auto w-full max-w-[2560px] px-3 py-4 sm:px-4 lg:px-5`. È l'**unico proprietario della cornice**. I moduli montati sotto `/hub`, `/dashboard` e `/impostazioni` **non** aggiungono `px-*`/`py-*`/`p-*` né un `max-w-*` proprio: mettono solo `space-y-*`/`gap-*` e la radice è un `<div>`, non un secondo `<main>`.
  <br>*Perché la regola esiste* (2026-07-25): il bordo si **sommava** — 32px di shell + 24px di modulo = **56px per lato** — e 13 moduli portavano un cap `max-w-6xl`/`max-w-7xl` che su un monitor 2560 lasciava oltre 1100px di canvas vuoto. Ripulito, su Live il contenuto è passato da 1035 a **1097px** a 1387 di viewport e da 1280 a **2110px** a 2400. I `<main>` annidati erano anche un doppio landmark: ora è uno solo.
  <br>⚠️ I due moduli a schermo pieno (`h-[calc(100dvh-6rem)]`: Interventi, Misuratori) **scontano la cornice verticale della shell** — header 57px + `py-4`×2 = 89px ≈ 6rem. Se cambi `py` sul contenitore, aggiorna anche quel valore o resta un buco in fondo.
  <br>Deroghe legittime al "niente `max-w`": una colonna di sola lettura (il contenuto rapportino stampabile resta a `max-w-6xl`) e le pagine fuori shell (portale operatore `/r`, presentazione dirigenza).
- **Griglia launcher** (hub + Impostazioni): 1 → `min-[640px]`:2 → `min-[1280px]`:3 → `min-[1536px]`:4 → `min-[2000px]`:5 colonne. Tiene la tile in 320–420px a ogni gradino, invece di stirarla a 611px sul monitor largo.
  <br>⚠️ **Non mischiare breakpoint nominali e arbitrari nello stesso gruppo di utility.** Tailwind v4 emette i nominali **dopo** gli arbitrari: `xl:grid-cols-3` batte `min-[2000px]:grid-cols-5` anche a 2400px (misurato: 3 colonne invece di 5, con entrambe le regole presenti e funzionanti da sole). Da qui la forma tutta-arbitraria. Vale per **ogni** gruppo — `grid-cols-*`, `max-w-*`, `px-*`: dentro il gruppo decide l'ordine di emissione del CSS, non la specificità né l'ordine nell'attributo. Se devi far vincere una classe passata da fuori, serve il suffisso important di v4 (`classe!`).
- Sidebar raggruppata in **4 sezioni**: **Pianificazione · Operatività · Analisi · Sistema**, via il campo additivo `group` su `AppModuleDefinition` in [`lib/moduleAccess.ts`](lib/moduleAccess.ts) (+ `groupLabels`/`GROUP_ORDER` in [`lib/appNavigation.ts`](lib/appNavigation.ts)). `section` resta separato (gating/middleware): **non** riusarlo per i gruppi.
- Voce attiva: `bg-[var(--brand-primary-soft)]` + testo `--primary-text` + **barra 3px a sinistra** + focus ring. Hover = `--brand-surface-muted`. Collapse con `transition-[width]` 200ms.
- **TopBar**: pill di ricerca centrale (⌘K) + NovitaCenter + campanella admin + **user menu** (avatar a iniziali → nome, ruolo, Esci — il toggle tema è stato rimosso col tema scuro, §2). Wordmark in topbar solo su mobile (il brand vive nella sidebar).
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
- Niente `alert()`/`confirm()` nativi → usa `toast.*` e `ConfirmDialog`. **Unica deroga registrata:** i flussi drag&drop del Cronoprogramma ([`CronoprogrammaWorkspace.tsx`](components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx)) tengono `window.confirm` perché la conferma dev'essere **sincrona** dentro i handler DnD — renderla asincrona si propagherebbe a tutta la catena drop. La deroga vale solo lì: fuori dal DnD si usa `ConfirmDialog`.
- Niente `var()` passato a recharts (SVG) o al paint WebGL di MapLibre → risolvi con `getComputedStyle`/`useChartColors` (i marker DOM di MapLibre invece accettano `var()` direttamente).
- Non rinominare/rimuovere token esistenti; aggiungi additivi.
- Niente ALL CAPS / dimensioni a mezzo pixel / `rounded-2xl` fuori scala.

## 10. Riferimenti

- Token: [`app/globals.css`](app/globals.css) · Primitivi: [`components/`](components), [`components/ui/`](components/ui) · Shell: [`components/layout/`](components/layout).
- Spec completa (con contrasti WCAG e razionale): `docs/superpowers/specs/2026-06-22-redesign-design-system-sobrio-design.md`.
- Piani di implementazione: `docs/superpowers/plans/2026-06-22-redesign-*.md`.

*Stato: base "Sobrio → Premium" in produzione (PR #164, 2026-07-22); evoluzione **"Cockpit" (direzione E+)** attuata lo stesso giorno: accento zaffiro hue 260, canvas grigio freddo, ObjectHeader/KpiCard/FilterBar/DetailDrawer/ProgressPill, pattern §7ter su Interventi/hub/Misuratori/Assistenza/Consuntivazione/PI/Performance/Impostazioni/Assegnazioni AI. Spec: `docs/superpowers/specs/2026-07-22-redesign-cockpit.md` (mockup `docs/design/mockup-cockpit.html`). Aggiorna questo file quando cambi token, primitivi o convenzioni.*
