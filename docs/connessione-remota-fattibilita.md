# Studio di fattibilità — connessione remota back office → dispositivo operatore

_Data: 2026-07-22 · Branch: `claude/remote-connection-feasibility-fb4kkc`_

> Valutazione della fattibilità di far accedere il **back office**, tramite il **link** e **previa
> accettazione dell'operatore**, al dispositivo dell'operatore **in remoto**, per **risolvere problemi
> sull'app**. Il documento non implementa nulla: analizza vincoli, opzioni e un percorso consigliato.
>
> **Sintesi in una riga:** un "TeamViewer nel browser" (vedere/controllare lo schermo del telefono da
> una PWA) **non è realizzabile** sul target mobile; la via web realistica è il **co-browsing/replay del
> DOM della sola app gp** (vista assistita + guida, non controllo), da introdurre partendo da una
> **diagnostica remota leggera** che evolve il widget "invia segnalazione" già esistente.

---

## 1. Verdetto in sintesi

| Domanda | Risposta |
|---|---|
| Il back office può **vedere lo schermo del telefono** dell'operatore da dentro la PWA? | **No.** `getDisplayMedia` (cattura schermo web) **non esiste sui browser mobili** (né iOS Safari/WebKit, né Android Chrome). Vedi §2. |
| Può **controllare** (toccare/digitare) il dispositivo da un altro browser? | **No.** Nessuna Web API inietta input in un'altra pagina/dispositivo. Il "controllo remoto" richiede software nativo lato-OS. Vedi §3. |
| C'è una via **web-only** che funziona sul mobile? | **Sì, una sola:** il **co-browsing / mirroring del DOM** (rrweb o SaaS tipo Cobrowse.io). Trasmette la *struttura* dell'app, non i pixel → aggira il blocco di `getDisplayMedia`. È **vista assistita**, non controllo. Vedi §3–§5. |
| Copre l'intero telefono? | **No.** Solo la tab/app **gp**. Niente altre app, tastiera di sistema, notifiche, permessi OS; e ha **punti ciechi** su mappe/canvas e anteprima fotocamera live. Vedi §5. |
| Serve infrastruttura nuova? | Poca: **Supabase Realtime broadcast** (già nell'infra, mai usato) come trasporto/signaling. Per lo screen-share WebRTC servirebbe anche un **TURN**, ma quell'approccio è comunque bloccato su mobile. Vedi §3, §6. |
| Raccomandazione | **Fattibile con riserve, ma NON come immaginato.** Partire da una **diagnostica remota (session-replay rrweb, evoluzione di "invia segnalazione")** — risolve l'obiettivo reale ("capire e risolvere i problemi dell'app") a basso rischio e 100% sullo stack. Il **co-browsing live** è la Fase 2 se serve assistenza sincrona. **Escludere** screen-share WebRTC (bloccato) e tool nativi (fuori perimetro, iOS non controllabile, privacy peggiore) salvo come tampone d'emergenza. Vedi §8. |

**Prerequisito non negoziabile (qualsiasi approccio):** ⚠️ la schermata operatore è **densa di PII di terzi**
(anagrafica cliente, indirizzo, recapito, PDR, matricola, ODL, GPS, note libere). Ogni sessione è un
**nuovo trattamento dati**: serve **redazione fail-closed**, **consenso per-sessione ancorato al token**,
**audit** e **admin autenticato**. Il repo è **PUBBLICO**: nessun segreto/licenza in commit. Vedi §7.

---

## 2. Il vincolo che ribalta tutto: niente cattura schermo su mobile

La richiesta implicita — "il back office **accede in remoto** e **vede/risolve** sull'app" — presuppone di
poter catturare lo schermo dell'operatore. **Sul web mobile questo non è possibile.**

`navigator.mediaDevices.getDisplayMedia()` (Screen Capture API) è l'**unica** Web API che acquisisce lo
schermo, e **non è implementata su nessun browser mobile** (fatto _decision-critical_, verificato in modo
adversariale — vedi Fonti):

- **iOS Safari / WKWebView / PWA "Aggiungi a Home":** WebKit implementa `getDisplayMedia` **solo su macOS**,
  mai su iOS/iPadOS. E poiché su iOS **tutti** i browser (Chrome, Firefox inclusi) sono obbligati a usare
  WebKit, **non c'è workaround** cambiando browser o installando la PWA.
- **Android Chrome / WebView / Samsung Internet / Firefox Android:** Chromium **non** implementa la cattura
  schermo su Android (bug storico `chromium 487935`/`40418135`, tuttora aperto). Anzi, da Chrome 88 l'API è
  stata **deliberatamente nascosta** su Android proprio perché non funziona → **la sola feature-detection per
  esistenza dà falsi positivi** (in passato il metodo esisteva ma rigettava sempre con `NotAllowedError`).
  Serve una verifica **funzionale/di piattaforma**, non un `typeof` check.

**Conseguenza:** lo screen-share dell'intero telefono da una PWA con sola Web API **non è fattibile sui
dispositivi target**. L'unica cosa che si potrebbe catturare è la **fotocamera** (`getUserMedia`, già usata
in `ScannerMisuratore.tsx`) — utile solo come ripiego degradato (l'operatore "inquadra" lo schermo con un
secondo device), **non** come vera assistenza sull'app.

