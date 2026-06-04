# WP2a — Motore tempi (durate + fasce-finestre + ETA)

> Spec di design. Metodo: brainstorming → **spec (questo file)** → writing-plans → subagent-driven-development.
> WP2a è il primo sotto-progetto di **WP2 — Fase 3: ottimizzazione tempi** (vedi `docs/superpowers/roadmap-handoff.md`), decomposto in: **WP2a** (questo, motore tempi), WP2b (squadre a 2 operatori), WP2c (assenze), WP2d (competenze/abilitazioni). Regole comuni e gate: vedi il roadmap.

## 1. Contesto e obiettivo

L'optimizer (`utils/routing/optimizer.ts`) oggi è puramente geografico: `nearestNeighbor` + `twoOpt`. `optimizeRouteByFascia` raggruppa i task per inizio-fascia (parsing `HH:MM`) ma **non** conosce le durate, non tratta le fasce come finestre temporali e non calcola un orario stimato di arrivo (ETA). Il flag `requiresTwoOperators` è ignorato (rimandato a WP2b).

**Gap della durata (eredità di WP1):** il tipo `Task` (`utils/routing/types.ts`) non porta la durata. La colonna `durata_stimata_min` esiste sulla tabella `interventi` ma non fluisce: né `mapInterventoToTask` (WP1) né `parseExcelToTasks` la popolano.

**Obiettivo WP2a.** Dare all'optimizer un **motore tempi**: portare la durata nel `Task`, trattare le fasce come **finestre orarie**, e calcolare un **ETA per tappa** accumulando viaggio + durata lungo il giro. Comportamento **soft**: si ordina best-effort e si **segnala** (flag `inRitardo`) chi sfora la propria finestra; non si forza alcun riordino impossibile. Tutta la logica del motore è **pura e testabile** (vitest).

## 2. Scope

**In scope (WP2a):**
- `Task.durata_min` + popolamento da DB (`durata_stimata_min`) e da Excel (colonna "Tempo Esecuzione"), con default.
- Nuovo modulo puro `utils/routing/timeEngine.ts`: `parseFasciaWindow`, `computeSchedule`.
- `optimizeRouteByFascia` esteso per produrre lo `schedule` (ETA + flag ritardo) accanto all'ordinamento.
- `RouteResult.schedule` (campo opzionale, non invasivo sui call site esistenti).
- Integrazione mappa (`MappaOperatoriClient.tsx`): passaggio dei parametri all'optimizer, propagazione dello schedule in `DistEntry`, visualizzazione **minimale** di ETA + badge "in ritardo" (primo passo, esplicitamente da raffinare in seguito).

