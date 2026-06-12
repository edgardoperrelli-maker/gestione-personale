-- ============================================================================
-- Limitazioni massive — tabella di riferimento misuratori censiti (separata da Resine)
-- ============================================================================
-- matricola = chiave del lookup; committente distingue il dataset (per ora solo 'acea').
-- Nessun UNIQUE su matricola: l'anagrafica puo' essere sporca (duplicati / prefisso variabile).
create table if not exists limitazione_misuratori_ref (
  id bigserial primary key,
  import_id uuid not null,
  committente text not null default 'acea',
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  pdr text not null default '',
  matricola text not null,
  nominativo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_lim_ref_matricola on limitazione_misuratori_ref (matricola);
create index if not exists idx_lim_ref_committente on limitazione_misuratori_ref (committente);
create index if not exists idx_lim_ref_import on limitazione_misuratori_ref (import_id);

alter table limitazione_misuratori_ref enable row level security;
drop policy if exists lim_ref_all_auth on limitazione_misuratori_ref;
create policy lim_ref_all_auth on limitazione_misuratori_ref
  for all to authenticated using (true) with check (true);

-- Vista catalogo import (per la lista nella schermata admin).
create or replace view limitazione_import_catalog as
select
  import_id,
  count(*)::int          as righe,
  min(created_at)        as caricato_at,
  max(indirizzo)         as indirizzo_campione
from limitazione_misuratori_ref
group by import_id;
