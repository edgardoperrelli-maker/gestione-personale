# "+" operatore offline-first — niente più pratiche perse

**Data:** 2026-06-16
**Stato:** design approvato (impianto + sequenza a fasi)
**Contesto:** estende la feature rapportini offline (il flusso voce standard è già offline-first; il flusso "+" no).

## Problema

Due bug in produzione sul tasto "+" (interventi manuali / limitazioni massive) fanno **perdere dati di campo** — il cuore del progetto:

1. **Scansione/ricerca matricola offline → vicolo cieco.** `CercaMatricolaLimitazione.cerca` interroga il server (`/api/r/[token]/cerca-limitazione`). Offline il `fetch` fallisce e il pulsante "Inserisci a mano questa matricola" è nascosto dietro lo stato `cercato` (valorizzato solo da una risposta server) → l'operatore resta bloccato senza via d'uscita. (Scansionare una matricola **già assegnata** funziona già offline: è un match locale, `matchVociMatricola`.)

2. **Inserimento manuale "+" offline → pratica persa.** `ModaleInterventoManuale.handleInvia` fa un `fetch` **diretto** a `/api/r/[token]/intervento-manuale`, **senza coda offline**. Offline fallisce → niente è salvato in locale → chiudendo la modale la pratica va rifatta. L'infrastruttura della coda manuale esiste (`PayloadManuale`, ramo `manuale` in `lib/offline/sync.ts`), ma **non è mai stata collegata** alla modale.

