# ROADMAP — gestione-personale

> Stato dei task di progetto. I task ATLAS vengono chiusi automaticamente al merge
> della PR collegata; qui teniamo lo storico leggibile e i follow-up tecnici.

## Fatto

- ✅ **Modulo Assistenza — co-browsing live back office ↔ operatore** *(2026-07-22)* — dall'esito dello
  studio di fattibilità sulla connessione remota (vedi `docs/connessione-remota-fattibilita.md`, PR #157):
  nuovo modulo admin **`/hub/assistenza`** (gruppo Operatività, `adminOnly` + `requiresAdminRole`) per
  **vedere in diretta il rapportino dell'operatore** e guidarlo, **previa accettazione**. **Operatore**:
  FAB 🛟 sulla pagina rapportino `/r/[token]` — chiede assistenza al back office o **accetta via modale**
  una richiesta partita dal back office. **Back office**: **multi-sessione** (più assistenze in parallelo),
  avvio da richiesta in arrivo (lobby realtime) o scegliendo un **rapportino del giorno** (filtro
  operatori MultiSelect + ricerca, niente lista intera di default); replay **fedele al 100%** (rrweb:
  dati E errori/validazioni), suggerimenti testuali verso l'operatore. **Trasporto**: Supabase Realtime
  **broadcast+presence** (effimero, zero scritture di dati rapportino su DB); eventi rrweb
  **gzip→base64→chunk ≤120KB** (lo snapshot di un rapportino reale supera il MB e sforava il limite
  ~256KB del broadcast: veniva scartato in silenzio → replay vuoto, risolto); replayer ancorato al clock
  della sorgente (`startLive(ts-1000)`, anti clock-skew); mittente con coda sequenziale + retry + avviso
  "connessione instabile"; contatore eventi/errori lato admin. **Sicurezza**: canale `assist:<sid>` con
  sid = **HMAC del token calcolato solo server-side** (`lib/assistenza/canale.ts`); il token grezzo non
  lascia il server; API admin `requireAdmin`; i moduli `requiresAdminRole` ora sono **sempre visibili
  agli admin** in sidebar (fix `normalizeAllowedModules`). **Audit**: tabella `assistenza_sessioni`
  (migration `20260722140000` — **APPLICATA al prod il 22/07**, verificata: RLS attiva, 0 policy; il log
  è best-effort e non blocca se assente). Transport testato (`lib/assistenza/transport.test.ts`, 6 verdi).
  Nuova dipendenza: `rrweb` (caricata on-demand solo durante l'assistenza). Validato end-to-end su iPhone
  reale + back office (preview Vercel). PR #162. Vedi HANDOFF.md.
- ✅ **Studio di fattibilità — connessione remota back office → dispositivo operatore** *(2026-07-22, task ATLAS)* —
  studio (solo documentazione, nessun codice) su come far accedere il back office al dispositivo dell'operatore
  **tramite il link e previa accettazione**, per risolvere problemi sull'app. Deliverable:
  `docs/connessione-remota-fattibilita.md` (stesso formato di `docs/mapcn-fattibilita.md`). **Verdetto:** un
  "TeamViewer nel browser" (vedere/controllare lo schermo del telefono da una PWA) **non è realizzabile** sul
  target mobile — `getDisplayMedia` (cattura schermo web) **non esiste** su iOS Safari/WebKit né su Android
  Chrome, e nessuna Web API inietta input in un altro dispositivo (verificato in modo adversariale con fonti
  MDN/caniuse/Chromium/W3C). L'**unica via web-only** è il **co-browsing / mirroring del DOM** della sola app
  gp (vista assistita + guida, **non** controllo), che aggira il blocco perché trasmette la *struttura* e non i
  *pixel*. **Percorso consigliato:** partire da una **diagnostica remota leggera** (session-replay `rrweb` +
  log, evoluzione del widget "invia segnalazione" → ATLAS; 100% sullo stack Supabase, dati in EU), poi
  eventuale **co-browsing live** (rrweb `liveMode` su Supabase Realtime broadcast, oppure SaaS Cobrowse.io con
  PoC). **Escludere** screen-share WebRTC (bloccato su mobile) e tool nativi (TeamViewer/AnyDesk/RustDesk: fuori
  perimetro PWA, iOS non controllabile, privacy peggiore) salvo tampone d'emergenza. **Prerequisito
  trasversale critico:** ogni sessione è un nuovo trattamento di **PII di terzi** (anagrafica/indirizzo/PDR/
  matricola/GPS/note) → serve **redazione fail-closed**, **consenso per-sessione ancorato al token**, **audit**,
  **admin autenticato**; repo **PUBBLICO** → nessun segreto/licenza in commit. Aggancio previsto: token-link
  (`/r|/pi|/agenda/[token]`) + Supabase Realtime broadcast (disponibile, mai usato). Vedi HANDOFF.md.
- ✅ **Modulo Consuntivazione (back office esita interventi come da rapportino)** *(2026-07-22, task ATLAS)* —
  nuovo modulo admin `/hub/consuntivazione` (gruppo Operatività, `adminOnly`) con **due fogliette**:
  **Nuovo ordine** (crea un ordine da zero e lo chiude) e **Ordine presente** (esita un intervento
  rimasto aperto dai rapportini). L'esitazione riusa le **funzioni pure** del flusso operatore
  (`esitoInterventoDaVoce`/`voceEsitoColore`, `decidiChiusuraConPositivi` backstop doppio-positivo +
  riconciliazione, `isRimozioneTipo` → `misuratori_rimossi`, `slotFotoCondizionali`/`validaFotoObbligatorie`,
  `risolviFlussoPerGruppo` per le **azioni** del motore Azioni operatori) e scrive SEMPRE
  `interventi` **+** `rapportino_voci` collegata (rapportino contenitore con `piano_id` NULL,
  invisibile alla pianificazione), così l'ordine confluisce identico in Storico, Misuratori,
  Produzione economica, Performance e premialità. Foto nel bucket `interventi-foto` sotto
  `rapportini/<rapId>/…` (stessa convenzione dell'operatore → i visualizzatori/ZIP le ritrovano),
  endpoint admin `POST /api/admin/consuntivazione/foto`. **Squadra**: l'esitazione assegna
  l'esecuzione a uno o più operatori (`interventi.esecutori` jsonb); il **primario** (`staff_id`)
  porta il valore € UNA volta, l'intera squadra risulta in **Performance operatori** (fan-out per
  esecutore). **Premialità**: `voce` (voceDaAttivita) + `assegnato_at` valorizzati. **Tracciabilità**:
  `consuntivato_da`/`consuntivato_at`, `origine='consuntivo'` per il "Nuovo ordine". Migrations
  `20260722100000_consuntivazione.sql` (esecutori/consuntivato_da/at + CHECK origine) e
  `20260722100001_rapportini_piano_nullable.sql` — **⚠️ da applicare al prod PRIMA del merge** (il
  codice legge/scrive le colonne nuove; shim resiliente su `interventi.esecutori` in Performance).
  Logica pura testata (`lib/consuntivazione/*.test.ts`). Vedi HANDOFF.md.
- ✅ **Performance operatori: filtri multi-select + committenti/descrizioni allineate (lato modulo)** *(2026-07-21)* —
  tutti i filtri del modulo passano a multi-selezione (riuso di `components/ui/MultiSelect`):
  operatori, committenti, gruppi, attività, territori accettano più valori (array vuoto = tutti,
  OR interno / AND tra filtri). **Committenti** normalizzati: `lim_massive` accorpato ad Acea
  (è un canale, non un committente — invariato nel DB/export), il committente mostrato è quello
  dell'attività risolta (un codice ATLAS italgas loggato sotto acea diventa Italgas via fallback
  `risolviGruppo('altro')`, come `taskToIntervento`; anche la riga `altro`/PRONTO INTERVENTO si
  mostra come Italgas senza toccare il DB). **Descrizioni** allineate con un layer alias curato
  (`lib/attivita/aliasAttivita.ts`) applicato **solo in lettura, opt-in**
  (`risolviGruppo(..., { allinea: true })`): typo/punteggiatura (`LIMITAZIONI MASSICE`→`MASSIVE`,
  apostrofo iniziale) e stesso codice ATLAS con/senza descrizione (`DIS00N`, `S-MR-002`,
  `S-AI-022`) collassano alla forma canonica (gruppo invariato). I **write-path restano grezzi**:
  storage, dedup `identitaIntervento` e listino produzione non cambiano. Effetto sui dati reali:
  8084/8308 righe risolte, «Non censita» = 2 righe con tipo + 222 senza descrizione.
- ✅ **Auto-allineamento descrizioni in scrittura (import + pianificazione + manuali)** *(2026-07-21)* —
  l'alias diventa a **due tier** (`allinea: 'lettura' | 'scrittura'`): il tier *scrittura* (typo,
  punteggiatura, singolare→plurale massive) è produzione-compatibile (le canoniche esistono in
  `acea_attivita_alias`) e viene applicato dai write-path (`validaImport`, `taskToIntervento`,
  `richiestaToIntervento`); il tier *lettura* aggiunge i collassi codice ATLAS (`DIS00N`,
  `S-MR-002`, `S-AI-022`), usati SOLO dal modulo (le forme lunghe non sono nel listino). Sull'import
  una descrizione fuorviante nota **non rifiuta più il file**: viene riscritta canonica e riportata
  in `allineati` nella risposta (trasparenza backoffice); le sconosciute vere restano bloccate.
  Il dedup `identitaIntervento` è reso alias-aware (committente-agnostico) così le righe vecchie
  grezze e le nuove allineate **convergono** — niente duplicati/risurrezione di limitazioni massive
  a null-ODL in rigenerazione.
