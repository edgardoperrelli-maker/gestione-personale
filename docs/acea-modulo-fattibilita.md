# Modulo ACEA — studio di fattibilità

**Data:** 26/07/2026 · **Stato:** studio approvato, nessuna modifica al codice applicata
**Obiettivo:** abbandonare i file master Excel (DUNNING e limitazioni massive) portando la gestione
della commessa ACEA dentro l'app, per eliminare la dipendenza dall'agente locale e dalla
sincronizzazione SharePoint/OneDrive.

---

## 1. Verdetto

**Fattibile.** I master non sono una fonte di dati: sono uno *staging con memoria*. Tutto ciò che
contengono esiste già o nell'export del Cruscotto ACEA (colonne d'origine) o nel database
(pianificazione ed esiti).

Tre elementi rendono l'operazione meno rischiosa di quanto sembri:

1. **L'export ACEA è molto più ricco del master.** 86 colonne contro le ~10 usate, e contiene dati
   che oggi non arrivano da nessuna parte: scadenza contrattuale per ordine, valore economico,
   esito e causale ACEA, operatore assegnato, aggancio al SAL.
2. **Il "CONFRONTA" di Excel è un anti-join.** La formula che identifica le nuove attività diventa
   una `insert … on conflict`, e il filtro manuale delle attività dunning diventa un predicato
   deterministico su `Tipo di ordine`.
3. **Metà dell'automazione da smontare è già ferma da sola.** L'assegnazione su ACEA è stata usata
   42 volte e abbandonata il 29/06; la lettura dei pianificabili dal master è ferma dalla stessa
   data; `limitazione_misuratori_stato` non è mai stata popolata. Dell'agente resta vivo solo il
   giro che aggiorna lo stato sui master.

Quello che il modulo mostrerà il primo giorno, e che oggi nessuno vede:

