# Handoff — Allineamento UI a DESIGN.md + redesign Cronoprogramma (2026-07-23)

> Documento di ripresa per una NUOVA chat: autosufficiente, la sessione precedente non c'è più.
> Lavoro sul branch **`redesign-cronoprogramma`** (produzione = `main`).
> Sostituisce l'handoff del modulo Assistenza (PR #162): quel contenuto resta in git —
> `git show f28c9d4a:HANDOFF.md`. I suoi follow-up aperti sono riportati in fondo.

**Branch**: `redesign-cronoprogramma` (da `origin/main` @ `46b88351`)
**Checkpoint**: `cf2afa5e` (redesign) + `7d4a3ac8` (bonifica e pulizia)
**Status**: le 8 decisioni aperte sono state prese — resta lo squash su `main` e il push

## Goal

Allineare l'interfaccia alle regole che il progetto si è dato in `DESIGN.md`, e
ridisegnare il modulo Cronoprogramma (`/dashboard`), l'unico maggiore rimasto fuori
dall'onda "Cockpit". A fine lavoro **tutto va schiacciato in UN commit** su `main`.

## Completed

- [x] **Hub ridotto a lanciatore** — `app/hub/page.tsx` rende solo `TrasfertaAlert` + `ObjectHeader` + `ModuleLauncher`. Rimossi i tre pannelli di cruscotto e con loro 5 query Supabase per caricamento pagina.
- [x] **Icone moduli su `lucide-react`**, centralizzate in `components/layout/moduleIcons.tsx`: sidebar, launcher e palette ⌘K leggono tutte da lì.
- [x] **37 dimensioni a mezzo pixel bonificate** in 11 file; scala corretta in `DESIGN.md` con i valori **misurati** (`text-sm`=14 non 13, `text-2xl`=24 non 26).
- [x] **Audit `/dashboard` risolto** — 2 critical, 4 major, 4 minor.
- [x] **Cronoprogramma, tre giri di redesign**: `ObjectHeader` come testa di modulo · colonne `minmax(220px,1fr)` con scorrimento interno + auto-scroll nel drag&drop · assenze riassunte (169px → 23px) · weekend comprimibile a striscia · filtro territori a selezione esplicita.
- [x] **Vetrate rimosse** (`backdrop-blur`) da `TopBar`, Cronoprogramma e le due barre del rapportino operatore.
- [x] **Focus ring** su 11 bottoni su 12 nel modulo Cronoprogramma (prima: 0).
- [x] **Codice morto rimosso**: `CronoFiltersPanel` e `CronoStats` (importati e mai renderizzati), i 4 componenti orfani di `components/modules/dashboard/` e le due lib che servivano solo a loro (`lib/dashboard/rapportiniKpi.ts`, `todayOperators.ts`, con i test). Restano `lib/premialita/acea.ts` — dove sta la logica premialità vera, il pannello era un placeholder — e `lib/dashboard/addDaysIso.ts`, usata da `lib/interventi/liveWindow.ts`.
- [x] **Veli tokenizzati**: nuovo `.chip-overlay` su due token additivi (`--chip-overlay-bd`/`-bg`), definiti in entrambi i temi; i 2 sfondi modale passano a `--overlay`, che già esisteva. Zero colori hardcoded rimasti nel modulo.
- [x] **Weekend compresso all'accesso**, e il comando è ora l'intestazione stessa: si clicca «Sab» o «Dom».
- [x] **`app/hub/anteprima/` parcheggiata** sul ramo locale `parcheggio/hub-anteprima-statled` invece che cancellata: non era tracciata, cancellarla era irreversibile.
- [x] **`.claude/launch.json` tracciato**, con `autoPort: true` (la porta 3000 è spesso occupata da un'altra sessione).

## Not Yet Done

- [ ] **Squash finale**: `git checkout main && git merge --squash redesign-cronoprogramma && git commit`, poi push (Vercel deploya da solo).
- [ ] **`KpiCard`/`KpiStrip`** (`components/ui/KpiCard.tsx`): **tenuti** di proposito — sono documentati in `DESIGN.md` §7 come primitivi ufficiali e servono ai futuri moduli di analisi. Restano senza consumatori: se a fine estate non li usa nessuno, o si usano o si tolgono dal documento.
- [ ] **Le utility Tailwind di sfondo e bordo non funzionano su `<button>`** in tutta l'app (vedi Failed Approaches). Oggi è stato aggirato dov'era necessario; il fix strutturale — spostare la regola in `@layer base` — va valutato a parte, perché farebbe comparire di colpo ogni `bg-*` finora ignorata su un bottone.
- [ ] **Ramo `parcheggio/hub-anteprima-statled`**: locale, **non pushare** (repo pubblico). Recupero: `git show parcheggio/hub-anteprima-statled`.

## Failed Approaches (da non ripetere)

- **Variante hub "Stat-Led / Coral"** (`app/hub/anteprima/`, su disco, non tracciata). Esperimento fuori da `DESIGN.md`: cifra gigante in testa, roster operatori, indice moduli tipografico. **Respinta**: *«questa pagina che vedo come hub non è conforme all'idea di hub»*. Il difetto era funzionale, non estetico — l'hub è un **lanciatore**, i moduli stanno sopra la piega. **Non riproporre macrostrutture guidate da un dato su `/hub`** (Stat-Led, Quote-Led, Marquee); restano valide per le pagine che *analizzano* (Performance, Interventi, Agente).

- **Riscrivere `DESIGN.md` da capo "per avere più margine"**. Accantonato: il file dichiara di sé *«se questo file e il codice divergono, vince il codice»*. Riscriverlo prima produce un documento che descrive un'app inesistente mentre l'UI non cambia. **L'ordine giusto: si decide su UNA pagina, poi si aggiorna il documento.**

- **Filtro territori nella TopBar** (chiesto esplicitamente). Non fatto lì: la `TopBar` è il guscio di ogni rotta; ospitarci lo stato del Cronoprogramma significherebbe farlo salire in `AppShell` e mostrarlo su Interventi, Impostazioni e ovunque. Messo nella testa di modulo, senza obiezioni.

- **Pulsante `⟨` per comprimere il weekend dentro le testate di sabato/domenica**. Costruito e rimosso: due copie di un comando che riguarda tutta la vista, con un glifo senza etichetta. Segnalato come *«manca la funzione per ricomprimere»* — c'era, non si trovava. Sostituito da **un solo comando etichettato** sopra le colonne. Stesso errore già corretto sull'ordinamento: **i controlli di vista non vanno replicati dentro le colonne.**

- **`sed -i` su tutti i `.tsx`** per la bonifica dei mezzi pixel. Funziona ma riscrive **ogni** file convertendo i fine-riga: 197 file risultano modificati in `git status` con **zero** differenze di contenuto (`git diff` non li vede, per `core.autocrlf=true`). Ripuliti con `git checkout --` mirato prima del commit. **Se rifai un `sed` di massa, ripulisci prima di committare** o il diff diventa illeggibile.

- **Commento `//` dentro un tag JSX** (`<div // commento ...>`) — sbagliato tre volte in sessione, è errore di sintassi. I commenti vanno **sopra** l'elemento o in `{/* */}`.

- **Scrivere lo sfondo o il bordo di un `<button>` come utility Tailwind** (`bg-[var(--x)]`, `border-white/20`, `bg-blue-600`, …). **Non disegna niente.** `app/globals.css` contiene `button { background-color: transparent; color: inherit; border: none; }` scritta **fuori da ogni `@layer`**, e in cascata le dichiarazioni non-layered battono qualunque cosa stia dentro un layer — dove Tailwind v4 mette *tutte* le sue utility. Vale per ogni bottone dell'app: i `border-white/20` che questo giro doveva "bonificare" erano già invisibili. Sui bottoni serve una regola nuda (qui `.chip-overlay`) oppure `style` inline, che il codice del modulo già usa per i colori di testo.

- **Fidarsi dell'HMR per il CSS.** Dopo aver aggiunto `.chip-overlay` a `globals.css`, il server continuava a servire un foglio a metà — i token nuovi c'erano, la classe no — e i valori calcolati dicevano che la regola non esisteva. Non era un problema di cascata: bastava **riavviare il dev server**. Se una regola nuova non si applica e il selettore fa match, prima di riscrivere il codice verifica che sia davvero nel foglio servito: `fetch(href, { cache: 'reload' })` e cerca il selettore.

## Key Decisions

| Decisione | Motivo |
|---|---|
| Un solo accento zaffiro nel launcher, gruppi resi con titoletti | `DESIGN.md` §1.2 ammette un accento; togliere il colore avrebbe cancellato il segnale di gruppo, restituito per tipografia (principio 4) |
| Colonne con larghezza minima + scorrimento contenuto | A 188px i nomi operatore erano troncati; lo scroll orizzontale sta **nel contenitore**, mai sul corpo pagina |
| Scorrimento verticale per colonna invece che di pagina | Con i territori estesi la colonna arrivava a ~1500px e a crescere era il documento, portando via l'intestazione dei giorni |
| Assenze riassunte, non nascoste | Conteggio e ripartizione per tipo restano a vista; si smette di spendere un terzo della piega per chi non c'è |
| Chiavi riservate dentro `crono:collapsedTerritori` | Riuso del meccanismo di compressione già persistito invece di inventarne uno |
| `MultiSelect` esteso in modo **additivo** (`selezioneEsplicita`) | Il primitivo è usato da **6 moduli**; cambiarne la semantica "vuoto = nessun filtro" avrebbe alterato in silenzio Assistenza, Consuntivazione, Interventi ×2, Performance |
| Token sentinella `TERR:__nessuno__` | Per `filterAssignments` un elenco territori vuoto significa "nessun vincolo" (mostra tutto); serviva un valore che non corrisponde a nulla per svuotare davvero |
| Deroga `window.confirm` annotata in `DESIGN.md` invece che rimossa | Il codice porta una motivazione scritta (conferma **sincrona** nei handler DnD); per la regola del documento stesso, vince il codice |
| Chiave `__weekend:aperto__` a semantica invertita | Il default chiesto è "compresso": tenendo la chiave `__weekend:compresso__`, l'assenza di preferenza avrebbe continuato a significare "esteso". Stesso schema già adottato per le assenze |
| Il comando del weekend **è** l'intestazione «Sab»/«Dom» | La riga di comando sopra la griglia costava una piega di spazio fra la testa di modulo e i giorni. Il testo è cliccabile, sottolineato tratteggiato, con `title` e `aria-pressed`; le strisce compresse restano cliccabili come prima |
| `KpiCard`/`KpiStrip` tenuti benché senza consumatori | Sono in `DESIGN.md` §7 come primitivi ufficiali: cancellarli avrebbe voluto dire togliere anche la voce dal documento, e servono ai moduli di analisi in arrivo |
| Variante `anteprima` parcheggiata su un ramo, non cancellata | Non era tracciata: era l'unica azione irreversibile del giro. Su un ramo locale costa niente e resta recuperabile |
| `.chip-overlay` come regola nuda invece di utility | Vedi Failed Approaches: su un `<button>` le utility Tailwind di sfondo e bordo non arrivano mai a disegnare |

## Current State

**Working**: tutto. `npx tsc --noEmit` pulito (restano i 2 errori preesistenti su `.next/types/.../template-rapportini`, non introdotti qui). `npx eslint` sui file del modulo: **0 errori e 0 warning** — i 10 warning erano tutti residui del codice morto rimosso (fra cui `filtersOpen`, `toggleToken`, `gotoMode`, che pilotavano i due pannelli mai renderizzati). `npx vitest run lib/cronoCollapse.test.ts`: 5/5.

**Verificato a schermo** (tema chiaro e scuro, dev server): weekend compresso all'accesso, clic su «Sab»/«Dom» che comprime e riespande, velo dei bottoncini reso con i token giusti in entrambi i temi.

**Broken**: niente di noto.

**Uncommitted**: niente.

## Files to Know

| File | Perché conta |
|---|---|
| `DESIGN.md` | Sistema bloccato. **Aggiornato in 3 punti**: icone §7, scala tipografica §4, deroga confirm §9 |
| `components/modules/cronoprogramma-personale/CronoCalendarView.tsx` | Cuore del redesign: griglia, weekend comprimibile, assenze riassunte, auto-scroll |
| `.../CronoToolbar.tsx` | Testa di modulo (`ObjectHeader`) + filtro territori |
| `.../CronoprogrammaWorkspace.tsx` | Stato del modulo; il ponte `MultiSelect` ↔ token `TERR:` sta qui |
| `lib/cronoCollapse.ts` | Persistenza delle compressioni + le due chiavi riservate |
| `components/ui/MultiSelect.tsx` | **Primitivo condiviso da 6 moduli** — modificare solo in modo additivo |
| `components/layout/moduleIcons.tsx` | Fonte unica delle icone di navigazione |

## Code Context

**Chiavi riservate** (`lib/cronoCollapse.ts`) — tutte nella stessa chiave localStorage `crono:collapsedTerritori`:

```ts
export const ASSENZE_APERTE_KEY = '__assenze:aperte__';       // presente = APERTO (semantica INVERTITA)
export const WEEKEND_COMPRESSO_KEY = '__weekend:compresso__'; // presente = compresso (normale)
```

**Ponte filtro territori** (`CronoprogrammaWorkspace.tsx`) — la parte non ovvia:

```ts
const TERR_NESSUNO = '__nessuno__'; // nessun territorio ha questo id

// Nessun token TERR = tutti spuntati (non "tutti vuoti")
const territoriSelezionati = useMemo(() => {
  const tok = filters.filter((t) => t.startsWith('TERR:'));
  if (tok.length === 0) return territories.map((t) => t.id);
  return tok.map((t) => t.slice(5)).filter((id) => id !== TERR_NESSUNO);
}, [filters, territories]);

const setTerritoriSelezionati = (ids: string[]) => {
  const altri = filters.filter((t) => !t.startsWith('TERR:'));
  if (ids.length === territories.length) return setFilters(altri);             // tutti = nessun vincolo
  if (ids.length === 0) return setFilters([...altri, `TERR:${TERR_NESSUNO}`]); // nessuno = tabellone vuoto
  setFilters([...altri, ...ids.map((id) => `TERR:${id}`)]);
};
```

**Prop opt-in del primitivo condiviso** (`components/ui/MultiSelect.tsx`):

```ts
selezioneEsplicita?: boolean; // default false → gli altri 5 chiamanti restano invariati
```

## Resume Instructions

1. Server: `npm run dev`. La porta 3000 è spesso occupata da un'altra sessione: `.claude/launch.json` ha `autoPort: true`, quindi ne prende una libera. I cookie di sessione valgono per `localhost` a **qualsiasi** porta, quindi il login regge anche sulla porta assegnata. Pagine dietro login; `.env.local` punta al Supabase di **produzione**.
2. `npx tsc --noEmit`
   - Atteso: solo i 2 errori su `.next/types/.../template-rapportini`
   - Altro: confronta con `git diff main...HEAD`
3. Apri `/dashboard` e controlla a vista:
   - Atteso: testa «Cronoprogramma», filtro «Territori: tutti», colonne ~221px, riga «N assenti · …» in cima a ogni colonna, comando «Comprimi sabato e domenica» sopra le colonne
   - Se le colonne appaiono quasi vuote con sole intestazioni: sono territori compressi nel `localStorage` (`crono:collapsedTerritori`), si riaprono cliccando le intestazioni
4. Porta all'utente le 8 decisioni della sezione **Not Yet Done**. Nessuna va presa in autonomia: riguardano cancellazioni di file di produzione.
5. Chiusura: `git checkout main && git merge --squash redesign-cronoprogramma && git commit`

## Warnings

- **Repo PUBBLICO**: mai nomi di dipendenti, matricole cliente, ODL, indirizzi o URL SharePoint in commit, PR o file. Verificare sui dati veri sì, pubblicarli no.
- **`.env.local` punta alla produzione**: ogni azione fatta cliccando nell'anteprima scrive su dati veri e gli endpoint mail usano l'SMTP reale.
- **Sessioni concorrenti su questo repo**: `git fetch` e verifica SHA/ramo prima di committare o pushare.
- **`--on-primary` è tema-specifico** (bianco in light, scuro in dark): usarlo per il testo su qualsiasi fondo accentato, mai `text-white`.
- Il pannello anteprima **non supporta il ritaglio** delle schermate: per i dettagli fini usa `document.documentElement.style.zoom='3'`, fotografa, poi ripristina.

## Follow-up ereditati (modulo Assistenza, PR #162 — testo integrale: `git show f28c9d4a:HANDOFF.md`)

- **Autorizzazione canale più forte**: il sid HMAC è non-indovinabile ma chi lo conosce può iscriversi con l'anon key; valutare Realtime Authorization (RLS su `realtime.messages`).
- **Redazione PII di default** lato operatore (oggi opzionale col toggle "Oscura i campi").
- Punti ciechi del mirroring DOM: mappe/canvas e anteprima camera live non si replicano.
- `terminata_at` in `assistenza_sessioni` non è ancora valorizzato (serve un beacon di fine sessione).
