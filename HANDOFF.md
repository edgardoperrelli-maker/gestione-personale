# Handoff — Studio di fattibilità: connessione remota back office → dispositivo (2026-07-22)

> Documento di ripresa per una NUOVA chat: autosufficiente, la sessione precedente non c'è più.
> Lavoro sul branch `claude/remote-connection-feasibility-fb4kkc` (produzione = `main`). Task ATLAS.
> ⚠️ Questa è una sessione di **SOLO DOCUMENTAZIONE**: nessuna riga di codice applicativo, nessuna
> migration, nessuna dipendenza installata.

## Goal

Valutare la fattibilità di far accedere il **back office** al dispositivo dell'operatore **in remoto**,
**tramite il link** e **previa accettazione dell'operatore**, per **risolvere problemi sull'app**.
Deliverable = uno studio di fattibilità nel formato di `docs/mapcn-fattibilita.md`.

## Current status

**COMPLETATO.** Prodotto `docs/connessione-remota-fattibilita.md`; ROADMAP.md aggiornato (voce in "Fatto").
Nessun test/build da eseguire (solo `.md`). Pronto per PR con riga `ATLAS-Item`.

## Verdetto in una riga

Un "TeamViewer nel browser" (vedere/**controllare** lo schermo del telefono da una PWA) **NON è
realizzabile** sul target mobile. La via web realistica è il **co-browsing / mirroring del DOM** della sola
app gp: **vista assistita + guida, non controllo**.

## Decisioni chiave (fatti verificati in modo adversariale — MDN/caniuse/Chromium/W3C/Supabase)

1. **`getDisplayMedia` (cattura schermo web) NON esiste sui browser mobili.** iOS = tutti i browser sono
   WebKit, mai supportato; Android Chrome = API deliberatamente **nascosta** da Chrome 88 (il `typeof` check
   dà **falsi positivi** → serve verifica funzionale/di piattaforma). → **Screen-share WebRTC = non fattibile
   su mobile.**
2. **Controllo remoto (iniezione input) IMPOSSIBILE con sole Web API.** Serve un agente nativo lato-OS. La
   nuova API sperimentale *Captured Surface Control* inoltra solo scroll/zoom su surface **locali** desktop —
   non abilita nulla di remoto.
3. **Unica via web-only su mobile = co-browsing / mirroring del DOM** (rrweb self-host **oppure** SaaS tipo
   Cobrowse.io): trasmette la **struttura** (DOM), non i pixel → aggira il blocco. Copre **solo l'app gp**;
   **punti ciechi**: canvas/mappe (Leaflet/maplibre), anteprima **fotocamera live** (`getUserMedia` dello
   scanner), UI di sistema/altre app/tastiera nativa.
4. **Supabase Realtime broadcast** può fare da trasporto/signaling **senza nuovo server** (già nell'infra, ma
   finora usato **solo** `postgres_changes`; broadcast/presence mai adottati). Per lo screen-share WebRTC
   servirebbe anche un **TURN** (reti mobili con CGNAT), ma quell'approccio è comunque bloccato a monte.
5. **Percorso consigliato (a fasi):** Fase 0 fondamenta (consenso per-sessione da token, audit, autorizzazione
   canale, marcatura PII) → **Fase 1 diagnostica remota async** (session-replay rrweb + log, evoluzione di
   "invia segnalazione", 100% stack, dati EU) → **Fase 2 co-browsing near-live** (rrweb `liveMode` su Supabase
   broadcast, o buy Cobrowse.io con PoC). **Escludere** screen-share WebRTC e tool nativi (fuori perimetro
   PWA, iOS non controllabile, privacy peggiore) salvo tampone d'emergenza.

## Done

- `docs/connessione-remota-fattibilita.md` — studio completo: §1 verdetto sintesi, §2 vincolo `getDisplayMedia`,
  §3 cosa si può/non si può via Web API, §4 punti d'aggancio nel repo, §5 cinque approcci con verdetti, §6
  rischi/mitigazioni, §7 privacy/GDPR, §8 piano a fasi, + fonti.
- `ROADMAP.md` — nuova voce ✅ in cima a "Fatto".
- `HANDOFF.md` — questo documento.

## Punti d'aggancio nel codice (per una futura implementazione)

- **Il "link" = token** non autenticato: `app/r/[token]`, `app/agenda/[token]`, `app/pi/[token]` (+ API
  `app/api/r|pi|agenda/[token]/*`). Token con validità/revoca (`pi_token`, `rapportini`), generati da admin.
  L'operatore **non ha identità Supabase** → il consenso va ancorato al **token**, per-sessione, revocabile.
- **Realtime**: pattern `.channel(...)` già in `lib/pi/useProntoInterventoCount.ts`,
  `lib/interventi/useInterventiFeed.ts`, `app/hub/hotel-calendar/page.tsx` (quest'ultimo usa `createClient` con
  **sola anon key**, senza sessione — modello per il client operatore net-new). Broadcast/presence: da introdurre.
- **Supporto esistente da evolvere**: `app/api/segnala/route.ts` → hub ATLAS (titolo+testo+1 screenshot, async,
  login-gated). Pattern **proxy-con-segreto-server-side** (`ATLAS_REPORT_SECRET`) riusabile per TURN/licenze.
- **Storage/foto** riusabile per i pacchetti diagnostici: `app/api/r/[token]/foto-campo/route.ts` (route token +
  Supabase Storage + signed URL) è il modello quasi 1:1.
- **Media**: `getUserMedia` in `components/modules/rapportini/risanamento/ScannerMisuratore.tsx`;
  `getDisplayMedia` mai usato. SW **Serwist** solo caching; **nessun manifest PWA** → app in-browser.

## Warnings (invarianti da non violare)

- **⚠️ Privacy prima di tutto.** La schermata operatore (`RapportinoForm`, servita via `supabaseAdmin` che
  **bypassa la RLS** — `lib/rls.ts` è vuoto) espone **PII di terzi**: nominativo, indirizzo, recapito, PDR,
  matricola, ODL, GPS, note libere. Ogni mirroring/replay è un **nuovo trattamento**: redazione **fail-closed**
  (allowlist), consenso per-sessione, retention breve, audit, `requireAdmin`. Il consenso dell'operatore **non**
  basta a coprire i dati dei clienti mostrati → la **minimizzazione (redazione)** è la vera mitigazione.
- Repo **PUBBLICO**: mai token di sessione, credenziali TURN o license key SaaS in commit — solo env
  server-side o chiavi anon già esposte con RLS.
- `skipWaiting`+`clientsClaim` del SW: un deploy con nuovo SW può **troncare** una sessione live.
- Se si userà Realtime broadcast per l'operatore anon: **autorizzare il canale** (RLS su `realtime.messages` o
  `sessionId`/segreto effimero derivato dal token), mai canale pubblico con id indovinabile.

## Open questions / possibili follow-up

- Buy vs build per il live: **rrweb self-host** (controllo dati, dati EU, più effort) vs **Cobrowse.io**
  (time-to-value, compliance pronta, costo per-agente, PoC obbligatorio su iOS/Android + SW/token/PWA).
- **Surfly** (reverse-proxy) escluso in prima battuta per possibili conflitti con SW Serwist/token/PWA: valutare
  solo dopo PoC.
- Le **mappe** (Leaflet/maplibre) e la **camera live** non si replicano fedelmente: per problemi lì, il
  co-browsing non aiuta → affiancare log/screenshot.
