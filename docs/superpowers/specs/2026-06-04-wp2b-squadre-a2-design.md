# WP2b — Interventi a 2 operatori (appaiamento dinamico, solo distribuzione)

> Spec di design. Metodo: brainstorming → **spec (questo file)** → writing-plans → subagent-driven-development.
> WP2b è il secondo sotto-progetto di **WP2 — Fase 3** (dopo WP2a). Regole comuni e gate: vedi `docs/superpowers/roadmap-handoff.md`.

## 1. Contesto e obiettivo

Alcuni interventi richiedono **2 operatori** (es. misuratori pesanti, sicurezza). Oggi l'app ignora del tutto questa necessità: il flag esiste su entrambi i lati (`interventi.richiede_due_operatori` → `Task.requiresTwoOperators`, mappato in WP1) ma:
- **dall'Excel non viene parsato** (la colonna "Num Risorse" del template non è letta);
- la **distribuzione lo ignora**: un intervento a-2 è trattato come un task qualsiasi (1 operatore).

**Obiettivo WP2b.** Riconoscere gli interventi a-2 e permettere all'ufficio di **appaiare manualmente un secondo operatore** durante la distribuzione sulla mappa, con l'intervento visibile in entrambe le sequenze. Tutto a livello di **distribuzione runtime**: nessuna migration, nessuna persistenza del 2° operatore (primo passo).

## 2. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Modello squadre | **Appaiamento dinamico**: nessuna tabella `squadre`, nessuna entità persistente. |
| Scope del 2° operatore | **Solo distribuzione sulla mappa**: nessuna migration, nessuna persistenza del 2°, agenda invariata. |
| Meccanismo | **Manuale esplicito**: l'ufficio sceglie il 2° operatore per ogni intervento a-2 (nessun automatismo). |
| Visualizzazione | L'intervento a-2 compare in **entrambe** le sequenze (principale + 2°); nella lista del 2° è informativo (km/ETA non ricalcolati). |
| Conteggio carico | L'intervento a-2 conta **1** nel solo principale; il 2° non vede ridotta la capacità. |
| Persistenza | **Invariata**: si salva solo l'operatore principale (`staff_id`); il 2° non è persistito. |

## 3. Componenti

### 3.1 Riconoscere gli interventi a-2
- **Da DB:** già fatto (WP1: `mapInterventoToTask` mappa `requiresTwoOperators: row.richiede_due_operatori ?? undefined`).
- **Da Excel** (`utils/routing/excelParser.ts`): aggiungere alla `ColMap` un campo `numRisorse: number | null`; nel formato "Export Dati" risolverlo con `findCol([/num.*risors/, /^risorse$/, /operatori/, /n.*risorse/])`; ATTGIORN/Massiva → `null` (additivo, come fatto per `durata` in WP2a). In `parseExcelToTasks`: `requiresTwoOperators: colMap.numRisorse != null ? (Number.parseInt(str(row[colMap.numRisorse]), 10) >= 2 || undefined) : undefined` (>=2 → true; 1/vuoto → undefined).

### 3.2 Helper puro `utils/routing/coppiaA2.ts` (+ `.test.ts`)
- `isCoppiaValida(principaleId: string, secondoId: string | null | undefined, idsSelezionati: string[]): boolean` — true se `secondoId` è valorizzato, diverso da `principaleId`, e presente in `idsSelezionati`. Usato dalla UI per abilitare/validare la scelta del 2° operatore. Puro, testabile.

### 3.3 Stato runtime e UI (`components/modules/mappa/MappaOperatoriClient.tsx`, file CALDO)
- **Nuovo stato:** `const [secondoOperatore, setSecondoOperatore] = useState<Record<string, string>>({})` — mappa `interventoId → staffId del 2° operatore`.
- **Reset:** azzerare `secondoOperatore` negli stessi punti in cui si rigenera la distribuzione (`distributeToOps`, `clearExcel`, `caricaInterventiDelGiorno`, `handleFileChange`).
- **Selettore 2° operatore:** nella lista dei task dell'operatore attivo (l'IIFE su `distribution[activeOpIdx]`, dove WP2a ha aggiunto l'ETA), per i task con `t.requiresTwoOperators`:
  - badge **"2 operatori"**;
  - un selettore che lista gli operatori selezionati ≠ principale (stesso pattern del selettore "Sposta" esistente), filtrati da `isCoppiaValida`; al click imposta `secondoOperatore[t.id] = staffId`. Se già impostato, mostra "· con [nome 2°]" e permette di cambiarlo/rimuoverlo.
