# Misuratori rimossi AcquaLatina — lo scarico in cesta lo dichiara l'operatore

> Spec di design. Task ATLAS `70d360ae-0228-47f9-a958-aee428524f45`.
> Data: 2026-08-03.

## Il problema

Il registro `acqualatina_misuratori_rimossi` sa **cosa** è stato smontato (lo scrive la chiusura del
rapportino) e sa **dove va a finire** quando la cesta si riempie (il `pallet`, che assegna l'ufficio).
Fra i due c'è un buco: **in quale cesta del magazzino è finito quel contatore**. Oggi lo sa solo
l'operatore che ce l'ha messo, e lo sa finché se lo ricorda.

Il costo del buco è concreto: a cesta piena l'ufficio deve impallettare, e per farlo deve sapere
quali matricole ci sono dentro. Senza il dato, o si apre la cesta e si leggono i contatori a mano,
o si impalletta a memoria.

## Il flusso, come l'ha disegnato ATLAS

```
invio rapportino (SOLO AcquaLatina)
  └─ «Stai scaricando i misuratori?»
       ├─ SÌ  → «In quale cesta li stai mettendo?» → il registro si popola con la cesta
       └─ NO  → li scarico domani → domani la richiesta torna, con i misuratori di oggi E di ieri
```

Il momento è quello giusto: l'operatore ha appena finito il giro, il furgone è pieno di contatori
smontati e sta rientrando. Chiederglielo il giorno dopo dal back office significa chiederlo a
qualcuno che non ha più i contatori in mano.

## Le decisioni

### 1. La cesta è una colonna del registro, gemella del pallet

`cesta text` su `acqualatina_misuratori_rimossi`. **Text e non integer**, per lo stesso motivo del
`pallet`: è un *riferimento*, non una quantità — se il magazzino domani numera «A1» o «12-bis» deve
poterci stare senza una migration, e gli zeri di testa non devono sparire.

Nullable, e l'assenza **È** l'informazione: `cesta IS NULL` = non ancora scaricato.

Solo AcquaLatina. Il registro ACEA ha il suo ciclo logistico e nessuno ha chiesto le ceste lì: se un
giorno servirà, sarà la stessa colonna sulla sua tabella — come è successo al pallet, che è nato
di qua ed è passato di là quando è servito davvero.

### 2. Dichiarare la cesta È lo scarico a deposito

Gli stati logistici esistono già (`types/misuratori.ts`) e uno di essi dice esattamente questo:
`scaricato_deposito`. Quindi la conferma dell'operatore fa **due cose insieme** — scrive `cesta` e
porta lo stato a `scaricato_deposito`. Non si inventa un sesto stato per un passaggio che il
vocabolario del registro sa già nominare.

Effetto collaterale voluto: l'ufficio vede il magazzino riempirsi in diretta, senza spuntare nulla.

### 3. «Di oggi e di ieri» = tutto quello che è ancora `da_consegnare_deposito`

Il flowchart dice «oggi e ieri». La regola vera, che lo comprende, è: **tutti i misuratori di
quell'operatore che il registro ha ancora come `da_consegnare_deposito`**, qualunque sia la loro
data. Se l'operatore dice «no» per tre giorni di fila, al quarto se li ritrova tutti — «ieri» non è
un limite, è il caso normale.

La lista arriva divisa in **oggi** (la data del rapportino appena chiuso) e **arretrati**, perché è
la distinzione che l'operatore ha in testa quando guarda il furgone.

Il legame operatore↔misuratore è `acqualatina_misuratori_rimossi.esecutore`, che nasce da
`rapportini.staff_name`: stessa sorgente, confronto esatto.

### 4. Il «no» non scrive niente

«No, li scarico domani» chiude la modale e basta. Nessun flag «rimandato», nessuna data di rinvio:
lo stato `da_consegnare_deposito` significa già «da scaricare», e domani la domanda torna da sé
perché la riga è ancora lì. Un campo in più sarebbe uno stato da tenere sincronizzato con un altro
che dice la stessa cosa.

### 5. Le ceste «da X a Y» si configurano, non si cablano

Il numero delle ceste in magazzino è un dato del magazzino, non del codice. Nuova tabella singleton
`acqualatina_ceste` (`numero_min`, `numero_max`), modificabile dall'ufficio in
**AcquaLatina → Strumenti**.

Con l'intervallo configurato l'operatore sceglie da un **menu di numeri** — su un telefono è un tap
invece di una digitazione, e un refuso su un numero di cesta è un contatore che non si ritrova più.
Senza intervallo configurato (stato iniziale) il campo resta **libero**: il modulo funziona dal
primo giorno, la configurazione lo rende solo più stretto.

Il valore fuori intervallo **non blocca**: se il magazzino aggiunge una cesta prima che l'ufficio
aggiorni la configurazione, la realtà vince sul nostro campo. Passa con un avviso.

### 6. La selezione è per riga, tutte spuntate

La modale elenca i misuratori con una spunta per riga, tutte accese. Il gesto normale è «li scarico
tutti» e con le spunte già accese costa zero; ma l'operatore che ne scarica una parte (o che ne ha
uno rotto in furgone) non è costretto a mentire. È la stessa forma che l'ufficio ha già nel
registro per assegnare il pallet in blocco.

