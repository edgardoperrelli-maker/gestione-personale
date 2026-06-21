# Connettore Playwright ACEA — Fase 2: assegnazione ODL agli operatori

**Data**: 2026-06-21
**Stato**: spec approvata in brainstorming, da rivedere prima del piano
**Estende**: Fase 1 (`docs/superpowers/specs/2026-06-19-connettore-playwright-acea-design.md` §10), memoria `connettore-playwright-acea.md`

## 1. Obiettivo

Dopo che le assegnazioni operatore→ODL esistono **nell'app**, l'agente — via Playwright —
**scrive le assegnazioni sul portale ACEA** (SAP Fiori, stesso Cruscotto della Fase 1), una alla
volta, e **verifica** che siano atterrate rileggendo l'export `ATTGIORN`.

La Fase 1 (leggere lo stato ODL da ACEA → scrivere nel master) è in produzione. La Fase 2 va nella
**direzione opposta**: l'app *scrive* su ACEA.

## 2. Principio guida (a prova di futuro)

**La scrittura su ACEA legge SEMPRE dal piano in app (tabella `interventi`), mai dall'Excel.**

- **Oggi (ibrido)**: l'utente scrive le programmazioni sull'Excel (`Data` + `Esecutore`) → l'app le
  legge (modulo Assegnazione AI) → "Procedi" crea il piano in app (`interventi`) → si fa partire
  l'agente che scrive su ACEA leggendo da `interventi`.
- **Domani (solo app)**: la programmazione nasce direttamente in app → "Scrivi su ACEA" legge dallo
  stesso `interventi`. **Il passo di scrittura su ACEA non cambia**: si stacca solo la lettura
  dall'Excel.

Questo è il motivo per cui la fonte di verità è `interventi` e non lo staging `agente_pianificabili`:
così abbandonare l'Excel non richiede di rifare la Fase 2.

## 3. Generico per la commessa ACEA (non per singolo master)

Il processo (LEGGI → ANTEPRIMA/PROCEDI → SCRIVI → VERIFICA) deve valere **identico** per ogni
attività ACEA, non essere cablato sul DUNNING:

- **Limitazioni Massive (Zagarolo)**: già letto dal percorso Assegnazione AI esistente (cartella
  `LIMITAZIONI MASSIVE`, file `ZAGAROLO.xlsx`). ✅
- **DUNNING**: da aggiungere al registro (cartella diversa, `acea.masterPath`; colonna
  `Matricola misuratore` invece di `matricola`).
- **Attività ACEA future**: si registra il nuovo master in `agente_file_config`
  (`committente='acea'` + `attivita` + `template_id`) e funziona senza nuovo codice.

La **scrittura su ACEA è sostanzialmente target-agnostica**: gli ODL di Zagarolo, DUNNING e attività
future finiscono tutti nello stesso Cruscotto ACEA; cambia solo *da quale piano* arrivano gli ODL.

## 4. I quattro passi

| # | Passo | Stato di partenza | Cosa serve in Fase 2 |
|---|-------|-------------------|----------------------|
| 1 | **LEGGI** (Excel → app) | Zagarolo ok | Estendere l'agente a leggere il master DUNNING per **colonne esplicite da config**; registrare i master ACEA in `agente_file_config`. |
| 2 | **ANTEPRIMA + PROCEDI** | esiste | Riuso del modulo Assegnazione AI tale quale (crea `interventi` = fonte verità). |
| 3 | **SCRIVI su ACEA** | nuovo | Flag one-shot → l'agente legge gli `interventi` ACEA del giorno → Playwright assegna ogni ODL nel Cruscotto → report per-ODL → l'app marca "assegnato su ACEA". |
| 4 | **VERIFICA** (ATTGIORN) | nuovo | Lo stesso giro Playwright esporta `ATTGIORN` → confronta `RISORSA`+`CODICE_ODL` con l'atteso → ogni assegnazione confermata/non-confermata nel report. |

