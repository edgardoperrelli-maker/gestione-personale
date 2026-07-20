# Motore "Gruppo attività" — tassonomia unica e guardrail import

Data: 2026-07-20 · Stato: **approvato dall'utente in sessione** (decisioni chiuse, vedi §9)

## 1. Contesto e problema

Un batch di limitazioni massive (comune nuovo, 122 interventi completati) non è mai arrivato
sul file master: le righe erano state importate con `committente='acea'` e `intervento_tipo`
**vuoto**, quindi non passavano il filtro dell'endpoint export che alimenta l'agente lim-sync
(`committente='lim_massive' OR intervento_tipo ILIKE '%limitaz%'/'%massiv%'`). Silent-drop,
scoperto solo giorni dopo. Recidiva di un caso già visto (tipo = stato ordine ACEA).

Causa strutturale, in tre pezzi:
1. i file di import nascono da **copia-incolla manuale** per territorio + gruppo attività:
   l'attività può arrivare vuota, sbagliata o con un testo qualsiasi;
2. il parser import non riconosce tutte le intestazioni reali (es. "Operazione testo breve")
   e per un formato ha l'attività hard-coded a `null`;
3. a valle, "è una limitazione massiva" è deciso da un **match di testo fragile** su
   `intervento_tipo`, disallineato dal vocabolario reale.

Nel DB c'è inoltre rumore storico: attività Italgas sotto committente `acea` (centinaia di
righe), "PRONTO INTERVENTO" sotto `altro`, ~350 righe italgas con tipo vuoto, varianti di
maiuscole della stessa descrizione.

## 2. Obiettivo

Una **fonte di verità unica** per la classificazione delle attività, applicata ovunque:
import da Excel, inserimento manuale, storico, e (fase 2) identificazione downstream
dell'agente. Il backoffice scrive solo la **descrizione**; il **gruppo attività** si deriva
sempre automaticamente, mai a mano. Un file che non rispetta la tassonomia viene **rifiutato
in blocco** con errore chiaro.

Questo motore è la base dichiarata della prossima feature.

## 3. Modello dati