- ✅ **Performance operatori su tassonomia reale + grafico esiti** *(2026-07-21)* — il modulo
  KPI "Performance operatori" abbandona l'euristica regex sul free-text (`normalizeMacroAttivita`,
  rimossa) e risolve ogni intervento con la tassonomia vera committente → gruppo attività →
  descrizione attività (`attivita_tassonomia` via `risolviGruppo`; residuo = «Non censita»).
  Filtri per-grafico ora: committente (etichettato, lim_massive = «Acea · lim. massive»),
  gruppo attività e attività canonica. NUOVO grafico principale **Esiti operatori**: colonne
  giornaliere impilate positivi/negativi (positivo = `eseguito_positivo`, tutto il resto
  negativo, coerente con torreView) con KPI di periodo (positivi, negativi, % riuscita) e
  riepilogo «riuscita per operatore» con barre verde/rosso e percentuale. Colori dei gruppi
  stabili tra i grafici (posizione nella lista globale), dettaglio con esito etichettato e
  colorato.
- ✅ **Foto obbligatorie SU CONDIZIONE (Azioni operatori)** *(2026-07-21)* — su ogni azione
  foto il controllo è *Facoltativa / Obbligatoria / Obbligatoria se…*: la condizione punta a
  un'altra azione del flusso (casella o scelta da elenco) e al valore che fa scattare
  l'obbligo (es. «SARACINESCA spuntata → FOTO SARACINESCA obbligatoria»). Campo additivo
  `obbligatoria_se {chiave, valore}` nel jsonb `campi` (**nessuna migration**), valutato in
  `slotFotoCondizionali` PRIMA delle regole legacy per nome (valvola, retro-compat): gate
  pre-invio, dettaglio «foto mancanti» e validazione manuali «+» lo ereditano dall'unico
  collo di bottiglia. Trigger sparito → fail-open (mai blocchi fantasma); i riferimenti
  seguono i rename delle etichette e si azzerano eliminando l'azione-condizione.
