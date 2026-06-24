# Rapportino: ordine voci = ordine del file master

**Data:** 2026-06-24 · **Stato:** approvato (brainstorming)

## Problema
Il rapportino dell'operatore deve elencare gli interventi nell'ordine del **file master ACEA**
("LIMITAZIONI CON ORDINE.xlsx"), che è l'ordine di pianificazione. Oggi invece `voce.ordine`
viene impostato dalla **posizione nella rotta ottimizzata** (`sincronizzaRapportini` chiama
`taskToVoce(t, i+1)`), quindi la lista segue il percorso, non il master.

## Requisito (Approccio A, confermato)
- **Solo il rapportino** segue l'ordine del master. La **mappa/percorso resta ottimizzata**
  (i `mappa_piani_operatori.tasks` non si riordinano).
- I nuovi ODL aggiunti a mano (manuali/template senza ordine-file) finiscono **in coda** alla lista.

## Origine dell'ordine
- L'import Excel assegna `id = row-${i}` (`utils/routing/excelParser.ts`) → l'**ordine di riga del
  file è già codificato nell'id**. Aggiungiamo anche un campo esplicito `Task.ordine`.
- Il rapportino mostra già le voci ordinate per `rapportino_voci.ordine` (`app/r/[token]/page.tsx`
  `.order('ordine')`). Basta valorizzare `ordine` con l'ordine-file invece che la rotta.

## Componenti
1. **`Task.ordine?: number`** (`utils/routing/types.ts`) — ordine di riga nel file sorgente.
   Impostato all'import (`excelParser`: `ordine: i`). Manuali/template senza ordine → assente.
2. **Helper puro `rankOrdineDaFile(tasks)`** (`utils/rapportini/ordineVoci.ts`, testato): per la
   lista di task di un operatore, ordina per chiave-file (`task.ordine` se numerico; fallback:
   numero da `row-N` / `tpl-…-N`; senza chiave → in coda, ordine relativo stabile) e ritorna
   `{ taskId: rango(1..N) }`. **Normalizzato per operatore** (robusto a valori sparsi e nuovi ODL).
3. **`sincronizzaRapportini`** — calcola `rankOrdineDaFile(op.tasks)` e passa il rango a
   `taskToVoce(t, rango)`; `op.tasks` (mappa/rotta) **non viene toccato**.
4. **Display** — nessuna modifica (già ordina per `ordine`).

## Rimedio dati piano `b54aacdc` (oggi)
Fix una-tantum: leggo il master, scrivo `ordine` (= riga master) su ogni task in
`mappa_piani_operatori.tasks`, poi re-sync → le voci seguono il master. I task ora hanno `ordine`,
quindi l'ordine **resta stabile** ai salvataggi successivi. Preparo + confermo prima di scrivere.

## Test
- `rankOrdineDaFile`: ordine esplicito; id `row-N`; misto con task senza chiave (in coda); stabilità.
- `sincronizzaRapportini`: con `op.tasks` fuori ordine-rotta ma con `ordine`/`row-N`, le voci
  risultano con `voce.ordine` = rango-file (riuso il fake-Supabase esistente).

## Fuori scope
- Ordine del percorso/mappa (resta ottimizzato).
- Lettura del master a runtime dal server (l'ordine viaggia via `Task.ordine`/id; il master si
  legge solo per il rimedio una-tantum del piano esistente).
