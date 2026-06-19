# Connettore Playwright ACEA — Design

- **Data:** 2026-06-19
- **Stato:** Design (in revisione utente)
- **Autore:** brainstorming Edgardo + Claude
- **Estende:** [[modulo-agente]], [[assegnazione-ai]], [[sync-limitazioni-massive-sharepoint]]

## 1. Contesto e obiettivo

L'agente Node locale (`tools/limitazioni-sync/agente.mjs`) gira **sul PC del lavoro** e segue il
pattern **"app = cervello via tick"**: a ogni esecuzione fa `POST /api/agente/tick` (heartbeat +
snapshot colonne) e **riceve le decisioni** dall'app via la riga singleton `agente_config`
(`eseguiOra` da giorno/ora/claim, più flag one-shot `forza_giro`, `forza_scan`, `pianifica_data`).
Oggi: (1) scrive i master ACEA della cartella `LIMITAZIONI MASSIVE` con i lavori dell'app;
(2) legge le righe pianificabili per l'Assegnazione AI; (3) sincronizza i file su SharePoint.

Manca il pezzo che la roadmap segnava come *"connettore Playwright (bloccato)"*: far **leggere e
scrivere il portale ACEA** in autonomia. L'agente sul PC è il posto giusto perché ha già il browser,
le credenziali e la rete aziendale per parlare con ACEA; Vercel (cloud) non potrebbe mai raggiungere
il portale né il PC dietro NAT/firewall.

L'automazione ha **due fasi**. Questo documento progetta in dettaglio la **Fase 1** e la
**fondazione condivisa del connettore**; la **Fase 2** è solo delineata e avrà una spec propria.

- **Fase 1 — Aggiorna stato ODL da ACEA → master.** Playwright accede ad ACEA, applica filtri fissi,
  lancia la ricerca, esporta, e l'agente riporta lo **stato di ogni ODL** nel master
  `LIMITAZIONI CON ORDINE.xlsx`.
- **Fase 2 — Assegna su ACEA (più avanti).** Dopo che l'utente pianifica a mano sul master, l'app
  importa (come Assegnazione AI), si avanza all'assegnazione, e Playwright **scrive le assegnazioni
  agli operatori** sul portale.

## 2. Vincoli raccolti (decisioni di dominio)

| Tema | Decisione |
|---|---|
| Login ACEA per Playwright | `user + password` salvati **localmente** nel config dell'agente. **Niente OTP** per Playwright (l'OTP del mattino dell'utente non riguarda questo accesso). Login **fresco a ogni sessione**. |
| Sessione | Nessuna sessione da tenere viva tra un giro e l'altro: ogni giro fa login da capo. |
| Estrazione | Sul portale: **imposta filtri fissi → "Cerca" → "Esporta"** → scarica un file. Niente scraping degli stati a video. |
| Filtri | **Sempre gli stessi** → "ricetta" registrata nel config (selettori + valori), modificabile senza ricodificare. |
| Grilletto Fase 1 | **Solo on-demand**: pulsante in `/hub/agente` → flag one-shot → l'agente lo consuma al tick successivo. Nessuna pianificazione automatica. |
| Dove vive il connettore | **Dentro l'agente esistente** (`tools/limitazioni-sync`), nuovo modulo `lib/acea/`. Un processo, un config, un'attività pianificata, un heartbeat. |
| Browser | Default `channel: 'msedge'` (Edge già installato sul PC → **zero download**, aggira policy aziendali); fallback `chromium`. Installazione **senza diritti admin** (pacchetto in `node_modules`, browser in `%USERPROFILE%\AppData\Local\ms-playwright`). |
| Colonna master da scrivere (Fase 1) | **`STATO OPERAZIONE`** su `LIMITAZIONI CON ORDINE.xlsx`. |
| Chiave di match | **`CODICE ODL`** dell'export ↔ colonna ordine del master (alias `ordine` già esistente in `colonne.mjs`). |
| Policy di scrittura stato | **Sovrascrivi-sempre** (`acea.sovrascriviStato: true`): lo stato ACEA è fonte di verità e **cambia nel tempo** (Aperto→Chiuso), quindi NON va trattato come conflitto. Il valore precedente è registrato nel report. |
| Lettura Fase 2 (stesso master) | L'agente legge `data` + `esecutore` (+ ODL/matricola) **riusando il percorso `pianificabili`/Assegnazione AI** già attivo per Zagarolo. |
| Posizione del master | `…/8_LAVORI/DUNNING/2026/LIMITAZIONI CON ORDINE.xlsx` — **cartella diversa** da `LIMITAZIONI MASSIVE`. Il connettore ACEA punta a **questo file specifico** (`acea.masterPath`), separato dalla sync notturna. |
| Dati ACEA | Restano **in locale** (export + master sul PC). L'app riceve solo il grilletto e il **report** (conteggi). |