- ✅ **Consolle Azioni operatori + rifiniture motore (fase 5)** *(2026-07-21)* — redesign del
  modulo su architettura per-attività: rail con stato di copertura, panoramica-registro (KPI,
  chip delle azioni per attività, slot espliciti del modello «+», «Da sistemare», Archiviati),
  editor con anteprima-telefono costruita sui componenti REALI dell'operatore e checklist di
  verifica in creazione; Archivia/riattiva accanto a Elimina (il payload ordinario non forza
  più `active=true`, che resuscitava gli archiviati); pill di salvataggio mai silenziosa (il
  blocco di validazione dichiara sempre il motivo). Motore: titolo/dettagli della card risolti
  PER-VOCE live dal flusso della sua attività (`rapportino_voci.template_id`, fallback
  rapportino per lo storico); GET admin dei template protetta da `requireAdmin` (era pubblica);
  `is_default` ritirato da tutti i consumatori; modello del «+» reso UNIVOCO per committente
  (indice unico parziale + 409 cortese) e "Pronto Intervento" riservato al modulo P.I. via
  flag `riservato_pi` (via l'aggancio per nome in `api/admin/pi/token`). Migrations
  **APPLICATE al prod il 21/07** (dopo il deploy READY della PR, per non aprire la finestra
  di ambiguità del «+» col codice vecchio): `20260721120000_modello_plus_riservato_pi`
  (colonna + data-fix + indice) e `20260721130000_archivia_flussi_obsoleti` (Ibrido acea,
  IBRIDO ITALGAS/ACEA archiviati, riattivabili dal modulo). Verifica post-apply: 10 flussi
  attivi, 2 archiviati, modelli «+» univoci, 0 rapportini in corso sull'ombrello.
  Rimosso il modulo orfano `impostazioni/template-rapportini`.
- ✅ **Pianificazione: importabile SOLO il template ufficiale** *(2026-07-21)* — i due
  caricamenti file della mappa (Excel principale e template aggiuntivo) accettano
  esclusivamente il template UFFICIALE scaricabile: foglio «Interventi» con l'header
  esatto di `COLONNE_TEMPLATE` (gate `isFileTemplateUfficiale`, checker puro
  `isHeaderTemplateUfficiale` in `lib/attivita/templateColonne.ts`). Rifiutati con la
  modale di import (nuovo tipo `formato_non_ufficiale`) i formati storici (ATTGIORN,
  Massiva/Rapportini, Export Dati/Geocall) E i template vecchi senza colonna COMMITTENTE.
  L'import torre (`/api/interventi/import`, ATTGIORN italgas) resta invariato. Test:
  invariante builder↔gate (il file generato passa il riconoscimento) + casi negativi.
- ✅ **Template import: COMMITTENTE auto e non modificabile** *(2026-07-21)* — il template
  Excel scaricabile (`/api/interventi/template`) ha la nuova colonna COMMITTENTE popolata
  in automatico dalla DESCRIZIONE ATTIVITÀ (VLOOKUP sulla Leggenda, come il GRUPPO) e
  protetta: foglio Interventi con protezione senza password, bloccate SOLO le colonne
  derivate GRUPPO ATTIVITA' + COMMITTENTE, tutto il resto libero (COMUNE/territorio,
  esecutore, ecc.); Leggenda in sola lettura. Il parser ignora la colonna (il committente
  vero lo deriva il server per singolo task dalla tassonomia).
