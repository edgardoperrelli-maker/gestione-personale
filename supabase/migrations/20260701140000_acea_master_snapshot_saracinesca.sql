-- Snapshot master: aggiungi i campi per la SOSTITUZIONE SARACINESCA (dal master ZAGAROLO).
-- Colonne ZAGAROLO: "esito" (eseguito/no), "saracinesca" (SI), "Odl saracinesca" (ODL figlio della
-- sostituzione, da verificare nel SAL portale). Additiva.
alter table acea_master_snapshot add column if not exists esito text;
alter table acea_master_snapshot add column if not exists saracinesca text;
alter table acea_master_snapshot add column if not exists odl_saracinesca text;
create index if not exists acea_master_snapshot_saracinesca_idx
  on acea_master_snapshot (saracinesca) where saracinesca is not null;
