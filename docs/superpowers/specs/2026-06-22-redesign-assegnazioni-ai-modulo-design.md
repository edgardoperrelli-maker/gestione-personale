# Design — Redesign modulo "Assegnazioni AI" (hub operativo ACEA gerarchico)

**Data**: 2026-06-22
**Tipo**: redesign UI/IA + (fase 2) nuova capacità backend
**Design system**: `DESIGN.md` (sobrio enterprise — token, primitivi `Button`/`Card`/`Dialog`/`Tabs`/`Badge`/`DatePicker`)
**Riferimenti**: HANDOFF.md ("remodule" del modulo), memorie `assegnazione-ai`, `modulo-agente`, `sync-limitazioni-massive-sharepoint`

## 1. Problema

Il modulo `/hub/assegnazione-ai` è funzionale ma "poco chiaro": mescola in un'unica pagina lettura-file, anteprima, "Procedi" (rapportini app) e "Scrivi su ACEA" (Playwright), con un sistema di tab commessa/attività poco esplicito. Le azioni ACEA correlate (aggiorna stato ODL, sincronizza rapportini) vivono in un **secondo** modulo (`/hub/agente`). L'utente vuole una navigazione **gerarchica e intuitiva**: Commessa → Attività → Azione.

## 2. Decisioni (confermate)

| # | Decisione |
|---|-----------|
| D1 | Ridisegnare **solo** `/hub/assegnazione-ai` come hub operativo gerarchico. **`/hub/agente` resta separato e intatto** (scheduler, Prova/Reale, stato Online, mappa Colonne, storico, impostazioni). |
| D2 | La foglia **«Assegna»** ospita **entrambe** le azioni post-lettura: «Crea rapportini (app)» (`assegna`/Procedi) e «Assegna su ACEA» Playwright (`acea-assegna`), con anteprima raggruppata. |
| D3 | **LM va assegnabile anche sul portale** (oggi escluso) → capacità nuova = **Fase 2** (flag `tipo`, feasibility da verificare). |
| D4 | Navigazione **drill-down con breadcrumb**, stato nell'URL (`?commessa=&attivita=&azione=`) per refresh/deep-link. |
| D5 | **Phasing**: Fase 1 = ristrutturazione UI riusando i flussi esistenti (deployabile); Fase 2 = assegnazione LM sul portale dopo verifica. |
| D6 | Le foglie chiamano gli **endpoint già esistenti** (no nuovi flussi in Fase 1). |

## 3. Information Architecture

```
/hub/assegnazione-ai
└─ L0  3 card COMMESSA            [ACEA attiva] · [Committente 2 — disabilitata] · [Committente 3 — disabilitata]
   └─ L1  ACEA → 2 card ATTIVITÀ   [Limitazioni Massive] · [Dunning]
      ├─ L2  Limitazioni Massive → 3 card AZIONE
      │     • Aggiorna ODL            (stato_odl sul file Zagarolo)
      │     • Assegna ODL             (rapportini app + portale ACEA*)
      │     • Sincronizza rapportini  (scrive esiti rapportini sul file)
      └─ L2  Dunning → 2 card AZIONE
            • Aggiorna stato ODL      (stato_odl sul file Dunning)
            • Assegna interventi      (rapportini app + portale ACEA)
```
\* portale-LM = Fase 2.

### Navigazione
- **Drill-down in-pagina**: cliccare una card sostituisce la vista col livello successivo. Stato in **URL query** (`?commessa=acea&attivita=lm&azione=assegna`) → refresh/deep-link/back del browser coerenti.
- **Breadcrumb** in alto (`ACEA / Limitazioni Massive / Assegna ODL`), ogni segmento cliccabile risale di livello; freccia «← Indietro».
- L0 senza query = landing con le 3 card commessa.
- Componenti: `Card interactive` per i nodi navigabili; le commesse non-ACEA sono `Card` disabilitate con badge «in arrivo».

## 4. Foglie-azione (Fase 1)

Ogni foglia è un **pannello focalizzato** (un compito, feedback accanto). Tutte riusano endpoint esistenti.

### 4.1 Aggiorna (stato) ODL — LM e Dunning
- **Trigger**: un pulsante «Aggiorna stato ODL da ACEA» → `POST /api/admin/agente/acea-stato` con `target='zagarolo'` (LM) o `'dunning'` (Dunning).
- **Feedback**: spia Online (da `agente_config.ultimo_contatto_il`) + storico dei giri `tipo='acea-stato'` (riuso `StoricoCard` filtrato).
- Nessuna data: il giro esporta lo stato corrente da ACEA e aggiorna la colonna del master.

