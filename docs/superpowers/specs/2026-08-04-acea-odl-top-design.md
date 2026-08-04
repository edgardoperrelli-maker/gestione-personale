# ODL TOP — dal dunning ACEA al rapportino dell'operatore

**Data:** 2026-08-04 · **Stato:** approvato, da implementare

## Il problema

ACEA segnala certe attività come **TOP**: ordini che vogliono lavorati per primi. Oggi quella
segnalazione muore in ufficio — arriva per telefono o per mail, chi pianifica se la ricorda, e
l'operatore che apre il rapportino vede una voce identica a tutte le altre. L'unico canale
esistente è la colonna **Note**, che è prosa libera: buona per «citofonare interno 4», inadatta a
una proprietà dell'ordine su cui si vuole ordinare e filtrare.

## Cosa si costruisce

L'ufficio marca uno o più ODL come TOP dalla tabella del dunning; l'operatore se li trova
**evidenziati e in cima** alla lista del rapportino.

Fuori scope, deciso esplicitamente: nota obbligatoria sui TOP non eseguiti, filtro e conteggio
«solo TOP» in ufficio, marcatura dalla vista AcquaLatina.

## Decisioni

### 1. Il flag vive sul registro, non sulla voce

Colonna `top boolean not null default false` su `acea_ordini`.

La alternativa era fotografarlo dentro `rapportino_voci.raw_json` all'ingresso, come fa la nota
dell'ufficio (`sincronizzaRapportiniAcea`). È stata scartata per una ragione precisa: il TOP deve
valere **anche sugli ODL già in mano all'operatore**. ACEA segnala un ordine urgente a giro già
partito, ed è esattamente il caso per cui la funzione esiste. Un valore fotografato all'ingresso
non si aggiorna mai.

**La colonna va su ENTRAMBE le tabelle del registro** — `acea_ordini` e `acqualatina_ordini`.
Non è simmetria estetica: le due tabelle hanno la stessa forma e `app/api/acea/ordini/route.ts`
usa **una sola lista di colonne** per leggerle. Aggiungerla a una sola farebbe fallire la query
dell'altra, cioè spegnerebbe il registro AcquaLatina. Il bottone resta comunque solo sulle viste
ACEA: la colonna di là esiste e vale `false`.

Indice parziale `(odl) where top`: le righe TOP sono poche decine su migliaia, e la domanda è
sempre «quali di questi ODL sono TOP».

### 2. Sopravvive agli import, muore con l'annullamento

`applicaImport` scrive solo le colonne che arrivano dall'export ACEA, quindi una colonna nostra
non viene toccata dal reimport — è già così che la colonna `note` resiste da mesi.

L'eccezione è dichiarata: gli ordini **annullati** vengono cancellati dal registro
(`applicaImport`, passo 1), e il flag muore con la riga. Se ACEA rigenera quell'ODL va rimarcato.
Non si costruisce niente per evitarlo: sarebbe una tabella di lapidi per un caso raro.

### 3. Un ODL con più operazioni: basta una riga TOP

La chiave del registro è `(odl, numero_operazione)`, mentre l'operatore ha in mano il solo ODL.
Regola: **almeno una riga TOP ⇒ la voce è TOP**. Così l'ufficio non deve sapere quale operazione
marcare, ed è la stessa semantica con cui la nota viene già risolta per ODL.

### 4. Si marca in blocco, non cella per cella

Le spunte della tabella esistono già. Nella barra della selezione due bottoni: **«Segna TOP»** e
**«Togli TOP»**. Nessuna cella cliccabile: è stato valutato e scartato: un secondo modo di
scrivere lo stesso campo si paga in codice e diverge alla prima modifica.

`POST /api/acea/ordini/top` — corpo `{ chiavi: ['odl|numero_operazione', …], top: boolean }`,
`requireAdmin()`. Stessa forma di chiave e stessa platea di `/api/acea/celle`, che è il precedente
per la scrittura d'ufficio sul registro.

La scrittura è ottimistica con **rollback per riga** (non per fotografia: un `setRows(prima)`
si porterebbe via anche i cambi fatti su altre righe mentre la POST è in volo) e toast col
conteggio. Lascia una riga in `audit_azioni` via `lib/audit/registra.ts`: chi ha marcato cosa si
sa, senza una tabella di storico.

### 5. Ambra, e non solo ambra

Riga TOP con sfondo `--status-warn-soft` e badge **«TOP»** nella cella ODL.

Il rosso era escluso in partenza: nel dunning significa già revoca da verificare e ordine scaduto.
L'ambra ha un costo accettato consapevolmente — nella colonna Scadenza `--status-warn` significa
«scade oggi», quindi sulla stessa riga il colore dice due cose in due punti. Il badge testuale è
la contromisura: **il significato non dipende dalla sola tinta**, per chi legge in fretta e per
chi non distingue i colori. La spunta viola vince sull'ambra mentre si seleziona, come già fa il
rossastro delle revoche.

### 6. L'operatore: badge, e le voci TOP in cima

`app/r/[token]/page.tsx` raccoglie gli ODL delle voci e fa **una** query
(`odl in (…) and top = true`) → un `Set<string>`. È una lettura accessoria e **resiliente** come
le altre già presenti (note tramandate, ODL positivi): se fallisce non c'è badge e il rapportino
funziona lo stesso. Un flag decorativo non può impedire a un operatore di lavorare.

- `VoceCard`: badge «TOP» ambra in testa alla card.
- `RapportinoLista`: etichetta TOP sulla riga, e **le voci TOP per prime**. L'ordinamento è
  **stabile**: dentro il gruppo TOP resta l'ordine del giro, che è l'ordine geografico con cui
  l'operatore si muove.

Offline: il flag è quello dell'ultimo caricamento della pagina. Limite dichiarato — senza rete non
esiste un modo di saperlo, e la PWA continua a funzionare con l'ultimo stato noto.

## Test

Funzioni pure in `lib/acea/top.ts`, con i loro test:
- `odlTop(righe)` → `Set<string>`, con la regola «almeno una riga».
- `ordinaTopPrima(voci, top)` → ordinamento stabile, verificato su un caso in cui due TOP
  mantengono l'ordine relativo di partenza.

Test di forma sulla migration (colonna su entrambe le tabelle, indice parziale, `default false`)
e sul client (i due bottoni esistono, l'endpoint è quello giusto, il rollback è per riga).

## File toccati

| Area | File |
|---|---|
| DB | `supabase/migrations/20260804110000_acea_ordini_top.sql` |
| Puro | `lib/acea/top.ts` (+ test) |
| Lettura registro | `app/api/acea/ordini/route.ts` (colonna `top` nella select), `lib/acea/colonneTabella.ts` (`RigaTabella.top`) |
| Scrittura | `app/api/acea/ordini/top/route.ts` |
| Tabella | `components/modules/acea/TabellaOrdini.tsx` (riga ambra + badge) e la barra delle azioni sulla selezione, dove vivono già le altre azioni di blocco |
| Operatore | `app/r/[token]/page.tsx`, `components/modules/rapportini/VoceCard.tsx`, `components/modules/rapportini/RapportinoLista.tsx` |
| Docs | `AGENTS.md` |
