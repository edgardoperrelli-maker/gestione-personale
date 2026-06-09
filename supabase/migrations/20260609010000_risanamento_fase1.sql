-- ============================================================================
-- Risanamento colonne — Fase 1: fondamenta dati
-- ============================================================================

-- 1) Tabella di riferimento misuratori (estrazione importata).
--    matricola = chiave del lookup; pdr/nominativo si auto-compilano dal match.
--    indirizzo/civico servono allo scope "prima nel civico". Nessun UNIQUE su
--    matricola: l'anagrafica puo' essere sporca (duplicati / civico errato).
create table if not exists risanamento_misuratori_ref (
  id bigserial primary key,
  import_id uuid not null,
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  pdr text not null default '',
  matricola text not null,
  nominativo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_ris_ref_matricola on risanamento_misuratori_ref (matricola);
create index if not exists idx_ris_ref_indirizzo_civico on risanamento_misuratori_ref (indirizzo, civico);
create index if not exists idx_ris_ref_import on risanamento_misuratori_ref (import_id);

alter table risanamento_misuratori_ref enable row level security;
drop policy if exists ris_ref_all_auth on risanamento_misuratori_ref;
create policy ris_ref_all_auth on risanamento_misuratori_ref
  for all to authenticated using (true) with check (true);

-- 2) Vista catalogo degli import (per la lista nella schermata admin).
create or replace view risanamento_import_catalog as
select
  import_id,
  count(*)::int          as righe,
  min(created_at)        as caricato_at,
  max(indirizzo)         as indirizzo_campione
from risanamento_misuratori_ref
group by import_id;

-- 3) Tabella figlia: riga-misuratore dentro una voce-civico.
--    Ogni scan = un INSERT indipendente (concorrenza multi-operatore safe).
create table if not exists rapportino_righe (
  id uuid primary key default gen_random_uuid(),
  voce_id uuid not null references rapportino_voci(id) on delete cascade,
  rapportino_id uuid not null references rapportini(id) on delete cascade,
  matricola text not null,
  pdr text,
  nominativo text,
  ref_id bigint references risanamento_misuratori_ref(id) on delete set null,
  fonte text not null default 'manuale' check (fonte in ('civico','fuori_elenco','manuale')),
  risposte jsonb not null default '{}',
  ordine int not null default 0,
  creato_da text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_righe_voce on rapportino_righe (voce_id);
create index if not exists idx_righe_rapportino on rapportino_righe (rapportino_id);
create index if not exists idx_righe_matricola on rapportino_righe (matricola);

-- Trigger updated_at (riusa la funzione public.set_updated_at() gia' presente nel progetto).
drop trigger if exists rapportino_righe_set_updated_at on rapportino_righe;
create trigger rapportino_righe_set_updated_at
  before update on rapportino_righe
  for each row execute function public.set_updated_at();

alter table rapportino_righe enable row level security;
drop policy if exists righe_all_auth on rapportino_righe;
create policy righe_all_auth on rapportino_righe
  for all to authenticated using (true) with check (true);

-- 4) Flag tipo: distingue il template/rapportino gerarchico "risanamento".
alter table rapportino_template
  add column if not exists tipo text not null default 'standard'
  check (tipo in ('standard','risanamento'));
alter table rapportini
  add column if not exists tipo text not null default 'standard'
  check (tipo in ('standard','risanamento'));
