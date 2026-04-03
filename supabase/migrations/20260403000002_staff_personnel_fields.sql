alter table public.staff
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists start_address text,
  add column if not exists start_cap text,
  add column if not exists start_city text,
  add column if not exists start_lat double precision,
  add column if not exists start_lng double precision;
