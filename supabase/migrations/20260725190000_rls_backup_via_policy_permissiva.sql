-- Security Advisor Supabase, lint rls_policy_always_true: dodici tabelle di
-- backup (bak_fus_*, bak_maiusc_*, bak_riallineo_*) avevano RLS attiva ma con
-- una policy `<tabella>_all_auth` per ALL con USING e WITH CHECK entrambi
-- `true`. Effetto pratico: qualunque utente autenticato poteva leggere E
-- modificare copie di dati del personale (bak_maiusc_staff, 28 righe),
-- rapportini (248), voci rapportino (4363), territori e template.
--
-- Meno grave delle sette tabelle sistemate in
-- 20260725180000_rls_tabelle_backup_20260722.sql (là bastava la chiave anon,
-- qui serve un account), ma un operatore qualsiasi non ha motivo di leggere
-- copie di backup: sono materiale di rollback, non dati applicativi.
--
-- PERIMETRO — questa migrazione tocca SOLO le policy `*_all_auth` sulle tabelle
-- `bak%`. Due cose che vanno lasciate stare, verificate prima di scrivere:
--
--   1) `atlas_ro_select` (SELECT per il ruolo `atlas_readonly`) esiste su 63
--      delle 95 tabelle di `public`: e' un grant di sola lettura sistematico,
--      non un errore. Resta intatta, quindi `atlas_readonly` continua a leggere
--      i backup esattamente come prima.
--   2) le policy `*_all_auth` sono 53 in totale e 41 stanno su tabelle VIVE
--      (interventi, rapportini, rapportino_voci, master_clientela, acea_*,
--      agente_*, pi_*): sono portanti, e' come il client browser legge da
--      utente autenticato. NON vanno toccate.
--
-- Esito per le dodici: RLS attiva, nessuna policy per anon/authenticated,
-- `atlas_readonly` in sola lettura, service_role e postgres in bypass. Nessun
-- codice applicativo le interroga (verificato: l'unico riferimento nel repo e'
-- un file di documentazione che spiega la convenzione di nomi).
--
-- Idempotente: droppa per scoperta da pg_policies, quindi rieseguirla non trova
-- nulla e non erra.

do $$
declare
  r record;
  quante int := 0;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename like 'bak%'
      and policyname like '%\_all\_auth'
      and 'authenticated' = any(roles)
    order by tablename
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'droppata policy % su public.%', r.policyname, r.tablename;
    quante := quante + 1;
  end loop;
  raise notice 'policy permissive rimosse: %', quante;
end
$$;
