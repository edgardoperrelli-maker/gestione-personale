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
effetto» sullo stato. Vale solo su `acqualatina_misuratori_rimossi`.

**Aggiornamento — la fusione cesta/pallet (PR #222, stesso giorno).** Quando questa frase è stata
scritta, «vale solo su AcquaLatina» era garantito gratis: ACEA non aveva la colonna, e la PATCH la
respingeva con un 400. Da quando `pallet` è stato rinominato in `cesta`, la colonna c'è su
ENTRAMBI i registri — quella difesa è caduta, e il gate `tabella ===
'acqualatina_misuratori_rimossi'` va scritto a mano in ogni ramo che applica l'invariante, cella e
barra (§9). Su ACEA la cesta resta un riferimento e basta, esattamente come prima.

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

Con l'invariante tenuto da tutti e quattro gli scrittori (§9), la coppia (cesta valorizzata +
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

Gli scrittori erano tre a questa riga; il §9 aggiunge il quarto. Stanno tutti in questo repo e
sono tutti sotto test. Nessuna migration.

### 9. La barra applica la STESSA cosa, in blocco — con una conferma che la cella non ha

Decisione presa dopo il resto di questa spec, e ne ribalta un pezzo. `assegnaCesta` (la funzione
dietro `POST .../misuratori/cesta`, la barra della selezione) scriveva un riferimento e basta,
ovunque: «l'ufficio che corregge un numero non sta dicendo che quel contatore è appena arrivato in
magazzino», diceva il commento originale in cima alla funzione. Non regge più: stessa colonna,
stesso significato, anche quando la scrittura è in blocco. Scrivere o svuotare la cesta dalla
barra applica `statoDopoCesta` come la cella — ma SOLO su AcquaLatina, mai su ACEA.

La differenza dalla cella non è nella regola: è nella CONFERMA. La cella (§7) non ne chiede
perché il gesto è su una riga sola, guardata apposta — vale ancora, e non si estende qui per
simmetria. La barra invece sì, perché la spunta di testa prende tutte le righe VISIBILI sotto i
filtri correnti: una selezione larga può includere righe che nessuno ha guardato una per una.
Scrivere «5» su trenta righe spuntate in fretta può far avanzare lo stato di alcune di esse senza
che chi ha cliccato se ne accorga — sulla cella l'effetto è sotto gli occhi (una riga, un colore
che cambia), sulla barra no. Quindi la barra DICHIARA PRIMA quante righe cambieranno stato e in
che verso, con lo stesso dialogo che già copriva la sovrascrittura di una cesta diversa già
scritta — unificato in UN popup solo quando le due condizioni scattano insieme: due dialoghi in
fila per un click solo sarebbero stati un attrito peggiore di uno solo. A scrittura riuscita, il
toast conferma il numero vero tornato dal server.

Tecnicamente, una sola UPDATE non basta più: la selezione può mescolare righe su gradini diversi,
quindi la scrittura deve leggere prima, raggruppare per stato risultante e scrivere un gruppo alla
volta — vedi "Server — assegnazione in blocco", sotto.

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
ha già oggi. Sulle celle che toccano stato e cesta — Stato, Cesta e Pallet, non le Note, che non
partecipano all'invariante e restano libere di partire durante il volo di una PATCH di cesta — la
UI serializza per riga con `salvando`: l'input si disabilita, la tendina di Stato si disabilita, e
il bottone di Cesta/Pallet resta focusabile ma rifiuta il click (`aria-disabled` con guardia
nell'`onClick`, non `disabled`: un bottone nativamente disabilitato non riceve mai il focus che il
ritorno a fine editing gli deve). Quindi due PATCH su stato o cesta della stessa riga non partono
più in parallelo dallo stesso client; resta la corsa se due richieste arrivano comunque ravvicinate
(rete, un secondo client), e il caso perdente è un misuratore che finisce nello stato che l'altra
scrittura voleva. Non vale una transazione.

### Server — assegnazione in blocco

`lib/misuratori/registro.ts` → `assegnaCesta()`, la funzione dietro `POST .../cesta` (barra della
selezione, gemella su ACEA e AcquaLatina, §9). Stesso gate della cella
(`tabella === 'acqualatina_misuratori_rimossi'`), ma una complicazione che la cella non ha: la
selezione è un INSIEME di righe, e righe diverse possono stare su gradini diversi — una singola
UPDATE con un `patch.stato` fisso non può servirle tutte.

Solo dove il gate è acceso:

1. Si LEGGONO gli stati correnti delle righe selezionate — `select('id, stato').in('id', …)`, a
   blocchi di 200 come le UPDATE che seguono. Lettura FALLITA (non riga assente: stessa
   distinzione di `statoAttuale`) → **500** col messaggio dell'errore, e NESSUNA scrittura:
   ingoiarla scriverebbe la sola cesta senza stato su tutta la selezione — l'incoerenza di questa
   spec, moltiplicata per il blocco.
2. Ogni riga passa da `statoDopoCesta(stato, cestaNuova)`: il risultato (o l'assenza di un
   cambio) è la chiave con cui le righe si RAGGRUPPANO.
3. Una UPDATE per gruppo, non per riga: chi non cambia stato riceve `{ cesta }`, chi lo cambia
   riceve `{ cesta, stato }`. Su ACEA (gate spento) il gruppo è uno solo, e la UPDATE è quella di
   sempre — nessuna lettura, nessuna deduzione.
4. La risposta aggiunge `cambiStato` alla forma esistente `{ ok, aggiornati, cesta }`: quante
   righe, fra quelle scritte, hanno anche cambiato stato. Additiva — su ACEA resta sempre 0.

### Client ufficio

