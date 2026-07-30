-- ============================================================================
-- MODULO ACEA — pianificazione a metà: l'appunto prima dell'intervento
-- ============================================================================
-- Un intervento richiede SEMPRE operatore e giorno: `interventi.data` è NOT NULL e senza
-- `staff_id` non c'è nessuno a cui mandare il rapportino. Finora questo significava che scrivere
-- una sola delle due celle veniva rifiutato con «servono sia operatore sia data», e chi stava
-- pianificando perdeva l'annotazione: sapeva già a chi darlo, non ancora quando.
--
-- Queste due colonne sono l'appunto: si scrivono su `acea_ordini` — come `note`, e per lo stesso
-- motivo — perché devono poter esistere PRIMA che l'intervento ci sia. Non appena la coppia si
-- completa, l'intervento nasce e l'appunto viene cancellato: non è una seconda fonte di verità
-- della pianificazione, è ciò che c'è finché la pianificazione non esiste.
--
-- La rete che le rende sicure sta altrove, nel motore rapportini: un giorno con righe a metà si
-- rifiuta di generare finché non lo si conferma esplicitamente. Un appunto che non diventa
-- intervento non produce nessun rapportino, e nessuno se ne accorgerebbe.

alter table public.acea_ordini
  add column if not exists pianificato_a_bozza  uuid references public.staff(id) on delete set null,
  add column if not exists pianificato_il_bozza date;

comment on column public.acea_ordini.pianificato_a_bozza is
  'Appunto: operatore scelto ma giorno non ancora deciso. Azzerata quando nasce l''intervento.';
comment on column public.acea_ordini.pianificato_il_bozza is
  'Appunto: giorno scelto ma operatore non ancora deciso. Azzerata quando nasce l''intervento.';

-- Il motore rapportini chiede «questo giorno ha righe a metà?» a ogni generazione: senza indice
-- è una scansione dell'intero registro (5.000+ righe) per una domanda che si fa ogni volta.
-- Parziale: le righe con l'appunto sono una manciata, quelle senza sono tutte le altre.
create index if not exists idx_acea_ordini_bozza_il
  on public.acea_ordini (pianificato_il_bozza)
  where pianificato_il_bozza is not null;

-- I privilegi restano quelli della 20260727090500: `authenticated` ha solo SELECT su
-- `acea_ordini`, e queste due colonne le scrive il service role dalle rotte. Nessun grant nuovo —
-- aggiungerlo aprirebbe una scrittura diretta dal browser su una tabella dichiarata immutabile.