- ✅ **Copertura totale attività → azioni (fase 4 Azioni operatori)** *(2026-07-21)* — ogni
  card intervento del rapportino risolve le azioni della SUA attività, anche nei giri misti:
  (a) `taskToIntervento` deriva committente+gruppo del singolo task dalla tassonomia (prova il
  committente del piano, poi 'altro' = acea→italgas, la stessa semantica della validazione
  import) — prima i piani da file stampavano tutto 'acea' e le attività italgas restavano senza
  gruppo (~78 interventi/30gg in fallback); il pre-check dedup di `ensureInterventiForPiano`
  ora è per chiave `committente|odl` come l'indice unico. (b) Migration
  `20260721100000_azioni_risanamento_italgas_pi` (APPLICATA al prod): RESINE spostata in
  tassonomia da acea/DUNNING (associazione errata) a **italgas / RISANAMENTO COLONNE**, flusso
  risanamento ricollegato lì (via la foglia hardcoded acqualatina/SOSTITUZIONE MISURATORI da
  `GRUPPI_EXTRA`); nuovo flusso CLASSICO "P.I." (clone azioni di "Pronto Intervento", che è
  solo_manuale e non concorre alla generazione) per i PICARRO pianificati. Verificato con le
  funzioni runtime: 8/8 gruppi risolvono un flusso; giro misto base acea → ogni attività il suo
  flusso. Restano in fallback solo gli interventi con attività non censita (descrizioni vuote o
  typo, ~15/30gg) e i manuali dal "+" (per design).
