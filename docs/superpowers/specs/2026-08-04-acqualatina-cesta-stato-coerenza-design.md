# Misuratori AcquaLatina — la cesta e lo stato dicono la stessa cosa

> Spec di design. Data: 2026-08-04.
> Seguito di [2026-08-03-acqualatina-scarico-ceste-design.md](./2026-08-03-acqualatina-scarico-ceste-design.md).

## Il problema

La spec del 3 agosto ha messo il principio nero su bianco (§2): **dichiarare la cesta È lo scarico a
deposito**. Il flusso dell'operatore lo rispetta — `registraScarico()` scrive `cesta` e
`stato = 'scaricato_deposito'` in una sola UPDATE, e il commento in cima al file dice perché.

Il flusso dell'ufficio no. `aggiornaRegistro()` applica i soli campi presenti nel corpo, e la cella
della tabella manda `{ cesta }` da sola: il numero si scrive, lo stato resta dov'era. Lo stesso dato
ha quindi due significati a seconda di chi lo scrive, e l'incoerenza esce dalle due porte opposte.

**Scrivere la cesta su una riga `da_consegnare_deposito`.** La riga resta nel bacino di
`misuratoriDaScaricare()`, che filtra per stato. Al prossimo invio di rapportino di quell'esecutore
ricompare nella modale di scarico; se l'operatore dichiara un'altra cesta, `registraScarico()`
sovrascrive senza dire niente il numero che l'ufficio aveva corretto.

**Svuotare la cesta su una riga `scaricato_deposito`.** È il buco più grosso, ed è quello che nessuno
aveva visto. Lo stato non torna indietro: la riga resta `scaricato_deposito` **senza** cesta, cioè
esce dal bacino della modale **per sempre**. Il gesto pensato per dire «pardon, è ancora in furgone»
— così lo descrive il commento in `MisuratoriTabella.tsx` — è esattamente quello che fa sparire il
contatore dal giro. Nessuno lo chiederà mai più all'operatore.

Verificato in produzione il 04/08/2026: esiste **una** riga con cesta valorizzata e stato
`da_consegnare_deposito`, contro le 149 nate dal flusso dell'operatore, tutte `scaricato_deposito`.

### L'obiezione che non regge

«Se la cesta scritta dall'ufficio muove lo stato, l'ufficio dichiara al posto dell'operatore.» Vero
in astratto, ininfluente qui: nella stessa riga di tabella c'è già la tendina dello stato, e portare
`da_consegnare_deposito` → `scaricato_deposito` è un click, aperto a chiunque abbia il registro (il
gate `admin_plus` protegge solo la regressione). Non si concede un potere nuovo — si rende coerente
un gesto che l'ufficio ha già.

## L'invariante

> **`cesta` valorizzata ⟹ lo stato è almeno `scaricato_deposito`.**

Una frase, e il resto ne discende. Il verso opposto NON vale, di proposito: uno stato avanzato non
implica una cesta. Righe `scaricato_deposito` senza cesta restano legittime — è il pregresso
pre-migration, e più in generale la §4, dove oltre lo scarico svuotare la cesta non ha «nessun
effetto» sullo stato. Vale solo su `acqualatina_misuratori_rimossi`: il registro ACEA non ha la
colonna, e la PATCH lo respinge già con un 400.

Detta al contrario, che è il modo in cui si legge in magazzino: **un numero di cesta è la prova che
quel contatore è in deposito.** Se il numero c'è, lo stato non può dire «da consegnare»; se lo stato
dice «da consegnare», il numero non può esserci.

## Le decisioni

### 1. La cesta scritta dall'ufficio è uno scarico registrato

Quando l'ufficio scrive un numero di cesta su una riga `da_consegnare_deposito`, sta registrando uno
scarico **avvenuto**: l'operatore ha scaricato ma non l'ha dichiarato — ha risposto «no, domani», era
offline, ha chiuso la modale — e lo comunica a voce o per messaggio. La scrittura porta quindi lo
stato a `scaricato_deposito`.

Il motivo è fisico prima che informatico: la cesta sta in magazzino. Se un contatore è in una cesta,
è in deposito. Non esiste il caso «so in quale cesta è, ma non è ancora arrivato».

### 2. Svuotare la cesta riporta indietro lo stato

Simmetrico, e chiude il buco peggiore: `{ cesta: '' }` su una riga `scaricato_deposito` la riporta a
`da_consegnare_deposito`. La riga rientra nel bacino e la sera dopo l'operatore se la ritrova nella
modale, fra gli arretrati — che è esattamente il meccanismo che la spec del 3 agosto aveva costruito
per il caso «oggi non l'ho fatto».

**Questa regressione non passa dal gate `admin_plus`**, a differenza di quella esplicita dalla
tendina. Chi è autorizzato a scrivere la cesta è autorizzato a disfare la propria scrittura: chiedere
un admin per annullare un gesto che si è appena fatti da soli lascerebbe il buco aperto nel
frattempo, ed è nel frattempo che il contatore sparisce.

