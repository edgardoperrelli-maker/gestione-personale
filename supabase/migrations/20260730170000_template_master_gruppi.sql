-- Master ODL del template: la selezione delle attività passa al GRUPPO ATTIVITÀ.
-- Il menu per descrizione singola era inservibile: il catalogo acea è dominato
-- dalle voci DUNNING e l'ufficio ragiona per gruppo (LIMITAZIONI MASSIVE,
-- SOSTITUZIONE SARACINESCA, …), non per dettaglio.
--
-- `operazioni_default text[]` → `gruppi_default text[]`. Tabella nata in questo
-- stesso giro di sviluppo (20260730120000): drop+add, nessun dato da conservare.
alter table template_master drop column if exists operazioni_default;
alter table template_master add column if not exists gruppi_default text[];
