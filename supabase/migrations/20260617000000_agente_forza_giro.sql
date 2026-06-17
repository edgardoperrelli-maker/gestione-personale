-- Agente: flag one-shot per forzare un giro dal modulo ("Esegui ora")
alter table agente_config add column if not exists forza_giro boolean not null default false;
