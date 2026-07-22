# Handoff — Modulo Consuntivazione (back office esita interventi come da rapportino) (2026-07-22)

> Documento di ripresa per una NUOVA chat: autosufficiente, la sessione precedente non c'è più.
> Lavoro sul branch `claude/modulo-consuntivazione-wiw30w` (produzione = `main`). Task ATLAS.

## Goal

Dare al back office un modulo per **caricare ed esitare interventi come se fossero chiusi dal
rapportino di un operatore**, assegnando l'esecuzione a **uno o più operatori** (squadra binaria/
multipla). Il modulo si aggancia a **tutte le tabelle del flusso rapportini** e carica le **foto**
rispettando le **azioni** del nuovo motore (Azioni operatori) al posto dei template.

## Current status

**COMPLETATO nel codice, in attesa di apply migration al prod + merge.** `npx tsc --noEmit` pulito,
`npx vitest run` = **2046 verdi** (14 nuovi test in `lib/consuntivazione/`), `eslint` pulito. Il
`next build` **compila** ma non completa in ambiente cloud (page-data collection) perché **manca la
service key** (`SUPABASE_SERVICE_ROLE_KEY` assente): errore su una route ACEA preesistente, non sul
nuovo codice — limite d'ambiente noto, non un bug.

## Decisioni chiave (grilling con l'utente)

1. **Un intervento per ODL** (invariante "un positivo per ODL"): `interventi.staff_id` = operatore
   **primario** (porta il valore € UNA volta); la **lista completa** degli esecutori vive in
   `interventi.esecutori` (jsonb `[{staff_id, staff_name}]`) per le squadre.
2. **KPI**: primario per €/Produzione/premialità; **tutta la squadra** accreditata in **Performance
   operatori** (fan-out per esecutore in `lib/performance/load.ts`, gated sulla colonna).
3. **Due fogliette** (non tab): **Nuovo ordine** (crea+esita) e **Ordine presente** (esita interventi
   rimasti aperti dai rapportini, stato ∈ da_assegnare/assegnato/in_viaggio/sul_posto/in_esecuzione).
