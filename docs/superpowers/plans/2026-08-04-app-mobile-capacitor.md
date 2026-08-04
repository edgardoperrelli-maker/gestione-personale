# Piano — App installabile Android/iOS per l'uso sul campo (2026-08-04)

> Obiettivo: trasformare gestione-personale in un'app installabile su telefoni e
> tablet (Android + iOS), ottimizzata per il campo, abbandonando i link `/r/[token]`
> come canale di accesso degli operatori. Account sviluppatore Apple e Google già
> attivi e pagati (non sono un vincolo).

---

## 0. Verifica del progetto (fatta il 2026-08-04, container cloud)

| Verifica | Esito |
|---|---|
| `npm run build` (Next.js 15, TS strict) | ✅ compila, ~60 route |
| Test unitari (`vitest run`) | ✅ 354 file, 3432 test, tutti verdi |
| Service worker Serwist | ✅ generato nel build di prod (`public/sw.js`) |
| Manifest PWA + icone (192/512/maskable/apple-touch) | ✅ presenti, `display: standalone`, `start_url: /hub` |
| Offline outbox (IndexedDB, background sync, compressione foto) | ✅ già implementato (`lib/offline/*`) |
| Riproduzione locale nel container (server prod + screenshot Chromium a viewport telefono/tablet) | ✅ funziona |
| `npm audit` | ⚠️ 21 avvisi (quasi tutti toolchain di build: brace-expansion, esbuild dev; `npm audit fix` copre i più) |
| Supabase advisor | ⚠️ 6 tabelle `bak_*_20260730` con RLS disabilitata (vedi §8) |

**Conclusione**: il progetto è già "PWA-ready" al 70%. Il salto da fare non è tecnico-web
ma di **canale**: shell nativa, login operatore al posto dei link, plugin nativi da campo,
pipeline di build e distribuzione store.

---

## 1. Decisione architetturale: shell Capacitor + web app remota

L'app è Next.js **full-stack**: App Router con SSR, ~40 API route server-side,
middleware di auth, service-role Supabase. Non può diventare un bundle statico
dentro l'app senza riscrivere tutta la parte server.

**Scelta: [Capacitor](https://capacitorjs.com) con `server.url` puntato alla web app
in produzione (Vercel).** Una sola codebase, due app native (iOS + Android), WebView
di sistema + plugin nativi (camera, scanner, GPS, push, storage sicuro, biometria).

Perché non le alternative:

- **TWA / Bubblewrap (Android)**: velocissima ma esiste solo su Android; per iOS
  servirebbe comunque un'altra soluzione. Scartata per non avere due pipeline.
- **Static export + Capacitor (bundle locale)**: perderebbe SSR, API route e
  middleware → mesi di refactor verso Supabase Edge Functions. Scartata.
- **Riscrittura React Native / Expo**: duplicherebbe 14+ moduli e tutta la logica.
  Scartata.

Conseguenza importante (è un vantaggio): **gli aggiornamenti dell'app restano deploy
web** — nessuna ri-submission agli store per modifiche UI/logica. Si ripassa dagli
store solo quando cambia la shell nativa (nuovi plugin, icone, splash).

---

## 2. Cosa cambia per l'operatore: dai link all'app

Oggi: l'operatore riceve un link `/r/[token]` (scadenza a fine giorno lavori), lo apre
nel browser. Fragile: link persi, tab chiuse, sessioni browser, nessuna presenza fissa
sul telefono.

Domani:

1. **Icona sul telefono** → apre l'app → **login operatore una tantum** (username +
   password, poi sblocco biometrico/PIN). Le utenze Supabase esistono già per gli
   admin (email fittizie `@local.it`); si estendono agli operatori collegandole a
   `staff`.
2. **Home operatore "Il mio giorno"** (deciso 2026-08-04): schermata riepilogo —
   conteggi del giro, note ufficio, ODL TOP, stato coda offline — e da lì si entra
   nel rapportino. L'app risolve internamente il giro assegnato del giorno (query per
   `staff_id` + data, stessa fonte dei token). Il token sparisce dalla sua esperienza.
3. `/r/[token]` **resta attivo** durante la transizione (fallback per emergenze,
   dispositivi non ancora migrati, interinali).

---

## 3. Fasi operative

### Fase 1 — Rifiniture mobile web (iterazione visiva)
- ⚠️ Corretto il 2026-08-04: **i tablet sono degli operatori** (99% uso da campo),
  non dell'ufficio. L'audit viewport riguarda le VISTE OPERATORE su 4 viewport:
  390×844 (iPhone), 412×915 (Android), 834×1194 (iPad), 800×1280 (tablet Android).
  **Formato pagina unico e responsive** — stessa pagina che scala, niente layout
  dedicati per piattaforma.
