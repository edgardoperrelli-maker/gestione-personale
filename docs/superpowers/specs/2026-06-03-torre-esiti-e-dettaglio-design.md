# Spec — Torre: propagazione esiti rapportino + dettaglio lavori arricchito

Data: 2026-06-03
Stato: approvata per implementazione

## Obiettivo

1. **Conteggi/esiti corretti.** I conteggi per operatore (⏳ assegnati · ✅ fatti · ❌ non fatti) e i colori (righe + pallini mappa) devono riflettere gli esiti che gli operatori hanno già registrato nei rapportini. Oggi mostrano `0✅·0❌` benché tutti i rapportini siano `inviato`.
2. **Dettaglio "come il rapportino".** Le righe del dettaglio sotto la mappa mostrano i dati identificativi del lavoro (ODL, indirizzo, comune, ecc.), non solo il comune.

## Diagnosi (verificata sui dati, 2026-06-03)

- 86 interventi oggi, **tutti `assegnato`**, 0 esiti.
- 4 rapportini, **tutti `inviato`**, ogni voce con `risposte` (`eseguito: SI/NO` + `note`).
- **`voci.intervento_id` = null** ovunque: le voci non sono collegate agli interventi (rapportini generati prima dell'unificazione), quindi l'invio non ha chiuso nulla; il backfill ha (ri)creato gli interventi come `assegnato`.
- Chiave di join affidabile: `voci.odsin == interventi.odl` (15/15 per il campione). 0 `agenda_token`: la validazione è nei rapportini.
- Bug aggiuntivo: `app/api/r/[token]/invia/route.ts` chiude **tutti** i collegati come `eseguito_positivo`, ignorando i `NO`.
- Bug minore UI: in `TorreControlloClient` la riga usa `nominativo ?? odl` con `nominativo` stringa vuota → non ripiega su ODL (mostra vuoto).

## Decisioni di design

### 1. Helper puro `esitoInterventoDaVoce` (riuso in sync + invia)
`lib/interventi/esitoDaVoce.ts` (TDD): `esitoInterventoDaVoce(risposte, campi)` → `{ esito: 'eseguito_positivo' | null; esito_motivo: string | null } | null`.
- usa `voceEsitoColore(risposte, campi)` (esistente, ritorna `verde|rossa|neutro`);
- `verde` → `{ esito: 'eseguito_positivo', esito_motivo: null }` (Fatto);
- `rossa` → `{ esito: null, esito_motivo: <risposte.note se stringa, trim, else null> }` (Non fatto);
- `neutro` → `null` (nessun esito ancora → non chiudere).
Chi chiude imposta `stato: 'completato'` + `chiuso_at`. Mapping coerente col modello "solo Fatto/Non fatto" (nessuna causale intermedia; per i KO la nota libera va in `esito_motivo`).

### 2. Sync esiti una-tantum
`scripts/sync-esiti-rapportini.ts` (eseguito via `npx tsx`, **scrittura su prod → la lancia l'utente**, idempotente). Per una data (default oggi):
- carica i rapportini `inviato` con `staff_id`, `campi_snapshot`;
- per ciascuno, carica le voci (`id, odsin, risposte, intervento_id`);
- carica gli interventi della data per `staff_id`, indicizzati per `odl` (trim);
- per ogni voce: trova l'intervento per `odl == odsin`; se trovato, aggiorna `voci.intervento_id` (re-link) e, se `esitoInterventoDaVoce` ≠ null, aggiorna l'intervento `{ stato: 'completato', esito, esito_motivo, chiuso_at }`;
- salta gli interventi già terminali; logga riepilogo per rapportino.

### 3. Fix rotta `invia` (per-voce)
`app/api/r/[token]/invia/route.ts`: oltre a `stato: 'inviato'` sul rapportino, carica `campi_snapshot` del rapportino e le voci con `intervento_id` **e** `risposte`; per ogni voce con `intervento_id`, calcola `esitoInterventoDaVoce` e aggiorna quel singolo intervento (`completato` + esito per-voce) **saltando** i neutri e i `già annullato`. Sostituisce l'update in blocco a `eseguito_positivo`.

### 4. Dettaglio arricchito + fix riga
- Query torre `app/hub/torre/page.tsx` e tipo `TorreIntervento`: aggiungere `pdr, matricola_contatore, intervento_tipo, cap`.
- Helper puro `rigaDettaglio(it)` in `torreView.ts` (TDD) → `{ primario, secondario }`:
  - `primario` = `nominativo` (trim) **||** `odl` (trim) **||** `'Intervento'` (niente `??`, così la stringa vuota ripiega);
  - `secondario` = `indirizzo, comune CAP · ODL … · PDR … · matr. … · attività · fascia`, solo campi presenti, senza ripetere l'ODL se è già il primario.
- `TorreControlloClient`: ogni riga del dettaglio mostra `primario` (grassetto) + `secondario` (muted, piccolo) + esito/stato a destra + `esito_motivo` per i KO.

### 5. Colori righe + pallini mappa per esito — invariati
Già implementati (`coloreStato` → tono → `bg` riga e `dot` mappa) e live via subscription. Dopo il sync diventano verdi/rossi automaticamente. Nessuna modifica.

## Architettura (file)

| File | Tipo | Scopo |
|---|---|---|
| `lib/interventi/esitoDaVoce.ts` + test | nuovo | mapping puro voce→esito intervento |
| `scripts/sync-esiti-rapportini.ts` | nuovo | propagazione una-tantum (user-run) |
| `app/api/r/[token]/invia/route.ts` | modifica | esito per-voce all'invio |
| `app/hub/torre/page.tsx` | modifica | query: +pdr,matricola_contatore,intervento_tipo,cap |
| `components/modules/torre/TorreControlloClient.tsx` | modifica | tipo +campi; righe dettaglio arricchite |
| `lib/interventi/torreView.ts` + test | modifica | `rigaDettaglio` pura |

## Test (vitest)

- `esitoInterventoDaVoce`: select `eseguito=SI`→`{eseguito_positivo,null}`; `=NO`→`{null, nota}`; nessun campo valorizzato→`null`; nota assente su rossa→`esito_motivo=null`.
- `rigaDettaglio`: dati completi; nominativo vuoto → primario=ODL; ACEA (no nominativo, ODL+indirizzo) → primario=ODL, secondario con indirizzo/comune; ODL primario non ripetuto nel secondario.

## Retrocompatibilità / sicurezza

- Nessuna migration. Il sync e l'invia preservano gli interventi terminali e non toccano gli `annullato`.
- Il sync è idempotente (ri-eseguibile). Scrittura su prod lanciata dall'utente.
- L'invia continua a funzionare per i rapportini generati post-unificazione (voci già collegate via `genera`).

## Fuori scope

- Causali KO specifiche (accesso negato, ecc.): il rapportino ha solo SI/NO + nota → KO generico (`esito=null`) + nota.
- "ACEA" come territorio (`territorio_id` null), card "Operatori di oggi", KPI premialità.