| | |
|---|---|
| ODL dunning oltre la scadenza contrattuale ACEA | **634** |
| ODL in attesa da più di 14 giorni (il più vecchio: 66) | **383** |
| Saracinesche eseguite senza ordine di registrazione (~91 € l'una) | **634** — circa **57.800 €** |
| Saracinesche con ordine aperto da esitare | **80** |
| Revoche `REVO` da escludere dalla consuntivazione | **53** |

---

## 2. L'export del Cruscotto — analisi del file reale

File analizzato: `Export_LavoriPubblicati_26.07.2026.xlsx` — un foglio `Esportazione SAPUI5`,
intestazione in riga 1, **86 colonne**, **5.293 righe**, 12 colonne sempre vuote.

### 2.1 Chiave

**`(Ordine, Numero Operazione)`**, non `Ordine`: 5.290 ordini distinti su 5.293 righe, 3 ordini con
due operazioni fatturate separatamente (163,48 € × 2). L'unique attuale
`interventi (committente, odl, data)` non regge questo caso.

### 2.2 Famiglie di attività

Il filtro dunning/massive è deterministico su `Tipo di ordine`:

| Tipo | Denominazione | righe | famiglia |
|---|---|---|---|
| `ASTR` | Manutenzione Straordinaria | 2.759 | **massive** (Limitazione Massiva 2.492 + Sostituzione saracinesca 267) |
| `ALIM` | Limitazione Flusso | 1.423 | dunning |
| `AMOR` | Interventi per morosità | 625 | dunning |
| `ARMO` | Ripristino da morosità | 433 | dunning (attivazioni) |
| `AVUF` | Verifiche da Ufficio | 53 | dunning — **si consuntivano**, vanno assegnate in campo |

### 2.3 Stati

`Descrizione Stato Ordine` e `Stato Operazione` sono lo stesso campo in due codifiche, 1:1 perfetto.

| codice | descrizione | righe | trattamento |
|---|---|---|---|
| `COMP` | completato | 3.303 | chiuso |
| `DAPI` | Intervento Richiesto | 1.574 | aperto, pianificabile |
| `ANNL` | Annullato | 208 | **eliminato dal registro** |
| `RICE` | Ricevuto | 173 | aperto, pianificabile |
| `ASGN` | Assegnato | 28 | aperto, pianificabile |
| `SOSP` | Sospensione | 7 | **aperto, pianificabile come normale** |

### 2.4 Date e scadenze

`Data documento` **coincide con `Data pubblicazione lavoro` su 5.293 righe su 5.293**: la data di
creazione dell'ordine è univoca. `Data fine cardine` è valorizzata ovunque ed è la scadenza che ACEA
attribuisce all'ordine:

| attività | SLA | giorni mediani dalla pubblicazione |
|---|---|---|
| Regolarizzazione / Riattivazione | `RIAT`, `REVO` | **1** |
| Rimozione per morosità, Rimozione abusivo | `NSLA` | 10 |
| Limitazione flusso idrico, Sospensione | `NSLA` | 11 |
| Sostituzione saracinesca | `NSLA` | 127 |
| Limitazione Massiva su Impianto | `NSLA` | 157 |

Le "attivazioni da chiudere entro le 23:59 del giorno dopo" sono quindi una **regola contrattuale
ACEA** (`RIAT`/`REVO`, cardine a 1 giorno), non una consuetudine interna. 69 righe nascono già
scadute (`fine cardine` anteriore alla pubblicazione).

Backlog aperto al 26/07:

| famiglia | aperti | oltre scadenza ACEA | in scadenza ≤7gg | attesa >14gg | attesa max |
|---|---|---|---|---|---|
| dunning `NSLA` | 940 | **634** | 294 | 383 | 66 gg |
| massive | 841 | 0 | 0 | 841 | 65 gg |
| dunning `RIAT` | 1 | 0 | 1 | 0 | 1 gg |

### 2.5 Misuratore: impianto e matricola

`Matricola misuratore` (colonna BN) è piena solo su 2.526 righe: **zero** su *Limitazione Massiva su
Impianto* e su *Sostituzione saracinesca*. Per quelle famiglie impianto e matricola sono **dentro
`Testo breve Ordine`**, in tre formati:

| marcatore | righe | esempio |
|---|---|---|
| `<impianto>_LIM_MAS_MATR_<matricola>_LENTE…` | 1.965 | `4003633678_LIM_MAS_MATR_202115413757_LEN` |
| `<impianto>_LIM_MASS_<matricola>_MM_<n>` | 525 | `4004131638_LIM_MASS_202315613068_MM_6` |
| `<impianto>_SOST_SARAC_SER_<matricola>` | 94 | `4000308907_SOST_SARAC_SER_202415647231` |

Un parser unico (impianto = 10 cifre iniziali, matricola = primo token dopo il marcatore) copre
**2.759 righe su 2.759, il 100%**. Copertura complessiva su tutto l'export: **99,85%** — restano 8
righe di rimozione allacci abusivi, dove la matricola non serve e spesso non esiste.

Tre trappole accertate:

- **Il campo SAP è troncato a 40 caratteri** (2.543 righe esattamente a 40): `LEN`, `LENT`,
  `LENTE_M`, `LENTE_MM_` non sono suffissi diversi, sono la parola `LENTE` tagliata. La matricola
  non risulta mai troncata, ma il margine è di **16 caratteri** — matricole più lunghe verrebbero
  tagliate, quindi in ingestione serve un guardrail, non un assunto.
- **Il marcatore non identifica l'attività**: 173 delle 267 saracinesche usano `LIM_MAS_MATR_`.
  L'attività si legge solo da `Operazione testo breve`.
- **Le matricole hanno 26 forme diverse**: cifre da 6 a 12, lettera finale (`123324A`), prefisso
  alfabetico (`OA3494`, `GN71128`, `AL014451`), `04-228458`, `MIS-E392-3017`,
  `WTTS075224001826`, `PROV8-X`, `SETA071226122814`.

**L'impianto è la chiave giusta**: 10 cifre sempre pulite, 1.962 impianti distinti per 1.962
matricole distinte sulle massive, e identifica il *punto di fornitura* — sopravvive alla
sostituzione del contatore, la matricola no.

### 2.6 Economia

`Valore Netto` è nell'export, per attività:

| attività | € |
|---|---|
| Limitazione Massiva / Limitazione flusso idrico | 25,46 |
| Sospensione fornitura | 19,43 |
| Regolarizzazione / Riattivazione | 28,81 |
| Rimozione misuratore per morosità | 31,49 |
| **Sostituzione saracinesca o valvola** | **91,12** |
| Rimozione impianto abusivo | 163,48 |
| Verifica sigilli manomessi | 8,80 |

Oggi `acea_listino` ha 4 voci a prezzo **0** impostate a mano. `Documento Acquisto` +
`Posizione Documento Acquisti` agganciano il SAL senza leggere i file della cartella CONTABILITÀ.

**53 righe `ARMO` portano `Escludi OdM / Operazione dalla consuntivazione = X`** e un `OdM
riferimento` valorizzato: sono revoche figlie di un ordine padre, il cui valore non va contato due
volte (~1.527 €). Nessun campo oggi registra quel flag.

---

## 3. Decisioni

| # | Tema | Decisione |
|---|---|---|
| 1 | File master | Spento come fonte. Resta un export xlsx on-demand per verifiche manuali |
| 2 | Chiave | `(odl, numero_operazione)` |
| 3 | Modello | Registro `acea_ordini` + change-log `acea_ordini_eventi` + `interventi` per la pianificazione |
| 4 | Massive | Nessun censimento da migrare: le righe senza ODL sono gli extra manuali, già in app |
| 5 | Indirizzi | `acea_impianti` con `indirizzo_verificato`; operatore propone / ufficio conferma — schema sì, flusso da campo rimandato |
| 6 | Tabella | Filtri, ordinamento, selezione multipla, azioni in blocco, editing di cella, copia/incolla |
| 7 | Librerie | `@tanstack/react-table` + `@tanstack/react-virtual`; editing a griglia scritto a mano (nessuna licenza commerciale) |
| 8 | Integrità | Dato ACEA immutabile: `revoke` su `acea_ordini`, `grant` per colonna su `acea_impianti`, `sha256` del file, xlsx archiviato |
| 9 | Ingestione | Import manuale dalla UI. Automazione rimandata (nessun abbonamento) |
| 10 | Regole import | File totale · riga identica saltata · `ANNL` eliminati con rete di sicurezza · assenza ≠ cancellazione · validazione contratto |
| 11 | Stati | Aperti `DAPI`/`RICE`/`ASGN`/`SOSP` · chiuso `COMP` · eliminato `ANNL` |
| 12 | Verso ACEA | Export del pianificato del giorno, assegnazione manuale sul portale. Motore Playwright parcheggiato |
| 13 | Rapportini | Un rapportino per operatore per giorno: se esiste si apre e si aggiunge, altrimenti si crea su territorio ACEA |
| 14 | Motore | Motore ACEA separato ora, convergenza con quello Italgas in seguito. Nuova colonna `rapportino_voci.origine` |
| 15 | Modulo | Modulo unico ACEA a foglie: **Dunning · Limitazioni massive · Misuratori** |
| 16 | Import | Un solo import alimenta entrambe le foglie; tabella unica con filtro comune |
| 17 | Saracinesche | Stati derivati, nessuna tabella nuova |
| 18 | Riporto | Il riporto dei rapportini è un join, non una scrittura |
| 19 | Scadenza | Dunning: creazione + 14 gg, `RIAT`/`REVO` 1 gg. **Le massive non scadono** |
| 20 | Cut-over | Preview, due giorni di prova, poi abbandono del master. L'agente resta come rete |
| 21 | Appunti | Le **righe spuntate** sono un bersaglio degli appunti: si copiano intere e ci si incolla sopra, senza passare dalla barra di assegnazione |
| 22 | Finestra | Si programma solo per **oggi e il prossimo giorno lavorativo**. Il sabato è lavorativo, la domenica no. Applicata anche sul server |
| 23 | Assegnabili | Gli operatori proponibili sono quelli in cronoprogramma **con l'attività DUNNING** per quel giorno (singola o fra le multiple), meno le assenze intere — il criterio è l'attività, **non il territorio**: chi sta su Lazio Centro/Est col dunning aggiunto per saturare la giornata compare |
| 24 | Ven/sab | Venerdì e sabato passano **solo le attivazioni** (`RIAT`/`REVO`): hanno un giorno di cardine, il resto aspetta il lunedì |
| 25 | Riassegnazione | Cambiare il **solo esecutore** su un intervento vecchio e non eseguito è sempre concesso: la finestra vincola chi SCEGLIE un giorno, non chi lo eredita |
| 26 | Riga a metà | Solo esecutore o sola data si scrivono come **appunto** su `acea_ordini`; il motore rapportini si rifiuta di generare un giorno che ne contiene, finché non lo si conferma |
| 27 | Colonne ACEA | «Operatore ACEA» e «Esecuzione ACEA» sono **predefinite**: senza, un ordine chiuso da ACEA e mai pianificato da noi sembrava un import mancato |
| 28 | Riaperture | La scheda è una **coda di lavoro**: solo aperte su ACEA e non completate nei rapportini. Le esitate stanno in «Chiusi». **Solo nella vista dunning**: in massive la scheda non si disegna |
| 29 | Triangolo | Sul tasto della scheda, **triangolo rosso** col numero delle attivazioni **senza data di pianificazione** — hanno un giorno di cardine, quella fuori calendario sparisce senza che nessuno la veda |
| 30 | Annullati | Un intervento **annullato** non assegna, non pianifica e non si mostra: badge, filtro «Non assegnato» e colonna Esecutore usano la stessa definizione |
| 31 | Conteggi schede | **Provati e tolti**: cinque numeri sempre accesi sui tasti erano rumore, e il rumore copre l'allarme. Sui tasti resta solo il triangolo (dec. 29) |
| 32 | Editor data | La Data pianificata si scrive anche **a mano o dal calendario** (doppio click / Invio sulla cella); nella **copia** il cursore di cella batte le spunte, nell'**incolla** vincono le spunte |
| 33 | Menu esecutore | Su una cella Esecutore **vuota**, un click apre il **menu di chi fa DUNNING quel giorno** (per giorno della finestra): si sceglie da lì, niente testo libero. Doppio click per cambiare un nome già scritto |
| 34 | Retention archivio | Gli xlsx nel bucket `acea-import` si potano a **180 giorni**, tenendo comunque gli **ultimi 30 file**; metadati e change-log restano per sempre. La potatura corre a valle di ogni import, best-effort |
| 35 | Sul rapportino | Le righe spuntate si caricano **direttamente sul rapportino** del loro esecutore per il loro giorno («Sul rapportino» in barra): stesso motore degli Strumenti (`staffIds`+`data`), additivo e idempotente |
| 36 | Schede massive | La vista massive ha **una scheda per comune** (gli aperti di quel paese) più «Chiusi» e «Sostituzione saracinesca» **riepilogative su tutti i comuni**; niente «Tutti» né «Da lavorare» generica. I comuni escono dal registro (aperti > 0): uno nuovo compare al primo import, uno finito sparisce da solo. «Azzera» ripulisce i filtri ma **non cambia scheda** |
| 37 | Assegnabili per famiglia | L'attività di tabellone che rende assegnabili è **della famiglia** (`ATTIVITA_TABELLONE`: DUNNING / LIMITAZIONI MASSIVE — nomi veri di produzione); la famiglia sta **nella chiave** di `controllaAssegnazioni`, così la stessa coppia (giorno, operatore) ha verdetti indipendenti |
| 38 | Ven/sab massive | La regola «venerdì e sabato solo attivazioni» è **del dunning**: le limitazioni massive ne sono **esenti** e si pianificano anche in quei giorni (richiesta esplicita del 30/07, che ribalta il primo taglio — la si era estesa alle massive per coerenza, era troppo stretta). Una riga **senza famiglia** resta sotto la regola piena: si sbaglia per difetto |
| 39 | Revoche in evidenza | Una **REVO aperta** si evidenzia in tabella (riga rossastra, `--status-ko-soft`, tooltip + testo sr-only): va **verificata a mano sul sistema ACEA** — può essere una riattivazione o regolarizzazione etichettata male. L'attività scritta NON distingue (le REVO portano gli stessi testi delle RIAT, verificato sulle 61 del registro): l'unico segno è `codice_sla`. Solo le aperte: 60 chiuse contro 1 aperta, colorare lo storico seppellirebbe quella viva |
| 40 | Matricole massive tronche | Le SETA delle massive arrivano dal **testo ordine** (colonna misuratore vuota sugli ASTR) e il testo si ferma a **40 caratteri**: 240 matricole perdono l'ultima cifra (16 → 15 char, verificato: le tronche sono TUTTE al limite esatto; il master non copre i comuni nuovi, 0 su 244). **Non recuperabile da nessun file**: l'avviso lo dice con precisione e indica l'**Impianto** (completo) come riferimento; la colonna si allarga a 175 per mostrare intero ciò che abbiamo |
| 41 | Ordinamento indirizzo | «Indirizzo» ordina **via e poi civico da numero** (1, 2, 4, 10 — non 1, 10, 2), con spareggio sul testo per «584 B/C». Serve `civico_num`, colonna **generata** del registro (migration `20260730160000`, applicata in produzione): PostgREST ordina solo colonne, non espressioni. I «99999» di ACEA (civico ignoto) restano in fondo |
| 42 | Selezione a riga larga | Il click su **ODL, Attività, Impianto o Matricola** spunta la riga come il checkbox (shift-click per l'intervallo): il quadratino era un bersaglio da 16px. Le colonne dopo restano celle (cursore, copia, editor); su quelle d'identità il cursore resta raggiungibile con le frecce |
| 43 | Barra azioni ferma | La barra dell'assegnazione sta **a destra del «?»**, alta esattamente **h-9** come la riga dei comandi: comparire alla prima spunta non muove la pagina di un pixel (prima spingeva la tabella e il click successivo cadeva su un'altra riga). I testi lunghi della barra sono **compatti** (select «Nessuno in tabellone» + title, link «compila il tabellone», badge «solo attivazioni» con tooltip) e i comandi della riga hanno `shrink-0`: niente bottoni schiacciati su due righe |
| 44 | Click in raffica | La selezione si aggiorna con l'**updater** (`setState` funzionale), mai dalla fotografia del render: cliccando righe in rapida successione il secondo click ripartiva da uno stato senza il primo e **i flag appena messi sparivano**. In più: spunta solo il **tasto principale** (il menu contestuale su un ODL spuntava la riga) e solo il **primo click della coppia** (il doppio click metteva e toglieva) |
| 45 | Rapportini in modale, via UNICA | Il comando «Rapportini» apre una **modale sovrapposta** alla tabella (la selezione resta): per ogni (esecutore, giorno) l'**anteprima** dice se si integra il rapportino esistente — stato, voci a bordo, «consegnato: verrà chiesto di riaprirlo» — o se ne nasce uno nuovo; poi genera col motore di sempre (additivo, badge «Nuovo» sulle voci), interrogando SOLO le coppie selezionate. **Eliminate le altre due vie** (link agli Strumenti e bottone «Sul rapportino» in barra): tre funzioni per la stessa cosa erano due di troppo. Anteprima: `GET /api/acea/rapportini?coppia=staffId\|data`, pure `parseCoppie`/`anteprimeRapportini` |

---

## 4. Modello dati

### `acea_ordini` — specchio dell'export, immutabile

Una riga per `(odl, numero_operazione)`. Contiene i campi utili dell'export: stato e stato
normalizzato, famiglia derivata da `Tipo di ordine`, attività, date (creazione, cardine,
completamento), operatore ACEA (`C.I.D.`, cognome, nome), esito ACEA (causale, descrizione, icona,
testo conferma), indirizzo, comune, impianto, matricola, valore netto, documento acquisto e
posizione, `escludi_consuntivazione`, elemento WBS, centro di lavoro, `riga_hash`.

- Scrive **solo** l'ingestione (`service_role`): `revoke insert, update, delete … from authenticated`.
- Nessun campo nostro: la pianificazione vive in `interventi`, le verifiche in `acea_impianti`.

### `acea_ordini_eventi` — change-log

Solo i cambiamenti (stato, operatore, esito, valore, annullamento), con data e riferimento
all'import. Niente archivio integrale: nella pratica cambiano poche decine di righe per import.

### `acea_impianti` — punto di fornitura

`impianto` (chiave), matricola corrente, indirizzo ACEA, **indirizzo verificato**, comune, chi e
quando ha verificato. L'unica tabella mista, protetta con privilegi di colonna:

```sql
grant update (indirizzo_verificato, verificato_da, verificato_il)
  on acea_impianti to authenticated;
```

### `acea_import` — registro degli import

File, `sha256`, righe totali, nuove, modificate, invariate, annullate, finestra coperta, chi ha
caricato, quando. L'xlsx originale archiviato in Storage: l'immutabilità del sorgente diventa
verificabile, non solo dichiarata.

### Modifiche a tabelle esistenti

- `interventi.ordine_id` → FK verso `acea_ordini`, con backfill per ODL dei 5.375 interventi ACEA già presenti.
- `rapportino_voci.origine` (`'task' | 'manuale' | 'acea'`), con il delete del motore Italgas
  ristretto a `origine = 'task'`.

---

## 5. Regole di import

L'export caricato è sempre il totale.

1. **Validazione della provenienza** prima di scrivere: `Contratto = 3600002158`, `Fornitore = 25617`,
   foglio e intestazione attesi. Un file di un'altra commessa viene rifiutato.
2. **Idempotenza visibile**: `sha256` del file. Se è già stato importato, l'app lo dice e chiede
   conferma invece di rifare il giro in silenzio.
3. **Riga identica → saltata**, confrontando un hash dei soli campi ACEA. Non tocca nemmeno
   `updated_at`, così "modificato" significa davvero modificato.
4. **Riga nuova → inserita. Riga diversa → aggiornata**, con evento nel change-log.
5. **Riga `ANNL` → eliminata dal registro.** Se esiste un intervento collegato non sparisce in
   silenzio: il riepilogo lo segnala («2 ODL annullati da ACEA erano pianificati per il 27/07 con
   CIARALLO»). Resta traccia nel change-log. Sui 208 annullati del file di riferimento nessuno era
   stato eseguito e solo 2 erano assegnati.
6. **Assenza ≠ cancellazione.** Un ODL presente in DB e assente dal file resta intatto: un filtro
   `Data pubblicazione ≥` sbagliato non può radere al suolo il registro.
7. **Il riepilogo dichiara la copertura**: finestra del file, righe totali, nuove, modificate,
   invariate, annullate rimosse, e quanti ODL in DB non sono coperti. Il riepilogo è il sostituto
   del CONFRONTA.

**Al primo import** il filtro `Data pubblicazione ≥` va portato il più indietro possibile: 1.318 ODL
esistono solo in `acea_master_snapshot` e non nell'export corrente.

---

## 6. Il modulo

Modulo unico **ACEA**, accesso admin, tre foglie.

### Dunning — pianificazione interventi

Tasto di import, tabella di pianificazione, comandi verso il motore di generazione rapportini,
export del pianificato del giorno per l'assegnazione manuale sul portale.

Colonne visibili: ODL · Attività · Matricola · Indirizzo · Comune · Stato ordine · Data creazione ·
**Scadenza** · Esecutore · Data pianificata.
Filtrabili ma nascoste: famiglia, tipo ordine, operatore ACEA, valore, priorità, impianto, causale.

Scadenza: **creazione + 14 giorni**, con `RIAT`/`REVO` a **1 giorno**. La scadenza contrattuale ACEA
(`Data fine cardine`) resta disponibile come colonna attivabile, perché è il numero che conta
quando ACEA contesta un ritardo.

### Limitazioni massive

Tabella unica con filtro comune — la vista del master, senza il file. **Nessuna scadenza**: anche
quando una data è presente, questi ordini non scadono.

Tre blocchi di colonne: da ACEA e non modificabili (ODL, impianto, matricola, indirizzo, comune,
stato, data pubblicazione, valore); dal nostro lavoro in join dai rapportini (esecutore, data
esecuzione, esito, sigillo, saracinesca); derivate (extra manuale, stato saracinesca, residuo per
via). Tasto «aggiorna stato» come scorciatoia all'import.

### Misuratori

Il modulo attuale, spostato nel nuovo percorso senza modifiche funzionali.

### Comportamento della tabella

Filtri per colonna · ordinamento · ricerca libera · selezione multipla con shift-click · azioni in
blocco (assegna operatore e giorno) · editing di cella con copia/incolla di blocchi · scelta delle
colonne visibili · conteggio delle righe filtrate · evidenziazione degli scaduti · export xlsx della
vista filtrata · annullamento dell'ultima azione in blocco. Nessun trascinamento: il popolamento
multiplo si fa con copia/incolla.

**Due selezioni, due bersagli degli appunti.** Il cursore di cella copia e incolla un rettangolo,
come in Excel. Le **spunte di riga** — quelle che finora servivano solo alla barra «Pianifica» —
sono l'altro bersaglio: con delle righe spuntate, `Ctrl+C` copia quelle righe intere su tutte le
colonne a schermo, e `Ctrl+V` scrive su tutte. Un nome incollato su quaranta spunte le assegna in
un colpo, senza aprire la barra di assegnazione; un comando «Copia righe» nella barra fa lo stesso
per chi la scorciatoia non la cerca. Le spunte battono il cursore: sono il gesto visibile — righe
evidenziate e conteggio in barra — mentre il cursore è un contorno su una cella sola.

### Finestra di programmazione e operatori assegnabili

Si programma per **oggi e il prossimo giorno lavorativo**, e per nessun altro giorno. Il **sabato è
lavorativo**, la domenica no: da giovedì si arriva a venerdì, da venerdì a sabato, da sabato e da
domenica a lunedì. Il campo data libero è sostituito da un menu di due voci, e la finestra è
applicata anche sul server (`/api/acea/pianifica` e `/api/acea/celle`) — altrimenti basterebbe un
incolla da Excel per aggirarla, cioè proprio il gesto che la griglia esiste per rendere comodo.

**Venerdì e sabato passano solo le attivazioni** — riaperture `RIAT`/`REVO`, quelle col cardine
contrattuale a un giorno. Il resto del dunning e le massive aspettano il lunedì. La regola vive in
`giorniProgrammabili.soloAttivazioni` e diventa un motivo di salto di `pianoPianificazione`, così
la barra in blocco e l'incolla in griglia non possono divergere. La barra lo dice **prima** di
premere: senza, il venerdì si selezionavano quaranta righe e ne passavano tre, e l'esito sembrava
un guasto.

Gli operatori proponibili **nel menu** sono quelli in cronoprogramma per il giorno scelto, non
l'anagrafica del personale: sono le persone che quel giorno ci sono davvero. Si sottraggono chi è a
tabellone con un'attività di tipo assenza e chi ha un'assenza **intera** in
`disponibilita_operatore` — le assenze parziali no, chi c'è mezza giornata un ordine lo può fare.
Accanto al nome compare il territorio del tabellone, perché il primo passo della mattina è
«assegnazione in base all'operatore più vicino». Se il tabellone di quel giorno è vuoto, il menu lo
dice e rimanda al Cronoprogramma.

**In griglia il vincolo è più largo, ed è voluto.** Un nome incollato si risolve su tutti gli
operatori attivi, e il cronoprogramma lo controlla il server — che è l'unico a sapere su quale data
la riga andrà a finire. La distinzione che conta è fra *scegliere* un giorno e *ereditarlo*:
riscrivere la data significa sottostare alla finestra e al tabellone, cambiare il **solo esecutore**
di un intervento vecchio e non eseguito no. Senza questa distinzione un lavoro rimasto indietro non
si poteva più riassegnare senza prima spostarlo, cioè senza cambiare anche quando.

### La riga a metà: l'appunto

Un intervento richiede sempre operatore **e** giorno (`interventi.data` è NOT NULL, e senza
`staff_id` non c'è nessuno a cui mandare il rapportino). Scrivere una sola delle due celle veniva
quindi rifiutato — e chi stava pianificando perdeva l'annotazione: sapeva già a chi darlo, non
ancora quando.

Ora la mezza pianificazione si scrive come **appunto** su `acea_ordini.pianificato_*_bozza`, dove
sta già `note` e per lo stesso motivo: deve poter esistere prima dell'intervento. Non è una seconda
fonte di verità — l'intervento vince sempre, l'appunto compare solo dove l'intervento non c'è, e nel
momento in cui la coppia si completa l'appunto viene cancellato. In tabella le due celle si
disegnano in corsivo su `--status-warn`, col motivo nel tooltip: un valore che *sembra* una
pianificazione e non genera nessun rapportino è peggio di una cella vuota, perché la vuota si nota.

La rete sta nel motore rapportini: un giorno che contiene righe con la data ma senza esecutore
**non si genera** (409) finché non lo si conferma esplicitamente, con l'elenco degli ODL. Le righe
col solo esecutore non appartengono a nessun giorno e non possono bloccarne uno: si contano e si
dicono come avviso.

### Le colonne di ACEA, accanto alle nostre

«Esecutore» e «Data pianificata» vengono da `interventi`: sono chi ci abbiamo mandato **noi**. Su un
ordine che ACEA ha chiuso senza passare dalla nostra pianificazione restano vuote per costruzione, e
la riga si legge come un import che non ha caricato niente — è successo davvero, su un export di
riaperture tutte «completato». Il dato ACEA c'era da sempre nel registro (`Cognome C.I.D.`,
`Nome C.I.D.`, `Data Completamento`): non aveva una cella dove farsi vedere. Da qui **«Operatore
ACEA» e «Esecuzione ACEA» sono predefinite**, subito dopo le nostre; e nella vista massive
`pianificato_il` smette di chiamarsi «Data esecuzione», che era il nome della colonna sbagliata.

Design: sistema esistente (`DESIGN.md`), nessuno stile proprio.

---

## 7. Generazione dei rapportini

Regola: **un rapportino per operatore per giorno.**

Italgas si pianifica prima, manualmente, creando il territorio. Poi, per ogni operatore della
giornata, l'automazione ACEA:

- **se non esiste un rapportino** per quell'operatore in quel giorno, lo crea sul territorio ACEA,
  indipendentemente dall'attività;
- **se esiste**, lo apre e vi aggiunge gli interventi.

Questo è già possibile a livello di dati: `rapportino_voci` porta `template_id` e `campi_snapshot`
**per voce** dal 20/07, quindi un rapportino può ospitare una voce Italgas e una voce
ACEA-limitazione con flussi diversi.

Due ostacoli nel motore attuale, che è il motivo del motore separato:

1. `sincronizzaRapportini` **cancella tutte le voci non-manuali** del rapportino e le ricostruisce
   dai task del piano: voci ACEA su un rapportino Italgas verrebbero rase via alla prima
   rigenerazione. Risolto dalla colonna `origine`.
2. Il rapportino è cercato per `(piano_id, staff_id)`: il piano ACEA non troverebbe il rapportino
   Italgas e ne creerebbe un secondo.

Il motore ACEA cerca per `(staff_id, data)`, **aggiunge senza mai cancellare**, e conferma
esplicitamente l'esito a chi pianifica: «aggiunto al rapportino di CIARALLO (in corso)» oppure
«rapportino già inviato: riaprire?». Mai un silenzio — è il difetto attuale, dove
`skipInviati: true` scarta il lavoro senza avvisare nessuno.

Il motore Italgas non viene toccato: regge 477 rapportini inviati in produzione. La convergenza dei
due motori è pulizia interna successiva.

---

## 8. Ciclo saracinesche

Regola: dove risulta una saracinesca sostituita, deve esistere un ordine ACEA che la registri.
Tutti gli stati sono **derivati**, nessuna tabella nuova:

| stato | regola | oggi |
|---|---|---|
| **fatte** | saracinesca = SI nel rapportino | **791** |
| **da esitare** | ordine di sostituzione aperto | **80** |
| **da richiedere** | nessun ordine di sostituzione sull'impianto/matricola | **634** ≈ 57.800 € |

Aggancio per matricola normalizzata, e per impianto quando disponibile. Vale per Dunning e per
Limitazioni massive. Gli 80 ordini aperti sono errori noti e finiranno esitati negativi.

Metodo: incrocio fra le voci `sostituzione_valvola`/`sost_valvola` = `SI` (1.682 voci, 791 ODL
distinti, 04/06 → 25/07) e i 267 ordini *Sostituzione saracinesca o valvola* dell'export, di cui 183
`COMP`+`EIES`, 80 `DAPI`, 2 `COMP`+`EIEA`, 2 chiusi non eseguiti. È un ordine di grandezza
affidabile, non un saldo contabile: l'export parte dal 21/05 e l'aggancio per matricola risente
delle 26 forme di scrittura.

---

## 9. Fasi

**Fase 1 — il modulo.** Registro e import manuale, tabella di pianificazione completa (inclusi
editing di cella e copia/incolla), foglia massive, spostamento di Misuratori, motore rapportini
ACEA, export del pianificato.

Cancelli di collaudo — sono i must-have concordati, senza i quali il master non si spegne: filtri
per colonna, ordinamento, selezione multipla con shift-click, assegnazione in blocco, ricerca
libera, colonne visibili, conteggio righe filtrate, evidenziazione scaduti, export xlsx della vista,
annullamento dell'ultima azione in blocco, editing di cella con copia/incolla.

**Cut-over.** Preview, due giorni di prova con l'agente ancora attivo, poi abbandono del master. In
Fase 1 **non si smonta nulla** di `tools/limitazioni-sync`: l'endpoint
`/api/export/limitazioni-massive` resta in piedi, quindi una passata di ripopolamento del master è
sempre possibile.

**Fase 2 — automazione dell'import.** Si parte solo a modulo consolidato: l'import manuale resta
comunque la strada garantita, e un'automazione che si rompe deve restare un fastidio, non un blocco.

**Fasi successive.** Motore di assegnazione Playwright da perfezionare nei tempi, flusso di verifica
indirizzi dal campo, convergenza dei motori rapportini, listino e consuntivazione alimentati
dall'export.

### Formato dell'export

Il formato è **confermato stabile** dal committente: il parser può assumere i tre marcatori
documentati al §2.5 senza riconoscimento dinamico. La validazione all'import (contratto, fornitore,
foglio, intestazione) resta comunque, insieme al guardrail sul troncamento a 40 caratteri: servono a
far fallire l'import in modo rumoroso se qualcosa cambia, non a indovinare un formato nuovo.

