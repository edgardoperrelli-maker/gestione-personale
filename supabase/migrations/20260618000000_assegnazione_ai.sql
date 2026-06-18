-- Assegnazione AI: righe lette dall'agente (set volatile per file+data) + config per-file + flag lettura
create table if not exists agente_pianificabili (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  riga int not null,
  odl text,
  matricola text,
  indirizzo text,
  comune text,
  data date not null,
  esecutore text,
  scansionato_il timestamptz not null default now()
);
create index if not exists agente_pianificabili_file_data_idx on agente_pianificabili (file, data);

create table if not exists agente_file_config (
  file text primary key,
  committente text not null default 'acea',
  attivita text not null,
  template_id uuid,
  updated_at timestamptz not null default now()
);

-- flag one-shot: il giorno che l'agente deve leggere (null = nessuna richiesta)
alter table agente_config add column if not exists pianifica_data date;

-- seed ZAGAROLO (template_id da impostare dall'utente con l'id del "Rapportino limitazioni massive")
insert into agente_file_config (file, committente, attivita, template_id)
values ('ZAGAROLO.xlsx', 'acea', 'LIMITAZIONI MASSIVE', null)
on conflict (file) do nothing;