### 3. La regressione esplicita a «da consegnare» svuota la cesta

Terza porta, e la più probabile origine della riga trovata in produzione: un `admin_plus` riporta lo
stato indietro dalla tendina e la cesta resta scritta. L'invariante si rompe di nuovo, dall'altro
lato.

Quindi: `stato → 'da_consegnare_deposito'` azzera `cesta`. Il numero rimasto lì è per definizione
falso — si è appena dichiarato che quel contatore **non** è in deposito — e un riferimento falso in
magazzino costa più di un riferimento assente.

### 4. L'implicazione vale solo dal gradino giusto

Le regole 1 e 2 muovono lo stato **solo** fra i due gradini adiacenti:

| Stato corrente | Cesta valorizzata | Cesta svuotata |
|---|---|---|
| `da_consegnare_deposito` | → `scaricato_deposito` | *(niente da fare)* |
| `scaricato_deposito` | *(sola correzione di cifra)* | → `da_consegnare_deposito` |
| `verificato_deposito` | *(sola correzione)* | *(nessun effetto)* |
| `in_consegna_committente` | *(sola correzione)* | *(nessun effetto)* |
| `consegnato_committente` | *(sola correzione)* | *(nessun effetto)* |

Oltre `scaricato_deposito` la logistica è andata avanti: correggere una cifra non deve tirare
indietro una riga già verificata, e togliere un numero non deve far tornare di tre gradini un
misuratore già consegnato al committente. Il caso più frequente in assoluto — correggere un refuso su
una riga già scaricata — non tocca niente, che è il comportamento di oggi.

### 5. Lo stato esplicito batte quello implicito

Se il corpo della PATCH contiene sia `stato` sia `cesta`, vince `stato`: lo implicito si applica solo
quando quello esplicito non c'è. Un corpo che chiedesse insieme `da_consegnare_deposito` e una cesta
valorizzata è contraddittorio — vince lo stato, e la cesta si azzera per la regola 3.

La UI non manda mai i due campi insieme; la regola serve perché la funzione sia definita su tutti gli
ingressi, non perché il client ne abbia bisogno.

### 6. La modale dell'operatore NON cambia

Era una delle strade sul tavolo — che `misuratoriDaScaricare()` saltasse le righe con una cesta già
scritta — ed è stata scartata perché **sarebbe dannosa**.

Con l'invariante tenuto da tutti e tre gli scrittori, la coppia (cesta valorizzata +
`da_consegnare_deposito`) non si forma più. Ma se un giorno si riformasse, quella riga **deve** tornare
nella modale: un filtro `cesta IS NULL` la seppellirebbe esattamente come il buco che questa spec
chiude. Il filtro giusto resta quello che c'è, lo stato.

Cade anche il bisogno di toccare la sovrascrittura in `registraScarico()`: quello che l'ufficio ha
scritto non è più nel bacino, quindi non c'è più niente da sovrascrivere in silenzio.

### 7. Niente dialogo di conferma: si vede e si legge

Il gesto più frequente è correggere un refuso su una riga già scaricata, dove non cambia niente: un
dialogo lì sarebbe attrito puro. E nei due casi in cui lo stato si muove, l'ufficio sta facendo
proprio quello che intendeva — una conferma sull'esito voluto è rumore.

L'effetto non resta però nascosto: la colonna Stato cambia sotto gli occhi e un toast lo dice a
parole. Sono le due cose che rendono l'azione reversibile per conoscenza invece che per dialogo.

### 8. L'invariante sta nel codice, non nel DB

Un `CHECK (cesta IS NULL OR stato <> 'da_consegnare_deposito')` varrebbe per qualunque scrittore,
anche per una query in console — ma non si può nemmeno aggiungere finché la riga in produzione lo
viola, e un trigger porterebbe la regola lontano dagli occhi di chi legge il codice.

Gli scrittori sono tre, stanno tutti in questo repo e sono tutti sotto test. Nessuna migration.

## L'architettura

### Logica pura (testabile senza DB)

`lib/misuratori/cestaStato.ts`

```ts
statoDopoCesta(statoCorrente: StatoMisuratore, cestaNuova: string | null): StatoMisuratore | null
```

`null` = non toccare lo stato. Quattro rami, la tabella della §4 per intero. Vive in un file suo per
lo stesso motivo di `lib/acqualatina/ceste.ts`: è la regola che deve restare vera anche quando la
cella della tabella verrà riscritta, e provarla non deve costare un database.

La regola 3 è invece una riga sola (`stato → da_consegnare_deposito` implica `cesta = null`) e resta
inline in `aggiornaRegistro`, dove si legge accanto al blocco che valida lo stato.

### Server

`lib/misuratori/registro.ts` → `aggiornaRegistro()`, solo per `acqualatina_misuratori_rimossi`:

1. `'cesta' in body` → si legge lo stato corrente della riga (una `maybeSingle`, la stessa lettura
   che il ramo non-`admin_plus` fa già) e si applica `statoDopoCesta`. Il risultato finisce in
   `patch.stato` **solo se** non c'è già uno stato esplicito (§5), e **senza** passare dal gate
   `admin_plus` (§2).
