-- Riallineamento del MODELLO dei rapportini al flusso delle loro voci (bug PDF DUNNING 22/07).
--
-- Problema: dal 21/07 (archiviazione "Ibrido acea", modulo Azioni operatori senza scelta del
-- modello) i piani nuovi cadevano sul fallback alfabetico → "AGENDA AEREA" (italgas) come
-- modello base anche su piani ACEA/limitazioni. Le VOCI portavano già il flusso giusto
-- (campi per-voce), ma dal modello base il rapportino ereditava:
--   · campi_snapshot col campo ESITO → colonna "ESITO" fantasma (sempre vuota) in PDF/Excel;
--   · info_snapshot con NOMINATIVO e senza COMUNE/CAP → anagrafica sbagliata in PDF/Excel.
-- 12 rapportini toccati al 22/07 (dati 22-23/07, flussi LIMITAZIONI/SOSPENSIONI, RAPPORTINO
-- LIMITAZIONI MASSIVE, ITALGAS). Il codice ora risolve il modello dal flusso più rappresentato
-- del piano (sincronizzaRapportini); questa migration ripara lo storico già generato.
--
-- Criterio (strutturale, idempotente): rapportini le cui voci da-task (manuale=false) hanno
-- TUTTE lo stesso flusso per-voce (template_id valorizzato e unico) diverso dal modello del
-- rapportino → il modello diventa quel flusso (template_id + campi/info/tipo dal template).
-- Le risposte delle voci NON si toccano (le chiavi combaciano già col flusso). Le voci manuali
-- ("+"), che ereditano il modello base, non concorrono al criterio ma beneficiano del fix.
--
-- Sicurezza sui consumer verificata:
--   · PDF/Excel/foto-zip leggono campi per-voce con fallback al modello → solo migliorati;
--   · export saracinesche (/api/export/acea-saracinesche) legge le risposte delle voci
--     (sostituzione_valvola/sost_valvola), mai gli snapshot del rapportino → invariato;
--   · consuntivazione/blocco invio valutano i campi per-voce → invariati.
-- Reversibile: backup completo delle righe toccate prima dell'update.

-- ---------------------------------------------------------------------------
-- 1) Backup delle righe che cambiano (reversibile)
-- ---------------------------------------------------------------------------
create table if not exists public.bak_rapportini_modello_20260722 as
with flusso_unico as (
  select v.rapportino_id, min(v.template_id::text)::uuid as flusso_id
  from public.rapportino_voci v
  where v.manuale = false
  group by v.rapportino_id
  having count(*) filter (where v.template_id is null) = 0
     and count(distinct v.template_id) = 1
)
select r.id, r.template_id, r.campi_snapshot, r.info_snapshot, r.tipo, r.updated_at
from public.rapportini r
join flusso_unico f on f.rapportino_id = r.id
where r.data >= '2026-07-20'
  and r.template_id is distinct from f.flusso_id;

-- ---------------------------------------------------------------------------
-- 2) Backfill: modello del rapportino = flusso (unico) delle sue voci
-- ---------------------------------------------------------------------------
with flusso_unico as (
  select v.rapportino_id, min(v.template_id::text)::uuid as flusso_id
  from public.rapportino_voci v
  where v.manuale = false
  group by v.rapportino_id
  having count(*) filter (where v.template_id is null) = 0
     and count(distinct v.template_id) = 1
)
update public.rapportini r
set template_id = f.flusso_id,
    campi_snapshot = t.campi,
    info_snapshot = coalesce(t.info_campi, '[]'::jsonb),
    tipo = coalesce(t.tipo, 'standard'),
    updated_at = now()
from flusso_unico f
join public.rapportino_template t on t.id = f.flusso_id
where r.id = f.rapportino_id
  and r.data >= '2026-07-20'
  and r.template_id is distinct from f.flusso_id;
