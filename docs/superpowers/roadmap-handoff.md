# Roadmap — Work-package di handoff

> **Come si usa:** ogni WP è autoconsistente. Apri una sessione dedicata e dalle **solo** il blocco di quel WP (più il link a questo file). La memoria di progetto (`MEMORY.md`) è già caricata in ogni sessione di questo repo, quindi qui non si ripetono i vincoli generali — solo il contratto tecnico.
>
> **Stato di partenza (verificato il 2026-06-03):** `main` allineato a `origin/main`. Pipeline interventi (import → geocoding → lista → assegnazione → agenda "Fatto/Non fatto" → torre realtime) **completa**. Ponte **mappa → interventi (scrittura)** già fatto (`ensureInterventiForPiano`, `planInterventiForPiano`, `taskToIntervento`). Manca il verso **mappa ← interventi (lettura)** → è WP1.
>
> **Decisione architetturale presa:** pipeline **unica**. L'**import è l'unico ingresso**; la mappa **legge** gli interventi del giorno dal DB invece di ricaricare l'Excel.

---

## Regole comuni (valgono per OGNI WP)

- **Metodo** (da `MEMORY.md`): brainstorming → spec in `docs/superpowers/specs/` → writing-plans in `docs/superpowers/plans/` → subagent-driven-development (un subagent per task + doppia review: prima conformità alla spec, poi qualità del codice). **Le review-subagent sono READ-ONLY**: niente `git checkout/reset/restore/add/commit/stash`.
- **Gate qualità** prima di chiudere: `npx tsc -p tsconfig.json` (noEmit) verde · `npm run lint` verde · `npm run test` verde.
- **Git**: branch dedicato per il WP; `git fetch` + verifica SHA/branch **prima** di ogni commit/push; `git add` SOLO i file del WP (mai `git add -A`); mai committare `tsconfig.tsbuildinfo` né `.claude/settings.local.json`. A fine WP: **merge ff in `main` locale + push + elimina branch**. Footer commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **`gh` non installato** → eventuali PR si aprono via URL browser dopo il push; il push diretto su `main` lo lancia l'utente.
- **Migration**: i file `.sql` si **creano** in `supabase/migrations/` (timestamp successivo all'ultima esistente) ma **non si applicano**. Le SQL si consegnano in chat **tutte insieme SOLO su richiesta esplicita** dell'utente (le lancia lui al PC). Mai SQL inline o spontanea.
- **`npm run dev`**: mai avviarlo dentro un subagent.

### File "caldi" condivisi — un solo owner alla volta
Se il tuo WP tocca uno di questi, **sei l'unico owner** per la durata del WP e lo **ribasi su `main` appena prima** di modificarlo:
`components/modules/mappa/MappaOperatoriClient.tsx` · `utils/routing/optimizer.ts` · `lib/moduleAccess.ts` + `components/layout/moduleIcons.tsx` · `lib/interventi/interventiView.ts` · `lib/interventi/statoInterventi.ts` · `app/hub/page.tsx`

### Ordine / dipendenze
- **WP1 → WP2**: WP2 inizia **dopo** il merge di WP1 (entrambi possiedono `MappaOperatoriClient.tsx` e l'area optimizer → vanno serializzati).
- **WP3a / WP3b / WP3c / WP3d**: indipendenti tra loro e da WP1/WP2 (vedi note di collisione in ciascuno). Possono girare in parallelo a WP1/WP2.
- **WP4**: indipendente ma **bloccato** (vedi pacchetto).

---

## WP1 — Mappa: "Interventi del giorno" (la mappa legge dal DB)

**Obiettivo.** Far sì che la pagina Mappa carichi gli interventi geocodificati del giorno dalla tabella `interventi` (in alternativa all'upload Excel) e, dopo la distribuzione, riscriva l'assegnazione sugli interventi. Chiude il cerchio mappa↔interventi.

**File NUOVI (nessuna collisione):**
- `app/api/interventi/da-pianificare/route.ts` — **GET** sorgente.
- `lib/interventi/mappaInterventi.ts` (+ `.test.ts`) — helper puri.
- `app/api/interventi/distribuzione/route.ts` — **POST** sink.

**File CALDO (owner unico, da fare per ULTIMO e ribasato su `main`):**
- `components/modules/mappa/MappaOperatoriClient.tsx`

**Contratto:**
1. **GET `/api/interventi/da-pianificare?data=YYYY-MM-DD&committente=acea`**
   - Ritorna `{ interventi: Task[] }` dove `Task` è **esattamente** il tipo già prodotto da `parseExcelToTasks` (in `@/utils/routing`). → *Leggi quel tipo e replica la stessa forma*, così tutto il codice di distribuzione esistente funziona senza modifiche.
   - Filtra: solo righe geocodificate (`lat`/`lng` non null) con `stato in ('da_assegnare','assegnato')`. Default `committente='acea'`.
   - Letture con `createServerComponentClient` (RLS).
2. **Helper puri `lib/interventi/mappaInterventi.ts`** (testabili, nessun I/O):
   - `mapInterventoToTask(row: InterventoRow): Task` — usa `InterventoRow` da `lib/interventi/interventiView.ts` (sola lettura).
   - `buildDistribuzionePayload(piano): { intervento_id: string; staff_id: string; ordine: number }[]`.
3. **POST `/api/interventi/distribuzione`**
   - Body: `{ data: string; assegnazioni: { intervento_id: string; staff_id: string; ordine: number }[] }`.
   - **Riusa `pianificaAssegnazione()`** da `lib/interventi/assegnazione.ts` (sola lettura del suo codice per allinearti alla firma) così stati, transizioni e generazione del token agenda restano identici alla pipeline interventi. Scrive `staff_id`, `ordine`, `stato='assegnato'`, `assegnato_at` con `supabaseAdmin`.
4. **Edit `MappaOperatoriClient.tsx`** (ULTIMO):
   - Pulsante "Carica interventi del giorno" come **alternativa** all'upload Excel.
   - Flag interno `sorgente: 'excel' | 'interventi'`.
   - Al salvataggio: se `sorgente==='interventi'`, chiama `POST /api/interventi/distribuzione` (invece del flusso `mappa_piani`); se `'excel'`, comportamento attuale invariato.

**Dipendenze:** nessuna (è il primo). Attenzione: branch attivi sulla mappa (`feat/assegnazioni-manuali-mappa`, `feat/link-rapportini-editor-mappa`) → ribasare su `main` subito prima dell'edit al file caldo.

**Accettazione:** GET ritorna Task validi; POST assegna e genera token agenda; la mappa distribuisce e salva da sorgente "interventi"; gate verdi.

---

## WP2 — Fase 3: ottimizzazione tempi

**Obiettivo.** L'optimizer oggi è solo nearest-neighbor geografico. Farlo rispettare durate, fasce orarie, ETA, squadre a 2 operatori, assenze e abilitazioni/competenze.

**File CALDO (owner unico):** `utils/routing/optimizer.ts` (e i wrapper `optimizeRoute` / `optimizeRouteByFascia`).

**File NUOVI:**
- Migration `supabase/migrations/<timestamp>_squadre.sql` — tabella `squadre` (membri staff, validità).
- Migration `supabase/migrations/<timestamp>_staff_assenze.sql` — assenze per (staff, intervallo date).
- Matrice abilitazioni/competenze: estendere `staff` o nuova tabella di join (decidere in spec).

**Contratto:** estendere la firma dell'optimizer per accettare i vincoli `{ durate (durata_stimata_min), fasce_orarie, squadre, assenze, competenze }`; rispettare le finestre di fascia; accumulare ETA lungo il giro; bilanciare il carico. Definire i nuovi tipi in modo testabile (logica pura coperta da vitest).

**Dipendenze:** **dopo il merge di WP1** (gli interventi-come-Task devono già portare `durata_stimata_min`/`fascia_oraria`). Tocca anche `MappaOperatoriClient.tsx` per passare i vincoli → serializza con WP1.

**Accettazione:** test puri sui vincoli (fascia rispettata, ETA coerente, squadra unita, assente escluso); gate verdi. SQL nuove **non applicate**.

---

## WP3a — Voce di menu Riconsegna (owner della navigazione)

**Obiettivo.** La pagina `app/hub/interventi/riconsegna/` esiste ma **non ha voce di menu**. Aggiungerla. Questo WP è l'**unico** che tocca la navigazione (così il file caldo del menu ha un solo editor).

**File CALDI (owner unico):** `lib/moduleAccess.ts`, `components/layout/moduleIcons.tsx`.

**Contratto:** registrare la voce "Riconsegna" (admin) in `APP_MODULES` con icona coerente al tema; verificare che il routing/permessi siano allineati alle altre voci interventi. Se servono altre voci mancanti, falle qui.

**Dipendenze:** nessuna. Pacchetto piccolo. Accettazione: voce visibile/navigabile per il ruolo giusto; gate verdi.

---

## WP3b — KPI: editor `efficienza_dichiarata` + accesso premialità

**Obiettivo.** Il calcolo premialità c'è (`lib/premialita/acea.ts`, `lib/interventi/kpiAggregation.ts`) ma `efficienza_dichiarata` non è editabile da UI e l'accesso al pannello è ristretto a `admin_plus` senza UI di gestione.

**File NUOVI:** piccola pagina di editor (in `app/impostazioni/` o `app/hub/`) che legge/scrive `kpi_contratto` (committente, lotto, periodo, kpi, `efficienza_dichiarata`).

**File CALDO (eventuale):** `app/hub/page.tsx` se si tocca il pannello premialità → coordina.

**Contratto:** CRUD minimale su `kpi_contratto` via `supabaseAdmin`; validazione % dichiarata (65–85); il dashboard legge il valore aggiornato. Nessuna migration (tabella già esistente).

**Dipendenze:** nessuna. Accettazione: salvataggio efficienza riflesso nel calcolo; gate verdi.

---

## WP3c — Lista interventi: paginazione + export CSV

**Obiettivo.** La lista è limitata a 1000 righe e non esporta. Aggiungere paginazione e export CSV dei filtrati.

**File:** `app/hub/interventi/lista/page.tsx`; util CSV nuova; `lib/interventi/interventiView.ts` (**caldo, condiviso** — questo WP ne è l'owner; gli altri lo leggono soltanto, evita di cambiarne i tipi pubblici senza avvisare).

**Contratto:** paginazione server-side (offset/limit dai search params); pulsante "Esporta CSV" che rispetta i filtri attivi. Logica di paginazione/serializzazione CSV pura e testata.

**Dipendenze:** se WP1 sta girando, sappi che WP1 **legge** `InterventoRow` da `interventiView` — non modificarne la forma in modo incompatibile. Accettazione: paginazione funziona, CSV corretto; gate verdi.

---

## WP3d — TorreMappa: mappa geografica nella torre

**Obiettivo.** `components/modules/torre/TorreMappa.tsx` esiste ma la mappa geografica nella torre non è completata. Completarla (pin operatori/interventi, colori coerenti con `coloreStato`).

**File:** `components/modules/torre/TorreMappa.tsx`, eventualmente `TorreControlloClient.tsx`.

**Dipendenze:** la torre è stata toccata intensamente di recente → **ribasare su `main`** e verificare che non ci siano branch torre aperti prima di iniziare. Accettazione: mappa renderizza i pin del giorno con realtime; gate verdi.

---

## WP4 — Connettore Playwright (scraping portali) — ⛔ BLOCCATO

**Obiettivo.** Worker separato (fuori da `app/`) che scarica automaticamente gli Excel dai portali Acea/Italgas e li invia a `POST /api/interventi/import`.

**Blocco:** servono **Allegato 1 & 2 del DT Acea** (specifiche tracciato/portale) e le **credenziali/accessi** ai portali. Finché non disponibili, non procedere.

**File NUOVI:** nuova cartella worker isolata (es. `worker/scraper/`) — **zero collisione** con l'app.

**Quando sbloccato:** spec del flusso login→download→upload, gestione rate/anti-bot, schedulazione. Accettazione: scarico end-to-end su un portale di test.

---

## Trasversale — Redesign Aurea

Branch `feat/redesign-aurea-foundation` (ahead 2, non mergiato). Decidere se mergiare/proseguire. Seguire la **Aurea design reference** in memoria (cyan neon/magenta, Geist, navy, glow). Coordinare perché tocca componenti diffusi (potenziale collisione ampia).

## Housekeeping — DB + branch

- **DB**: verificare quali migration interventi sono già applicate e lanciare le mancanti (fino a `20260603030000_unificazione_interventi`). L'utente le esegue al PC; bundle SQL consegnabile in chat su richiesta.
- **Branch**: rivedere/chiudere quelli in volo: `feat/assegnazioni-manuali-mappa`, `feat/link-rapportini-editor-mappa`, `feat/rapportini-interattivi`, `feat/scadenza-link-giorno-lavori`, `chore/rimozione-moduli-obsoleti`.