2. `patch.stato === 'da_consegnare_deposito'` → `patch.cesta = null` (§3).
3. La risposta diventa `{ ok: true, stato?, cesta? }`: lo stato quando lo muove l'implicito o la
   regressione, la cesta quando la regressione la azzera. Additiva: il registro ACEA usa lo stesso
   handler e semplicemente non riceve mai questi campi.

Se la riga non esiste (zero righe, nessun errore), la lettura torna vuota, lo stato implicito non
si calcola e l'UPDATE non aggancia niente — cioè quello che succede già oggi. Se invece la lettura
FALLISCE (rete, singhiozzo PostgREST), `aggiornaRegistro` rifiuta la scrittura con **500** e il
messaggio dell'errore, come già fa per l'errore della UPDATE: ingoiarla e trattarla come riga
assente scriverebbe la sola cesta senza stato — la stessa incoerenza che questa spec chiude, e in
silenzio. Vale per ENTRAMBI i chiamanti della lettura, compreso il gate `admin_plus` del punto 1,
che senza questa distinzione sarebbe fail-open su un errore di rete.

**Concorrenza.** La lettura-poi-scrittura non è atomica. È la stessa corsa che il gate `admin_plus`
ha già oggi. La UI serializza per riga con `salvando` — disabilitato su input e bottone di Cesta e
di Pallet, oltre che sulla tendina di Stato — quindi due PATCH sulla stessa riga non partono più in
parallelo dallo stesso client; resta la corsa se due richieste arrivano comunque ravvicinate (rete,
un secondo client), e il caso perdente è un misuratore che finisce nello stato che l'altra
scrittura voleva. Non vale una transazione.

### Client ufficio

`MisuratoriClient.tsx` → `handlePatch`: la risposta è già letta per il ramo d'errore; sul successo
si fondono nella riga `stato` e `cesta`, quando il server li ha decisi da sé (niente refetch — la
scelta di non rifare la fetch quando va bene resta) e si mostra il toast:

- «Cesta 2 · il misuratore risulta **scaricato a deposito**.» — scrittura della cesta (§1).
- «Cesta tolta · il misuratore torna fra quelli **da scaricare**.» — svuotamento (§2).
- «Cesta tolta · il misuratore non risulta più in deposito.» — regressione esplicita dalla
  tendina (§3). Scatta solo se la riga aveva già una cesta (`cestaPrima`, letta PRIMA
  dell'ottimistica): senza la guardia ogni regressione di stato annuncerebbe una rimozione anche
  su una riga che una cesta non l'aveva mai avuta.

Colonne, filtri, PDF, `Ricalcola` e l'assegnazione del pallet non cambiano.

## Il pregresso in produzione

La riga incoerente esistente non si ripara da sé: il codice nuovo tiene l'invariante da qui in avanti,
non riscrive lo storico.

Proposta: portarla a `scaricato_deposito`. Qualcuno ha digitato quel numero di proposito, e
quell'informazione vale più dell'assenza di una dichiarazione dell'operatore. L'alternativa —
svuotare la cesta e lasciare che l'operatore la ridichiari — perde un dato vero per rispettare una
procedura.

**La decisione si prende guardando la riga** (matricola, esecutore, data, quando è stata aggiornata),
e **nessuna scrittura in produzione parte senza un ok esplicito**. I dati di quella riga non entrano
in commit, PR o documenti: questo repo è pubblico.

## Cosa NON si fa

- **Nessuna migration, nessun CHECK, nessun trigger.** Vedi §8.
- **Nessun filtro `cesta IS NULL` nella modale dell'operatore.** Vedi §6: chiuderebbe il buco
  sbagliato.
- **Nessun dialogo di conferma.** Vedi §7.
- **Nessun nuovo stato logistico.** I cinque bastano, come bastavano il 3 agosto.
- **Niente su ACEA.** Non ha la colonna e la PATCH la respinge già.

## Verifica

- `lib/misuratori/cestaStato.test.ts` — tabella di verità completa: 5 stati × {valore, vuoto}, più il
  caso «lo stato esplicito vince».
- Guardie di forma sul sorgente di `registro.ts`, nello stile di `palletCellaShape.test.ts`: la
  regressione esplicita azzera la cesta; lo stato implicito non passa dal gate `admin_plus`; la
  risposta porta lo stato risultante.
- Un test che la regola resti confinata ad AcquaLatina (la guardia a 400 su `misuratori_rimossi`
  esiste già e non deve cadere).
- Un test che `misuratoriDaScaricare()` continui a filtrare **per stato** e non per cesta (§6): è la
  decisione più facile da rovesciare per sbaglio leggendo solo il titolo di questa spec.
- Prova sui dati veri dopo il deploy: scrittura della cesta su una riga `da_consegnare_deposito` →
  stato e toast; svuotamento → ritorno indietro; e la riga che ricompare nella modale al giro
  successivo.
