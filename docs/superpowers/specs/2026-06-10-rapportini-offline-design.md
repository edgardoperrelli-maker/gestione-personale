# Rapportini offline (PWA operatore) — Design

**Data:** 2026-06-10
**Stato:** Design approvato in brainstorming, in attesa di review dello spec
**Topic:** Permettere al personale di **consultare** le informazioni del rapportino e **compilarlo** anche senza copertura di rete, salvando in locale sul dispositivo e sincronizzando in silenzio appena la rete torna disponibile. Copre i tre flussi operatore: compilazione rapportino (voci + foto), agenda (Fatto/Non fatto) e nuovo intervento manuale.

---

## 1. Contesto e obiettivo

Le pagine operatore sono pubbliche (accesso via token, senza login) e oggi sono **online-first**:

- `/r/[token]` — compilazione rapportino ([app/r/[token]/page.tsx](../../../app/r/%5Btoken%5D/page.tsx)) è un **Server Component**: voci, info intervento e template sono caricati lato server al momento dell'apertura. **Senza rete la pagina non si apre.**
- Il form [RapportinoForm.tsx](../../../components/modules/rapportini/RapportinoForm.tsx) è client e fa auto-save (debounce 800ms) con `POST /api/r/[token]/voce`. Su errore ha solo retry con backoff **in memoria**: se l'operatore chiude o ricarica, **i dati non salvati si perdono**.
- Foto via `POST /api/r/[token]/foto-campo`; intervento manuale via `POST /api/r/[token]/intervento-manuale`.
- `/agenda/[token]` — agenda giornaliera (Fatto/Non fatto), anch'essa Server Component + `POST /api/agenda/[token]/intervento`.

**Stato offline attuale:** nessuna PWA, nessun service worker, nessun IndexedDB. Solo `localStorage` per il tema.

**Scenario reale:** l'operatore riceve e apre il link del giorno **con copertura** (mattina/deposito), poi va sul cantiere **senza copertura**, deve vedere gli interventi e compilarli, e i dati devono arrivare al server appena la rete torna — senza azioni manuali.

**Obiettivo:** rendere le rotte operatore (`/r/[token]`, `/agenda/[token]`) una piccola PWA che funziona offline. Consultazione e compilazione disponibili senza rete; le modifiche (risposte, foto, fatto/non-fatto, interventi manuali, invio) si accodano in locale e si sincronizzano **in silenzio** al ritorno della connessione.

---

## 2. Decisioni chiave (esito del brainstorming)

