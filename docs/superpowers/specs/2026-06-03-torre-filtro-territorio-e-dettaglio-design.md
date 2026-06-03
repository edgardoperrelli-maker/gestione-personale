# Spec — Torre: filtro operatori per territorio + dettaglio lavori sotto la mappa

Data: 2026-06-03
Stato: approvata per implementazione

## Obiettivo

1. **Filtro territorio → solo operatori del territorio.** Selezionando un territorio, la colonna sinistra mostra solo gli operatori che hanno lavori in quel territorio.
2. **Dettaglio lavori sotto la mappa.** La colonna sinistra diventa compatta (nome + conteggi, come filtri); l'elenco dei singoli lavori si sposta in un pannello **sotto la mappa**, con **righe colorate** per esito (verde = positivo, rosso = negativo), aggiornate **live**, per l'operatore selezionato (o tutti i lavori della vista se nessuna selezione).
3. **Data** — già funzionante: il selettore in alto ricarica la pagina con `?data=` e il server interroga solo quella data. Confermato, nessuna modifica.

## Contesto (codice attuale)

- `components/modules/torre/TorreControlloClient.tsx`: colonna sinistra (dropdown territori + card operatori **con l'elenco dei loro interventi**), colonna destra (banner filtro + `TorreMappa`, sticky).
- `filtraInterventi(items, selTerr, selStaff)` (in `lib/interventi/torreView.ts`) già alimenta `itemsTerr` (board, solo territorio) e `itemsMappa` (mappa, territorio + operatore). Il pannello dettaglio userà esattamente `itemsMappa`.
- `coloreStato(stato, esito) → TonoTorre`; nel componente la mappa `TONO` ha `fg`/`dot`/`label` per tono; `labelStato` da `interventiView`.
- La subscription Realtime aggiorna `items` → board, mappa e (nuovo) dettaglio sono già live.

## Decisioni di design

### 1. Operatori filtrati per territorio
Funzione pura `operatoriVisibili(gruppi, selTerr)` in `lib/interventi/torreView.ts` (TDD):
- se `selTerr` è valorizzato → restituisce solo i gruppi con `interventi.length > 0` (operatori con lavori in quel territorio; include il gruppo "Non assegnati" se ha lavori lì);
- se `selTerr` è null → restituisce tutti i gruppi (comportamento attuale).
Il componente renderizza `operatoriVisibili(gruppi, selTerr)` al posto di `gruppi`.

### 2. Colonna sinistra compatta
Rimuovere il blocco `<ul>` con l'elenco dei singoli interventi dalle card operatore (attuali righe ~175–193): restano nome + conteggi (`⏳/✅/❌`). Le card restano pulsanti-filtro (toggle `selStaff` con sentinella già esistente). Resta il dropdown territorio in cima.

### 3. Pannello dettaglio sotto la mappa
Nuova sezione nella colonna destra, **dopo** `TorreMappa`, che renderizza `itemsMappa` come righe colorate:
- **Intestazione**: "Dettaglio lavori — {nomeSel}" se un operatore è selezionato; "Tutti i lavori" altrimenti. Mostra il conteggio righe.
- **Riga**: sfondo tenue per tono + nominativo/ODL · comune a sinistra; a destra l'etichetta esito/stato (`Fatto`/`Non fatto` per i completati via `tono.label`, altrimenti `labelStato(stato)`); per i KO, se presente, `esito_motivo` come sottotesto.
- **Colori riga** (aggiungo il campo `bg` alla mappa `TONO` del componente):
  - `ok` → `var(--success-soft)` / testo `var(--success)`
  - `ko` → `var(--danger-soft)` / `var(--danger)`
  - `attesa` → `var(--warning-soft)` / `var(--warning)`
  - `corso` → azzurro tenue `rgba(56,189,248,0.12)` / `var(--brand-text-main)`
  - `annullato` / `da_assegnare` → `var(--brand-surface-muted)` / `var(--brand-text-muted)`
- **Scrollabile** (max-height), niente troncamenti silenziosi. Se `itemsMappa` è vuoto → riga "Nessun lavoro".
- **Live**: deriva da `items` (stato aggiornato dalla subscription), come la mappa.

### 4. Data — invariata
Il selettore data esistente filtra già la sola data selezionata (query server `eq('data', data)` + subscription `data=eq.<data>`). Nessuna modifica.

## Architettura (file toccati)

| File | Tipo | Scopo |
|---|---|---|
| `lib/interventi/torreView.ts` | modifica | nuova `operatoriVisibili(gruppi, selTerr)` pura |
| `lib/interventi/torreView.test.ts` | modifica | test di `operatoriVisibili` |
| `components/modules/torre/TorreControlloClient.tsx` | modifica | card compatte, uso di `operatoriVisibili`, pannello dettaglio sotto la mappa, `TONO.bg` |

## Test (vitest)

- `operatoriVisibili`: con territorio (solo gruppi con lavori); senza territorio (tutti); gruppo "Non assegnati" incluso se ha lavori nel territorio; gruppo a zero escluso quando si filtra.
- `filtraInterventi` (già testata) alimenta sia mappa sia dettaglio: nessun nuovo test necessario.
- Il resto è UI (rendering del pannello, colori): verifica visiva.

## Retrocompatibilità / sicurezza

- Solo lettura; nessuna modifica al data-model né alle query server. Nessuna migration.
- La sentinella "Non assegnati" e `filtraInterventi` restano invariate.

## Fuori scope

- "ACEA" come territorio (`territorio_id` null per quel piano) — invariato; quegli interventi compaiono sotto "Tutti i territori".
- Riposizionamento del selettore data.
- Card "Operatori di oggi" della dashboard.
