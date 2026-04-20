alter table public.territories
  add column if not exists valid_from date,
  add column if not exists valid_to date;