## 5. Ristrutturazione del modulo Assegnazione AI (commessa → attività)

Oggi `/hub/assegnazione-ai` mostra tutte le righe lette senza separazione. La si riorganizza in
**due livelli, pilotati da `agente_file_config`** (`committente`, `attivita`), così nuove
commesse/attività compaiono senza modifiche al codice:

```
Assegnazione AI
├── Commessa: ITALGAS         (tab — compare se esistono file italgas registrati)
│   └── (attività italgas…)   READ → anteprima → Procedi   [niente scrittura ACEA]
└── Commessa: ACEA            (tab)
    ├── Limitazioni Massive    READ → anteprima → Procedi → Scrivi su ACEA → Verifica
    ├── Dunning                READ → anteprima → Procedi → Scrivi su ACEA → Verifica
    └── (attività ACEA future) idem, automatico alla registrazione del file
```

- **Tab di primo livello = `committente`** distinti presenti in `agente_file_config`
  (es. `italgas`, `acea`). Un committente senza file registrati non mostra il tab (o lo mostra
  vuoto, scelta in implementazione).
- **Sotto-tab (solo dentro una commessa) = `attivita`** distinte di quel committente.
- Ogni vista (commessa, attività) riusa l'**identico** flusso esistente
  (`leggi-pianificabili` → `anteprima` → `assegna`/`scarta` → storico), **filtrato** sui file di
  quella attività (join `agente_pianificabili.file` → `agente_file_config`).
- Il pulsante **"Scrivi su ACEA"** (+ esito verifica) compare **solo nelle attività di committente
  `acea`**, per attività, e opera sul giorno selezionato.

### Impatto sugli endpoint esistenti
- `POST /api/admin/agente/anteprima`, `/assegna`, `/scarta`: invariati nella logica; ricevono già
  `ids` di righe. Il filtro per commessa/attività avviene a monte (la UI passa solo gli `ids` di
  quella attività). In opzione, `anteprima` può accettare un filtro `{ committente, attivita }`
  per caricare gli `ids` lato server.
- `GET /api/admin/agente/assegnazioni` (storico): aggiungere filtro opzionale `committente`/`attivita`.
- La pagina server `app/hub/assegnazione-ai/page.tsx` carica `agente_file_config` per costruire i
  tab e raggruppare le righe pianificabili.

## 6. Componenti nuovi

### 6.1 Database (Supabase prod `aceztqfebringeaebvce`, via MCP `apply_migration`)
- `agente_config`: aggiungere
  - `forza_acea_assegna boolean not null default false` — flag one-shot (gemello di `forza_acea_stato`)
  - `acea_assegna_data date` — il giorno da assegnare
  - `acea_assegna_dry boolean` — dry-run del giro di assegnazione (indipendente dal `dry_run` sync)
- `agente_file_config`: nuove righe seed
  - `('LIMITAZIONI CON ORDINE.xlsx', 'acea', 'DUNNING', <template_id>)`
  - (Italgas) `(... , 'italgas', '<attività>', <template_id>)` quando noti
- **Idempotenza/log Fase 2**: tabella `acea_assegnazioni_log`
  ```sql
  create table acea_assegnazioni_log (
    id uuid primary key default gen_random_uuid(),
    data_assegnazione date not null,
    odl text not null,
    matricola text,
    comune text,
    staff_id uuid,
    operatore_acea text,            -- nome inviato al portale
    intervento_id uuid,             -- FK logica → interventi.id
    esito text not null,            -- 'assegnato' | 'saltato' | 'fallito'
    motivo text,                    -- ragione se saltato/fallito
    verifica text,                  -- 'confermato' | 'non_confermato' | 'non_verificato'
    dry_run boolean not null default false,
    run_id uuid,                    -- FK logica → agente_run.id
    creato_il timestamptz not null default now()
  );
  create index acea_assegnazioni_log_data_idx on acea_assegnazioni_log (data_assegnazione);
  create unique index acea_assegnazioni_log_odl_uq
    on acea_assegnazioni_log (data_assegnazione, odl) where dry_run = false and esito = 'assegnato';
  ```
  L'unique parziale garantisce che un ODL già assegnato (reale) per quel giorno non venga rispinto.

