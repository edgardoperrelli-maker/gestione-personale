-- Fase 2 ACEA: flag one-shot "assegna su ACEA" + log idempotenza + registro DUNNING.

-- 1) flag one-shot sul singleton agente_config
alter table agente_config add column if not exists forza_acea_assegna boolean not null default false;
alter table agente_config add column if not exists acea_assegna_data date;
alter table agente_config add column if not exists acea_assegna_dry boolean not null default true;

-- 2) log delle assegnazioni spinte su ACEA (idempotenza + storico esiti)
create table if not exists acea_assegnazioni_log (
  id uuid primary key default gen_random_uuid(),
  data_assegnazione date not null,
  odl text not null,
  matricola text,
  comune text,
  staff_id text,
  operatore_acea text,
  intervento_id uuid,
  esito text not null,            -- 'assegnato' | 'saltato' | 'fallito'
  motivo text,
  dry_run boolean not null default false,
  run_id uuid,
  creato_il timestamptz not null default now()
);
create index if not exists acea_assegnazioni_log_data_idx on acea_assegnazioni_log (data_assegnazione);
-- un ODL non può risultare "assegnato" reale due volte nello stesso giorno
create unique index if not exists acea_assegnazioni_log_odl_uq
  on acea_assegnazioni_log (data_assegnazione, odl) where dry_run = false and esito = 'assegnato';

alter table acea_assegnazioni_log enable row level security;
drop policy if exists acea_assegnazioni_log_all_auth on acea_assegnazioni_log;
create policy acea_assegnazioni_log_all_auth on acea_assegnazioni_log
  for all to authenticated using (true) with check (true);

-- 3) registro DUNNING (template_id da impostare a mano con l'id del template "+" DUNNING)
insert into agente_file_config (file, committente, attivita, template_id)
values ('LIMITAZIONI CON ORDINE.xlsx', 'acea', 'DUNNING', null)
on conflict (file) do nothing;
