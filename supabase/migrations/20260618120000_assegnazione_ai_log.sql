-- Assegnazione AI: log append-only delle assegnazioni create via "Procedi"
-- (una riga per operatore effettivamente pianificato). Nessuna FK: è un audit
-- che deve sopravvivere alla cancellazione/sostituzione del piano.
create table if not exists assegnazione_ai_log (
  id uuid primary key default gen_random_uuid(),
  data_pianificata date not null,
  comune text not null,
  file text,
  staff_id uuid,
  staff_name text,
  n_interventi int not null default 0,
  piano_id uuid,
  creato_da uuid,
  creato_il timestamptz not null default now()
);
create index if not exists assegnazione_ai_log_data_comune_idx
  on assegnazione_ai_log (data_pianificata, comune);

alter table assegnazione_ai_log enable row level security;
drop policy if exists assegnazione_ai_log_all_auth on assegnazione_ai_log;
create policy assegnazione_ai_log_all_auth on assegnazione_ai_log
  for all to authenticated using (true) with check (true);
