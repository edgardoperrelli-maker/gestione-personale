# Redesign design system — "sobrio enterprise"

Data: 2026-06-22 · Autore: Edgardo + Claude (brainstorming) · Stato: **in revisione**

## 1. Obiettivo

Ridisegnare l'intera app `gestione-personale` da un'estetica **"Aurea neon"** (navy scuro, ciano luminoso, magenta, gradienti radiali, ombre glow) a una direzione **sobria enterprise**: chiara, leggibile, "degna di un gestionale". Light-first, accento blu unico, grigi freddi neutri, niente glow.

Non si parte da zero: l'app ha già un sistema di token maturo (~96% della UI usa `var(--brand-*)`). Il redesign **rivalorizza** quei token e rifinisce primitivi, shell e pagine critiche.

## 2. Decisioni (dal brainstorming)

| Aspetto | Scelta |
|---|---|
| Direzione | Nuova, **sobria enterprise** (no neon) |
| Tema | **Light primario** + dark sobrio opzionale |
| Accento | **Blu professionale** (hue OKLCH ~255) |
| Scope | **Fondamenta (token+primitivi+shell) + pagine critiche a mano**; il resto eredita via cascata |
| Densità | **Bilanciata** — densa su tabelle/liste, ariosa su form/dettaglio |
| Approccio | **A — reskin a livello token + upgrade primitivi** (nomi token stabili, cambio valori) |
| Navigazione | Sidebar **raggruppata in 4 sezioni** (Pianificazione / Operatività / Analisi / Sistema) via campo additivo |

> Nota: questa direzione si discosta consapevolmente dal riferimento "Aurea" salvato in memoria. È una scelta esplicita dell'utente e ha priorità; la memoria va aggiornata a fine lavoro.

## 3. Non-obiettivi (YAGNI)

- Nessuna modifica a logica dati, API, query Supabase, gating permessi.
- **Nessuna SQL**, nessun cambio schema.
- Nessun refactor non funzionale al redesign (no riscrittura di moduli, no nuove dipendenze: niente icon-library, si tengono gli SVG inline).
- Non si tocca il flusso offline/PWA/foto/scanner di `/r`, né il geocoding/Leaflet (solo le stringhe-colore).
- Non si ridisegna `/hub/operational-calendar` (è un redirect a `/dashboard`, nessuna UI).

## 4. Vincoli architetturali (confermati dall'analisi del codice)

1. **Nomi token STABILI.** Il codice usa `--brand-*` (`--brand-surface`, `--brand-text-main`, `--brand-primary`, `--brand-border`, `--brand-primary-soft`, …) + `--app-bg`/`--card-bg` + `--success`/`--warning`/`--danger`/`--info`, in ~200 call-site. Si **rivalorizzano** questi token (cambio valore), **non si rinominano**. I nomi nuovi sono solo **additivi**.
2. **Light-first GIÀ fatto (low-risk).** Sul branch `restyle/aurea-light` il commit `3683020` ha reso il **light il default** senza ristrutturare `globals.css`: lo script inline di `app/layout.tsx` ora applica `.light` salvo `localStorage 'theme'==='dark'`. Quindi i blocchi restano `:root` = dark + `html.light` = light, ma il **default renderizzato è light**. ⇒ S1 **non** inverte più nulla: si limita a **rivalorizzare** i due blocchi esistenti (valori chiari in `html.light` §5.1, valori scuri in `:root` §5.2). Il toggle `.light`/localStorage resta intatto. **`globals.css` non è ancora stato toccato** → la palette è ancora Aurea neon (è il lavoro centrale che resta).
3. **Navy magico hardcoded.** Il colore-testo dei bottoni primari è scritto a mano come `text-[oklch(0.16 0.06 245)]` (e varianti su magenta/gold `oklch(0.16 0.06 350)`, `oklch(0.18 0.05 95)`) in **~76 file**. Funziona solo perché l'attuale `--brand-primary` è ciano chiarissimo. Col blu sobrio quel testo diventa illeggibile: va sostituito con un token `--on-primary`. **È il rischio #1.**
4. **Hex neon hardcoded** in: `MappaOperatoriClient.tsx` (palette operatori a 8 colori, `#0b1220`, marker, polyline), `LiveClient.tsx`/`TorreMappa.tsx`/`AgenteClient.tsx` (pallini stato), `TodayMapLeaflet.tsx` (`#0ea5e9`/`#22d3ee`), `FabInterventoManuale.tsx` (`bg-emerald-500`), `performance/palette.ts` (8 hex neon per recharts). Da tokenizzare.
5. **Toggle dark/light deve restare funzionante**; i nuovi token vivono sia nel set chiaro sia nello scuro.
6. **Deploy**: branch da `origin/main` (il main locale è spesso indietro), push refspec `<branch>:main` (Vercel auto-deploy), con ok esplicito. Lint/test baseline già rossa → gate = "nessun nuovo errore dai file toccati". Cache SW → hard refresh dopo deploy.

