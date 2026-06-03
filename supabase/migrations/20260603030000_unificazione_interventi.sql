-- Unificazione mappa/rapportini/interventi
-- (1) collega ogni voce di rapportino all'intervento canonico
-- (2) traccia gli interventi creati dalla pianificazione mappa (per idempotenza)

alter table rapportino_voci
  add column if not exists intervento_id uuid references interventi(id) on delete set null;
create index if not exists idx_voci_intervento on rapportino_voci (intervento_id);

alter table interventi
  add column if not exists created_from_mappa boolean not null default false;
-- chiave logica per upsert idempotente degli interventi generati da un piano
create index if not exists interventi_piano_odl_idx on interventi (piano_id, odl);