### 6.2 App (Next.js)
- `POST /api/admin/agente/acea-assegna` (admin) — alza `forza_acea_assegna=true` +
  `acea_assegna_data` + `acea_assegna_dry`. **Modello: `acea-stato/route.ts`.**
- `GET /api/agente/acea-assegnazioni?data=YYYY-MM-DD` (header `x-export-key`) — ritorna la lista
  confermata da `interventi`:
  ```jsonc
  { "data": "2026-06-22",
    "righe": [
      { "odl": "123456", "matricola": "M999", "indirizzo": "Via Roma 1",
        "comune": "ROMA", "operatoreAcea": "Mario Rossi", "interventoId": "<uuid>" }
    ] }
  ```
  Selezione deterministica: da `assegnazione_ai_log` (righe del giorno `data_assegnazione` il cui
  `file` ha `committente='acea'` in `agente_file_config`, opzionalmente filtrate per `attivita`) →
  i `piano_id` → gli `interventi` di quei piani con ODL non vuoto → join `staff` per il nome.
  **Escludendo** gli ODL già `assegnato` reale in `acea_assegnazioni_log` per quel giorno.
  `operatoreAcea` risolto da `staff.display_name` (vedi §7). Nota: gli `interventi` non portano il
  committente direttamente — il legame passa per `assegnazione_ai_log` (`data → piano_id → file →
  committente`), già scritto dal "Procedi". Quando l'Excel sparirà, il piano nascerà da
  pianificazione in-app e servirà un legame equivalente piano→committente (colonna su `mappa_piani`
  o tabella ponte): annotato come evoluzione, non bloccante per l'ibrido.
- `app/api/agente/tick/route.ts` — aggiungere a `ConfigRow`/select/risposta:
  `forza_acea_assegna`→`aceaAssegna`, `acea_assegna_data`→`aceaAssegnaData`,
  `acea_assegna_dry`→`aceaAssegnaDry`; **azzerare `forza_acea_assegna` subito** dopo la lettura
  (come `forza_acea_stato`).
- `app/api/agente/report/route.ts` — accetta `tipo: 'acea-assegna'`; oltre all'insert in
  `agente_run`, inserisce/aggiorna le righe in `acea_assegnazioni_log` (esito + verifica per-ODL).
