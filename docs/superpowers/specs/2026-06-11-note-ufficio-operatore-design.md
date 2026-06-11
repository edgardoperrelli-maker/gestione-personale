# Note ufficio→operatore sulle righe del rapportino — design

**Data:** 2026-06-11
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Quando l'ufficio aggiunge attività a una pianificazione già attiva — dalla modale manuale
(`ManualTaskModal`) o dall'import Excel — non c'è modo di allegare una **nota informativa per
l'operatore** sulla singola riga. Serve un campo **Note (ufficio→operatore)**, in **sola lettura** per
l'operatore, impostabile dalla modale (campo testo) e dall'import Excel (colonna Note).

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Punti di input | `ManualTaskModal` (ufficio, campo testo) **+** import Excel (colonna Note). **NON** la modale operatore. |
| Direzione | Ufficio → operatore; **sola lettura** per l'operatore. |
| Visibilità operatore | Banner **"Nota dall'ufficio"** nel dettaglio (`VoceCard`) **+** spia 📝 nella riga della lista (`RapportinoLista`). |
| Scope | **Solo all'aggiunta** (modale + Excel). Niente editing su righe già nel piano. |
| Persistenza | `Task.note` → `raw_json` della voce (snapshot). **Nessuna colonna DB, nessuna SQL.** |
| Chiave raw_json | Chiave dedicata, distinta dalla `note` dell'intervento manuale **dell'operatore** (`interventi_manuali.note`). |

## Architettura e flusso

Riusa la catena esistente task → voce → `raw_json` → operatore.

1. **Input ufficio.**
   - `ManualTaskModal`: nuovo campo `note` in `ManualTaskData` + `textarea` "Nota per l'operatore
     (facoltativa)". `addManualTask` ([MappaOperatoriClient.tsx:2054](../../../components/modules/mappa/MappaOperatoriClient.tsx))
     mette `note` sul `Task`.
   - Import Excel (`parseExcelToTasks`): nel formato a **header leggibili** ("Export Dati / Geocall")
     riconosce una colonna Note da header `note`/`nota`/`annotazioni` → `note` sul `Task`. I formati a
     **indici fissi** (ATTGIORN/Massiva) non la prevedono (file standard esterni).
2. **Propagazione (esistente, zero SQL).** `Task.note` è salvato in `mappa_piani_operatori.tasks` (jsonb)
   e finisce in `raw_json` della voce via `taskToVoce` ([buildVoci.ts:31](../../../utils/rapportini/buildVoci.ts):
   `raw_json: task`). Nessuna nuova colonna DB.
3. **Display operatore.**
   - `app/r/[token]/page.tsx`: mappa la nota dalla voce → `FormVoce.notaUfficio` (lettura da `raw_json`).
   - `VoceCard`: banner evidenziato **"Nota dall'ufficio"** (dopo l'header indirizzo/fascia) quando presente.
   - `RapportinoLista`: spia 📝 sulla riga quando c'è una nota.

## Dettaglio per area

### Input (client ufficio)
- `utils/routing/types.ts`: nuovo campo opzionale `Task.note?: string`.
- `components/modules/mappa/ManualTaskModal.tsx`: `ManualTaskData.note: string` (default `''`); `textarea`
  full-width "Nota per l'operatore (facoltativa)".
- `components/modules/mappa/MappaOperatoriClient.tsx` (`addManualTask`): `note: data.note.trim() || undefined`
  sul `Task`.
- `utils/routing/excelParser.ts`: `ColMap.note` + `findCol([/^note$/, /^nota$/, /^annotazioni$/])` (solo
  ramo "header leggibili"); riga dati → `note: colMap.note != null ? str(row[colMap.note]) : undefined`.

### Propagazione
- `utils/rapportini/buildVoci.ts`: `taskToVoce` già mette `raw_json: task`, quindi `raw_json.note` è
  presente senza modifiche. **Da verificare**: che la chiave non collida con la `note` dell'intervento
  manuale dell'operatore (`buildVoceManuale`); se collide, usare una chiave namespaced `_nota_ufficio`.

### Display (operatore)
- `app/r/[token]/page.tsx`: aggiunge `notaUfficio` alla `FormVoce` leggendo la nota dal `raw_json`
  (chiave decisa al punto precedente).
- `components/modules/rapportini/RapportinoForm.tsx`: porta `notaUfficio` fino alla `VoceCard` e alla riga
  della lista (tipo `RigaVoce`).
- `components/modules/rapportini/VoceCard.tsx`: banner "Nota dall'ufficio" (icona + testo), stile
  evidenziato (token `--warning-soft` o simile), **sola lettura**.
- `components/modules/rapportini/RapportinoLista.tsx`: spia 📝 nella `RigaVoceCard` quando la nota è presente.

## Edge case

- **Nota vuota/assente** → nessun banner, nessuna spia.
- **Riga annullata con nota** → banner mostrato comunque (informativo); coerente col fatto che la riga
  resta visibile barrata.
- **Riga eliminata** (vedi feature Elimina) → sparisce con la riga, nessuna nota orfana.
- **Re-import / ri-aggiunta** → la nota segue il nuovo task (snapshot aggiornato).
- **Operatore** → sola lettura: non modifica né cancella la nota.

## File coinvolti

| File | Modifica |
|------|----------|
| `utils/routing/types.ts` | `Task.note?: string` |
| `components/modules/mappa/ManualTaskModal.tsx` | campo `note` + `textarea` |
| `components/modules/mappa/MappaOperatoriClient.tsx` | `addManualTask` propaga `note` |
| `utils/routing/excelParser.ts` | colonna Note (formato a header leggibili) |
| `app/r/[token]/page.tsx` | mappa nota → `FormVoce.notaUfficio` |
| `components/modules/rapportini/RapportinoForm.tsx` | porta la nota a card/lista |
| `components/modules/rapportini/VoceCard.tsx` | banner "Nota dall'ufficio" |
| `components/modules/rapportini/RapportinoLista.tsx` | spia 📝 sulla riga |

## Da verificare in fase di piano (non cambia il design)

- Collisione `raw_json.note` con la nota dell'intervento manuale dell'operatore
  (`buildVoceManuale`/`interventi_manuali`) → scelta chiave (`note` vs `_nota_ufficio`).
- Punto esatto di rendering in `VoceCard`/`RapportinoForm` (banner) e in `RigaVoceCard` (spia).
- Catena tipi `FormVoce` → `VoceInfo`/`VoceCardData` per portare `notaUfficio` fino alla card senza
  rompere `valoreInfo`.

## Strategia di test (TDD)

- **Pura** (`parseExcelToTasks`): file con header "Note" → `Task.note` valorizzato; senza colonna →
  `undefined`.
- **Pura** (mappatura voce): un task con `note` → la nota è recuperabile lato operatore (dal `raw_json`/
  `notaUfficio`).
- **UI manuale**: textarea nella modale, banner nel dettaglio operatore, spia nella lista.

## Fuori scope

- Editing/aggiunta nota su righe **già** nel piano (solo all'aggiunta).
- Nota nella modale **operatore**.
- Nota negli export PDF/Excel del rapportino e nelle viste ufficio (riepilogo/Live).
- Colonna Note nei formati Excel a indici fissi (ATTGIORN/Massiva).
