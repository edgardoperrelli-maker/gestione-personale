# Foto obbligatoria "su condizione" — Sostituzione valvola

**Data:** 2026-06-25
**Stato:** Implementato

## Contesto
Nel template **"Rapportino limitazioni massive"** (`committente = lim_massive`) la foto
**"Sost. Valvola"** (`chiave: sost_valvola`) era sempre facoltativa. La richiesta:

> Se il campo **"Sostituzione valvola"** (`sostituzione_valvola`, select SI/NO) vale **"SI"**,
> allora la foto **"Sost. Valvola"** deve diventare **obbligatoria**.

Finora il flag `obbligatoria` sulle foto è **statico** (sempre/mai). Serviva un obbligo
**condizionato** dal valore di un altro campo della stessa voce.

## Decisioni
1. **Convention-based, non config DB.** Come `haEsitoNegativo` ([voceColore.ts](../../../utils/rapportini/voceColore.ts)),
   la regola riconosce i campi **per nome** (chiave/etichetta) invece di aggiungere colonne/UI al template.
   Vale quindi su qualunque template che usi quei campi, senza migrazione né modifiche all'editor.
   Regola attuale: trigger `/valvol/i` = `SI` → foto `/valvol/i` obbligatoria.
2. **Rispetta l'esito negativo.** L'obbligo passa dalla stessa pipeline delle altre foto: se
   l'esito è negativo (`Eseguito = NO / NESSUN PASSAGGIO`) **nessuna** foto è richiesta, valvola inclusa.
3. **Stesso enforcement delle altre foto obbligatorie:**
   - Rapportino **pianificato** → avviso pre-invio non bloccante (l'operatore può scattarla o inviare comunque).
   - **Intervento manuale** / **server** / **offline** → blocco rigido (bottone disabilitato / `422`).

## Implementazione
- **Nuovo:** [`utils/rapportini/fotoCondizionali.ts`](../../../utils/rapportini/fotoCondizionali.ts) (+test):
  - `slotFotoCondizionali(campi, risposte): Set<string>` — chiavi foto rese obbligatorie dalle risposte.
  - `fotoSlotObbligatorio(campo, condizionali): boolean` — obbligo statico **OR** condizionale.
- **Modificati** (tutti i punti di validazione foto, ora "risposte-aware"):
  - `lib/interventi/manuali/validaFotoObbligatorie.ts` — terzo parametro opzionale `risposte` (retro-compatibile).
  - `utils/rapportini/fotoObbligatorieMancanti.ts` — `contaFotoObbligatorieMancanti` / `fotoObbligatorieMancantiDettaglio` calcolano l'obbligo **per voce**.
  - `components/modules/rapportini/ModaleInterventoManuale.tsx`, `app/api/r/[token]/intervento-manuale/route.ts`, `lib/offline/validateManuale.ts` — passano le `risposte`.

## Fix collegato: solo "Eseguito" guida l'esito negativo
Prima, `haEsitoNegativo`/`voceEsitoColore` consideravano negativo **qualsiasi** select con
valore "NO" (regex `NEG_SELECT`). Di conseguenza **`Sostituzione valvola = NO`** marcava
l'intera voce come esito negativo e **disattivava tutte le foto obbligatorie** (anche ante
panoramica, sigillatura, ecc.) oltre a colorarla di rosso.

Correzione in [voceColore.ts](../../../utils/rapportini/voceColore.ts): la negatività **per
valore** (`NO` / `NESSUN PASSAGGIO`) vale ora **solo sul campo esito** — select riconosciuto
per nome con `ESITO_SELECT_NAME = /esegu|esito/i` (`Eseguito`, `Esito`). I select **secondari**
(es. `Sostituzione valvola`, SI/NO) col valore "NO" non rendono più la voce negativa.
Invariata la negatività **per nome** (`Assente`, `Non eseguito` via `NEG_NAME`), così tutti i
template esistenti (Acea/Italgas/limitazioni) mantengono lo stesso comportamento — confermato
dai test esistenti di `voceColore` tutti verdi.

Verifica dati: l'unico template dove il bug si manifestava è "Rapportino limitazioni massive"
(unico con `sostituzione_valvola` come **select con opzione NO**); altrove valvola è crocetta
o select con sola opzione "SI".

## Estensione futura
Aggiungere una regola = una riga in `REGOLE` dentro `fotoCondizionali.ts`
(`{ campoTrigger, valoreAttiva, fotoRichiesta }`).
