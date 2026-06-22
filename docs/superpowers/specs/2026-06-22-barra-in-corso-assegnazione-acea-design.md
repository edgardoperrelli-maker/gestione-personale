# Design — Indicatore "Assegnazione in corso" su ACEA (app-only)

**Data**: 2026-06-22
**Tipo**: feature UI/backend app-only (no agente/driver, no propagazione PC)
**Base**: `origin/main` (include redesign Assegnazioni AI + `PannelloAceaAssegna`)

## 1. Problema

Quando un utente lancia "Assegna su ACEA", l'agente esegue il giro Playwright **sul PC** (anche minuti). L'app oggi mostra solo "richiesta inviata, parte al prossimo contatto" e l'esito **finale** quando arriva. Un utente **remoto, senza accesso al PC**, non sa se l'assegnazione è **in corso o finita**.

## 2. Soluzione (app-only)

Un segnale "in corso" nel DB, scritto e spento dai punti dell'app che già conoscono inizio e fine del giro — **senza toccare l'agente né il driver Playwright** (quindi nessuna ricopia al PC).

### Flusso del segnale
- **Dispatch (tick)**: quando `POST /api/agente/tick` consuma `forza_acea_assegna` (sta passando il giro all'agente), setta `acea_assegna_in_corso=true` + `acea_assegna_started_at=now()`.
- **Fine (report)**: quando arriva `POST /api/agente/report` con `tipo==='acea-assegna'`, setta `acea_assegna_in_corso=false`.
- **Esposizione (esiti)**: `GET /api/admin/agente/acea-esiti?data=` ritorna anche `inCorso` + `startedAt` (letti da `agente_config`).
- **UI (`PannelloAceaAssegna`)**: se `inCorso` → **barra animata indeterminata** "Assegnazione in corso… (N ODL · da HH:MM)"; quando si spegne → l'esito già esistente ("Completato: X assegnati, Y scartati"). Polling attivo finché `inCorso`.

### Dettagli
- **Barra indeterminata** (animata, non X/N): app-only non conosce il progresso per-ODL senza toccare il driver. Risponde al bisogno ("è finito o no?"). `N` = conteggio ODL già noto all'app (contesto).
- **Anti-stallo**: se `startedAt` è più vecchio di **10 minuti** e `inCorso` è ancora true (agente crashato/giro mai chiuso), la UI mostra "Possibile interruzione — controlla l'esito" invece di girare all'infinito. (Il flag resta true nel DB finché un nuovo dispatch o report non lo cambia; la staleness è solo presentazione lato UI.)
- **Multi-utente**: il segnale vive in `agente_config` (singleton) → ogni utente, anche remoto, vede lo stesso stato.

## 3. Modifiche per file

| File | Modifica |
|------|----------|
| **Migration** `agente_config` | `+ acea_assegna_in_corso boolean not null default false`, `+ acea_assegna_started_at timestamptz`. SQL consegnata a parte, la lancia l'utente. |
| `app/api/agente/tick/route.ts` | Nel blocco che consuma `forza_acea_assegna` (≈130-133): aggiungere `acea_assegna_in_corso: true, acea_assegna_started_at: now.toISOString()` all'update. |
| `app/api/agente/report/route.ts` | Nell'update `agente_config` finale (≈67-70): se `tipo==='acea-assegna'`, aggiungere `acea_assegna_in_corso: false`. |
| `app/api/admin/agente/acea-esiti/route.ts` | Leggere `acea_assegna_in_corso` + `acea_assegna_started_at` da `agente_config` e includerli nella risposta (`inCorso`, `startedAt`). |
| `components/modules/assegnazione-ai/PannelloAceaAssegna.tsx` | Nuova props `inCorso`/`startedAt` (dal tipo `AceaEsiti`); rendering barra animata + anti-stallo; il polling esistente continua finché `inCorso`. |
| `components/modules/assegnazione-ai/foglie/AssegnaOdl.tsx` | Passa `inCorso`/`startedAt` (da `aceaEsiti`) al pannello; il polling `usePollRuns`/`caricaAceaEsiti` resta attivo mentre `inCorso`. |
| `components/modules/assegnazione-ai/tipi.ts` | `AceaEsiti` + `inCorso: boolean`, `startedAt: string | null`. |

## 4. Fuori scope
- **Agente Node e driver Playwright**: invariati (no ricopia PC).
- **Barra precisa X/N**: fase 2 separata (richiederebbe il driver che riporta per-ODL).
- La barra di caricamento per gli ALTRI giri (acea-stato, sincronizza): non in questo scope (eventuale estensione futura con lo stesso pattern).

## 5. Criteri di accettazione
1. Cliccando "Assegna su ACEA", entro il prossimo tick la UI mostra **"Assegnazione in corso…"** (barra animata) anche su un altro dispositivo/utente.
2. Quando l'agente finisce (report `acea-assegna`), la barra sparisce e compare l'esito (X assegnati).
3. Se il giro non si chiude entro ~10 min, la UI segnala possibile interruzione (no spinner infinito).
4. Nessuna modifica all'agente Node / driver; solo app + 1 migration. `/hub/agente` invariato.