---

## 10. Rischi

| rischio | mitigazione |
|---|---|
| L'admin esporta con un filtro data sbagliato | La cancellazione dipende dallo stato `ANNL` scritto nel file, mai dall'assenza. Il riepilogo dichiara la copertura |
| Un ODL annullato era già pianificato | Segnalato nel riepilogo invece che cancellato in silenzio |
| Matricola troncata a 40 caratteri | Guardrail in ingestione con segnalazione, non assunto |
| Aggancio saracinesche impreciso per matricole sporche | `acea_impianti` rende l'aggancio per impianto, stabile |
| Regressione sul flusso Italgas | Motore ACEA separato; il motore esistente non viene toccato |
| 5.293 righe × 20 colonne nel DOM | Virtualizzazione dalla prima riga di codice |
| Nessuno carica l'export | Il modulo mostra l'età dell'ultimo import in evidenza |

---

## 11. Questioni aperte

- **Automazione del download senza costi ricorrenti** (Fase 2, da affrontare a modulo consolidato).
  ACEA non richiede la rete aziendale e nessun PC deve restare legato a Playwright. Le candidate da
  valutare: GitHub Actions su `workflow_dispatch` (gratis entro i minuti del piano, ma ogni run
  riparte da un login SAP), un container scale-to-zero su free tier, un runner che si spegne quando
  non serve. **Il vincolo che decide non è il prezzo, è la latenza**: il controllo delle attivazioni
  avviene ~10 volte al giorno e un giro da tre minuti non lo usa nessuno, mentre una sessione SAP
  mantenuta calda scende a 20-40 secondi. Nessuna delle candidate gratuite, allo stato, mantiene la
  sessione fra un giro e l'altro.
- **Motore di assegnazione Playwright**: esiste e funziona, va perfezionato nei tempi di esecuzione.
- **Convergenza dei motori rapportini** dopo la stabilizzazione.
