-- Fase 2 — Foto obbligatorie (solo interventi manuali)
-- (1) tabella allegati interventi_manuali_foto
-- (2) bucket Storage PRIVATO 'interventi-foto'
-- (3) policy storage.objects per authenticated sul bucket

-- (1) Allegati foto delle richieste manuali ───────────────────────────────────
create table if not exists interventi_manuali_foto (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references interventi_manuali(id) on delete cascade,
  slot_chiave text not null,
  slot_etichetta text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size int,
  created_at timestamptz not null default now()
);
create index if not exists idx_interventi_manuali_foto_richiesta
  on interventi_manuali_foto (richiesta_id);

alter table interventi_manuali_foto enable row level security;
drop policy if exists "imf_all_auth" on interventi_manuali_foto;
create policy "imf_all_auth" on interventi_manuali_foto
  for all to authenticated using (true) with check (true);

-- (2) Bucket privato 'interventi-foto' (idempotente) ──────────────────────────
insert into storage.buckets (id, name, public)
values ('interventi-foto', 'interventi-foto', false)
on conflict (id) do nothing;

-- (3) Policy storage.objects per authenticated sul bucket privato ─────────────
drop policy if exists "interventi_foto_select" on storage.objects;
create policy "interventi_foto_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'interventi-foto');

drop policy if exists "interventi_foto_insert" on storage.objects;
create policy "interventi_foto_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'interventi-foto');

drop policy if exists "interventi_foto_delete" on storage.objects;
create policy "interventi_foto_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'interventi-foto');
