# AcquaLatina — l'Esito del rapportino al posto dello Stato, e le tab che lo seguono

**Data:** 2026-08-04 · **Stato:** approvato, da implementare

## Il problema

Nella vista `AcquaLatina › Pianificazione` la colonna **Stato** dice «Aperta» su quasi tutte le
righe: è lo stato che il nostro motore deriva, non quello che ha dichiarato chi è andato sul posto.
L'ufficio guarda quella colonna per sapere com'è finita un'uscita e non lo trova lì — il dato vero
sta nel rapportino, e in tabella non c'è.

E la tab non segue l'esito: oggi **qualunque** esito negativo lascia la riga in *Da lavorare*,
quindi un contatore che non si sostituirà mai resta in coda insieme a quelli da ripassare.

## Cosa si costruisce

1. La colonna **Stato** lascia il posto a **Esito**, che mostra la risposta del rapportino.
2. La tab segue l'esito: **SI e NO chiudono**, **NESSUN PASSAGGIO no**.

## La tensione col 03/08, e perché si scioglie

Il 03/08 la chiusura è stata cambiata apposta perché **nessun** esito negativo chiudesse: 12 righe
di via Tuccia esitate negative erano finite in *Chiusi*, e riassegnarle rispondeva «ordine già
chiuso» — lavoro vero, ancora da fare, che il registro dichiarava concluso.

Questa spec **non** ribalta quella decisione, la rende più fine. Sulla commessa AcquaLatina il
committente ha chiarito cosa significano le due risposte:

- **NO** = definitivo. Il contatore non c'è più, l'impianto è dismesso, l'utente rifiuta: non c'è
  niente da ripianificare, e tenere la riga in coda è rumore.
- **NESSUN PASSAGGIO** = nessuno ci è andato. È il caso che il 03/08 voleva proteggere, ed è quello
  che resta in *Da lavorare*.

L'intento di allora — non nascondere lavoro ancora da fare — resta intatto: cambia solo quale
risposta lo rappresenta.

## Decisioni

### 1. La colonna Esito, senza imbuto

In `COLONNE_ACQUALATINA` la chiave `stato` diventa `eseguito`, intestazione «Esito». Valori:
`SI`, `NO`, `NESSUN PASSAGGIO`, `—` (nessuno ci è ancora andato), resi con gli stessi toni del
modulo Interventi e delle massive — verde, rosso, e **smorzato** per il «nessun passaggio», che non
è un esito negativo ma un'uscita che non c'è stata.

Costo zero in lettura: la query su `rapportino_voci` che oggi serve `matricola_nuova` alla vista
AcquaLatina prende anche `eseguito`. Si accende l'estrattore già scritto (`serveEseguito`), non si
aggiunge una query — è la strada che il commento della route aveva già previsto.