- ✅ **Mappa senza scelta del "Modello" (fase 3 Azioni operatori)** *(2026-07-21)* — la
  pianificazione non chiede più la selezione del template al salvataggio/generazione (né per
  piani nuovi né in riapertura dal riepilogo): il selettore "Modello" è rimosso e
  `sincronizzaRapportini` risolve da sé il fallback del rapportino quando il chiamante non lo
  passa — modello già stabilito dai rapportini esistenti del piano → risanamento (task RESINE)
  → default → primo attivo non-manuale (ordine nome, deterministico); senza alcun flusso attivo
  la generazione risponde 422 senza bloccare il salvataggio del piano. Fixato anche il recupero
  in riapertura: lo stato rapportini (link + modello usato) ora si carica al mount del piano
  riaperto, prima avveniva solo dopo un Salva (il reset di `savedDistribution` al cambio di
  `distribution` annullava il flag dell'init, quindi `caricaRapportini` non partiva mai).
  L'export Excel della mappa rispecchia la stessa risoluzione per le intestazioni colonne.
  Il `templateId` esplicito resta supportato (agente/config).
- ✅ **Rapportino per-attività (fase 2 Azioni operatori)** *(2026-07-20 sera)* — il rapportino non
  si genera più dal solo modello scelto in mappa: **ogni voce prende le azioni dal flusso del
  GRUPPO ATTIVITÀ del suo intervento** (`interventi.gruppo_attivita` → collegamento su
  `rapportino_template` → `rapportino_voci.template_id` + `campi_snapshot` per-voce, migration
  `20260720210000`). Il "Modello" della mappa resta solo come fallback per attività senza flusso
  collegato; il dedicato batte l'ibrido nel lookup (`risolviFlussoPerGruppo`). Per-voce in tutta
  la catena: render operatore, salvataggio, obbligatori/foto pre-invio, propagazione esiti
  (invio, live, risincronizza, correzioni ufficio), export Excel/PDF/foto con **unione colonne**
  (`utils/rapportini/campiDiVoce.ts`). Retro-compat totale: voce senza snapshot = campi del
  rapportino. Limite noto: le meccaniche task-via/ibrido e `tipo` risanamento restano
  per-rapportino. + **Template import Excel**: colonna DESCRIZIONE ATTIVITÀ solo-tendina
  (data validation sulla Leggenda, testo libero rifiutato da Excel).
- ✅ **Flusso sostitutivo dei template + rimozione modulo Template** *(2026-07-20, task ATLAS)* —
  le azioni che gli operatori eseguono sono ora collegate al **Gruppo attività** (motore
  tassonomia): nuovo modulo **Impostazioni → Azioni operatori** con la gerarchia del flowchart
  ATLAS (Committente → Gruppo attività → flusso), gruppi letti da `attivita_tassonomia`
  (data-driven) + foglia extra ACQUALATINA / SOSTITUZIONE MISURATORI (flusso risanamento);
  editor azioni invariato (auto-save, lock ottimistico, anteprime) + nuova sezione
  "Collegamento al gruppo attività" — un flusso può coprire più gruppi (es. Ibrido acea =
  LIMITAZIONI MASSIVE + DUNNING); sezioni "Interventi manuali (+)" per committente e "Flussi
  non collegati". Il modulo **Template rapportini è rimosso** (route in redirect, card
  sostituita); i flussi runtime (mappa, rapportini operatore, "+", pronto intervento) NON
  cambiano: `committente`/`is_default`/`solo_manuale` restano l'instradamento. DB: colonne
  `gruppo_committente` + `gruppi_attivita` su `rapportino_template` con seed dei collegamenti
  (migration `20260720190000_template_gruppo_attivita.sql` — ⚠️ da applicare al prod PRIMA del
  merge: la GET template seleziona le colonne nuove). Logica pura in
  `lib/rapportini/flussiGruppo.ts` (testata).
