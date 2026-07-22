-- Hardening di public.profiles (follow-up del fix lint sicurezza).
--
-- Problema: la policy anon "public read username->email" (qual = true) unita
-- ai grant di default esponeva TUTTE le colonne di profiles — inclusa
-- custom_password — a chiunque avesse la publishable key. Inoltre le policy
-- always-true "profiles auth insert/update/delete" permettevano a QUALSIASI
-- utente autenticato di scrivere in profiles: siccome resolveUserRole() dà
-- precedenza a profiles.role sul ruolo del JWT, bastava inserire la propria
-- riga con role='admin' per diventare admin in tutta l'app (privilege
-- escalation).
--
-- Consumi reali verificati nel codice:
--   - anon (app/auth/sign-in): SELECT email WHERE username = ?  → servono
--     solo le colonne username ed email;
--   - authenticated: SELECT role/username della propria riga (layout di
--     hub/dashboard/impostazioni, lib/apiAuth, kpiGate, datiListaAttesa) e
--     subquery id+role nelle policy di sopralluoghi/pdf;
--   - nessuna scrittura client-side: la gestione utenze passa dalle route
--     /api/admin/* con service_role (bypassa RLS e grant);
--   - custom_password: nessun riferimento nel codice (colonna morta) →
--     resta leggibile solo a service_role/postgres.
--
-- La visibilità delle RIGHE in lettura per authenticated non cambia
-- ("profiles auth select" resta): cambiano solo le COLONNE accessibili e i
-- permessi di scrittura.

-- ---------------------------------------------------------------------------
-- 1) anon: solo il lookup username -> email del login
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon;
grant select (username, email) on table public.profiles to anon;

-- ---------------------------------------------------------------------------
-- 2) authenticated: lettura senza custom_password; scritture per colonne
--    coerenti con le policy admin (mai custom_password, mai delete)
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from authenticated;
grant select (id, username, role, email, created_at, deleted_at)
  on table public.profiles to authenticated;
grant insert (id, username, role, email, created_at, deleted_at)
  on table public.profiles to authenticated;
grant update (username, role, email, deleted_at)
  on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Scritture solo admin: via le policy always-true. Restano
--    "admin upsert profiles" / "admin update profiles" (current_user_role());
--    nessuna policy DELETE per authenticated → delete solo via service_role.
-- ---------------------------------------------------------------------------

drop policy "profiles auth insert" on public.profiles;
drop policy "profiles auth update" on public.profiles;
drop policy "profiles auth delete" on public.profiles;
