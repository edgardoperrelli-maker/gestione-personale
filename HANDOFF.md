# Handoff — Modulo Assistenza: co-browsing live back office ↔ operatore (2026-07-22)

> Documento di ripresa per una NUOVA chat: autosufficiente, la sessione precedente non c'è più.
> Lavoro sul branch `claude/modulo-assistenza-live` (produzione = `main`).
> Sostituisce l'handoff dello studio di fattibilità (PR #157, mergiata): quel contenuto vive in
> `docs/connessione-remota-fattibilita.md` e nella voce ROADMAP dedicata.

## Goal

Integrare come funzionalità reale l'esito dello studio di fattibilità sulla connessione remota
(`docs/connessione-remota-fattibilita.md`, PR #157): il back office **vede in diretta il rapportino
dell'operatore** (fedele al 100%: dati **ed** errori) e lo guida, **previa accettazione**, con
richiesta **bidirezionale** (operatore→BO e BO→operatore sul rapportino del giorno) e **multi-sessione**.

## Current status

**COMPLETATO e VALIDATO end-to-end** su dispositivi reali (iPhone operatore + desktop back office,
preview Vercel): l'utente ha confermato che il replay live si popola. `tsc` 0, `eslint` 0,
`npx vitest run lib/assistenza/` = 6 verdi. `next build` compila (il fail successivo in cloud è la
service key assente su una route ACEA preesistente — limite d'ambiente noto). **Migration
`20260722140000_assistenza_sessioni.sql` APPLICATA al prod il 22/07** (verificata: tabella presente,
RLS attiva, 0 policy). **PR #162 aperta** verso `main`; conflitto ROADMAP/HANDOFF con la #157 risolto
nel merge di `origin/main` nel branch (tenute entrambe le voci ROADMAP, HANDOFF = sessione più recente).

## Architettura (com'è fatta)

- **Trasporto** (`lib/assistenza/transport.ts`): Supabase Realtime **broadcast + presence**, EFFIMERO —
  zero scritture di dati rapportino su DB. Eventi rrweb: JSON → **gzip** (CompressionStream, ~10×) →
  **base64** (niente inflazione da escape JSON) → **chunk ≤120KB** (il broadcast Supabase scarta i
  messaggi oltre ~256KB **in silenzio**: era la causa n.1 del replay vuoto — lo snapshot di un
  rapportino reale con 100+ voci e CSS Tailwind inlinato supera il MB). Mittente con **coda
  sequenziale** (ordine garantito) + **retry** sui drop + callback `onDrop`; ricevitore con coda async
  e fallback `z=0` non compresso. Canale lobby `assist-richieste` per le richieste operatore→BO.
- **Sicurezza canale** (`lib/assistenza/canale.ts`, `server-only`): canale `assist:<sid>` con
  **sid = HMAC-SHA256 del token** (`ASSIST_CHANNEL_SECRET` o service key come chiave). Il token grezzo
  non lascia mai il server: l'operatore riceve il sid nella pagina server-rendered, l'admin dalla API
  `requireAdmin`. Chi ha la sola anon key non può derivare il canale.
- **Operatore** (`components/assistenza/OperatoreAssistenza.tsx`, montato in `app/r/[token]/page.tsx`):
  FAB 🛟 → "Chiedi assistenza" (pubblica in lobby e inizia a condividere) oppure **modale a schermo**
  Accetto/Rifiuto quando la richiesta arriva dal BO. rrweb `record()` **on-demand** (import dinamico),
  `maskAllInputs` opzionale ("Oscura i campi"), re-invio di `start`+full-snapshot quando un admin
  (ri)entra (presence) o richiede. Avviso "connessione instabile" sui drop.
- **Back office** (`app/hub/assistenza` + `components/modules/assistenza/`): `AssistenzaClient` =
  richieste in arrivo (lobby) + sessioni aperte (**multi-sessione**, una card per operatore) +
  rapportini di oggi con **filtro MultiSelect operatori + ricerca** (niente lista intera di default;
  API `GET /api/admin/assistenza/rapportini-oggi`, ritorna **solo sid**, mai il token).
  `SessionePanel` = Replayer rrweb **liveMode** creato al PRIMO evento con **`startLive(ts_sorgente
  - 1000)`** (ancorato al clock della sorgente: con `startLive()` nudo un telefono col clock avanti
  schedula tutto "nel futuro" → schermo bianco — causa n.2), CSS `rrweb/dist/style.css`, **scala del
  viewport** sorgente alla larghezza del pannello, contatore "eventi N / errori M", suggerimenti
  testuali → toast sull'operatore.
- **Registrazione modulo**: `lib/moduleAccess.ts` (`assistenza`, adminOnly + `requiresAdminRole`) +
  icona in `components/layout/moduleIcons.tsx`. Fix trasversale: i moduli `requiresAdminRole`
  (impostazioni, assistenza) sono **sempre** nella lista degli admin anche se assenti dalla
  `allowedModules` salvata (prima un modulo nuovo non compariva in sidebar).
- **Audit**: `assistenza_sessioni` (sid, staff, data, admin_id, origine, avviata_at) via
  `POST /api/admin/assistenza/log` — best-effort, RLS senza policy (solo service role).

## La diagnosi del "replay vuoto" (per non ricascarci)

1. **Payload oltre il limite broadcast** → snapshot mai assemblato (drop silenziosi). Fix: gzip+base64+
   chunk piccoli. 2. **Clock skew** con `startLive()` non ancorato. Fix: `startLive(primoTs-1000)`.
3. **Diagnostica cieca** (errori `addEvent` inghiottiti, esito `send` ignorato). Fix: contatori + retry.
Verificato con harness Playwright locale (rrweb UMD reale: il pattern del player renderizza; il collo
era il percorso di rete) + 6 test vitest sul transport reale + conferma utente sul campo.

## Key files & commands

- `lib/assistenza/transport.ts` — cuore del trasporto (test: `lib/assistenza/transport.test.ts`).
- `lib/assistenza/canale.ts` — HMAC sid (server-only).
- `components/assistenza/OperatoreAssistenza.tsx` · `components/modules/assistenza/{AssistenzaClient,SessionePanel}.tsx`
- `app/api/admin/assistenza/{rapportini-oggi,log}/route.ts` · `app/hub/assistenza/page.tsx`
- `npx vitest run lib/assistenza/` · `npx tsc --noEmit` · `npx eslint lib/assistenza components/assistenza components/modules/assistenza`

## Warnings (invarianti da non violare)

- **Mai far uscire il token grezzo** dal server verso l'admin: solo il **sid** HMAC. Non cambiare la
  derivazione senza ruotare anche il canale.
- **Niente scritture di dati rapportino** dal canale assistenza: il broadcast è effimero by design.
- Il **chunk ≤120KB post-base64** è calibrato sul limite ~256KB del broadcast: non alzarlo.
- `startLive` va **ancorato al timestamp del primo evento** (clock sorgente), mai a `Date.now()` admin.
- rrweb è **on-demand**: non importarlo staticamente nelle pagine operatore (peso bundle mobile).
- Repo **PUBBLICO**: mai token/segreti in commit; `ASSIST_CHANNEL_SECRET` opzionale via env.

## Open questions / possibili follow-up

- **Autorizzazione canale più forte**: oggi il sid HMAC è non-indovinabile ma chi lo conosce può
  iscriversi con l'anon key; valutare Realtime Authorization (RLS su `realtime.messages`).
- **Redazione PII di default** lato operatore (oggi opzionale col toggle "Oscura i campi"): valutare
  mask-by-default sui campi anagrafici, come raccomandato dallo studio (§7).
- Punti ciechi noti del mirroring DOM: mappe/canvas e anteprima camera live non si replicano.
- `terminata_at` in `assistenza_sessioni` non è ancora valorizzato (serve un beacon di fine sessione).
