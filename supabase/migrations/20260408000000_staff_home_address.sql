alter table public.staff
  add column if not exists home_address text,
  add column if not exists home_cap     text,
  add column if not exists home_city    text,
  add column if not exists home_lat     double precision,
  add column if not exists home_lng     double precision;
