# Redesign vista pianificazione (modulo Mappa) — Design

Data: 2026-06-15
Stato: in revisione
Tipo: **redesign puramente visivo** — nessuna modifica di logica

## Obiettivo

Ridurre l'affollamento di comandi e rendere leggibile il flusso della vista
`/hub/mappa?vista=pianifica`, per un utente di backoffice esperto che la usa ogni
giorno. Approccio scelto: **A — striscia di fasi + una sola schermata**, con i
controlli **evidenziati ma non nascosti** (la fase corrente spicca, il resto è
attenuato ma resta raggiungibile).

## Vincolo assoluto: conservazione della logica

Questo è il principio guida e ha la precedenza su qualsiasi scelta estetica.

- **Nessuna modifica** ad algoritmi (`capacityDistribute`, routing, ZTL,
  assenze), state, `useEffect`, handler (`distributeToOps`, `saveDistribution`,
  `generaRapportini`, `moveTask`, `eliminaTask`, `toggleAnnullaTask`, …) o route
  API.
- Cambia **solo il JSX di layout e lo stile** in
  [`components/modules/mappa/MappaOperatoriClient.tsx`](../../../components/modules/mappa/MappaOperatoriClient.tsx).
  Gli stessi pulsanti chiamano gli stessi handler.
- **Nessuna SQL, nessuna modifica al modello dati, nessun nuovo endpoint.**
- **Nessun click in più** rispetto a oggi: l'esperto deve poter fare tutto con
  lo stesso numero di azioni (o meno).

### Disciplina anti-regressione (la regola d'oro)

La nuova variabile "fase corrente" **guida solo lo stile** (enfasi/attenuazione)
e il **riposizionamento** di blocchi già esistenti. Non deve **mai** aggiungere
una condizione che impedisca un'azione oggi possibile. Le guardie di rendering
condizionale attuali (`excelMode`, `distribution`, `excelGeocoded >= 1`, ecc.)
restano invariate: un controllo visibile oggi resta visibile e cliccabile.

## Modello a fasi (derivato, non nuovo stato)

La fase corrente è **calcolata** dallo state già esistente — non introduce una
nuova fonte di verità. Helper puro e testabile:

```
computePhase(state) -> 1..6
  1 Setup        !setupDone && !isEditMode         (modale setup)
  2 Interventi   setupDone && allTasks.length === 0 && appuntamenti === 0
  3 Geocodifica  ci sono task ma excelGeocoded < tot  || isGeocoding
  4 Operatori    geocodificati ok && distribution === null
  5 Distribuzione distribution !== null && !currentPianoId
  6 Conferma     distribution !== null && currentPianoId  (salvato → invio/genera)
```

(I confini esatti vengono affinati in fase di piano, ma derivano **solo** da
variabili già presenti: `setupDone`, `isEditMode`, `excelMode`, `excelGeocoded`,
`isGeocoding`, `selectedOps`, `distribution`, `currentPianoId`, `rapStato`.)

L'helper vive in un nuovo file puro `lib/mappa/planningPhase.ts` con test unitari.
È l'**unico** codice nuovo, ed è privo di effetti collaterali.

## Layout nuovo, regione per regione

```
┌──────────────────────────────────────────────────────────────┐
│  STRISCIA FASI:  Setup✓ · Interventi✓ · Geocodifica✓ ·        │
│                  Operatori✓ · [Distribuzione] · Conferma       │
├──────────────────────────────────────────────────────────────┤
│  HEADER:  Pianifica indirizzi · data · territorio · N appunt. │
│           [➕ Aggiungi interventi ▾] [Esporta ▾] [Nuova]       │
├──────────────────────────────────────────────────────────────┤
│  ZONA FASE (avvisi/geocodifica/selezione operatori)           │
├───────────────────────────────────┬──────────────────────────┤
│  MAPPA                             │  PANNELLO (fase corrente) │
├───────────────────────────────────┴──────────────────────────┤
│  BARRA «CONFERMA PIANO»:  Modello ▾ · Salva · Genera          │
└──────────────────────────────────────────────────────────────┘
```

1. **Striscia di fasi** — nuovo, puramente presentazionale. Spunta le fasi fatte,
   evidenzia la corrente, attenua le future (che restano visibili). Le chip sono
   indicatori; opzionale lo scroll-to della regione al click (nessun cambiamento
   di stato logico).

2. **Header snellito** — un solo menu `➕ Aggiungi interventi ▾` che raccoglie i
   comandi-sorgente oggi sparsi, più `Esporta ▾`, `Nuova pianificazione`,
   `Percorso ottimale` e `Azzera` (filtri). Voci e disabilitazioni seguono le
   **stesse condizioni** di oggi.

3. **Zona fase** — i blocchi condizionali esistenti (barra geocodifica con il suo
   pulsante, pannello "Distribuisci tra operatori", avvisi ZTL/assenze/esecutori)
   restano dove sono logicamente pertinenti; vengono solo raggruppati visivamente
   e attenuati quando non sono la fase corrente.

4. **Mappa + pannello** — struttura invariata (mappa a sinistra, pannello a
   destra che già commuta per modalità). Il pannello riceve un bordo/accent quando
   è l'area della fase attiva.

