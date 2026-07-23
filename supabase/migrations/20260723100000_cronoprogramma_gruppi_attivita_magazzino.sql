-- Cronoprogramma — allineamento attività ai GRUPPI della tassonomia + collocamento magazzino.
--
-- 1) L'elenco condiviso "Gruppo Attività" (tabella activities, letta dal cronoprogramma via la
--    vista activities_renamed) passa ai gruppi reali della tassonomia interventi. Le attività
--    legacy di campo NON vengono cancellate (lo storico assignments referenzia activity_id e resta
--    valido anche per attività disattivate) ma messe active=false → non più selezionabili per nuove
--    assegnazioni. Sono riattivabili da Impostazioni ▸ Gruppo Attività.
-- 2) Un operatore può avere PIÙ attività nello stesso giorno: assignments.activity_ids uuid[].
--    Resta UNA riga per operatore/giorno (il vincolo unico uq_assignments_day_staff non cambia).
--    activity_id resta l'attività PRIMARIA (compat Mappa/Export/Produzione), sincronizzata dal trigger.

-- ── 1a) Gruppi tassonomia come attività attive (idempotente su name) ────────────────────────────
-- NB: il trigger trg_activities_normalize → rename_activity_label() canonicalizza in questo progetto
--   'ATTIVITA'' ALLA CLIENTELA' → 'CLIENTELA'  e  'CAMBIO CONTATORI' → 'CONTATORI'
-- quindi il gruppo tassonomia "ATTIVITA' ALLA CLIENTELA" nel cronoprogramma vive come CLIENTELA.
-- BONIFICHE e MAGAZZINO esistono già e restano attive.
insert into public.activities (name, active) values
  ('AGENDA AEREA', true),
  ('BONIFICHE EXTRA', true),
  ('DUNNING', true),
  ('LIMITAZIONI MASSIVE', true),
  ('P.I.', true),
  ('RISANAMENTO COLONNE', true)
on conflict (name) do update set active = true;

-- CLIENTELA = label canonica del gruppo ATTIVITA' ALLA CLIENTELA → attiva.
update public.activities set active = true where name = 'CLIENTELA';

-- ── 1b) Attività legacy NON riconducibili a un gruppo tassonomia → disattivate ──────────────────
-- Righe conservate (lo storico referenzia activity_id e resta valido); riattivabili da Impostazioni.
update public.activities
   set active = false
 where name in (
   'CONTATORI', 'MOROSITA''', 'MOROSITA'' COMPLESSE', 'PICARRO', 'RESINE', 'SOST. VALV.'
 );

-- ── 2a) Più attività per assegnazione ──────────────────────────────────────────────────────────
alter table public.assignments
  add column if not exists activity_ids uuid[] not null default '{}';

-- backfill: l'attività singola esistente diventa il primo (e unico) elemento dell'array
update public.assignments
   set activity_ids = array[activity_id]
 where activity_id is not null
   and (activity_ids is null or array_length(activity_ids, 1) is null);

-- ── 2b) Trigger di coerenza activity_id ⇄ activity_ids ─────────────────────────────────────────
-- Ogni write-path resta consistente:
--  • chi scrive solo activity_id (copia giorno/squadra legacy) → l'array viene derivato se vuoto;
--  • activity_id = prima attività dell'array (null se vuoto) = attività PRIMARIA per gli altri moduli.
create or replace function public.assignments_sync_activity_ids()
returns trigger
language plpgsql
as $$
begin
  if new.activity_ids is null then
    new.activity_ids := '{}';
  end if;
  -- write-path legacy: solo activity_id valorizzato, array vuoto → deriva l'array
  if array_length(new.activity_ids, 1) is null and new.activity_id is not null then
    new.activity_ids := array[new.activity_id];
  end if;
  -- attività primaria = primo elemento (null se l'array è vuoto)
  new.activity_id := new.activity_ids[1];
  return new;
end;
$$;

drop trigger if exists assignments_sync_activity_ids on public.assignments;
create trigger assignments_sync_activity_ids
  before insert or update on public.assignments
  for each row
  execute function public.assignments_sync_activity_ids();
