# Modulo Agente — "Esegui ora" + campo saracinesca

**Data:** 2026-06-17
**Stato:** Design in revisione

## Contesto
Due aggiunte al modulo Agente (estende `2026-06-16-modulo-agente-design.md` / [[modulo-agente]]): un **pulsante per forzare un giro subito** e un nuovo **campo mappabile `saracinesca`** (dato registrato dall'operatore). Entrambe riusano l'infrastruttura esistente (tick/config, mappa per nome, policy prudente, feedback conflitti). Nessuna modifica all'architettura.

## 1. "Esegui ora" (giro forzato)
Il modulo cloud non può lanciare direttamente l'agente locale: arma un flag, l'agente lo raccoglie al tick successivo (entro l'ora, o subito con `schtasks /Run`).

- **DB:** `agente_config` + colonna `forza_giro boolean not null default false`.
- **Endpoint admin:** `POST /api/admin/agente/esegui-ora` (`requireAdmin`) → `update agente_config set forza_giro = true`. Ritorna `{ ok: true }`.
- **Tick (`/api/agente/tick`):** carica anche `forza_giro`; `eseguiOra = forza_giro || decideEsecuzione(...)`. Se `forza_giro` era true: nel patch metti `forza_giro = false` (**one-shot**) e `ultima_rivendicazione_giorno = oggi`. Il flag **bypassa** giorni/ora e il "una volta al giorno", ma **rispetta `dry_run`** (in Prova fa solo il report).
- **Logica pura:** `decideEsecuzione` invariata; l'OR con `forza_giro` e l'azzeramento li fa la route tick (sono I/O sullo stato). Test: il tick con `forza_giro=true` ritorna `eseguiOra=true` e azzera il flag.
- **UI:** pulsante **"Esegui ora"** nella card Stato → `POST /api/admin/agente/esegui-ora` → messaggio "Giro armato: parte al prossimo contatto dell'agente (entro l'ora, o lancialo a mano)". Disabilitato durante la chiamata.

## 2. Campo `saracinesca` (dato per riga, mappabile)
La saracinesca/valvola la registra l'operatore con **due chiavi** diverse (due template): `sostituzione_valvola` e `sost_valvola`. Si espone come **un solo** campo `saracinesca` = primo non vuoto tra le due. (L'**allineamento** dei due nomi + backfill è **fuori scope**, spec separata.)

- **Endpoint export** (`buildRigaLimMassive` + route):
  - La route già costruisce la mappa `intervento_id → risposte` per leggere il sigillo. Estendere la lettura a `sostituzione_valvola`/`sost_valvola` e passare a `buildRigaLimMassive` un `saracinesca` = primo non vuoto fra i due (trim).
  - `RigaLimMassive`/`RigaDb` guadagnano **`saracinesca: string`** (additivo, come `sigillo`). I test esistenti restano; aggiungerne per `saracinesca`.
- **Campi mappabili:** aggiungere `'saracinesca'` a `CAMPI_MAPPABILI` (in `lib/agente/decisione.ts`). Resta **off di default** (campo extra). `validaMappatura` lo accetta senza modifiche (è nella lista).
- **Agente (`eseguiGiro`):** nel `valoreCampo`, `case 'saracinesca' → l.saracinesca`. Scrittura **prudente** (cella vuota → scrivi; valore diverso → conflitto nel feedback), su righe pianificate **e** extra, come gli altri campi.
- **UI:** nessun lavoro extra — l'editor mappa itera già `CAMPI_MAPPABILI` (via `mappaturaCompleta`), quindi `Saracinesca` compare da solo tra i campi; l'utente lo abilita e sceglie la colonna `saracinesca` dal menu dei nomi rilevati.

## Migration (la lancia l'utente)
`supabase/migrations/20260617000000_agente_forza_giro.sql`:
```sql
alter table agente_config add column if not exists forza_giro boolean not null default false;
```
(`saracinesca` non richiede DDL: è solo lettura da `risposte` + un campo mappa.)

## Testing
- **Pure:** `buildRigaLimMassive` con `saracinesca` (coalesce delle due chiavi). (`decideEsecuzione` invariata; il forza_giro è testato a livello tick — verifica manuale curl.)
- **Agente:** e2e `eseguiGiro` scrive `saracinesca` quando la regola è abilitata e mappata su una colonna; rispetta la policy prudente.
- **Endpoint:** verifica manuale via curl (esegui-ora → `forza_giro` true; tick successivo → `eseguiOra=true` + flag azzerato; export → la riga contiene `saracinesca`).
- **UI:** smoke — pulsante "Esegui ora" + `Saracinesca` nell'editor mappa.
- Baseline rossa: gate **mirati** sui file del WP.

## Fuori scope (spec separata, da fare dopo)
- **Allineamento template** `sost_valvola`/`sostituzione_valvola` a un nome unico + **backfill** `rapportino_voci.risposte` (migrazione jsonb "senza perdita", con verifica dei riferimenti: form operatore, PDF, estrazioni). Non necessario per scrivere la saracinesca nel file (il coalesce basta).
