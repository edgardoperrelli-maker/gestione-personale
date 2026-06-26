-- Zona di reperibilità sull'assegnazione del cronoprogramma: il territorio di LAVORO
-- può differire dalla zona di REPERIBILITÀ (foglia P.I.). Es. lavoro su ACEA ma
-- reperibilità su Lazio Centro/Est. La tendina "Esecutore" del link P.I. filtra su questa.
alter table assignments
  add column if not exists zona_reperibilita text;
