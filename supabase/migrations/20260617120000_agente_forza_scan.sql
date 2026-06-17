-- Agente: flag one-shot per forzare la ri-scansione delle colonne ("Aggiorna tabella")
alter table agente_config add column if not exists forza_scan boolean not null default false;
