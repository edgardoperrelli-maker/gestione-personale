# Modulo ACEA — Fase 1 (implementation plan)

**Studio di riferimento:** [`docs/acea-modulo-fattibilita.md`](../../acea-modulo-fattibilita.md) — 20 decisioni approvate.

**Goal:** portare la gestione della commessa ACEA dentro l'app — registro ordini da import
manuale dell'export Cruscotto, tabella di pianificazione con editing stile Excel, generazione
automatica dei rapportini — così da abbandonare i master Excel su SharePoint e la dipendenza
dall'agente locale.

**Architettura:** un registro immutabile (`acea_ordini`) alimentato solo dall'ingestione, la
pianificazione che resta in `interventi`, un motore rapportini ACEA separato da quello Italgas, e un
modulo a fogliette (Dunning · Limitazioni massive · Misuratori).

**Stack:** Next.js 15 App Router · TypeScript strict · Supabase · Vitest · Tailwind 4 con i token di
`DESIGN.md` · **due dipendenze nuove approvate**: `@tanstack/react-table`, `@tanstack/react-virtual`.

**Baseline rossa:** `npm run lint` e `npx vitest run` interi sono già rossi su main. I gate qui sono
**mirati**: `npx vitest run <file del task>` deve passare, e nessun nuovo errore nei file toccati.

**Regola di sicurezza per tutta la Fase 1:** non si smonta nulla di `tools/limitazioni-sync` e non
si tocca `sincronizzaRapportini`. L'agente resta funzionante come rete di ripopolamento del master.

---

## Vincoli di casa da rispettare (AGENTS.md)

- `lib/moduleAccess.ts` e `middleware.ts` si toccano **solo** con istruzione esplicita: qui c'è
  (registrazione del modulo `acea`), ma va fatta in un commit isolato e nient'altro in quel file.
- Zero `any`, zero `@ts-ignore`, zero `console.log`, zero colori hardcoded.
- Vietati `alert()`/`confirm()` nativi → `toast.*` e `ConfirmDialog`.
- Primitivi esistenti prima di crearne di nuovi: `FogliettaCard`, `Breadcrumb`, `FilterBar`,
  `DetailDrawer`, `StatTile`, `Dialog`, `Skeleton`.
- Date: `YYYY-MM-DD` per Supabase, `dd/MM/yyyy` a video. Numeri con `font-mono tabular-nums`.

---

## File structure

```
docs/fixtures/acea/export-campione.xlsx        ← fixture anonimizzata (Parte 0)

supabase/migrations/
  20260727090000_acea_ordini.sql               ← registro + eventi + impianti + import
  20260727091000_rapportino_voci_origine.sql   ← colonna origine + delete ristretto
  20260727092000_interventi_ordine_id.sql      ← FK + backfill

lib/acea/
  colonneExport.ts / .test.ts                  ← nomi colonna, validazione intestazione
  parseTestoOrdine.ts / .test.ts               ← impianto + matricola dai 3 marcatori
  famiglia.ts / .test.ts                       ← Tipo di ordine → famiglia
  statiOrdine.ts / .test.ts                    ← COMP/DAPI/RICE/ASGN/SOSP/ANNL
  scadenza.ts / .test.ts                       ← creazione + 14gg, RIAT/REVO 1gg
  rigaHash.ts / .test.ts                       ← hash dei soli campi ACEA
  parseExportAcea.ts / .test.ts                ← orchestratore di lettura file
  riconciliaImport.ts / .test.ts               ← diff: nuove/modificate/invariate/annullate
  saracinesche.ts / .test.ts                   ← stati derivati
  comuniMassive.ts / .test.ts                  ← comuni dal registro (sostituisce la fonte agente)

app/api/acea/
  import/route.ts                              ← POST multipart
  ordini/route.ts                              ← GET registro filtrato
  pianifica/route.ts                           ← POST assegnazione in blocco + undo
  rapportini/route.ts                          ← POST generazione
  export-pianificato/route.ts                  ← GET xlsx del giorno
  export-master/route.ts                       ← GET xlsx layout master

lib/interventi/
  sincronizzaRapportiniAcea.ts / .test.ts      ← motore separato

components/modules/acea/
  AceaNav.tsx                                  ← fogliette
  ImportCard.tsx  RiepilogoImport.tsx
  TabellaOrdini.tsx  useTabellaAcea.ts
  EditingGriglia.ts / .test.ts                 ← focus, range, clipboard, undo
  BarraAzioni.tsx  ColonneMenu.tsx
  DunningClient.tsx  MassiveClient.tsx

app/hub/acea/
  page.tsx  dunning/page.tsx  massive/page.tsx  misuratori/page.tsx
```