| Tema | Decisione |
|------|-----------|
| Robustezza offline | **PWA con service worker**: deve resistere anche a chiusura/riapertura del browser offline (non solo alla scheda aperta). |
| Foto offline | **Sì**: le foto si possono allegare offline; restano in coda e si caricano al ritorno della rete. |
| Perimetro | **Tutti e tre i flussi**: rapportino (voci + foto), agenda (Fatto/Non fatto), nuovo intervento manuale. |
| Installazione | **Nessuna installazione richiesta.** Il link cambia ogni giorno, quindi niente "Aggiungi a Home". L'offline è garantito dal **service worker**, registrato automaticamente alla prima apertura online del giorno (apertura che serve comunque per ricevere il link). |
| Approccio tecnico | **Serwist** (`@serwist/next`, successore mantenuto di `next-pwa`) per generare il SW; pagine operatore **non riscritte** (restano Server Component, il SW serve l'HTML in cache + il form reidrata da IndexedDB). |
| Storage locale | **IndexedDB** (non cookie): regge le foto binarie e i volumi, non viene spedito a ogni richiesta. |
| Trigger sync | In silenzio: evento `online`, ritorno in primo piano, intervallo mentre l'app è aperta, **dopo ogni salvataggio riuscito**, + Background Sync dove supportato (Android). Su iOS la sync parte alla riapertura con rete. |
| Conflitti | "Ultima scrittura vince". L'operatore è l'unico editor del suo token → conflitti praticamente nulli. |
| Modifiche server | Solo **due**, additive e retro-compatibili: `foto-campo` accetta `clientKey`; `intervento-manuale` accetta `richiestaId` dal client (idempotenza). |

---

## 3. Architettura

```
            ┌──────────────────────────── Dispositivo operatore ───────────────────────────┐
            │                                                                               │
   apertura │   Service Worker (Serwist)            IndexedDB  rapportini-offline           │
   con rete │   ┌───────────────────────┐          ┌───────────────────────────────────┐   │
  ─────────▶│   │ precache chunk Next    │          │ snapshot │ lavoro │ outbox │ blob  │   │
            │   │ NetworkFirst /r,/agenda│          └───────────────────────────────────┘   │
            │   │ NetworkFirst GET /api  │                 ▲            │                     │
            │   │ (no /hub, no /api/admin)│                │            ▼                     │
            │   └───────────────────────┘          ┌───────────────────────────────────┐    │
            │            ▲                          │   Motore di sincronizzazione       │    │
            │            │ serve offline            │   (online / focus / intervallo /   │    │
            │   ┌────────┴───────────┐              │    post-save / Background Sync)     │    │
            │   │ Pagine operatore    │◀────reidrata─┤   foto → voce → invia (FIFO)        │    │
            │   │ form + pillola stato│              └───────────────┬───────────────────┘    │
            │   └─────────────────────┘                              │ quando c'è rete         │
            └────────────────────────────────────────────────────────┼────────────────────────┘
                                                                      ▼
                                                       API esistenti (/api/r, /api/agenda)
```

**Confine "app operatore offline":** tutto e solo ciò che sta sotto `/r/[token]` e `/agenda/[token]`. Il resto dell'app (hub admin) **non** viene messo in cache né registra il service worker.

### 3.1 Service Worker (Serwist)

- `next.config.mjs` avvolto con `withSerwist` (la config `headers()` esistente resta invariata; `eslint.ignoreDuringBuilds` già `true`).
- Sorgente SW in `app/sw.ts`, output servito come `/sw.js` (scope `/`).
- **Precache:** chunk statici Next (JS/CSS) → il codice del form gira offline.
- **Runtime caching, limitato per URL:**
  - Navigazione `/r/*` e `/agenda/*` → **NetworkFirst** (fallback cache): online dati freschi, offline l'ultima versione vista.
  - `GET /api/r/[token]` (e simili in sola lettura) → **NetworkFirst**.
  - Icone/asset statici → **CacheFirst**.
- **Pass-through esplicito (nessuna cache):** `/hub/*`, `/api/admin/*`, login, e ogni `POST`/mutazione (le mutazioni passano dal motore di sync, non dal SW). Per gli URL non-operatore il SW fa solo da passacarte verso la rete → online nessun cambiamento di comportamento; offline non serve nulla dell'area admin (corretto).
- **Registrazione:** un piccolo client component monta `register('/sw.js')` **solo sulle pagine operatore**. Gli admin sull'hub non registrano il SW.

### 3.2 `middleware.ts`

Nessuna modifica. Il matcher copre solo `/`, `/login`, `/hub/:path*`, `/dashboard/:path*`, `/impostazioni/:path*`. Le rotte `/r`, `/agenda`, `/sw.js` non passano dal middleware → già pubbliche, nessun rischio di blocco. (Nessun `manifest.json`: senza installazione non serve.)

---

## 4. Magazzino locale (IndexedDB)

Database unico `rapportini-offline`, quattro object store. Wrapper sottile in `lib/offline/db.ts`.

| Store | Chiave | Contenuto | Quando si scrive |
|-------|--------|-----------|------------------|
| `snapshot` | `token` | Pacchetto dati per la consultazione offline: per `/r` → meta rapportino, voci+risposte, `campiSnapshot`, `infoCampi`, `titoloCampi`, `templatesPerCommittente`; per `/agenda` → operatore, data, lista interventi. + `aggiornatoIl` (timestamp). | A ogni apertura **online** della pagina. |
| `lavoro` | `${token}:${voceId}` | Ultime `risposte` locali di una voce (+ `aggiornatoIl`). | A ogni modifica dell'operatore, subito. |
| `outbox` | `mutationId` (UUID client) | Mutazione in attesa: `{ id, type, token, payload, blobRefs?, stato, tentativi, ultimoErrore, createdAt }`. | All'azione dell'operatore (quando non confermata online). |
| `blob` | `blobId` (UUID) | File foto binari in attesa di upload. Cancellati dopo l'upload riuscito. | Allegando una foto offline (o anche online, prima dell'upload). |

