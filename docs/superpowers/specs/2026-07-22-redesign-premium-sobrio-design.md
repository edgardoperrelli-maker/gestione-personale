# Redesign "Sobrio → Premium" — spec di design

> Data: 2026-07-22 · Stato: **in attesa di approvazione** · Verbo: hallmark redesign multi-page
> Predecessore: `2026-06-22-redesign-design-system-sobrio-design.md` (sistema "sobrio enterprise", in produzione)
> Studio preliminare: 7 analisi parallele su token, primitivi, shell, moduli, motori, rendering speciale, docs.

## 1. Obiettivo

Portare l'app al massimo livello di rifinitura percepita ("premium") **senza toccare logiche e funzionalità**. Il redesign di giugno ha costruito fondamenta corrette (token OKLCH, primitivi, disciplina light/dark); questo redesign ne alza il craft: elevazione, stati, motion, coerenza, shell.

Approccio identico a giugno, che ha funzionato: **reskin per rivalorizzazione dei token** (nomi stabili, cambiano solo i valori; nuovi token additivi) + interventi mirati per-modulo a onde.

## 2. Decisioni bloccate (grilling 2026-07-22)

| Decisione | Scelta |
|---|---|
| Direzione visiva | **A · Sobrio → Premium**: evoluzione dell'identità attuale. Stessi hue (blu 255, grigi freddi), light-first. Premium = craft, non nuova identità. Confermata su mockup reali (A vs B Cobalt vs C Executive navy) — riferimento visivo: `docs/superpowers/mockups/2026-07-22-redesign-premium-direzione-A.html` (i suoi token OKLCH sono la bozza di partenza per la ritaratura di `globals.css` in onda 1; nel mockup Geist è reso con Inter). |
| Genre (hallmark) | modern-minimal |
| Tipografia | **Geist + Geist Mono per i dati**: Geist UI/titoli (600, tracking -0.02em sui display), Geist Mono con cifre tabulari (`font-variant-numeric: tabular-nums`) per KPI, importi €, matricole, celle numeriche. Pacchetto `geist` già installato — zero dipendenze nuove. |
| Scope | **App completa a onde** (vedi §5) |
| Motion | **Sobrio ma completo**: overlay animati 150–200ms, collapse sidebar fluido, skeleton, micro-transizioni di stato, `prefers-reduced-motion` rispettato ovunque. Niente scenografie. |
| Collaterali | Tutti: ⌘K command palette · PWA completa · brand unico export · bonifica docs |
| IA moduli | **Fogliette, regola ibrida**: viste di modulo = fogliette (landing card + route dedicata + breadcrumb); tab solo come filtri di dato in pagina (segmented control). Vedi §4.7. |

## 3. Vincoli duri (dal codice — non negoziabili)

1. **Nomi token congelati.** Solo i *valori* cambiano; i nuovi token sono additivi, definiti in ENTRAMBI i blocchi (`:root` dark e `html.light`). Motivo: `useChartColors()` (recharts), `resolveCssColor()` in `PlanningMap.tsx` (MapLibre WebGL), `lib/territoryColors.ts` (`--terr-*`) leggono i token a runtime — rinominare = rottura silenziosa di grafici e mappe.
2. **Meccanismo tema congelato.** Light = classe `.light` su `<html>`, dark = assenza di classe. `hooks/useAppTheme.ts` ha un MutationObserver su `class`. Niente `.dark`, niente `data-theme`.
3. **Motori intoccabili.** `lib/**`, `utils/**`, `app/api/**`, `middleware.ts`, `types.ts`, `app/sw.ts`, migrazioni. Il redesign tocca solo markup, CSS, interazione. I 257 test vitest sono il tripwire: se uno fallisce, si è sconfinati.
4. **Contratti e2e congelati.** Testi dei bottoni operatore ("Invia rapportino", "Salva e avanti", …) e selettori dell'harness `app/offline-e2e/` invariati. Zero overflow orizzontale a 320/360/375/390/412px sulle pagine operatore (`e2e/responsive.spec.ts`).
5. **WCAG AA.** Ogni ritaratura di coppia colore va verificata matematicamente come a giugno; `--on-primary` resta tema-specifico.
6. Repo pubblico: mai dati di produzione. Nessuna libreria nuova senza approvazione (font Geist Mono non è una dipendenza nuova).

