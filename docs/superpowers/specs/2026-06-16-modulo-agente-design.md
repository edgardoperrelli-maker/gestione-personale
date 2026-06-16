# Modulo "Agente" — controllo e feedback dell'agente limitazioni massive

**Data:** 2026-06-16
**Stato:** Design in revisione

## Contesto
L'agente locale (`tools/limitazioni-sync`) aggiorna ogni giorno i file ACEA su SharePoint
(vedi [[sync-limitazioni-massive-sharepoint]] / spec `2026-06-16-sync-limitazioni-massive-sharepoint-design.md`).
Oggi il "quando" vive nell'Utilità di pianificazione di Windows e i report finiscono solo in un file `_log` locale.

Vogliamo un **modulo nell'app** (`/hub/agente`, solo admin) per: impostare **giorni e ora** di esecuzione,
mettere l'agente **in pausa**, scegliere **Prova/Reale (dryRun)**, vedere lo **stato online** e i **feedback**
(report dei giri) — senza toccare il PC.

## Principio: app = cervello, agente = operaio
La logica decisionale si sposta **nell'app**. L'agente diventa semplice: a ogni "tick" chiede all'app cosa fare.

```
  /hub/agente (admin) ──salva──► agente_config (DB) ◄─legge──┐
                                                             │
  PC (Task Scheduler OGNI ORA) ─ POST /api/agente/tick ──────┘
        │  (il tick porta le colonne rilevate)
        │   ← { eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo }
        │  se eseguiOra:
        ├─ fetchLavori + eseguiGiro (aggiorna i file)
        └─ POST /api/agente/report ─► agente_run (DB) ─► Feedback nel modulo
```

- L'app calcola `eseguiOra` in fuso **Europe/Rome**: `enabled` && giorno∈`giorni` && oraCorrente≥`ora` && non già rivendicato oggi.
- Quando ritorna `eseguiOra=true`, l'app segna `ultima_rivendicazione_giorno = oggi` → **un solo giro al giorno** (i tick successivi rispondono `false`).
- Ogni tick aggiorna `ultimo_contatto_il` → **stato online/offline** + avviso "non gira da…".
- **Statico** sul PC (`config.json`): `endpointUrl`, `exportKey`, `cartella`. **Dinamico** nell'app: giorni, ora, dryRun, on/off, finestra, **mappa di scrittura + testi esito** (§1b).

## 1. Modello dati (migration — la lancia l'utente)
```sql
-- singleton: una sola riga di configurazione
create table if not exists agente_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  giorni smallint[] not null default '{1,2,3,4,5}',   -- ISO: 1=Lun … 7=Dom
  ora text not null default '21:00',                   -- "HH:MM" Europe/Rome
  dry_run boolean not null default true,
  finestra_giorni smallint not null default 15,
  -- mappa di scrittura configurabile (globale): campo app → nome colonna, on/off
  mappatura jsonb not null default '[{"campo":"esecutore","colonna":"Esecutore","abilitato":true},{"campo":"data","colonna":"data prevista","abilitato":true},{"campo":"esito","colonna":"esito","abilitato":true},{"campo":"sigillo","colonna":"sigillo posato","abilitato":true},{"campo":"marcatore","colonna":"","abilitato":true}]'::jsonb,
  esito_positivo text not null default 'eseguito',
  esito_negativo text not null default 'No',
  ultimo_giro_il timestamptz,
  ultimo_contatto_il timestamptz,
  ultima_rivendicazione_giorno date,                   -- giorno (Rome) dell'ultimo "eseguiOra=true"
  updated_at timestamptz not null default now()
);
insert into agente_config (id) values (1) on conflict (id) do nothing;

-- storico dei giri
create table if not exists agente_run (
  id uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  dry_run boolean not null default false,
  lavori int not null default 0,
  aggiornate int not null default 0,
  extra int not null default 0,
  conflitti int not null default 0,
  non_collocate int not null default 0,
  errore text,
  dettaglio jsonb            -- report completo: file[], conflitti, extraNonCollocate
);
create index if not exists agente_run_creato_idx on agente_run (creato_il desc);

-- snapshot delle colonne rilevate per file (per evidenziare le nuove)
create table if not exists agente_file_colonne (
  file text primary key,
  is_master boolean not null default false,
  colonne text[] not null default '{}',
  colonne_nuove text[] not null default '{}',
  rilevato_il timestamptz not null default now()
);

alter table agente_config enable row level security;
alter table agente_run enable row level security;
alter table agente_file_colonne enable row level security;
create policy agente_config_all_auth on agente_config for all to authenticated using (true) with check (true);
create policy agente_run_all_auth on agente_run for all to authenticated using (true) with check (true);
create policy agente_file_colonne_all_auth on agente_file_colonne for all to authenticated using (true) with check (true);
```
(Gli endpoint agente usano `supabaseAdmin` (service-role, bypassa RLS) protetti dalla chiave; le policy servono alle letture admin di sessione.)