### 7. Offline: la domanda arriva quando c'è rete

L'invio del rapportino può finire in coda offline. In quel caso la modale **non compare**: non c'è
modo di sapere quali misuratori sono a registro senza il server. I contatori restano
`da_consegnare_deposito` e ricompaiono come arretrati al primo invio andato a buon fine.

È un limite dichiarato, non un buco: il meccanismo degli arretrati esiste apposta e copre già il
caso «oggi non l'ho fatto».

## L'architettura

### Dato

| Dove | Cosa |
|---|---|
| `acqualatina_misuratori_rimossi.cesta` | `text`, nullable — la cesta di quel misuratore |
| `acqualatina_ceste` | riga singleton `(numero_min, numero_max)` — l'intervallo del magazzino |

Migration additiva, retro-compatibile: codice vecchio + colonna nuova = nessun effetto; codice nuovo
+ migration non applicata = le letture degradano (vedi §Resilienza).

### Logica pura (testabile senza DB)

`lib/acqualatina/ceste.ts`
- `partizionaDaScaricare(righe, dataOggi)` → `{ oggi, arretrati }`
- `numeriCesta(config)` → l'elenco dei numeri selezionabili (`[]` = campo libero)
- `validaCesta(valore, config)` → `{ ok, fuoriIntervallo }` — mai un `false` che blocca

### Server

- `GET  /api/r/[token]/scarico-misuratori` → `{ mostra, oggi[], arretrati[], ceste }`
  Risponde `mostra: false` se il rapportino non è AcquaLatina o non c'è niente da scaricare.
- `POST /api/r/[token]/scarico-misuratori` `{ ids[], cesta }` → scrive `cesta` + `scaricato_deposito`

Entrambe ri-derivano l'operatore **dal token**, mai dal corpo della richiesta, e toccano solo righe
`esecutore = <operatore del token>` **e** `stato = 'da_consegnare_deposito'`. Gli `ids` del client
sono un filtro, non un'autorizzazione.

- `GET/PUT /api/acqualatina/ceste` → la configurazione (PUT riservato agli admin)

### Client operatore

`ModaleScaricoMisuratori` — due passi:
1. **«Stai scaricando i misuratori?»** con la lista (matricola · ODS/ODL · via), oggi e arretrati
   separati. Due vie d'uscita: *Sì, li sto scaricando* / *No, li scarico domani*.
2. **«In quale cesta li stai mettendo?»** — menu dei numeri o campo libero, conferma.

Si monta dopo un invio riuscito **online**, in `RapportinoForm`.

### Client ufficio

Il registro `/hub/acqualatina/misuratori` guadagna la colonna **Cesta** (editabile in cella come il
pallet: un errore si corregge senza chiamare l'operatore), il **filtro per cesta** e la colonna nel
**PDF**. Questa è l'auto-popolamento del nodo n9 del flowchart: l'ufficio non digita niente, il dato
arriva dal campo.

`AcquaLatina → Strumenti` guadagna la card **Ceste di magazzino** con l'intervallo.

### Resilienza

Stessa regola del resto del modulo: la colonna nuova si legge in modo degradante, e il registro
resta vivo se la migration non è ancora passata. Il `Ricalcola` non tocca `cesta` (inserisce,
cancella e corregge date — non riscrive le colonne logistiche), quindi un ricalcolo non svuota il
magazzino.

## Cosa NON si fa

- **Nessuna coda offline per lo scarico.** Vedi §7: gli arretrati lo coprono.
- **Nessun nuovo stato logistico.** `scaricato_deposito` c'è già e dice questo.
- **Nessuna cesta su ACEA.** Ciclo diverso, nessuna richiesta.
- **Nessun promemoria push/notifica.** Il flowchart chiede una domanda all'invio, non un sistema di
  solleciti.

## Verifica

- Logica pura sotto test (`lib/acqualatina/ceste.test.ts`): partizione oggi/arretrati sui confini di
  data, elenco numeri, validazione fuori intervallo.
- Forma della migration sotto test (`lib/acqualatina/cesteMigrationShape.test.ts`), come le gemelle
  già in repo.
- Prova end-to-end sui dati veri: un rapportino AcquaLatina chiuso in positivo → la modale elenca i
  contatori → conferma su una cesta → il registro mostra cesta e stato.