- Safe-area (notch), target touch ≥44px, tastiere (`inputmode`), overscroll, `100dvh`.
- Harness locale: `public/device-wall.html` (NON committare / non deployare — solo
  dev locale): 4 iframe stessa origine ai viewport reali, zoom e navigazione sincrona.

### Fase 2 — Scaffold Capacitor (container cloud, committabile)
- `@capacitor/core` + `@capacitor/cli` + progetti `ios/` e `android/` nel repo.
- `capacitor.config.ts`: `server.url` → produzione; `appId` es. `it.plenzich.gestione`.
- Plugin base: SplashScreen, StatusBar, App (lifecycle/back button), Network,
  Preferences (storage sicuro sessione), Keyboard.
- Helper `isNativePlatform()` per rami nativi nel codice web (es. nascondere il
  prompt "installa PWA" dentro l'app).
- ⚠️ Richiede l'ok all'installazione di librerie (regola AGENTS.md §11.3).

### Fase 3 — Login operatore e home "Il mio giorno"
- Utenze operatore in Supabase (provisioning da `staff`, ruolo `operatore`,
  `allowedModules` minimi). Login: username+password consegnate dall'ufficio,
  poi sblocco biometrico/PIN del dispositivo; sessione lunga in storage sicuro.
- **Gestione credenziali dentro `/impostazioni/personale`** (anagrafica operatori
  già esistente): crea utenza + reset password, visibile al ruolo `admin`
  (= tutto il backoffice). ⚠️ NON in `/impostazioni/utenze`, che resta admin_plus.
  Reset = password temporanea mostrata una volta + cambio obbligatorio al primo accesso.
- Route `/hub/oggi` (home «Il mio giorno» a riepilogo): redirect automatico
  post-login per ruolo `operatore`; da lì si entra nel rapportino (riuso
  componenti di `/r/[token]`).
- I token restano come canale parallelo finché la flotta non è migrata.

### Fase 4 — Nativizzazione delle funzioni da campo (container + device reali)
- **Scanner matricole**: da `@zxing/browser` a ML Kit nativo (`@capacitor-mlkit/
  barcode-scanning`) — differenza enorme sotto il sole e con matricole rovinate;
  fallback web invariato.
- **Fotocamera**: plugin Camera nativo (qualità/compressione controllate, meno crash
  del file input in WebView); l'outbox offline esistente resta identico.
- **GPS**: Geolocation nativa per mappa/live (permessi dichiarati nei manifest).
- **Push in v1** (deciso 2026-08-04): FCM + APNs con catalogo eventi estensibile —
  al minimo: nuovo giro assegnato, nuovo intervento assegnato, intervento rimosso.
  Nuovo sottomodulo **Impostazioni → Notifiche operatori** con toggle GLOBALI per
  tipo evento (ON/OFF per tutta la flotta; per-operatore eventualmente dopo).
- **Keep-awake** durante compilazione rapportino; **App Badge** per da-sincronizzare.

### Fase 5 — CI/CD build native (GitHub Actions)
- Android: runner ubuntu → AAB firmato → Play **internal testing** automatico.
- iOS: runner **macOS** + Fastlane (match per i certificati) → **TestFlight**.
- Nessun Mac locale necessario: la firma e l'upload vivono in CI con i vostri
  account sviluppatore (secrets nel repo).

### Fase 6 — Distribuzione (account già attivi)
- **Android**: Managed Google Play / traccia privata per l'organizzazione (app non
  pubblica sul Play Store) — oppure closed track con lista tester.
- **iOS**: **Apple Business Manager → Custom Apps** (distribuzione privata alla
  vostra org) o **Unlisted App Distribution**; pilota via TestFlight.
- Pilota: 2–3 operatori + 1 tablet ufficio per una settimana, poi rollout.

---

## 4. Dove si lavora: container cloud vs locale (risposta alla domanda)

**La pianificazione e quasi tutto lo sviluppo si fanno benissimo qui nel container
cloud.** Dimostrato oggi: build di produzione, 3432 test, server locale attivo e
screenshot a viewport reali di telefono e tablet. Il loop "aggiusto la vista → te la
mostro" funziona senza bisogno del tuo PC.

