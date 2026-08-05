-- Aggancio appuntamento → riga del registro ordini, per AcquaLatina (dove fissare un
-- appuntamento senza partire da un ordine esistente non ha senso: il PDR/nominativo/indirizzo
-- vengono dal registro, non da testo libero).
--
-- Niente FK: `ordine_id` può puntare a `acqualatina_ordini.id` oggi, e in futuro eventualmente
-- ad `acea_ordini.id` per altri committenti — due tabelle diverse, risolte da
-- `committenti.codice`, esattamente come `interventi.ordine_id` (migration 20260802120000).
alter table public.appointments
  add column if not exists ordine_id uuid;

comment on column public.appointments.ordine_id is
  'Riferimento LOGICO alla riga di registro agganciata (acqualatina_ordini.id oggi — niente FK: '
  'tabella diversa secondo committente, come interventi.ordine_id). NULL per gli appuntamenti '
  'senza aggancio (committenti diversi da AcquaLatina, o storico pre-feature).';

create index if not exists appointments_ordine_id_idx
  on public.appointments (ordine_id)
  where ordine_id is not null;