### 4.2 Assegna ODL / Assegna interventi — LM e Dunning
Flusso a step nella stessa foglia:
1. **DatePicker** (giorno).
2. **«Sincronizza file»** → `POST /api/admin/agente/leggi-pianificabili` (`pianifica_data=giorno`) → l'agente legge il file e popola `agente_pianificabili`. Stato d'attesa "richiesta inviata, parte al prossimo contatto".
3. **Anteprima raggruppata** per operatore → comune (riuso componente estratto `AnteprimaPianificazione`, da `POST /api/admin/agente/anteprima`), con stato libero/conflitto, selezione, e «✕ rimuovi operatore» (`POST /api/admin/agente/scarta`).
4. **Due azioni**:
   - **«Crea rapportini (app)»** → `POST /api/admin/agente/assegna` (piani+interventi+rapportini nel DB; storico `assegnazione_ai_log`).
   - **«Assegna su ACEA»** con toggle **Prova/Reale** → `POST /api/admin/agente/acea-assegna` (`forza_acea_assegna`, `acea_assegna_data`, `acea_assegna_dry`). In Fase 1 attiva per **Dunning**; per LM vedi §6.
5. **Pannello esiti ACEA** (riuso `PannelloAceaAssegna`): polling `GET /api/admin/agente/acea-esiti?data=` (ultimo run `acea-assegna` + `acea_assegnazioni_log`), tabella per ODL.

### 4.3 Sincronizza rapportini — LM
- **Trigger**: «Esegui ora» → `POST /api/admin/agente/esegui-ora` (`forza_giro=true`) → il giro sync scrive gli esiti dei rapportini sul file SharePoint.
- **Feedback**: storico `tipo='sync'` (riuso `StoricoCard` filtrato) + spia Online.
- La **mappa Colonne** (come scrive il sync) resta in `/hub/agente` (D1); qui un link «Configura colonne in Agente».

## 5. Refresh automatico post-tick (richiesta UI #4)

