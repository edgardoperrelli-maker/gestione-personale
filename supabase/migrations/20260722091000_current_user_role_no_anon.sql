-- Follow-up del fix lint sicurezza: `current_user_role()` non serve ad `anon`
-- (nessuna policy applicabile ad anon la usa) e non deve essere invocabile da
-- anonimi via PostgREST (`/rest/v1/rpc/current_user_role`). Si revoca anche il
-- grant implicito a PUBLIC delle funzioni nuove. Restano EXECUTE per
-- `authenticated` (necessario: le policy RLS la valutano come ruolo chiamante)
-- e `service_role`.

revoke execute on function public.current_user_role() from public, anon;
