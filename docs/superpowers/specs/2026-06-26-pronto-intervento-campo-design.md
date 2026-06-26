# Pronto Intervento sul campo — Design

**Data:** 2026-06-26
**Stato:** Bozza di design (da review). Default consigliati adottati nel testo; le 4 scelte aperte sono in §15.
**Topic:** Registrazione delle chiamate di Pronto Intervento (P.I.) dal campo tramite un **link a scadenza** (valido da giorno X a giorno Y), **vuoto**, intestato al reperibile. L'operatore carica gli interventi dal "+" manuale con **campi dinamici come nei template**; l'esecutore è riconosciuto dal proprietario del link; la richiesta passa per **approvazione** e popola la **tabella del modulo P.I.**; successivamente l'ufficio carica la **contabilità** segnando le quantità sugli articoli a listino.

---

## 1. Contesto e obiettivo

Oggi le chiamate di Pronto Intervento del servizio reperibilità (es. Firenze, lotto GAS) vengono tracciate **a mano su un Excel** (`REGISTRO CHIAMATE`) e su un rapportino cartaceo fotografato. Ogni riga dell'Excel è una chiamata con: BOLLATO/numero segnalazione, COMUNE, INDIRIZZO, DATA, ESECUTORE, e poi le **quantità per articolo** (codici tipo `3085002`, `3085003`, `3186045`, unità H/CAD/M, prezzo unitario) da cui si calcola il **Valore**. Un secondo foglio (`COMP. SETT.`) tiene la **rota reperibilità settimanale** e il **compenso fisso** (€350 a reperibile, art. `3085001`).

Il problema: la registrazione è manuale, fuori dal gestionale, non collegata né alla pianificazione né alla contabilità, e il rapportino arriva come foto.

