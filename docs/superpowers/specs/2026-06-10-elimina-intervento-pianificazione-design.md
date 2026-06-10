# Elimina intervento in pianificazione — design

**Data:** 2026-06-10
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Dalla pianificazione (*Pianifica indirizzi* del `MappaOperatoriClient`) oggi si può **Annullare** un
intervento: resta **visibile barrato** nel rapportino dell'operatore, non compilabile, ed è
**reversibile** (toggle Annulla ↔ Ripristina). Manca l'azione opposta: **Elimina**, per rimuovere un
intervento **del tutto e in modo definitivo** — deve sparire dal rapportino dell'operatore (non lo vede
affatto) e dall'intervento canonico (Live/agenda/KPI). Serve un tasto **Elimina** accanto ad Annulla.

Vedi feature gemella: [`2026-06-08-interventi-annullati-design.md`](2026-06-08-interventi-annullati-design.md).

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Comportamento | **Rimozione totale e definitiva**: sparisce dalla voce del rapportino e dall'intervento canonico. **Irreversibile** (niente "ripristina eliminato"). |
| Differenza da Annulla | Annulla = resta visibile barrato, reversibile. Elimina = sparisce ovunque, definitivo. |
| Conferma | **Sì**: `window.confirm` prima di eliminare (coerente con gli altri confirm nativi del flusso Salva). |
| Blocco completati | **Sì**: non disponibile sugli interventi `completato` (già Fatto/Non fatto), stesso guard di Annulla. |
| Su interventi già annullati | **Disponibile**: Elimina compare anche sui barrati e li rimuove davvero, intervento canonico incluso. |
| Quando | **Al Salva** (come Sposta/Annulla): la rimozione è locale finché non si preme *Salva distribuzione*. |
| Dove | Card del task **assegnato** a un operatore, accanto a Sposta e Annulla/Ripristina. **Non** nella lista "Non assegnati" (lì non esiste Annulla). |
| SQL/migration | **Nessuna**. |

## Architettura e flusso

Riusa il pattern esistente "modifica lista → Salva → genera/sincronizza". L'intuizione centrale: le voci
del rapportino vengono **ricostruite da zero a ogni Salva** ([`sincronizzaRapportini.ts:161`](../../../lib/interventi/sincronizzaRapportini.ts))
e gli interventi non-terminali sono **rigenerati dai task correnti**
([`planInterventiForPiano.ts:69`](../../../lib/interventi/planInterventiForPiano.ts)). Quindi **togliere il
task** dal piano fa già sparire voce + intervento, senza scorciatoie distruttive.

1. **Lista interventi (pianificazione).** Accanto a "Sposta" e "Annulla/Ripristina", tasto **"Elimina"**
   (stile `--danger`). Mostrato solo sugli interventi **non completati** (`t.stato !== 'completato'`).
   Al clic → `window.confirm` → handler `eliminaTask(taskId, opIdx)`:
   - rimuove il task da `distribution[opIdx].tasks` (stato locale, come fa "Sposta");
   - **ricalcola la route** dell'operatore (km/polyline/schedule) come `moveTask`; se era l'ultimo task
     dell'operatore → `km = 0`, `polyline = []`, `schedule = []`;
   - se il task era **annullato** (`t.annullato`), ne registra l'**identità** in una lista locale
     `eliminatiAnnullati` (serve solo per il passo server, vedi punto 3).
2. **Salva → voce e intervento "attivo".** Il flusso esistente gestisce già il caso comune:
   - `sincronizzaRapportini`: ricostruisce le voci dai task correnti → la voce del task eliminato **non
     viene ricreata** → sparisce dal rapportino.
   - `ensureInterventiForPiano`/`planInterventi`: l'intervento del task eliminato, se **`assegnato`**
     (non-terminale), è in `idDaEliminare` → **cancellato** e non re-inserito → sparisce da Live/agenda.
   - Per i task **appena aggiunti** e mai salvati non c'è nulla da cancellare lato DB.
3. **Salva → intervento "già annullato" (passo esplicito).** Un task **già annullato e già salvato** ha
   un intervento canonico **terminale** (`stato = 'annullato'`), che `planInterventi` **preserva** per
   invariante ([`planInterventiForPiano.ts:56`](../../../lib/interventi/planInterventiForPiano.ts): in
   rigenerazione gli annullati non vanno mai cancellati, perché possono essere esiti reali ACEA). Per non
   lasciarlo **orfano**, il Salva invia le identità in `eliminatiAnnullati` e un **passo esplicito,
   separato dalla rigenerazione**, le cancella da `interventi` filtrando per `piano_id` +
   `created_from_mappa = true` + identità corrispondente. È una cancellazione **iniziata dall'utente**,
   quindi **non** modifica il comportamento di `ensureInterventiForPiano`/`rigenera-giorno` (l'invariante
   resta intatto). Sul successo del Salva, la lista locale si svuota.

