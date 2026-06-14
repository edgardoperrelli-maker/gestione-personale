# Sposta massivo interventi tra operatori (pianificazione) — design

**Data:** 2026-06-13
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Nella pianificazione (`MappaOperatoriClient`) si può spostare **un** intervento da un operatore a un altro
(per-task: *Sposta → Sposta a:*), ma non **tutti in blocco**. Quando un operatore è assente (es. malattia),
riassegnare tutti i suoi interventi a un collega richiede uno spostamento per ogni intervento. Serve uno
**"Sposta tutti a…"** a livello operatore. Lo spostamento singolo c'è già e funziona.

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Cosa | Sposta in blocco **tutti gli interventi non-completati** di un operatore a un altro operatore del piano. |
| Dove | Controllo **"Sposta tutti a…"** nell'header del pannello operatore (accanto a *NOME · km*). |
| Destinatari | Solo operatori **già nella distribuzione** (come per il singolo). |
| Completati | **Esclusi** (non spostabili; coerente col blocco al Salva). |
| Quando | **Al Salva** (come lo Sposta singolo). |
| Etichetta | "Sposta tutti a…" |
| SQL | **Nessuna.** |

## Architettura

Versione "bulk" dell'esistente `moveTask`. Riusa il motore rotte (`optimizeRouteByFascia`) e il salvataggio.

1. **Helper puro** `moveAllTasksToOperator(distribution, fromIdx, toIdx, optimize)` in `utils/mappa/appendTask.ts`
   (dove vivono già `appendTaskToOperator` e `removeTaskFromOperator`): sposta **tutti i task non-completati**
   da `fromIdx` a `toIdx`, ricalcola le rotte di entrambi (km/polyline/schedule; gruppo vuoto → azzerato).
   I task `completato` restano su `fromIdx`. Funzione pura, testata.
2. **Client** (`MappaOperatoriClient`): handler `moveAllTasks(fromIdx, toIdx)` che chiama l'helper e
   `setDistribution`; un controllo **"Sposta tutti a…"** nell'header del pannello operatore che apre l'elenco
   degli **altri** operatori della distribuzione (riuso del pattern del "Sposta a:" singolo) → al clic su un
   destinatario chiama `moveAllTasks(activeOpIdx, destIdx)`.

## Dettaglio per area

### Helper puro (`utils/mappa/appendTask.ts`)
- `moveAllTasksToOperator<E extends RoutableEntry>(distribution, fromIdx, toIdx, optimize): E[]`
  - difensivo: indici uguali / fuori range → ritorna la distribuzione invariata (stesso riferimento);
  - separa i task di `fromIdx` in `daSpostare` (`stato !== 'completato'`) e `restano` (completati);
  - se `daSpostare` è vuoto → ritorna invariata (stesso riferimento);
  - `fromIdx`.tasks = `restano` (ricalcola rotta, o azzera se vuoto); `toIdx`.tasks = `toIdx.tasks + daSpostare` (ricalcola rotta);
  - non muta l'input.
- Il `RoutableEntry` esistente non ha `tasks` tipizzati con `stato`; i `Task` sì (`Task.stato?`). L'helper filtra su `t.stato !== 'completato'`.

### Client (`MappaOperatoriClient.tsx`)
- `const moveAllTasks = useCallback((fromIdx, toIdx) => setDistribution(prev => prev ? moveAllTasksToOperator(prev, fromIdx, toIdx, optimizeRouteByFascia) : prev), [])`.
- Nuovo stato UI `movingAllOpen: boolean` (o riuso di un toggle locale) per aprire/chiudere l'elenco destinatari.
- Nell'header del pannello operatore (dove si mostra NOME · km), pulsante **"Sposta tutti a…"** (mostrato solo se l'operatore ha almeno un task non-completato); al clic mostra i destinatari = `distribution` esclusa la posizione corrente; al clic su un destinatario → `moveAllTasks(activeOpIdx, destIdx)` + chiudi.

## Edge case
- Operatore senza task **non-completati** → pulsante nascosto (niente da spostare).
- Destinazione = sorgente → esclusa dall'elenco.
- Tutti spostati → sorgente resta con 0 (o solo completati) e rotta azzerata.
- Si applica al **Salva** come gli altri (Sposta/Annulla/Elimina): finché non salvi è solo locale.

## Strategia di test (TDD)
- **Pura** (`moveAllTasksToOperator`): sposta tutti i non-completati e ricalcola le rotte; esclude i `completato` (restano sulla sorgente); gruppo destinazione cresce, sorgente azzerata se svuotata; indici uguali/fuori range o niente da spostare → stesso riferimento; non muta l'input.

## Fuori scope
- Spostare verso un operatore **non ancora distribuito** (lacuna separata).
- Spostare interventi **completati**.
- Spostamento "in blocco" lato Riepilogo/rapportini.