> Nota: su **desktop** `getDisplayMedia` è pienamente supportato (Chrome 72+, Firefox 66+, Safari macOS 13+).
> Rilevante **solo** se in futuro un operatore usasse un PC — fuori dal target dichiarato (operatori sul campo).

---

## 3. Cosa si può e non si può fare con le sole Web API

| Capacità desiderata | Fattibile via Web API? | Perché |
|---|---|---|
| Vedere lo **schermo del telefono** (pixel) | ❌ No (mobile) | `getDisplayMedia` assente su iOS/Android (vedi §2) |
| Vedere la **schermata dell'app gp** (struttura) | ✅ **Sì** | **Co-browsing / mirroring del DOM**: si serializza il DOM (non i pixel) e lo si ricostruisce lato admin |
| **Controllare** (toccare/digitare) il device | ❌ No | Nessuna Web API inietta input in un'altra pagina/device; la sandbox del browser lo vieta |
| **Guidare** l'operatore (puntatore, annotazioni, "vedo dove sei") | ✅ Sì (overlay) | Overlay lato admin sul DOM mirrorato; l'operatore agisce, l'admin indica |
| "Azioni proxied" (click/scroll sintetici sul DOM) | ⚠️ Ripiego fragile | Eventi sintetici con `isTrusted=false`: su mobile **non** pilotano tastiera di sistema, file/camera picker, gesture native |
| Signaling/trasporto senza nuovo server | ✅ Sì | **Supabase Realtime broadcast** (già nell'infra) come pub/sub JSON |

**Controllo remoto vero — impossibile con sole Web API (confermato).** Il modello di sicurezza del browser
(same-origin, sandbox per-tab/per-processo) impedisce a una pagina di iniettare eventi input in un'altra
pagina/tab/dispositivo. WebRTC trasporta solo media + `DataChannel`; per un controllo reale serve un
**agente nativo lato-OS** sull'endpoint controllato (tipo TeamViewer/AnyDesk), fuori dal perimetro PWA.

> Sfumatura tecnica (non cambia la conclusione): esiste dal 2024/25 la web API sperimentale **Captured
> Surface Control** (`CaptureController.forwardWheel()`, `setZoomLevel()`), che consente di inoltrare **solo
> scroll e zoom** su un surface catturato **localmente sullo stesso dispositivo** (Chromium **desktop**). Non
> è click/tastiera, non attraversa la rete, non tocca il mobile: **non abilita alcun controllo remoto**.

**Supabase Realtime come signaling/trasporto — confermato.** Il signaling WebRTC è agnostico al trasporto:
serve solo un canale bidirezionale per scambiare SDP/ICE, e Supabase Realtime (WebSocket) lo è. Supabase
stessa dichiara l'intento di usarlo come signaling server e ci sono implementazioni community. **Ma** finora
nel repo si usa **solo** `postgres_changes` (broadcast/presence mai adottati) e le pagine operatore a token
**non aprono** un client Realtime nel browser (sono server-side con `supabaseAdmin`). Per lo screen-share
WebRTC servirebbe inoltre un **TURN**: non è richiesto per *ogni* connessione (~70-85% delle sessioni consumer
va in P2P diretto con solo STUN), ma è **de facto necessario per l'affidabilità**, soprattutto qui dove gli
operatori sono su **reti mobili con CGNAT/NAT simmetrico** che forzano spesso il relay. Punto comunque teorico:
il media WebRTC è bloccato a monte da `getDisplayMedia` su mobile.

---

## 4. Stato attuale nel progetto (i punti di aggancio)

Lo studio si innesta su quattro fatti già presenti nel codice.

| Area | Stato attuale | Rilevanza per la connessione remota |
|---|---|---|
| **Il "link"** | Accesso operatore via **token** non autenticato: route `app/r/[token]`, `app/agenda/[token]`, `app/pi/[token]` + API relative. Token con **finestre di validità** e **revoca** (`pi_token.valido_dal/valido_al/revocato_at`; `rapportini` per `/r`), generati dall'admin. | È l'aggancio naturale per il **consenso "previa accettazione"**: la sessione di supporto si lega al token, con opt-in per-sessione revocabile. L'operatore **non ha identità Supabase** → il consenso va catturato *contro il token*. |
| **Realtime** | Canali `supabase.channel(...).on('postgres_changes', ...)` in `lib/pi/useProntoInterventoCount.ts`, `lib/interventi/useInterventiFeed.ts`, `useRichiesteManualiFeed.ts`, `app/hub/hotel-calendar/page.tsx`. **Broadcast/Presence disponibili ma mai usati.** `hotel-calendar` usa già un `createClient` con **sola anon key** (senza sessione). | Trasporto/handshake pronto **senza nuovo server**. Il lato operatore (pagine token, oggi server-side) richiede un **client Realtime net-new** in browser, come anon. |
| **Supporto esistente** | Widget "invia segnalazione" → `app/api/segnala/route.ts` → **hub ATLAS** (titolo + testo + **1 screenshot** scelto a mano, max 4MB). **Login-gated, asincrono.** Pattern **proxy-con-segreto-server-side** (`ATLAS_REPORT_SECRET`). | La connessione remota è l'**evoluzione** di questo canale: da "1 screenshot statico" a "replay/vista della sessione". Il pattern proxy è **riusabile** per nascondere eventuali segreti (TURN/licenze SaaS). |
| **Media & PWA** | `getUserMedia` (camera) già usato nello scanner; **`getDisplayMedia` mai**. Service worker **Serwist** solo per caching offline; **nessun web app manifest** (`app/manifest.ts`/`manifest.json` assenti) → l'app gira **in-browser** / scorciatoia home, **non** come PWA pienamente installabile. | Il SW **non ostacola** WebRTC/WebSocket/`getUserMedia`. L'assenza di manifest **semplifica** (nessun quirk di sandbox standalone). ⚠️ `skipWaiting+clientsClaim`: un deploy con nuovo SW può **troncare** una sessione live in corso. |

⚠️ **Percorso dati non protetto da RLS.** Le pagine token servono i dati via `supabaseAdmin` (service role) che
**bypassa la RLS** (`lib/rls.ts` è vuoto). La protezione va quindi imposta **in applicazione**: qualsiasi
redazione/consenso è responsabilità del codice, non del DB.

---

## 5. Gli approcci valutati

Cinque approcci, dal più "immaginato" al più realistico. Verdetti onesti.

| # | Approccio | Verdetto | Perché in una riga |
|---|---|---|---|
| A | **Screen-share WebRTC in-app** (operatore condivide schermo, admin guarda) | 🔴 **Non fattibile (mobile)** | `getDisplayMedia` assente su iOS/Android: nessuna sorgente video da agganciare a WebRTC |
| B | **Co-browsing / DOM mirroring in-app** (rrweb self-host + Supabase Broadcast) | 🟡 **Fattibile con riserve** | Unica via web-only **live** che gira su mobile; vista dell'app gp + guida, non controllo |
| C | **SaaS di co-browse embeddato** (Cobrowse.io / Surfly / Upscope) | 🟡 **Fattibile con riserve** | Come B ma "compra" time-to-value e compliance; costo per-agente + dipendenza da terzi |
| D | **Tool nativo di remote control** (TeamViewer / AnyDesk / RustDesk) | 🟠 **Parzialmente fattibile** | Fuori dal perimetro PWA; iOS **non controllabile**; privacy peggiore; utile solo come tampone |
| E | **Diagnostica avanzata / session-replay** (rrweb async + log remoti) | 🟢 **Fattibile con riserve** ← *consigliato come primo passo* | Evoluzione di "invia segnalazione"; risolve l'obiettivo reale; 100% stack, dati in EU |

### A — Screen-share WebRTC in-app · 🔴 Non fattibile su mobile
L'operatore avvierebbe `getDisplayMedia()`, il `MediaStream` andrebbe su `RTCPeerConnection`, signaling su
Supabase broadcast, NAT traversal via STUN+**TURN**. **Bloccante:** `getDisplayMedia` non esiste sui browser
mobili (§2) → **niente sorgente video**. Tutto il resto (broadcast, WebRTC, TURN) funzionerebbe ma resta a
vuoto. Effort ~8-14 gg/uomo **solo per un MVP desktop** — valore zero per gli operatori sul campo. In più: lo
screen-share è **cattura a pixel** → **non** permette redazione selettiva dei campi PII (a differenza del
co-browsing). **Da escludere.**

### B — Co-browsing / DOM mirroring in-app (rrweb) · 🟡 Fattibile con riserve
Il browser operatore **serializza il DOM** della PWA (via `MutationObserver`) e ne trasmette
snapshot+mutazioni al back office, che ricostruisce l'app in un **replayer** (`rrweb-player`, `liveMode`).
Nessuna cattura schermo → aggira il blocco §2. Trasporto: canale **Supabase broadcast** legato a un
`sessionId` derivato dal token; client Realtime **anon** net-new sulle pagine token; pagina admin
autenticata (`requireAdmin`) che si iscrive allo stesso canale; **handshake di consenso** per-sessione.
- **Copertura:** solo l'app gp. Fedeltà **piena sui form** (il grosso di `/r|/pi|/agenda`).
- **Punti ciechi reali:** ⚠️ **canvas/WebGL** (mappe Leaflet/maplibre) restano vuoti nel replay;
  ⚠️ l'**anteprima live della fotocamera** dello scanner (`getUserMedia`) **non** è catturata in modo
  affidabile; niente UI di sistema/altre app/tastiera nativa/dialoghi permessi.
- **Non è controllo:** le "azioni proxied" sono un ripiego fragile su mobile → l'assistenza reale è
  **"vedo e guido"**, non "faccio io".
- **Trasporto da domare:** i full-snapshot rrweb possono superare il limite **~256KB/messaggio** del broadcast
  e i **~10 msg/s** di default → servono **chunking/throttling/backpressure**.
- **Effort (build):** ~**12-18 gg/uomo** per MVP sola-vista con consenso + audit + **redazione PII**
  (di cui 3-5 gg solo per la redazione e i test su iOS/Android reali). Puntatore/annotazione +2-3 gg.

### C — SaaS di co-browse embeddato (Cobrowse.io) · 🟡 Fattibile con riserve
Snippet/SDK JS di terze parti sulle pagine token; il vendor gestisce trasporto, sessione, consenso, replayer.
Su mobile web fanno **co-browse DOM** (le funzioni "full-device" richiedono **app nativa** → fuori scope PWA).
- **Cobrowse.io** (snippet same-origin) è il più compatibile con Next.js/App Router e l'accesso a token;
  offre **redazione private-by-default**, **ISO27001/SOC2**, **DPA**, **EU data residency** o self-host.
  Prezzo indicativo ~**18 $/agente/mese** (web). **Surfly** (reverse-proxy) rischia conflitti con il SW
  Serwist, l'auth a token e la PWA → **da validare in PoC prima di sceglierlo**. **Upscope** è debole su
  mobile (target gp 100% mobile → penalizzante).
- **Pro:** time-to-value rapido (~4-8 gg/uomo per l'integrazione), compliance "pronta", niente TURN/replayer
  da mantenere. **Contro:** costo per-agente + **lock-in**; la **redazione PII resta configurazione nostra**
  (fail-open per errore); snippet di terzi su repo pubblico → CSP/Permissions-Policy (oggi assenti); DPA e
  data-residency da formalizzare.

### D — Tool nativo di remote control (TeamViewer / AnyDesk / RustDesk) · 🟠 Parzialmente fattibile
App nativa separata sul telefono, **fuori** dalla web app: gp non instrada né traccia nulla.
- **Copertura massima dove consentita** (intero device, utile se il problema è OS/rete/permessi), ma
  **asimmetria di piattaforma:** su **Android** vista+controllo (via **AccessibilityService**/add-on OEM,
  invasivo, distribuzione ristretta — RustDesk è fuori dal Play Store); su **iOS** il controllo è
  **impossibile per policy Apple** → **solo vista** (ReplayKit/broadcast extension). Stesso muro del web.
- **Contro strutturali:** richiede **install app-store** su ogni device (rompe il modello "solo link+token");
  **privacy peggiore** (cattura l'intero telefono, redazione **impossibile**, PII di terzi + dati
  dell'operatore); licenze commerciali ricorrenti (l'uso "gratis" è solo personale); **nessun audit in gp**.
  **RustDesk self-host** è l'unico allineato al vincolo "niente segreti proprietari", ma resta esterno.
- **Ruolo:** **tampone d'emergenza**, non funzione integrabile.

### E — Diagnostica avanzata / session-replay (rrweb async + log remoti) · 🟢 Fattibile con riserve *(consigliato come primo passo)*
Invece di guardare *in diretta*, l'operatore (previa accettazione) invia un **pacchetto diagnostico**: una
**registrazione rrweb** del DOM durante il problema (serializzazione DOM → **funziona su mobile**) + un buffer
di **log/errori console** (`window.onerror`, `unhandledrejection`) + metadati (UA, viewport, versione app,
token/rapportino). Il back office ricostruisce la sessione in un **replayer autenticato**.
- **È l'evoluzione naturale** di "invia segnalazione" (oggi: solo titolo+testo+1 screenshot, login-gated).
- **Riusa pattern collaudati:** route token + **Supabase Storage** + **signed URL** (identico a
  `foto-campo/route.ts`), proxy-con-segreto (`segnala`), `CompressionStream` nativo per il gzip.
- **Risolve l'obiettivo reale** ("capire/risolvere i problemi dell'app"): un replay del DOM + errori console
  spesso permette di **riprodurre** il bug meglio di uno sguardo dal vivo, e resta consultabile **in differita**
  senza coordinare operatore e admin sullo stesso minuto.
- **Riempie una lacuna:** oggi **zero telemetria/error tracking**; questo introduce il primo contesto
  diagnostico remoto.
- **Percorso incrementale:** MVP **async** ora; **near-live** (rrweb `liveMode` → Supabase broadcast) dopo,
  senza buttare nulla. **Effort:** ~**8-13 gg/uomo** (MVP async) + **3-5 gg** per la variante near-live.
- **Riserve:** non è live di default (per l'hand-holding sincrono serve la variante near-live, comunque
  sola-vista); **redazione PII** e retention da costruire; peso bundle/RAM su device economici; canvas/mappe
  non fedeli (ma le route operatore sono form).

---

## 6. Rischi e mitigazioni (trasversali agli approcci web B/C/E)

| Rischio | Gravità | Mitigazione |
|---|---|---|
| **Fuga di PII** per redazione incompleta/regredita | 🔴 Alta | Redazione **fail-closed** (allowlist "mostra solo ciò che serve"): `maskAllInputs`, `maskText*`/`blockClass` su **ogni** campo PII; **test automatici** che verificano l'assenza di PII negli eventi; revisione a ogni nuovo campo dei form |
| **Canale Realtime intercettabile** (anon key pubblica) | 🔴 Alta | Canale privato: **RLS su `realtime.messages`** (mai usata finora) **oppure** `sessionId`/segreto **effimero derivato dal token**; mai canale pubblico con id indovinabile |
| **Aspettative disallineate** ("volevo un TeamViewer") | 🟡 Media | Comunicare che il web dà **vista assistita dell'app**, non controllo del telefono; niente altre app, niente mappe/canvas, niente UI di sistema |
| **Saturazione broadcast** (full-snapshot >256KB, burst >10 msg/s) | 🟡 Media | Chunking + throttling + backpressure; ring-buffer temporale; verificare le **quote Realtime** del piano col carico reale |
| **Interruzione da deploy** (`skipWaiting`+`clientsClaim`) | 🟡 Media | Flush/invio incrementale; gestire il ricambio SW durante sessioni live |
| **Punti ciechi** (canvas/mappe, camera live, UI native) | 🟡 Media | Dichiararli; per problemi su camera/mappa affiancare log + screenshot; non promettere copertura totale |
| **Snippet di terzi (SaaS) su repo pubblico** | 🟡 Media | Licenza via **env server-side** (mai committata); **CSP/SRI/Permissions-Policy** (oggi assenti); preferire self-host se possibile |
| **Client Realtime anon net-new** sulle pagine token | 🟡 Media | Connessione WS solo su consenso; scope minimo; teardown affidabile a fine sessione |

---

## 7. Privacy / GDPR — il vero collo di bottiglia

Qualunque approccio che mostri la schermata operatore è un **nuovo trattamento di dati personali di TERZI**
(clienti finali), **più impattante del lavoro tecnico**. La schermata (`RapportinoForm`, servita via
`supabaseAdmin` che **bypassa la RLS**) espone: **nominativo, indirizzo civico, recapito telefonico,
PDR/matricola, ODL, coordinate GPS**, oltre a **note libere** (`notePrecedenti`, `notaUfficio`,
`motivo_rifiuto`) potenzialmente sensibili. **Senza redazione, ogni sessione = copia visiva del DB clienti
verso il back office.**

**Requisiti non negoziabili:**

1. **Base giuridica e finalità** definite (assistenza tecnica) + aggiornamento del **registro dei trattamenti**
   / **DPA**. Il consenso dell'operatore da solo **non** copre il trattamento dei dati dei clienti mostrati:
   la vera mitigazione è la **minimizzazione (redazione)**, non il consenso.
2. **Consenso esplicito opt-in per-sessione**, ancorato al **token** (l'operatore è anon), **revocabile** e
   **a scadenza**. L'accettazione è il gesto che avvia il recorder/mirroring.
3. **Redazione fail-closed** dei campi PII durante il mirroring/replay (default mascheramento, unmask solo
   dove provato necessario). **Vantaggio del co-browsing/replay DOM:** la redazione avviene **a monte**, sul
   device, prima che i dati lo lascino — **impossibile** con lo screen-share a pixel e con i tool nativi.
4. **Admin sempre autenticato** (`requireAdmin`) e **tracciato**.
5. **Nessuna registrazione di default** (solo live effimero, o pacchetti a **retention breve** 7-30 gg,
   cancellazione automatica). Se in futuro si registra: cifratura + retention + ulteriore base giuridica.
6. **Audit per-sessione**: chi (admin), quando, quanto, quale token/rapportino, consenso.

**Confronto privacy tra approcci:** co-browsing/replay DOM (B, C, E) → redazione **granulare** possibile →
**profilo migliore** e dati in **Supabase EU** (B/E) o EU/self-host (C). Screen-share (A) → cattura a pixel,
**niente redazione**. Tool nativo (D) → **peggiore**: cattura l'intero device, redazione impraticabile,
processor terzo con data-residency da verificare.

⚠️ **Repo PUBBLICO:** token di sessione, credenziali TURN e license key SaaS **mai** hardcoded — solo env
server-side o chiavi anon già esposte con RLS.

---

## 8. Raccomandazione e piano a fasi

**Raccomandazione.** La connessione remota è **fattibile con riserve**, ma **non nella forma immaginata**:
un accesso "vedi e controlla il telefono" **non esiste** sul web mobile. La via realistica è la **vista
assistita della sola app gp**. Il modo più sensato di introdurla è **partire dal valore diagnostico**,
non dal live control:

1. **Fase 0 — Fondamenta trasversali (2-4 gg):** modello di **consenso per-sessione ancorato al token**
   (opt-in, revoca, scadenza); tabella di **audit** `support_sessions`; **autorizzazione del canale** Realtime
   (RLS su `realtime.messages` o segreto effimero da token); **inventario e marcatura fail-closed dei campi
   PII** in `RapportinoForm` e figli. Aggiornare **registro trattamenti/DPA**.
2. **Fase 1 — Diagnostica remota async (rrweb + log), ~8-13 gg** *(approccio E)*: evoluzione di "invia
   segnalazione". Recorder DOM con ring-buffer + mascheramento, buffer log/errori, widget consenso sulle route
   token, upload su Supabase Storage (modello `foto-campo`), **replayer admin autenticato**. **Basso rischio,
   100% stack, dati in EU.** Copre già gran parte dell'obiettivo "risolvere i problemi dell'app".
3. **Fase 2 — Near-live / co-browsing (rrweb `liveMode` su Supabase broadcast), +3-5 gg** *(approccio B)*:
   quando serve assistenza **sincrona** ("guardo mentre fai"). Aggiunge presence/handshake, chunking/backpressure
   e overlay puntatore/annotazione. Resta **sola-vista + guida**, non controllo.
4. **Valutazione buy-vs-build:** se il time-to-value e la compliance pronta pesano più del controllo sui dati,
   valutare **Cobrowse.io** (EU cloud o self-host) *(approccio C)* al posto del build rrweb per la parte live —
   **PoC obbligatorio** su iOS/Android reali e verifica interazione con SW/token/PWA. **Surfly** solo dopo un
   PoC che escluda conflitti col reverse-proxy.
5. **Da escludere** dal percorso web: **screen-share WebRTC** (A, bloccato su mobile). **Tool nativi** (D)
   solo come **tampone d'emergenza** documentato (preferibilmente **RustDesk self-host**), mai come funzione
   integrata.

**Prossimo passo consigliato:** dare l'ok alla **Fase 0 + Fase 1** (diagnostica remota a basso rischio, che
già risolve la maggior parte dei "problemi sull'app"), misurarne l'utilità reale, e **solo allora** decidere
se investire nel co-browsing live (build rrweb vs buy Cobrowse) con dati alla mano.

---

## Fonti (fatti esterni verificati)

- Screen Capture mobile: [MDN — getDisplayMedia / browser compat](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) · [Can I use](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia) · [Chromium 487935 "Android doesn't support screen capturing"](https://bugs.chromium.org/p/chromium/issues/detail?id=487935) · [w3c/mediacapture-screen-share #127](https://github.com/w3c/mediacapture-screen-share/issues/127) · [Chromium 40753589 "Screen Capture for iOS"](https://issues.chromium.org/issues/40753589) · [bigbluebutton #8576 (iOS Safari)](https://github.com/bigbluebutton/bigbluebutton/issues/8576)
- Controllo remoto / WebRTC: [3 Things WebRTC Cannot Do — WebRTC.ventures](https://webrtc.ventures/) · [MDN — Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture) · [MDN — CaptureController.forwardWheel()](https://developer.mozilla.org/en-US/docs/Web/API/CaptureController) · [Co-Browsing vs Screen Sharing — Unblu](https://www.unblu.com/)
- Co-browsing / rrweb / SaaS: [rrweb](https://rrweb.com/) · [rrweb — guide/canvas/cross-origin](https://github.com/rrweb-io/rrweb/blob/main/guide.md) · [Cobrowse.io — mobile web](https://support.cobrowse.io/cobrowse.io-on-mobile-web) · [Cobrowse.io — EU public cloud / DPA / security](https://cobrowse.io/security) · [Surfly — security & compliance](https://www.surfly.com/security-and-compliance) · [Twilio — screen-share non supportato su mobile](https://www.twilio.com/docs/video/screen-share-chrome)
- Supabase Realtime come signaling: [Supabase Discussion #28473](https://github.com/orgs/supabase/discussions/28473) · [Supabase — Broadcast](https://supabase.com/docs/guides/realtime/broadcast) · [Supabase — Realtime Multiplayer (GA)](https://supabase.com/blog/supabase-realtime-multiplayer-general-availability)
- STUN/TURN su reti mobili: [WebRTC.org — peer connections/signaling](https://webrtc.org/getting-started/peer-connections) · [NAT/STUN/TURN/ICE — Forasoft](https://forasoft.com/blog)
- Tool nativi: [TeamViewer — iOS screen share / Android universal add-on](https://www.teamviewer.com/) · [AnyDesk — iOS/iPadOS](https://support.anydesk.com/docs/anydesk-for-ios-ipados-tvos) · [RustDesk — Android/iOS](https://rustdesk.com/blog/rustdesk-remote-control-android-ios/)
