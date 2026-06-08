-- Template dedicati agli interventi manuali: se solo_manuale=true il template
-- compare solo nella modale "+" (per committente) ed è escluso dalla generazione dei rapportini pianificati.
alter table rapportino_template
  add column if not exists solo_manuale boolean not null default false;
