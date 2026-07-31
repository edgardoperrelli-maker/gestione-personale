-- Il PALLET di riferimento sul registro misuratori AcquaLatina.
--
-- Il ciclo fisico: i misuratori smontati si accumulano in CESTE; quando una cesta si riempie
-- va su un pallet, e il NUMERO del pallet è il riferimento con cui la riconsegna al committente
-- viaggia e si rendiconta. L'ufficio, a cesta piena, seleziona i misuratori che ci sono finiti
-- dentro e assegna loro il numero — in blocco, dal registro.
--
-- TEXT e non integer: il riferimento lo sceglie l'ufficio, e «PLT-3» o «2026-08/1» devono
-- poter esistere senza una migration. Nullable: un misuratore appena smontato un pallet non
-- ce l'ha ancora — l'assenza È l'informazione («ancora in cesta»).
--
-- Solo AcquaLatina: il registro ACEA ha un altro ciclo logistico (e un'altra tabella); se un
-- giorno servirà anche lì, sarà la stessa colonna sulla sua tabella, non una condivisione.
alter table public.acqualatina_misuratori_rimossi
  add column if not exists pallet text;