---

## PARTE 0 — Fixture

### Task 0.1: campione anonimizzato dell'export

L'export reale contiene nominativi e indirizzi di clienti ACEA: **non entra nel repo**. Serve un
campione che copra tutti i casi limite, con indirizzi e nominativi sostituiti.

- [ ] Script one-shot che estrae ~40 righe dal file reale coprendo: i tre marcatori del testo
      ordine, il troncamento a 40 caratteri (`LEN`/`LENT`/`LENTE_MM_`), matricole con prefisso
      alfabetico e con trattino, una matricola a 16 caratteri, i sei stati, le cinque famiglie,
      l'ordine con due operazioni, le righe `REVO` con `Escludi = X`, un `AVUF` senza impianto,
      righe con e senza `Cognome C.I.D.`.
- [ ] Anonimizzazione: `Via`, `N. civico`, `CAP` sostituiti con valori fittizi coerenti; ODL,
      impianto e matricola mantenuti (non sono dati personali e servono agli aggancî).
- [ ] Salvare in `docs/fixtures/acea/export-campione.xlsx` e verificare che il campione produca gli
      stessi esiti di parsing del file reale sui casi coperti.

---

## PARTE 1 — Database

### Task 1.1: `acea_ordini` + `acea_ordini_eventi` + `acea_impianti` + `acea_import`

- [ ] Migration `20260727090000_acea_ordini.sql`.

Punti non negoziabili:

```sql
-- chiave: la coppia, non l'ODL
primary key (odl, numero_operazione)

-- il dato ACEA non è scrivibile dall'app
revoke insert, update, delete on acea_ordini from authenticated;
grant select on acea_ordini to authenticated;

-- unica tabella mista: privilegi di COLONNA
grant update (indirizzo_verificato, verificato_da, verificato_il)
  on acea_impianti to authenticated;
```

- [ ] RLS su tutte e quattro (convenzione di casa: policy permissiva `authenticated` in lettura,
      authz reale nei guard API).
- [ ] Indici: `(famiglia, stato_norm)`, `(comune)`, `(data_creazione)`, `(impianto)`,
      `(matricola_norm)`, `(scaduto_al)` se materializzata.
- [ ] `acea_import`: `sha256` unique, righe totali/nuove/modificate/invariate/annullate, finestra
      coperta, `caricato_da`, `caricato_il`, `storage_path`.
- [ ] Bucket Storage `acea-import` privato per gli xlsx originali.

Verifica: `mcp supabase list_tables` o `\d acea_ordini`; un `update` da ruolo `authenticated` deve
fallire con permission denied.

### Task 1.2: `rapportino_voci.origine`

- [ ] Migration `20260727091000`: colonna `origine text not null default 'task'` con check
      `in ('task','manuale','acea')`; backfill `'manuale'` dove `manuale = true`.
- [ ] **Unica modifica a `sincronizzaRapportini.ts`**: la delete alla riga ~291 passa da
      `.eq('manuale', false)` a `.eq('origine', 'task')`.
- [ ] Test di regressione: `npx vitest run lib/interventi/sincronizzaRapportini.test.ts` verde, più
      un test nuovo che verifica che una voce `origine='acea'` **sopravvive** a una rigenerazione di
      piano.