**Premessa — foglie territoriali.** Il modulo P.I. nasce **multi-area** ("foglie"): **Firenze** (l'unica che sviluppiamo ora), **Lazio Centro/Est** e **Perugia** (predisposte ma sviluppate in seguito). Tutte le entità P.I. (link, interventi, listino) sono **scope-ate per area** fin dall'impianto dati, così le due foglie future si attivano senza migrazioni strutturali: cambia solo il flag `attiva` e i dati. La UI del modulo mostra le 3 foglie come tab; oggi solo Firenze è operativa, le altre due appaiono come "in arrivo".

**Obiettivo (questa versione).** Portare il **foglio `REGISTRO CHIAMATE`** (area **Firenze**) dentro il gestionale con un flusso digitale:

1. l'ufficio genera un **link a scadenza** (dal X al Y) **vuoto**, intestato all'operatore reperibile;
2. l'operatore, sul campo, apre il link (PWA/offline) e con il **"+"** carica ogni chiamata compilando **campi dinamici e personalizzabili** (Indirizzo, Comune, Ora inizio, Ora fine, Numero segnalazione, Assistente TE, note svolgimento);
3. l'**esecutore** si sceglie da una tendina che mostra **solo i reperibili del cronoprogramma** alla data della chiamata (con avviso di **anomalia reperibilità** se non combacia);
4. l'invio genera un **task in approvazione**; approvato, l'intervento popola la **tabella del modulo P.I.**;
5. **successivamente** l'ufficio carica la **contabilità** sulla riga, segnando le quantità sugli articoli a listino → `valore = quantità × prezzo`.

Il punto di partenza tecnico è favorevole: **quasi tutto esiste già**. I link a token (`/r/[token]`, `/agenda/[token]`), il "+" manuale con foto/offline/idempotenza, il ciclo di approvazione (`interventi_manuali`), i template a campi dinamici e lo storico tabellare sono in produzione. **L'unico pezzo davvero nuovo è la contabilità su articoli** (oggi non esiste alcun listino con prezzi e quantità).

---

## 2. Decisioni chiave (default consigliati)

| Tema | Decisione | Alternative in §15 |
|------|-----------|---------------------|
| Foglie territoriali | Modulo **multi-area** con 3 foglie (**Firenze** attiva; **Lazio Centro/Est** e **Perugia** predisposte, `attiva=false`). Catalogo `pi_aree`; `area_codice` su `pi_token`, `pi_articoli` e sul filtro degli interventi P.I. | — |
| Modello del link | **Nuova tabella `pi_token`** per **area (foglia) + finestra `valido_dal`/`valido_al`**, condiviso (non intestato a un singolo operatore). Pattern `agenda_token` (link "vuoto", righe live). | — |
| Esecutore | **Menu a tendina** nel "+": elenca **solo gli operatori con flag `reperibile` nel cronoprogramma** alla **data della chiamata** (`assignments`+`calendar_days`). Se il reperibile è uno solo quel giorno → preselezionato. L'ufficio non intesta link: mette solo il flag reperibile sul cronoprogramma. | — |
| Anomalia reperibilità | Se la chiamata è datata un giorno in cui l'esecutore scelto **non** è flaggato reperibile (es. chiamata di "ieri" inserita oggi), la richiesta parte con **`anomalia_reperibilita=true`**: avviso all'operatore + segnalazione in coda all'ufficio. Non blocca l'invio. | — |
| "+" manuale | **Clone della route** `intervento-manuale` su `/api/pi/[token]/intervento`, con la stessa idempotenza/rollback/offline, ma gate sulla validità di `pi_token` (non sul `tokenStatus` del rapportino). | — |
| Campi dinamici | **Riuso del sistema template** (`rapportino_template.campi`). Un template P.I. dedicato (`solo_manuale`). Si aggiunge il tipo campo **`ora`** per Ora inizio/fine; "Assistente TE" come `select` da anagrafica staff. | §15-B |
| Approvazione | **Riuso di `interventi_manuali`** (coda + realtime + presa in carico + check-and-set atomico), esteso con `pi_token_id` e `fonte='pronto_intervento'`. | — |
| Destinazione | **Nuovo modulo dedicato** `/hub/pronto-intervento` con tabella propria (colonne P.I. + colonna contabilità). Internamente riusa la pipeline Storico. | §15-C |
| Discriminatore canonico | Le righe approvate vivono in `interventi` con **`origine='pronto_intervento'`** (estensione del CHECK esistente). | — |
| Contabilità | **NUOVO**: listino `pi_articoli` + righe `pi_contabilita_righe` (quantità × prezzo congelato = valore). Caricata **solo dall'ufficio dopo l'approvazione**; listino **riservato** (non visibile agli operatori). | §15-D |
| Reperibilità settimanale | **Fuori scope** in questa versione (foglio `COMP. SETT.` e compenso €350 rimandati). | §15-D |
| Offline | Link operatore **PWA/offline-capable** come `/r` e `/agenda` (prefisso aggiunto a `app/sw.ts`). | — |

---

## 3. Modello di governance (flusso)

```
UFFICIO: (a) flagga i REPERIBILI sul cronoprogramma; (b) genera 1 link per FOGLIA+periodo
        (pi_token: area_codice='firenze', valido_dal=X, valido_al=Y)  →  link VUOTO, condiviso
                                  │  url = /pi/<token>
                                  ▼
OPERATORE apre il link sul campo (PWA/offline)
   └─ vede una lista VUOTA + tasto "+"
                                  │  preme "+"
                                  ▼
   compila la modale: DATA chiamata → ESECUTORE da tendina REPERIBILI di quella data
   + campi dinamici del TEMPLATE P.I.
   (Indirizzo, Comune, Ora inizio, Ora fine, N° segnalazione, Assistente TE, Note)
                                  │  "Invia"  (gate: oggiRoma() ∈ [valido_dal, valido_al])
                                  ▼
   reperibilità(esecutore, data) OK?  ── no ──▶ anomalia_reperibilita=true + avviso
                                  │ sì
                                  ▼
   crea RICHIESTA interventi_manuali (fonte='pronto_intervento', pi_token_id, stato='in_attesa')
   + voce "Sospeso" nella lista del link        badge realtime alla coda ufficio
                                                (badge "anomalia" se reperibilità non combacia)
                                  │
                                  ▼
UFFICIO (Lista attesa / coda P.I.) prende in carico → Approva  (check-and-set atomico)
                                  │
                                  ▼
   crea INTERVENTO canonico  origine='pronto_intervento'  → riga nel MODULO P.I.
                                  │
                                  ▼
UFFICIO apre la riga → CONTABILITÀ: aggiunge righe articolo (codice, quantità)
   valore_riga = quantità × prezzo_snapshot ;  Totale = Σ valore_riga
```

---

## 4. Modello dati

> **Nota consegna SQL.** Le tabelle vanno in una migration `supabase/migrations/YYYYMMDDHHMMSS_pronto_intervento.sql` con `set_updated_at()` (già definita in migrazioni precedenti), RLS in stile casa e i CHECK aggiornati con **DROP+ADD** del vincolo nominato (un `ADD CONSTRAINT` nudo fallisce se il vecchio resta). Lo SQL eseguibile si consegna **solo su richiesta esplicita** e lo lanci tu; l'MCP Supabase punta al progetto non-prod, mai prod. Convenzione di progetto: `staff_id` è **`text`**, mai uuid FK; importi in **`numeric`**, mai float.

### 4.0 `pi_aree` — catalogo delle foglie territoriali (NUOVO)

Le 3 foglie sono **dati**, non codice: una nuova area si attiva con un INSERT/UPDATE, senza migrazione. Distinta dalla tabella operativa `territories` (che mappa i territori della mappa operatori): qui `pi_aree` è l'**appalto/lotto P.I.** e ne governa anche il listino.

| Campo | Tipo | Note |
|---|---|---|
| `codice` | `text` PK | `'firenze'` \| `'lazio_centro_est'` \| `'perugia'` |
| `label` | `text not null` | "Firenze", "Lazio Centro/Est", "Perugia" |
| `attiva` | `boolean not null default false` | **`firenze` = true**; le altre `false` (foglia "in arrivo") |
| `ordine` | `int not null default 0` | ordine dei tab |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at()` |

Seed: `('firenze','Firenze',true,1)`, `('lazio_centro_est','Lazio Centro/Est',false,2)`, `('perugia','Perugia',false,3)`.

> **Scope-by-area ovunque.** `pi_token`, `pi_articoli` e la tabella del modulo filtrano per `area_codice`. Il listino è **per area** (gli articoli/prezzi dell'Excel sono dell'appalto Firenze; Lazio/Perugia avranno i propri). Le route lato campo non espongono mai l'area diversa da quella del token.

### 4.1 `pi_token` — il link a scadenza, vuoto

Clone concettuale di [`agenda_token`](../../../supabase/migrations/20260603010000_agenda_operatore.sql) (link vuoto, righe live). **Per area + periodo, condiviso**: l'esecutore non è il proprietario del link ma è scelto per-chiamata dalla tendina dei reperibili (vedi §8.1).

| Campo | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `area_codice` | `text not null` FK → `pi_aree(codice)` | foglia territoriale del link (oggi `'firenze'`) |
| `template_id` | `uuid` FK → `rapportino_template` `on delete set null` | quale set di campi renderizzare |
| `campi_snapshot` | `jsonb not null default '[]'` | copia **congelata** di `template.campi` alla creazione |
| `valido_dal` | `date not null` | **X** |
| `valido_al` | `date not null` | **Y** — validità = `oggiRoma()` ∈ `[valido_dal, valido_al]` |
| `token` | `text not null unique` | segreto del link (`randomBytes(32).hex`, come `generaAgendaToken()`) |
| `note` | `text` | etichetta libera (es. "Reperibilità Firenze sett. 26") |
| `creato_da` | `uuid` | utente ufficio che ha generato il link (audit) |
| `revocato_at` | `timestamptz` | revoca anticipata opzionale (null = attivo) |
| `created_at` | `timestamptz not null default now()` | |
| — | `check (valido_al >= valido_dal)` | |

Indici: `pi_token_token_idx (token)`, `pi_token_area_idx (area_codice)`. Unicità consigliata: `unique (area_codice, valido_dal, valido_al)` (un link per foglia+periodo).
RLS: enabled **senza policy pubblica** (raggiungibile solo via service role, come `agenda_token`).

### 4.2 Estensione di `interventi_manuali` — riuso della coda di approvazione

La [tabella delle richieste](../../../supabase/migrations/20260606000000_interventi_manuali.sql) si riusa così com'è (stato/corsia/presa-in-carico/decisione/`dati_operatore`/`dati_correnti`), con due colonne additive:

| Campo | Tipo | Note |
|---|---|---|
| `pi_token_id` | `uuid` FK → `pi_token` `on delete set null` | aggancio alla sessione P.I. (al posto di `rapportino_id`) |
| `area_codice` | `text` | foglia (snapshot da `pi_token`); filtra coda e modulo per area |
| `fonte` | `text not null default 'rapportino'` `check in ('rapportino','pronto_intervento')` | discriminatore della coda |
| `anomalia_reperibilita` | `boolean not null default false` | l'esecutore non risultava reperibile in `data` al momento dell'invio (vedi §8.1) |

> L'**esecutore** scelto dalla tendina e la **data** della chiamata usano le colonne già esistenti `staff_id`/`staff_name`/`data` di `interventi_manuali` (nessuna colonna nuova per questi).

> I campi dinamici compilati dall'operatore finiscono in `dati_operatore`/`dati_correnti` (JSON `anagrafica` + `risposte`), esattamente come oggi. Per il P.I. il `committente` può restare `'altro'` (vedi §15-D) per non toccare i CHECK del committente.

### 4.3 Estensione di `interventi` — discriminatore P.I.

| Campo | Tipo | Note |
|---|---|---|
| `origine` | `text` | estendere il CHECK: da `('pianificato','manuale','import')` a `(..., 'pronto_intervento')` con **DROP+ADD** del vincolo `interventi_origine_check` |

Le colonne P.I.-specifiche (Ora inizio/fine, N° segnalazione, Assistente TE) **non** si aggiungono come colonne native: vivono nel `risposte` JSON della voce/snapshot e si proiettano nella tabella del modulo (come fa lo Storico). `indirizzo`/`comune` mappano sui campi nativi omonimi di `interventi`; `rif_esterno` può ospitare il numero segnalazione per gli export.

**Area sul canonico.** La foglia non si aggiunge come colonna a `interventi`: la tabella del modulo proietta gli interventi `origine='pronto_intervento'` **joinando** la richiesta `interventi_manuali` (che porta `area_codice`), come lo Storico joina le voci. Così il filtro per tab (Firenze/Lazio/Perugia) non richiede nuove colonne sul canonico.

### 4.4 `pi_articoli` — listino (NUOVO, greenfield)

Non esiste nulla di simile (`allegato10_codici` è un altro spazio di codici, senza economia). Precedente per la precisione monetaria: `hotel_room_prices` usa `numeric`.

| Campo | Tipo | Note |
|---|---|---|
| `area_codice` | `text not null` FK → `pi_aree(codice)` | listino **per area**; PK composita `(area_codice, codice)` |
| `codice` | `text not null` | es. `3085002`, `3186045`, `9999999` (oneri) |
| `descrizione` | `text` | es. "Compenso per interventi di ricerca…" |
| `unita_misura` | `text` | `'H'` \| `'CAD'` \| `'M'` (testo libero) |
| `prezzo_unitario` | `numeric(10,2) not null default 0` | es. `89.66` |
| `attivo` | `boolean not null default true` | |
| `ordine` | `int not null default 0` | ordine in UI (come le colonne Excel) |
| `created_at` / `updated_at` | `timestamptz` | trigger `set_updated_at()` |

Seed iniziale dai codici dell'Excel (vedi §8).

### 4.5 `pi_contabilita_righe` — voci di contabilità (NUOVO)

| Campo | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK | |
| `intervento_id` | `uuid` FK → `interventi` `on delete cascade` | la riga P.I. approvata |
| `area_codice` | `text not null` | area della riga (denormalizzato dall'intervento) |
| `articolo_codice` | `text not null` | FK composita → `pi_articoli(area_codice, codice)` |
| `quantita` | `numeric(12,3) not null default 0` | es. ore = `2`, metri = `24.4` |
| `prezzo_snapshot` | `numeric(10,2) not null` | **congelato** dal listino al momento della scrittura (Valore storico riproducibile) |
| `unita_misura` | `text` | snapshot per export |
| `valore` | `numeric(12,2) generated always as (round(quantita * prezzo_snapshot, 2)) stored` | colonna calcolata |
| `created_at` / `updated_at` | `timestamptz` | trigger |

Indice: `pi_contab_intervento_idx (intervento_id)`. Una riga P.I. ha **N** righe di contabilità (l'Excel ha più colonne articolo valorizzate sulla stessa chiamata). Totale chiamata = `Σ valore`.

RLS (tutte le tabelle nuove): pattern casa `for all to authenticated using(true) with check(true)`; la **vera** autorizzazione è negli API guard (`requireAdmin` per la contabilità, token per il campo). Vedi §10 per la riservatezza del listino.

---

## 5. Stati e transizioni

```
RICHIESTA (interventi_manuali, fonte='pronto_intervento')
  in_attesa ──(admin Approva, check-and-set atomico)──▶ approvato ──▶ crea interventi(origine='pronto_intervento')
     │                                                        
     ├──(admin Rifiuta)──▶ rifiutato (con motivo)            
     └──(operatore Annulla, finché in_attesa)──▶ annullato   

INTERVENTO P.I. (interventi)
  creato → compare nel MODULO P.I.
         → CONTABILITÀ: bozza/righe modificabili dall'ufficio → "chiudi contabilità" (opz.)

CONTABILITÀ
  nessuna riga ──▶ in lavorazione (≥1 riga) ──▶ contabilizzato (flag opzionale interventi.pi_contabilizzato)
```

Validità link: `oggiRoma() < valido_dal` → "non ancora attivo"; `∈ [X,Y]` → editabile; `> valido_al` o `revocato_at` → sola lettura. (Decisione su riapertura: §15-A.)

---

## 6. API / Route

**Lato operatore (token, no login — il token è l'auth):**
- `GET /api/pi/[token]` — carica `pi_token` + le righe della sessione + la **mappa reperibili per data** della finestra X→Y (per la tendina, anche offline); 404 se assente; stato di validità calcolato.
- `POST /api/pi/[token]/intervento` — "+": crea la richiesta `interventi_manuali` (clone della logica di [`/api/r/[token]/intervento-manuale`](../../../app/api/r/[token]/intervento-manuale/route.ts): idempotenza su `richiestaId`, foto-prima-del-DB, rollback, fallback su PK violation, offline replay). Gate: `pi_token` valido. **Calcola `anomalia_reperibilita`** ri-verificando lato server reperibilità(esecutore, data).
- `POST /api/pi/[token]/intervento/[id]/annulla` — annulla finché `in_attesa`.

**Lato ufficio (admin):**
- `POST /api/admin/interventi-manuali/[id]/prendi|rilascia|approva|rifiuta` — **riusati**: già generici sulla riga `interventi_manuali`; in approvazione un clone di [`richiestaToIntervento`](../../../app/api/admin/interventi-manuali/[id]/approva/route.ts) emette `origine='pronto_intervento'`.
- `POST /api/admin/pi/token` — genera il link (X, Y, staff_id, template_id); idempotente.
- `GET/PATCH/DELETE /api/admin/pi/token` — elenco/revoca/modifica finestra.
- `GET /api/admin/pi/interventi` — tabella del modulo (righe `origine='pronto_intervento'`), filtri (periodo, comune, esecutore, stato contabilità).
- `GET/POST/PATCH/DELETE /api/admin/pi/articoli` — gestione listino (admin-only; **non** copiare il POST non autenticato di `allegato10-codici`).
- `GET/PUT /api/admin/pi/interventi/[id]/contabilita` — legge/salva l'insieme di `pi_contabilita_righe` di una riga (con snapshot del prezzo al salvataggio).
- `GET /api/admin/pi/export` — export Excel/PDF stile registro (ExcelJS/jsPDF già in stack), con le colonne articolo e i totali.

---

## 7. UI / Componenti

**Campo (operatore):**
- **`PILinkClient`** — pagina `/pi/[token]`: intestazione (periodo X→Y, esecutore), lista delle proprie chiamate, **FAB "+"**, banner sola-lettura fuori finestra. Riuso del rendering campi (`CampoInput`) e dello stato offline (`ServiceWorkerRegister`).
- **`ModalePIManuale`** — modale "+": campo **Data** chiamata, tendina **Esecutore** filtrata sui reperibili di quella data (preselezione se unico; avviso se nessuno/anomalia), poi i `campi_snapshot` del template P.I.

**Ufficio (admin):**
- **`ProntoInterventoClient`** — guscio del modulo `/hub/pronto-intervento` con i **3 tab/foglie** da `pi_aree` (ordinati per `ordine`): **Firenze** operativa; **Lazio Centro/Est** e **Perugia** rese come tab disabilitati con badge "in arrivo" (`attiva=false`). Il tab selezionato imposta `area_codice` per coda, tabella, contabilità e generazione link. (Per la struttura a foglie esiste il precedente `components/modules/assegnazione-ai/foglie/Foglia.tsx`, qui però le foglie sono **territoriali**.)
- **`CodaPI`** — coda di approvazione filtrata `fonte='pronto_intervento'` **e** `area_codice` della foglia (riuso di `useRichiesteManualiFeed` + `CodaRichiesteManuali`/`PannelloRevisioneRichiesta`), con **badge "anomalia reperibilità"** sulle richieste `anomalia_reperibilita=true`.
- **`TabellaPI`** — la tabella della foglia: colonne N° segnalazione, Comune, Indirizzo, Data, Esecutore, Ora inizio/fine, Assistente TE, **Valore** (Σ contabilità), stato contabilità. Riuso della pipeline `StoricoTabella`/`StoricoFiltri`.
- **`PannelloContabilita`** — drawer sulla riga: tabella articoli del **listino della foglia** (codice, descrizione, U.M., prezzo, **quantità editabile**, valore), totale a piè di lista. Riuso visivo di `CodiciAllegato10Client`.
- **`ListinoPIClient`** (in Impostazioni) — CRUD del listino `pi_articoli` **per area** (selettore foglia in alto).
- **`GeneraLinkPI`** — form ufficio: **area** (foglia) + X + Y + template → crea **1 link condiviso** per foglia+periodo, mostra/copia URL. Nessun operatore da intestare: la reperibilità si gestisce sul cronoprogramma.

Tutti i componenti seguono `DESIGN.md` (token CSS, primitivi `Button/Card/Input/Dialog/Tabs`, niente colori hardcoded).

---

## 8. Contabilità su articoli (approfondimento)

È l'unica parte greenfield e ricalca l'Excel `REGISTRO CHIAMATE`:

- Le **colonne articolo** dell'Excel (codici `3085002…9999999`, riga 1; prezzi riga 2; unità riga 4) diventano righe di **`pi_articoli`** con `area_codice='firenze'` (le foglie Lazio/Perugia avranno il proprio listino). Seed iniziale Firenze:

  | codice | descrizione (sintesi) | U.M. | prezzo |
  |---|---|---|---|
  | 3085002 | Compenso ricerca/intervento | H | 89,66 |
  | 3085003 | Messa in sicurezza … | CAD | 110,43 |
  | 3085006 | Messa in sicurezza … | CAD | 54,12 |
  | 3085004 | Riparazione definitiva … | CAD | 396,00 |
  | 3085005 | Riparazione definitiva … | H | 79,20 |
  | 3085007 | Riparazione definitiva … | CAD | 300,00 |
  | 3085008 | Riparazione definitiva … | H | 59,40 |
  | 3186045 | Sovrapprezzo lavori … | CAD | 1,00 |
  | 3082024 | Posa/sostituzione G.R.U. … | CAD | 111,14 |
  | 3188002 | Sostituzione armadi metallici | CAD | 50,38 |
  | 3182037 | Tracce murarie | M | 32,00 |
  | 9999999 | Oneri della sicurezza | cad | 0,50 |

  *(Le descrizioni complete si rileggono dal file; vanno verificate con l'ufficio.)*

- Su una riga P.I. l'ufficio aggiunge una o più `pi_contabilita_righe` indicando **solo la quantità**; `prezzo_snapshot`/`unita_misura` si copiano dal listino al salvataggio → `valore` calcolato e **stabile nel tempo** anche se il listino cambia dopo (l'Excel ha prezzi fissi; un cambio listino non deve riscrivere lo storico).
- **Totale chiamata** = Σ `valore`. **Totale periodo/SAL** = Σ sui interventi P.I. del periodo (riproduce le celle "Valore", "Valore + Oneri", "in SAL").
- Export "registro" con una colonna per articolo + totali (ExcelJS), per allinearsi al file attuale.

---

## 8.1 Integrazione reperibilità (cronoprogramma)

L'esecutore **non** è il proprietario del link: è scelto da una tendina alimentata dalla reperibilità del **cronoprogramma**, l'unica cosa che l'ufficio deve mantenere.

**Fonte dati.** I reperibili stanno nelle `assignments` del cronoprogramma:
`assignments(day_id → calendar_days.id, staff_id, reperibile boolean)`. I **reperibili in data D** = `assignments` joinate a `calendar_days` con `calendar_days.day = D` e `reperibile = true`, risolti a `staff.display_name` (stesso join dell'[export assegnazioni](../../../app/api/export/assignments/route.ts)).

**Flusso nel "+".**
1. L'operatore sceglie/imposta la **data** della chiamata (default: oggi; può retrodatare).
2. La tendina **Esecutore** si popola con i reperibili di quella data per l'area della foglia. Se è **uno solo** → preselezionato (caso "automatico"); se più d'uno → scelta obbligatoria; se **nessuno** → campo vuoto + avviso "nessun reperibile in cronoprogramma per il GG/MM".
3. All'invio il server **ri-verifica** la reperibilità (non si fida del client) e calcola `anomalia_reperibilita`.

**Anomalia reperibilità.** Se l'esecutore scelto non è flaggato reperibile in `data` (es. chiamata di ieri ma ieri non era reperibile): l'invio **non si blocca**, ma la richiesta nasce con `anomalia_reperibilita=true`; l'operatore vede un avviso ("imputata come anomalia, l'ufficio verificherà") e in coda ufficio la richiesta ha un **badge "anomalia reperibilità"**. L'ufficio risolve in uno dei due modi: corregge il flag sul cronoprogramma (poi l'anomalia si può rivalutare) **oppure** approva/rifiuta consapevolmente. La scelta tra "ri-derivare l'anomalia in automatico" e "lasciarla come scattata all'invio" è un dettaglio implementativo: di base **si congela** il valore all'invio e l'ufficio può ricalcolarlo on-demand.

**Offline.** La lista reperibili della finestra X→Y viene **inviata col payload del link** e messa in cache (Serwist), così la tendina funziona offline; la verifica autorevole resta lato server al sync.

---

## 9. Realtime / Notifiche

Riuso del canale realtime di `interventi_manuali` ([migrazione realtime](../../../supabase/migrations/20260606000002_interventi_manuali_realtime.sql) + `useRichiesteManualiFeed`): il badge della coda si accende all'arrivo di una richiesta P.I.; il filtro `fonte=eq.pronto_intervento` separa la coda P.I. da quella dei rapportini. Nessun popup bloccante (coerente con `interventi-manuali`).

---

## 10. Sicurezza e permessi

- **Link operatore**: route pubbliche per token (fuori dal `matcher` di `middleware.ts`, come `/r` e `/agenda`); sicurezza = token non indovinabile + lookup server-only via `supabaseAdmin`. `pi_token` con RLS abilitata **senza policy pubblica**: mai esposta all'anon client.
- **Gate temporale**: ogni write valida `oggiRoma() ∈ [valido_dal, valido_al]` lato server (non fidarsi del client), come il gate "giornata chiusa" dell'agenda.
- **Contabilità/listino admin-only**: mutazioni dietro `requireAdmin`. **Attenzione RLS**: il pattern casa rende ogni tabella leggibile da qualunque utente autenticato; poiché i **prezzi** sono potenzialmente sensibili e non vanno mostrati agli operatori, il listino non deve transitare dalle API del campo (resta nelle sole route admin). Se in futuro servono operatori che vedono prezzi, valutare una policy RLS più stretta (oggi nessun precedente).
- **Modulo**: registrazione del modulo `pronto-intervento` (vedi §12) → l'edit di `lib/moduleAccess.ts` e `components/layout/moduleIcons.tsx` è un'azione **esplicitamente sanzionata da questo design** (AGENTS.md §11 rule 1). Nessuna modifica a `middleware.ts` (i path `/hub/*` sono già protetti).

---

## 11. Casi limite / error handling

- **Approvazione non transazionale**: l'`approva` fa UPDATE atomico `WHERE stato='in_attesa'` poi INSERT su `interventi` con compensazione manuale in caso di errore (nessuna transazione DB). Ereditato dal clone P.I.: gestire la compensazione come l'originale, altrimenti riga "approvata senza intervento" + contabilità orfana.
- **Dedup**: `interventi` ha `UNIQUE(committente, odl, data) WHERE odl is not null`; le chiamate P.I. hanno `odl` NULL → quell'indice **non** deduplica. La protezione anti-doppione resta l'**idempotenza su `richiestaId`** della route "+", da preservare nel clone.
- **Snapshot vs live template**: `campi_snapshot` è congelato alla creazione del link. Un link X→Y nato il giorno X mantiene i campi del giorno X per tutta la finestra (stesso comportamento dei rapportini). Rinominare un'etichetta cambia la `chiave` slugificata e scollega le `risposte` salvate → in editor template, evitare rinomine retroattive.
- **Fuori finestra**: invio dopo `valido_al` → 409 "link scaduto"; la voce eventualmente in bozza offline resta in coda di sync ma viene respinta (gestione come `non_modificabile`).
- **Anomalia reperibilità**: esecutore non reperibile in `data` → `anomalia_reperibilita=true`, **non bloccante** (l'operatore può aver fatto davvero l'intervento). Nessun reperibile in cronoprogramma per quella data → tendina vuota: si consente comunque l'invio in anomalia (non si blocca il lavoro sul campo). La verifica è **sempre lato server** al momento dell'invio/sync, mai solo client.
- **Cronoprogramma assente per la data**: se non esiste `calendar_days` per la data scelta, la query reperibili torna vuota → trattata come "nessun reperibile" (anomalia), non come errore.
- **Quantità**: validazione `numeric ≥ 0`; articolo inattivo non selezionabile per nuove righe ma conservato sulle righe storiche (lo snapshot prezzo regge).

---

## 12. Riuso del codice esistente

- **Link/token**: pattern `agenda_token` + `generaAgendaToken()` ([`lib/interventi/agendaToken.ts`](../../../lib/interventi/agendaToken.ts)); generazione idempotente stile [`/api/interventi/assegna`](../../../app/api/interventi/assegna/route.ts).
- **Reperibilità**: lettura dei reperibili per data dal join `assignments`+`calendar_days` (`reperibile=true`), stesso pattern dell'[export assegnazioni](../../../app/api/export/assignments/route.ts); il flag reperibile si imposta già nel cronoprogramma ([`/api/assignments/create`](../../../app/api/assignments/create/route.ts), `types.ts` `Assignment.reperibile`).
- **"+" manuale**: [`/api/r/[token]/intervento-manuale/route.ts`](../../../app/api/r/[token]/intervento-manuale/route.ts) + `buildVoceManuale` + idempotenza `lib/offline/idRichiesta`.
- **Template/campi dinamici**: `rapportino_template.campi`, `CampoInput`, `TemplateRapportiniClient`, `lib/rapportini/templateSchema.ts`. Per `ora` aggiungere il tipo nei 4 punti in lockstep: `TemplateCampo.tipo` (`utils/rapportini/buildVoci.ts`), `CampoSchema` (`templateSchema.ts`), `TIPO_LABELS` + switch in `CampoInput.tsx`, gestione `maiuscolaRisposteTesto`.
- **Approvazione/coda/realtime**: `interventi_manuali` + `approva|rifiuta|prendi|rilascia` + `useRichiesteManualiFeed` + `CodaRichiesteManuali`/`PannelloRevisioneRichiesta`.
- **Tabella/Storico/export**: `StoricoTabella`/`StoricoFiltri` + `GET /api/interventi/storico` + ExcelJS.
- **Listino UI**: `CodiciAllegato10Client` come template visivo.
- **Registrazione modulo** (canonico: piano appuntamenti 2026-06-15): `AppModuleKey` += `'pronto-intervento'`; entry in `APP_MODULES` (`/hub/pronto-intervento`, group `operativita`); icona in `MODULE_ICONS` (obbligatoria, il `Record` è esaustivo); `appNavigation.ts` auto-derivato (nessun NavItem a mano); migration con tabelle+RLS.

---

## 13. Strategia di test (TDD)

- **Unit**: validità `pi_token` (prima/dentro/dopo finestra, fuso Europe/Rome); **reperibili(data)** (join `assignments`+`calendar_days`, solo `reperibile=true`) e calcolo `anomalia_reperibilita` (reperibile→false, non-reperibile→true, nessun reperibile→true); calcolo `valore = quantita*prezzo_snapshot` e Σ totale; `richiestaToIntervento` P.I. emette `origine='pronto_intervento'`; idempotenza "+" (stesso `richiestaId` → nessun doppione).
- **Migration shape**: test come [`migrationShape.test.ts`](../../../lib/interventi/manuali/migrationShape.test.ts) per le nuove tabelle/colonne e il CHECK `origine` esteso.
- **E2E (Playwright)**: link vuoto → "+" → invio → coda → approva → riga nel modulo → contabilità → totale → export. Caso fuori finestra (409). Caso offline (bozza → sync).

---

## 14. Fuori scope (YAGNI, per ora)

- Gestione **reperibilità settimanale** e **compenso €350** (foglio `COMP. SETT.`) — vedi §15-D.
- Quantità inserite dall'operatore sul campo (default: solo ufficio) — §15-D.
- Person-picker dinamico avanzato per "Assistente TE" oltre al `select` da anagrafica — §15-B.
- Riapertura amministrativa del link scaduto (a meno di scelta §15-A).
- Geocoding/mappa delle chiamate P.I. (riusabile in seguito: `interventi` ha già `lat/lng`).
- **Attivazione delle foglie Lazio Centro/Est e Perugia**: l'impianto dati è già scope-ato per area, ma in questa versione si popola e si attiva **solo Firenze**. Le altre due restano tab "in arrivo" (`pi_aree.attiva=false`) finché non se ne definiscono listino e template.

---

## 15. Punti aperti (da confermare)

**A — Generazione e intestazione del link.** ✅ **RISOLTO (26/06).** Un **link condiviso per foglia+periodo** (non intestato). L'esecutore si sceglie da una **tendina alimentata dai reperibili del cronoprogramma** alla data della chiamata; l'ufficio mantiene solo il flag reperibile. Se la data non combacia con la reperibilità → **anomalia reperibilità** (avviso + segnalazione all'ufficio, non bloccante). Dettagli in §8.1. *Residuo da confermare:* riapertura del link scaduto (come `riaperto_at` dei rapportini) **sì/no**.

**B — Tipi di campo dinamici.** *Consigliato:* aggiungere un tipo **`ora`** nativo (Ora inizio/fine con picker) e modellare "Assistente TE" come **`select` da anagrafica staff**. *Alternativa minima:* tenere tutto come `testo` (zero codice nuovo, ma niente picker/validazione).

**C — Dove vive la tabella P.I.** *Consigliato:* **nuovo modulo** `/hub/pronto-intervento` (colonne P.I. + contabilità). *Alternative:* tab dentro **Interventi**; oppure coda in **Lista attesa** + **Storico** filtrato (minimo sforzo, niente vista dedicata).

**D — Contabilità: chi/quando + perimetro.** *Consigliato:* quantità inserite **solo dall'ufficio dopo l'approvazione**, listino **riservato**; perimetro = **solo `REGISTRO CHIAMATE`**. *Alternative:* quantità anche **dall'operatore sul campo** (espone il listino + capture offline); includere anche **reperibilità settimanale + compenso** (`COMP. SETT.`). Inoltre: il `committente` per le P.I. resta `'altro'` o serve un nuovo valore nei CHECK?

---

*Prossimo passo: alla conferma dei punti §15, derivare il piano di implementazione `docs/superpowers/plans/2026-06-26-pronto-intervento-campo.md` (task a checkbox) e la migration.*

---

## 16. Aggiornamenti post-implementazione (v1.1 — 26/06)

- **Foglie come 3 card sottomodulo**: il modulo `/hub/pronto-intervento` apre su una landing con una **card per foglia** (Firenze attiva; Lazio Centro/Est e Perugia inizialmente "in arrivo"). La card attiva apre il dettaglio (genera link, coda, tabella, contabilità, export) con "← Sottomoduli".
- **Foglie senza contabilità su articoli**: nuovo flag `pi_aree.usa_contabilita`. Firenze = true (listino + drawer contabilità); **Lazio Centro/Est** e **Perugia** = false → mostrano **solo la tabella riepilogativa** (niente colonna Valore né drawer articoli). Migration `20260626000002_pi_aree_contabilita.sql` (attiva anche Lazio per i test).
- **Tabella riepilogativa modificabile (correzioni ufficio)**: le celle della tabella interventi sono **editabili** su **tutte le foglie** (Firenze inclusa). Salvataggio su `blur` via `PATCH /api/admin/pi/interventi/[id]` (id = `interventi_manuali.id`): aggiorna `dati_correnti` e propaga alla riga canonica `interventi` (indirizzo/comune/`rif_esterno`/data). Testo sempre in MAIUSCOLO; `esecutore` resta in sola lettura (legato a staff_id/reperibilità).
- **Nessuna chiusura del rapportino**: il link P.I. **non** è un rapportino e non ha "invio/chiusura a fine tempo". I task arrivano nella **coda del modulo P.I.**; le richieste in sospeso **non bloccano** nulla e non scade alcun rapportino (oltre la finestra `valido_al` il link diventa solo sola-lettura).
- **Isolamento dalla Lista attesa dei rapportini**: poiché le P.I. riusano `interventi_manuali`, il feed globale (`GET /api/admin/interventi-manuali` + realtime `useRichiesteManualiFeed`) **esclude** `fonte='pronto_intervento'`. Le P.I. vivono solo nel modulo P.I.
