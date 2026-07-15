-- supabase/migrations/20260715140000_agente_forza_giro_comune.sql
-- Filtro comune one-shot per il giro "Esegui ora" (/hub/agente): il comune è il nome del file
-- master delle limitazioni massive (LABICO.xlsx → 'LABICO'). null = tutti i comuni.
-- Il tick lo azzera insieme a forza_giro: il giro schedulato (21:00) gira SEMPRE su tutti.
alter table agente_config add column if not exists forza_giro_comune text;
