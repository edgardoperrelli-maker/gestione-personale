-- Il PALLET di riferimento anche sul registro misuratori ACEA.
--
-- La migrazione gemella (20260731190000) chiudeva dicendo: «Solo AcquaLatina: il registro ACEA
-- ha un altro ciclo logistico; se un giorno servirà anche lì, sarà la stessa colonna sulla sua
-- tabella, non una condivisione». È quel giorno, ed è quella colonna.
--
-- Il ciclo fisico è lo stesso da tutt'e due le parti: i misuratori smontati si accumulano in
-- CESTE, a cesta piena si va su un pallet, e il NUMERO del pallet è il riferimento con cui la
-- riconsegna al committente viaggia e si rendiconta.
--
-- TEXT e non integer: il riferimento lo sceglie l'ufficio, e «PLT-3» o «2026-08/1» devono poter
-- esistere senza una migration — e su un numerico gli zeri di testa sparirebbero. Nullable:
-- un misuratore appena smontato un pallet non ce l'ha ancora, e l'assenza È l'informazione
-- («ancora in cesta»).
--
-- Additiva e idempotente: nessuna riga esistente cambia, e le 65 già a registro restano
-- semplicemente «senza pallet» finché l'ufficio non le impalletta.
alter table public.misuratori_rimossi
  add column if not exists pallet text;

comment on column public.misuratori_rimossi.pallet is
  'Numero del pallet di riconsegna. NULL = ancora in cesta. TEXT: il riferimento lo sceglie ufficio.';