## 4. Il sistema (delta rispetto a oggi)

### 4.1 Superfici ed elevazione — da "piatto" a "3 livelli"

Oggi la profondità è un solo registro (bordo 1px + ombra tenue uguale ovunque). Si passa a tre livelli dichiarati, sempre bordo+ombra, mai glow:

- **Livello 0 — pagina**: `--app-bg` (invariato come hue; micro-ritaratura chroma ammessa).
- **Livello 1 — superfici in flusso** (card, tabelle, form): bordo 1px + `--shadow-sm` ritarata a doppio strato (ambient + key, es. `0 1px 2px` + `0 1px 3px` a bassa alpha).
- **Livello 2 — sovrapposti** (popover, dropdown, datepicker): `--shadow-md` a doppio strato.
- **Livello 3 — modali/drawer**: `--shadow-lg` a doppio strato + `--overlay`.

Le ombre si ritarano nei valori esistenti `--shadow-sm/md/lg` (nomi invariati). Bordi: `--brand-border` leggermente più sottile percettivamente (valore, non width). Il glow ciano hardcoded nel DatePicker (riga 133) muore.

### 4.2 Tipografia

- Titoli pagina: Geist 600, tracking -0.02em, `text-2xl` (26) — trattamento display coerente su tutte le pagine (oggi disomogeneo).
- Dati numerici: **Geist Mono** via nuovo token additivo `--font-geist-mono` + utility; `tabular-nums`. Applicazione: KPI hub, colonne numeriche tabelle dense (Interventi, Rapportini, Misuratori), importi Produzione economica, matricole, contatori Live.
- Resto invariato: sentence case, pesi 600/400/500, scala Tailwind, niente mezzi pixel.

### 4.3 Primitivi — 8 stati completi

Gap attuale: loading/success assenti ovunque; disabled solo su 3 componenti; DatePicker/MultiSelect senza `error`.

| Componente | Intervento |
|---|---|
| Button | + prop `loading` (spinner, `aria-busy`, disabilitato durante); stato `active:` anche con `animated={false}` |
| Input/Select/Textarea | + stile `disabled:`; + hover bordo |
| DatePicker | + prop `error` (allineato a Input); raggi → token `--radius-*`; glow rimosso |
| MultiSelect | + prop `error`; hover trigger; raggi/ombre → token |
| Card | `interactive` → focusable (`tabIndex`, ring) |
| Tabs | + `disabled` per singola tab |
| Dialog | animazione enter/exit (fade+scale 150–200ms, exit più rapido); busy-state footer |
| **Toast (nuovo)** | primitivo unico successo/errore/info, silent-success di default, sostituisce gli `alert()` |
| **ConfirmDialog (nuovo)** | conferme brand su primitivo Dialog, sostituisce i `confirm()` nativi |
| **Skeleton (nuovo)** | blocchi shimmer sobri per tabelle/card in caricamento |

I 4 dialog di dominio in `components/` root (EditAssignment, NewAssignment, InsertReperibile, ExportAssignments) migrano al primitivo `Dialog` + `Input`/`Select` (oggi ricostruiscono overlay a mano con `rounded-2xl` e overlay hex duplicato 4 volte).

### 4.4 Shell premium

