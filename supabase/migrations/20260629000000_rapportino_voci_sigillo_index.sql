-- Indice per il controllo "sigillo duplicato" in approvazione delle richieste manuali
-- (app/api/admin/interventi-manuali/[id]/approva). La query è:
--   select intervento_id, risposte
--   from rapportino_voci
--   where intervento_id is not null
--     and risposte->>'sigillo' ilike <sigillo>
-- Serve SOLO per le limitazioni massive (il file master legge il sigillo da
-- rapportino_voci.risposte->>'sigillo'): blocca l'approvazione se quel sigillo esiste già.
--
-- Indice GIN trigram per accelerare l'ILIKE case-insensitive, PARZIALE sulle sole voci
-- collegate a un intervento (le uniche che il master può vedere) → indice piccolo e mirato.
create extension if not exists pg_trgm;

create index if not exists rapportino_voci_sigillo_trgm
  on public.rapportino_voci
  using gin ((risposte->>'sigillo') gin_trgm_ops)
  where intervento_id is not null;
