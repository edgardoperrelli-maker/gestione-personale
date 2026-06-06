-- Fase 3 — abilita Supabase Realtime sulla tabella interventi_manuali (badge admin).
-- Idempotente: aggiunge la tabella alla publication solo se non già presente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interventi_manuali'
  ) then
    alter publication supabase_realtime add table interventi_manuali;
  end if;
end $$;
