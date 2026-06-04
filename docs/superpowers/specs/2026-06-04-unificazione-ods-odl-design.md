# Unificazione ODS / ODL / ODSIN → identificativo unico `odl` ("ODS/ODL")

- **Data:** 2026-06-04
- **Stato:** Design approvato — pronto per il piano
- **Approccio scelto:** A — converge sul nome interno `odl` (già usato dall'import e da `interventi`), etichetta utente "ODS/ODL". Nessuna rinomina di `interventi.odl`.

## 1. Contesto e problema

L'utente segnala: **nel rapportino Excel manca il collegamento alla colonna ODS/ODL dell'import**.

La diagnosi (lettura del codice in ogni livello) mostra che ODS/ODL e ODSIN sono trattati come **due identificativi distinti e incoerenti**, e che il valore ODS/ODL dell'import non raggiunge mai una colonna dell'export rapportino:

| Livello | File | ODS/ODL | ODSIN |
|---|---|---|---|
| Import (parser) | `utils/routing/excelParser.ts:73-77,250-259` | legge `odl` (header "ODL"/"CODICE ODL") | `odsin` = estratto `200\d{8}` da ODSIN/CODICE/Id |
| Tipo `Task` | `utils/routing/types.ts:3-4` | `odl: string` (obbligatorio) | `odsin?` |
| Tabella `interventi` | `supabase/migrations/20260602000000_interventi_acea.sql:14` | `odl` — commento "Ordinativo di Lavoro / ODS" | — |
| `Task`→voce | `utils/rapportini/buildVoci.ts:15-24` | **non copiato** (solo in `raw_json`) | `odsin` |
| Tabella `rapportino_voci` | `supabase/migrations/20260502000000_rapportini_interattivi.sql:41` | nessuna colonna | `odsin text` |
| Catalogo campi-info | `utils/rapportini/infoCampi.ts:1-24` | nessuna chiave `odl`/`ods` | `odsin` (label "ODSIN") |
| Export Live (server) | `lib/rapportini/exportStandard.ts:92` | impossibile (colonne = campi-info) | rende ODSIN |

**Causa radice:** l'identificativo canonico del committente (campo `odl`, documentato "Ordinativo di Lavoro / ODS") arriva dall'import ma:
1. `taskToVoce` copia `task.odsin` e **non** `task.odl`;
2. il catalogo campi-info non ha la chiave `odl`, quindi l'export dinamico **non può** produrre quella colonna;
3. l'unico campo correlato mostrato (`odsin`) è un *altro* valore (estrazione `200\d{8}`), spesso **vuoto**.

Ulteriore gap: il parser **non riconosce** un'intestazione chiamata solo **"ODS"** (`excelParser.ts:76-77` riconosce solo `ODL`/`CODICE ODL`/`ODSIN`/`CODICE`/`Id`).

**Decisione dell'utente:** ODL, ODS e ODSIN sono **la stessa cosa** → uniformare tutto il progetto all'ODS/ODL dell'import, **inclusa la rinomina della colonna DB**.

## 2. Obiettivi / Non-obiettivi

### Obiettivi
- Un **unico** identificativo in tutto il progetto: nome interno `odl`, etichetta utente **"ODS/ODL"**.
- L'export Excel del rapportino-live (`lib/rapportini/exportStandard.ts`) mostra l'ODS/ODL **reale** dell'import.
- **Nessuna perdita di dato**: il valore `odl` si popola dal **primo non-vuoto** tra colonna *ODL* e colonna *ODS/ODSIN/CODICE/Id* del file importato (oggi sono campi separati).
- Il parser riconosce anche l'header **"ODS"**.
- Rinomina della colonna `rapportino_voci.odsin → odl` + migrazione dei JSON di snapshot/template.
- Retrocompatibilità: template e rapportini già salvati continuano a rendere (alias di lettura + migrazione dati).

### Non-obiettivi
- **Non** si rinomina `interventi.odl` (è già il nome canonico; rinominarlo trascinerebbe indici `interventi_dedup_idx`/`interventi_odl_idx`/`interventi_piano_odl_idx` e ~30 lettori interventi/torre/mappa/KPI: rischio sproporzionato e contrario a "uniformare all'import").
- Nessun cambiamento al significato dei dati committente, alle regole di assegnazione o all'Allegato 10 oltre alla sola etichetta.
- Nessuna modifica al layout/colonne dell'export oltre alla colonna ODS/ODL e alla sua etichetta.

## 3. Decisione: nome canonico `odl`

`odl` è già il nome usato da `Task.odl` (obbligatorio) e da `interventi.odl`. "Uniformare all'import" significa convergere su quel nome. L'etichetta visibile diventa **"ODS/ODL"**. Il concetto separato `odsin` (estrazione `200\d{8}`) viene **assorbito**: resta solo come *normalizzatore interno* del valore `odl`, non come campo distinto.

## 4. Flusso dati target

```
Excel import → parseExcelToTasks → Task.odl   (unico identificativo)
   ├─ ramo interventi:  taskToIntervento / import route → interventi.odl   (INVARIATO)
   └─ ramo rapportino:  taskToVoce → rapportino_voci.odl → export → colonna "ODS/ODL"
```

## 5. Modello dati — migrazione SQL (eseguita dall'utente)

Nuovo file `supabase/migrations/20260604000000_unifica_ods_odl.sql`.

> Il Supabase MCP **non** è il DB di produzione: questa SQL la lancia l'utente (o via deploy). Vedi §7 per l'ordine.

### Strategia di default: **two-phase** (zero-downtime)

**Fase 1 — prima del deploy** (entrambe le colonne coesistono; il codice vecchio continua a leggere `odsin`):
```sql
-- 1a) nuova colonna + backfill
alter table rapportino_voci add column if not exists odl text;
update rapportino_voci set odl = odsin where odl is null and odsin is not null;

-- 1b) migra i JSON campi-info: chiave odsin→odl; etichetta "ODSIN"→"ODS/ODL"
--     (mantiene etichette personalizzate diverse da "ODSIN")
update rapportino_template t
set info_campi = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(t.info_campi) e)
where t.info_campi @> '[{"chiave":"odsin"}]';

update rapportini r
set info_snapshot = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(r.info_snapshot) e)
where r.info_snapshot @> '[{"chiave":"odsin"}]';
```

**Fase 2 — push del codice** (legge/scrive `rapportino_voci.odl`; ha alias di lettura per i casi residui).

**Fase 3 — dopo deploy stabile** (rieseguire il backfill copre eventuali voci scritte nella finestra):
```sql
update rapportino_voci set odl = odsin where odl is null and odsin is not null;
alter table rapportino_voci drop column if exists odsin;
```

### Alternativa: rename diretto (breve finestra)
Accettabile vista la natura interna/mono-tenant dell'app: `alter table rapportino_voci rename column odsin to odl;` + i due `update ... jsonb_agg`, applicati **insieme** al push. Da usare solo se si tollera una finestra di pochi secondi in cui codice e schema potrebbero non coincidere.

## 6. Modifiche per componente

### a) Parser import — `utils/routing/excelParser.ts`, `utils/routing/types.ts`
- `Task`: rimuovi `odsin?`; resta `odl: string` come unico identificativo.
- `detectFormat`: aggiungi `/^ods$/` ai pattern dell'identificativo; continua a rilevare *due* indici candidati (colonna tipo-ODL e colonna tipo-ODS/ODSIN/CODICE/Id) usati per il merge.
- Estrazione riga (oggi righe 249-259): produci **un solo** `odl` = primo non-vuoto tra `[colonna ODL grezza, colonna ODS/ODSIN/CODICE grezza, extractOdsin(...) come fallback normalizzato, PDR]`. `extractOdsin` resta come helper interno (normalizza il `200\d{8}` quando il campo contiene testo extra), non come campo separato.

### b) Task→voce — `utils/rapportini/buildVoci.ts`
- `VoceSnapshot.odsin → odl`; `taskToVoce` imposta `odl: task.odl`.

### c) Catalogo campi-info — `utils/rapportini/infoCampi.ts`
- `InfoChiave`: `'odsin' → 'odl'`.
- `INFO_CAMPI_DISPONIBILI`: `{ chiave: 'odl', etichettaDefault: 'ODS/ODL' }`.
- `resolveInfoCampi`: **alias legacy** — una chiave `'odsin'` in input viene normalizzata a `'odl'` (così snapshot non ancora migrati rendono comunque). `CHIAVI_NOTE` include `'odl'`.

### d) Lettori/scrittori voce (DB `odl`)
Sostituisci `odsin → odl` in select/insert/tipi; dove si legge `raw_json` usa fallback `raw.odl ?? raw.odsin`:
- `lib/rapportini/exportStandard.ts` (`RapportinoVoce.odsin`)
- `app/r/[token]/page.tsx` (select + tipo + map)
- `app/hub/rapportini/eseguiti/page.tsx`, `app/hub/rapportini/contenuto/[id]/page.tsx` (select)
- `app/api/mappa/rapportini/export/route.ts` (lista colonne)
- `app/api/r/[token]/voce/route.ts`, `app/api/mappa/rapportini/genera/route.ts`, `app/api/interventi/risincronizza/route.ts` (raw_json + write voce)
- `app/api/admin/rapportino-template/route.ts` (lista chiavi consentite → `odl`, accetta `odsin` come alias)
- `scripts/sync-esiti-rapportini.ts` (select + uso)

### e) Link voce↔intervento — `lib/interventi/voceInterventoLink.ts`
- Rimuovi il parametro `odsin` da `VoceLinkKey`; `get(byOdl, s, voce.odl)`.

### f) Altri consumer del Task
- `lib/interventi/taskToIntervento.ts:39`: `odl: task.odl` (il merge è ora nel parser, niente più `|| task.odsin`).
- `utils/routing/manualAssignments.ts:37`: regola "ODS" su `task.odl`.

### g) UI / etichette
- `components/modules/rapportini/RapportinoForm.tsx` (`odsin → odl`, label).
- `components/modules/mappa/ManualTaskModal.tsx` (campo + label "ODSIN" → "ODS/ODL").
- `components/modules/mappa/MappaOperatoriClient.tsx` (map `odsin`, header "ODSIN").
- Altri generatori Excel (sola etichetta header "ODSIN" → "ODS/ODL"): `app/hub/rapportini/massiva/page.tsx:682`, `app/hub/rapportini/clientela/page.tsx:187,215`.

## 7. Compatibilità e ordine di deploy
- **Alias di lettura** in `resolveInfoCampi` (chiave `odsin`) e su `raw_json` (`raw.odl ?? raw.odsin`): il codice nuovo è retro-compatibile coi dati non ancora migrati.
- Con **two-phase** non c'è finestra di rottura. Col rename diretto, la SQL va applicata insieme al push.
- L'export e i lettori selezionano la colonna fisica `odl`: con two-phase la colonna esiste già dalla Fase 1.

## 8. Test
Aggiorna gli ~8 file di test toccati + aggiungi casi nuovi:
- `excelParser.test.ts`: `odl` ricavato da header **"ODS"**; **merge** colonna ODL + colonna CODICE/ODSIN (primo non-vuoto).
- `buildVoci.test.ts`, `infoCampi.test.ts` (incl. **alias `odsin`→`odl`**), `exportStandard.test.ts` (header "ODS/ODL"), `voceInterventoLink.test.ts`, `taskToIntervento.test.ts`, `manualAssignments.test.ts`.

**Gate di verifica:** `npm run test` verde · `npx tsc -p tsconfig.json` pulito · nessun nuovo errore eslint sui file toccati (`npx eslint <file>`).

## 9. Rischi e mitigazioni
- **Snapshot/template non migrati** → alias di lettura `odsin`→`odl` + `update` jsonb in Fase 1.
- **Voci scritte nella finestra di deploy** (two-phase) → ri-backfill in Fase 3 prima del `drop`.
- **Perdita del valore per formati con ODS in colonna CODICE** → il merge nel parser usa entrambe le sorgenti.
- **`tsconfig.tsbuildinfo`** non va committato; usare `git add` dei soli file elencati (mai `git add -A`).

## 10. Riepilogo file toccati
Codice: `utils/routing/{excelParser,types,manualAssignments}.ts`, `utils/rapportini/{buildVoci,infoCampi}.ts`, `lib/rapportini/exportStandard.ts`, `lib/interventi/{voceInterventoLink,taskToIntervento}.ts`, `app/r/[token]/page.tsx`, `app/hub/rapportini/{eseguiti,contenuto/[id],massiva,clientela}/page.tsx`, `app/api/mappa/rapportini/{export,genera}/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/api/interventi/risincronizza/route.ts`, `app/api/admin/rapportino-template/route.ts`, `scripts/sync-esiti-rapportini.ts`, `components/modules/rapportini/RapportinoForm.tsx`, `components/modules/mappa/{ManualTaskModal,MappaOperatoriClient}.tsx`.
SQL: `supabase/migrations/20260604000000_unifica_ods_odl.sql`.
Test: i ~8 `*.test.ts` elencati in §8.
