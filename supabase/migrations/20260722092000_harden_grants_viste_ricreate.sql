-- Follow-up: al DROP+CREATE di `me` e `v_calendar_day_history` le default
-- privileges del progetto hanno ri-assegnato TUTTI i privilegi ad
-- anon/authenticated (vanificando i grant espliciti della migration
-- precedente). Si allineano alle altre viste: niente anon, sola lettura per
-- authenticated. Con security_invoker la RLS filtra comunque, ma i grant
-- restano il primo livello di difesa.

revoke all on public.me, public.v_calendar_day_history from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.me, public.v_calendar_day_history
  from authenticated;
