# Spec — Unificazione: mappa = rapportini = torre sullo stesso `interventi`

Data: 2026-06-03
Stato: approvata per implementazione (modalità autonoma su richiesta utente)

## Obiettivo

Far sì che la **pianificazione su Mappa Operatori** popoli la tabella canonica **`interventi`**, così che **torre di controllo**, **agenda operatore** e **rapportini** lavorino tutti sullo stesso insieme di interventi — niente più binari separati (oggi la mappa usa task jsonb volatili, la torre legge `interventi` vuota).

## Stato attuale (dall'analisi)

- `saveDistribution` → `POST/PUT /api/mappa/piani` salva `mappa_piani` + `mappa_piani_operatori.tasks` (jsonb). **Non** crea `interventi`.
- `genera` rapportini → `taskToVoce` → `rapportino_voci.task_id` (stringa, non FK).
- `interventi` ha già `piano_id` (FK → `mappa_piani`); mancano collegamenti dalle voci.
- Tipo `Task` (`utils/routing/types.ts`) mappa quasi 1:1 su `interventi` (odl, pdr, indirizzo, cap, citta→comune, nominativo, matricola→matricola_contatore, fascia_oraria, lat, lng, attivita→intervento_tipo). Mancano: `committente`, `data`, `staff_id`, `stato`, `territorio_id` (forniti dal contesto piano).

## Decisioni di design

1. **Quando si creano gli interventi** — al **salvataggio della distribuzione** (dopo POST/PUT `/api/mappa/piani`). Endpoint dedicato `POST /api/mappa/piani/interventi` (o esteso nel salvataggio).
2. **Idempotenza** — al ri-salvataggio dello stesso piano: **upsert** per chiave `(piano_id, odl)` (o task id stabile); gli interventi già **completati non vengono sovrascritti** nello stato (si aggiornano solo i campi anagrafici/assegnazione). Evita duplicati e non perde il lavoro.
3. **Campi** — `committente='acea'` (default mappa; per-commessa in futuro), `data = piano.data`, `staff_id = operatore`, `stato='assegnato'`, `territorio_id = piano`, `piano_id`, `created_from_mappa=true`.
4. **Collegamento voci↔interventi** — nuova colonna `rapportino_voci.intervento_id` (FK). In `genera`, ogni voce riceve l'`intervento_id` corrispondente (match per `odl`/task).
5. **Stato derivato dal rapportino** — quando il rapportino viene **inviato** (`submitted_at`/`stato='inviato'`), gli interventi delle sue voci → `stato='completato'`, `esito='eseguito_positivo'` (default), `chiuso_at=now()`. (Esito fine Fatto/Non fatto per-voce = miglioramento successivo, via campo template o agenda 2-A.)
6. **Coesistenza** — i `tasks` jsonb restano per la UI della mappa; gli `interventi` sono il canonico **aggiuntivo** che alimenta torre/agenda/riepilogo. L'agenda 2-A (Fatto/Non fatto) resta disponibile come via alternativa di chiusura.

## Migration
- **M-unif-1** `rapportino_voci.intervento_id uuid references interventi(id) on delete set null` + indice.
- **M-unif-2** `interventi.created_from_mappa boolean default false` (per distinguere/idempotenza) + indice `(piano_id, odl)`.

## Fasi di implementazione
1. **Migration** (M-unif-1, M-unif-2) — file committati, applicati dall'utente.
2. **Mappa → interventi**: al salvataggio piano, upsert record `interventi` dai task (logica pura `taskToIntervento` testabile + API).
3. **Genera collega voci**: `genera/route.ts` collega `rapportino_voci.intervento_id` agli interventi del piano.
4. **Stato da rapportino**: quando il rapportino è inviato, aggiorna gli interventi collegati a `completato`.
5. **Verifica**: torre/agenda/riepilogo mostrano gli interventi creati dalla pianificazione.

## Test (vitest, TDD)
- `taskToIntervento(task, ctx)` — mappatura campi + default (committente, stato, data, staff_id). Logica pura.
- (resto = I/O, verificato con tsc/build + runtime utente).

## Retrocompatibilità
- Rapportini esistenti senza `intervento_id` → non appaiono in torre finché non rigenerati (accettabile; backfill opzionale per piani correnti).
- Nessun campo rimosso; `tasks` jsonb invariato.