Stack: Next.js 15 + React 19 + **Tailwind v4** (`@import "tailwindcss"` + `@theme inline` in `app/globals.css`) + Geist + framer-motion + recharts + Leaflet.

## 5. Sistema di colore (valori verificati WCAG)

I contrasti sono stati calcolati con precisione (OKLCH→sRGB, luminanza WCAG 2.1; soft compositati su `surface`). **21/23 coppie passano AA**; dettaglio in Appendice A.

### 5.1 Tema LIGHT (default)

| Token (valore su `--brand-*` esistente) | OKLCH | ~hex | Contrasto chiave |
|---|---|---|---|
| `--app-bg` | `0.985 0.003 250` | `#f9fafc` | text-main 14.4:1 ✓ |
| `--brand-surface` (`--card-bg`) | `1 0 0` | `#ffffff` | text-main 15.1:1 ✓ |
| `--brand-surface-muted` | `0.975 0.004 250` | `#f6f7f9` | — |
| `--brand-border` | `0.92 0.006 250` | `#e9ebee` | divisore (decorativo) |
| `--brand-border-strong` | `0.86 0.008 250` | `#cdd1d6` | divisore (decorativo) |
| `--brand-text-main` | `0.27 0.02 255` | `#202730` | — |
| `--brand-text-muted` | `0.50 0.02 255` | `#5c646f` | 6.0:1 ✓ |
| `--brand-text-subtle` | `0.62 0.015 255` | `#80878f` | 3.6:1 ✓ (UI/large) |
| `--brand-primary` | `0.55 0.17 255` | `#1570d1` | `--on-primary` bianco 4.9:1 ✓ |
| `--brand-primary-hover` | `0.48 0.17 255` | — | — |
| `--brand-primary-soft` | `0.55 0.17 255 / 0.10` | — | `--primary-text` 7.4:1 ✓ |
| `--primary-text` *(nuovo)* | `0.42 0.16 255` | `#0049a1` | su soft 7.4:1 ✓ |
| `--on-primary` *(nuovo)* | bianco | `#ffffff` | su primary 4.9:1 ✓ |
| `--success` | `0.50 0.13 150` | `#137738` | su soft 4.8:1 ✓ |
| `--warning` | `0.52 0.11 70` | `#915c08` | su soft 4.8:1 ✓ |
| `--danger` | `0.52 0.20 25` | `#c21725` | su soft 5.0:1 ✓ |

### 5.2 Tema DARK (opzionale, sobrio — niente navy neon)

| Token | OKLCH | ~hex | Contrasto chiave |
|---|---|---|---|
| `--app-bg` | `0.20 0.012 255` | `#12161b` | text-main 15.2:1 ✓ |
| `--brand-surface` | `0.24 0.014 255` | `#1b2026` | text-main 13.8:1 ✓ |
| `--brand-surface-muted` | `0.225 0.013 255` | — | — |
| `--brand-border` | `0.32 0.012 255` | `#2f3339` | divisore (decorativo) |
| `--brand-border-strong` | `0.40 0.012 255` | — | — |
| `--brand-text-main` | `0.94 0.006 255` | `#e8ebef` | — |
| `--brand-text-muted` | `0.70 0.012 255` | `#9a9fa6` | 6.2:1 ✓ |
| `--brand-text-subtle` | `0.56 0.012 255` | `#70757c` | 3.5:1 ✓ (UI/large) |
| `--brand-primary` | `0.70 0.15 255` | `#59a0f9` | link/icone su surface 6.1:1 ✓ |
| `--primary-text` *(nuovo)* | `0.82 0.12 255` | `#8ec7ff` | su soft 7.9:1 ✓ |
| `--on-primary` *(nuovo)* | `0.20 0.012 255` | `#12161b` | **scuro** su primary **6.5:1 ✓** |
| `--success` | `0.74 0.15 150` | `#5ac576` | su soft 6.1:1 ✓ |
| `--warning` | `0.80 0.13 75` | `#eeb154` | su soft 6.8:1 ✓ |
| `--danger` | `0.72 0.17 25` | `#fd736d` | su soft 5.2:1 ✓ |

