# Coda Lista attesa — filtri, ricerca e dati in anteprima — design

Data: 2026-06-16
Stato: design approvato → spec di dettaglio

## Problema / obiettivo

La coda "Richieste manuali · in attesa" (`CodaRichiesteManuali`) mostra solo
*operatore · committente · data · ora* per ogni riga. Con decine di richieste (es. 36, tutte
dello stesso operatore/committente) è impossibile identificarle o cercarne una. Servono:
- **dati in anteprima** (via + matricola) per ogni task;
- una **barra di ricerca** per via / matricola / ODS;
- **filtri a tendina**: Operatore, Committente, Attività.

## Vincoli

- **Additivo**: non toccare il feed realtime (`useRichiesteManualiFeed`), la presa in carico
  (Prendi/Rilascia/Override), né il pannello di revisione. Solo presentazione/filtro client.
- Filtro/ricerca **lato client** sui task già caricati dal feed (la coda è la lista in_attesa).

## Modello dati

Ogni riga è una `RigaCoda` (= `RigaRichiesta` + presa in carico). I dati anagrafici stanno in
`dati_correnti.anagrafica` (fallback `dati_operatore.anagrafica`): chiavi `via`, `matricola`,
`odl`, `attivita`, `comune`. L'operatore è `staff_id`/`staff_name`; il committente è `committente`.

## Componenti e modifiche

### Helper puri (con test, vitest)

`lib/interventi/manuali/filtraCoda.ts`:

- `datiAnagraficaCoda(riga)` → `{ via: string; matricola: string; odl: string; attivita: string }`
  estratti da `dati_correnti.anagrafica` (fallback `dati_operatore.anagrafica`), tutti trimmati,
  stringa vuota se assenti.
- `type FiltriCoda = { ricerca: string; operatore: string; committente: string; attivita: string }`.
- `filtraCoda(righe, f)` → applica AND tra i campi valorizzati:
  - `operatore` (≠'' ) → `riga.staff_id === f.operatore`;
  - `committente` (≠'') → `riga.committente === f.committente`;
  - `attivita` (≠'') → `attivita estratta === f.attivita`;
  - `ricerca` (≠'') → match **substring case-insensitive** su via OR matricola OR odl.

### UI — `components/modules/lista-attesa/CodaRichiesteManuali.tsx`

- Stato locale: `ricerca`, `filtroOperatore`, `filtroCommittente`, `filtroAttivita`.
- Sopra la lista: una **barra di ricerca** (placeholder "Cerca via, matricola, ODS…") + tre
  `select` (Operatore, Committente, Attività). Opzioni popolate dai valori distinti delle
  `richieste` correnti (operatori per staff_id→staff_name; committenti dalla mappa etichette;
  attività distinte da `datiAnagraficaCoda`).
- La lista renderizza `filtraCoda(richieste, filtri)` invece di `richieste`.
- In ogni riga, sotto/accanto a "operatore · committente · data · ora", una riga con
  **via + matricola** (da `datiAnagraficaCoda`), in `text-xs`/muted; nascosta se entrambe vuote.
- Header: "Richieste manuali · in attesa (N)"; se un filtro/ricerca è attivo, mostra
  "(M di N)" coi conteggi filtrato/totale.
- Stato vuoto filtrato: "Nessuna richiesta per i filtri selezionati."

## Gestione errori / non-rottura

- Tutto client-side; il feed e le azioni (prendi/rilascia/override/revisione) restano invariati.
- `datiAnagraficaCoda` tollera anagrafica assente/parziale (stringhe vuote).
- Realtime: i nuovi task entrano nel feed e vengono filtrati live (il filtro è calcolato a ogni render).

## Testing

- Unit (vitest) su `datiAnagraficaCoda` (estrazione/fallback/trim/assenti) e `filtraCoda`
  (ogni filtro singolo, combinazioni AND, ricerca substring su via/matricola/odl, case-insensitive).
- Lint + typecheck mirati su CodaRichiesteManuali + helper.
- Verifica visiva post-deploy: cercare una via/matricola filtra la coda; i filtri a tendina
  combinano con la ricerca; via+matricola visibili in anteprima.

## Fuori scope

- Ricerca/filtri sul **Registro** storico (i filtri ci sono già; eventuale ricerca testuale a parte).
- Persistenza dei filtri tra sessioni.
