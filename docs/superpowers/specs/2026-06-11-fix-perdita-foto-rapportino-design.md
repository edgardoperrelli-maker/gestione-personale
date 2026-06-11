# Fix perdita foto rapportino — design

**Data:** 2026-06-11
**Stato:** approvato (brainstorming) → pronto per il piano
**Sub-progetto:** #1 di 2 (il #2 è la modale di download foto, spec separata)

## Problema

Indagine su foto mancanti (ODL 912229844, VIA CANCELLATA GRANDE 62, 09/06, operatore PASTORELLI). L'operatore dichiara di aver scattato tutte le foto; a sistema ne risultava 1 su 5.

Verifica su dati di produzione (storage + `rapportino_voci.risposte`), dal 08/06 in poi:
- **Bug di sistema, non errore operatore**, confermato su **entrambi gli operatori** e **più giorni** (09→11/06): ~21 interventi eseguiti con foto **obbligatorie** mancanti. La maggioranza delle voci (4/5, con la 5ª foto facoltativa `sost_valvola` saltata) è invece corretta.
- **Prova:** file "orfani" nello storage (foto caricate con successo ma non più referenziate da alcuna voce) + voci con `eseguito=SI` e foto obbligatorie a `null`.
- **11/06 (nuovo flusso offline, in prod da oggi):** le foto mancanti sono `blob-locale:…` → **ferme in coda sui telefoni**, non perse; alcune voci sono miste (2 path reali + 2 segnaposto).

## Cause radice

1. **`/voce` sovrascrive tutto.** [app/api/r/[token]/voce/route.ts](../../../app/api/r/[token]/voce/route.ts) fa `update({ risposte })` sull'intero JSON, senza merge. Due salvataggi concorrenti (o il sync che riscrive una foto) si cancellano a vicenda: vince l'ultimo che arriva, anche se porta un sottoinsieme.
2. **Trappola del 409 dopo l'invio.** Appena `stato='inviato'`, `tokenStatus` ≠ `valido` e sia `/voce` sia `/foto-campo` rispondono 409. Le foto rimaste in coda dopo l'invio **non possono più salire** → restano segnaposto per sempre.
3. **Nessuna visibilità.** Le foto obbligatorie non sono validate e non c'è alcun segnale all'ufficio: si scarica un set incompleto senza accorgersene.

## Obiettivi

- Da oggi in poi le foto scattate dall'operatore **non si perdono più** (né per sovrascrittura, né per strand post-invio).
- L'ufficio **vede** quando un rapportino ha foto ancora in sospeso.
- Soluzione **migration-free** (nessuna colonna nuova, nessuna SQL da lanciare), quasi tutta lato server.

## Non obiettivi

- Recupero delle foto storiche (09–10/06): l'utente ha deciso di lasciarle stare. Gli orfani restano comunque nello storage.
- Modale di download "tutto / per indirizzo": è il sub-progetto #2, spec separata.

## Design

### 1. `/voce`: merge per-chiave invece di sovrascrittura
Il server legge le `risposte` esistenti della voce e applica un **merge**: le chiavi presenti nel payload vincono, le chiavi assenti restano invariate. La cancellazione di un campo resta possibile inviando esplicitamente `null` (il client già invia valori espliciti, incluso `null` su "Rimuovi"). Effetto: un salvataggio parziale o "vecchio" non azzera più le foto già presenti. Chiude la causa radice n.1 per **entrambi** i flussi (vecchio diretto e nuovo offline).

### 2. "Foto in sospeso" derivato (niente migrazione)
Un rapportino ha foto in sospeso se almeno una sua voce ha ancora un valore `blob-locale:…` in `risposte`. Stato **calcolato dai dati esistenti**, nessuna colonna nuova. Helper puro condiviso (es. `contaFotoInSospeso(voci)`), testabile in isolamento.

### 3. Finestra di grazia: completare le foto anche dopo l'invio
Finché un rapportino inviato ha ancora segnaposto `blob-locale:`:
- **`/foto-campo`** accetta il caricamento del blob (oggi bloccato dal 409). Non tocca `risposte`, carica solo su storage e ritorna il path.
- **`/voce`** accetta il merge **limitatamente alle transizioni segnaposto → path reale** (`blob-locale:…` → `rapportini/…`). Le altre modifiche su un rapportino inviato restano rifiutate (l'operatore non può alterare le risposte dopo l'invio: si completano solo le foto pendenti).

Così l'operatore invia e se ne va; la coda finisce di salire in background (riapertura app / Background Sync su Android) e ogni foto sostituisce il proprio segnaposto. Quando l'ultimo segnaposto diventa path, il rapportino è completo a tutti gli effetti.

### 4. Visibilità per l'ufficio
Nel riepilogo ([components/modules/mappa/riepilogo/CardTerritorio.tsx](../../../components/modules/mappa/riepilogo/CardTerritorio.tsx), riga del rapportino col pulsante `🖼️`): badge **"foto in sospeso (N)"** quando il conteggio derivato > 0. Il dato `fotoInSospeso` viene calcolato quando si costruisce il payload del riepilogo. Serve anche al sub-progetto #2 per non scaricare set incompleti inconsapevolmente.

### 5. (Opzionale) Avviso all'operatore prima dell'invio
Se una foto **obbligatoria** non è **mai stata scattata** (campo vuoto, diverso da "scattata ma non caricata" = segnaposto), avviso soft non bloccante "mancano N foto" in fase di invio. Coerente con la scelta "invio permesso". Marcato opzionale: incluso nella spec ma implementabile in coda al resto.

## File coinvolti

- `app/api/r/[token]/voce/route.ts` — merge + grazia post-invio (solo placeholder→path).
- `app/api/r/[token]/foto-campo/route.ts` — grazia post-invio finché esistono segnaposto.
- `utils/rapportini/` — nuovo helper puro `fotoInSospeso`/`contaFotoInSospeso` (+ test).
- Costruzione payload riepilogo (sorgente dei dati di `CardTerritorio`) — espone `fotoInSospeso` per rapportino.
- `components/modules/mappa/riepilogo/CardTerritorio.tsx` — badge.
- (Opzionale) `components/modules/rapportini/RapportinoForm.tsx` — avviso pre-invio.

## Test

- **Merge `/voce`** (unit): due payload parziali concorrenti non si cancellano; `null` esplicito cancella; placeholder→path sostituisce.
- **Helper foto in sospeso** (unit): conta correttamente `blob-locale:` su valori stringa e array; 0 quando tutti path reali.
- **Grazia post-invio** (unit/integrazione logica): `/foto-campo` e `/voce` accettano solo le transizioni placeholder→path su rapportino inviato con segnaposto; rifiutano altre modifiche.
- Verifica mirata con `npx vitest run <file>` sui file toccati (baseline test del repo già parzialmente rossa: contano i nuovi test verdi).

## Rollout / rischi

- Tutto lato server + un badge UI; **nessuna migrazione**, **nessuna SQL**. Deploy = push su main → Vercel auto.
- Rischio principale: la semantica del merge. Mitigato dai test sulle transizioni (parziale, null, placeholder→path) e dal vincolo "post-invio solo placeholder→path".
- Compatibile col vecchio flusso diretto (il merge protegge anche quello) e col nuovo offline.