4. **Tracciabilità**: `consuntivato_da`/`consuntivato_at` + `origine='consuntivo'` (solo "Nuovo
   ordine"); a valle è equivalente a un'esitazione da operatore.
5. **Premialità**: sì → `voce` (voceDaAttivita) + `assegnato_at` valorizzati.
6. **Migration**: creati i file, **le applica l'utente al prod PRIMA del merge**.
7. **Nuovo modulo** `/hub/consuntivazione`, adminOnly, gruppo Operatività.

## Done

- **Migrations** (`supabase/migrations/`, ⚠️ da applicare al prod):
  - `20260722100000_consuntivazione.sql`: `interventi.esecutori jsonb`, `consuntivato_da uuid`,
    `consuntivato_at timestamptz`; CHECK `origine` esteso con `'consuntivo'`; indice parziale.
  - `20260722100001_rapportini_piano_nullable.sql`: `rapportini.piano_id` reso **NULLABILE** (i
    rapportini contenitore del backoffice sono autonomi e **invisibili** alle viste della
    pianificazione, che filtrano sempre per `piano_id` non nullo).
- **Logica pura** `lib/consuntivazione/`:
  - `esita.ts` — `valutaEsito` + `calcolaEsitazione` (esito da azioni, backstop doppio-positivo,
    riga misuratori, patch intervento con esecutori/voce KPI/consuntivato). Testata.
  - `nuovoOrdine.ts` — `buildInterventoConsuntivoBase` (origine='consuntivo', classificazione
    tassonomia) + `buildVoceConsuntivo` (voce contenitore `manuale=true` approvata). Testata.
  - `flusso.ts` (server) — `caricaFlussi` + `risolviCampiFlusso` (azioni dal gruppo attività,
    fallback primo flusso attivo).
  - `esecutori.ts` (server) — `risolviEsecutori` (dedup + nomi autorevoli dallo staff, primo = primario).
  - `types.ts` — tipi condivisi.
- **API** `app/api/admin/consuntivazione/` (tutte `requireAdmin`):
  - `route.ts` GET bootstrap (operatori, committenti, territori, attività tassonomia, flussi, fallbackCampi).
  - `nuovo/route.ts` POST — crea rapportino contenitore (piano_id null) + intervento (origine
    consuntivo) + voce, esita, upsert misuratori.
  - `aperti/route.ts` GET — lista interventi aperti (search `q`, finestra `giorni`) + dettaglio `?id=`.
  - `esita/route.ts` POST — esita un intervento esistente (aggiorna voce o ne crea una contenitore).
  - `foto/route.ts` POST/GET — upload/vista foto su `interventi-foto` sotto `rapportini/<rapId>/…`.
- **UI** `app/hub/consuntivazione/page.tsx` + `components/modules/consuntivazione/`:
  `ConsuntivazioneClient` (due fogliette), `NuovoOrdineForm`, `OrdinePresenteForm`, `AzioniForm`
  (riusa `CampoInput` + `RapportinoFotoCtx` con upload admin), `SquadraPicker` (MultiSelect + chip
  con "primario"). Design system sobrio (primitivi + token).
- **Integrazione a valle**:
  - `lib/performance/load.ts` — fan-out partecipazione per esecutore (id composito `id:staffId`),
    resiliente se la colonna `esecutori` non esiste ancora.
  - `lib/limitazione/exportLimMassive.ts` — `origine==='consuntivo'` → flag `manuale=true`.
  - `lib/moduleAccess.ts` + `components/layout/moduleIcons.tsx` — registrazione modulo + icona.

## Architettura (come l'ordine confluisce a valle)

Un ordine consuntivato scrive **sia `interventi` sia `rapportino_voci`** (con `intervento_id`), come
la route `approva` degli interventi manuali. Motivo: Storico è voce-driven, e il registro
`misuratori_rimossi` si aggancia su `rapportino_voci.matricola`. La voce ha un `rapportini` padre
(`piano_id` NULL). L'esito è calcolato dalle **azioni del flusso** del gruppo attività
(`risolviFlussoPerGruppo`), non da un template fisso.

## Key files & commands

- `lib/consuntivazione/esita.ts` — cuore dell'esitazione (pura). Test: `lib/consuntivazione/esita.test.ts`.
- `app/api/admin/consuntivazione/nuovo/route.ts` / `esita/route.ts` — i due write-path.
- `lib/performance/load.ts` — fan-out squadra (unica modifica a un consumer KPI esistente).
- `npx vitest run lib/consuntivazione/` · `npx tsc --noEmit` · `npx eslint …/consuntivazione`.

## Warnings (invarianti da non violare)

- **Applicare le 2 migration al prod PRIMA del merge**: il codice legge/scrive `interventi.esecutori`,
  `consuntivato_da/at`, `origine='consuntivo'` e crea rapportini con `piano_id` NULL.
- **Mai creare un secondo `interventi` positivo sullo stesso ODL**: il backstop
  `decidiChiusuraConPositivi` annulla il doppio positivo (→ riconciliazione); l'indice unico a DB lo
  imporrebbe comunque.
- **Foto**: bucket `interventi-foto`, path `rapportini/<rapId>/<slot>.jpg`. Il `rapId` è generato dal
  client e usato ANCHE come PK del `rapportini` contenitore. Non cambiare la convenzione o i
  visualizzatori/ZIP non ritrovano le foto.
- **`rapportini.piano_id` NULL = rapportino backoffice**: non deve mai comparire nelle viste della
  pianificazione (che filtrano per piano). Non rimuovere quel filtro altrove.
- Repo **PUBBLICO**: mai dati di produzione (matricole/ODL/nomi) né importi in commit o PR.

## Open questions / possibili follow-up

- Territorio del "Nuovo ordine" è opzionale (Select in UI); se lasciato vuoto l'ordine finisce in
  "Senza territorio" nei filtri. Valutare se renderlo obbligatorio per certi committenti.
- Premialità di squadra: oggi il **primario** porta la premialità (coerente con "primario per €");
  se in futuro serve accreditarla a tutta la squadra va esteso il consumer premialità.
- La finestra di "Ordine presente" è 60 giorni (parametro `giorni`): valutare un filtro data in UI.
