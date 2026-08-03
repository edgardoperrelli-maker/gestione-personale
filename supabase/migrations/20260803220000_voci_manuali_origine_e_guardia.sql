-- Le voci del «+» tornano `origine = 'manuale'`, e il database impedisce che si ripeta.
--
-- IL DIFETTO
-- `rapportino_voci.origine` nasce il 27/07 (20260727091000) con default `'task'`, e nello stesso
-- rilascio `sincronizzaRapportini` passa da «cancella le voci con manuale=false» a «cancella le
-- voci con origine='task'». Quella migration ha però riallineato solo le righe ESISTENTI
-- (`update ... where manuale = true`); i due costruttori che scrivono voci manuali —
-- `buildVoceManuale` (il «+» dell'operatore) e `buildVoceConsuntivo` (Nuovo ordine) — non sono
-- stati aggiornati e da allora lasciano `origine` al default.
--
-- COSA COMPORTAVA
-- Una voce del «+» nasceva quindi indistinguibile da una voce del motore. Alla prima
-- rigenerazione del piano il motore la cancellava come propria e NON la ricreava, perché non
-- corrisponde a nessun task del piano: l'intervento aggiunto in campo spariva dal rapportino
-- senza un errore, senza una traccia, e senza che nessuno l'avesse chiesto.
--
-- Al momento di questa migration: 2.461 voci manuali corrette (fino al 24/07) e 94 rotte (dal
-- 27/07). Erano 107 poco prima: le altre 13 erano già state cancellate da una rigenerazione.
--
-- LA CORREZIONE
-- 1. I due costruttori ora scrivono `origine: 'manuale'` (fix nel codice).
-- 2. Qui si riallineano le righe già scritte male, con lo stesso criterio della 20260727091000.
-- 3. Un CHECK rende l'invariante impossibile da violare: una voce marcata manuale non può
--    dichiararsi 'task'. Se un domani un terzo costruttore dimenticasse `origine`, l'insert
--    fallisce subito e a voce alta — che è infinitamente meglio di una voce che sparisce in
--    silenzio tre giorni dopo. I due scrittori odierni sono corretti, quindi il vincolo non
--    blocca nulla di ciò che gira oggi.

update public.rapportino_voci
   set origine = 'manuale'
 where manuale = true
   and origine = 'task';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rapportino_voci_manuale_non_task_check'
       and conrelid = 'public.rapportino_voci'::regclass
  ) then
    alter table public.rapportino_voci
      add constraint rapportino_voci_manuale_non_task_check
      check (not (manuale and origine = 'task'));
  end if;
end $$;

comment on column public.rapportino_voci.origine is
  'Chi possiede la voce: task = generata dai task di un piano Mappa (sincronizzaRapportini la cancella e rigenera), manuale = creata dal + dell''operatore o dal Nuovo ordine, acea = aggiunta dal motore ACEA. Il default è ''task'': chi scrive una voce NON del motore deve valorizzarla, altrimenti la rigenerazione del piano se la porta via.';