- UI:
  - `components/modules/assegnazione-ai/*` — ristrutturazione a tab commessa/attività (§5) e
    pulsante "Scrivi su ACEA" (date-picker + toggle dry-run) nelle attività ACEA.
  - In alternativa/aggiunta, un blocco "Assegna su ACEA" in `components/modules/agente/AgenteClient.tsx`
    (dove già vivono i comandi ACEA), per coerenza con "Aggiorna stato ODL". **Decisione: il
    comando vive nel modulo Assegnazione AI** (è lì che l'utente vede le assegnazioni del giorno);
    `AgenteClient` resta per i comandi di sistema (stato ODL, esegui ora).

### 6.3 Agente Node (`tools/limitazioni-sync`)
- `lib/acea/assegnaInterventi.mjs` — driver Playwright di **scrittura**: dato `[{odl, operatoreAcea}]`,
  nel Cruscotto per ogni ODL apre la riga, assegna l'operatore, salva. Selettori per
  ruolo/etichetta/testo (gli ID UI5 cambiano), **da calibrare via codegen** (§9). Riusa login/iframe
  della Fase 1 (`driver.mjs`).
- `lib/acea/verificaAttgiorn.mjs` — esporta `ATTGIORN` ("Dettaglio Risorse Interne"), fa parsing di
  `RISORSA`+`CODICE_ODL`, ritorna per ogni ODL `confermato`/`non_confermato`. (Parsing puro
  testabile; navigazione/export da calibrare.)
- `lib/acea/eseguiGiroAceaAssegna.mjs` — orchestratore: `lock` → fetch lista dall'app
  (`/api/agente/acea-assegnazioni`) → `assegnaInterventi` (skip se `dryRun` salva soltanto) →
  `verificaAttgiorn` → costruisce report `tipo:'acea-assegna'`. Firma gemella di `eseguiGiroAcea`.
- `lib/acea/risolviNomeOperatore.mjs` (puro, testabile) — applica l'eventuale mappatura override
  (§7) sopra il nome ricevuto dall'app.
- `agente.mjs` `main()` — nuovo ramo `if (ris.aceaAssegna) { … eseguiGiroAceaAssegna … }`,
  import dinamico di Playwright, `scriviLog` + `inviaReport`. Gemello del ramo `ris.aceaStato`.
- `apiAgente.mjs` — helper `fetchAceaAssegnazioni({ baseUrl, exportKey, data })`.

## 7. Mapping nome operatore (cognome Excel → nome ACEA)

- Nel master l'`Esecutore` è il **cognome**; su ACEA serve **nome e cognome**.
- L'app risolve l'operatore via `risolviEsecutore` (cognome → `staff`), e invia
  `staff.display_name` (che contiene nome+cognome) come `operatoreAcea`.
- Se ACEA usa una grafia/ordine diversi (es. "ROSSI MARIO" vs "Mario Rossi") o un registro proprio,
  si applica una **mappatura override** nel config agente:
  ```jsonc
  "acea": { "operatori": { "Mario Rossi": "ROSSI MARIO" } }
  ```
  `risolviNomeOperatore.mjs`: se la chiave è presente usa l'override, altrimenti passa il nome così
  com'è. La grafia esatta attesa da ACEA si determina al **codegen** (§9).
- Se un intervento non ha operatore risolvibile → riga `saltato` con `motivo: 'no nome operatore'`
  nel report (mai un'assegnazione a caso).

## 8. Idempotenza, sicurezza, errori

- **Idempotenza**: prima di assegnare, l'endpoint esclude gli ODL già `assegnato` reale in
  `acea_assegnazioni_log` per quel giorno (unique parziale). I re-run riprovano solo i mancanti.
- **Dry-run**: fa login + naviga + individua la riga + (eventuale) verifica, ma **NON salva** su
  ACEA e **NON marca** `acea_assegnazioni_log` come `assegnato` (logga `dry_run=true`). È l'anteprima
  sicura prima del giro reale.
- **Errori per-ODL**: try/catch per ogni ODL; un fallimento non blocca gli altri
  (`esito:'fallito'`, `motivo`). Il giro continua.
- **Lock**: riuso del lock file ACEA (anti-sovrapposizione con la Fase 1/sync).
- **Auth**: endpoint agente con `x-export-key`/`LIM_MASSIVE_EXPORT_KEY`; endpoint admin con
  `requireAdmin`.
- **Skip-lock**: se il lock è occupato, report pulito `saltato:true` (evitare di marcarlo come errore
  globale, come nota deferita della Fase 1).

## 9. Calibrazione Playwright (codegen sul PC del lavoro)

Come per il driver della Fase 1, i selettori reali si registrano sul PC del lavoro (login già noto):

```
npx playwright codegen --channel msedge "https://prd-int.launchpad.cfapps.eu10.hana.ondemand.com/site?siteId=57918e45-c3d6-4972-ab13-ca495fc4d7ee&sap-language=it-IT"
```

Da registrare e trascrivere (locatori per ruolo/etichetta/testo, valori dal config):
1. **Assegnazione** (passo 3): dal Cruscotto, come si apre un ODL e si imposta l'operatore (campo
   "Risorsa"?), se è autocomplete/dropdown/testo libero, come si salva. Conferma di
   ambiguità/omonimie. → riempie `assegnaInterventi.mjs`.
2. **Export ATTGIORN** (passo 4): come si arriva all'export "Dettaglio Risorse Interne" e si scarica.
   → riempie `verificaAttgiorn.mjs`.
3. **Grafia nome operatore** attesa dal portale → §7 (override config se serve).

Finché non calibrati, i due moduli restano stub con la struttura e i punti di aggancio definiti;
i moduli puri (parsing ATTGIORN, risoluzione nome, orchestrazione, report) sono testabili da subito.

## 10. Testing

- **Unit (vitest, in `tools/limitazioni-sync`)**: parsing `ATTGIORN` (`RISORSA`/`CODICE_ODL`),
  `risolviNomeOperatore` (override/passthrough/mancante), orchestratore con `assegna`/`verifica`
  iniettati (mock driver) → report corretto (assegnato/saltato/fallito/confermato), idempotenza
  (skip già-assegnati), dry-run (non marca). Mantenere la suite verde (84+ → 90+).
- **App**: test mirati sugli endpoint nuovi (selezione `interventi` ACEA del giorno, risoluzione
  nome, azzeramento flag nel tick). Gate: nessun nuovo fallimento sui file toccati (baseline repo
  rossa fuori da `tools/limitazioni-sync`).
- **End-to-end reale**: sul PC del lavoro, dry-run su un giorno con poche righe → leggere il report →
  poi giro reale → verificare su ACEA e via `ATTGIORN`.

## 11. Fuori scope / decisioni

- **Italgas → portale**: la commessa Italgas entra solo come **tab di organizzazione** del modulo
  (READ → anteprima → Procedi). La scrittura su un eventuale portale Italgas è fuori scope.
- **Scrittura ACEA in blocco**: l'assegnazione è **una alla volta** (vincolo del portale). Eventuale
  ottimizzazione multi-selezione è un follow-up se il Cruscotto la supporta.
- **Push unificato "tutta la commessa ACEA del giorno"**: il primo cut è **per attività**; un comando
  unico per-giorno è un possibile follow-up.
- **Migrazione delle colonne via file**: come in Fase 1, le colonne `agente_config` ACEA sono state
  applicate via MCP; per la Fase 2 si applica via MCP e si tiene un file migration per traccia.

## 12. Passi manuali (post-implementazione)

- Lanciare le migration (via MCP): colonne `agente_config` + tabella `acea_assegnazioni_log` + seed
  `agente_file_config` (DUNNING, Italgas).
- Impostare i `template_id` mancanti in `agente_file_config` (DUNNING, eventuali Italgas).
- `config.json` del PC del lavoro: eventuale `acea.operatori` (mappatura nomi) dopo il codegen.
- `codegen` dei due flussi Playwright (assegnazione + export ATTGIORN) e trascrizione selettori.
- Propagare l'agente al PC del lavoro (robocopy dal canale `G:\Il mio Drive\limitazioni-sync-aggiornato`).
- Dry-run reale, poi giro reale + verifica.

## 13. Decomposizione per il piano di implementazione

1. **DB + registro**: migration colonne/flag + `acea_assegnazioni_log` + seed `agente_file_config`.
2. **READ DUNNING**: estendere l'agente a leggere il master DUNNING per colonne esplicite + invio a
   `/api/agente/pianificabili`.
3. **Ristrutturazione modulo Assegnazione AI** (commessa → attività, data-driven).
4. **WRITE su ACEA**: endpoint `acea-assegna` + `acea-assegnazioni` + tick + ramo agente +
   `assegnaInterventi.mjs` (stub calibrabile) + report/log + UI pulsante.
5. **VERIFICA ATTGIORN**: `verificaAttgiorn.mjs` (parsing puro + export calibrabile) + esito nel
   report/log.
6. **Test + calibrazione + dry-run reale**.