## 1b. Mappa di scrittura configurabile + rilevamento colonne (per nome)
**Mappa (globale, per nome intestazione).** In `agente_config.mappatura`: lista di regole `{ campo, colonna, abilitato }`.
- `campo` ∈ `esecutore | data | esito | sigillo` (default attivi) + `matricola | via | pdr | nominativo | comune | marcatore` (extra, default off salvo `marcatore`).
- `colonna` = **nome intestazione** (es. `"esito"`, `"sigillo posato"`) scelto tra quelli rilevati. `abilitato` = scrive o no.
- L'agente, per ogni regola abilitata, trova la colonna nel file **per nome** (case-insensitive, trim) e scrive il valore del `campo`.
  Valori dal lavoro (`RigaLimMassive`): `esecutore`, `data_esecuzione` (→ data Excel, fix date), `matricola`, `via`, `pdr`, `nominativo`, `comune`, `sigillo`, `esito` (vedi sotto). `marcatore` = testo "AGGIUNTA APP" **solo sulle righe extra** (se `colonna` è vuota usa la colonna libera auto-rilevata, come oggi; altrimenti la colonna nominata).
- **Aggancio invariato:** ODL/matricola/comune restano **auto-rilevati** (servono a trovare riga + comune del file); NON sono nella mappa.

**Testi esito configurabili.** `esito_positivo` (default "eseguito") + `esito_negativo` (default "No"). L'endpoint export smette di pre-formattare il testo: restituisce **`esitoOk: boolean|null`** (true=positivo, false=lavorato-negativo, null=non lavorato). L'agente scrive `esitoPositivo`/`esitoNegativo` in base a `esitoOk` (null → non scrive). *(Modifica all'endpoint già in produzione; l'agente è l'unico consumatore. `buildRigaLimMassive` aggiunge anche `pdr` e `nominativo`, oggi assenti nell'output.)*

**Rilevamento colonne (automatico a ogni tick, per-file).** A ogni tick l'agente legge le **intestazioni** dei file master e le manda nel body: `{ files: [{ nome, isMaster, colonne: [...] }] }`. L'endpoint tick fa upsert in `agente_file_colonne` e calcola `colonne_nuove` = diff con lo snapshot precedente (funzione pura `diffColonne`). Il modulo mostra le colonne ed **evidenzia nuove/sparite**, e popola i menu della mappa coi nomi reali. Best-effort: se la cartella non è raggiungibile, il tick fa comunque heartbeat + decisione.

## 2. Funzioni PURE (testabili, niente I/O)
Nuovo `lib/agente/decisione.ts`:
- `decideEsecuzione({ enabled, giorni, ora, weekday, oraCorrente, oggi, ultimaRivendicazione })` → `boolean`
  - `weekday` (1–7 Rome), `oraCorrente`/`ora` = "HH:MM", `oggi`/`ultimaRivendicazione` = "YYYY-MM-DD".
  - true sse: `enabled` && `giorni.includes(weekday)` && `oraCorrente >= ora` (confronto stringa "HH:MM") && `ultimaRivendicazione !== oggi`.