| Attività | Dove |
|---|---|
| Pianificazione, sviluppo UI/logica, adattamenti mobile, scaffold Capacitor | **Container cloud** (questo) |
| Verifica visiva (screenshot telefono/tablet, e2e Playwright) | **Container cloud** |
| Build binari (.aab Android, .ipa iOS) | **GitHub Actions** (iOS richiede macOS → runner CI, non compilabile nel container) |
| Prova su dispositivo vero | **I vostri telefoni/tablet** via TestFlight / Play internal |
| Debug USB con device fisico (raro) | Unico caso in cui serve una macchina locale |

Nota ambiente container: `.env.local` va ricreato a ogni sessione (URL + anon key via
MCP Supabase; il service-role key non è esposto → le API admin non girano qui, la UI sì).
Per riprodurre le viste autenticate nel container serve **un'utenza di test** (da
creare in Supabase con ruolo `operatore` su dati non sensibili) — da decidere in Fase 3.

---

## 5. Stabilità (il "più stabile" della richiesta)

- **Primo avvio offline**: la shell carica dal server; con Serwist già oggi le pagine
  operatore viste restano disponibili offline. Aggiungere una pagina di fallback
  offline nella shell (schermata "sei offline, i dati salvati sono al sicuro" +
  stato outbox) per il cold start senza rete.
- **Kill-switch / versione minima**: endpoint `/api/app-version` letto all'avvio
  dalla shell → banner "aggiorna l'app" se la shell è troppo vecchia.
- **Monitoraggio errori**: oggi assente (c'è il replay assistenza con rrweb, manca il
  crash reporting). Valutare Sentry (web + native) in Fase 5.
- **Igiene**: `npm audit fix` per i fix non-breaking; pulizia tabelle `bak_*` (vedi §8).

---

## 6. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Review Apple "web wrapper" (linea guida 4.2) | Distribuzione **Custom Apps/Unlisted** (contesto business), plugin nativi reali (scanner ML Kit, push, biometria, offline) = non è un semplice wrapper |
| WebView dipende dalla rete al primo paint | Fallback offline in shell + cache Serwist esistente |
| Deriva tra web deploy e shell vecchia | Endpoint versione minima (kill-switch) |
| Utenze operatore = nuova superficie di accesso | Ruolo `operatore` con `allowedModules` minimi, RLS già attiva, audit `audit_azioni` |
| iOS niente Background Sync API | Già gestito: drenaggio outbox ad app aperta (pattern esistente in `lib/offline`) |

---

## 7. Decisioni prese (grilling con Edgardo, 2026-08-04)

1. **Perimetro**: app UNICA per tutti — l'operatore vede il suo giorno, l'ufficio
   (se la usa) vede l'hub secondo i permessi-moduli per-utente già esistenti.
2. **Login operatore**: username+password assegnate dall'ufficio, poi biometria/PIN.
   Gestione credenziali (crea + reset) in `/impostazioni/personale`, visibile a
   tutto il backoffice (ruolo `admin`), NON solo admin_plus.
3. **Home operatore**: «Il mio giorno» a RIEPILOGO (conteggi, note ufficio, ODL TOP,
   stato sync) → da lì si entra nel rapportino. Route `/hub/oggi`.
4. **Perimetro moduli campo v1**: MINIMO — home + rapportino + scanner + foto.
   Niente agenda/appuntamenti in v1 (si aggiungono via permessi, senza store).
5. **Tablet = operatori** (99% uso da campo): formato pagina unico e responsive che
   scala telefono→tablet; nessuna rifinitura moduli ufficio in Fase 1.
6. **Nome app**: **Gestilab Plenzich** — appId `it.plenzich.gestilab`.
7. **Canale iOS**: TestFlight per il PILOTA; canale definitivo (Unlisted o ABM
   Custom Apps) deciso a pilota concluso. Android: Play internal/privata.
8. **Push in v1**: sì, catalogo eventi completo ed estensibile (giro assegnato,
   intervento assegnato, intervento rimosso, …) + sottomodulo Impostazioni →
   Notifiche operatori con toggle globali per tipo evento.

---

## 8. Segnalazione sicurezza (fuori scope app, da non dimenticare)

L'advisor Supabase segnala **RLS disabilitata** su 6 tabelle di backup del 2026-07-30:
`bak_committente_manuali_20260730_{int,voci,ops}` e `bak_odl_impianto_20260730_{int,voci,ops}`
→ leggibili/scrivibili con la sola anon key. Opzioni: `ALTER TABLE … ENABLE ROW LEVEL
SECURITY;` (senza policy = accesso bloccato, per backup va bene) oppure eliminarle se
il ripristino non serve più. Da decidere ed eseguire a parte, non in questo branch.
