-- Geocoding interventi: stato (pending/ok/failed) + contatore tentativi
-- Spec: docs/superpowers/specs/2026-06-02-geocoding-interventi-design.md
alter table public.interventi
  add column if not exists geocode_status text not null default 'pending'
    check (geocode_status in ('pending','ok','failed')),
  add column if not exists geocode_attempts integer not null default 0;

-- backfill: gli interventi che hanno già coordinate sono 'ok'
update public.interventi
  set geocode_status = 'ok'
  where lat is not null and lng is not null and geocode_status <> 'ok';

-- indice per la coda dei pending (geocodifica a blocchi per data)
create index if not exists interventi_geocode_pending_idx
  on public.interventi (data, geocode_status)
  where geocode_status = 'pending';
