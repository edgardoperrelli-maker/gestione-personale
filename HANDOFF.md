# Handoff — Registro commesse: ACEA + AcquaLatina (2026-07-31 → 2026-08-03)

> Documento di ripresa per una NUOVA chat: autosufficiente, la sessione precedente non c'è più.
> Sostituisce l'handoff del redesign Cronoprogramma (2026-07-23): quel contenuto resta in git —
> `git show 528c4c4:HANDOFF.md`.
>
> **La sezione più recente è la prima** (2026-08-03, scarico misuratori in cesta). Sotto, dal
> «Goal» in poi, c'è la sessione ACEA del 31/07: resta valida, non è storia da archiviare.

**Branch**: `claude/acea-table-copy-schedule-filter-3xt700`, ripartito da `origin/main` (`93a514d`,
merge della PR #186; la vecchia PR #175 è chiusa, lo specchio `…okoirs` non si usa più)
**Status**: modulo ACEA completo e in produzione dal 30/07. Il 31/07 il registro è diventato
**multi-commessa**: la famiglia `acqualatina` (sostituzione misuratori Terracina) usa le stesse
mani su tabella propria — migration `20260731170000` + backfill (4.196 righe) applicati in prod

---

## Sessione 2026-08-03 — AcquaLatina: lo scarico in cesta lo dichiara l'operatore

> Task ATLAS `70d360ae`. Branch `feat/acqualatina-scarico-ceste`, da `origin/main` (`d777a5d9`).
> Il resto di questo documento è la sessione ACEA del 31/07 e resta valido: qui c'è solo il nuovo.

**Il buco che è stato chiuso.** Il registro `acqualatina_misuratori_rimossi` sapeva *cosa* era
stato smontato (lo scrive la chiusura del rapportino) e *su quale pallet* sarebbe finito (lo
assegna l'ufficio a cesta piena). In mezzo mancava **in quale cesta** era stato messo il
contatore: lo sapeva solo l'operatore, finché se lo ricordava — e per impallettare l'ufficio
doveva aprire la cesta e leggere le matricole a mano.

**Dove si chiede.** Subito dopo l'invio del rapportino, e **solo AcquaLatina**: è l'unico momento
in cui la domanda ha una risposta vera (contatori ancora in furgone, operatore che passa dal
magazzino). Il gancio è in `RapportinoForm.eseguiInvio`, dopo il successo: una GET decide, il
server, se c'è da chiedere.

**Le decisioni che non vanno riscoperte** (per esteso in
`docs/superpowers/specs/2026-08-03-acqualatina-scarico-ceste-design.md`):

- **Dichiarare la cesta È lo scarico a deposito**: si scrivono `cesta` e
  `stato='scaricato_deposito'` insieme. Nessun sesto stato: il vocabolario del registro
  (`types/misuratori.ts`) sa già nominare questo passaggio.
- **Il «no» non scrive niente.** `da_consegnare_deposito` dice già «da scaricare»; un flag
  «rimandato» sarebbe uno stato da tenere allineato a un altro che dice lo stesso.
- **Gli arretrati sono TUTTO ciò che è ancora da consegnare**, non «ieri». Chi risponde no per
  tre sere, alla quarta se li ritrova tutti. La modale li divide in «di oggi» / «dei giorni
  scorsi» perché è la distinzione che l'operatore ha in testa guardando il furgone.
- **L'intervallo delle ceste è un dato del magazzino**, non del codice: tabella singleton
  `acqualatina_ceste` (riga unica garantita dal DB), configurabile in **AcquaLatina → Strumenti**.
  Con l'intervallo l'operatore sceglie da un **menu** (un tap; un refuso su un numero di cesta è
  un contatore cercato nel posto sbagliato), senza resta il **campo libero** — il modulo funziona
  dal primo giorno. **Fuori intervallo avvisa e passa**: se il magazzino aggiunge una cesta prima
  che l'ufficio aggiorni, la realtà vince — bloccare costringerebbe a scrivere un numero falso.
- **Le spunte per riga** (tutte accese) esistono per chi ne scarica una parte o ne ha uno rotto in
  furgone. Stessa forma della selezione con cui l'ufficio assegna il pallet.
- **Sicurezza su endpoint a token**: l'operatore lo dice il **token**, mai il corpo. `registraScarico`
  scrive solo su righe con `esecutore = <operatore del token>` **e** `stato='da_consegnare_deposito'`:
  gli id che arrivano dal client sono un **filtro**, non un'autorizzazione.
- **Offline**: l'invio in coda non fa comparire la domanda (senza server non si sa cosa c'è a
  registro). Limite dichiarato, non buco: gli arretrati lo coprono al primo invio online.

**Dove sta il codice.**

| Cosa | Dove |
|---|---|
| Logica pura (partizione, menu numeri, validazione) | `lib/acqualatina/ceste.ts` (+ `.test.ts`) |
| Accesso dati + regole di scrittura | `lib/acqualatina/scaricoMisuratori.ts` |
| Endpoint operatore (GET/POST) | `app/api/r/[token]/scarico-misuratori/route.ts` |
| Configurazione ceste (GET/PUT admin) | `app/api/acqualatina/ceste/route.ts` |
| Modale a due passi | `components/modules/rapportini/acqualatina/ModaleScaricoMisuratori.tsx` |
| Card di configurazione | `components/modules/acqualatina/CesteCard.tsx` |
| Colonna/filtro/PDF ufficio | `MisuratoriTabella`, `MisuratoriClient`, `exportMisuratoriPdf` |

**Rinomina:** `lib/misuratori/pallet.ts` → **`riferimenti.ts`**. Cesta e pallet sono lo stesso
tipo di riferimento di magazzino (testo scritto a mano, non una quantità): i filtri prendono ora
il **campo come parametro** (`valoriRiferimento`, `filtraPerRiferimento`, `SENZA_RIFERIMENTO`)
invece di essere due gemelle destinate a divergere alla prima modifica.

**Resilienza deploy/migration** — la regola di casa, applicata: `pallet` e `cesta` sono passate
fra le **colonne opzionali** di `selectDegradante` in `leggiRegistro`. Verificato **davvero**, col
codice nuovo sul DB non ancora migrato: il registro AcquaLatina si carica intero, la colonna Cesta
c'è ed è vuota. Il gancio dell'operatore **non compare** finché la colonna non esiste
(`misuratoriDaScaricare` chiede `cesta` proprio per accorgersene): meglio nessuna domanda che una
conferma che poi non può scrivere.

**⚠️ Da fare al deploy**: applicare `supabase/migrations/20260803180000_acqualatina_ceste.sql`.

**Non ancora visto sul campo**: la modale dell'operatore end-to-end. Serve un rapportino
AcquaLatina chiuso in positivo **dopo** la migration; il resto (registro con colonna e filtro,
card Strumenti, endpoint) è stato guardato a schermo sul DB vero. Da provare al primo giro utile:
invio → elenco → conferma su una cesta → la riga in registro con cesta e «Scaricato deposito».

---

## Goal

Portare la commessa ACEA (dunning + limitazioni massive) dentro l'app e spegnere i tre file
Excel su SharePoint. La base del modulo (registro, import, tabella, rapportini, saracinesche,
export, collaudo) era già sul branch; questa sessione ha costruito sopra la **pianificazione
operativa**: copia/incolla delle righe, finestra di programmazione, operatori dal cronoprogramma,
la coda delle riaperture e gli strumenti di cella. Lo studio con le decisioni numerate sta in
`docs/acea-modulo-fattibilita.md` (32 decisioni, §3 — le 21-32 sono di questa sessione).

## Completed (questa sessione, in ordine di commit)

- [x] **Righe spuntate = bersaglio degli appunti** (`95f1e27`) — con delle righe spuntate,
  `Ctrl+C` copia le righe intere su tutte le colonne a schermo e `Ctrl+V` scrive su tutte: un
  nome o una data incollati su 40 spunte le assegnano in un colpo, senza la barra «Pianifica».
  Comando «Copia righe» in barra per chi non cerca la scorciatoia. Celle con tab/a-capo/virgolette
  escono citate come fa Excel (una nota con a-capo spezzava la riga copiata). Lib pura:
  `lib/acea/righeAppunti.ts`.
- [x] **Finestra di programmazione** (`95f1e27`, corretta in `52869d1`, allargata dopo — dec. 49)
  — si programma **da oggi a oggi + 14 giorni, domenica esclusa** (`ORIZZONTE_GIORNI`). Sabato
  lavorativo; «oggi» resta programmabile anche di domenica. Erano due giorni soli (oggi +
  prossimo lavorativo) e **dal venerdì il lunedì non si raggiungeva**: in barra il menu di due
  voci è tornato un **campo data** con `min`/`max` sugli estremi veri, badge «fuori finestra» +
  «Pianifica» spento su una data che il campo non doveva accettare. Il tabellone si legge in
  anticipo solo per i due **giorni pronti**; per gli altri c'è `/api/acea/operatori?data=`.
  **Venerdì e sabato passano solo le attivazioni** (`RIAT`/`REVO`): motivo di salto in
  `pianoPianificazione`, avvisato in barra PRIMA di premere. Lib pura:
  `lib/acea/giorniProgrammabili.ts` (`eProgrammabile`/`limitiFinestra`/`giorniRapidi`).
- [x] **Operatori dal cronoprogramma** (`95f1e27`) — il menu «Assegna a» elenca chi è in
  tabellone per il giorno scelto (via `/api/acea/operatori`), meno chi è a tabellone come assenza
  e chi ha un'assenza INTERA in `disponibilita_operatore` (le parziali restano assegnabili).
  Territorio accanto al nome. Tabellone vuoto → lo dice e rimanda a `/dashboard`. Server:
  `lib/acea/operatoriGiorno.ts`.
- [x] **Presa allentata sull'esecutore** (`52869d1`) — la finestra vincola chi SCEGLIE un giorno,
  non chi lo eredita: cambiare il solo esecutore di un intervento vecchio e non eseguito è sempre
  concesso (`controllaAssegnazioni`, flag `dataScritta`). In griglia i nomi si risolvono su TUTTI
  gli operatori attivi; il controllo giorno-per-giorno lo fa il server, che la data ce l'ha.
- [x] **La riga a metà è un appunto** (`52869d1`) — solo esecutore o sola data si scrivono su
  `acea_ordini.pianificato_a_bozza` / `pianificato_il_bozza` (migration
  `20260730090000_acea_pianificazione_bozza.sql`). L'intervento vince sempre; completata la
  coppia, l'appunto si cancella. In tabella: corsivo su `--status-warn` + tooltip. Rete: il
  motore rapportini rifiuta (409, con elenco ODL) un giorno con righe data-senza-esecutore,
  finché non si conferma `confermaIncomplete`; le righe con solo esecutore si contano come avviso.
- [x] **Il dato ACEA a vista** (`52869d1`) — «Operatore ACEA» (cognome+nome C.I.D.) e
  «Esecuzione ACEA» (`data_completamento`) sono colonne PREDEFINITE accanto alle nostre. Motivo:
  su un export di riaperture chiuse da ACEA, Esecutore/Data pianificata (nostre, da `interventi`)
  erano vuote per costruzione e sembrava un import rotto — il dato c'era, non aveva una cella.
  In massive `pianificato_il` non si chiama più «Data esecuzione».
- [x] **Resilienza all'ordine deploy/migration** (`9348cc7`) — le colonne bozza NON stanno nella
  select principale del registro né in quella delle celle: si leggono a parte, best-effort, con
  la stessa degradazione delle saracinesche. Codice deployato prima della migration = tabella
  viva, appunti spenti.
- [x] **La scheda Riaperture è una coda** (`16fc834`) — mostra solo aperte su ACEA e non
  completate nei rapportini (le esitate stanno in «Chiusi»). `serveIncrocio` si accende per la
  scheda; il grosso lo taglia Postgres (`riapertura=true AND aperto=true`), la scansione tocca
  poche decine di chiavi. Ordinamento interno: solo urgenza (scadenza, creazione). Lib pura:
  `lib/acea/codaRiaperture.ts`. Review adversariale multi-agente pre-commit: 3 difetti trovati e
  corretti (famiglia sul conteggio, annullati che "assegnavano a metà", aria-label vietata).
- [x] **Gli annullati non esistono** (`16fc834`) — un intervento `annullato` non assegna, non
  pianifica e non si mostra: escluso da `indicePianificazione` (filtri), dalla mappa display
  (colonna Esecutore) e dal conteggio del triangolo. Stessa regola di `pianoPianificazione`.
- [x] **Niente scheda Riaperture in massive** (`1bdc888`) — le riaperture sono dunning; la fila
  delle schede la decide `statiDella(famiglia)` in `BarraFiltriAcea`.
- [x] **Editor della data in cella** (`cdcdc2c`) — doppio click (o Invio/F2) sulla Data
  pianificata apre un `<input type="date">` nella cella: calendario o digitazione. Min/max sulla
  finestra; Esc annulla; valore identico non parte. `showPicker()` best-effort.
- [x] **Precedenza copia ribaltata** (`cdcdc2c`) — nella COPIA il cursore di cella batte le
  spunte (il flusso «spunto, clicco la data, Ctrl+C, Ctrl+V» copiava le righe intere);
  nell'INCOLLA vincono le spunte. «Copia righe» copia le righe sempre.
- [x] **Triangolo rosso sulla scheda Riaperture** (`cdcdc2c` + `1e9b96d`) — sul tasto,
  `TriangleAlert` + numero in `--status-ko`: le attivazioni aperte **senza data di
  pianificazione** (= nessun intervento vivo; l'appunto non conta, le esitate non si contano).
  Viaggia su ogni GET della lista (`riapertureSenzaData`), a zero o su `null` sparisce. Il numero
  è `aria-hidden` col testo completo in `sr-only` (aria-label su `generic` è vietata).
- [x] **Conteggi per scheda: provati e TOLTI** (`cdcdc2c` → `1e9b96d`) — un giro di vita:
  cinque numeri sempre accesi sui tasti erano rumore che copriva l'allarme. Non riproporli.
- [x] **Menu esecutore in cella** — su una cella Esecutore VUOTA un click apre una `<select>`
  con chi è in cronoprogramma, raggruppato per giorno della finestra (territorio accanto al
  nome): si sceglie da lì, niente testo libero. Doppio click (o Invio/F2) per cambiare un nome
  già scritto. La conferma passa dal `display_name` dentro `applica` → `validaOperatore`, così
  menu, incolla e barra non possono divergere.
- [x] **Migration applicata in produzione** — vedi Not Yet Done (spuntata).
- [x] **Retention sull'archivio import** — gli xlsx del bucket `acea-import` si potano a 180
  giorni tenendo comunque gli ultimi 30 file; corre a valle di ogni import, best-effort, prima il
  bucket e poi `storage_path=null` (l'ordine inverso lascerebbe orfani). Metadati e change-log
  restano per sempre. Lib pura: `lib/acea/retentionArchivio.ts`.
- [x] **Assegnabili = chi fa DUNNING quel giorno** — `operatoriPerGiorno` filtra il tabellone per
  ATTIVITÀ (nome contenente «DUNNING», su `activity_id` E dentro `activity_ids`), non per
  territorio: Liberatori su LAZIO EST col dunning fra le attività multiple compare, Napoli sul
  risanamento no. Vale per menu barra, menu in cella e rifiuti server (messaggi aggiornati).
  Verificato sui dati veri di produzione prima di scrivere il filtro.
- [x] **Salvataggio di cella velocizzato** — le letture indipendenti di `/celle` e `/pianifica`
  (registro, appunti, interventi, tassonomia, controllo finestra) partono in PARALLELO invece che
  in fila; la tassonomia è cachata 60s (`lib/acea/indiceTassonomia.ts`); in `operatoriPerGiorno`
  attività e assenze partono insieme. Sul GET del registro: il triangolo parte subito e si
  riscuote alla fine, e la scheda Riaperture non paga più la scansione COMPLETA degli interventi
  (~7 richieste in fila) — usa `indicePianificazionePerOdl` mirato sulle poche chiavi scese; la
  scansione completa resta solo per filtri di pianificazione e ordinamenti a incrocio.
- [x] **Guida della tabella in modale** — il paragrafo fisso sotto la tabella (tre righe di
  registro mangiate) è ora una modale aperta dal «?» in barra (`GuidaTabella.tsx`, primitivo
  `Dialog`), contenuto in cinque sezioni con test sulle frasi chiave (`ContenutoGuida`).
  L'indicatore «salvataggio…» si è spostato nella riga dei comandi.
- [x] **«Sul rapportino» dalla selezione** — le righe spuntate si caricano dritte sul rapportino
  del loro esecutore per il loro giorno, senza passare dagli Strumenti: bottone in barra, conferma
  con riepilogo per (operatore, giorno), gestione di 409 righe-a-metà e riaperture con conferme.
  Stesso motore (`/api/acea/rapportini` con `staffIds`), additivo e idempotente. Lib pura:
  `lib/acea/caricaSuRapportino.ts` (`gruppiPerRapportino`).
- [x] **Vista massive per comune, con le mani del dunning** (`7bd84db`) — le schede della vista
  massive sono i COMUNI con ordini aperti (ZAGAROLO, RIANO, LABICO, RIGNANO FLAMINIO,
  BRACCIANO…), più «Chiusi» e «Sostituzione saracinesca» riepilogative su tutti; via «Tutti» e la
  «Da lavorare» generica. Scheda = `stato aperti` + `comuneScheda` (`eq` sul server, AND col
  filtro comune di colonna); comuni letti sul server nella pagina (prima interrogazione già
  dentro il primo paese) e riaggiornati a ogni risposta; se un comune finisce si passa al primo
  rimasto. «Azzera» ripulisce i filtri SENZA cambiare scheda (`azzeraFiltri`; `haFiltriAttivi`
  non conta più lo stato). E il pezzo che alle massive mancava davvero: gli **assegnabili per
  famiglia** — menu, `/celle`, `/pianifica` e messaggi filtrano il tabellone sull'attività della
  famiglia (`ATTIVITA_TABELLONE`: DUNNING / **LIMITAZIONI MASSIVE**, nomi verificati in
  produzione), con la famiglia dentro la chiave di `controllaAssegnazioni`. Export col comune nel
  nome (`acea-massive-zagarolo-aperti-…`). Lib: `schedeVista`/`applicaScheda`/`valoreScheda` in
  `filtriOrdini.ts`, `lib/acea/caricaComuniMassive.ts`.
- [x] **Ven/sab: le massive sono esenti dal «solo attivazioni»** — richiesta esplicita che
  ribalta il primo taglio (la regola era stata estesa alle massive per coerenza; troppo stretta).
  Decisione 38: la regola resta piena per il dunning e per le righe SENZA famiglia (si sbaglia
  per difetto); `pianoPianificazione` guarda `famiglia`, il controllo client dell'incolla pure
  (`useEditingGriglia`), l'avviso in barra compare solo nel dunning, la guida delle massive dice
  «venerdì e sabato compresi».
- [x] **Le REVOCHE aperte si evidenziano in rossastro** (decisione 39) — una REVO fra le
  attivazioni va verificata a mano sul sistema ACEA: può essere una riattivazione o
  regolarizzazione etichettata male, e l'attività scritta NON distingue (le REVO portano gli
  stessi testi delle RIAT — verificato sulle 61 del registro; l'unico segno è `codice_sla`).
  Riga `--status-ko-soft` + tooltip + sr-only (fuori dalla label del checkbox: l'aria-label ne
  scarta il contenuto); la spunta vince sul rossastro. Solo le APERTE (60 chiuse vs 1 aperta).
  Pure: `eRevoca` (scadenza.ts), `eRevocaDaVerificare`/`AVVISO_REVOCA` (colonneTabella.ts).
  Riga di legenda nella guida «?».
- [x] **Matricole massive tronche: dette per quello che sono** (dec. 40) — le SETA massive
  vengono dal testo ordine (colonna misuratore vuota sugli ASTR) tagliato a 40 caratteri: 240
  matricole senza l'ultima cifra (16→15, tutte al limite esatto; master 0/244 sui comuni nuovi;
  `acea_impianti` ha lo stesso valore tronco — INDAGATO, non recuperabile da nessun file).
  `AVVISO_MATRICOLA_TRONCA` su tooltip e sr-only: manda all'Impianto (completo), al Cruscotto o
  al misuratore. Colonna matricola massive 140→175 per mostrare intero ciò che abbiamo.
- [x] **Indirizzo ordina anche i civici, da numero** (dec. 41) — colonna GENERATA `civico_num`
  (migration `20260730160000_acea_civico_num.sql`, **applicata in produzione** via MCP e
  verificata: 1, 2, 4, 10…, «99999» in fondo); `ORDINAMENTI.indirizzo` ha `poi:
  ['civico_num','civico']` e la route applica gli spareggi nello stesso verso. PostgREST ordina
  solo colonne: senza la generata non si può.
- [x] **La riga si spunta cliccandola «fino alla Matricola»** (dec. 42) — `COLONNE_CLICK_RIGA`
  (odl, attivita, impianto, matricola) in TabellaOrdini: click = spunta con shift per
  l'intervallo, cursor-pointer; le colonne dopo restano celle. Frecce ancora buone per il
  cursore di cella su quelle colonne (copia dell'ODL nudo).
- [x] **Barra azioni a destra del «?», alta h-9 fissa** (dec. 43) — spostata nel gruppo destro
  della riga comandi DOPO GuidaTabella; select h-8, contatore compatto («N righe»), suggerimenti
  nowrap. Comparire alla prima spunta non muove più la pagina (prima spingeva la tabella di
  ~44px e il click dopo cadeva su un'altra riga).
- [x] **Copia dell'ODL nudo ripristinata** — il click-selezione (dec. 42) si era mangiato il
  gesto «clicco l'ODL, Ctrl+C»: ora sulla cella ODL compare al passaggio un'icona di copia
  (click → appunti + toast, `stopPropagation`: non tocca la spunta; `tabIndex=-1`: la griglia
  resta un solo stop di tabulazione — da tastiera si copia con frecce + Ctrl+C). Guida
  aggiornata.
- [x] **Rapportini in modale, via UNICA** (dec. 45) — il comando «Rapportini» non naviga più
  agli Strumenti: apre `ModaleRapportini` sopra la tabella (selezione conservata). Anteprima per
  (esecutore, giorno) via `GET /api/acea/rapportini?coppia=staffId|data` (pure
  `parseCoppie`/`anteprimeRapportini` in caricaSuRapportino.ts, testate): «si integra nel
  rapportino esistente (N voci)», «già consegnato: verrà chiesto di riaprirlo», «rapportino
  nuovo». Genera = stesso motore additivo (`POST`, `staffIds`+`data` per gruppo, conferme
  409/riapertura dentro la modale, esiti riga per riga; badge «Nuovo» sulle voci come sempre).
  ELIMINATI il vecchio link `strumenti#rapportini` e il bottone «Sul rapportino» in barra: tre
  vie per la stessa funzione erano due di troppo. Gli Strumenti restano per l'intera giornata.
- [x] **Flag in raffica + riga dei comandi che si schiacciava** (dec. 44 + coda della 43) — il
  bug dei flag: `clickRiga` leggeva la selezione dalla PROP (fotografia del render) e due click
  ravvicinati facevano sparire il flag del primo → ora updater funzionale
  (`onSelezione: Dispatch<SetStateAction<…>>`, updater passato com'è anche a
  `onRowSelectionChange`); in più guardie `e.button !== 0` (il tasto destro su un ODL spuntava)
  e `e.detail > 1` (il doppio click metteva e toglieva). Il bug grafico: il suggerimento nowrap
  «Nessuno con LIMITAZIONI MASSIVE…» sfondava la riga e schiacciava i comandi → select
  «Nessuno in tabellone» + title col nome intero, link corto «compila il tabellone», avviso
  ven/sab come badge «⚠ solo attivazioni» con tooltip, e `[&>*]:shrink-0` sul gruppo destro
  (un comando o sta intero o va a capo intero).
- [x] **Registro AcquaLatina — terza famiglia** (31/07, dec. 46-47) — la sostituzione misuratori
  di Terracina (4.196 punti dal master «Luglio») entra nel registro commesse come famiglia
  `acqualatina`: STESSE mani (select condivisa, griglia, celle, Pianifica, modale Rapportini,
  export) su **tabella propria `acqualatina_ordini`** (migration `20260731170000` + backfill,
  entrambi in prod). `PROFILO_COMMESSA` in famiglia.ts dice per famiglia: tabella, committenti
  interventi, territorio piani (`ACQUA LATINA`), **unità** (`odl_matricola`: 109 ODL coprono 2-5
  contatori — pianificazione, voci, positivi e indici `interventi` declinati per contatore; per
  ACEA nulla cambia, l'unità composta è opt-in). Tabellone: **CONTATORI**; ven/sab **esente**;
  chiusura **dai nostri rapportini** (riconciliazione throttled in `/api/acea/ordini`, chiusa =
  intervento completato via `ordine_id`, stato dice anche l'esito); sync **additivo** dal master
  (`/api/acqualatina/ordini/sync` + «Aggiorna dal master» al posto di «Importa export»);
  pagina `/hub/acqualatina/pianificazione` + foglietta nella landing. Le route condivise
  ricevono `famiglia` nel body/query e scelgono il registro dal profilo.
- [x] **Pallet sui misuratori AcquaLatina** (31/07, dec. 48) — a CESTA PIENA l'ufficio spunta i
  misuratori nel registro «Misuratori rimossi — AcquaLatina» e assegna in blocco il numero del
  pallet di riferimento (barra con input + Assegna/Togli/Annulla, `POST
  /api/acqualatina/misuratori/pallet`, colonna `pallet` text solo su quella tabella — migration
  `20260731190000` in prod). Filtro «Pallet» con «Senza pallet» (= ancora in cesta), colonna
  ordinabile in tabella e nel PDF, che ora prende il titolo per commessa (`titoloPdf`) invece
  del fisso «— ACEA». Helper puri in `lib/misuratori/pallet.ts`, testati — **dal 03/08 il file è
  `lib/misuratori/riferimenti.ts`** e le funzioni prendono il campo (cesta o pallet) come
  parametro; vedi la sezione della sessione 2026-08-03 in cima.
- [x] **AcquaLatina a ventaglio in sidebar e ⌘K** (31/07) — come la mappa: due voci dirette al
  posto della sola landing. «AcquaLatina» (goccia) → `/hub/acqualatina/pianificazione`,
  «Misuratori rimossi» (`Package`: la riconsegna su pallet, NON la `Gauge` del registro ACEA) →
  `/hub/acqualatina/misuratori`. In palette le etichette portano il committente («AcquaLatina —
  …») perché lì si cerca. La landing resta raggiungibile da breadcrumb e hub; `moduleAccess`
  intatto (il gate è per modulo, le voci sono viste).

## Not Yet Done

- [x] ~~Applicare `20260730090000_acea_pianificazione_bozza.sql` in produzione~~ — **fatta il
  30/07** via MCP sul progetto «Calendario personale» (`aceztqfebringeaebvce`), registrata come
  version `20260730094446`. Verificato dopo: le due colonne ci sono (`uuid`/`date`), l'indice
  parziale c'è, `authenticated` resta SELECT-only. Sul registro c'erano 6.444 righe.
- [ ] **Verifica a schermo**: niente di questa sessione è stato visto nel browser (container
  senza `.env.local`). Da guardare: barra azioni (campo data + menu operatore), triangolo sul tasto (13px — se
  piccolo, si ingrandisce), calendario in cella, corsivo warn delle righe a metà, colonne
  «Operatore ACEA»/«Esecuzione ACEA» nel layout; in MASSIVE: la fila delle schede-comune (oggi
  5 paesi — se crescono molto, la fila andrà a capo: valutare uno scroll orizzontale), il menu
  esecutori con chi fa LIMITAZIONI MASSIVE, l'export col comune nel nome.
- [ ] **Cut-over dal master** (piano in PR #175, sezione «Dopo il merge»): import con finestra
  larga, backfill dal collaudo, due giorni in parallelo con l'agente acceso.
- [ ] **Editor in cella per le Note**: oggi si scrivono solo per incolla. Data ed Esecutore
  hanno il loro editor; se serve anche per le Note, il pattern è in `TabellaOrdini` (rami
  `inEditor`/`inEditorEsecutore`) + `useEditingGriglia` (`apriEditor*`).
- [ ] **AcquaLatina, esiti negativi**: oggi un intervento completato chiude la riga anche con
  esito negativo (lo stato dice «Chiusa — non eseguita»). Se l'ufficio vorrà ripassare sugli
  assenti servirà una «riapertura acqualatina» (riaprire la riga o crearne una nuova): deciso di
  NON inventarla ora — il flusso vero non si conosce ancora.
- [ ] **AcquaLatina, verifica a schermo**: schede Da lavorare/Chiusi, ordinamento per strada,
  «Aggiorna dal master», menu esecutori con chi fa CONTATORI, modale rapportini sulla famiglia.

## Failed Approaches (da non ripetere)

- **Contare le «senza esecutore» sul badge della scheda.** Prima versione del triangolo: contava
  le riaperture senza staff. Sostituita su richiesta: una riga con data ma senza esecutore la
  ferma già il 409 del motore rapportini, mentre una SENZA DATA non la ferma niente — è quella
  che sparisce. Il criterio del triangolo è «nessun intervento vivo».
- **Conteggi di righe su tutte le schede.** Costruiti (server + Tabs.count + test) e rimossi al
  giro dopo: rumore. La cronologia li conserva (`cdcdc2c`), non rimetterli.
- **Vincolare la finestra allo stato FINALE della riga.** Prima versione: cambiare il solo
  esecutore su una riga con data vecchia veniva rifiutato («fuori finestra»). Sbagliato: quella
  data non la si sta scegliendo. Da qui `dataScritta` in `controllaAssegnazioni`.
- **Validare il cronoprogramma in griglia (client).** Prima versione: i nomi incollati si
  risolvevano solo sull'unione dei giorni della finestra, con messaggi «X non è in cronoprogramma».
  Rimossa con la presa allentata: la griglia non sa su che data finirà la riga — il vincolo
  giusto lo applica solo il server.
- **Colonne nuove nella select principale del registro.** `pianificato_*_bozza` nella select di
  `/api/acea/ordini` e `/api/acea/celle`: un deploy prima della migration avrebbe spento l'intera
  tabella (e nelle celle anche note e pianificazione). Già successo una volta nel modulo: le
  colonne di una migration non ancora applicata si leggono A PARTE, best-effort.
- **`aria-label` su uno `<span>` per il badge.** Ruolo `generic` → naming vietato (ARIA 1.2),
  alcuni lettori la ignorano («Riaperture 3» senza dire 3 cosa). Numero `aria-hidden` + testo in
  `sr-only`.
- **Backtick negli script Workflow.** Un backtick tipografico dentro un template literal del
  workflow di review l'ha fatto fallire al parse: negli script i testi si costruiscono con
  array + `join`.
- **`(5293).toLocaleString('it-IT')` non mette il punto.** CLDR italiano raggruppa da 10.000 in
  su (`minimumGroupingDigits=2`): «5293» è corretto, non un bug — un test lo aspettava col punto.

## Key Decisions (oltre alle 45 in `docs/acea-modulo-fattibilita.md` §3)

| Decisione | Motivo |
|---|---|
| Due bersagli degli appunti: cursore (rettangolo) e spunte (righe) | Sono gesti diversi: il cursore copia dati, le spunte assegnano in blocco |
| Nella copia vince il cursore, nell'incolla le spunte | Il cursore è il gesto più recente e specifico; l'incolla in blocco è il motivo per cui si spunta |
| Finestra e cronoprogramma applicati SUL SERVER | Una regola solo nel menu si aggira con un Ctrl+V — proprio il gesto reso comodo |
| «Oggi» lo decide il server (Europe/Rome) | L'orologio del browser proporrebbe giorni che il server poi rifiuta |
| L'appunto vive su `acea_ordini`, come `note` | Deve esistere PRIMA dell'intervento; non è una seconda fonte: l'intervento vince sempre |
| Il 409 dei rapportini si può forzare (`confermaIncomplete`) | La decisione resta all'ufficio, ma presa — non un default silenzioso |
| Il triangolo conta le SENZA DATA, non le righe della scheda | Ciò che nessun altro meccanismo ferma; assegnata-non-finita ha già un giorno |
| `riapertura` come booleano già deciso (`eRiapertura` in `scadenza.ts`) | Una sola definizione per scadenza, scheda, ordinamento e venerdì/sabato |
| Fake Supabase esteso con `is`/`not('is', null)` che THROWA su altro | Un filtro non supportato accettato in silenzio renderebbe verdi test sbagliati |
| Review adversariale (Workflow multi-agente) prima del commit grosso | Tre difetti veri trovati prima di nascere; rifarla sui diff che toccano più viste |

## Current State

**Working**: tutto. `npx tsc --noEmit` pulito · **3.000+ test verdi su 320 file** ·
`next build` exit 0 (con env Supabase segnaposto: nel container non c'è `.env.local`).

**Branch**: solo `claude/acea-table-copy-schedule-filter-3xt700`, ripartito da `origin/main`
dopo il merge della PR #186 (la PR #175 e il suo branch specchio sono chiusi: niente più doppio
push). In produzione (Supabase `aceztqfebringeaebvce`): migration `20260731170000`
(acqualatina_ordini + indici `interventi` declinati) e backfill dal master «Luglio» già applicati.

**Broken**: niente di noto. **Uncommitted**: niente.

**Non verificato**: la resa a schermo (vedi Not Yet Done) e tutto ciò che richiede l'export vero
(tabella su 5.293 righe reali, copertura saracinesche).

## Files to Know

| File | Perché conta |
|---|---|
| `docs/acea-modulo-fattibilita.md` | Le 49 decisioni numerate; §3 è il registro delle scelte, aggiornarlo a ogni cambio |
| `lib/acqualatina/ordiniDaMaster.ts` | Sync dal master: identità (odl, matricola), numerazione operazioni stabile, spacco via/civico |
| `lib/acea/giorniProgrammabili.ts` | Finestra (oggi → +14 gg, domenica esclusa), giorni pronti, `soloAttivazioni`, etichette dei rifiuti |
| `lib/acea/operatoriGiorno.ts` | Cronoprogramma → assegnabili **per famiglia**; `controllaAssegnazioni` con `dataScritta` (LA regola) e famiglia nella chiave |
| `lib/acea/famiglia.ts` | `Famiglia` (ora anche `acqualatina`), `ATTIVITA_TABELLONE` (DUNNING/LIMITAZIONI MASSIVE/CONTATORI) e `PROFILO_COMMESSA`: tabella, committenti, territorio e unità per famiglia — la mappa che rende il registro multi-commessa |
| `lib/acea/caricaComuniMassive.ts` | I comuni-scheda della vista massive (aperti > 0), usato da route e pagina |
| `lib/acea/codaRiaperture.ts` | Coda e triangolo: `esitataNeiRapportini`, `pianificata`, `contaSenzaData` |
| `lib/acea/righeAppunti.ts` | Copia/incolla per righe spuntate (TSV citato, incolla non contiguo) |
| `lib/acea/editingGriglia.ts` | Validazioni pure: `validaData(valore, oggi)` (finestra compresa), `validaOperatore` |
| `lib/acea/pianificazione.ts` | `pianoPianificazione`: le invarianti + `solo_attivazioni`; unica per le due rotte |
| `components/modules/acea/useEditingGriglia.ts` | Tastiera/appunti globali, editor data, precedenza copia |
| `components/modules/acea/RegistroAcea.tsx` | Collante: finestra, operatori, spunte, badge, editor |
| `components/modules/acea/BarraFiltriAcea.tsx` | Disegna `schedeVista(famiglia, comuni)` (la logica sta in `filtriOrdini.ts`) + triangolo sul tasto |
| `components/Tabs.tsx` | Primitivo CONDIVISO: prop additive `badge`/`badgeLabel` (triangolo rosso) |
| `app/api/acea/ordini/route.ts` | Registro, incrocio, coda riaperture, `riapertureSenzaData` |
| `app/api/acea/celle/route.ts` | Editing di cella: stato finale, appunti, pulizia bozze |
| `app/api/acea/pianifica/route.ts` | Assegnazione in blocco: finestra + attivazioni |
| `lib/acea/sincronizzaRapportiniAcea.ts` | Il 409 delle righe a metà + avviso solo-esecutore |
| `supabase/migrations/20260730090000_acea_pianificazione_bozza.sql` | Applicata in produzione il 30/07 (version `20260730094446`) |
| `supabase/migrations/20260730160000_acea_civico_num.sql` | Colonna generata per ordinare i civici da numero; applicata in produzione il 30/07 |
| `lib/interventi/testUtils/fakeSupabase.ts` | Fake condiviso: esteso con `is`/`not is null` |

## Code Context

**La distinzione che regge la finestra** (`lib/acea/operatoriGiorno.ts`):

```ts
export type AssegnazioneDaControllare = {
  data: string;
  staffId: string;
  // `true` se la DATA viene scritta adesso; `false` se si cambia il solo esecutore su una riga
  // che la data ce l'aveva già. Scegliere un giorno = finestra + tabellone; ereditarlo = niente.
  dataScritta: boolean;
};
```

**Il criterio del triangolo** (`lib/acea/codaRiaperture.ts`):

```ts
// «in calendario» = un intervento vivo (non annullato): la data è NOT NULL per costruzione.
// L'appunto (pianificato_il_bozza) NON conta: senza la coppia completa non esiste il rapportino.
export function pianificata(interventi: readonly InterventoDellOdl[]): boolean {
  return interventi.some((i) => i.stato !== 'annullato');
}
```

**Precedenza degli appunti** (`useEditingGriglia.ts`, dentro `copia`/`incolla`):

```ts
// COPIA: cursore > spunte > niente.   INCOLLA: spunte > cursore.
const testo = focus ? testoSelezione() : (spuntate.length > 0 ? testoRigheSpuntate() : '');
```

**Campi risposta di `/api/acea/ordini` aggiunti in sessione**: `riapertureSenzaData`
(`number|null`), e per riga `operatore_nome`, `pianificazione_parziale`; su `/api/acea/celle`
anche `bozze` (contatore righe salvate a metà).

## Resume Instructions

1. `git fetch origin claude/acea-commessa-feasibility-okoirs && git log --oneline -3 origin/claude/acea-commessa-feasibility-okoirs` — verifica di partire da `1e9b96d` (o successivo: sessioni concorrenti esistono).
2. `npm install` se il container è fresco, poi `npx vitest run lib/acea components/modules/acea` (attesi 44 file verdi) e `npx tsc --noEmit` (pulito).
3. Per il build senza credenziali: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=k SUPABASE_SERVICE_ROLE_KEY=k npx next build`.
4. Le pagine del modulo: `/hub/acea/dunning`, `/hub/acea/massive`, `/hub/acea/strumenti` (import + rapportini), `/hub/acea/collaudo`. Tutte dietro login admin.
5. Ogni push va su ENTRAMBI i branch (vedi Current State). La PR da aggiornare è la **#175** — l'utente chiede di tenerne il corpo allineato a ogni modifica sostanziale.
6. `docs/acea-modulo-fattibilita.md` §3: ogni cambio di regola diventa una decisione numerata (o l'aggiornamento di una esistente, come la 29 e la 31).

## Warnings

- **Repo PUBBLICO**: mai nomi di dipendenti, matricole cliente, ODL veri, indirizzi o URL
  SharePoint in commit, PR o file. I file xlsx caricati dall'utente restano fuori dal repo.
- **Ordine deploy/migration**: la migration è applicata; la regola resta — non aggiungere MAI
  colonne nuove alla select principale del registro, le letture di colonne recenti vanno a parte
  e best-effort.
- **Sessioni concorrenti su questo repo**: `git fetch` e verifica SHA prima di committare o
  pushare — è già capitato che `main` si muovesse durante il lavoro.
- **`Tabs`, `Select`, `MultiSelect` sono primitivi condivisi**: modifiche solo additive.
- **I test girano anche senza DB** (fake Supabase o mock `@/lib/supabaseAdmin`); niente test che
  toccano la produzione.
- **`.env.local` (quando c'è) punta alla produzione**: ogni click nell'anteprima scrive su dati
  veri.
