-- `data_esecuzione` dei registri misuratori torna a essere la giornata di lavoro.
--
-- IL DIFETTO
-- I due scrittori del registro la ricavavano dall'ISTANTE in cui la voce era stata toccata:
--   • `app/api/r/[token]/invia`   → `ymdLocal(voce.updated_at)`
--   • `lib/misuratori/sincronizzaRegistro` → `ymdLocal(intervento.chiuso_at)`
-- Bastava quindi riaprire un rapportino e rispedirlo perché tutte le sue righe risultassero
-- eseguite il giorno della rispedizione. Il 03/08 il rapportino del 31/07 di PASTORELLI LUIGI
-- è stato riaperto alle 08:05 e re-inviato alle 08:10: 39 rimozioni del 31/07 sono entrate nel
-- registro datate 03/08. Un magazzino e delle statistiche per giorno che dicono il falso.
--
-- Peggio: i due scrittori si rincorrevano. Il passo «CORREZIONE DELLA DATA» del sync riscriveva
-- a ogni giro la data buona con quella derivata da `chiuso_at`, quindi una correzione a mano
-- non sarebbe sopravvissuta al primo ricalcolo.
--
-- LA CORREZIONE
-- Entrambi gli scrittori ora usano `interventi.data` — la giornata a cui il lavoro appartiene —
-- e questa migration riallinea le righe già scritte. `interventi.data` e non la data del
-- rapportino: un intervento può essere registrato su un rapportino di un altro giorno (succede
-- con le riaperture), e la data giusta è la sua, non quella del foglio che lo ospita.
--
-- Si toccano solo le righe agganciate a un intervento: senza `intervento_id` non c'è una
-- giornata da cui ripartire, e riscriverle a caso sarebbe peggio del dato sbagliato.
-- `data_esecuzione` è descrittiva e non governa il flusso logistico, quindi la correzione vale
-- anche per le righe già scaricate, verificate o consegnate.

update public.acqualatina_misuratori_rimossi m
   set data_esecuzione = i.data,
       updated_at = now()
  from public.interventi i
 where i.id = m.intervento_id
   and m.data_esecuzione is distinct from i.data;

update public.misuratori_rimossi m
   set data_esecuzione = i.data
  from public.interventi i
 where i.id = m.intervento_id
   and m.data_esecuzione is distinct from i.data;