## Dettaglio per area

### Client (`components/modules/mappa/MappaOperatoriClient.tsx`)
- Nuovo handler `eliminaTask(taskId, opIdx)` modellato su `moveTask`/`toggleAnnullaTask`: rimozione dal
  gruppo, ricalcolo route, gestione gruppo vuoto.
- Stato locale `eliminatiAnnullati: { /* identità */ }[]` accumulato dalle Elimina su task `annullato`,
  azzerato dopo un Salva riuscito.
- Pulsante **Elimina** nella card del task (riga ~3074, accanto a Sposta/Annulla), con `window.confirm`.
  Visibile se `t.stato !== 'completato'`.
- In `saveDistribution`, includere `eliminatiAnnullati` nel payload del salvataggio del piano.

### Server (passo esplicito di cancellazione)
- Al Salva, prima/insieme alla rigenerazione, cancellare gli `interventi` con `piano_id` del piano,
  `created_from_mappa = true` e identità ∈ `eliminatiAnnullati` (riuso di `identitaIntervento`:
  ODL oppure identità composta indirizzo+matricola+attività). Punto di aggancio (PUT/POST
  `/api/mappa/piani` oppure lo step `/api/mappa/piani/interventi`) deciso in fase di piano; in ogni caso
  **separato** dalla logica di rigenerazione condivisa.
- **Nessuna** modifica all'invariante di `planInterventi`/`ensureInterventiForPiano` sugli annullati.

### Rapportino digitale
- **Nessuna modifica**: la voce eliminata semplicemente non esiste più dopo il Salva.

## Edge case

- **Eliminare l'ultimo task di un operatore** → route azzerata (`km = 0`, `polyline = []`, `schedule = []`).
- **Eliminare un task `assegnato`** → gestito interamente dalla pipeline esistente (`idDaEliminare`), zero
  passo server.
- **Eliminare un task `annullato` già salvato** → passo server esplicito rimuove l'intervento canonico
  (niente orfani in Live/KPI).
- **Eliminare poi NON salvare** → nessun effetto sul DB; ricaricando il piano l'intervento torna (coerente
  con Sposta/Annulla, "si applica al Salva"). Da chiarire nel testo della conferma.
- **Completati** → Elimina non compare (come Annulla): protegge il lavoro già svolto.
- **Interventi manuali aggiunti dall'OPERATORE** (tabella `interventi_manuali`, con foto): **fuori scope**.
  Non sono task del piano; hanno il loro flusso operatore (annulla lato `/r/[token]`). Il Salva del piano
  non li tocca (comportamento esistente da confermare con test).

## File coinvolti

| File | Modifica |
|------|----------|
| `components/modules/mappa/MappaOperatoriClient.tsx` | handler `eliminaTask` + pulsante Elimina + conferma + ricalcolo route + stato `eliminatiAnnullati` + payload Salva |
| `app/api/mappa/piani/route.ts` *(o lo step interventi)* | passo esplicito: delete `interventi` per identità eliminate (scoped `piano_id` + `created_from_mappa`) |

## Da verificare in fase di piano (non cambia il design)

- Come `moveTask` ricalcola la route (per replicare in `eliminaTask`).
- Punto esatto del payload/round-trip di `saveDistribution` dove agganciare le identità eliminate e dove
  eseguire il delete server.
- Che `sincronizzaRapportini` **preservi** le voci manuali dell'operatore a ogni Salva (così Elimina non
  le tocca) — comportamento esistente, da confermare con un test.

## Strategia di test (TDD)

- **Pura** (`planInterventi`): task `assegnato` rimosso → suo intervento in `idDaEliminare`; completato
  rimosso → preservato; annullato ancora presente nei task → preservato (invariante intatto).
- **Pura** (delete mirato per identità, se estratto in funzione): identità eliminate → seleziona solo
  `created_from_mappa` del piano con identità corrispondente; non tocca esiti reali / altri piani.
- **Motore** (`sincronizzaRapportini`, fake DB): rimosso il task → la voce non viene ricreata; le voci
  manuali dell'operatore restano.
- **Riducer distribution** (se estraibile): `eliminaTask` rimuove dal gruppo giusto, ricalcola la route,
  azzera la route a gruppo vuoto.

## Fuori scope

- Elimina dalla lista "Non assegnati".
- Elimina lato operatore.
- Elimina di interventi `completato`.
- Cestino/recupero di interventi eliminati (è definitivo).
- Causale/motivo di eliminazione (nessuno).
