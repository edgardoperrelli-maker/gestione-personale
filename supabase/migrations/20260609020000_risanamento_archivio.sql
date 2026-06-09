-- Risanamento: archivio dei misuratori lavorati (deposito tecnico).
-- Lo storico "vero" e' negli interventi esitati; qui si depositano i record di
-- riferimento lavorati, spostati dalla tabella di ricerca alla chiusura (logica in Fase 5).
create table if not exists risanamento_misuratori_archivio (
  id bigserial primary key,
  matricola text not null,
  pdr text not null default '',
  nominativo text not null default '',
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  import_id uuid,
  ref_id_originale bigint,
  rapportino_id uuid references rapportini(id) on delete set null,
  archiviato_at timestamptz not null default now()
);
create index if not exists idx_ris_arch_matricola on risanamento_misuratori_archivio (matricola);
create index if not exists idx_ris_arch_rapportino on risanamento_misuratori_archivio (rapportino_id);

alter table risanamento_misuratori_archivio enable row level security;
drop policy if exists ris_arch_all_auth on risanamento_misuratori_archivio;
create policy ris_arch_all_auth on risanamento_misuratori_archivio
  for all to authenticated using (true) with check (true);