**Tipi di `outbox` (`type`):**

| type | payload | note |
|------|---------|------|
| `voce` | `{ voceId, risposte }` | **Coalescente**: una sola voce in coda per `(token,voceId)`, sempre con l'ultima versione delle risposte. |
| `foto` | `{ voceId, chiave, blobId, clientKey }` | All'upload riuscito riscrive il path reale in `lavoro` e segna "sporca" la voce per il salvataggio. |
| `agenda` | `{ interventoId, azione, causale?, motivo? }` | Idempotente lato server. |
| `manuale` | `{ richiestaId, committente, anagrafica, risposte, note, fotoBlobRefs[] }` | `richiestaId` = chiave di idempotenza inviata al server. |
| `invia` | `{}` | Processato **per ultimo**, solo quando non restano altri elementi del token in coda. |

**Reidratazione del form (al mount):** dati base (props del Server Component, serviti dalla cache SW anche offline) → sovrascritti con `lavoro` locale (per voce, "ultima scrittura vince" per timestamp) → accanto a ogni voce lo stato di sincronizzazione.

---

## 5. Motore di sincronizzazione

Modulo `lib/offline/sync.ts`, attivo solo sulle pagine operatore.

**Trigger (tutti silenziosi, nessuna azione richiesta all'operatore):**
- Evento `window 'online'`.
- `visibilitychange` → app torna in primo piano.
- Intervallo (es. 30s) mentre l'app è aperta **ed** è online.
- **Dopo ogni salvataggio riuscito** (realizza il "appena compila il primo intervento sotto copertura, manda anche gli altri").
- **Background Sync API** dove supportato (Android/Chrome) → può partire anche con app in background. **iOS Safari non lo supporta**: lì la sync parte alla riapertura dell'app con rete (momento in cui l'operatore comunque la usa). Limite reale di iOS, documentato.

**Algoritmo (FIFO per `createdAt`, un token alla volta):**
1. Elabora prima gli elementi `foto`: upload del blob (con `clientKey`) → ottiene `path` → riscrive `lavoro[voce].risposte[chiave] = path` → rimuove il blob → aggiorna/forza l'elemento `voce`.
2. Elabora `manuale`: invia con `richiestaId` + foto; se 2xx rimuove blob e item.
3. Elabora `voce`: invia `risposte` (con i path reali ormai risolti).
4. Elabora `agenda`.
5. Elabora `invia` **solo se** non restano altri elementi del token.
- Ogni 2xx rimuove l'elemento dalla coda. Errore di rete → resta in coda, ritenta al trigger successivo (con backoff).
- Errore "definitivo" (vedi §6) → l'elemento passa nel **cassetto da risolvere**, non viene ritentato all'infinito.

---

## 6. Casi limite (mai persi in silenzio)

| Caso | Risposta server | Comportamento |
|------|-----------------|---------------|
| Link scaduto / rapportino già inviato al sync | `409 non_modificabile` (48h o stato inviato) | Elemento → **cassetto da risolvere**: *"Dati non sincronizzati: link scaduto, contatta l'ufficio"*. |
| Agenda, giornata chiusa (sync dopo mezzanotte) | `403` | Cassetto da risolvere: *"Giornata già chiusa"*. |
| Intervento manuale non valido al sync | `422` (anagrafica/foto) | **Pre-validazione lato client** (riuso di [anagraficaValida](../../../lib/interventi/manuali/anagraficaValida.ts) e [validaFotoObbligatorie](../../../lib/interventi/manuali/validaFotoObbligatorie.ts)) prima di accodare → minimizza il caso. Se fallisce comunque: cassetto da risolvere col motivo. |
| Prima apertura del giorno fatta offline (nessuno snapshot in cache) | — | Messaggio gentile *"Serve la connessione la prima volta, oggi"* invece di pagina bianca. |
| Foto pesanti / quota IndexedDB | — | Compressione lato client prima di accodare; errore di quota gestito senza crash, con avviso. |

