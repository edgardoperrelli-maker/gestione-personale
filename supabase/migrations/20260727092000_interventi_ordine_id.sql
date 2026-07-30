-- ============================================================================
-- MODULO ACEA — collegamento intervento ↔ ordine di commessa
-- Piano: docs/superpowers/plans/2026-07-26-acea-modulo-fase1.md (Task 1.3)
-- ============================================================================
-- `interventi` resta la PIANIFICAZIONE (chi, quando, esito): non assorbe i campi ACEA.
-- Questa colonna è il ponte verso il registro `acea_ordini`.
--
-- ON DELETE SET NULL, non CASCADE: quando un ordine annullato da ACEA viene rimosso dal
-- registro, l'intervento che avevamo pianificato (ed eventualmente eseguito, con rapportino e
-- foto) NON deve sparire. Perde il collegamento e resta, con la sua storia.

alter table public.interventi
  add column if not exists ordine_id uuid references public.acea_ordini(id) on delete set null;

create index if not exists interventi_ordine_id_idx on public.interventi (ordine_id)
  where ordine_id is not null;

comment on column public.interventi.ordine_id is
  'Ordine ACEA di provenienza (acea_ordini.id). NULL per gli interventi non ACEA, per quelli '
  'manuali e per quelli il cui ordine è stato annullato e rimosso dal registro.';

-- ---------------------------------------------------------------------------
-- Backfill: si esegue DOPO il primo import, quando acea_ordini è popolata.
-- L'aggancio è per ODL: interventi non porta il numero operazione, e i pochi ordini con due
-- operazioni (3 su 5.290 nell'export di riferimento) non sono distinguibili lato nostro.
-- Si aggancia quindi la PRIMA operazione dell'ordine, in modo deterministico.
--
--   update public.interventi i
--      set ordine_id = o.id
--     from (
--       select distinct on (odl) odl, id
--         from public.acea_ordini
--        order by odl, numero_operazione
--     ) o
--    where i.ordine_id is null
--      and i.odl is not null
--      and i.committente in ('acea', 'lim_massive')
--      and o.odl = i.odl;
--
-- Lasciato commentato di proposito: eseguirlo qui, su un registro vuoto, non aggancerebbe nulla
-- e darebbe la falsa impressione che il backfill sia stato fatto.
-- ---------------------------------------------------------------------------
