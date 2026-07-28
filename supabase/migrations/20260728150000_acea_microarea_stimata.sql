-- Distingue il gruppo MISURATO da quello PRESTATO.
--
-- Un ordine appena importato non ha coordinate finché la geocodifica non passa, e i provider
-- gratuiti vanno a una richiesta al secondo: senza prestito le righe nuove resterebbero senza zona
-- proprio nei giorni in cui le si pianifica. Quindi ereditano il gruppo dal CAP (a Roma) o dal
-- comune (altrove) — vedi `ereditaGruppi` in lib/acea/microaree.ts.
--
-- Ma «da queste parti» non è «a 2 km da qui», e le due cose non devono assomigliarsi in tabella:
-- chi monta un giro su un numero prestato deve sapere che è prestato. Da qui la colonna, e la
-- tilde davanti al numero (`~12`) nella vista.

alter table acea_ordini
  add column if not exists microarea_stimata boolean not null default false;

comment on column acea_ordini.microarea_stimata is
  'true = gruppo ereditato dal CAP/comune perché mancano le coordinate. false = calcolato dalle sue.';
