-- Microaree: coordinate degli ordini ACEA e numero di gruppo per la pianificazione.
--
-- Il CAP dice la zona postale, che a Roma può essere larga chilometri. Per decidere quali
-- misuratori conviene fare nello stesso giro serve la vicinanza VERA, e quindi le coordinate.
--
-- Additiva: nessuna colonna esistente viene toccata, e finché la geocodifica non gira le tre
-- colonne restano nulle e la tabella si comporta esattamente come prima.

alter table acea_ordini
  add column if not exists lat                   double precision,
  add column if not exists lng                   double precision,
  -- Numero di microarea. Ricalcolato a ogni passaggio di geocodifica: è l'etichetta della
  -- fotografia corrente, non un'identità permanente della zona (vedi lib/acea/microaree.ts).
  add column if not exists microarea             integer,
  add column if not exists geocodifica_at        timestamptz,
  -- L'indirizzo NORMALIZZATO su cui sono state risolte le coordinate. Serve a riconoscere che
  -- l'indirizzo è cambiato in un import successivo: senza, le coordinate resterebbero quelle del
  -- vecchio civico e il gruppo manderebbe la squadra all'indirizzo di prima.
  add column if not exists geocodifica_chiave    text,
  -- Perché un ordine non ha coordinate. `fuori_regione` è il caso che va visto: il provider ha
  -- risposto, ma con un punto fuori dal Lazio — cioè con l'omonimo di un'altra regione. Non è un
  -- dato mancante, è un dato SBAGLIATO, e tenerlo distinto è ciò che permette di accorgersene.
  add column if not exists geocodifica_esito     text
    check (geocodifica_esito is null
           or geocodifica_esito in ('ok', 'non_trovato', 'fuori_regione', 'senza_indirizzo'));

-- La tabella ordini filtra e ordina per gruppo dentro una famiglia.
create index if not exists acea_ordini_microarea_idx on acea_ordini (famiglia, microarea);

-- Il passaggio di geocodifica cerca le righe ancora da fare: quelle senza esito, o con un
-- indirizzo cambiato rispetto a quello risolto.
create index if not exists acea_ordini_geocodifica_idx on acea_ordini (geocodifica_esito)
  where geocodifica_esito is null;

comment on column acea_ordini.microarea is
  'Numero di microarea (griglia ~2km dentro il comune). Ricalcolato a ogni passaggio di geocodifica.';
comment on column acea_ordini.geocodifica_esito is
  'ok | non_trovato | fuori_regione (omonimo di un''altra regione: dato sbagliato, non mancante) | senza_indirizzo';
