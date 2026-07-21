# ROADMAP — gestione-personale

> Stato dei task di progetto. I task ATLAS vengono chiusi automaticamente al merge
> della PR collegata; qui teniamo lo storico leggibile e i follow-up tecnici.

## Fatto

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