**Fuori scope (rimandati):**
- Ribilanciamento della distribuzione **per tempo** (resta per conteggio/`qty` come oggi).
- Squadre a 2 operatori (`requiresTwoOperators`), assenze, competenze → WP2b/WP2c/WP2d.
- `optimizeRoute` (rotta singola non-fascia) resta puramente geografico: l'ETA serve nel flusso di distribuzione (`optimizeRouteByFascia`).
- Routing stradale reale: si resta su Haversine; il tempo di viaggio è stimato da una velocità media (linea d'aria).
- Tempi reali (`chiuso_at − iniziato_at`) per affinare le stime: futuro.

**Niente migration:** la colonna `durata_stimata_min` esiste già.

## 3. Decisioni di design

- **Finestre soft (confermato dall'utente).** Si ordina best-effort (come oggi, prima le fasce più mattutine), si calcola l'ETA, si segnala `inRitardo` chi arriva oltre la fine finestra. Nessun scarto di interventi, nessun riordino forzato.
- **Parametri (confermati), come costanti configurabili** in cima a `timeEngine.ts`, override-abili via `opts`:
  - `DURATA_DEFAULT_MIN = 30` — durata usata quando `task.durata_min` è assente.
  - `VELOCITA_MEDIA_KMH = 25` — per stimare il tempo di viaggio dalla distanza Haversine (linea d'aria; compensa che la strada reale è più lunga).
  - `ORARIO_INIZIO_MIN = 480` — inizio giornata, 08:00 in minuti da mezzanotte.
- **ETA = orario di arrivo** alla tappa, in **minuti da mezzanotte** (la UI formatta `HH:MM`). Non si modella l'attesa se si arriva prima dell'inizio finestra (l'operatore può arrivare in anticipo); è un raffinamento futuro.
- **`inRitardo`** = la finestra ha un limite superiore e l'arrivo lo supera.
- **Output non invasivo:** l'ETA/ritardo vivono in `RouteResult.schedule` (parallelo a `orderedTasks` per `taskId`), **non** come campi sul tipo `Task` (che resta il modello di input, non di output).
- **Retro-compatibilità:** il nuovo parametro `opts` di `optimizeRouteByFascia` è opzionale; senza di esso il comportamento è quello attuale **più** lo schedule calcolato con i default. I call site di `optimizeRoute` non cambiano.

## 4. Componenti e tipi

### 4.1 Durata nel `Task` (`utils/routing/types.ts`)
Aggiungere a `Task`:
```ts
durata_min?: number; // durata stimata dell'intervento in minuti
```
Aggiungere a `RouteResult`:
```ts
schedule?: ScheduleEntry[]; // ETA per tappa, allineato per taskId a orderedTasks
```

### 4.2 Tipi del motore (`utils/routing/timeEngine.ts`)
```ts
export type FasciaWindow = { startMin: number; endMin: number | null };
export type ScheduleEntry = { taskId: string; etaMin: number; inRitardo: boolean };
export type ScheduleOpts = {
  startMin?: number;       // default ORARIO_INIZIO_MIN (480 = 08:00)
  speedKmh?: number;       // default VELOCITA_MEDIA_KMH (25)
  durataDefaultMin?: number; // default DURATA_DEFAULT_MIN (30)
};
```

### 4.3 `parseFasciaWindow(s: string | null | undefined): FasciaWindow | null`
Pura. Estrae la finestra in minuti da mezzanotte dai formati reali:
| Input | Output |
|---|---|
| `"08:00-12:00"` | `{ startMin: 480, endMin: 720 }` |
| `"8-12"` (ore intere) | `{ startMin: 480, endMin: 720 }` |
| `"08:00"` (solo inizio) | `{ startMin: 480, endMin: null }` |
| `"9:30"` | `{ startMin: 570, endMin: null }` |
| `""` / `null` / non parsabile | `null` |

Regole: accetta separatori `-`/`–`; ore con o senza minuti (`8` → `08:00`); se manca la fine, `endMin = null` (nessun vincolo superiore → mai in ritardo, ma la finestra ordina comunque).

### 4.4 `computeSchedule(orderedTasks, base, opts?): ScheduleEntry[]`
Pura. Accumula l'orario lungo la sequenza **già ordinata**:
- `arrivo_0 = startMin + viaggio(base → task0)`; se `base` è null, `arrivo_0 = startMin` (parte dalla prima tappa).
- `arrivo_i = arrivo_{i-1} + durata(task_{i-1}) + viaggio(task_{i-1} → task_i)`.
- `viaggio(a→b)` minuti = `haversine(a,b) / speedKmh * 60`; se mancano coordinate, 0.
- `durata(t)` = `t.durata_min ?? durataDefaultMin`.
- Per ogni task: `etaMin = round(arrivo_i)`, `inRitardo = win != null && win.endMin != null && arrivo_i > win.endMin` (con `win = parseFasciaWindow(t.fascia_oraria)`).
- Ritorna un `ScheduleEntry` per ogni task in `orderedTasks` (stesso ordine; `taskId = t.id`).

### 4.5 `optimizeRouteByFascia(tasks, base?, opts?)` (`utils/routing/optimizer.ts`)
Invariato fino al passo 5; poi: `schedule = computeSchedule(allOrdered, base, opts)` e lo include nel `RouteResult`. Firma estesa con `opts?: ScheduleOpts` (opzionale).

### 4.6 Popolamento durata
- `lib/interventi/mappaInterventi.ts` (WP1, mio): aggiungere `durata_stimata_min: number | null` a `InterventoGeoRow`; in `mapInterventoToTask` → `durata_min: row.durata_stimata_min ?? undefined`.
- `app/api/interventi/da-pianificare/route.ts` (WP1, mio): aggiungere `durata_stimata_min` alla lista `COLONNE`.
- `utils/routing/excelParser.ts`: se è presente una colonna durata ("Tempo Esecuzione"/"Tempo"/"Durata"), popolare `task.durata_min` (intero minuti); altrimenti lasciare `undefined`. Nessuna modifica alla logica dei 3 formati oltre a questa estrazione additiva.

### 4.7 Integrazione mappa (`components/modules/mappa/MappaOperatoriClient.tsx`, file caldo, per ULTIMO)
- `distributeToOps`/`moveTask`/`assignUnassignedTask`: invocano `optimizeRouteByFascia(grp, base, opts)` (con `opts` di default — le costanti). Lo `schedule` risultante viene salvato nel `DistEntry`.
- `DistEntry`: aggiungere `schedule?: ScheduleEntry[]`.
- UI (minimale, primo passo): accanto a ogni tappa di un operatore mostra l'ETA (`HH:MM`, da `etaMin`) e, se `inRitardo`, un piccolo badge "in ritardo" (stile `--warning` esistente). Nessun ridisegno della lista: solo aggiunta dell'informazione.

## 5. Error handling / edge case
- `tasks` vuoto → `RouteResult` vuoto con `schedule: []`.
- Task senza coordinate → viaggio 0 verso/da esso (coerente con `calculateTotalDistance` attuale); resta nello schedule con l'ETA accumulato.
- Fascia assente/non parsabile → `win = null` → mai `inRitardo` (ma il task resta nel bucket "Infinity" come oggi).
- `durata_min` assente → `durataDefaultMin`.
- `speedKmh <= 0` → trattato come default (evita divisione per zero).

## 6. Testing (vitest, logica pura)
- `parseFasciaWindow`: tutti i formati della tabella §4.3 + separatore `–`, spazi, input sporchi.
- `computeSchedule`:
  - tappa singola con base → ETA = inizio + viaggio;
  - multi-tappa → ETA cumulativo corretto (viaggio + durata);
  - durata mancante → usa default 30;
  - finestra rispettata → `inRitardo=false`; finestra sforata → `inRitardo=true`; finestra senza fine (`endMin=null`) → `inRitardo=false`;
  - `base` null → parte da startMin;
  - task senza coordinate → nessun NaN, viaggio 0.
- `optimizeRouteByFascia`: il `RouteResult` include uno `schedule` con un entry per task, `taskId` coerente con `orderedTasks`.
- Le Route Handler e l'edit UI non sono unit-testati (coerente col repo).

## 7. File / ownership / gate
- **Nuovi:** `utils/routing/timeEngine.ts`, `utils/routing/timeEngine.test.ts`.
- **Modificati:** `utils/routing/types.ts` (tipo condiviso; modifica solo additiva: campi opzionali), `utils/routing/optimizer.ts` (**file caldo** di WP2 — owner unico per WP2a), `utils/routing/excelParser.ts`, `lib/interventi/mappaInterventi.ts` (mio, WP1), `app/api/interventi/da-pianificare/route.ts` (mio, WP1), `components/modules/mappa/MappaOperatoriClient.tsx` (**file caldo**, per ULTIMO, `git fetch`+rebase su `main` appena prima).
- **Senza conflitto con la sessione concorrente** (`rapportino-mobile-redesign`, che tocca `/r/[token]` e docs): nessuna sovrapposizione di file con WP2a; `MappaOperatoriClient.tsx` non è toccato da quella sessione. Ribasare comunque su `main` prima dell'edit al file caldo.
- **Gate:** `npx tsc -p tsconfig.json` verde · `npm run lint` (nessun **nuovo** problema sui file toccati: la baseline del repo è già rossa, vedi memoria `lint-baseline-rosso`; verificare i file con `npx eslint <path>`) · `npm run test` verde.
- **Git:** branch `feat/wp2a-motore-tempi`; `git add` solo i file del WP; merge ff in `main` + push (utente) + elimina branch. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 8. Criteri di accettazione
1. `Task.durata_min` è popolato dal DB (`da-pianificare`) e dall'Excel (se la colonna esiste); default 30 quando manca.
2. `parseFasciaWindow` e `computeSchedule` sono puri, corretti sui casi §6 e coperti da vitest.
3. `optimizeRouteByFascia` ritorna un `RouteResult` con `schedule` allineato a `orderedTasks`; i call site esistenti continuano a compilare/funzionare.
4. La mappa mostra l'ETA per tappa e segnala gli interventi `inRitardo`.
5. Gate verdi.

## 9. Ordine di implementazione (per i plan)
1. `utils/routing/types.ts`: `Task.durata_min`, `RouteResult.schedule` + tipi (compila, nessun comportamento).
2. `utils/routing/timeEngine.ts` + `.test.ts` (TDD: `parseFasciaWindow`, poi `computeSchedule`).
3. `utils/routing/optimizer.ts`: `optimizeRouteByFascia` usa `computeSchedule`.
4. Popolamento durata: `mappaInterventi.ts` + `da-pianificare/route.ts` (mio) + `excelParser.ts`.
5. `git fetch` + rebase su `main`, poi `MappaOperatoriClient.tsx` (opts all'optimizer, schedule in `DistEntry`, UI ETA+badge).
6. Gate verdi → merge ff in `main` + push (utente) + elimina branch.
