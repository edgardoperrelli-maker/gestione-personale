# Spostamento interventi verso operatore non ancora distribuito — design

**Data:** 2026-06-14
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Le liste destinazione dello spostamento — singolo (*Sposta a:*) e massivo (*Sposta tutti a…*) — elencano
solo gli operatori **già nella distribuzione**. Un operatore solo **selezionato** (spuntato) ma non ancora
distribuito non è una destinazione valida → non gli si possono spostare interventi senza ri-distribuire.
Serve poter spostare (singolo **e** massivo) verso un operatore selezionato non distribuito, creandogli un
gruppo al primo spostamento.

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Destinazioni | Tutti gli operatori **selezionati** (`selectedOps`), esclusa la corrente. |
| Operatore non distribuito | Al **primo spostamento** gli si crea un gruppo **vuoto** (colore `OP_COLORS`, `base`/`startAddress` dalla selezione). |
| Ambito | Singolo **+** massivo. |
| ZTL | Check ZTL del singolo **invariato** (per-intervento). |
| Quando | Al **Salva**. |
| SQL | **Nessuna.** |

## Architettura

Helper puri in `utils/mappa/appendTask.ts` + composizione nel client.

- `ensureOperatorInDistribution(distribution, staffId, makeEmpty)`: se l'operatore `staffId` non ha un gruppo,
  ne **appende uno vuoto** (creato dalla factory `makeEmpty`) e ritorna `{ distribution, idx }`; altrimenti
  ritorna l'indice esistente (stesso riferimento alla distribuzione). Puro, generico
  (`E extends RoutableEntry & { staffId: string }`).
- `moveTaskToOperator(distribution, taskId, fromIdx, toIdx, optimize)`: estrazione **pura** dello spostamento
  singolo (oggi inline in `moveTask`), con ricalcolo rotte di sorgente e destinazione.
- Client: handler `moveTaskToOp(taskId, fromIdx, op, opSelIdx)` e `moveAllTasksToOp(fromIdx, op, opSelIdx)` =
  **assicura il gruppo del destinatario** (`ensureOperatorInDistribution` con factory che costruisce il
  `DistEntry` vuoto: `op.name`/`op.id`/colore/`base`/`startAddress`) **→ poi sposta**
  (`moveTaskToOperator` / `moveAllTasksToOperator`). Le liste destinazione mappano `selectedOps` escludendo
  lo `staffId` dell'operatore corrente; conteggio = task in distribuzione (0 se non distribuito); colore
  `OP_COLORS[opSelIdx % OP_COLORS.length]`.

## File coinvolti

| File | Modifica |
|------|----------|
| `utils/mappa/appendTask.ts` | `ensureOperatorInDistribution` + `moveTaskToOperator` (+ test) |
| `components/modules/mappa/MappaOperatoriClient.tsx` | factory `makeEmptyEntry`, handler `moveTaskToOp`/`moveAllTasksToOp`, liste destinazione su `selectedOps` |

## Edge case
- Destinatario **già distribuito** → riusa il suo indice (nessun gruppo nuovo).
- Sorgente svuotata → resta come gruppo vuoto (la togli a parte se vuoi).
- Operatore **corrente** escluso dalle destinazioni.
- `moveTaskToOperator`: `from === to` / indici fuori range / task assente → invariato.

## Strategia di test (TDD)
- **`ensureOperatorInDistribution`**: `staffId` presente → stessa distribuzione + indice esistente; assente →
  gruppo appeso in coda, indice nuovo, factory chiamata una volta; non muta input.
- **`moveTaskToOperator`**: sposta il task e ricalcola le rotte di entrambi; sorgente svuotata → azzerata;
  `from === to` / fuori range / task assente → stesso riferimento; non muta input.

## Fuori scope
- Selettore separato "aggiungi operatore al volo" (si usa la spunta esistente nella lista operatori).
- Spostare interventi **completati** (come per il massivo già esistente).
