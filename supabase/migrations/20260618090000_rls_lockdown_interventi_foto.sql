-- RLS lockdown del bucket privato 'interventi-foto'.
-- Ogni accesso al bucket passa dal server con service_role (che bypassa la RLS) e le
-- anteprime usano signed URL firmate dal server: nessun client legge/scrive/cancella
-- direttamente. Le policy "to authenticated" sono pura superficie d'attacco → rimosse.
drop policy if exists "interventi_foto_select" on storage.objects;
drop policy if exists "interventi_foto_insert" on storage.objects;
drop policy if exists "interventi_foto_delete" on storage.objects;