5. **Barra «Conferma piano»** (in basso, in-flow, non `position:fixed`) — accoglie
   `Modello ▾` + `Salva distribuzione` + `Genera rapportini`, oggi annegati nella
   fila di ~9 controlli. Stessi handler, stesse disabilitazioni
   (`savingDistribution`, `rapTemplates.length > 0 && !rapTemplateId`, ecc.).
   La barra **compare appena esiste una distribuzione** (fase 5, per poter premere
   `Salva`); `Genera rapportini` resta condizionato a `currentPianoId` come oggi.
   La chip "Conferma" della striscia si **accende in fase 6** (dopo il salvataggio):
   marca il sotto-passo salva→genera→invio, non la comparsa della barra.

## Mappa controllo → nuova collocazione (inventario anti-regressione)

Ogni elemento interattivo di oggi e dove finisce. **Nessuno viene rimosso.**

| Controllo (oggi) | Handler | Nuova collocazione |
|---|---|---|
| DatePicker data | `setPlanningDate` | Header (invariato, stessa disabilitazione) |
| Nuova pianificazione | `handleNuovaPianificazione` | Header |
| Azzera filtri | reset filtri | Header (solo `!excelMode`, come oggi) |
| Scarica Template | `downloadTemplate` | Menu Aggiungi |
| Carica Excel | `fileInputRef.click` | Menu Aggiungi |
| Carica interventi del giorno | `caricaInterventiDelGiorno` | Menu Aggiungi |
| Chiudi Excel | `clearExcel` | Menu Aggiungi (o header, in `excelMode`) |
| + Aggiungi da template | `fileTemplateInputRef.click` | Menu Aggiungi (de-duplicato) |
| + Aggiungi manuale | `setManualModalOpen(true)` | Menu Aggiungi (de-duplicato) |
| Percorso ottimale | `setRouteMode` | Header (solo `!distribution`, come oggi) |
| Geocodifica/Riprendi/Interrompi | `startGeocoding` / cancel | Zona fase 3 (invariato) |
| Distribuisci tra operatori (toggle) | `setShowOpPicker` | Zona fase 4 |
| Checkbox operatori | `toggleOp` | Zona fase 4 |
| Qty / rimuovi operatore | `changeOpQty` / `setSelectedOps` | Zona fase 4 |
| Assegnazioni manuali | `setAssignModalOpen` | Zona fase 4 |
| Distribuisci / Assegna | `distributeToOps` | Zona fase 4 |
| Esporta Excel | `exportDistribution` | Menu Esporta |
| Azzera distribuzione | `setDistribution(null)…` | Pannello fase 5 |
| Modello (select) | `setRapTemplateId` | Barra Conferma |
| Salva distribuzione | `saveDistribution` | Barra Conferma |
| Genera rapportini | `generaRapportini` | Barra Conferma |
| Copia link / WhatsApp / Excel per operatore | `handleCopyLink` / link | Zona fase 6 (post-salva) |
| Cerca intervento | `setSearchQuery` | Pannello (invariato) |
| Tab operatori | `setActiveOpIdx` | Pannello (invariato) |
| Sposta tutti a… | `moveAllTasks` | Pannello (invariato) |
| Sposta / Annulla / Elimina task | `moveTask` / `toggleAnnullaTask` / `eliminaTask` | Pannello (invariato) |
| Non assegnati: Sposta / Correggi | `assignUnassignedTask` / `openEdit` | Pannello (invariato) |
| Solo da correggere / Reset filtri | `setExcelOnlyManualAction` | Pannello lista Excel (invariato) |
| Correggi / Modifica / Salva e geocodifica | `openEdit` / `saveAndGeocode` | Pannello (invariato) |
| Modali (Assegnazioni, Manuale, Conflitti, Setup) | invariati | invariati |

## Fuori scope (per restare a basso rischio)

- Estrazione del componente da 3735 righe in molti sotto-componenti: si estrae
  **solo** la striscia di fasi (presentazionale, nuova). Il resto si modifica
  in-place per evitare deriva di comportamento. Refactor più ampio = follow-up.
- Centro avvisi unico, drag-and-drop, pannello "Invia" dedicato: idee valide ma
  **non** in questo passaggio (erano alternative, non l'approccio A approvato).

## Verifica

1. `lib/mappa/planningPhase.ts` → test unitari (`vitest`) sui confini di fase.
2. `eslint` + `vitest` sui file toccati. Baseline già rossa → gate = **nessun
   nuovo** errore introdotto dai file del WP.
3. **Checklist inventario controlli**: per ogni riga della tabella sopra,
   verificare che l'elemento esista nel DOM ridisegnato e chiami lo stesso handler.
4. **Test dal vivo (sola lettura)** nel browser: percorrere le fasi 1→5 senza mai
   premere `Salva distribuzione` né `Genera rapportini` (puntano al DB di
   produzione). Confronto visivo prima/dopo per ogni fase.

## Rischi

- File unico molto grande: modifiche al JSX vanno fatte chirurgicamente per non
  rompere le numerose guardie condizionali.
- Tema/variabili Aurea: le nuove regioni devono usare le stesse variabili CSS
  (`--brand-*`) già in uso, niente colori hardcoded fuori palette.
- I menu a tendina (`Aggiungi ▾`, `Esporta ▾`) introducono un piccolo stato
  locale open/close: è presentazionale e isolato, non tocca la logica di dominio.
