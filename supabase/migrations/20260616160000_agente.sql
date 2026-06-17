-- ============================================================================
-- Modulo "Agente" — config singleton + storico giri + snapshot colonne file
-- Spec: docs/superpowers/specs/2026-06-16-modulo-agente-design.md (§1)
-- ============================================================================

-- Config singleton (una sola riga, id=1). L'app e' il cervello: l'agente
-- chiede al tick giorni/ora/dryRun/mappatura/testi-esito.
create table if not exists agente_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  giorni smallint[] not null default '{1,2,3,4,5}',   -- ISO: 1=Lun … 7=Dom
  ora text not null default '21:00',                   -- "HH:MM" Europe/Rome
  dry_run boolean not null default true,
  finestra_giorni smallint not null default 15,
  mappatura jsonb not null default '[{"campo":"esecutore","colonna":"Esecutore","abilitato":true},{"campo":"data","colonna":"data prevista","abilitato":true},{"campo":"esito","colonna":"esito","abilitato":true},{"campo":"sigillo","colonna":"sigillo posato","abilitato":true},{"campo":"marcatore","colonna":"","auto":true,"abilitato":true}]'::jsonb,
  esito_positivo text not null default 'eseguito',
  esito_negativo text not null default 'No',
  ultimo_giro_il timestamptz,
  ultimo_contatto_il timestamptz,
  ultima_rivendicazione_giorno date,                   -- giorno (Rome) dell'ultimo "eseguiOra=true"
  updated_at timestamptz not null default now()
);
insert into agente_config (id) values (1) on conflict (id) do nothing;

-- Storico dei giri (un insert per report).
create table if not exists agente_run (
  id uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  dry_run boolean not null default false,
  lavori int not null default 0,
  aggiornate int not null default 0,
  extra int not null default 0,
  conflitti int not null default 0,
  non_collocate int not null default 0,
  errore text,
  dettaglio jsonb            -- report completo: file[], conflitti, extraNonCollocate
);
create index if not exists agente_run_creato_idx on agente_run (creato_il desc);

-- Snapshot delle colonne rilevate per file (per evidenziare nuove/sparite).
create table if not exists agente_file_colonne (
  file text primary key,
  is_master boolean not null default false,
  colonne text[] not null default '{}',
  colonne_nuove text[] not null default '{}',
  colonne_sparite text[] not null default '{}',
  rilevato_il timestamptz not null default now()
);

alter table agente_config enable row level security;
alter table agente_run enable row level security;
alter table agente_file_colonne enable row level security;

drop policy if exists agente_config_all_auth on agente_config;
create policy agente_config_all_auth on agente_config
  for all to authenticated using (true) with check (true);

drop policy if exists agente_run_all_auth on agente_run;
create policy agente_run_all_auth on agente_run
  for all to authenticated using (true) with check (true);

drop policy if exists agente_file_colonne_all_auth on agente_file_colonne;
create policy agente_file_colonne_all_auth on agente_file_colonne
  for all to authenticated using (true) with check (true);