## 3. Architettura e flusso (Fase 1)

```
Tu in /hub/agente: click "Aggiorna stato ODL da ACEA"
      │  POST /api/admin/agente/acea-stato   (requireAdmin)
      ▼
agente_config.forza_acea_stato = true          ← flag one-shot (come forza_giro)
      │  (prossimo tick: POST /api/agente/tick)
      ▼
tick ritorna { aceaStato: true } e CONSUMA il flag (lo rimette false)
      │
      ▼  l'agente sul PC esegue il giro ACEA (se nessun lock attivo):
1. acquisisci lock file acea.lock (altrimenti salta: un giro è già in corso)
2. import() dinamico di Playwright → lancia il browser (msedge headless)
3. login ACEA (user+password dal config) — niente OTP
4. applica i filtri fissi (ricetta) → click "Cerca" → click "Esporta"
5. attendi il download → percorso file scaricato
6. parseExport(file) → [{ odl, stato }]
7. aggiornaStato(masterPath, righe): aggancia per ODL, scrive STATO OPERAZIONE
   (sovrascrivi-sempre, traccia valore precedente) + backup prima di salvare
8. POST /api/agente/report { tipo:'acea-stato', ... } → storico in /hub/agente
9. chiudi sempre il browser (finally) e rilascia il lock
```

La sync notturna (cartella `LIMITAZIONI MASSIVE`) e il giro ACEA (file `DUNNING/…`) **non si
sovrappongono**: target distinti, e il lock impedisce due browser ACEA in parallelo se i tick sono
frequenti.

