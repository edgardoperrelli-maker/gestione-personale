-- Collega una richiesta manuale "+" al task-via padre (voce di pianificazione
-- con attività BONIFICHE EXTRA). Nullable e additivo: le richieste senza parent
-- restano valide e invariate.
alter table interventi_manuali
  add column if not exists parent_voce_id uuid;
