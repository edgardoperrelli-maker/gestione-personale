-- Limitazioni massive — aggiunge ODS/ODL ai censiti
alter table limitazione_misuratori_ref add column if not exists odl text not null default '';