> **Correzione WCAG critica (unico fail):** in DARK il bottone primario **NON** può avere testo bianco (`#fff` su `#59a0f9` = 2.7:1, fail). `--on-primary` è perciò **tema-specifico**: bianco in light, `#12161b` in dark (6.5:1). Questo è il motivo per cui il navy magico hardcoded va sostituito con `var(--on-primary)` e non con un colore fisso.
>
> I "fail" sui bordi (1.3–1.5:1) sono divisori 1px **decorativi** con elevazione: esenti da WCAG 1.4.11 (non sono l'unico indicatore di confine). Nessuna modifica.

### 5.3 Token additivi nuovi (non rompono nulla)

- `--on-primary` (light bianco / dark `#12161b`) — testo su bottone primario.
- `--primary-text` (light `0.42 0.16 255` / dark `0.82 0.12 255`) — testo-accento blu su soft/surface.
- `--status-ok` = success, `--status-ko` = danger, `--status-warn` = warning, `--status-progress` = primary, `--status-idle` = `0.65 0.01 255` (light) / `0.55 0.012 255` (dark) — + varianti `-soft`. Per i pallini live/mappa/agente.
- `--on-danger`, `--on-warning` — testo su fondi pieni semantici (per bottoni danger ecc.).
- `--on-marker` — testo scuro leggibile sui marker colorati Leaflet (sostituisce `#0b1220`).
- `--overlay` — fondo semitrasparente di modali/drawer (sostituisce `bg-black/50`).
- `--chart-1 … --chart-8` — scala categorica sobria a bassa croma per recharts (centrata su blu + neutri freddi + un caldo desaturato), distinguibile e daltonici-aware. Sostituisce gli 8 hex neon di `performance/palette.ts`.

### 5.4 Cosa sparisce dell'attuale

- I due `radial-gradient` ciano/magenta del `body` (`globals.css` ~200–217) → tinta piatta `var(--app-bg)`.
- `--shadow-hover` glow e `--btn-primary-glow*` → ombre tenui (`--shadow-md`) o `none`.
- `--brand-gold`/magenta come colori-brand decorativi → ricondotti a semantici sobri o neutri (badge "Admin Plus", "Nuovo", "saracinesca", avatar ruolo).

## 6. Scale e fondamenta

### 6.1 Tipografia (Geist; base 14px "da gestionale")

Token `--text-*` (size / line-height): `xs` 12/16 · `sm` 13/18 · `base` 14/20 · `lg` 16/24 · `xl` 20/28 · `2xl` 26/32. Pesi: **titoli 600**, corpo **400**, label/bottoni **500**. (Resta la regola responsive che ingrandisce il font su mobile per il touch.) Le misure "a mezzo pixel" attuali (`text-[14.5px]`, `[13.5px]`, `[11.5px]`, `[10px]`, `[8px]`…) vanno normalizzate sulla scala; mai sotto `xs` 12.

### 6.2 Spaziatura, raggi, ombre, motion

- **Spaziatura**: griglia 4px (`--space-1..8` = 4/8/12/16/20/24/32/40). `--pad-cell` (tabelle, compatto ~6/10px), `--pad-control` (input/bottoni, comodo).
- **Raggi**: `sm` 4 · `md` 6 · `lg` 10 · `xl` 14 (in `@theme inline`; oggi sono 6/10/16/20). Card a `lg`/`xl`, input/bottoni a `md`, pill/badge pieni. ⚠️ cambiare `--radius-*` ricade sulle utility `rounded-lg`/`rounded-xl`: verifica visiva sui call-site.
- **Ombre**: `--shadow-sm 0 1px 2px rgba(16,24,40,.05)` · `--shadow-md 0 1px 3px rgba(16,24,40,.08)` · `--shadow-lg 0 8px 24px rgba(16,24,40,.10)` (dark: alpha più alta su nero). `--shadow-hover` → lift impercettibile, non glow.
- **Motion**: infrastruttura framer-motion invariata, "abbassata": hover = lift ~1px (non scale 1.02 + glow), durate 150–200ms, rispetto di `prefers-reduced-motion`. Non introdurre motion dove oggi non c'è (shell).

### 6.3 Tema light-first — GIÀ realizzato (non rifare)

Il light-first è **già attivo** sul branch `restyle/aurea-light` (commit `3683020`) con l'approccio a rischio minore: lo script inline di `app/layout.tsx` applica la classe `.light` per default (`localStorage 'theme' !== 'dark'`), e il fallback del `catch` aggiunge comunque `.light`. Struttura `globals.css` invariata: `:root` = valori dark, `html.light` = valori light. Il toggle in `TopBar.tsx` continua a pilotare `.light` + `localStorage 'theme'`.

**Conseguenza per il redesign:** non serve alcuna inversione. S1 **rivalorizza** i due blocchi esistenti (`html.light` ← §5.1, `:root` ← §5.2) lasciando intatti meccanismo classe e toggle. Verifica nel browser entrambi i temi (default=light, e dark via toggle).

`lib/territoryColors.ts` ha già una variante `TERRITORY_COLORS_LIGHT` sobria theme-aware (commit `f41ba11`): seguirne il pattern, eventualmente riallineando le tinte alla nuova palette neutra; **non** rimuoverla.

## 7. Primitivi

Esistono già `components/{Button,Card,Input,Badge,Tabs}.tsx` (usati e ben fatti) e `components/ui/DatePicker.tsx`. Strategia: **aggiornare in place** i primitivi esistenti; **creare** i mancanti in `components/ui/`. Props/forme compatibili coi call-site (onClick/value/onChange/disabled/type), così non si rompe nulla.

- **Button** (in place) — varianti `primary` (blu pieno, testo `--on-primary`) · `secondary` (outline neutro) · `ghost` · `soft` (tinta blu, testo `--primary-text`) · `danger`; size sm/md/lg; **focus ring blu 2px**; piatto. La variante `gold` esistente → mappata su `secondary`/`soft`.
- **Card** (in place) — surface bianca, bordo 1px, ombra `sm`, raggio `lg`/`xl`; slot header/body/footer.
- **Input / Select / Textarea** — `Input` (in place) + **nuovi** `ui/Select.tsx`, `ui/Textarea.tsx`; bordo neutro, **focus ring 2px blu**, stato `error`=danger. Aggiornare anche la regola globale `input:focus` in `globals.css` (da box-shadow 1px → **2px** `--brand-primary`).
- **Badge** (in place) — semantici (`ok/ko/warn/idle/progress`) + neutro; tag compatto.
- **Tabs** (in place) — stile **underline** sobrio (attivo = testo + sottolineatura blu).
- **Dialog** *(nuovo, `components/ui/Dialog.tsx`)* — overlay `--overlay`, centratura (+ variante bottom-sheet mobile per `/r`), **focus-trap, ESC, click-overlay, `role="dialog"` + `aria-modal` + `aria-labelledby`**, ripristino focus. Slot header/body/footer.
- **IconButton** *(piccolo helper)* — per azioni-icona riga (mappa/interventi) con `aria-label` e focus ring.
- Icone: restano gli SVG inline `currentColor` (nessuna nuova dipendenza); si normalizzano dimensioni/stroke e si sostituiscono le emoji-affordance dove poco chiare.

## 8. Navigazione (IA a 4 sezioni)

Aggiungere a `AppModuleDefinition` (`lib/moduleAccess.ts`) un campo **additivo** `group?: 'pianificazione'|'operativita'|'analisi'|'sistema'` **senza toccare `section`** (che resta la fonte per `canAccessPath`/middleware/hub). Propagare `group` + `groupLabels` in `lib/appNavigation.ts`. In `Sidebar.tsx` raggruppare per `group` (ordine esplicito), mantenendo identici: filtro `allowedModules`, caso speciale Mappa (Pianificazione + Riepilogo), badge lista-attesa, stato collapse, drawer mobile.

Mapping (approvato in anteprima dall'utente):

- **Pianificazione**: Pianificazione (mappa), Riepilogo rapportini, Cronoprogramma, Appuntamenti, Assegnazione AI
- **Operatività**: Interventi, Lista attesa, Live, Misuratori, Calendario Hotel
- **Analisi**: Performance, Agente
- **Sistema**: Impostazioni, Account

Stato attivo sobrio: bg `--brand-primary-soft` + testo `--primary-text` + **barra indicatrice** 3px a sinistra + focus ring; hover = `--brand-surface-muted`; densità riga ~34px, raggio `md`. Alleggerire il wordmark "PLENZICH/DASHBOARD" (pesi 600, tracking ridotto). Lo stesso raggruppamento si riusa nel `ModuleSelector` di Utenze.

## 9. Pagine critiche (rifinitura a mano: layout + gerarchia, non solo colore)

Sintesi azionabile per pagina (dettaglio completo: workflow di analisi, run `wf_08d0d398-a3c`). "Non toccare" comune a tutte: logica dati/API/permessi, offline/PWA/foto su `/r`, geocoding/Leaflet (solo stringhe-colore), nomi token.

### 9.1 `/hub` Dashboard — effort M
- KPI (`RapportiniKpi`): da blocchi a fondo pieno colorato → **stat-cell** sobrie (surface-muted, bordo 1px, numero `text-main`, pallino di stato `--status-*` accanto alla label). Frecce ◀▶ → focus ring + icone.
- `PremialitaPanel`: via `--brand-gold` (badge "Admin Plus" → neutro/soft; "· premio attivo" → `--success`); bordo card da `--brand-primary-border` → `--brand-border`.
- `TodayMapLeaflet`: sostituire `#0ea5e9`/`#22d3ee` leggendo `--brand-primary`/`--status-progress` via `getComputedStyle` al mount. **Non toccare** la mappa.
- Promo "Live": bordo neutro, CTA come Button soft + focus ring.

### 9.2 `/hub/mappa` Pianificazione + Riepilogo — effort L (la più pesante)
- File `MappaOperatoriClient.tsx` enorme (~3700 righe) con molti hex inline: **censimento esaustivo** prima di toccare.
- Palette operatori 8 colori (funzionale: tab+marker+polyline) → **desaturare/armonizzare**, mantenere cardinalità 8 e mapping indice→operatore. `#0b1220` → `--on-marker`; polyline → `--status-progress`; pin non-assegnata/appuntamento → `--warning`/`--brand-violet`. Leaflet: leggere token via `getComputedStyle`, ri-leggere al cambio tema.
- I `text-[oklch(0.16 0.06 *)]` magici → `--on-primary`. Bottone "Nuova pianificazione" da `danger` pieno → `secondary`/`ghost`.
- Setup "Configura pianificazione" e ManualTask/ManualAssignments/ModaleScaricaFoto → migrare a `Dialog`. Select/date nativi → primitivi. Pallini stato/PhaseStrip → `--status-*`. Tab operatori → Tabs underline (col colore operatore). Densità righe card territorio ~34px, azioni-icona raggruppate (primarie visibili + "Altro ▾"), emoji → icone + `aria-label` + focus ring.

### 9.3 `/r/[token]` Rapportino operatore (mobile/PWA) — effort L
- **Non toccare**: offline/sync, service worker, IndexedDB/outbox, pipeline foto/scanner, input file `opacity-0` (mai `display:none`), FAB con offset safe-area.
- `text-[oklch(0.16 0.06 245)]` (≥10 occorrenze qui) → `--on-primary`. FAB `bg-emerald-500` → `--brand-primary` + `--on-primary`, niente ring glow. Badge "Nuovo" gold → `--warning`/neutro; "Annullato" danger con `--on-danger`.
- Filtri/pill/crocette attive: da fondo pieno acceso → `--brand-primary-soft` + `--primary-text`. Focus ring 2px nei campi. Target touch ≥44px su "Chiudi"/"✕". Modali (`ModaleCampiMancanti`/`ModaleFotoMancanti`/…) → `Dialog` (variante bottom-sheet). Raggi e tipografia normalizzati. Liste compatte, card-dettaglio ariosa. Bordo-stato card → `--status-ok/ko/idle`.

### 9.4 `/hub/interventi` Storico — effort M
- Pagina reale = `StoricoInterventiClient` (+ Filtri/Tabella/ModaleFoto/ModaleModifica). `InterventiFilters`/`InterventiAssegnabili` **non** sono in rotta (priorità bassa, verificare import prima di toccarli).
- `text-white`/navy magico su primary → `--on-primary`. Modali → `Dialog`. Tabella densa 32–36px, header sticky `surface-muted`. Focus ring su **tutti** i `<button>` (paginazione, azioni, bulk). Emoji 📷✎🗑 → icone monocrome. Esito SI/NO → `--status-ok/ko`. Spinner overlay neutro.

### 9.5 `/hub/lista-attesa` (+ registro) — effort M
- 4 `text-[oklch(0.16 0.06 245)]` (di cui uno in `CampoInput.tsx` **condiviso con `/r`**: cambiare solo la classe colore). Semantica colore via token (danger→rosso, warning→ambra). Pallino live → `--status-ok/idle`. Gerarchia: h2 di lavoro dominante, micro-label ≥`xs`12. Card lista compatte; pannello revisione arioso con primitivi Input/Select/Textarea. Avviso duplicato-matricola → callout sobrio o `Dialog`. Tabella registro 32–36px sticky. `ListaAttesaNav` → Tabs underline (mantenendo `next/link`).

### 9.6 `/impostazioni/utenze` — effort L
- **Layout**: da "lista di card-dettaglio chilometrica" → **lista densa (~36px) + dettaglio espandibile / `Dialog`**. Bottoni → primitivo Button (3 navy magici alle righe 387/541/617 → `--on-primary`). Avatar/badge ruolo: da tondi pieni oro/magenta/verde → cerchio neutro + pallino `--status-*` piccolo. Badge "Sensibile"→`warning-soft`, "Segue il ruolo"→neutro. `ModuleSelector`: raggruppare per sezione (overview/modules/system già in `APP_MODULES`) + tile compatti + "Seleziona tutti/Nessuno". Conferme Elimina/Reset → `Dialog`. Toast a token sobri. **Non toccare** l'invariante `impostazioni ⟺ admin`.

### 9.7 `/hub/performance` — effort M
- `performance/palette.ts`: 8 hex neon → `--chart-1..8` (via `var()` in recharts; **fallback** `getComputedStyle`→hex se la `var()` non risolve nell'SVG; testare su 1 grafico in light+dark). Mantenere le **chiavi** macro.
- `--brand-gold` "saracinesca"/"Admin Plus" → `--primary-text`/`--warning`/Badge soft. **Tooltip/assi/grid recharts a tema** (estrarre `chartTheme`: surface/border/text-main/shadow-md) — oggi tooltip bianco illeggibile in dark. Donut: `stroke=var(--brand-surface)` 1.5px tra fette. Barra filtri in 2 cluster (Periodo / Segmentazione), preset come Button ghost ~28px. Tabella dettaglio: header 500 + `border-strong`, hover riga.

### 9.8 Shell (AppShell/Sidebar/TopBar) — effort M
- Vedi §8 (IA gruppi + stato attivo sobrio). Spegnere gradienti/glow nel `body`. Tokenizzare overlay drawer (`--overlay`) e ombre (`--shadow-lg`). TopBar: pill ruolo da cyan-soft → `surface-muted`; toggle/logout come Button ghost; focus ring. Raggi nav → `md`. Alleggerire wordmark. **Non toccare** permessi/collapse/drawer/badge.

## 10. Decomposizione in storie (sequenziali, ognuna verificabile)

- **S1 — Fondamenta token.** `globals.css`: rivalorizza `--brand-*`/`--app-bg`/`--card-bg`/semantici ai valori §5 (chiari nel blocco `html.light`, scuri in `:root`); aggiungi token additivi §5.3; scala tipografica §6.1; raggi/ombre §6.2; rimuovi gradienti body + glow; aggiorna `input:focus` a ring 2px. **Light-first già fatto** (§6.3): NON toccare la logica tema di `layout.tsx`/`TopBar.tsx`. Riallinea eventualmente `territoryColors.ts` (variante light già esistente) alla nuova palette. **Verifica**: l'app intera cambia pelle; default=light e dark via toggle entrambi ok; spot-check contrasti su 3–4 pagine.
- **S2 — Sweep hardcoded.** Sostituisci globalmente `text-[oklch(0.16 0.06 245)]` (+ varianti 350/95) → `var(--on-primary)`/`--primary-text` nei ~76 file; FAB emerald → primary; badge gold → semantico. **Verifica**: bottoni primari leggibili in light+dark ovunque (grep a zero residui).
- **S3 — Primitivi.** Aggiorna `Button/Card/Input/Badge/Tabs` in place; crea `ui/Select`, `ui/Textarea`. **Verifica**: render dei primitivi in entrambi i temi, focus ring visibile.
- **S4 — Dialog + token di stato.** Crea `ui/Dialog` (a11y); migra 2–3 modali chiave; applica `--status-*` a live/mappa/agente/TodayMap (sostituendo gli hex, Leaflet via `getComputedStyle`). **Verifica**: una modale migrata (focus-trap/ESC/overlay) + pallini coerenti light+dark.
- **S5 — Shell + IA gruppi.** Campo `group` additivo + raggruppamento sidebar + stato attivo sobrio + TopBar/drawer tokenizzati. **Verifica**: nav leggibile light+dark, collapse, drawer mobile, permessi e badge intatti.
- **S6 — Pagine critiche (lotti).** Rifinitura a mano §9.1–9.7 in lotti (suggerito: lotto A = hub+interventi+utenze; lotto B = mappa; lotto C = `/r`+lista-attesa; lotto D = performance). **Verifica**: ogni pagina nel browser, light+dark.
- **S7 — Verifica finale (gate).** Giro completo light+dark sulle pagine chiave + `/r`; `npx eslint` mirato sui file toccati; `npm run build`. **Comando di verifica reale richiesto per chiudere.**

## 11. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Cambiare `--brand-*` ha blast-radius **globale** | È l'intento; smoke visivo per-modulo (dashboard, mappa, riepilogo, `/r`, utenze, live) prima del deploy |
| Navy magico non sostituito → bottoni illeggibili ovunque | S2 dedicata + grep a zero residui prima di S6 |
| Lavoro restyle già presente sul branch (light-default, territory light, + commit acea non correlati) | Costruire SOPRA: non rifare il light-first; non toccare i file acea né le modifiche non committate; vedi §6.3 |
| Leaflet non legge `var()` in JS | `getComputedStyle` al mount + ri-lettura al cambio tema |
| `MappaOperatoriClient` enorme, hex sparsi | censimento esaustivo prima di editare |
| recharts non risolve `var()` nell'SVG | testare 1 grafico, fallback hex via `getComputedStyle` |
| Emoji-azione note agli operatori d'ufficio | preservare ordine/`aria`/tooltip nel passaggio a icone |
| Sessioni git concorrenti / main locale indietro | branch da `origin/main`, push refspec, fetch prima di commit |
| Cache SW dopo deploy | hard refresh; comunicare il gotcha |

## 12. Piano di verifica

- **Per storia**: build/render nel browser reale, **light e dark**, della superficie toccata.
- **Contrasti**: i valori §5 sono già verificati (App. A); ri-verificare ogni token aggiustato in corso d'opera.
- **Gate finale (S7)**: pagine chiave + `/r` in entrambi i temi; `npx eslint <file toccati>` (nessun **nuovo** errore vs baseline); `npm run build` verde.
- **No regressioni funzionali**: nessun file di logica/dati toccato (diff solo presentazione).

## Appendice A — Contrasti WCAG (sintesi)

Metodo: OKLCH→OKLab→sRGB (matrice Ottosson) + gamma sRGB, luminanza WCAG 2.1, soft compositati su `surface`. **21/23 pass.** Tutti i testi (main/muted/subtle), link, badge semantici su soft e chip primary passano AA in light+dark. Unico fail funzionale: testo bianco su primary in **dark** (2.7:1) → `--on-primary` scuro (6.5:1). I due "fail" bordi (1.3–1.5:1) sono divisori decorativi 1px (esenti 1.4.11). In light il bottone primario passa di misura (4.9:1). Tabelle valori complete: §5.1 / §5.2.
