# Live + Lista attesa — Design

**Data:** 2026-06-09
**Stato:** approvato in brainstorming, in attesa di revisione spec
**Branch:** `feat/live-e-lista-attesa`

## Contesto e problema

La **Torre di controllo** (`/hub/torre`, admin) oggi fa due cose insieme:

1. **Board del giorno** — operatori (colonna filtro), mappa colorata e "Dettaglio lavori", live via `useInterventiFeed`. Filtra per `data = giorno selezionato` (selettore in alto, default oggi).
2. **Ordini manuali** — `CodaRichiesteManuali` (richieste `in_attesa` da approvare/rifiutare) e `RegistroAutorizzazioni` (storico con filtri ed export).

Indagine sul sintomo "interventi di ieri visibili oggi": **la regola di lettura è corretta**. La board filtra `.eq('data', data)` su tutti i percorsi — SSR ([app/hub/torre/page.tsx:47](../../../app/hub/torre/page.tsx)), API `/api/interventi/giorno` ([:43](../../../app/api/interventi/giorno/route.ts)), realtime `filter: data=eq.${data}` ([useInterventiFeed.ts:93](../../../lib/interventi/useInterventiFeed.ts)) — e la colonna è `data date not null`. Anche tutte le scritture derivano la `data` da una scelta esplicita (import/piano/rapportino), mai da `new Date()`. Un eventuale "arretrato" ha quindi `data` **odierna** nel DB (creato così a monte), non è un errore di filtro. Su questa base si rimodella il modulo, senza toccare la logica delle date.

## Obiettivi

1. Rinominare la Torre in **Live**, inclusa la rotta (`/hub/live`), focalizzata sugli interventi del giorno.
2. Limitare la navigazione del Live a **oggi … oggi−7 giorni** (niente futuro); storico più profondo solo via export.
3. Aggiungere **export Excel** con range Dal/Al libero, che **rispetta i filtri attivi** (operatore, territorio, stato).
4. Creare il modulo **Lista attesa** (`/hub/lista-attesa`) con coda + storico degli ordini manuali.

## Non-obiettivi (YAGNI)

