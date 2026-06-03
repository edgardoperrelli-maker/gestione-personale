-- Fase 2-B: abilita Supabase Realtime sulla tabella interventi (torre di controllo).
-- Idempotente: aggiunge la tabella alla publication solo se non già presente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interventi'
  ) then
    alter publication supabase_realtime add table interventi;
  end if;
end $$;
