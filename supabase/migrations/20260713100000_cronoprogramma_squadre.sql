-- Cronoprogramma · Squadre (raggruppamento leggero) + avvisi "novità" visti per utente.
--
-- SQUADRE: due o più operatori che lavorano insieme in una cella (giorno + territorio).
-- Modello leggero: nessuna tabella dedicata. N membri = N righe assignments con lo stesso
-- squadra_id. team_order = ordine dei membri; is_capo = capo squadra (uno per squadra).
alter table public.assignments
  add column if not exists squadra_id  uuid,
  add column if not exists team_order   integer,
  add column if not exists is_capo      boolean not null default false;

create index if not exists assignments_squadra_id_idx
  on public.assignments (squadra_id)
  where squadra_id is not null;

-- ANNUNCI "NOVITÀ" già visti, una volta per utente (once-per-user, cross-dispositivo).
-- Chiave versionata (es. 'crono-squadre-v1'): per un nuovo annuncio si usa una nuova chiave.
create table if not exists public.annunci_visti (
  user_id      uuid        not null,
  annuncio_key text        not null,
  seen_at      timestamptz not null default now(),
  primary key (user_id, annuncio_key)
);

alter table public.annunci_visti enable row level security;

-- L'app scrive/legge via API con service role (bypassa RLS); le policy sono un backstop:
-- ogni utente vede e registra solo le proprie righe.
drop policy if exists annunci_visti_self_select on public.annunci_visti;
create policy annunci_visti_self_select on public.annunci_visti
  for select using (auth.uid() = user_id);

drop policy if exists annunci_visti_self_insert on public.annunci_visti;
create policy annunci_visti_self_insert on public.annunci_visti
  for insert with check (auth.uid() = user_id);
