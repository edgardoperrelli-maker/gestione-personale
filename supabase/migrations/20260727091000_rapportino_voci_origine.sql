-- ============================================================================
-- MODULO ACEA — origine delle voci di rapportino
-- Piano: docs/superpowers/plans/2026-07-26-acea-modulo-fase1.md (Task 1.2)
-- ============================================================================
-- PROBLEMA. `sincronizzaRapportini` ricostruisce le voci di un rapportino cancellando tutte
-- quelle NON manuali (`.eq('manuale', false)`) e rigenerandole dai task del piano. Con la regola
-- "un rapportino per operatore per giorno", un rapportino nato da un piano Italgas può ospitare
-- voci ACEA: alla prima rigenerazione del piano Italgas quelle voci verrebbero rase via in
-- silenzio.
--
-- SOLUZIONE. Una colonna `origine` esplicita, e il motore Italgas che cancella SOLO le proprie
-- voci (`origine = 'task'`). Riusare `manuale = true` per le voci ACEA sarebbe stato più veloce
-- ma le avrebbe fatte finire nella corsia degli interventi manuali e nell'export limitazioni
-- massive, che filtrano proprio su quel flag: effetti collaterali su approvazioni e conteggi.
--
--   'task'    → generata dai task di un piano Mappa (comportamento storico)
--   'manuale' → creata dal "+" dell'operatore in campo
--   'acea'    → aggiunta dal motore ACEA a un rapportino esistente
--
-- Additiva e retro-compatibile: il default 'task' riproduce esattamente il comportamento attuale
-- per tutte le righe esistenti.

alter table public.rapportino_voci
  add column if not exists origine text not null default 'task';

-- Il check si aggiunge dopo il backfill, così una riga storica incoerente non blocca la migration.
update public.rapportino_voci
   set origine = 'manuale'
 where manuale = true
   and origine <> 'manuale';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rapportino_voci_origine_check'
       and conrelid = 'public.rapportino_voci'::regclass
  ) then
    alter table public.rapportino_voci
      add constraint rapportino_voci_origine_check
      check (origine in ('task', 'manuale', 'acea'));
  end if;
end $$;

-- Il motore filtra per (rapportino_id, origine) a ogni sync: senza indice è un seq scan per
-- rapportino a ogni rigenerazione di piano.
create index if not exists rapportino_voci_origine_idx
  on public.rapportino_voci (rapportino_id, origine);

comment on column public.rapportino_voci.origine is
  'Chi ha creato la voce: task (piano Mappa) | manuale (il "+" dell''operatore) | acea (motore '
  'ACEA su rapportino esistente). Il motore Italgas cancella e rigenera SOLO le voci origine=task.';