**Si perde l'imbuto**, ed è un costo accettato: il valore non sta nel registro ma nelle risposte, e
un filtro che agisse sulle sole righe caricate direbbe una bugia sul conteggio (stessa ragione per
cui «Eseguito» nelle massive non ce l'ha). La distinzione grossa — fatto / da fare — la danno le
tab, che è come la tabella si guarda tutti i giorni.

### 2. La regola di chiusura legge la VOCE, non l'intervento

`interventi.esito` distingue solo *positivo* da *tutto il resto*: NO e NESSUN PASSAGGIO gli
arrivano identici, quindi da lì la regola nuova non è esprimibile.

La route arricchisce ogni intervento concluso con l'`eseguito` della sua voce e `gruppiChiusura`
decide su quello. Scartata l'alternativa di scrivere l'esito testuale su `interventi` all'invio del
rapportino: renderebbe il dato disponibile ovunque senza join, ma tocca schema e flusso d'invio per
un bisogno che oggi ha **un solo** consumatore.

| Esito nel rapportino | Stato scritto sulla riga | Tab |
|---|---|---|
| `SI` | `Chiusa — eseguita` | Chiusi |
| `NO` | **`Chiusa — non eseguita`** (nuovo) | **Chiusi** |
| `NESSUN PASSAGGIO` | `Aperta — non eseguita` | Da lavorare |
| nessuna risposta | invariata | Da lavorare |

Il positivo resta intoccabile: nessuna uscita successiva riapre una riga chiusa bene.

### 2-bis. Nasce un quarto stato, e la guardia va rifatta

Gli stati del registro erano tre; una riga chiusa **senza** che il lavoro sia stato fatto non ha un
nome. Ne serve uno: `STATO_CHIUSA_NON_ESEGUITA = 'Chiusa — non eseguita'`, con `aperto = false`,
`esito_positivo = false` e la data dell'uscita in `data_completamento` — l'uscita c'è stata, ed è
quella che ha chiuso la partita.

⚠️ Quella combinazione (`esito_positivo = false` **e** `aperto = false`) è esattamente il bersaglio
della guardia con cui oggi il ramo negativo **riapre** le righe chiuse male dalla vecchia regola —
le 12 del 03/08. Lasciata com'è, ogni riconciliazione riaprirebbe le righe che il `NO` ha appena
chiuso, e le due regole si rincorrerebbero a ogni apertura della tabella.

La guardia va quindi rifatta, e può semplificarsi: quella riparazione ha già fatto il suo lavoro
(zero righe la aspettano ancora), quindi l'unica invariante da tenere è **non toccare le righe
chiuse positive**. Il ramo negativo scrive lo stato che gli compete e basta.

### 3. La data di taglio: `2026-08-05`

Il `NO` chiude solo gli interventi con **giornata di lavoro** (`interventi.data`, non la data del
rapportino né quella di chiusura) **dal 2026-08-05 in poi**.

Serve perché la riconciliazione rigira su **tutti** gli interventi completati a ogni apertura della
tabella: senza barriera chiuderebbe anche le 9 righe già esitate NO che oggi stanno in coda, e la
decisione presa è di lasciarle dove sono. La data comprende tutto il 04/08, quindi **un NO scritto
oggi non chiude**: è il prezzo di una barriera che si spiega in una riga invece che in un elenco di
eccezioni. Invecchia da sola — fra un mese non filtra più niente e resta come traccia del giorno in
cui la regola è cambiata.

### 4. Lo stato del registro resta

`stato`, `stato_desc`, `aperto` ed `esito_positivo` continuano a esistere e a governare le tab:
cambia **chi** li decide, non che esistano. La colonna «Stato» sparisce dalla vista AcquaLatina,
non dal registro.

## Dati alla stesura (2026-08-04)

Registro AcquaLatina: 3.942 «Aperta», 248 «Chiusa — eseguita», 9 «Aperta — non eseguita».
`NESSUN PASSAGGIO`: **zero occorrenze** — la risposta esiste nel template
(`SI` / `NO` / `NESSUN PASSAGGIO`) ma non è mai stata usata. La regola nuova è quindi corretta in
teoria e non verificabile sui dati storici: i test la coprono, il campo la produrrà.

Nota emersa esplorando, **non un bug**: 7 righe risultavano «Aperta — non eseguita» pur avendo
intervento positivo. Erano solo non ancora riconciliate — la chiusura gira sulla strada della
lettura, non in un cron. Aprendo la vista si sono chiuse da sole (241 → 248).

## File toccati

| Area | File |
|---|---|
| Regola pura | `lib/acqualatina/chiusuraRegistro.ts` (+ test) |
| Chiusura | `app/api/acea/ordini/route.ts` (`chiudiOrdiniAcqualatinaCompletati`, estrattore `eseguito` per AcquaLatina) |
| Colonna | `lib/acea/colonneTabella.ts` (`COLONNE_ACQUALATINA`) |
| Docs | `AGENTS.md` |

## Fuori scope

Ripianificazione automatica dei «nessun passaggio»: restano in coda e li ripianifica l'ufficio,
come già fa oggi. Backfill delle 9 righe storiche.