---

## 7. Modifiche server (minime, additive, retro-compatibili)

| Route | Modifica | Perché |
|------|----------|--------|
| `POST /api/r/[token]/voce` | nessuna | già idempotente (sovrascrive `risposte`). |
| `POST /api/agenda/[token]/intervento` | nessuna | già idempotente (imposta lo stato). |
| `POST /api/r/[token]/foto-campo` | accetta `clientKey` opzionale nella FormData; se presente costruisce il `storagePath` da `clientKey` invece di `randomUUID()`. `upsert:true` già presente. | un re-invio sovrascrive lo **stesso** file → niente foto duplicate in storage. |
| `POST /api/r/[token]/intervento-manuale` | accetta `richiestaId` opzionale (dal client) nei `dati`; se una richiesta con quell'id esiste già, restituisce il risultato esistente senza re-inserire. | evita **interventi manuali duplicati** su re-invio. |

Entrambe retro-compatibili: senza i nuovi campi il comportamento attuale resta identico.

---

## 8. Feedback all'operatore

- **Pillola di stato** in cima alle pagine operatore: `Offline · N in attesa` → `Sincronizzazione…` → `Tutto sincronizzato · agg. HH:MM`.
- **Badge per voce:** estensione di [SaveBadge](../../../components/modules/rapportini/SaveBadge.tsx) con stato `in attesa di rete` (oggi: salvato / in salvataggio / errore).
- **Pulsante "Sincronizza ora"** — scorciatoia manuale (la sync è comunque automatica).
- **Cassetto "da risolvere"** — lista degli elementi bloccati (scaduto/rifiutato) con motivo + "contatta ufficio".

---

## 9. Componenti e file

**Nuovi:**
- `app/sw.ts` — sorgente service worker (Serwist).
- `components/offline/ServiceWorkerRegister.tsx` — registra il SW sulle pagine operatore.
- `components/offline/OfflineStatusPill.tsx` — pillola di stato + "Sincronizza ora".
- `lib/offline/db.ts` — wrapper IndexedDB (i 4 store).
- `lib/offline/outbox.ts` — enqueue/coalesce/list/remove.
- `lib/offline/sync.ts` — motore di sincronizzazione + trigger.
- `lib/offline/snapshot.ts` — salva/legge lo snapshot del token.
- `lib/offline/compressImage.ts` — compressione foto lato client.
- `lib/offline/useOfflineStato.ts` — hook stato sync per la pillola/badge.

**Modificati:**
- `next.config.mjs` — `withSerwist`.
- `components/modules/rapportini/RapportinoForm.tsx` — scrive `lavoro`, accoda invece di POST diretto, reidrata, mostra stato.
- `components/modules/rapportini/SaveBadge.tsx` — stato `queued`.
- `components/modules/rapportini/RapportinoFotoCtx` + relativo upload — foto via outbox/blob offline.
- `components/modules/rapportini/ModaleInterventoManuale.tsx` — accoda intervento manuale offline (con pre-validazione).
- `components/modules/agenda/AgendaOperatoreClient.tsx` — Fatto/Non fatto via outbox + reidratazione.
- `app/api/r/[token]/foto-campo/route.ts` — `clientKey`.
- `app/api/r/[token]/intervento-manuale/route.ts` — `richiestaId` idempotente.

---

## 10. Test

- **Unit (vitest):** coalescing voce in outbox; ordine FIFO; risoluzione foto→path→voce nel motore; pre-validazione manuale; idempotenza server (stesso `richiestaId` → una riga; `clientKey` → path deterministico).
- **E2E (Playwright, offline mode):** apri online → vai offline → compila voce + allega foto → torna online → verifica sync e dati a DB.
- **QA manuale in modalità aereo** su **iPhone e Android** (differenza Background Sync).

---

## 11. Fuori perimetro (YAGNI)

- Nessuna installazione/"Aggiungi a Home" (il link cambia ogni giorno).
- Nessun link permanente per operatore (valutato, scartato per semplicità e per non introdurre una credenziale che non scade).
- Nessuna gestione conflitti multi-editor (l'operatore è l'unico editor del suo token).
- Nessun offline per l'area admin/hub.