- **Visualizzazione in entrambe le sequenze:** quando si renderizza la lista dell'operatore attivo, oltre ai task dove è **principale**, mostrare anche gli interventi a-2 in cui è il **2° appaiato** (cioè i `t` per cui `secondoOperatore[t.id] === operatore attivo`), con badge **"supporto a [nome principale]"**. Queste righe sono **informative**: non entrano nel calcolo di km/ETA/ordine del 2° (primo passo).

### 3.4 Persistenza (invariata)
Nessuna modifica a `POST /api/interventi/distribuzione`, a `mappa_piani`, né all'agenda. L'intervento a-2 si salva con l'operatore **principale** (come oggi). Il 2° vive solo nello stato della mappa.

## 4. Error handling / edge case
- Num Risorse assente/non numerico → `requiresTwoOperators` resta `undefined` (comportamento attuale).
- 2° operatore = principale o non tra i selezionati → bloccato da `isCoppiaValida` (non assegnabile).
- Un operatore deselezionato dopo essere stato scelto come 2° → la voce in `secondoOperatore` che lo referenzia va ignorata in render (filtrare per operatori ancora selezionati) o ripulita al reset.
- Cambio di distribuzione → `secondoOperatore` azzerato (le coppie non hanno più senso).

## 5. Testing (vitest, logica pura)
- `coppiaA2.test.ts`: `isCoppiaValida` — 2° valido; 2° === principale → false; 2° non selezionato → false; 2° null/undefined → false.
- `excelParser.test.ts`: `detectFormat` mappa la colonna "Num Risorse" nel formato Export Dati (indice corretto; `null` se assente).
- L'edit UI nel file caldo non è unit-testato (coerente col repo).

## 6. File / ownership / gate
- **Nuovi:** `utils/routing/coppiaA2.ts`, `utils/routing/coppiaA2.test.ts`.
- **Modificati:** `utils/routing/excelParser.ts` (+ test), `components/modules/mappa/MappaOperatoriClient.tsx` (**file caldo**, per ULTIMO, `git fetch` + rebase su `main` appena prima).
- **Niente migration**, niente API, niente modifica a salvataggio/agenda.
- **Gate:** `npx tsc -p tsconfig.json` verde · lint senza **nuovi** problemi sui file toccati (baseline repo già rossa, vedi memoria `lint-baseline-rosso`; verifica con `npx eslint <path>` e registra la baseline del file caldo) · `npm run test` verde (filtra i path `utils lib app components` per escludere eventuali worktree di altre sessioni).
- **Git:** branch `feat/wp2b-squadre-a2`; `git add` solo i file del WP; merge/integrazione su `main` + push (utente). Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 7. Criteri di accettazione
1. Un Excel con "Num Risorse"=2 produce `Task.requiresTwoOperators === true`; gli interventi dal DB con `richiede_due_operatori` idem.
2. Nella distribuzione, un intervento a-2 mostra il badge "2 operatori" e un selettore per il 2° operatore (solo operatori selezionati ≠ principale).
3. Scelto il 2° operatore, l'intervento appare nella sua lista come "supporto a [principale]".
4. `isCoppiaValida` e il parsing "Num Risorse" coperti da vitest; gate verdi.

## 8. Fuori scope (rimandati a un WP futuro)
Persistenza del 2° operatore + agenda di entrambi (richiederebbe `staff_id_2` o squadre persistenti); riduzione della capacità/qty del 2°; ottimizzazione congiunta della coppia (km/ETA condivisi); squadre fisse riutilizzabili.

## 9. Ordine di implementazione (per i plan)
1. `utils/routing/coppiaA2.ts` + `.test.ts` (helper puro, TDD).
2. `utils/routing/excelParser.ts` (+ test): `numRisorse` → `requiresTwoOperators`.
3. `git fetch` + rebase su `main`, poi `MappaOperatoriClient.tsx` (stato `secondoOperatore`, badge + selettore, visualizzazione doppia, reset).
4. Gate verdi → integrazione su `main` + push (utente) + elimina branch.