- ✅ **Template ibrido «Ibrido acea»** *(2026-07-15)* — un UNICO template rapportino che copre nello
  stesso giro Acea sia le **limitazioni massive** sia le **limitazioni/sospensioni**: superset dei
  due template esistenti (`RAPPORTINO LIMITAZIONI MASSIVE` + `LIMITAZIONI/SOSPENSIONI`). Mantiene le
  funzioni già settate di entrambi — esito con "NESSUN PASSAGGIO" e foto valvola condizionale
  (`sostituzione_valvola`=SI ⇒ `sost_valvola` obbligatoria) — che il codice riconosce **per nome**
  dei campi (`utils/rapportini/voceColore.ts`, `utils/rapportini/fotoCondizionali.ts`): nessuna
  modifica al codice, solo il nuovo template. Committente `acea`, non default. Seed idempotente
  `20260715150000_ibrido_acea_template.sql` — **da applicare al prod** (o ricreabile dall'editor
  Template rapportini). Vedi HANDOFF.md → FILONE 4.
- ✅ **Lentezza nel passaggio tra moduli** *(2026-07-15)* — diagnosi completa + fix.
  Cause trovate: (1) `PageTransitionWrapper` nel root layout con `key={pathname}`
  smontava/rimontava l'intero AppShell a ogni navigazione; (2) `AnimatePresence
  mode="wait"` serializzava ~600-900ms di sola animazione; (3) nessun `loading.tsx`
  sotto `/hub` (zero feedback al click); (4) niente router cache (`staleTimes`);
  (5) doppia chiamata di rete auth per navigazione (middleware + layout);
  (6) su Supabase: FK non indicizzate e query dei moduli in seq scan
  (`interventi` 20k seq scan, `interventi_manuali` 44k), 22 policy RLS con
  `auth.*()` rivalutato per riga. Fix: vedi HANDOFF.md e migration
  `20260715090000_perf_indici_moduli_rls_initplan.sql` (già applicata al DB).
- ✅ **Assegnazione AI — collo di bottiglia storico giri** *(2026-07-15)* — la pagina
  (e la gemella `/hub/agente`) faceva `agente_run.select('*').limit(30)`: la colonna
  JSONB `dettaglio` pesa ~27KB/riga (max 80KB), quindi ogni caricamento serializzava
  ~830KB di JSONB. Costo misurato: **93ms medi × 2471 chiamate = 230s totali**, la
  query più pesante del modulo, ri-eseguita dal polling `router.refresh()` ogni 6s.
  Fix: la lista carica solo le colonne riassuntive; `dettaglio` si carica on-demand
  all'espansione della card (nuovo GET `/api/admin/agente/run/[id]`). Verificato con
  EXPLAIN: da **125.9ms a 0.33ms** (~380×), buffer da 273 a 3.
  Stesso principio esteso ai **sotto-moduli**: la route `acea-esiti` (in polling ogni
  6s durante l'attesa dell'agente) non scarica più l'intero `dettaglio` ma solo i tre
  sotto-campi che usa (`data`, `scartati`, `erroreGlobale`) via JSON-path PostgREST,
  evitando di trasferire l'array `righe`. Le foglie SincronizzaRapportini e
  AggiornaStatoOdl usano `StoricoCard`, quindi già coperte dal fix dello storico giri.
- ✅ **Riepilogo rapportini — doppia scansione di `rapportino_voci`** *(2026-07-15)* —
  `/api/mappa/rapportini/riepilogo` scansionava `rapportino_voci` DUE volte (una per
  contare le voci, una col JSONB `risposte` per le foto in sospeso), paginando a 1000
  righe e conteggiando in JS: ~6300 righe trasferite ×2 su finestra 30gg → **~4,7s**
  osservati (DevTools). Fix: RPC `riepilogo_conteggi_voci(rap_ids)` che calcola
  entrambi i conteggi in **una passata lato DB** (misurata **55.8ms** con EXPLAIN);
  più le tre letture (piani, ai-log, RPC) ora in parallelo invece che in cascata.
  Logica foto-in-sospeso replicata in SQL e validata (0 righe discordanti vs JS).
  Migration `20260715120000_riepilogo_conteggi_voci_rpc.sql` (già applicata).
- ✅ Cronoprogramma: squadre + avviso novità + fix drag&drop (PR #85, #88, #89).
- ✅ Widget "invia segnalazione" → hub ATLAS (PR #86) + fix focus/posizione (PR #87).

## Da fare

### Performance (follow-up della diagnosi 2026-07-15, in ordine di impatto)
- [ ] **Storico interventi**: `/api/interventi/storico` con filtri vuoti fa 8 round-trip
      da 1000 su `rapportino_voci` con join → stessa medicina del riepilogo (RPC/aggregato,
      paginazione vera lato DB) o finestra data di default.
- [ ] **Performance operatori/economica**: full-scan di `interventi` +
      `rapportino_voci` serializzati nel payload RSC → finestra temporale di
      default e aggregazione lato DB.
- [ ] **`requireAdmin` per ogni route API** (getUser+profiles = 2 round-trip):
      al mount di Assegnazione AI partono ~10 round-trip di sola auth → cache
      per-request o verifica del ruolo dal JWT (`app_metadata`).
- [ ] **Middleware**: `auth.getUser()` fa una chiamata di rete per OGNI
      navigazione. File protetto da AGENTS.md (§11.1): serve istruzione esplicita
      per intervenire (opzione: validazione JWT locale, refresh solo se scaduto).
- [ ] **Bundle /hub/mappa**: `MappaOperatoriClient` (3918 righe) e
      `RiepilogoRapportini` importati staticamente in page.tsx → `next/dynamic`;
      xlsx/exceljs/jszip dinamici negli handler di export.
- [ ] **Bundle misuratori**: jspdf+jspdf-autotable statici (~350KB) → import dinamico.
- [ ] **Bundle performance**: recharts statico in tutte le sottopagine.
- [ ] **hub ↔ cronoprogramma**: `/dashboard` ha un layout con un secondo AppShell:
      attraversare i due segmenti rimonta comunque la shell → valutare route group
      condiviso.
- [ ] **Assegnazione AI**: polling `router.refresh()` ogni 6s senza condizione di
      stop lato client (`AssegnaOdl.tsx` — `fatto` hardcoded a false). Nota: dopo il
      fix dello storico giri ogni refresh è ora ~0.3ms sul DB invece di ~125ms, quindi
      il polling non è più costoso; resta da dargli comunque una condizione di stop.
- [ ] **Hotel calendar**: query `staff` nel bootstrap mai usata dal client;
      realtime che rifà il full refetch a ogni evento.
- [ ] **Ricerca storico interventi**: 6 × `ilike '%q%'` (36ms medi) → indici GIN
      pg_trgm su odl/via/matricola/nominativo/pdr se la tabella cresce.

### Igiene DB (advisor Supabase)
- [ ] 56 avvisi `multiple_permissive_policies`: policy permissive duplicate per
      stessa azione/ruolo (es. assignments ha sia `upd_auth` sia
      `assignments_update_owner`) → consolidare con attenzione alla semantica.
- [ ] 45 indici mai usati (`unused_index`) → verificare e droppare.
- [ ] Tabelle di backup nel DB (`bak_*`, `snapshot_*`, `_backup_*`) senza PK →
      esportare e rimuovere.
- [ ] `GET /api/admin/rapportino-template` senza check auth (segnalazione
      emersa durante l'analisi bundle mappa) → aggiungere `requireAdmin`.

### Funzionale
- [ ] **Azioni operatori — rifiniture per-voce**: portare per-voce anche le meccaniche
      task-via/ibrido e la vista `/hub/rapportini/eseguiti` (l'obbligo del "Modello" in mappa
      è stato rimosso il 2026-07-21: fallback risolto dal motore).
- [ ] Verifica end-to-end squadre cronoprogramma sul preview (aggancio, capo ⭐,
      scioglimento) — residuo della sessione 2026-07-13.
- [ ] Mini-card di `AnnuncioSquadre.tsx` con tinte territorio hardcoded (dark) →
      passarle a `var(--terr-…)`.