- **TopBar**: user menu unico (avatar iniziali + nome + ruolo + tema + logout in dropdown) al posto dei 6 elementi sciolti; wordmark solo nella sidebar (via il doppio brand); slot centrale per **⌘K**.
- **⌘K command palette** (nuovo componente, additivo): naviga i 14 moduli + azioni frequenti; dati da `appNavigation` esistente (consumo, non copia); scorciatoia ⌘K/Ctrl-K + bottone in TopBar.
- **Sidebar**: transizione `width` animata sul collapse; tooltip stilizzati (non `title` nativi) in collassato; fix flash al mount (leggere `localStorage` prima del paint, come il tema); label gruppo meno "admin 2019" (peso/tracking ritarati). Rimozione voce morta "Account" (o ripristino reale — decisione in onda 1).
- **Drawer mobile**: slide-in animato, focus-trap, scroll-lock del body.
- `NovitaCenter`/`CampanelloRichieste`: pannelli su livello 2 di elevazione, animati, badge unificati su `--status-ko` + `--on-danger`.

### 4.5 Motion (sistema)

- Preset in `lib/animations.ts` (unica fonte, invariato come posizione): + varianti overlay (enter/exit), + rispetto `prefers-reduced-motion` via `MotionConfig reducedMotion="user"` nel layout o `useReducedMotion` nei preset.
- Durate 150–200ms, easing esistenti; animare solo `transform`/`opacity`.
- Skeleton al posto degli spinner dove il contenuto ha forma nota.

### 4.6 Coerenza (sweep)

- Hex/Tailwind-raw → token: Interventi storico (`bg-red-50`, `zinc-*`, 12 occorrenze), MisuratoriClient (5 hex), RapportinoEditor (4), `AnnuncioSquadre` (tinte territorio hardcoded → `--terr-*`, già a ROADMAP).
- `style={{}}` → classi token dove equivalente (Assegnazione AI 133, Agente 73, mappa 43, cronoprogramma 39): meccanico, zero logica.
- `Avviso` unico condiviso per i portali token (oggi 3 copie).
- `alert()`/`confirm()` (27+) → Toast/ConfirmDialog.
- `map.tsx` (dialetto shadcn): ponte token — mappare `bg-popover`/`border-border`/etc. sui `--brand-*` via alias additivi in `globals.css`, senza riscrivere il file.

### 4.7 IA — fogliette invece di tab (regola ibrida)

Il pattern migliore già in casa (Performance: landing card → sotto-route; Assegnazione AI: drill-down + Breadcrumb; Consuntivazione; Impostazioni) diventa lo standard di organizzazione dei moduli:

- **Vista di modulo** (contesti diversi dentro lo stesso modulo) → **foglietta**: landing con card + route dedicata + breadcrumb di rientro. Niente più tab/nav ad-hoc a livello modulo.
- **Filtro di dato** (stessa pagina, stesso dataset: "Tutti / Da fare / Completati", filtri di stato nelle tabelle) → resta in pagina come **segmented control** (primitivo Tabs ristilizzato). Trasformarli in pagine rallenterebbe gli operatori (click + perdita stato filtri).

Nuovi primitivi (onda 1, additivi): **FogliettaCard** (icona da `MODULE_ICONS`, titolo, descrizione, badge conteggio opzionale — unifica le landing di Performance/Impostazioni/Consuntivazione) e **Breadcrumb** condiviso (oggi Assegnazione AI ha il suo).

Conversioni (onde 2–3):
- **Lista attesa**: Coda richieste / Registro autorizzazioni (`ListaAttesaNav` → fogliette).
- **Interventi**: Storico / Riconsegna giornaliera → landing con due fogliette.
- **Mappa**: Pianificazione / Riepilogo rapportini (oggi query `?vista=` + doppia voce sidebar) → route dedicate; le voci sidebar restano, puntano alle route.
- Performance / Impostazioni / Consuntivazione: già a fogliette — solo migrazione a `FogliettaCard` condiviso.

Vincolo: le conversioni cambiano route interne dei moduli → aggiornare `matchPrefixes` in `APP_MODULES` è consentito (campo UI additivo), il gating resta invariato; redirect dalle vecchie URL.

## 5. Onde di sviluppo