Le azioni che passano dal tick (`leggi-pianificabili`, `acea-stato`, `acea-assegna`, `esegui-ora`) sono asincrone (l'agente risponde "al prossimo contatto"). Le foglie interessate fanno **polling leggero** dello stato pertinente (es. `acea-esiti`, oppure ricaricano anteprima/storico) e si **auto-aggiornano** quando il run compare, così l'utente non resta sulla vista "richiesta inviata…". Polling con backoff, stop a esito ricevuto o dopo N tentativi; rispetta la latenza del tick (1 min).

## 6. Fase 2 — Assegnazione LM sul portale ACEA (nuova capacità)

**Obiettivo**: «Assegna su ACEA» funzionante anche per le Limitazioni Massive (Zagarolo), oggi escluse.

**Incognita da verificare PRIMA**: gli ODL LM (prefisso 912…) sono cercabili/assegnabili sul Cruscotto "Pianificazione Lavori Idrico"? L'esclusione attuale è una scelta (`agente_file_config.attivita`), non necessariamente un limite del portale — da confermare con un dry-run mirato sul PC.

**Modifiche (se feasible)**:
- **Flag tipo**: `acea-assegna` accetta `tipo ∈ {lm, dunning}` → `agente_config.acea_assegna_tipo` (nuova colonna) → ritornato dal tick.
- **Sorgente lista**: `app/api/agente/acea-assegnazioni/route.ts` (⚠️ hook-protected) filtra per tipo — `dunning` = comportamento attuale (esclude LM); `lm` = include **solo** LM. Oggi il filtro è cablato a "escludi LM".
- **Agente Node**: l'orchestratore di assegnazione usa la lista del tipo richiesto (il driver `assegnaInterventi.mjs` è generico, **non** si tocca).
- **UI**: la foglia LM·Assegna ODL abilita «Assegna su ACEA» (oggi solo «Crea rapportini»).

Fino alla Fase 2, la card LM·Assegna ODL mostra «Crea rapportini (app)» attivo e «Assegna su ACEA» disabilitato con nota «in arrivo».

## 7. Componenti (estrazione + riuso)

Il client attuale (`AssegnazioneAiClient.tsx`, ~900 righe) viene **decomposto**:

| Nuovo file | Responsabilità | Origine |
|---|---|---|
| `AssegnazioniAiClient.tsx` (riscritto) | router drill-down (URL state) + render livelli | nuovo shell |
| `components/modules/assegnazione-ai/CommessaGrid.tsx` | L0: 3 card commessa | nuovo |
| `…/AttivitaGrid.tsx` | L1: card LM/Dunning | nuovo |
| `…/AzioneGrid.tsx` | L2: card azione per attività | nuovo |
| `…/foglie/AggiornaStatoOdl.tsx` | foglia aggiorna stato | da AgenteClient §Stato (acea-stato) |
| `…/foglie/AssegnaOdl.tsx` | foglia assegna (data→leggi→anteprima→2 azioni→esiti) | da AssegnazioneAiClient |
| `…/foglie/SincronizzaRapportini.tsx` | foglia esegui-ora + storico sync | da AgenteClient §Esegui ora |
| `…/AnteprimaPianificazione.tsx` | anteprima raggruppata + scarta | estratto (oggi inline 456-563) |
| `…/PannelloAceaAssegna.tsx` | Prova/Reale + scrivi-acea + esiti | estratto (oggi inline 357-433) |
| `Breadcrumb.tsx` (in modulo o ui) | breadcrumb navigazione | nuovo |

Riuso diretto: `StoricoCard` (filtrato per `tipo`), `DatePicker`, `raggruppaCommessaAttivita`, e tutti i primitivi `DESIGN.md`.

## 8. Dati & endpoint (invariati in Fase 1)

Nessuna migration in Fase 1. Endpoint usati: `acea-stato`, `leggi-pianificabili`, `anteprima`, `assegna`, `scarta`, `acea-assegna`, `acea-esiti`, `esegui-ora`, `assegnazioni`. Tabelle: `agente_config` (flag one-shot), `agente_pianificabili`, `assegnazione_ai_log`, `acea_assegnazioni_log`, `agente_run`. Fase 2 aggiunge `agente_config.acea_assegna_tipo`.

## 9. Gating / registrazione

`assegnazione-ai` resta in `lib/moduleAccess.ts` (key invariata, `adminOnly`, gruppo `pianificazione`), gate ruolo admin nella page server (invariato). `/hub/agente` resta registrato e invariato. Nessuna unificazione moduli (D1).

## 10. Adesione al design system (DESIGN.md)

Tutto via token `var(--…)`/utility `@theme`; primitivi `Card`/`Button`/`Badge`/`Tabs`/`Dialog`/`DatePicker`; `--on-primary` sui fill accentati; `--status-*` per spie stato (Online, esiti, conflitti); tabelle dense + header sticky; focus ring blu; sentence case; niente hex/glow/oro. Icone da `moduleIcons.tsx`.

## 11. Fuori scope

- `/hub/agente` (intatto), il driver Playwright e i comandi PowerShell, il fix-filtri (task separato, già deployato).
- **Sovrapposizione voluta**: le azioni `acea-stato` ed `esegui-ora` restano innescabili anche da `/hub/agente` (D1 — non si rimuove nulla da lì). Il nuovo modulo è la superficie operativa *organizzata* che chiama gli stessi endpoint; `/hub/agente` resta la superficie di *configurazione/diagnostica*. Non è una duplicazione di logica (stesso flag one-shot), solo due punti d'innesco.
- Le commesse non-ACEA (placeholder disabilitati).
- Cambi al modello dati dei rapportini / alla logica di `sincronizzaRapportini`.

## 12. Phasing & criteri di accettazione

**Fase 1 (UI, deployabile)**
1. Landing `/hub/assegnazione-ai` mostra 3 card commessa (solo ACEA attiva); drill-down con breadcrumb + URL state; back del browser coerente.
2. ACEA → LM mostra 3 card azione; ACEA → Dunning mostra 2 card.
3. Ogni foglia esegue il suo flusso esistente (aggiorna stato, assegna = leggi→anteprima→crea rapportini + scrivi ACEA Dunning, sincronizza rapportini) con feedback + auto-refresh post-tick.
4. `/hub/agente` invariato; nessuna regressione sugli endpoint.
5. UI conforme a `DESIGN.md` (nessun hex/glow/`text-white` su fill).

**Fase 2 (LM portale)**
6. Verificata la feasibility (ODL LM assegnabili sul Cruscotto).
7. «Assegna su ACEA» abilitato per LM; `tipo` instradato correttamente; il driver invariato riceve la lista LM giusta.