Tre livelli: `committente` (acea | italgas | altro) → `gruppo_attivita` → descrizione
(l'attuale `intervento_tipo`).

Gruppi (dal file di riferimento fornito dall'utente, 8.758 righe di storico classificate):
- ACEA: `LIMITAZIONI MASSIVE`, `DUNNING`
- ITALGAS: `ATTIVITA' ALLA CLIENTELA`, `BONIFICHE`, `BONIFICHE EXTRA`, `P.I.`, `AGENDA AEREA`

### 3.1 Tabella `attivita_tassonomia` (nuova)

| colonna | note |
|---|---|
| `id` | pk |
| `committente` | text — scope della mappa (risolve l'ambiguità, vedi sotto) |
| `descrizione` | text — **forma canonica** (es. `S-PR-003 A SONDA`) |
| `descrizione_norm` | text — normalizzata (upper, trim, spazi collassati); unique con committente |
| `gruppo` | text — es. `LIMITAZIONI MASSIVE` |
| `attivo` | bool — per ritirare voci senza cancellarle |

- Chiave logica: `(committente, descrizione_norm)` — **per committente**, perché una stessa
  descrizione può appartenere a gruppi diversi per committenti diversi (caso reale:
  "REGOLARIZZAZIONE FLUSSO IDRICO" → DUNNING per ACEA, BONIFICHE EXTRA per ITALGAS).
- Normalizzazione unica condivisa (server e, per quanto possibile, template):
  `upper(trim(regexp_replace(s,'\s+',' ','g')))`. Accenti conservati.
- **Seed**: le ~60 descrizioni distinte del file di riferimento; forma canonica = la
  variante grezza **più frequente** nel file per ogni descrizione normalizzata.
- Aggiungere un'attività = una riga a DB (UI di gestione fuori scope; SQL/Supabase basta).

### 3.2 Colonna `interventi.gruppo_attivita` (nuova)

Text, nullable. Popolata: dal backfill (storico), dall'import (validato), dal "+" (derivata).
`NULL` = non classificato (solo storico pregresso; i nuovi flussi non possono produrlo).

## 4. Migration e backfill (il "sovrascrivi come il file")

Deterministico via tassonomia, non riga-per-riga sul file (il file non ha chiave riga: ~2.100
righe senza ODL e ~800 ODL duplicati). Stesso risultato, idempotente, copre anche le righe
non ancora lavorate. Passi, ciascuno con report conteggi prima/dopo:

1. `ALTER TABLE interventi ADD COLUMN gruppo_attivita text` + tabella tassonomia + seed.
2. **Backfill gruppo**: `gruppo_attivita` = lookup tassonomia su
   `(committente_equivalente, norm(intervento_tipo))`. Per il lookup, `lim_massive` equivale
   ad `acea`.
3. **Canonicalizzazione descrizioni** (decisione utente): `intervento_tipo` riscritto nella
   forma canonica per tutte le righe mappate (es. "S-PR-003 A Sonda" → "S-PR-003 A SONDA").
   Nota di sicurezza: le forme canoniche del gruppo LIMITAZIONI MASSIVE continuano a
   matchare il filtro export attuale (`%limitaz%`/`%massiv%`) — nessuna regressione agente.
4. **Correzione committente** dove la tassonomia è univoca e il file la corregge:
   descrizioni solo-Italgas oggi sotto `acea` → `italgas`; "PRONTO INTERVENTO" sotto
   `altro` → `italgas`. (Non tocca automazioni: il filtro export non usa `acea`/`italgas`.
   Nota: la dedup import è per `(committente, odl, data)` — su righe storiche già lavorate
   il cambio committente non genera collisioni pratiche; verificato nel piano con query.)
5. **Eccezione `committente='lim_massive'`** (decisione utente, gestione prudente): NON si
   riclassifica ora. È un marcatore di canale del "+" da cui dipendono automazioni vive
   (flag `manuale` — 222 righe hanno `origine='import'` e perderebbero il flag —, filtro
   export, blocco duplicati). Prende `gruppo_attivita='LIMITAZIONI MASSIVE'` e resta;
   riclassificazione a `acea` in fase 2 col filtro agente su gruppo.
6. **Residui non mappabili** → `gruppo_attivita=NULL` + report (es. ~350 italgas con tipo
   vuoto). Decisione umana successiva; nessuna invenzione automatica.

## 5. Template Excel (download dall'app)

Endpoint `GET /api/interventi/template` (autenticato): genera al volo un `.xlsx` con:
- **Foglio 1 "Interventi"**: le colonne già riconosciute dal parser per il formato
  "Export Dati" (ODL/ODS, PDR, MATRICOLA, INDIRIZZO, COMUNE, CAP, NOMINATIVO, …) più
  `DESCRIZIONE ATTIVITÀ` e `GRUPPO ATTIVITA'`. Il backoffice compila la descrizione; la
  colonna gruppo contiene una formula di lookup sulla leggenda (VLOOKUP con
  UPPER/TRIM, avvolto in IFERROR → stringa vuota): descrizione errata → cella gruppo
  **vuota**, visibile subito in Excel.
- **Foglio 2 "Leggenda"**: generato dalla tassonomia a DB (committente, descrizione
  canonica, gruppo). Sempre allineato, nessun file statico da mantenere.

Il gruppo nel file è **informativo/di conforto**: fa vedere subito l'errore. La verità la
ricalcola comunque il server (vedi §6).

## 6. Import: validazione bloccante

`POST /api/interventi/import` (flusso esistente, esteso):
1. Il parser riconosce la colonna descrizione attività anche con le intestazioni reali
   (aggiunta di `operazione testo breve`, `descrizione attivit*`, `gruppo attivit*` ai
   pattern; rimozione dell'`attivita: null` hard-coded del formato massiva dove la colonna
   esiste).
2. Per ogni riga il server **ricalcola** il gruppo dalla tassonomia
   (`committente` scelto nell'import + `norm(descrizione)`). Non si fida della formula.
3. **Rifiuto totale** (nessun import parziale) con **HTTP 422 strutturato** se una qualsiasi
   riga ha: descrizione mancante; descrizione non in tassonomia (per quel committente);
   gruppo nel file valorizzato ma diverso da quello derivato. Payload: valori sconosciuti
   con conteggi, numeri di riga d'esempio, totale righe scartabili.
4. La UI mostra una **modale di errore** con la descrizione del problema e i valori
   incriminati (è il "se non rispetta i parametri non prende il file per buono").
5. Se valido: insert/update come oggi, più `intervento_tipo` = descrizione **canonica** e
   `gruppo_attivita` derivato.

## 7. Inserimento manuale ("+")

Nella modale dell'intervento manuale la **descrizione attività diventa obbligatoria**,
scelta da lista (tassonomia filtrata per committente, solo `attivo`) — niente testo libero.
Il gruppo si deriva e si salva automaticamente. Stesso motore dell'import.

## 8. Rete di sicurezza e fase 2 (fuori scope qui)

- **Guard estesa** (`tools/limitazioni-sync/guard-limitazioni-non-esportate.sql`): oltre al
  caso attuale (tipo = stato ordine ACEA), flagga i completati con `gruppo_attivita IS NULL`
  o descrizione fuori tassonomia. Atteso 0 dopo ogni import.
- **Fase 2** (prossima feature, NON in questo intervento): filtro export agente su
  `gruppo_attivita='LIMITAZIONI MASSIVE'` al posto degli `ilike`; riclassificazione
  `lim_massive`→`acea`; eventuale UI di gestione tassonomia.

## 9. Decisioni chiuse (utente, sessione 2026-07-20)

| Tema | Decisione |
|---|---|
| Dove vive il gruppo | Nel file, ma **validato** contro lista chiusa; rifiuto totale se non conforme |
| `lim_massive` | Gestione **prudente**: resta, riclassificazione in fase 2 |
| Descrizioni storiche | **Canonicalizza tutto** (riscrittura alla forma canonica) |
| Template | **Download dall'app**, leggenda generata dalla tassonomia |
| Ambiguità descrizione↔gruppo | Mappa scoperta **per committente** |
| Righe storiche non mappabili | `NULL` + report, decisione umana |

## 10. Test

- Unit: normalizzazione; lookup tassonomia (incl. ambiguità per committente); parser
  (riconoscimento colonne reali, incl. "Operazione testo breve"); validazione import
  (reject su mancante/sconosciuta/gruppo incoerente; ok su file valido); derivazione nel "+".
- Fixture: un file "sporco" (descrizioni sconosciute, gruppo incoerente, righe vuote) e un
  file "pulito" generato dal template.
- Migration: query di verifica conteggi (mappate, canonicalizzate, committente corretti,
  NULL residui) eseguite su un branch/dry-run prima della produzione.
- Regressione agente: dopo la canonicalizzazione, conteggio righe che passano il filtro
  export invariato o superiore (mai inferiore).

## 11. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Canonicalizzazione cambia testi usati da altri match testuali | Ricognizione grep degli `ilike`/confronti su `intervento_tipo` prima della migration; test di regressione filtro export |
| Import bloccato per una tassonomia incompleta (attività nuova legittima) | Messaggio d'errore che elenca i valori sconosciuti + istruzione "aggiungere alla tassonomia"; aggiunta = 1 riga a DB, zero deploy |
| Formula del template non funziona su Excel vecchi/localizzati | La formula è solo di conforto: la validazione vera è server-side |
| Migration su prod | Passi idempotenti, report per passo, backup implicito (UPDATE reversibili da report) |
