-- supabase/migrations/20260721140000_backfill_territorio_e_link_taskvia.sql
-- Backfill del fix "bonifiche extra / territorio nello storico".
-- Contesto: lo storico interventi legge le rapportino_voci collegate + i P.I. Le voci task-via
-- (attività BONIFICHE EXTRA) non hanno ODL/matricola/PDR, quindi in passato NON si agganciavano
-- al loro intervento → territorio non risolto → invisibili al filtro Territorio. Inoltre gli
-- interventi manuali storici sono quasi tutti privi di territorio (il "+" non lo assegnava).
-- Questa migration ripara i dati esistenti; il codice previene i nuovi casi.
-- Entrambi i passi sono GUARDATI e IDEMPOTENTI: agiscono solo dove il valore manca / è univoco.

-- ── (a) Collega le voci task-via scollegate al loro intervento bonifiche-extra ───────────────
-- Match per piano (via rapportino) + operatore + via normalizzata, SOLO se esiste un unico
-- intervento del gruppo BONIFICHE EXTRA che combacia (n = 1). I figli sulla stessa via hanno un
-- gruppo diverso e non entrano nel match.
with candidati as (
  select v.id                as voce_id,
         min(i.id::text)     as intervento_id,
         count(distinct i.id) as n
  from rapportino_voci v
  join rapportini r on r.id = v.rapportino_id
  join interventi i
    on i.piano_id = r.piano_id
   and i.staff_id::text = r.staff_id::text
   and i.gruppo_attivita = 'BONIFICHE EXTRA'
   and lower(btrim(i.indirizzo)) = lower(btrim(v.via))
  where v.intervento_id is null
    and attivita_norm(v.attivita) = 'BONIFICHE EXTRA'
    and coalesce(btrim(v.via), '') <> ''
  group by v.id
)
update rapportino_voci v
set intervento_id = c.intervento_id::uuid
from candidati c
where v.id = c.voce_id and c.n = 1;

-- ── (b) Assegna il territorio agli interventi manuali storici che ne sono privi ──────────────
-- Territorio del piano dell'operatore: override per-operatore del rapportino se presente,
-- altrimenti il territorio del piano. Solo dove risolve a un territories.id (sub.tid non null).
update interventi i
set territorio_id = sub.tid
from (
  select i2.id,
         coalesce(
           (select t.id from rapportini r
              join territories t on lower(t.name) = lower(btrim(r.territorio_override))
             where r.piano_id = i2.piano_id
               and r.staff_id::text = i2.staff_id::text
               and coalesce(btrim(r.territorio_override), '') <> ''
             limit 1),
           (select t.id from mappa_piani mp
              join territories t on lower(t.name) = lower(btrim(mp.territorio))
             where mp.id = i2.piano_id
             limit 1)
         ) as tid
  from interventi i2
  where i2.origine = 'manuale'
    and i2.territorio_id is null
    and i2.piano_id is not null
) sub
where i.id = sub.id and sub.tid is not null;
