-- Unificazione ODS/ODL/ODSIN → colonna unica rapportino_voci.odl + migrazione campi-info.
-- Spec: docs/superpowers/specs/2026-06-04-unificazione-ods-odl-design.md
-- Strategia two-phase (zero-downtime). FASE 1 prima del deploy del codice; FASE 2 dopo.

-- ── FASE 1 (prima del deploy) ────────────────────────────────────────────────
-- 1a) nuova colonna + backfill (il codice vecchio continua a usare odsin)
alter table rapportino_voci add column if not exists odl text;
update rapportino_voci set odl = odsin where odl is null and odsin is not null;

-- 1b) migra i JSON campi-info: chiave odsin→odl; etichetta "ODSIN"→"ODS/ODL"
--     (le etichette personalizzate diverse da "ODSIN" vengono conservate)
update rapportino_template t
set info_campi = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(t.info_campi) e)
where t.info_campi @> '[{"chiave":"odsin"}]';

update rapportini r
set info_snapshot = (
  select jsonb_agg(
    case when e->>'chiave' = 'odsin'
      then jsonb_set(
             case when e->>'etichetta' = 'ODSIN'
                  then jsonb_set(e, '{etichetta}', '"ODS/ODL"') else e end,
             '{chiave}', '"odl"')
      else e end)
  from jsonb_array_elements(r.info_snapshot) e)
where r.info_snapshot @> '[{"chiave":"odsin"}]';

-- ── FASE 2 (dopo che il nuovo codice è in produzione e stabile) ───────────────
-- Ri-backfill (copre eventuali voci scritte dal codice vecchio nella finestra) + drop.
-- update rapportino_voci set odl = odsin where odl is null and odsin is not null;
-- alter table rapportino_voci drop column if exists odsin;
