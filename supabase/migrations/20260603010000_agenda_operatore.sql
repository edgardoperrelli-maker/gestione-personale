-- Fase 2-A: agenda operatore
-- (1) template associato all'intervento, scelto in fase di assegnazione
-- (2) token pubblico di accesso all'agenda per (operatore, giorno)

-- Template per-intervento: default null → in lettura ricade sugli esiti default per commessa.
alter table interventi
  add column if not exists template_id uuid references rapportino_template(id) on delete set null;

-- Token pubblico dell'agenda giornaliera dell'operatore: 1 per (staff_id, data).
create table if not exists agenda_token (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null,
  data date not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  unique (staff_id, data)
);

create index if not exists agenda_token_token_idx on agenda_token(token);

-- Accesso solo lato server (service role bypassa RLS); nessuna policy pubblica.
alter table agenda_token enable row level security;