**Onda 1 — Fondazione** *(prerequisito di tutto)*
`globals.css` (ritaratura valori + token additivi `--font-geist-mono`, alias map.tsx) · primitivi 8-stati · Toast/ConfirmDialog/Skeleton · **FogliettaCard + Breadcrumb** (§4.7) · shell (TopBar+user menu, ⌘K, sidebar, drawer) · motion system + reduced-motion · aggiornamento `DESIGN.md` (sistema bloccato, il file resta la fonte per ogni pagina successiva) · verifica contrasti AA.

**Onda 2 — Top-5 impatto**
Cronoprogramma (`/dashboard`) · Mappa operatori (`/hub/mappa`) · Live (`/hub/live`) · Hub home (`/hub`) · Portale rapportino (`/r/[token]`). Per ciascuna: gerarchia, densità, mono sui dati, feedback brand, skeleton. Su mappa e live: sostituzione dei 24 `alert()/confirm()`. Mappa: conversione `?vista=` → route dedicate (fogliette, §4.7).

**Onda 3 — Aree incoerenti**
Hotel calendar (rientro nel pattern: componenti condivisi, Dialog, DatePicker) · Assegnazione AI + Agente (sweep `style={{}}`, griglie su primitivi) · Interventi storico (token semantici al posto della palette raw; landing a fogliette Storico/Riconsegna) · Lista attesa (fogliette Coda/Registro) · Rapportini backoffice (tabella condivisa con `StoricoTabella`).

**Onda 4 — Resto + porte d'ingresso**
Login (hero degno di porta d'ingresso) · portali `/pi`, `/agenda` · Impostazioni (icone `MODULE_ICONS` al posto delle icone-lettera, monoliti solo restyle superficiale) · Lista attesa, Misuratori, Consuntivazione (modulo fresco: solo allineamento) · Appuntamenti, Performance.

**Onda 5 — Collaterali**
⌘K se non chiuso in onda 1 · **PWA**: `app/manifest.ts`, icone (192/512/maskable/apple-touch), `themeColor` · **Brand unico export**: costante colori condivisa in `lib/brand.ts` consumata da 4 generatori PDF (oggi 3 palette RGB diverse) + exceljs (navy `FF0F2749` ≠ `#13243f`) + OG images — solo valori, zero logica · **Bonifica docs**: AGENTS.md §2/§6/§7/§8 (era neon + Leaflet rimosso), DESIGN.md (riferimenti Leaflet → MapLibre).

Ogni onda: PR separata, gate `npm run lint && npm test && npm run e2e` + verifica visiva light/dark + 320px sulle superfici toccate.

## 6. Fuori scope

- Qualsiasi modifica a `lib/**` (salvo `lib/brand.ts` colori export e `lib/animations.ts` preset), `utils/**`, `app/api/**`, middleware, DB.
- Refactor dei monoliti (`MappaOperatoriClient` 3963 r., `AzioniOperatoriClient` 1581 r.): il redesign li ritocca in superficie; lo split è a ROADMAP (bundle), non qui.
- Template binari xlsx/docx in `public/templates/`.
- Rebrand (logo, rosso Plenzich): il rosso resta solo nel logo — confligge con `--danger`.

## 7. Criteri di accettazione

1. Zero regressioni: vitest (257 file) e Playwright e2e verdi, invariati.
2. Contrasti AA verificati per ogni coppia ritarata (metodo giugno 2026).
3. Zero nuovi colori hardcoded; sweep riduce quelli esistenti (misurabile con grep).
4. Ogni primitivo interattivo: 8 stati implementati e dimostrabili.
5. `prefers-reduced-motion`: nessuna animazione spaziale attiva quando impostato.
6. Zero `alert()`/`confirm()` nativi nelle superfici toccate dalle onde 1–3.
7. Light e dark entrambi rifiniti (dark = variante sobria, non ripensata).
8. Pagine operatore: zero overflow orizzontale a 320–412px.
