# Spec — Fix popolamento Torre di controllo + scorrimento giorno nella dashboard rapportini

Data: 2026-06-03
Stato: approvata per implementazione

## Obiettivo

1. **Torre di controllo** — popolare correttamente board e mappa con gli interventi dei piani del giorno; rendere funzionante il filtro per operatore.
2. **Dashboard** — rendere la card "Stato rapportini" navigabile per giorno, così da vedere il riepilogo dei 4 stati (Inviati / In corso / Scaduti / Non consegnati) di una data specifica.

## Diagnosi (causa radice, verificata sui dati reali)

- La tabella `interventi` è **completamente vuota** (0 righe su qualsiasi data). La torre legge esclusivamente da `interventi` → board e mappa vuote, anche se i piani (`mappa_piani`) e i 4 rapportini di oggi esistono regolarmente.
- Gli interventi nascono **solo** da `POST /api/mappa/piani/interventi`, chiamato **solo** dentro `saveDistribution` ("Salva distribuzione"). **Generare i rapportini non crea interventi.** I piani esistenti sono stati salvati/generati senza che questo passaggio venisse eseguito → nessun intervento.
- Cascata: la generazione rapportini prova a collegare ogni voce all'intervento (`intByKey`), ma con `interventi` vuota ogni `intervento_id` resta `null`; di conseguenza l'invio rapportino (`/api/r/[token]/invia`) non chiude alcun intervento (fasi 3 e 4 dell'unificazione inattive).
- Filtro operatori "non funziona" perché: (a) a valle, non c'è nulla da filtrare; (b) due bug reali nel gruppo "Non assegnati", dove `operatore.id = null` viene usato sia come "nessuna selezione" sia come identità del gruppo.

Verifiche fatte: migration `20260603030000` applicata (colonna `created_from_mappa` presente); i 4 operatori del piano ACEA sono validi oggi (compariranno in colonna una volta creati gli interventi); la catena `staff.id → mappa_piani_operatori.staff_id → interventi.staff_id` è coerente.

## Decisioni di design

### Parte A — Torre di controllo

1. **Logica pura** — `lib/interventi/planInterventiForPiano.ts` (nuovo, TDD):
   `planInterventi({ piano, operatori, esistenti, territorioId, odlGiaPresenti })` → `{ idDaEliminare: string[], daInserire: InterventoDaMappa[] }`.
   - preserva gli interventi **terminali** (`completato` / `annullato`);
   - rigenera i non-terminali dai task correnti (via `taskToIntervento`);
   - **dedup interno** per `(committente, odl, data)`;
   - **scarta** le righe il cui `odl` è già presente in `interventi` su **altri** piani della stessa data (`odlGiaPresenti`), per rispettare l'indice unico globale `interventi_dedup_idx` ed evitare il fallimento dell'intero insert.
   Nessun I/O → testabile.

2. **Wrapper I/O** — `lib/interventi/ensureInterventiForPiano.ts` (nuovo):
   `ensureInterventiForPiano(db, pianoId)` con il **client iniettato** (riceve un `SupabaseClient`, **non** importa `server-only` né `supabaseAdmin`, così è riusabile dallo script di backfill via `tsx`).
   - carica piano (id, data, territorio), risolve `territorio_id` dal nome via `territories`, carica operatori (`mappa_piani_operatori`), interventi esistenti del piano, e gli `odl` già presenti su altri piani della stessa `data`;
   - chiama `planInterventi`, esegue `delete(idDaEliminare)` + `insert(daInserire)`;
   - ritorna `{ creati, preservati, scartati, error? }`.

3. **Route** `app/api/mappa/piani/interventi/route.ts` — si riduce a `ensureInterventiForPiano(supabaseAdmin, pianoId)` e restituisce il riepilogo. Comportamento invariato dal punto di vista del chiamante (`saveDistribution`).

4. **Route** `app/api/mappa/rapportini/genera/route.ts` — chiama `ensureInterventiForPiano(supabaseAdmin, pianoId)` **prima** di costruire `intByKey`. Così generare i rapportini garantisce gli interventi **e** collega correttamente le voci nello stesso passaggio (ripara la cascata). Se l'ensure fallisce: `console.error` + campo `warning` nella risposta, ma la generazione rapportini **prosegue** (non deve essere bloccata).

5. **Backfill** — `scripts/backfill-interventi.ts` (nuovo, eseguito via `npx tsx`):
   - carica `.env.local` da sé, crea un client service-role;
   - per ogni piano con `data >= fromDate` (default = oggi Europe/Rome; primo argomento CLI per override) chiama `ensureInterventiForPiano(client, piano.id)`;
   - idempotente; stampa un riepilogo per piano. Eseguito una volta per sbloccare oggi (ACEA + PERUGIA) e 2026-06-04.

6. **Bug filtro** — `components/modules/torre/TorreControlloClient.tsx`:
   introdurre un sentinella `'__na__'` per la selezione del gruppo "Non assegnati", distinto da `null` (= nessuna selezione):
   - evidenziazione: `sel = selStaff === (g.operatore.id ?? '__na__')`;
   - toggle onClick: usa `g.operatore.id ?? '__na__'`;
   - filtro mappa: `selStaff === '__na__'` → solo `staff_id == null`; altrimenti `selStaff` troncato → `staff_id === selStaff`; altrimenti tutti.
   La logica di filtro viene estratta in una funzione pura `filtraInterventi(items, selTerr, selStaff)` in `lib/interventi/torreView.ts` (TDD), e il componente la usa.

### Parte B — Dashboard "Stato rapportini"

7. **Componente** `components/modules/dashboard/RapportiniKpi.tsx`:
   - nuovo stato `giorno` (default = oggi Europe/Rome);
   - **stepper** in alto: `◀  <data>  ▶` + scorciatoia **"Oggi"**;
   - a ogni cambio giorno: fetch `/api/mappa/rapportini/riepilogo?from=<giorno>&to=<giorno>` (l'endpoint già filtra su `data`), poi `aggregateRapportiniKpi(righeDelGiorno, oggi)`;
   - i 4 tile mostrano il riepilogo **di quel giorno**; didascalia "N rapportini per *<data>*";
   - link **"Riepilogo completo →"** invariato (visione d'insieme sull'intero periodo).

8. **Logica pura** — `lib/dashboard/addDaysIso.ts` (nuovo): `addDaysIso(iso, n)` per lo step ±1 giorno su stringa `YYYY-MM-DD` senza aritmetica fragile su `Date`. `aggregateRapportiniKpi` resta invariato.

## Architettura (file toccati)

| File | Tipo | Scopo |
|---|---|---|
| `lib/interventi/planInterventiForPiano.ts` + test | nuovo | pianificazione pura interventi del piano |
| `lib/interventi/ensureInterventiForPiano.ts` | nuovo | wrapper I/O (client iniettato), riusabile |
| `app/api/mappa/piani/interventi/route.ts` | edit | usa l'helper |
| `app/api/mappa/rapportini/genera/route.ts` | edit | chiama l'helper prima del linking voci |
| `scripts/backfill-interventi.ts` | nuovo | backfill piani esistenti (via tsx) |
| `components/modules/torre/TorreControlloClient.tsx` | edit | fix sentinella filtro "Non assegnati" |
| `lib/interventi/torreView.ts` + test | edit | nuova `filtraInterventi` pura |
| `components/modules/dashboard/RapportiniKpi.tsx` | edit | stepper giorno + fetch per giorno |
| `lib/dashboard/addDaysIso.ts` + test | nuovo | step ±1 giorno puro |

## Flusso dati dopo il fix

Salva distribuzione → `ensureInterventiForPiano` → interventi `assegnato`.
Genera rapportini → stesso helper (idempotente: garantisce interventi e collega le voci) → `rapportino_voci.intervento_id` valorizzato.
Operatore invia rapportino → `/api/r/[token]/invia` chiude gli interventi collegati (`completato` / `eseguito_positivo`).
Torre legge `interventi` per data, raggruppa per operatore, si aggiorna live; filtri operatore/territorio funzionanti.
Dashboard: la card mostra il riepilogo rapportini del giorno selezionato.

## Gestione errori

- `ensureInterventiForPiano`: idempotente; lo scarto preventivo degli `odl` cross-piano rende l'insert robusto all'indice unico.
- `genera`: ensure best-effort (try/catch, prosegue con warning).
- backfill: log per piano, continua sui successivi anche se uno fallisce.

## Test (vitest, TDD)

- `planInterventiForPiano`: preserva terminali; calcola `idDaEliminare` dei non-terminali; mappa task→righe; dedup `odl` interno; scarto `odl` cross-piano.
- `filtraInterventi`: operatore selezionato; "Non assegnati" via sentinella; filtro territorio; nessun filtro.
- `addDaysIso`: ±1 giorno; cambio mese; anno bisestile.
- I test esistenti di `torreView` restano verdi.

## Retrocompatibilità / sicurezza

- Torre in sola lettura; l'helper **preserva** gli interventi già chiusi (terminali).
- Stati operatore minimi (`assegnato`→`completato`, senza intermedi): rigenerare i non-terminali è sicuro.
- Backfill idempotente: nessuna perdita di dati terminali.
- L'helper non importa `server-only`/`supabaseAdmin` (client iniettato): nessun rischio di leak del client admin nel bundle browser.

## Fuori scope (segnalato)

- **"ACEA" come territorio**: il piano ACEA ha `territorio = "ACEA"`, che non è una riga di `territories` → quegli interventi avranno `territorio_id = null` (compaiono sotto "Tutti i territori", non filtrando per un territorio specifico). Da affrontare a parte.
- Card **"Operatori di oggi"** della dashboard: dovrebbe ripopolarsi dopo il backfill (stessa causa radice); non modificata in questa spec.
- Connettore Playwright, riconsegna misuratori, KPI premialità (roadmap Fase 2).
