-- Mappatura foglia P.I. → territori del cronoprogramma.
-- La tendina "Esecutore (reperibile)" del link mostra SOLO i reperibili dei territori
-- associati alla foglia (se nessun territorio è mappato → fallback a tutti, retro-compatibile).

create table if not exists pi_aree_territori (
  area_codice  text not null references pi_aree(codice) on delete cascade,
  territory_id uuid not null references territories(id) on delete cascade,
  primary key (area_codice, territory_id)
);
create index if not exists pi_aree_territori_area_idx on pi_aree_territori(area_codice);

alter table pi_aree_territori enable row level security;
drop policy if exists "pi_aree_territori_all_auth" on pi_aree_territori;
create policy "pi_aree_territori_all_auth" on pi_aree_territori for all to authenticated using (true) with check (true);
