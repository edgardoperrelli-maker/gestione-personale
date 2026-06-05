# Coordinate committente nel rapportino (apri Maps sul punto esatto) — Design

**Data:** 2026-06-05
**Branch proposto:** `feat/coordinate-committente-rapportino` (da `main`)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Alcuni committenti forniscono nel file di lavorazione le **coordinate GPS** del punto (più precise del geocoding dell'indirizzo). Vogliamo:

1. **Leggerle in automatico** dal file all'import, riconoscendole dall'intestazione: due colonne `Lat` + `Long` (come nel file ZAGAROLO) **oppure** una cella unica (`coordinate`, `lat,lng`, es. `41.853674, 12.788878`).
2. Esporle come nuovo campo anagrafico **COORDINATE**, attivabile dalle *Impostazioni → Template rapportini* come gli altri campi.
3. Renderle visibili nell'anagrafica del rapportino e **cliccabili** dal personale per aprire Maps sul **punto esatto**. In aggiunta, l'**indirizzo** diventa sempre cliccabile (ricerca su Maps).

Ambito: parser Excel condiviso (`utils/routing/`), campi info rapportino (`utils/rapportini/`), vista operatore (`components/modules/rapportini/`), vista ufficio + export. Nessuna nuova dipendenza (regola #3 `AGENTS.md`). Nessuna modifica alla logica di business non necessaria.

## 2. Decisioni di prodotto (confermate)

- **Origine coordinate:** import del file committente, **auto-riconoscimento da intestazione**. Nessun inserimento manuale, nessun file dedicato.
- **Le coordinate sono "una cosa a parte".** L'import continua a usare **sempre l'indirizzo** per geocoding, routing e mappa. La coordinata del committente **non** sostituisce l'indirizzo e **non** entra nella logica mappa/routing né in `interventi.lat/lng`. È un dato separato, usato **solo** per il campo COORDINATE e il pulsante "apri Maps".
- **Campo vuoto se non fornito.** Se il file non porta coordinate per quella riga, il campo COORDINATE resta **vuoto** — mai coordinate stimate dal geocoding. ⇒ va tracciata la **fonte**: la coordinata committente è un valore distinto dalle `lat/lng` geocodificate.
- **Cliccabile:** coordinata (punto esatto) **+** indirizzo (ricerca su Maps).
- **Link Maps universale:** `https://www.google.com/maps/search/?api=1&query=<lat,lng | indirizzo>` (apre l'app su Android/iPhone, il sito su PC).
- **Nessuna migration** sul DB prod: la coordinata committente viaggia nel `raw_json` della voce (riuso del pattern già usato per il badge NUOVO).

## 3. Stato attuale (cosa c'è già e cosa manca)

- `Task` ha già `lat?` / `lng?` ([utils/routing/types.ts:11](../../../utils/routing/types.ts)). Oggi sono riempiti dal **geocoding dell'indirizzo** nella mappa e usati per routing/clustering; viaggiano nel `raw_json` della voce (`taskToVoce` salva l'intero task — [utils/rapportini/buildVoci.ts:15](../../../utils/rapportini/buildVoci.ts)). **Questi restano invariati** (indirizzo → geocoding → routing).
- `parseExcelToTasks` ([utils/routing/excelParser.ts:222](../../../utils/routing/excelParser.ts)) **ignora** del tutto le colonne Lat/Long, anche quando presenti. → da estendere.
- Il rapportino digitale mostra l'indirizzo come **solo testo** non cliccabile ([components/modules/rapportini/VoceFocus.tsx:70](../../../components/modules/rapportini/VoceFocus.tsx)). → da rendere link + aggiungere il punto esatto.
- I campi anagrafici selezionabili sono 11, fissi ([utils/rapportini/infoCampi.ts:12](../../../utils/rapportini/infoCampi.ts)); il template editor li elenca da `INFO_CAMPI_DISPONIBILI`. → aggiungere il 12°.
- Voci generate da `op.tasks` (flusso mappa) in `genera` ([app/api/mappa/rapportini/genera/route.ts:136](../../../app/api/mappa/rapportini/genera/route.ts)); `raw_json` preservato/spread alla rigenerazione ([:157](../../../app/api/mappa/rapportini/genera/route.ts)).

## 4. Architettura

### 4.1 Parsing coordinata (puro, testabile) — nuovo `utils/routing/parseCoordinate.ts`

Funzione senza React/IO, unit-testabile. Accetta numeri (cella numerica, es. ZAGAROLO) o stringhe (cella testo, anche con **virgola decimale** all'italiana):

```ts
// Restituisce la stringa normalizzata "lat, lng" (sempre col PUNTO) oppure null se non valida.
parseCoordinate(input: { lat?: unknown; lng?: unknown; single?: unknown }): string | null
```

Normalizzazione numero (`toNum`): se è già `number` → usato così com'è; se è stringa → `trim`, **virgola → punto** per il decimale, poi `parseFloat`. L'output è **sempre col punto**, subito utilizzabile nell'URL Maps.

- **Due colonne** (`lat`, `lng`): ogni cella è **un solo numero** ⇒ `,`→`.` è sempre sicuro. Valida i range (`lat ∈ [-90,90]`, `lng ∈ [-180,180]`), formatta `"<lat>, <lng>"`. Copre ZAGAROLO (celle già numeriche) e i file con virgola decimale.
- **Cella unica** (`single`): individua i due numeri usando come **separatore** `;`, lo spazio, oppure `, ` (virgola+spazio); su ciascun pezzo applica `,`→`.`. Es.: `41,853674; 12,788878` → `41.853674, 12.788878`; `41.853674, 12.788878` → invariato.
- **Unico caso ambiguo:** cella unica in cui la virgola è **insieme** separatore decimale e unico delimitatore, senza spazi né `;` (`41,853674,12,788878`) → non distinguibile senza indovinare ⇒ `null` (campo vuoto), per non rischiare un punto sbagliato.
- Scarta `0,0`, vuoto, testo (`N/A`), valori fuori range → `null` (⇒ campo vuoto).

### 4.2 Cattura nell'excelParser — `utils/routing/excelParser.ts`

- `ColMap` + `detectFormat`: aggiungere `lat`, `lng`, `coordinate` (indici opzionali, `number | null`).
  - Riconoscimento da header (`findCol`, già esistente): `lat` → `/^lat(itudine)?$/`; `lng` → `/^long(itudine)?$/`, `/^lon$/`, `/^lng$/`; cella unica → `/^coordinate?$/`, `/^coordinate gps$/`, `/^lat[\s,;]*l(on|ng)/`.
  - Vale per il ramo "Export Dati / Geocall" (header leggibili — ZAGAROLO cade qui, ha `INDIRIZZO`/`Località`); per ATTGIORN/MASSIVA (indici fissi) si tenta comunque `findCol` sugli header, senza indici fissi se assenti.
- In `parseExcelToTasks`, per ogni riga: `task.coordinate = parseCoordinate({ lat: row[colMap.lat], lng: row[colMap.lng], single: row[colMap.coordinate] })` (solo se le colonne esistono). **NON** toccare `task.lat`/`task.lng` (restano per il geocoding indirizzo).

### 4.3 Tipi e modello (nessuna migration)

- `Task`: aggiungere `coordinate?: string` ([utils/routing/types.ts](../../../utils/routing/types.ts)).
- `taskToVoce`: nessuna modifica necessaria — `raw_json` = task, quindi `coordinate` è già nel `raw_json` della voce. (Opzionale: esplicitarlo per chiarezza.)
- `InfoChiave`: aggiungere `'coordinate'`; `INFO_CAMPI_DISPONIBILI`: aggiungere `{ chiave: 'coordinate', etichettaDefault: 'COORDINATE' }` ([utils/rapportini/infoCampi.ts:1](../../../utils/rapportini/infoCampi.ts)). Così `resolveInfoCampi`/`CHIAVI_NOTE` lo accettano e il template editor lo mostra in automatico. **Non** va in `INFO_PRIMARI` (resta nei dettagli/colonne).
- `valoreInfo(voce, 'coordinate')` legge `voce.coordinate`. Poiché non è una colonna DB, i loader iniettano `coordinate` dal `raw_json` quando mappano le righe a oggetti voce (helper `coordinateFromRaw(raw_json)`), in:
  - operatore: [app/r/[token]/page.tsx](../../../app/r/[token]/page.tsx) (già seleziona `raw_json`);
  - ufficio: [app/hub/rapportini/contenuto/[id]/page.tsx](../../../app/hub/rapportini/contenuto/[id]/page.tsx);
  - Excel: [app/api/mappa/rapportini/export/route.ts](../../../app/api/mappa/rapportini/export/route.ts) (aggiungere `raw_json` al select se assente).
- Tipi voce client (`Voce` in `RapportinoForm`/`buildVoci`): aggiungere `coordinate?: string`.

### 4.4 Link Maps (puro, testabile) — nuovo `utils/rapportini/mapsLink.ts`

```ts
mapsUrlFromCoordinate(coord: string): string   // .../search/?api=1&query=41.8536,12.7888
mapsUrlFromAddress(via?, comune?, cap?): string // .../search/?api=1&query=<encodeURIComponent>
```

### 4.5 Rendering

- **Operatore — `VoceFocus.tsx`:**
  - L'indirizzo (riga [:70](../../../components/modules/rapportini/VoceFocus.tsx)) diventa un `<a>` verso `mapsUrlFromAddress(...)` (`target="_blank" rel="noopener noreferrer"`), sempre attivo quando c'è indirizzo.
  - Se il campo `coordinate` è **attivo nel template** (presente in `dettaglio`) **e** `voce.coordinate` è valorizzata: mostrare sotto l'indirizzo un'azione evidente "Punto esatto" → `mapsUrlFromCoordinate(voce.coordinate)`. Resta visibile anche come riga nei "Dettagli anagrafici" (valore cliccabile).
- **Ufficio — `contenuto/[id]/page.tsx`:** la colonna COORDINATE (quando attiva) mostra `lat, lng` come link Maps.
- **Excel — `lib/rapportini/exportStandard.ts`:** la colonna COORDINATE (in ordine col template, come gli altri info) mostra `lat, lng`; valore come **hyperlink** ExcelJS verso l'URL Maps (cella vuota se assente).
- **Lista operatore (`RapportinoLista.tsx`):** fuori scope il dettaglio per riga; eventuale pin è rinviato (YAGNI).

### 4.6 Template editor — `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

Nessuna modifica logica attesa: la lista dei campi info è derivata da `INFO_CAMPI_DISPONIBILI`. **Verifica:** che non ci sia un conteggio/array hardcoded a 11; in tal caso allinearlo.

## 5. File toccati (riepilogo)

```
Nuovi:
  utils/routing/parseCoordinate.ts            (+ parseCoordinate.test.ts)
  utils/rapportini/mapsLink.ts                (+ mapsLink.test.ts)
Modificati:
  utils/routing/types.ts                      (Task.coordinate?)
  utils/routing/excelParser.ts                (detect + cattura coordinate; lat/lng intatti)
  utils/rapportini/infoCampi.ts               (InfoChiave + INFO_CAMPI_DISPONIBILI: 'coordinate')
  utils/rapportini/buildVoci.ts               (Voce/VoceSnapshot: coordinate?)
  components/modules/rapportini/VoceFocus.tsx (indirizzo link + punto esatto)
  app/r/[token]/page.tsx                       (inietta coordinate da raw_json)
  app/hub/rapportini/contenuto/[id]/page.tsx   (colonna COORDINATE cliccabile + inietta da raw_json)
  app/api/mappa/rapportini/export/route.ts     (select raw_json se assente + inietta)
  lib/rapportini/exportStandard.ts             (colonna COORDINATE come hyperlink)
  (verifica) app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
```

Non toccati: `app/api/interventi/import/route.ts` (NON popola coordinate su `interventi` — coordinate "a parte"), logica geocoding/mappa/routing, `app/api/mappa/rapportini/genera/route.ts` (il `raw_json` porta già `coordinate`).

## 6. Test

**Automatici (vitest):**
- `utils/routing/parseCoordinate.test.ts`: due colonne numeriche ok; due colonne con **virgola decimale** (`41,853674` / `12,788878`) → punto; cella unica `41.853674, 12.788878` ok; cella unica con virgola decimale + `;`/spazio ok; cella unica solo-virgole senza spazi (`41,8…,12,7…`) → null; fuori range → null; `0,0`/vuoto/`N/A` → null.
- `utils/rapportini/mapsLink.test.ts`: URL coordinata corretto; indirizzo con `encodeURIComponent`; campi mancanti.
- (se utile) test mirato su `detectFormat`/`parseExcelToTasks` con header `Lat`/`Long` su una riga in stile ZAGAROLO → `task.coordinate` valorizzata e `task.lat/lng` **non** impostati dal file.

**Verifiche locali pre-push:** `npm run build`/typecheck; `npx eslint` **sui soli file toccati** (baseline lint già rossa — vedi memoria progetto).

**Manuali (anteprima Vercel):**
1. Import (mappa) di un file con `Lat`/`Long` (ZAGAROLO) → attiva COORDINATE nel template → genera rapportino → la voce mostra `lat, lng`, click apre Maps sul punto esatto; l'indirizzo apre Maps in ricerca.
2. Import di un file **senza** coordinate → campo COORDINATE **vuoto**; indirizzo comunque cliccabile.
3. Verifica che mappa/routing usino sempre l'indirizzo (coordinate del file non alterano il percorso).
4. Export Excel: colonna COORDINATE presente con hyperlink; vuota dove mancano.

## 7. Casi limite e sicurezza

- **Coordinate presenti ma campo non attivo nel template:** non mostrate (rispetta il template). L'indirizzo resta cliccabile (indipendente).
- **Coordinata non valida nel file:** `parseCoordinate` → null → campo vuoto.
- **Rapportini già generati prima della feature:** nessun `coordinate` in `raw_json` → campo vuoto, nessuna regressione.
- **Rigenerazione voci:** `coordinate` deriva dal task corrente della mappa (persistito in `mappa_piani_operatori.tasks`). **Verifica** che il salvataggio piano non scarti campi sconosciuti del task (salva l'intero oggetto tasks).
- **Sicurezza link:** `target="_blank"` sempre con `rel="noopener noreferrer"`.

## 8. Fuori scope

- Uso delle coordinate committente per geocoding/routing/mappa o per `interventi.lat/lng` (escluso esplicitamente dall'utente).
- Inserimento/modifica manuale delle coordinate (solo da import).
- Colonna coordinate nella lista interventi `InterventiAssegnabili` (legge `interventi`, richiederebbe migration).
- Solo il sotto-caso ambiguo della cella unica (virgola sia decimale sia unico separatore, senza spazi) resta non gestito; scelta tra Google/Apple/Waze (link universale unico).

## 9. Rollout sicuro

1. Sviluppo su `feat/coordinate-committente-rapportino` (da `main`).
2. Verifiche locali (build/lint/test sui file toccati).
3. `git push` → Vercel crea l'URL di anteprima HTTPS (solo con ok esplicito utente, vedi memoria).
4. Test end-to-end dall'anteprima con un file reale del committente.
5. Solo dopo OK utente: merge ff in `main` → deploy → elimina branch.