- `riassumiReport(report)` → `{ lavori, aggiornate, extra, conflitti, nonCollocate }` (somma dai `file[]` del report dell'agente).
- `statoAgente({ ultimoContattoIl, ultimoGiroIl, enabled, giorni, ora, nowRome })` → `{ online, minutiDaContatto, allerta: string|null }`
  - `online` = contatto < ~90 min fa; `allerta` se è un giorno lavorativo, passata l'ora + grazia, e `ultimo_giro_il` non è di oggi.

Helper Rome in `lib/agente/orarioRoma.ts`: `partiRoma(now: Date)` → `{ oggi, oraCorrente, weekday }` (via `toLocaleString('sv-SE',{timeZone:'Europe/Rome'})`).

## 3. Endpoint agente (auth = header `x-export-key`, riuso `LIM_MASSIVE_EXPORT_KEY`)
- `POST /api/agente/tick` — `runtime nodejs`:
  1. valida chiave; 2. carica `agente_config`; 3. `ultimo_contatto_il = now()`;
  4. **se il body porta `files[]`** → per ogni file upsert in `agente_file_colonne` con `colonne_nuove = diffColonne(precedenti, nuove)`;
  5. `parti = partiRoma(new Date())`; `eseguiOra = decideEsecuzione({...config, ...parti, ultimaRivendicazione: config.ultima_rivendicazione_giorno})`;
  6. se `eseguiOra` → `ultima_rivendicazione_giorno = parti.oggi`;
  7. ritorna `{ eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo }`.
- `POST /api/agente/report` — `runtime nodejs`:
  1. valida chiave; 2. `r = riassumiReport(body)`; 3. insert `agente_run` (r + `dry_run` + `errore` + `dettaglio=body`);
  4. `ultimo_giro_il = now()`; 5. ritorna `{ ok: true }`.

L'helper chiave si riusa da `app/api/export/limitazioni-massive/route.ts` → estrarre `chiaveValida(req)` in `lib/apiExportKey.ts` e usarlo nelle 3 route.

## 4. Endpoint admin del modulo (auth di sessione)
- La pagina server legge config+ultimi run via `supabaseAdmin` (server component) — niente route per la lettura.
- `PUT /api/admin/agente/config` — `requireAdmin()` (da `lib/apiAuth.ts`); valida e salva `enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo`; ritorna la config aggiornata. Validazione in funzione pura `validaConfig(input)` (include `validaMappatura`: `campo` tra i noti, `colonna` stringa, `abilitato` bool; testi esito = stringhe).

## 5. Modulo `/hub/agente`
- `app/hub/agente/page.tsx` (server): carica `agente_config` + ultimi ~30 `agente_run` via `supabaseAdmin`; passa a un client component.
- `components/modules/agente/AgenteClient.tsx` (client):
  - **Card Pianificazione**: toggle Acceso/Spento (`enabled`); caselle giorni Lun–Dom (`giorni`); input ora (`ora`); toggle Prova/Reale (`dry_run`); input finestra giorni; bottone **Salva** → `PUT /api/admin/agente/config`.
  - **Card Stato**: pallino online/offline + "ultimo contatto N min fa"; banner d'avviso se `statoAgente().allerta`.
  - **Card Ultimo giro + Storico**: per ogni `agente_run` → data/ora, badge Prova/Reale, conteggi (lavori, aggiornate, extra, conflitti, non collocate); dettaglio espandibile (per-file, conflitti da verificare, non collocati) dal `dettaglio` jsonb.
  - **Card Colonne & scrittura**: per ogni file (`agente_file_colonne`) elenco delle colonne rilevate con le **nuove evidenziate**; editor della **mappa** (per ogni campo: on/off + menu a tendina coi nomi colonna rilevati) + i due **testi esito** (positivo/negativo). Salva → `PUT /api/admin/agente/config`.

## 6. Permessi
- Aggiungere `'agente'` a `AppModuleKey` e a `APP_MODULES` (`lib/moduleAccess.ts`): `section: 'modules'`, `href: '/hub/agente'`, `adminOnly: true`, `requiresAdminRole: true` (gate forte: controlla un'automazione che scrive su SharePoint; aggiornare il commento che oggi cita "solo impostazioni").
- Icona in `components/layout/moduleIcons.ts`.

## 7. Modifiche all'agente (`tools/limitazioni-sync`) — l'utente ricopia una volta sola
- Nuovo `lib/apiAgente.mjs`: `tick({baseUrl, exportKey, files})` (manda anche le colonne rilevate) e `inviaReport({baseUrl, exportKey, report})`. `baseUrl` derivato dall'`endpointUrl`.
- Nuovo `lib/scanColonne.mjs`: legge le intestazioni dei file master della cartella → `[{ nome, isMaster, colonne }]` (riusa `caricaWorkbook`/`trovaRigaIntestazione`/`rilevaColonne`).
- `agente.mjs` `main()`:
  1. `scanColonne(cartella)` → `files`; `tick({..., files})` → `{ eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo }`;
  2. se `!eseguiOra` → log "in attesa" + esci (heartbeat + colonne già inviati);
  3. altrimenti: `finestra` → `fetchLavori` → `eseguiGiro({ cartella, lavori, dryRun, stamp, mappatura, esitoPositivo, esitoNegativo })` → `inviaReport`.
  - Orario/dryRun/**mappa**/**testi esito** vengono **dall'app**; `config.json` resta solo statico (URL, chiave, cartella).
- **Orchestratore guidato dalla mappa**: `eseguiGiro` non usa più i `campi` fissi; per ogni regola `abilitato` trova la colonna **per nome** e scrive il valore del campo; l'esito = `esitoPositivo`/`esitoNegativo` secondo `esitoOk`; `marcatore` solo sulle righe extra; colonna data resta date-aware (fix date).
- **Endpoint export** (`buildRigaLimMassive`): ritorna `esitoOk: boolean|null` al posto di `esito` testuale, e aggiunge `pdr`/`nominativo` all'output. Aggiornare i test puri di `exportLimMassive`.
- **Fix date (incluso qui):** nell'orchestratore, per il campo `data` usare confronto **date-aware** e scrivere una vera data Excel:
  - nuovo `lib/dataCella.mjs`: `giornoDa(v)` (Date|string|number → "YYYY-MM-DD", fuso Rome) e `aDataExcel(iso)` (→ `Date`);
  - `decidiScritturaData(cellaEsistente, nuovoIso)`: vuota→`scrivi`(Date); stesso giorno→`salta`; giorno diverso→`conflitto`. L'orchestratore usa questa per la colonna data, `decidiScrittura` per le altre.
  - Elimina i **falsi conflitti** "data Excel vs 2026-06-16" visti nel dry-run; policy prudente invariata.
- **Task Scheduler**: da "21:00 una volta" a **ogni ora**. Comando di ricreazione `schtasks /Create /TN "LimitazioniMassiveSync" /TR ... /SC HOURLY /F` (nel piano).

## Testing
- **Pure (vitest):** `decideEsecuzione`; `riassumiReport`; `statoAgente`; `validaConfig` (+`validaMappatura`); `diffColonne` (nuove/sparite); `partiRoma`; `giornoDa`/`decidiScritturaData`; `buildRigaLimMassive` aggiornato (`esitoOk`, `pdr`, `nominativo`); **scrittura guidata dalla mappa** (e2e orchestratore: scrive nelle colonne mappate per nome, rispetta `abilitato`, applica i testi esito, marcatore solo sugli extra).
- **Endpoint:** verifica manuale via curl (tick con config diverse → eseguiOra atteso; report → riga in `agente_run`).
- **Modulo:** smoke nel browser sul deploy.
- Baseline lint/test rossa: gate **mirati** sui file del WP.

## Fuori scope
- "Esegui ora" a comando (scelto NO in brainstorming; aggiungibile poi con una colonna `richiesta_giro_il`).
- Notifiche push/email per l'allerta (per ora solo banner nel modulo).
- Multi-agente / più PC (un solo agente per ora; il modello regge l'estensione con un `agente_id`).

## Da confermare in build
- Convenzione `giorni` ISO 1=Lun…7=Dom (UI mostra Lun–Dom).
- Soglia "online" (~90 min) e grazia allerta (es. ora+2h) — valori iniziali, ritoccabili.
