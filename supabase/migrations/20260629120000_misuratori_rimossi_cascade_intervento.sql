-- Bug: un ordine resta "doppio" nel modulo Misuratori Rimossi anche dopo aver
-- eliminato l'intervento dal modulo Interventi.
--
-- Causa: i FK misuratori_rimossi.intervento_id e misuratori_riconsegna.intervento_id
-- erano ON DELETE SET NULL. Eliminando un intervento, la riga del registro NON veniva
-- rimossa: il suo intervento_id diventava NULL e la riga restava orfana per sempre nel
-- modulo (visibile come duplicato impossibile da cancellare, e non più ricalcolabile dal
-- "Ricalcola" che lavora per intervento_id).
--
-- Fix: ON DELETE CASCADE. Il registro rispecchia esattamente gli interventi di rimozione
-- esistenti: se l'intervento sparisce, sparisce anche la sua riga di registro.
--
-- Sicuro rispetto alla rigenerazione piani: planInterventi() elimina SOLO interventi non
-- terminali (mai 'completato'), e le righe di registro esistono solo per interventi
-- completati → la rigenerazione di routine non fa mai cascata su righe legittime.

-- 1) misuratori_rimossi.intervento_id → ON DELETE CASCADE
alter table public.misuratori_rimossi
  drop constraint if exists misuratori_rimossi_intervento_id_fkey;
alter table public.misuratori_rimossi
  add constraint misuratori_rimossi_intervento_id_fkey
  foreign key (intervento_id) references public.interventi(id) on delete cascade;

-- 2) misuratori_riconsegna.intervento_id → ON DELETE CASCADE
alter table public.misuratori_riconsegna
  drop constraint if exists misuratori_riconsegna_intervento_id_fkey;
alter table public.misuratori_riconsegna
  add constraint misuratori_riconsegna_intervento_id_fkey
  foreign key (intervento_id) references public.interventi(id) on delete cascade;

-- 3) Pulizia degli orfani già accumulati (intervento eliminato in passato → riga senza
--    intervento_id). Sono snapshot di interventi non più esistenti: vanno rimossi.
delete from public.misuratori_rimossi where intervento_id is null;
delete from public.misuratori_riconsegna where intervento_id is null;
