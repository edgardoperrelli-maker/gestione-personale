# Design — Barra "In attesa dell'agente" (Assegnazione AI)

**Data**: 2026-06-23
**Tipo**: feature UI front-end (no backend, no migration, no modifiche all'agente)
**Base**: `origin/main` (modulo `assegnazione-ai` redisegnato, con foglie)

## 1. Problema

Le azioni che passano dal tick dell'agente (Sincronizza file, Aggiorna stato ODL, Assegna su ACEA, Esegui ora) oggi mostrano solo un messaggio testuale + un polling fisso di 90s che **si ferma anche se l'agente non ha ancora finito**. Chi lancia la richiesta non sa quando è completata → deve premere F5.

## 2. Soluzione

Un indicatore **"In attesa dell'agente"** riusabile, **front-end only**, che dopo il click:
- mostra una **barra animata indeterminata** "⟳ In attesa dell'agente… (parte entro ~1 min · da HH:MM)";
- fa **polling finché il risultato arriva** (non si ferma a 90s) → niente F5;
- quando il risultato compare, sparisce e lascia spazio all'esito già esistente (run/righe/storico);
- **anti-stallo**: dopo una soglia mostra "ci sta mettendo più del previsto…" SENZA fermare il polling.

Serve a **chi lancia** la richiesta (stato locale del client). Il caso cross-utente (un altro utente vede la barra senza aver cliccato) è **fuori scope**.

## 3. Componenti

### `lib/agente/attesaAgente.ts` (PURO, testabile)
- `type StatoAttesa = 'idle' | 'attesa' | 'stallo'`
- `function statoAttesa(inAttesa: boolean, dispatchedAtMs: number | null, nowMs: number, sogliaStalloMin: number | null): { stato: StatoAttesa; minuti: number | null }`
  - `!inAttesa` → idle; altrimenti `attesa`, e `stallo` se `sogliaStalloMin != null && minuti >= sogliaStalloMin`. `minuti` = floor((now-dispatchedAt)/60000), mai negativo.

### `components/modules/assegnazione-ai/useAttesaAgente.ts` (hook)
- `useAttesaAgente({ inAttesa, fatto, onPoll, intervalloMs = 6000 })`
  - finché `inAttesa && !fatto`: `setInterval(onPoll, intervalloMs)`; cleanup su cambio/`fatto`/unmount.
  - non gestisce il rendering: la barra usa `statoAttesa` con un `oraTick` che avanza per ricalcolare i minuti.

### `components/modules/assegnazione-ai/BarraAttesaAgente.tsx`
- props `{ dispatchedAt: number | null; fatto: boolean; sogliaStalloMin?: number | null; etichetta?: string }`
- usa `statoAttesa` (+ un tick interno ogni 20s per i minuti); rende:
  - `attesa` → barra `.barra-indeterminata` (già in `globals.css`) + "⟳ {etichetta} — in attesa dell'agente… (da HH:MM)";
  - `stallo` → riquadro `--warning` "ci sta mettendo più del previsto: controlla qui sotto o riprova";
  - `idle` → `null`.
- Se `sogliaStalloMin` è `null` → mai stallo (per l'assegnazione ACEA, che può durare a lungo: mostra solo "in corso da N min").

## 4. Aggancio sulle 4 azioni (in `foglie/AssegnaOdl.tsx`, `AggiornaStatoOdl.tsx`, `SincronizzaRapportini.tsx`)

Ogni foglia tiene `dispatchedAt: number | null` (impostato al click) e calcola `fatto` confrontando **timestamp lato server** (no sfasamenti d'orologio):

| Azione | foglia | `fatto` quando | `onPoll` | sogliaStalloMin |
|---|---|---|---|---|
| Sincronizza file (`leggi-pianificabili`) | AssegnaOdl | `pianificaData` torna `null` (agente ha letto) | `router.refresh()` | 12 |
| Aggiorna stato ODL (`acea-stato`) | AggiornaStatoOdl | nuovo run `acea-stato` con `creato_il > baseline` | `router.refresh()` | 12 |
| Esegui ora (`sync`) | SincronizzaRapportini | nuovo run `sync` con `creato_il > baseline` | `router.refresh()` | 12 |
| Assegna su ACEA (`acea-assegna`) | AssegnaOdl | nuovo esito `acea-assegna` (`acea-esiti.ultimoRun.creato_il > baseline`) | `caricaAceaEsiti(giorno)` | **null** (durata variabile) |

- **Baseline anti-skew**: al click si registra il `creato_il` dell'ultimo run/esito pertinente (`baselineTs`); `fatto` = esiste un run/esito con `creato_il > baselineTs`. Per `leggi-pianificabili` il "fatto" è il flag `pianificaData` che si azzera (nessun timestamp).
- Al `fatto`, la foglia azzera `dispatchedAt` (stop).
- Sostituisce l'attuale `usePollRuns` (polling fisso 90s) dove presente.

## 5. Fuori scope
- Segnali backend `*_in_corso` / cross-utente.
- `/hub/agente` (altro modulo).
- Progress preciso X/N per-ODL.

## 6. Criteri di accettazione
1. Dopo il click su una delle 4 azioni compare subito la barra "In attesa dell'agente…".
2. Quando il risultato arriva (run/righe/esito), la barra sparisce e compare l'esito **senza F5**.
3. Il polling **non si ferma** prima del risultato (oltre i 90s di prima).
4. Per le 3 azioni rapide, dopo ~12 min senza esito → messaggio anti-stallo (polling continua). Per l'Assegna su ACEA niente falso allarme (durata variabile).
5. Nessuna migration, nessun cambio all'agente; build verde.