`MisuratoriClient.tsx` → `handlePatch` (la cella): la risposta è già letta per il ramo d'errore;
sul successo si fondono nella riga `stato` e `cesta`, quando il server li ha decisi da sé (niente
refetch — la scelta di non rifare la fetch quando va bene resta) e si mostra il toast:

- «Cesta 2 · il misuratore risulta **scaricato a deposito**.» — scrittura della cesta (§1).
- «Cesta tolta · il misuratore torna fra quelli **da scaricare**.» — svuotamento (§2).
- «Cesta tolta · il misuratore non risulta più in deposito.» — regressione esplicita dalla
  tendina (§3). Scatta solo se la riga aveva già una cesta (`cestaPrima`, letta PRIMA
  dell'ottimistica): senza la guardia ogni regressione di stato annuncerebbe una rimozione anche
  su una riga che una cesta non l'aveva mai avuta.

`handleAssegnaCesta` (la barra, §9): PRIMA di partire, conta quante righe della selezione
cambierebbero stato con `statoDopoCesta` — pura, importabile anche lato client — gated sulla prop
esplicita `cestaDichiaraScarico` (accesa solo dalla pagina AcquaLatina, MAI dedotta da `apiBase`:
due stringhe di endpoint non sono un contratto leggibile quanto un flag dichiarato dalla pagina).
Se il conteggio è maggiore di zero, oppure se la selezione contiene righe con una cesta diversa
già scritta (la conferma di sovrascrittura preesistente), si apre UN dialogo solo — mai due in
fila quando le due condizioni scattano insieme — che dice il numero e il verso: «N misuratori
risulteranno scaricati a deposito» quando si assegna, «torneranno fra quelli da scaricare» quando
si toglie. A scrittura riuscita il toast riporta anche `cambiStato`, il numero vero tornato dal
server, quando è maggiore di zero.

Colonne, filtri, PDF e `Ricalcola` non cambiano. L'assegnazione in blocco della cesta invece sì
(§9): è il quarto scrittore dell'invariante, e su ACEA resta bit per bit quella di sempre — il
gate è la garanzia, non una coincidenza.

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
- **Nessun dialogo di conferma sulla cella.** Vedi §7 — resta la scelta originale. La barra
  (§9) un dialogo ce l'ha, ma per un motivo che sulla cella non esiste: lì la selezione può
  contenere righe che nessuno ha guardato una per una; qui il gesto è deliberato, su una riga
  sola. Non è un'incoerenza da sanare: sono due gesti diversi.
- **Nessun nuovo stato logistico.** I cinque bastano, come bastavano il 3 agosto.
- **Niente sull'invariante su ACEA.** La colonna oggi c'è su entrambi i registri (fusione
  cesta/pallet, PR #222) e la PATCH non la respinge più con un 400 — quella difesa non è più
  gratuita, ed è gated a mano (§9, e la nota in "L'invariante"). Ma la cesta resta un
  riferimento e basta: nessuna lettura, nessuna deduzione, lo stato non si muove.

## Verifica

- `lib/misuratori/cestaStato.test.ts` — tabella di verità pura di `statoDopoCesta`: 5 stati ×
  {valore, vuoto}. Non contiene il caso «lo stato esplicito vince»: la funzione è pura e non vede
  affatto lo stato esplicito della PATCH, quindi non può testarlo.
- `lib/misuratori/registroCesta.test.ts` — test di COMPORTAMENTO su `aggiornaRegistro` (la cella):
  guarda il `patch` passato alla UPDATE e il corpo della risposta, non il sorgente. È il presidio
  più forte sull'invariante — copre lo stato esplicito che vince sull'implicito, la regressione che
  azzera la cesta (anche quando `cesta` arriva nello STESSO corpo della regressione, cioè l'ordine
  dei due blocchi in `registro.ts`), il comportamento su ACEA (cesta scritta, stato mai toccato) e
  i 500 a lettura fallita (sia sul ramo cesta sia sul gate `admin_plus`).
- `lib/misuratori/assegnaCestaInvariante.test.ts` — lo stesso mestiere, per `assegnaCesta` (la
  barra, §9): blocco compatto (tutte le righe sullo stesso gradino), selezione MISTA — stati
  diversi nella stessa chiamata, il caso che una UPDATE sola non può servire, ed è quello che
  conta di più — ACEA senza nessuna lettura di stato, 500 a lettura fallita, e un blocco sopra i
  200 id per provare che lettura e scrittura restano a blocchi anche quando si raggruppa.
- `lib/misuratori/cestaInvarianteShape.test.ts` — guardie di forma sul sorgente di `registro.ts` e
  di `MisuratoriClient.tsx`: la regressione esplicita azzera la cesta; lo stato implicito non passa
  dal gate `admin_plus`; la risposta porta lo stato risultante (`aggiornaRegistro`) e `cambiStato`
  (`assegnaCesta`); il gate `tabella === 'acqualatina_misuratori_rimossi'` è scritto a mano in
  entrambe le funzioni (dal 2026-08-04 non è più gratuito, vedi la nota in "L'invariante"); che
  `misuratoriDaScaricare()` continui a filtrare **per stato** e non per cesta (§6) — è la decisione
  più facile da rovesciare per sbaglio leggendo solo il titolo di questa spec; che la barra chiami
  `chiediConferma` una volta sola (mai due dialoghi in fila, §9); e che la cella non la chiami
  affatto (§7).
- Prova sui dati veri dopo il deploy: scrittura della cesta su una riga `da_consegnare_deposito` →
  stato e toast, sia dalla cella sia dalla barra; svuotamento → ritorno indietro; una selezione
  mista dalla barra → il dialogo dice il numero giusto e il toast lo conferma; e la riga che
  ricompare nella modale al giro successivo.