### Latenza on-demand
Il tick è strutturale (il PC chiama l'app, mai il contrario). Per rendere l'on-demand reattivo,
l'attività pianificata che lancia l'agente va portata a **ogni 1–2 minuti**: il tick "a vuoto" è una
sola POST che ritorna `aceaStato:false`, costo trascurabile. Con tick frequente, il **lock file** è
necessario per non avviare un secondo giro mentre uno è in corso (un giro Playwright dura ~30s–2min).

## 4. Config locale (sul PC, mai su git/Vercel)

`config.json` dell'agente esteso con la sezione `acea`. `config.example.json` aggiornato con
placeholder; `config.json` resta gitignored.

```jsonc
{
  "endpointUrl": "...", "exportKey": "...", "cartella": "<...LIMITAZIONI MASSIVE>",
  "acea": {
    "loginUrl": "https://<portale-acea>/...",
    "username": "<utente>",
    "password": "<password>",
    "browser": "msedge",                 // "msedge" | "chromium"
    "masterPath": "<...DUNNING/2026/LIMITAZIONI CON ORDINE.xlsx>",
    "download": "<cartella temp per i file scaricati>",
    "ricerca": {
      "filtri": [ { "selettore": "...", "tipo": "select|text|date", "valore": "..." } ],
      "bottoneCerca": "<selettore>",
      "bottoneEsporta": "<selettore>"
    },
    "export": { "colonnaOdl": "CODICE ODL", "colonnaStato": "<DA CONFERMARE>" },
    "masterColonnaStato": "STATO OPERAZIONE",
    "sovrascriviStato": true
  }
}
```

> I **selettori reali** (campi filtro, bottoni Cerca/Esporta, form di login) si ricavano
> **registrando una volta il flusso** col Playwright MCP già connesso, trascrivendo i selettori
> stabili invece di indovinarli.

## 5. Moduli nuovi — `tools/limitazioni-sync/lib/acea/`

Stesso stile del resto dell'agente: **driver imperativo sottile**, **logica pura testata**.

| File | Tipo | Responsabilità |
|---|---|---|
| `driver.mjs` | imperativo (no unit test) | `loginEdEsporta(cfgAcea) → percorsoFileScaricato`. Lancia il browser (`channel` dal config), login, filtri, Cerca, Esporta, attende il download. Screenshot di debug su errore. Chiude il browser in `finally`. Playwright importato con `import()` dinamico (solo quando serve). |
| `parseExport.mjs` | **puro, testato** | `parseExport(buffer|path) → [{ odl, stato }]`. Trova le colonne per nome (`export.colonnaOdl` / `export.colonnaStato`), normalizza, ignora righe senza ODL. Gestisce `.xlsx` (riuso `exceljs`) ed eventuale `.csv`. |
| `aggiornaStato.mjs` | **puro, testato** | `aggiornaStato(ws, righe, opts) → report`. Indicizza le righe export per ODL (riuso `norm()`), scorre il master, aggancia per ODL, scrive `STATO OPERAZIONE` con policy **sovrascrivi-sempre** registrando il `precedente`. Ritorna `{ aggiornate, invariate, nonAgganciate, righe[] }`. |
| `lock.mjs` | piccolo I/O | `acquisisci(path)` / `rilascia(path)` su `acea.lock` (PID + ISO time; stale-lock > N min ignorato). |

Riuso diretto dall'agente esistente: `caricaWorkbook`/`backupFile`/`salva` (`excelIO.mjs`),
`norm` (`match.mjs`), `risolviColonna` (`colonne.mjs`), `apiAgente.mjs` per tick/report.

### Ramo in `agente.mjs` → `main()`
Dopo la lettura del tick, **prima** del ramo `eseguiOra`:

```js
if (ris.aceaStato) {
  await eseguiGiroAcea({ cfg, baseUrl }); // lock → driver → parse → aggiorna → report
}
```

`eseguiGiroAcea` è isolato in `try/catch`: un errore ACEA **non** tocca la sync. Se l'export non
arriva, **nessuna scrittura** sul master.

## 6. Lato app — orchestrazione

- **Migration `agente_config`:** aggiungi `forza_acea_stato boolean not null default false`.
- **Migration `agente_run`:** aggiungi `tipo text not null default 'sync'` (per distinguere
  `'sync'` / `'acea-stato'` nello storico). In alternativa: leggere `dettaglio.tipo` (no migration) —
  preferita la colonna per filtrare/etichettare.
- **Endpoint `POST /api/admin/agente/acea-stato`** (gemello di `esegui-ora`): `requireAdmin` →
  `agente_config.update({ forza_acea_stato: true, updated_at })`.
- **`/api/agente/tick`:** ritorna `aceaStato: config.forza_acea_stato === true`; se vero, **consuma**
  il flag nello stesso tick (`update({ forza_acea_stato: false })`), come fa `forza_giro` con
  `eseguiOra`. (Trade-off accettato: crash dopo la consegna → giro perso, l'utente riclicca.)
- **`/api/agente/report`:** accetta `tipo` opzionale nel body; lo storico (`agente_run.tipo`) lo
  registra. Il riassunto conteggi resta `riassumiReport`; per ACEA `lavori` = righe export lette,
  `aggiornate` = stati scritti, `conflitti` = 0 (sovrascrittura), più un blocco `acea` nel dettaglio
  con le righe toccate (ODL, precedente→nuovo).
- **UI `AgenteClient.tsx`:** pulsante **"Aggiorna stato ODL da ACEA"** accanto a "Esegui ora" →
  POST endpoint → toast *"Richiesta inviata: parte al prossimo tick."* Disabilitato durante la POST.
- **Storico (`StoricoCard.tsx`):** badge per `tipo` (es. *Stato ACEA* vs *Sync*); per i run ACEA
  mostra aggiornate/non-agganciate e l'export dettaglio (riuso del pattern export Excel esistente).

## 7. Errori, robustezza, sicurezza

- **Credenziali ACEA** solo in `config.json` locale (gitignored). Mai su Vercel, mai in git, mai nel
  report inviato all'app.
- **Login fallito / portale cambiato:** il driver salva uno **screenshot di debug** in
  `acea/_debug/`, fa abort, e il giro chiude con `erroreGlobale`; l'app lo mostra nello storico.
  Nessuna scrittura parziale sul master.
- **Export vuoto / 0 righe:** non è un errore fatale → report "0 righe", master invariato.
- **ODL non agganciati** (presenti in export, assenti dal master, o viceversa): elencati nel report
  (`nonAgganciate`) per visibilità, senza bloccare.
- **Sovrapposizione:** `acea.lock` impedisce due giri in parallelo; lock "stale" (> N min) ignorato.
- **Backup:** `backupFile(masterPath, stamp)` prima di `salva` (come la sync) → rollback manuale
  sempre possibile.
- **Browser:** sempre chiuso in `finally`; timeout espliciti su login/cerca/download; headless.
- **Posizione separata:** il connettore tocca **solo** `acea.masterPath` (DUNNING), mai i master
  della sync (`cartella`).

## 8. Test

- **Unit (vitest, come il resto dell'agente):**
  - `parseExport`: file di esempio (xlsx/csv) → righe attese; colonne spostate/rinominate; righe
    senza ODL ignorate.
  - `aggiornaStato`: workbook fixture + righe export → `STATO OPERAZIONE` sovrascritto, `precedente`
    tracciato, ODL non agganciati elencati, righe senza match nel master ignorate.
  - `lock`: acquisizione/rilascio, lock stale.
  - Plumbing flag: `tick` ritorna+consuma `aceaStato`; endpoint admin alza il flag (pattern dei test
    `decisione`/`apiAgente` esistenti).
- **Non unit-testato:** `driver.mjs` (Playwright imperativo). Validato da:
  - **Smoke-test sul PC del lavoro** (primissimo passo operativo): 5 righe che lanciano Edge
    headless, aprono una pagina, chiudono → decide `msedge` vs `chromium` e conferma "senza admin".
  - **Dry-run** del giro completo con `sovrascriviStato` su una **copia** del master prima del primo
    uso reale.

## 9. Punti aperti / da confermare

1. **`acea.export.colonnaStato`** — nome esatto della colonna stato nell'export ACEA delle
   limitazioni (l'utente ha indicato che l'export limitazioni è diverso da `ReportIntervento`
   clientela e `ATTGIORN` giornaliera). Da leggere sul file vero `LIMITAZIONI CON ORDINE.xlsx` +
   sull'export sorgente quando disponibili.
2. **Selettori del portale** (login, filtri, Cerca, Esporta) — da registrare col Playwright MCP.
3. **Esito smoke-test browser** sul PC del lavoro (msedge vs chromium).
4. **`masterColonnaStato = STATO OPERAZIONE`** — confermato dall'utente; verifica del nome esatto
   (maiuscole/spazi) sul file reale via `risolviColonna` (già robusto ad accenti/NBSP/spazi).

## 10. Fase 2 — outline (spec propria, più avanti)

Condivide la **fondazione** della Fase 1 (login, ciclo di vita del browser, lock, config `acea`).

1. **Pianificazione manuale** sul master `LIMITAZIONI CON ORDINE.xlsx`: l'utente compila `data` +
   `esecutore` per gli ODL.
2. **Import nell'app** riusando il percorso **Assegnazione AI / `pianificabili`** già attivo per
   Zagarolo: `leggiPianificabili`/`estraiPianificabili` legge `odl/matricola/indirizzo/comune/`
   **`esecutore`**/**`data`** dal master. Va **esteso il target** per includere `acea.masterPath`
   (cartella DUNNING), oggi la lettura scansiona solo `cfg.cartella`.
3. **Assegnazione nell'app** (flusso Assegnazione AI esistente → crea piano/interventi/rapportini).
4. **Scrittura su ACEA via Playwright** (direzione che **muta** il portale): per ogni ODL assegna
   l'operatore. Più rischiosa → ricetta di navigazione propria, **dry-run obbligatorio**, verifica
   per-ODL.
5. **Verifica** rileggendo l'export `ATTGIORN` (`RISORSA` + `CODICE_ODL`) per confermare che le
   assegnazioni siano atterrate.

## 11. Decomposizione

- **Questo documento** = fondazione del connettore + **Fase 1** completa → diventa un piano di
  implementazione (writing-plans) e si realizza per prima.
- **Fase 2** = spec separata quando la Fase 1 è in produzione e verificata.

## Appendice — formati export ACEA osservati (campioni reali in `Downloads`)

- **`ReportIntervento_* → "Attività Clientela"`** (stato interventi): `CODICE ODL`,
  `STATO ATTIVITA` (*Chiuso*…), `STATO ESITAZIONE` (*Consuntivato OK*…), `ASSEGNATARIO`,
  `DATA ESECUZIONE`. (Non è l'export limitazioni, ma stesso portale/struttura.)
- **`ATTGIORN_* → "Dettaglio Risorse Interne"`** (assegnazioni/giornata, utile alla Fase 2):
  `GIORNATA`, `RISORSA` (operatore), `MATRICOLA`, `CODICE_ODL`, `DESCRIZIONE ATTIVITA'`, `COMUNE`,
  `Indirizzo`, `FASCIA_APP_DA/A`.
