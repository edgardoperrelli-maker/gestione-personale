# Interventi annullati nei rapportini — design

**Data:** 2026-06-08
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

L'ufficio deve poter **annullare** alcuni interventi di un piano (es. non più necessari). Un intervento
annullato deve: restare **visibile** nel rapportino digitale ma **non compilabile** (riga rossa,
"ANNULLATO"), e **non bloccare l'invio** del rapportino a fine giornata anche se non compilato.
L'azione si fa dalla pianificazione (*Pianifica indirizzi*), così è disponibile anche riaprendo il piano.

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Reversibilità | **Reversibile**: il tasto è un toggle Annulla ↔ Ripristina |
| Quando | **Al Salva** (come "Sposta"): si marca nella lista, si applica al Salva |
| Motivo/causale | **Nessuno** (marcatura veloce, senza testo) |
| Dove vive il flag per il digitale | **Nella voce** (`_annullato` in `raw_json`), come il flag `_nuovo` — snapshot autosufficiente, niente join live su `intervento_id` (che può essere null) |

## Architettura e flusso

Riusa il pattern esistente "Sposta → Salva → genera". Nessuna nuova migrazione: si usano
`interventi.stato = 'annullato'` (terminale, già esistente) e il pattern flag-in-`raw_json`.

1. **Lista interventi (pianificazione).** Accanto a "Sposta", tasto **"Annulla"** (→ **"Ripristina"**
   se il task è già annullato). Il clic imposta `annullato` sul task **lato client** (stato locale,
   come fa "Sposta" per la riassegnazione). L'intervento annullato appare **barrato/rosso** nella lista.
   Il tasto è mostrato solo sugli interventi **non completati**.
2. **Salva.** Il flusso di propagazione esistente gestisce anche gli annullati:
   - `taskToIntervento`: un task con `annullato` → record intervento con `stato = 'annullato'`
     (invece di `'assegnato'`). Così l'annullato esce dalle viste "da fare" di torre/agenda.
   - `planInterventiForPiano`/`ensureInterventiForPiano`: gestiscono `'annullato'` come stato dei task
     correnti (oggi i terminali esistenti sono preservati; qui un task corrente può nascere già annullato).
   - `sincronizzaRapportini`: le voci dei task annullati ricevono **`_annullato: true`** in `raw_json`
     (accanto a `_nuovo`). La sorgente è il task (`taskToVoce` propaga `annullato`).
   - L'anteprima/riepilogo del Salva elenca anche gli annullati ("Annullati: N interventi").
3. **Rapportino digitale** (`RapportinoForm`). Voce con `_annullato` → riga **rossa**, badge
   **"ANNULLATO"**, **non cliccabile** (read-only). Eventuali risposte preesistenti restano visibili ma congelate.
4. **Invio.** La logica che conta le voci "da compilare" **esclude le annullate** → il rapportino è
   inviabile anche con quelle non toccate.

## Dettaglio per area

### Task e marcatura (client)
- `Task` (`utils/routing/types.ts`): nuovo campo opzionale `annullato?: boolean`.
- Nel pannello lista del `MappaOperatoriClient`, accanto al controllo "Sposta", un toggle che imposta
  `annullato` sul task selezionato e forza il re-render (riuso del meccanismo con cui "Sposta" aggiorna `distribution`).
- Stile riga annullata: testo barrato + colore `--danger` (rosso), coerente con i token esistenti.

### Propagazione (server)
- `taskToIntervento(task, ctx)`: `stato: task.annullato ? 'annullato' : 'assegnato'`.
- `taskToVoce(task, ordine)`: include `annullato` (così `mergeVoci`/`sincronizzaRapportini` può scriverlo).
- `sincronizzaRapportini`: nella costruzione di `raw_json` della voce, aggiunge `_annullato: Boolean(task.annullato)`
  (oltre a `_nuovo`).

### Digitale e invio
- `page.tsx` (`/r/[token]`): mappa `annullato` da `raw_json._annullato` nella `Voce` passata al form.
- `RapportinoForm`: voce `annullato` → render read-only, rosso, badge; click/compilazione disabilitati.
- Invio: la condizione di "voci ancora da compilare" filtra via le annullate.

## Edge case

- **Voce già compilata poi annullata**: la voce diventa read-only; le risposte restano salvate ma non
  modificabili (non si perde nulla, semplicemente non conta per l'invio).
- **Ripristino**: un task riportato a non-annullato → al Salva l'intervento torna `'assegnato'` e la voce
  perde `_annullato` (torna normale, compilabile).
- **Completati**: il tasto "Annulla" non compare sugli interventi `completato` (già chiusi).
- **Collegamento intervento null**: il rosso/non-cliccabile dipende da `_annullato` nella voce, non dal
  collegamento `intervento_id`, quindi è robusto anche dopo il fix FK.

## File coinvolti

| File | Modifica |
|------|----------|
| `utils/routing/types.ts` | `Task.annullato?: boolean` |
| `components/modules/mappa/MappaOperatoriClient.tsx` | toggle Annulla/Ripristina nella lista + stile riga + riepilogo Salva |
| `lib/interventi/taskToIntervento.ts` | `stato` = `'annullato'` se `task.annullato` |
| `lib/interventi/planInterventiForPiano.ts` | gestione stato `'annullato'` per i task correnti |
| `utils/rapportini/buildVoci.ts` | `taskToVoce` propaga `annullato` |
| `lib/interventi/sincronizzaRapportini.ts` | `_annullato` in `raw_json` della voce |
| `app/r/[token]/page.tsx` | mappa `_annullato` → `Voce.annullato` |
| `components/modules/rapportini/RapportinoForm.tsx` | render read-only/rosso/badge + invio esclude annullate |

## Da verificare in fase di piano (non cambia il design)

- Come "Sposta" marca/aggiorna il task nel pannello (per replicare "Annulla" con lo stesso meccanismo).
- La condizione esatta che oggi blocca/gestisce l'invio (per escludere le annullate nel punto giusto).
- Il punto di rendering della voce nel form (per applicare read-only/rosso/badge).

## Strategia di test

- **Pura**: `taskToIntervento` → `stato 'annullato'` quando `task.annullato`; `taskToVoce` propaga `annullato`.
- **Motore** (`sincronizzaRapportini`, fake DB): le voci dei task annullati hanno `raw_json._annullato === true`.
- **Pura invio**: la funzione che conta le voci da compilare esclude le annullate (se estraibile).

## Fuori scope

- Causale/motivo di annullamento (deciso: nessuno).
- Annullamento dal lato operatore (solo ufficio/pianificazione).
- Annullamento di interventi completati.