- Nessuna nuova colonna data: "pianificazione" ed "esecuzione" restano la stessa `data`.
- Nessun roll-over/archiviazione automatica degli arretrati.
- Nessuna modifica al flusso di creazione/approvazione degli ordini manuali.
- Nessuna migrazione dei permessi salvati negli utenti (gli admin ottengono i moduli d'ufficio).
- Nessun cambiamento allo schema del database.

## Decisioni dal brainstorming

| Tema | Decisione |
|---|---|
| Date Live | Una sola `data`; Live mostra `data = giorno`. Nessun cambio DB. |
| Selettore data | Mantenuto, ma limitato a **oggi … oggi−7**; niente date future. |
| Contenuto Lista attesa | Coda (in attesa) **+** storico (registro autorizzazioni). |
| URL | Rinomina completa `/hub/torre` → `/hub/live` + redirect dal vecchio path. |
| Export | Range **Dal/Al** + **rispetta i filtri attivi** (operatore/territorio/stato). |
| Rinomina interna | `TorreControlloClient` → `LiveClient`; `torreView.ts` **invariato** (vista generica, usata anche dalla mappa di monitoraggio). |
| Icone | Nuove icone per `live` e `lista-attesa` (modificabili in seguito). |
| Redirect | Permanente. |

## Architettura

### 1. Rinomina Torre → Live

- **`lib/moduleAccess.ts`**: il modulo `torre` diventa `key: 'live'`, `href: '/hub/live'`, `label: 'Live'`, `description: 'Interventi del giorno in tempo reale'`, `matchPrefixes: ['/hub/live']`, resta `adminOnly: true`. Aggiornare il type `AppModuleKey` (`'torre'` → `'live'`) e la lista hardcoded in `normalizeAllowedModules` (sostituire `'torre'` con `'live'`, aggiungere `'lista-attesa'`).
- **`components/layout/moduleIcons.tsx`**: rinominare la chiave `torre` → `live` con una nuova icona a tema "segnale live".
- **Rotta**: rinominare la cartella `app/hub/torre/` → `app/hub/live/`. `<h1>` "Torre di controllo" → "Live".
- **Redirect**: nuovo `app/hub/torre/page.tsx` minimale che fa `redirect('/hub/live')` (preserva i preferiti già salvati).
- **Riferimenti**: aggiornare il `router.push('/hub/torre?...')` del selettore ([TorreControlloClient.tsx:134](../../../components/modules/torre/TorreControlloClient.tsx)) → `/hub/live`, il link/label nella dashboard ([app/hub/page.tsx:152](../../../app/hub/page.tsx)) → `/hub/live` + "Live".
- **Componente**: `components/modules/torre/TorreControlloClient.tsx` → `components/modules/live/LiveClient.tsx` (rinomina file + simbolo). `torreView.ts` e `torreView.test.ts` restano dove sono.

### 2. Live = solo board del giorno

- In `app/hub/live/page.tsx` rimuovere `<CodaRichiesteManuali>` e `<RegistroAutorizzazioni>` e il caricamento dati che serviva **solo** a loro: template `solo_manuale`, `campiPerCommittente`, `adminNomi`, `infoCampi`. Restano: caricamento interventi del giorno (paginato), territori, operatori validi, e il render di `<LiveClient>`.
- La logica di feed/filtro/raggruppamento resta **invariata**.

### 3. Finestra di navigazione: oggi … oggi−7

- **Client** (`LiveClient`): l'`<input type="date">` riceve `min = oggi−7` e `max = oggi` (calcolati in fuso Europe/Rome). L'utente non può selezionare fuori finestra.
- **Server** (`app/hub/live/page.tsx`): calcolare `oggi = oggiRoma()` e `minData = addDaysIso(oggi, -7)` (`lib/dashboard/addDaysIso.ts`, UTC-safe). Se `searchParams.data` è una data valida ma **fuori** da `[minData, oggi]` (o nel futuro), usare `oggi` (clamp). Così un link manomesso o un preferito vecchio non apre giorni fuori finestra.
- Oltre la settimana: **solo** export Excel (sezione 4).

### 4. Export Excel del Live

- **UI** (`LiveClient`): pulsante **"Esporta Excel"** nell'header, accanto a Risincronizza/Rigenera. Apre un mini-form (popover/modale) con due campi data **Dal/Al** (range libero, nessun limite di profondità) e un pulsante "Scarica". Alla conferma chiama il nuovo endpoint passando il range **e i filtri attivi correnti** (`selStaff`, `selTerr`, `filtroStato`).
- **Endpoint**: `GET /api/interventi/export` (admin). Contratto:

  | Param | Tipo | Note |
  |---|---|---|
  | `from` | `YYYY-MM-DD` | obbligatorio |
  | `to` | `YYYY-MM-DD` | obbligatorio, `>= from` |
  | `staff` | string | opzionale: id operatore, oppure `__na__` (non assegnati) |
  | `territorio` | string | opzionale: id territorio |
  | `stato` | enum | opzionale: `tutti` \| `ok` \| `ko` \| `attesa` (default `tutti`) |

  - **Filtri**: `data` in `[from, to]`, più `territorio_id`/`staff_id` in SQL (come `filtraInterventi`); il filtro `stato` riusa la funzione pura `coloreStato` applicata in memoria (`ok` = completato+`eseguito_positivo`; `ko` = completato+altro esito; `attesa` = `assegnato`; `tutti` = nessun filtro).
  - **Output**: file `.xlsx` generato con **`exceljs`** (pattern come [app/api/admin/rapportini/export-intervalli/route.ts](../../../app/api/admin/rapportini/export-intervalli/route.ts)), `Content-Disposition: attachment; filename="live_<from>_<to>.xlsx"`. Una riga per intervento; mappa `staff_id → display_name` caricata da `staff`.
  - **Colonne**: Data · Operatore · Stato · Esito · Motivo · ODL · Nominativo · PDR · Matricola · Indirizzo · Comune · CAP · Attività · Fascia oraria · Chiuso il (orario Europe/Rome).
  - **Paginazione**: stesso schema delle altre query interventi (loop a pagine da 1000) per non perdere righe su range lunghi.

### 5. Nuovo modulo Lista attesa

- **`lib/moduleAccess.ts`**: nuovo modulo `key: 'lista-attesa'`, `href: '/hub/lista-attesa'`, `label: 'Lista attesa'`, `description: 'Ordini manuali degli operatori'`, `section: 'modules'`, `adminOnly: true`. Aggiunto a `normalizeAllowedModules` (lista admin) e a `AppModuleKey`. Nuova icona in `moduleIcons.tsx`.
- **Componenti**: spostare `CodaRichiesteManuali`, `RegistroAutorizzazioni` e `PannelloRevisioneRichiesta` da `components/modules/torre/` → `components/modules/lista-attesa/`, aggiornando gli import.
- **Pagina** `app/hub/lista-attesa/page.tsx`: porta qui il caricamento dati manuali oggi presente nella torre (template `solo_manuale`, `campiPerCommittente`, `infoCampi`, `adminNomi`). Render: coda (in attesa) in cima, registro/storico sotto. Guard admin come la pagina attuale.
- **Campanello topbar** ([CampanelloRichieste.tsx:11](../../../components/layout/CampanelloRichieste.tsx)): `href` → `/hub/lista-attesa` (la coda ora vive lì).

### 6. Permessi e navigazione

- Gli admin ricevono `live` e `lista-attesa` d'ufficio da `normalizeAllowedModules`, quindi i valori `allowedModules` già salvati (`'torre'`) diventano irrilevanti: **nessuna migrazione**. Entrambi i moduli `adminOnly`.
- Il middleware (`canAccessPathFromMetadata`) continua a funzionare: `/hub/live` e `/hub/lista-attesa` sono coperti dai rispettivi `matchPrefixes` e dalla regola adminOnly.

## File toccati (mappa)

**Modificati**
- `lib/moduleAccess.ts` — modulo `live` + nuovo modulo `lista-attesa` + `normalizeAllowedModules` + `AppModuleKey`.
- `components/layout/moduleIcons.tsx` — icone `live`, `lista-attesa`.
- `components/layout/CampanelloRichieste.tsx` — href → `/hub/lista-attesa`.
- `app/hub/page.tsx` — link dashboard → `/hub/live` + label.

**Rinominati/spostati**
- `app/hub/torre/page.tsx` → `app/hub/live/page.tsx` (snellito) + stub redirect in `app/hub/torre/page.tsx`.
- `components/modules/torre/TorreControlloClient.tsx` → `components/modules/live/LiveClient.tsx`.
- `components/modules/torre/{CodaRichiesteManuali,RegistroAutorizzazioni,PannelloRevisioneRichiesta}.tsx` → `components/modules/lista-attesa/`.

**Nuovi**
- `app/hub/lista-attesa/page.tsx`.
- `app/api/interventi/export/route.ts`.
- componente mini-form export (es. `components/modules/live/EsportaExcelButton.tsx`).

**Invariati (riuso)**
- `lib/interventi/torreView.ts` + test, `lib/interventi/useInterventiFeed.ts`, logica ordini manuali e relative API.

## Testing

- `torreView.test.ts`: resta valido (logica invariata).
- **Nuovi unit test**:
  - clamp finestra 7 giorni: data dentro/ai bordi/fuori/futuro → risultato atteso (funzione pura estratta, es. `clampDataLive(data, oggi)`).
  - mappatura filtro `stato` → predicato `coloreStato` per l'export (`ok`/`ko`/`attesa`/`tutti`).
- **Verifica manuale**: navigazione menu (Live, Lista attesa), redirect `/hub/torre` → `/hub/live`, selettore bloccato oltre 7 giorni, export con e senza filtri, campanello → Lista attesa, coda/registro funzionanti nel nuovo modulo.
- Gate: `npx eslint` sui file toccati pulito; build ok.

## Rischi e note

- **Riferimenti residui a `torre`**: dopo la rinomina, fare una verifica globale (`/hub/torre`, `modules/torre`, `'torre'`) per non lasciare import rotti.
- **Icone**: SVG placeholder ragionevoli in prima battuta; rifinibili.
- **Export su range ampi**: la paginazione evita il limite 1000 di PostgREST; il filtro `stato` in memoria opera sulle sole righe già ristrette per data/territorio/operatore.
