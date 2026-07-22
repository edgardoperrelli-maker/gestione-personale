-- Security Advisor Supabase: risoluzione dei lint segnalati (tutti ERROR).
--   1) 0002_auth_users_exposed   — le viste `me` e `v_calendar_day_history`
--      esponevano dati di `auth.users` ai ruoli API: ora leggono `public.profiles`.
--   2) 0010_security_definer_view — le 8 viste di `public` giravano con i
--      privilegi del creatore (postgres, bypassrls): passano a
--      `security_invoker = on`, quindi valgono permessi e RLS del chiamante.
--   3) 0013_rls_disabled_in_public — RLS abilitata sulla tabella di backup
--      `_backup_interventi_acea_20260714` (resta accessibile solo a
--      service_role/postgres, come da uso attuale).
--
-- Prerequisito del punto 2: otto policy RLS (activities, calendar_days,
-- calendar_days_history, staff) ricavavano il ruolo con `EXISTS (... FROM me)`,
-- che funzionava solo perché `me` era SECURITY DEFINER. Il controllo passa alla
-- funzione `public.current_user_role()` (SECURITY DEFINER con search_path
-- fisso): è il pattern raccomandato dalla doc Supabase per i controlli di ruolo
-- nelle policy e non ricade nel lint 0010, che riguarda solo le viste.
--
-- La stessa funzione corregge anche un bug pre-esistente: le tre policy
-- "admin ..." su `profiles` interrogavano `profiles` dentro sé stesse e ogni
-- SELECT su `profiles` come `authenticated` falliva con 42P17 ("infinite
-- recursion detected in policy"); per questo `requireAdmin()` ripiegava sempre
-- su `app_metadata.role` del JWT.
--
-- Flussi invariati:
--   - le route server usano `supabaseAdmin` (service_role, bypassa la RLS);
--   - il client browser interroga `activities_renamed` da utente autenticato e
--     `activities` ha già policy SELECT permissive per `authenticated`;
--   - con `profiles` vuota (stato attuale) le policy basate sul ruolo
--     continuano a non concedere nulla: prima EXISTS su vista vuota → false,
--     ora funzione → NULL → confronto false.

-- ---------------------------------------------------------------------------
-- 1) Funzione helper: ruolo del profilo dell'utente corrente
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

comment on function public.current_user_role() is
  'Ruolo (user_role) del profilo dell''utente corrente; NULL se il profilo non esiste. '
  'SECURITY DEFINER con search_path fisso: sostituisce la vista `me` nelle policy RLS '
  'per evitare viste SECURITY DEFINER (lint 0010) e la ricorsione RLS su profiles.';

grant execute on function public.current_user_role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Le policy che usavano la vista `me` passano alla funzione.
--    Stesse condizioni e stessi ruoli; `(select ...)` la valuta una volta per
--    statement (pattern auth_rls_initplan già adottato nel progetto).
-- ---------------------------------------------------------------------------

alter policy "mutate activities" on public.activities
  using ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]))
  with check ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

alter policy "editor/admin read all days" on public.calendar_days
  using ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

alter policy "editor/admin insert days" on public.calendar_days
  with check ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

alter policy "editor/admin update days" on public.calendar_days
  using ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]))
  with check ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

alter policy "editor/admin delete days" on public.calendar_days
  using ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

alter policy "viewer read limited days" on public.calendar_days
  using (
    (select public.current_user_role()) = 'viewer'::public.user_role
    and day >= ((now() at time zone 'Europe/Rome'))::date
    and day <= (((now() at time zone 'Europe/Rome'))::date + 1)
  );

alter policy "admin read cal history" on public.calendar_days_history
  using ((select public.current_user_role()) = 'admin'::public.user_role);

alter policy "mutate staff" on public.staff
  using ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]))
  with check ((select public.current_user_role()) = any (array['editor','admin']::public.user_role[]));

-- Fix ricorsione: le policy admin su profiles interrogavano profiles stessa.
alter policy "admin read profiles" on public.profiles
  using ((select public.current_user_role()) = 'admin'::public.user_role);

alter policy "admin update profiles" on public.profiles
  using ((select public.current_user_role()) = 'admin'::public.user_role)
  with check ((select public.current_user_role()) = 'admin'::public.user_role);

alter policy "admin upsert profiles" on public.profiles
  with check ((select public.current_user_role()) = 'admin'::public.user_role);

-- ---------------------------------------------------------------------------
-- 3) Viste senza riferimenti a auth.users → basta `security_invoker = on`.
--    Le tabelle sottostanti hanno già policy SELECT per `authenticated`
--    (atlas_readonly ha le proprie `atlas_ro_select`): stessi risultati per i
--    chiamanti reali; service_role bypassa la RLS come oggi.
-- ---------------------------------------------------------------------------

alter view public.activities_renamed          set (security_invoker = on);
alter view public.limitazione_import_catalog  set (security_invoker = on);
alter view public.microaree_stats             set (security_invoker = on);
alter view public.risanamento_import_catalog  set (security_invoker = on);
alter view public.sopralluoghi_dataset_caricati set (security_invoker = on);
alter view public.v_calendar_days             set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 4) Viste che leggevano auth.users: ricreate su public.profiles.
--    DROP+CREATE perché cambia il tipo di changed_by_email
--    (varchar di auth.users.email → text di profiles.email).
-- ---------------------------------------------------------------------------

drop view public.me;
create view public.me
with (security_invoker = on) as
select p.id as user_id,
       p.role
from public.profiles p
where p.id = auth.uid();

comment on view public.me is
  'Profilo (id + ruolo) dell''utente corrente. security_invoker: la RLS di '
  'profiles ("read own profile") garantisce comunque la sola riga propria.';

drop view public.v_calendar_day_history;
create view public.v_calendar_day_history
with (security_invoker = on) as
select h.id as history_id,
       h.version,
       h.action,
       (h.created_at at time zone 'Europe/Rome') as ts_rome,
       p.email as changed_by_email,
       h.calendar_day_id as day_id,
       cd.day as calendar_day
from public.calendar_days_history h
left join public.profiles p on p.id = h.changed_by
left join public.calendar_days cd on cd.id = h.calendar_day_id;

comment on view public.v_calendar_day_history is
  'Storico calendario con email da public.profiles (non più da auth.users). '
  'security_invoker: visibile solo a chi passa la RLS di calendar_days_history.';

-- Il DROP azzera i grant: si ripristinano in sola lettura (niente anon).
grant select on public.me to authenticated, service_role, atlas_readonly;
grant select on public.v_calendar_day_history to authenticated, service_role, atlas_readonly;

-- ---------------------------------------------------------------------------
-- 5) Grant hardening sulle altre viste: sono di sola lettura e nessun flusso
--    le usa da anon (login = solo profiles); restano SELECT per authenticated
--    e atlas_readonly, service_role invariato.
-- ---------------------------------------------------------------------------

revoke all on public.activities_renamed,
              public.limitazione_import_catalog,
              public.microaree_stats,
              public.risanamento_import_catalog,
              public.sopralluoghi_dataset_caricati,
              public.v_calendar_days
  from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.activities_renamed,
     public.limitazione_import_catalog,
     public.microaree_stats,
     public.risanamento_import_catalog,
     public.sopralluoghi_dataset_caricati,
     public.v_calendar_days
  from authenticated;

-- ---------------------------------------------------------------------------
-- 6) Tabella di backup: RLS attiva, nessuna policy (accesso via service_role).
-- ---------------------------------------------------------------------------

alter table public._backup_interventi_acea_20260714 enable row level security;

revoke all on table public._backup_interventi_acea_20260714 from anon, authenticated;
