-- Security Advisor Supabase, lint 0013_rls_disabled_in_public: le sette tabelle
-- di backup create dalle bonifiche del 22-23/07 avevano RLS disabilitata, quindi
-- erano leggibili e scrivibili da chiunque avesse la chiave anon (che in un'app
-- Next.js viene spedita al browser). Contengono dati di produzione: codici
-- intervento, limitazioni massive, pianificazioni annullate, modelli rapportino.
--
-- Perché sono sfuggite: la migrazione che aveva sistemato lo stesso lint
-- (20260722090000_fix_security_lints_viste_rls.sql, applicata alle 07:08 del
-- 22/07 su `_backup_interventi_acea_20260714`) ha girato PRIMA che queste
-- tabelle esistessero — sono state create dalle 09:18 alle 15:07 dello stesso
-- giorno e del successivo. Nessuna rete le ha raccolte.
--
-- Effetto: RLS attiva senza policy = nessun accesso per `anon` e
-- `authenticated`. È esattamente il comportamento voluto per una tabella di
-- backup, e ricalca la scelta già fatta su `_backup_interventi_acea_20260714`.
-- `service_role` e `postgres` bypassano la RLS, quindi:
--   - le route server (`supabaseAdmin`) non cambiano comportamento;
--   - le migrazioni di ripristino che leggono questi backup
--     (20260723090000_ridividi_codici_italgas_storage.sql) restano funzionanti;
--   - nessun codice applicativo le interroga: verificato, gli unici
--     riferimenti nel repo sono dentro i file .sql che le hanno create.
--
-- Idempotente: `enable row level security` non erra se già attiva, e la guardia
-- su `to_regclass` permette di droppare i backup in futuro senza rompere questa
-- migrazione.

do $$
declare
  tabella text;
begin
  foreach tabella in array array[
    'bak_uniforma_massive_20260722',
    'bak_allinea_tassonomia_20260722',
    'bak_annul_pianif_vuote_20260722',
    'bak_collassa_codici_cat_20260722',
    'bak_collassa_codici_int_20260722',
    'bak_rapportini_modello_20260722',
    'bak_ridividi_int_20260722'
  ]
  loop
    if to_regclass('public.' || quote_ident(tabella)) is not null then
      execute format('alter table public.%I enable row level security', tabella);
      raise notice 'RLS attivata su public.%', tabella;
    else
      raise notice 'salto public.% (non esiste)', tabella;
    end if;
  end loop;
end
$$;
