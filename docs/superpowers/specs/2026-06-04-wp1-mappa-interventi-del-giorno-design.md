# WP1 — Mappa: "Interventi del giorno" (la mappa legge dal DB)

> Spec di design. Metodo: brainstorming → **spec (questo file)** → writing-plans → subagent-driven-development.
> Riferimento handoff: `docs/superpowers/roadmap-handoff.md` (sezione WP1). Regole comuni e gate: vedi quel file.

## 1. Contesto e obiettivo

La pipeline interventi (import → geocoding → lista → assegnazione → agenda "Fatto/Non fatto" → torre realtime) è completa. Il ponte **mappa → interventi (scrittura)** esiste già (`ensureInterventiForPiano`, `planInterventiForPiano`, `taskToIntervento`). Manca il verso **mappa ← interventi (lettura)**.

**Obiettivo.** La pagina Mappa deve poter caricare gli interventi geocodificati del giorno dalla tabella `interventi` (alternativa all'upload Excel) e, dopo la distribuzione tra operatori, riscrivere l'assegnazione sugli interventi — riusando stati, transizioni e generazione del token agenda **identici** alla pipeline esistente. Chiude il cerchio mappa↔interventi.

**Decisione architetturale (già presa a monte).** Pipeline **unica**: l'import è l'unico ingresso; la mappa legge gli interventi del giorno dal DB invece di ricaricare l'Excel.

## 2. Vincoli e ownership

- **File NUOVI (zero collisione, sviluppati per primi):**
  - `app/api/interventi/da-pianificare/route.ts` — GET sorgente.
  - `lib/interventi/mappaInterventi.ts` (+ `mappaInterventi.test.ts`) — helper puri.
  - `app/api/interventi/distribuzione/route.ts` — POST sink.
- **File CALDO (owner unico, modificato per ULTIMO):** `components/modules/mappa/MappaOperatoriClient.tsx`.
  - Branch attivi sulla mappa: `feat/assegnazioni-manuali-mappa`, `feat/link-rapportini-editor-mappa`. **`git fetch` + rebase su `main`** subito prima di editare il file caldo.
- **Niente migration:** le tabelle (`interventi`, `agenda_token`) esistono già.
- **Gate prima di chiudere:** `npx tsc -p tsconfig.json` verde · `npm run lint` verde · `npm run test` verde.
- **Git:** branch `feat/wp1-mappa-interventi-del-giorno`; `git add` SOLO i file del WP (mai `-A`); a fine WP merge ff in `main` locale + push (lo lancia l'utente) + elimina branch. Footer commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 3. Decisioni di design

### 3.1 Scostamenti dal contratto letterale (giustificati)

1. **`createRouteHandlerClient` invece di `createServerComponentClient`.** Il contratto cita `createServerComponentClient` per le letture RLS, ma quello è l'helper per i Server Component. In una **Route Handler** la convenzione del repo (vedi `lib/apiAuth.ts`, `app/api/interventi/riconsegna/sync/route.ts`) è `createRouteHandlerClient({ cookies })` di `@supabase/auth-helpers-nextjs`. L'intento ("lettura con RLS, non service-role") è rispettato.
2. **Scrittura di `ordine`.** Il flusso esistente `app/api/interventi/assegna/route.ts` **non** scrive `ordine`. Il WP1 lo richiede esplicitamente nel payload di distribuzione: il POST `distribuzione` scrive anche `ordine`. È l'unica differenza funzionale rispetto al pattern `assegna`.

### 3.2 Tipizzazione della riga DB (scelta confermata: estende `InterventoRow`)

`InterventoRow` (`lib/interventi/interventiView.ts:58`, file caldo di WP3c) ha solo 10 campi e **non** include `lat`/`lng`/`cap`/`pdr`/`matricola`/`attività`/`data` — insufficiente per costruire un `Task` e per filtrare i geocodificati.

**Scelta:** definire in `lib/interventi/mappaInterventi.ts` un tipo dedicato che **estende** `InterventoRow` (import in sola lettura, `interventiView.ts` NON viene toccato):

```ts
import type { InterventoRow } from '@/lib/interventi/interventiView';

export type InterventoGeoRow = InterventoRow & {
  lat: number | null;
  lng: number | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  codice_servizio: string | null;
  richiede_due_operatori: boolean | null;
  data: string;
};
```

`InterventoRow` fornisce già: `id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id`.

## 4. Componenti

### 4.1 `GET /api/interventi/da-pianificare`

**Scopo.** Sorgente: ritorna gli interventi geocodificati del giorno come `Task[]`, nella forma identica a `parseExcelToTasks`, così che il codice di distribuzione esistente funzioni senza modifiche.

**Firma / contratto.**
- Query string: `?data=YYYY-MM-DD&committente=acea`.
  - `data`: **obbligatoria**, validata con regex `^\d{4}-\d{2}-\d{2}$`. Mancante/invalida → `400`.
  - `committente`: opzionale, **default `'acea'`**, ammessi `'acea' | 'italgas' | 'altro'`; assente o non valido → fallback a `'acea'` (nessun `400` sul committente).
- Auth: guard `requireUser()` da `@/lib/apiAuth` → `401` se non autenticato.
- Lettura RLS: `createRouteHandlerClient({ cookies })` (pattern `apiAuth.ts`). **Non** `supabaseAdmin` (la lettura passa per RLS).
- `export const runtime = 'nodejs';`.

**Query.** `from('interventi').select(<colonne InterventoGeoRow>)` con filtri:
- `.eq('data', data)`
- `.eq('committente', committente)`
- `.not('lat', 'is', null)` e `.not('lng', 'is', null)` (solo geocodificati)
- `.in('stato', ['da_assegnare', 'assegnato'])`

Colonne selezionate (stringa esplicita): `id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria, staff_id, lat, lng, cap, pdr, matricola_contatore, intervento_tipo, codice_servizio, richiede_due_operatori, data`.

**Risposta.** `200` → `{ interventi: Task[] }` mappando ogni riga con `mapInterventoToTask`. Errore query → `500` `{ error }`.

**Edge case.** Zero righe → `{ interventi: [] }` (la mappa mostrerà "nessun intervento da pianificare").

### 4.2 `lib/interventi/mappaInterventi.ts` — helper puri

Nessun I/O. Copertura vitest in `mappaInterventi.test.ts`.

**`mapInterventoToTask(row: InterventoGeoRow): Task`**

Mapping (coerente con l'inverso di `lib/interventi/taskToIntervento.ts`):

| Campo `Task`           | Fonte `InterventoGeoRow`              | Note |
|------------------------|---------------------------------------|------|
| `id`                   | `row.id`                              | UUID intervento → diventa `intervento_id` nel sink |
| `odl`                  | `row.odl ?? ''`                       | |
| `pdr`                  | `row.pdr ?? undefined`                | |
| `indirizzo`            | `row.indirizzo ?? ''`                 | |
| `cap`                  | `row.cap ?? ''`                       | |
| `citta`                | `row.comune ?? ''`                    | `comune → citta` |
| `priorita`             | `0`                                   | nessuna colonna DB; default come nel parser Excel |
| `fascia_oraria`        | `row.fascia_oraria ?? ''`             | |
| `lat`                  | `row.lat ?? undefined`                | |
| `lng`                  | `row.lng ?? undefined`                | |
| `requiresTwoOperators` | `row.richiede_due_operatori ?? undefined` | |
| `nominativo`           | `row.nominativo ?? undefined`         | |
| `matricola`            | `row.matricola_contatore ?? undefined`| |
| `attivita`             | `row.intervento_tipo ?? undefined`    | |
| `codice`               | `row.codice_servizio ?? undefined`    | |
| `odsin`,`recapito`,`accessibilita`,`isAppointment`,`appointmentId`,`appointmentDate` | — | `undefined` (non presenti nel DB / non rilevanti per la distribuzione) |

**`buildDistribuzionePayload(piano)`**

- Input minimale e testabile: `Array<{ staffId: string; tasks: Array<{ id: string }> }>`. Compatibile strutturalmente con `DistEntry[]` del componente mappa (che ha `staffId` e `tasks: Task[]`).
- Output: `{ intervento_id: string; staff_id: string; ordine: number }[]`.
- Regola: per ogni entry, per ogni task in posizione `i` (0-based nell'array) → `{ intervento_id: task.id, staff_id: entry.staffId, ordine: i + 1 }`. **`ordine` 1-based per operatore.** Flatten su tutte le entry.
- Lista vuota → `[]`.

**Tipo `InterventoGeoRow`**: esportato (vedi §3.2).

### 4.3 `POST /api/interventi/distribuzione`

**Scopo.** Sink: applica la distribuzione mappa→interventi riusando la logica pura `pianificaAssegnazione()` e `generaAgendaToken()`, con scrittura `supabaseAdmin`. Replica fedele di `app/api/interventi/assegna/route.ts:42-82`, con in più `ordine`.

**Firma / contratto.**
- Auth: guard `requireUser()` → `401`.
- `export const runtime = 'nodejs';`.
- Body JSON: `{ data: string; assegnazioni: { intervento_id: string; staff_id: string; ordine: number }[] }`.
  - Validazione: `data` regex `^\d{4}-\d{2}-\d{2}$`; `assegnazioni` array non vuoto; ogni elemento con `intervento_id` e `staff_id` stringhe non vuote, `ordine` number. Body invalido / `assegnazioni` vuoto → `400`.

**Algoritmo.**
1. `ids = assegnazioni.map(a => a.intervento_id)`.
2. Carica stati correnti: `supabaseAdmin.from('interventi').select('id, stato').in('id', ids)`. Costruisci `Map<id, stato>`.
3. Per ogni `a` in `assegnazioni`:
   - `info = byId.get(a.intervento_id)`; se assente → `scartati.push({ id, errore: 'Intervento non trovato' })`, continua.
   - `esito = pianificaAssegnazione(info.stato, a.staff_id)`; se `!esito.ok` → `scartati.push({ id, errore: esito.errore })`, continua.
   - Costruisci `update`:
     - `staff_id = patch.staff_id`, `stato = patch.stato`, **`ordine = a.ordine`**.
     - `assegnatoAt === 'set'` → `assegnato_at = new Date().toISOString()`; `=== 'clear'` → `assegnato_at = null`; `'keep'` → non scritto.
     - `azzeraAvvio` → `iniziato_at = null`, `chiuso_at = null`.
   - `supabaseAdmin.from('interventi').update(update).eq('id', a.intervento_id)`; errore → throw (→ 500). `assegnati++`. Raccogli `staff_id` in `staffCoinvolti` (Set).
4. Token agenda: per ogni `staff_id` in `staffCoinvolti`, riga `{ staff_id, data, token: generaAgendaToken() }`; `supabaseAdmin.from('agenda_token').upsert(rows, { onConflict: 'staff_id,data', ignoreDuplicates: true })`. Errore → throw (→ 500). `data` è quella del body (un solo giorno per richiesta).
5. Risposta `200` → `{ assegnati, scartati }` (stessa forma di `assegna`).

**Nota stati.** Poiché ogni assegnazione porta uno `staff_id` valorizzato, `pianificaAssegnazione` restituisce sempre `stato='assegnato'` per gli stati non terminali; `completato`/`annullato` finiscono in `scartati` (non riassegnabili) — comportamento identico alla pipeline.

### 4.4 Edit `MappaOperatoriClient.tsx` (ULTIMO)

**Pre-requisito:** `git fetch` + rebase del branch su `main`.

- **Nuovo stato:** `const [sorgente, setSorgente] = useState<'excel' | 'interventi'>('excel');`.
- **Upload Excel** (`handleFileChange`): impostare `setSorgente('excel')` (comportamento attuale invariato).
- **`clearExcel`:** reset `setSorgente('excel')` insieme agli altri reset esistenti.
- **Nuovo handler `caricaInterventiDelGiorno()`:**
  - `GET /api/interventi/da-pianificare?data=${planningDate}&committente=acea`.
  - In caso di successo: `setExcelTasks(interventi)`, `setExcelMode(true)`, `setSorgente('interventi')`, reset distribuzione (`setDistribution(null)`, `setUnassignedTasks([])`, `setGeocodingProgress(null)`).
  - Gli interventi arrivano **già geocodificati** (lat/lng non null garantiti dal filtro GET) → il pannello distribuzione compare senza ri-geocodifica. **Non** si invoca `buildEsecutorePins` (gli interventi DB non hanno colonna OPERATORE da auto-abbinare: selezione operatori manuale).
  - Gestione errori: messaggio se fetch fallisce; messaggio dedicato se `interventi.length === 0`.
- **UI:** pulsante **"Carica interventi del giorno"** accanto a "Carica Excel" (intorno a riga ~2288), stile coerente (es. `--brand-primary` per distinguerlo dal warning di Excel). Visibile quando `!excelMode`.
- **`saveDistribution`:** branch sulla sorgente:
  ```
  if (sorgente === 'interventi') {
    const assegnazioni = buildDistribuzionePayload(distribution); // distribution: DistEntry[]
    POST /api/interventi/distribuzione  body { data: planningDate, assegnazioni }
    // gestisci { assegnati, scartati }; NIENTE /api/mappa/piani né /api/mappa/piani/interventi
  } else {
    // flusso attuale invariato (POST/PUT /api/mappa/piani + POST /api/mappa/piani/interventi)
  }
  ```

## 5. Data flow complessivo

```
import Excel ─▶ DB interventi (geocoding)
                     │
            GET /api/interventi/da-pianificare
                     ▼
            mappa: Task[] (mapInterventoToTask)
                     ▼
            distribuzione tra operatori (DistEntry[])
                     │  buildDistribuzionePayload
                     ▼
            POST /api/interventi/distribuzione
                     ▼
   DB interventi: staff_id, ordine, stato='assegnato', assegnato_at
        + agenda_token (upsert idempotente per staff/giorno)
                     ▼
            agenda operatore /r/[token]  ─▶  torre realtime
```

## 6. Error handling (riepilogo)

- **GET:** `401` (no sessione) · `400` (`data` mancante/invalida) · `500` (errore query). `committente` assente/non valido → fallback `'acea'`. Zero righe → `200 { interventi: [] }`.
- **POST:** `401` · `400` (body invalido / `assegnazioni` vuoto) · per-intervento `scartati[]` con motivo (`Intervento non trovato`, stato terminale) · `500` (errore di scrittura intervento o token).
- **Mappa:** alert/messaggio su errore fetch; messaggio "nessun intervento da pianificare per il giorno" se lista vuota.

## 7. Testing & gate

- **Unit (vitest)** su `mappaInterventi.ts`:
  - `mapInterventoToTask`: riga completa → tutti i campi mappati (verifica `comune→citta`, `matricola_contatore→matricola`, `intervento_tipo→attivita`, `codice_servizio→codice`, `richiede_due_operatori→requiresTwoOperators`, `priorita===0`); riga con campi `null` → default corretti (`''`, `undefined`).
  - `buildDistribuzionePayload`: più operatori con più task → `ordine` 1-based per operatore, `intervento_id===task.id`, `staff_id` corretto, flatten; lista vuota → `[]`.
- **Route handler ed edit UI:** non unit-testati (coerente con il repo, che copre la logica pura).
- **Gate finale:** `npx tsc -p tsconfig.json` · `npm run lint` · `npm run test` tutti verdi.

## 8. Criteri di accettazione

1. `GET /api/interventi/da-pianificare?data=…&committente=acea` ritorna `Task[]` validi (solo geocodificati, stato `da_assegnare`/`assegnato`).
2. `POST /api/interventi/distribuzione` assegna gli interventi (`staff_id`, `ordine`, `stato='assegnato'`, `assegnato_at`) e genera/garantisce il token agenda idempotente per ogni `(staff_id, data)`.
3. La mappa, in sorgente "interventi", carica gli interventi del giorno, li distribuisce e salva via il nuovo POST (senza toccare `mappa_piani`); in sorgente "excel" il comportamento resta invariato.
4. Gate verdi.

## 9. Ordine di implementazione (per i plan)

1. `lib/interventi/mappaInterventi.ts` + `mappaInterventi.test.ts` (helper puri, TDD).
2. `app/api/interventi/da-pianificare/route.ts` (GET).
3. `app/api/interventi/distribuzione/route.ts` (POST).
4. `git fetch` + rebase su `main`, poi edit `components/modules/mappa/MappaOperatoriClient.tsx`.
5. Gate verdi → merge ff in `main` + push (utente) + elimina branch.
