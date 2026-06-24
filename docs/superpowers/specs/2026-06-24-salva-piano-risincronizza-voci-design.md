# Salva piano → risincronizza sempre le voci del rapportino (Opzione A)

**Data:** 2026-06-24
**Stato:** approvato (design), implementato

## Problema

In `saveDistribution` (components/modules/mappa/MappaOperatoriClient.tsx), dopo aver
salvato piano + interventi, la sincronizzazione delle voci del rapportino
(`applicaRapportini` → `/api/mappa/rapportini/genera` → `sincronizzaRapportini`)
parte **solo in modo condizionato**:

- `diff.bloccati.length > 0` → `alert`, **nessuna** sincronizzazione;
- `diff.nessunaModifica` → `applicaRapportini(false)` (sincronizza);
- altrimenti → `window.confirm`; sincronizza **solo** se l'utente conferma.

Quando il ramo con conferma viene **annullato**, o nel ramo `bloccati`, le voci NON
vengono riconciliate → restano voci **fantasma** (task non più nel piano) o **mancanti**
(task nuovi senza voce). È la causa del disallineamento rapportino↔piano (caso ACEA
23/06: Dionisi/Giosi/De Santis, riparato a mano via SQL).

`sincronizzaRapportini` fa già la cosa giusta: cancella+ricrea le voci `manuale=false`
dai task correnti **preservando le risposte per `task_id`** e lasciando intatte le voci
manuali (dal "+"). Manca solo che venga invocata **in modo affidabile**.

## Soluzione (Opzione A)

La riconciliazione diventa **garantita a ogni Salva**, con la conferma richiesta
**solo** quando sono coinvolti rapportini **già inviati** (`diff.inviatiCoinvolti`):

1. **Nessun rapportino inviato coinvolto** (caso normale, rapportini `in_corso`):
   `applicaRapportini(pid, false)` **sempre**, senza conferma. ← il fix.
2. **Rapportini inviati coinvolti**: `window.confirm`; su OK `applicaRapportini(pid, true)`
   (riapre gli inviati); su Annulla **non** tocca gli inviati (skip).
3. **Interventi completati spostati (`bloccati`)**: resta l'**avviso** (non bloccante);
   la riconciliazione dei non-inviati procede comunque (niente più voci stantie come
   effetto collaterale).

Nessuna modifica al server (`sincronizzaRapportini` invariato) né al DB.

## Componenti

- **`utils/rapportini/diffRapportini.ts`** — helper PURO `decideSyncRapportini(diff)`
  → `{ avvisoBloccati: string | null; richiediConfermaInviati: boolean }`. Isola la
  decisione di gating dal componente, testabile.
- **`MappaOperatoriClient.tsx`** — il blocco rapportini di `saveDistribution` usa il
  decisore: avvisa sui `bloccati`, e quando NON ci sono inviati coinvolti sincronizza
  sempre; con inviati coinvolti chiede conferma.

## Fuori scope (follow-up)

Stabilità dei `task_id` (oggi `tpl-${Date.now()}`/`row-N` rigenerati): un ri-salvataggio
che cambia gli id fa perdere le risposte già date (il merge è per `task_id`). La
riconciliazione qui elimina orfane/mancanti **sempre**; la preservazione delle risposte
migliora con id stabili. Step 2 separato (più invasivo).

## Test

- Unità su `decideSyncRapportini`: movimenti senza inviati → no conferma; inviati
  coinvolti → conferma richiesta; `bloccati` → avviso valorizzato; nessuna modifica → vuoto.
- I test esistenti di `sincronizzaRapportini` e `calcolaDiffRapportini` restano validi.
