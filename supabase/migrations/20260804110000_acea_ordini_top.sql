-- Gli ODL che ACEA segnala come TOP.
--
-- ACEA indica certe attività come prioritarie. Finora quella segnalazione moriva in ufficio —
-- arrivava per telefono, chi pianificava se la ricordava, e l'operatore apriva il rapportino
-- trovando una voce identica a tutte le altre. L'unico canale era la colonna `note`, che è prosa
-- libera: buona per «citofonare interno 4», inadatta a una proprietà su cui si vuole ordinare.
--
-- Booleano e non un livello di priorità: ACEA dice TOP o non dice niente, e inventare una scala
-- che il committente non usa vorrebbe dire tenerne allineata una che nessuno popola.
--
-- SU ENTRAMBE LE TABELLE, e non è simmetria estetica: `app/api/acea/ordini/route.ts` legge i due
-- registri con UNA sola lista di colonne. Aggiungerla solo qui farebbe fallire la query di là,
-- cioè spegnerebbe il registro AcquaLatina. Il bottone per marcare resta comunque sulle sole
-- viste ACEA: di là la colonna esiste e vale `false`.
--
-- Additiva: si applica PRIMA del deploy senza rompere il codice vecchio, che semplicemente non
-- la nomina. È l'inverso della trappola pagata il 04/08 con una colonna eliminata troppo presto.
alter table public.acea_ordini
  add column if not exists top boolean not null default false;

alter table public.acqualatina_ordini
  add column if not exists top boolean not null default false;

comment on column public.acea_ordini.top is
  'Ordine segnalato TOP da ACEA: evidenziato in tabella e in cima al rapportino dell''operatore.';

comment on column public.acqualatina_ordini.top is
  'Gemella di acea_ordini.top: esiste perché la select del registro è una sola per le due tabelle.';

-- La domanda è sempre «quali di questi ODL sono TOP»: indice PARZIALE, perché le righe marcate
-- sono poche decine su migliaia e le altre non hanno niente da dire a questa domanda.
create index if not exists acea_ordini_top_idx
  on public.acea_ordini (odl)
  where top;

create index if not exists acqualatina_ordini_top_idx
  on public.acqualatina_ordini (odl)
  where top;