3. **Sync poco evidente.** Esiste "Sincronizza ora" (testuale, solo se c'è coda **e** online) + sync automatico. Manca un pulsante prominente 🔄 "due frecce che si rincorrono", premibile a fine giornata.

## Principio guida

Ogni azione del "+" si salva in IndexedDB **subito**. La sincronizzazione è **disaccoppiata**: automatica a intervalli **+** pulsante 🔄 manuale. La modale può essere chiusa/riaperta senza perdere la pratica. Nessun `fetch` "usa-e-getta" che, fallendo, perde dati.

## Scope

- **In scope (Fase 1):** pagina operatore `/r/[token]` → `RapportinoForm` + `ModaleInterventoManuale` + `CercaMatricolaLimitazione`.
- **Fuori scope (Fase 2, follow-up):** cache offline del censimento Acea (`limitazione_misuratori_ref`, 1.429 righe / 640 kB) per autofill offline — vedi sezione dedicata.
- **Fuori scope:** agenda operatore (`/agenda/[token]`, flusso Fatto/Non fatto), draft-autosave della modale a metà compilazione.

---

## Fase 1 — core anti-perdita (questa spec)

### 1. `accodaManuale` — coda offline del "+" (Bug 2)

Nuovo helper `lib/offline/persistManuale.ts`:

```
accodaManuale(token, dati, now) -> Promise<{ richiestaId: string } | null>
  dati: { committente, anagrafica, risposte, note?, fotoFiles: Record<chiave, File> }
```

- Genera `richiestaId = crypto.randomUUID()` (idempotenza lato server; validato da `richiestaIdValido`).
- Per ogni foto in `fotoFiles`: salva il blob in `dbBlob` (nuovo `blobId`), raccoglie `fotoBlobRefs: [{ chiave, blobId }]`.
- Crea l'item outbox `{ type: 'manuale', payload: PayloadManuale }` via `dbOutbox.put`.
- **Best-effort:** tutto in `try/catch`; ritorna `null` se IndexedDB non è disponibile (il chiamante ripiega sul `fetch` online → nessuna regressione).
- **Riusa** il ramo `manuale` di `sync.ts` già esistente (invia FormData a `/intervento-manuale` con `richiestaId` + blob foto; rimuove i blob a invio riuscito).

### 2. `ModaleInterventoManuale` collegata alla coda (Bug 2)

`handleInvia`:
1. Validazioni invariate **prima** dell'accodamento (`campiObbligatoriMancanti`, foto obbligatorie).
2. `const esito = await accodaManuale(token, ...)`.
3. Se `esito` ok → `void sincronizzaToken(token)` (invia subito se online) e chiama `onCreata(stato)` con `stato = online ? 'inviata' : 'in-coda'`.
4. Se `esito === null` (no IndexedDB) → **fallback** al `fetch` diretto attuale.
5. **A prova di crash:** nessuna eccezione arriva alla UI; in caso di problema si mostra il messaggio inline e i dati restano in coda.

`onCreata(stato)` in `RapportinoForm`:
- `'inviata'` → `window.location.reload()` (comportamento attuale, mostra la nuova voce).
- `'in-coda'` → chiude la modale + conferma *"Richiesta salvata. Verrà inviata alla sincronizzazione."* **senza reload** (offline il reload servirebbe la cache vecchia senza la nuova voce; comparirà dopo la sync).

### 3. Scansione matricola: rete di sicurezza offline (Bug 1)

`CercaMatricolaLimitazione.cerca`:
- Il match locale `matchVociMatricola` (matricola già propria) gira **per primo**, come ora → funziona offline.
- Se **offline** (`navigator.onLine === false`): salta il `fetch`, imposta `cercato = true` con `suggerimenti = []` e una nota *"Offline: censimento non disponibile, inserisci a mano."* → il pulsante "Inserisci a mano questa matricola" diventa raggiungibile.
- Se **online ma il `fetch` fallisce** (`catch`): stessa via d'uscita (rivela "Inserisci a mano") invece del solo messaggio d'errore senza azioni.
- Logica di decisione estratta in un helper puro testabile (es. `esitoRicercaOffline(online)` / classificazione dell'esito) per coprirla con unit test (il componente gira in node senza jsdom).

### 4. Pulsante sync 🔄 sempre visibile (richiesta 3)

- Pulsante "due frecce che si rincorrono" **sempre presente** sulla striscia operatore (`OfflineStatusPill` potenziato o nuovo `SyncButton`).
- Mostra il conteggio in coda; **gira** (animazione) durante la sincronizzazione; al tap forza `sincronizzaToken`.
- Premibile **anche** quando la coda risulta vuota (rassicurazione di fine giornata: forza un controllo; no-op se non c'è nulla).
- L'intervallo automatico resta attivo (la richiesta è "sync anche manuale o a intervalli", non "solo manuale").

### Componenti e confini

| Unità | Cosa fa | Dipende da |
|---|---|---|
| `lib/offline/persistManuale.ts` (`accodaManuale`) | salva blob foto + item outbox `manuale` | `dbBlob`, `dbOutbox`, `types` |
| `ModaleInterventoManuale` | accoda invece di fetch diretto; fallback online | `accodaManuale`, `sincronizzaToken` |
| `CercaMatricolaLimitazione` + helper puro | rete di sicurezza offline (no vicolo cieco) | `navigator.onLine` |
| `SyncButton`/`OfflineStatusPill` | sync manuale 🔄 sempre visibile | `useStatoSync` |

### Flusso dati (manuale)

```
ModaleInterventoManuale.handleInvia
  -> accodaManuale -> dbBlob (foto) + dbOutbox(manuale, richiestaId)
  -> sincronizzaToken -> sync.ts ramo 'manuale' -> POST /intervento-manuale (idempotente per richiestaId)
  -> server: crea interventi_manuali (in approvazione) + voce
Offline: l'item resta in dbOutbox finché sync (auto o 🔄). Mai perso.
```

### Gestione errori

- `accodaManuale` in `try/catch` → `null` su fallimento → fallback `fetch` online (no regressione).
- Scansione offline → inserimento a mano sempre raggiungibile (no vicolo cieco).
- Esiti sync (4xx permanenti) → già gestiti da `classificaEsito` + `CassettoDaRisolvere`.

### Testing (Fase 1)

- **Unit:** `accodaManuale` (forma item outbox + `fotoBlobRefs` + `richiestaId` valido); helper puro della decisione scansione offline.
- **e2e (Playwright):** esporre `accodaManuale` nell'harness → accoda manuale offline → coda contiene l'item → torna online → sync → POST a `/intervento-manuale`. (Estende `e2e/offline.spec.ts`.)
- **Verifica reale:** sul deploy Vercel (SW attivo solo in prod): "+" offline → modale conferma "in coda" → 🔄 a connessione tornata → la pratica arriva al backoffice.
- Baseline lint/test del repo già rossa: i gate valgono come "nessun problema nuovo dai file toccati".

---

## Fase 2 — cache censimento offline (follow-up, NON in questa spec)

Per far funzionare offline anche la **ricerca/autofill** del censimento Acea, senza ri-scaricare ogni giorno (il link è giornaliero):

- Endpoint `GET /api/r/[token]/censimento?v=<versione>` → proiezione snella (matricola + anagrafica per autofill) + `versione` (es. `count` + `max(updated_at)`); risponde `{ unchanged: true }` se la versione del client coincide.
- Store IndexedDB `dbCensimento` con **chiave stabile** (non il token) `{ versione, righe, scaricatoIl }`.
- All'apertura (online): micro-controllo di versione → ri-scarica **solo se cambiato**. Riuso cross-giorno → consumo minimo.
- `CercaMatricolaLimitazione` offline: lookup nella cache → autofill come online. L'avviso "assegnata ad altro operatore" (stato del giorno, non nel censimento) offline diventa *"da verificare alla sincronizzazione"*.

Dimensione confermata: 1.429 righe / 640 kB tabella → proiezione gzippata poche decine di kB.

## Rischi / note

- **`onCreata` reload offline:** evitato (vedi §2) — altrimenti servirebbe cache vecchia senza la nuova voce.
- **Visibilità immediata del manuale offline:** offline la nuova voce non compare finché non si sincronizza; accettabile (è "inviata in approvazione", non più editabile). Eventuale elenco "manuali in coda" è fuori scope.
- **Sessioni concorrenti git:** rebase su `origin/main` prima di ogni push; `RapportinoForm`/`page.tsx` sono toccati da più sessioni.