> È l'unico punto in cui si tocca il motore Italgas. Commit isolato, nient'altro dentro.

### Task 1.3: `interventi.ordine_id` + backfill

- [ ] Migration `20260727092000`: colonna nullable + FK verso `acea_ordini` con
      `on delete set null` (un ODL annullato non deve cancellare l'intervento eseguito).
- [ ] Backfill per ODL dei 5.375 interventi ACEA esistenti, dopo il primo import.

---

## PARTE 2 — Parser (funzioni pure, TDD)

Tutte le funzioni di questa parte sono **pure e testate sulla fixture**. Nessuna tocca il DB.

### Task 2.1: `parseTestoOrdine`

- [ ] Test prima: i tre marcatori, il caso minuscolo `Sost_Sarac_ser`, il troncamento, le matricole
      `123324A` / `04-228458` / `MIS-E392-3017` / `OA3494` / `99AO23231`, e il caso senza impianto
      (`SCISSIONE_ODL_PADRE`, `RICERCA FRODE_ZAGAROLO`) che deve restituire `null` senza lanciare.

```ts
export type EstrazioneImpianto = {
  impianto: string | null;
  matricola: string | null;
  /** true se il testo è a 40 caratteri e la matricola tocca il limite: possibile troncamento. */
  sospettoTroncamento: boolean;
};
export function parseTestoOrdine(testo: string): EstrazioneImpianto;
```

- [ ] Regola: impianto = 10 cifre iniziali; matricola = primo token dopo
      `LIM_MAS_MATR_` | `LIM_MASS_` | `SOST_SARAC_SER_` (case-insensitive, `_` o spazio).
- [ ] `sospettoTroncamento` a `true` quando `testo.length >= 40` e la matricola termina a fine
      stringa: non blocca, segnala.
- [ ] Il parsing **non decide mai l'attività** — quella si legge solo da `Operazione testo breve`.

### Task 2.2: `famiglia`, `statiOrdine`, `scadenza`

- [ ] `famigliaDaTipoOrdine`: `ASTR` → `'massive'`; `ALIM`/`AMOR`/`ARMO`/`AVUF` → `'dunning'`;
      ignoto → `'dunning'` con flag di avviso (mai scartare una riga).
- [ ] `isAperto`: `DAPI`, `RICE`, `ASGN`, **`SOSP`** → true. `COMP` chiuso, `ANNL` da eliminare.
- [ ] `scadenzaOrdine({ famiglia, codiceSla, dataCreazione })`:
      massive → `null` (**non scadono mai**); `RIAT`/`REVO` → creazione + 1 giorno; resto dunning →
      creazione + 14 giorni. Restituisce anche `giorniResidui` rispetto a una data data.
- [ ] Test sui casi di bordo: scadenza oggi, scaduta ieri, riga massive (deve essere `null` anche
      con `Data fine cardine` valorizzata).

### Task 2.3: `rigaHash` e `colonneExport`

- [ ] `rigaHash`: sha256 dei soli campi ACEA in ordine fisso. Due letture della stessa riga → stesso
      hash; un campo diverso → hash diverso. Serve al «salta se identica».
- [ ] `validaIntestazione`: rifiuta se manca una colonna obbligatoria o se il foglio non è
      `Esportazione SAPUI5`.
- [ ] `validaProvenienza`: `Contratto = 3600002158` e `Fornitore = 25617` su tutte le righe; un file
      di un'altra commessa viene rifiutato **prima** di scrivere.

### Task 2.4: `parseExportAcea`

- [ ] Orchestratore: legge il workbook con `exceljs`, valida, mappa ogni riga in `RigaOrdineAcea`
      (~35 campi utili), applica `parseTestoOrdine` quando la colonna matricola è vuota, calcola
      famiglia, stato, scadenza, hash.
- [ ] Test sulla fixture: 40 righe attese, zero eccezioni, copertura impianto ≥ 99%, gli 8 casi
      senza impianto passano con `null`.

---

## PARTE 3 — Import

### Task 3.1: `riconciliaImport` (puro)

- [ ] Dato l'insieme delle righe del file e lo stato corrente del registro, produce il piano di
      scrittura: `nuove[]`, `modificate[]`, `invariate` (conteggio), `daEliminare[]` (le `ANNL`),
      `nonCoperte` (in DB e assenti dal file, **da non toccare**).
- [ ] Test dei casi decisi nello studio: riga identica → invariata; `ANNL` presente → eliminazione;
      ODL in DB assente dal file → nessuna azione; riga cambiata → modificata con la lista dei campi
      cambiati per il change-log.

### Task 3.2: `POST /api/acea/import`

- [ ] Guard admin (`requireUser` + ruolo), `runtime = 'nodejs'`.
- [ ] Flusso: sha256 → se già importato risponde `409` con i dati dell'import precedente e attende
      conferma → valida provenienza → parse → riconcilia → scrive in transazione logica →
      registra `acea_import` → archivia l'xlsx in Storage.
- [ ] Gli `ANNL` con `interventi` collegati **non spariscono in silenzio**: la risposta include
      l'elenco (ODL, data pianificata, operatore) per il riepilogo.
- [ ] Eventi nel change-log solo per i campi realmente cambiati.
- [ ] Verifica manuale con la fixture: primo import (tutte nuove) → secondo import identico (tutte
      invariate, zero scritture, `updated_at` immutato).

### Task 3.3: UI di import

- [ ] `ImportCard`: drop area, stato di avanzamento, riuso del pattern di
      `ImportMisuratoriClient.tsx`.
- [ ] `RiepilogoImport`: finestra coperta, totali per famiglia, nuove/modificate/invariate,
      annullate rimosse (con l'avviso sui pianificati), ODL in DB non coperti dal file.
      **Il riepilogo è il sostituto del CONFRONTA**: è la schermata che si guarda ogni mattina.
- [ ] Storico degli import con chi e quando.

---

## PARTE 4 — Registro e query

### Task 4.1: `GET /api/acea/ordini`

- [ ] Filtri: famiglia, stato, comune, attività, operatore, scadenza (scaduti / entro N giorni),
      testo libero su ODL, matricola, impianto, indirizzo. Paginazione server-side.
- [ ] Join con `interventi` per esecutore e data pianificata; join con i rapportini per esito,
      sigillo e saracinesca (il riporto è **un join**, non una scrittura).

### Task 4.2: `comuniMassive` dal registro

- [ ] Nuovo `lib/acea/comuniMassive.ts`: comuni distinti delle righe `famiglia = 'massive'` del
      registro.
- [ ] `lib/produzione/comuniMassive.ts` passa a questa fonte con **fallback** su
      `agente_file_colonne` finché l'agente è vivo.

> **Perché è obbligatorio.** Oggi `caricaComuniMassive()` deriva i comuni massive dai file
> scansionati dall'agente (`agente_file_colonne.is_master`) e li passa a `attivitaCanonica`, che
> decide se una riga ACEA senza testo attività è massiva o va riclassificata Italgas. Spegnendo
> l'agente quella fonte si congela: un comune nuovo non verrebbe più riconosciuto e la Produzione
> economica lo classificherebbe male. Vedi AGENTS.md §14.

---

## PARTE 5 — Tabella di pianificazione

### Task 5.1: fondamenta

- [ ] `npm i @tanstack/react-table @tanstack/react-virtual` (approvate).
- [ ] `TabellaOrdini` con virtualizzazione **dalla prima riga di codice**: 5.293 righe × 20 colonne
      senza virtualizzazione bloccano il browser.
- [ ] Colonne Dunning visibili: ODL · Attività · Matricola · Indirizzo · Comune · Stato ordine ·
      Data creazione · **Scadenza** · Esecutore · Data pianificata. Nascoste ma filtrabili: famiglia,
      tipo ordine, operatore ACEA, valore, priorità, impianto, causale.
- [ ] Colonne Massive: ODL · Impianto · Matricola · Indirizzo · Comune · Stato · Esecutore · Data
      esecuzione · Esito · Sigillo · Saracinesca · Extra manuale. **Nessuna colonna scadenza.**
- [ ] Design: token di `DESIGN.md`, `thead` sticky, `font-mono tabular-nums` sui numerici.

### Task 5.2: must-have (cancelli di collaudo)

- [ ] Filtri per colonna · ordinamento · ricerca libera · conteggio righe filtrate.
- [ ] Selezione multipla con shift-click.
- [ ] Scelta delle colonne visibili (persistita per utente).
- [ ] Evidenziazione scaduti / in scadenza (solo dunning).
- [ ] Export xlsx della **vista filtrata corrente**, non di tutto il registro.

### Task 5.3: azioni in blocco + undo

- [ ] `BarraAzioni`: «Assegna a…» + «Pianifica il…» sulle righe selezionate.
- [ ] `POST /api/acea/pianifica`: crea/aggiorna gli `interventi`, restituisce un `operazione_id`.
- [ ] **Annullamento dell'ultima azione in blocco**: l'operazione registra lo stato precedente delle
      righe toccate; l'undo lo ripristina. È un must-have, quindi va progettato qui, non aggiunto
      dopo.
- [ ] Guardrail: un ODL già pianificato per un altro giorno non si assegna due volte; un ODL già
      completato non si sposta (stessa invariante di `spostamento_completato`).

### Task 5.4: editing stile Excel (`EditingGriglia`)

Costruito **sopra** la tabella già funzionante, come ultimo strato: se scivola, non blocca lo
spegnimento del master.

- [ ] Logica pura e testata a parte: modello di selezione (cella, range, shift+frecce), parsing del
      blocco incollato (TSV dalla clipboard), mappatura blocco → celle target, undo/redo.
- [ ] Editing consentito **solo** su `Esecutore` e `Data pianificata`. I campi ACEA non sono
      editabili: la tabella non offre nemmeno il focus in edit su quelle colonne.
- [ ] Validazione per colonna: esecutore deve essere uno staff attivo, data deve essere valida e non
      passata.
- [ ] Persistenza ottimistica con coda e rollback: ogni cella è una chiamata di rete che può
      fallire, e l'utente deve vedere cosa non è stato salvato.
- [ ] Copia (`Ctrl+C`) e incolla (`Ctrl+V`) di un blocco; nessun trascinamento, per decisione.

---

## PARTE 6 — Rapportini

### Task 6.1: `sincronizzaRapportiniAcea`

- [ ] Motore separato. Regola: **un rapportino per operatore per giorno**.
      Cerca per `(staff_id, data)`; se non esiste lo crea sul territorio ACEA indipendentemente
      dall'attività; se esiste vi **aggiunge** le voci con `origine = 'acea'`.
- [ ] **Non cancella mai nulla.**
- [ ] Le voci portano `template_id` e `campi_snapshot` del flusso della loro attività (meccanismo già
      esistente per voce dal 20/07).
- [ ] Rapportino già `inviato`: non si altera in silenzio. Il motore risponde
      `{ esito: 'richiede_riapertura' }` e l'admin conferma.
- [ ] Test: operatore senza rapportino → creato; con rapportino Italgas → voci aggiunte e **voci
      Italgas intatte**; con rapportino inviato → nessuna modifica e richiesta di conferma; secondo
      giro identico → nessuna voce duplicata.

### Task 6.2: conferma esplicita all'admin

- [ ] `POST /api/acea/rapportini` restituisce, per operatore: creato / aggiunto a rapportino in
      corso / richiede riapertura / nessuna modifica.
- [ ] La UI mostra l'esito riga per riga. **Mai un silenzio**: è il difetto del motore attuale, dove
      `skipInviati: true` scarta il lavoro senza avvisare nessuno.

---

## PARTE 7 — Modulo e navigazione

### Task 7.1: registrazione del modulo

- [ ] `APP_MODULES`: nuova voce `acea` (gruppo `pianificazione`, `requiresAdminRole: true`).
      **Commit isolato**, nient'altro nel file (AGENTS.md §11.1).
- [ ] `lib/appNavigation.ts` di conseguenza.
- [ ] `misuratori` e `assegnazione-ai`: `assegnazione-ai` si ritira (ferma dal 29/06); `misuratori`
      diventa una foglietta di `acea` mantenendo le rotte esistenti finché non si migra la UI.

### Task 7.2: fogliette

- [ ] `AceaNav` con `FogliettaCard` + `Breadcrumb` (pattern di casa, DESIGN.md §7bis, già usato da
      `ListaAttesaNav`).
- [ ] `/hub/acea` → Dunning · Limitazioni massive · Misuratori.
- [ ] Dunning: import + tabella + azioni + export del pianificato.
- [ ] Massive: tabella unica con **filtro comune**, righe extra dai rapportini, tasto «aggiorna
      stato» come scorciatoia all'import.
- [ ] Misuratori: il modulo attuale, spostato senza modifiche funzionali.

---

## PARTE 8 — Saracinesche

### Task 8.1: stati derivati

- [ ] `lib/acea/saracinesche.ts` — puro, nessuna tabella nuova:
      **fatte** (saracinesca `SI` nel rapportino) · **da esitare** (ordine di sostituzione aperto) ·
      **da richiedere** (nessun ordine sull'impianto/matricola).
- [ ] Aggancio per matricola normalizzata, per impianto quando disponibile.
- [ ] Vale per Dunning **e** Massive: filtro presente in entrambe le fogliette.
- [ ] Verifica sui dati reali: i tre numeri devono avvicinarsi a **791 / 80 / 634**.

---

## PARTE 9 — Export

### Task 9.1: pianificato del giorno

- [ ] `GET /api/acea/export-pianificato?data=YYYY-MM-DD` → xlsx con ODL, operatore, comune,
      indirizzo, attività: è il foglio che l'admin usa per assegnare a mano sul Cruscotto.

### Task 9.2: master on-demand

- [ ] `GET /api/acea/export-master` → xlsx con il **layout identico** al master (colonne da
      `config.example.json`), generato dal registro. È la via d'uscita promessa quando il file si
      spegne.

---

## PARTE 10 — Collaudo e cut-over

- [ ] **Primo import con il filtro `Data pubblicazione ≥` portato il più indietro possibile**: 1.318
      ODL esistono solo in `acea_master_snapshot` e non nell'export corrente.
- [ ] Backfill `interventi.ordine_id`.
- [ ] Confronto oggettivo: gli ODL aperti nel modulo devono coincidere con le righe non esitate nei
      master.
- [ ] Verifica dei cancelli di collaudo (Task 5.2, 5.3, 5.4) uno per uno.
- [ ] Preview → due giorni di prova con l'agente ancora attivo → abbandono del master.
- [ ] L'agente resta installato: se serve, una passata ripopola i master.

---

## Rischi tecnici

| rischio | mitigazione |
|---|---|
| Toccare `sincronizzaRapportini` rompe Italgas (477 rapportini inviati) | Una sola riga modificata, in un commit isolato, con test di regressione prima |
| `caricaComuniMassive()` si congela spegnendo l'agente | Task 4.2, con fallback durante la transizione |
| Editing a griglia più lungo del previsto | È l'ultimo strato: la tabella funziona e il master si spegne anche senza |
| Persistenza ottimistica che perde scritture | Coda con rollback ed evidenza visiva delle celle non salvate |
| Import di un file sbagliato | Validazione contratto/fornitore prima di qualsiasi scrittura |
| 5.293 righe nel DOM | Virtualizzazione fin dal primo commit della tabella |
| Fixture con dati personali nel repo | Anonimizzazione in Parte 0, file reale mai committato |
