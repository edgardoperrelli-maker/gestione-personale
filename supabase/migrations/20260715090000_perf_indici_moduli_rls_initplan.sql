-- Perf: lentezza nel passaggio tra moduli.
-- 1) Indici mirati sulle query eseguite al caricamento dei moduli (evidenza da
--    pg_stat_statements + advisor Supabase: interventi 20k seq scan / 123M righe lette,
--    interventi_manuali 44k seq scan, FK non indicizzate sui percorsi di DELETE).
-- 2) Fix advisor "auth_rls_initplan": le policy che chiamano auth.uid()/auth.role()
--    senza (select ...) le rivalutano PER OGNI RIGA; il wrap le fa valutare una volta
--    per statement. Nessun cambiamento semantico: stesse condizioni, stessi ruoli.

-- ---------------------------------------------------------------------------
-- 1) INDICI
-- ---------------------------------------------------------------------------

-- Dashboard hub: KPI premialità Acea — eq committente + range su assegnato_at
-- (app/hub/page.tsx, loadKpiPremialita). Oggi: seq scan su ~8k righe a ogni apertura.
create index if not exists interventi_committente_assegnato_idx
  on public.interventi (committente, assegnato_at);

-- Pronto Intervento: landing card + coda + RichiesteManualiProvider (polling 60s di
-- ogni sessione admin) — eq fonte + eq stato (+ eq area_codice sulla foglia).
-- Oggi: 44k seq scan su interventi_manuali.
create index if not exists interventi_manuali_fonte_stato_area_idx
  on public.interventi_manuali (fonte, stato, area_codice);

-- FK senza indice sul percorso dei DELETE di interventi (853 delete a 32ms l'uno:
-- ogni delete fa il check referenziale con seq scan sulle tabelle figlie).
create index if not exists interventi_manuali_intervento_idx
  on public.interventi_manuali (intervento_id)
  where intervento_id is not null;

create index if not exists misuratori_riconsegna_intervento_idx
  on public.misuratori_riconsegna (intervento_id);

create index if not exists interventi_riconciliazione_rif_idx
  on public.interventi (riconciliazione_rif_id)
  where riconciliazione_rif_id is not null;

-- Riepilogo rapportini / anteprima agente: eq data (+ in staff_id).
-- L'indice esistente (stato, data) non copre i filtri senza stato.
create index if not exists rapportini_data_staff_idx
  on public.rapportini (data, staff_id);

-- Assegnazione AI: /api/admin/agente/acea-esiti (polling 6s durante le attese) —
-- eq data_assegnazione + order creato_il desc limit 500.
create index if not exists acea_assegnazioni_log_data_creato_idx
  on public.acea_assegnazioni_log (data_assegnazione, creato_il desc);

-- Pronto Intervento foglia area: pi_contabilita_righe .in(intervento_id) in waterfall.
create index if not exists pi_contabilita_righe_intervento_idx
  on public.pi_contabilita_righe (intervento_id);

-- Misuratori: lista ordinata (data_esecuzione desc, created_at desc) + FK rapportino.
create index if not exists misuratori_rimossi_esecuzione_idx
  on public.misuratori_rimossi (data_esecuzione desc, created_at desc);

create index if not exists misuratori_rimossi_rapportino_idx
  on public.misuratori_rimossi (rapportino_id);

-- Cronoprogramma: FK calde di assignments (advisor unindexed_foreign_keys);
-- day_id è già coperto dal prefisso dell'indice unico (day_id, staff_id).
create index if not exists assignments_staff_idx
  on public.assignments (staff_id);

create index if not exists assignments_territory_idx
  on public.assignments (territory_id);

-- ---------------------------------------------------------------------------
-- 2) RLS: wrap di auth.uid()/auth.role() in (select ...) — advisor auth_rls_initplan
-- ---------------------------------------------------------------------------

-- annunci_visti (letta a ogni mount del centro Novità)
alter policy "annunci_visti_self_select" on public.annunci_visti
  using ((select auth.uid()) = user_id);
alter policy "annunci_visti_self_insert" on public.annunci_visti
  with check ((select auth.uid()) = user_id);

-- assignments (scritture del cronoprogramma: drag&drop, squadre)
alter policy "del_auth" on public.assignments
  using ((select auth.role()) = 'authenticated');
alter policy "ins_auth" on public.assignments
  with check ((select auth.role()) = 'authenticated');
alter policy "upd_auth" on public.assignments
  using ((select auth.role()) = 'authenticated');
alter policy "assignments_delete_owner" on public.assignments
  using (exists (
    select 1 from public.calendar_days d
    where d.id = assignments.day_id and d.user_id = (select auth.uid())
  ));
alter policy "assignments_update_owner" on public.assignments
  using (exists (
    select 1 from public.calendar_days d
    where d.id = assignments.day_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.calendar_days d
    where d.id = assignments.day_id and d.user_id = (select auth.uid())
  ));

-- audit_log
alter policy "admin read audit" on public.audit_log
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ));

-- calendar_days
alter policy "calendar_days_owner" on public.calendar_days
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- hotel_bookings
alter policy "delete anon or auth" on public.hotel_bookings
  using ((select auth.role()) = any (array['authenticated'::text, 'anon'::text]));
alter policy "delete auth" on public.hotel_bookings
  using ((select auth.role()) = 'authenticated');
alter policy "update anon or auth" on public.hotel_bookings
  using ((select auth.role()) = any (array['authenticated'::text, 'anon'::text]));
alter policy "update auth" on public.hotel_bookings
  using ((select auth.role()) = 'authenticated');
alter policy "write anon or auth" on public.hotel_bookings
  with check ((select auth.role()) = any (array['authenticated'::text, 'anon'::text]));
alter policy "write auth" on public.hotel_bookings
  with check ((select auth.role()) = 'authenticated');

-- profiles (letta dal layout hub a ogni navigazione)
alter policy "admin read profiles" on public.profiles
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ));
alter policy "admin update profiles" on public.profiles
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ));
alter policy "admin upsert profiles" on public.profiles
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::user_role
  ));
alter policy "profiles: read own" on public.profiles
  using (id = (select auth.uid()));
alter policy "read own profile" on public.profiles
  using ((select auth.uid()) = id);

-- sopralluoghi
alter policy "Admin possono gestire sopralluoghi" on public.sopralluoghi
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'admin'::user_role
  ));

-- sopralluoghi_pdf_generati
alter policy "Admin gestiscono PDF generati" on public.sopralluoghi_pdf_generati
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'admin'::user_role
  ));
