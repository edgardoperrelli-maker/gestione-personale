-- supabase/migrations/20260721150000_bonifiche_extra_figli_classificazione.sql
-- Regola di business: gli interventi fatti sulla via-contenitore di un task-via (voce
-- BONIFICHE EXTRA) vanno SEMPRE associati al committente Italgas e al gruppo attività
-- BONIFICHE EXTRA. I figli storici erano stati creati senza attività (gruppo null), quindi
-- non comparivano raggruppati sotto le bonifiche extra. Qui li riclassifichiamo.
-- Il codice (richiestaToIntervento + route "+"/approvazione) applica la stessa regola sui nuovi.
-- Idempotente: agisce solo dove almeno un campo differisce dal target.

update interventi i
set committente     = 'italgas',
    intervento_tipo = 'BONIFICHE EXTRA',
    gruppo_attivita = 'BONIFICHE EXTRA'
from interventi_manuali im
join rapportino_voci pv on pv.id = im.parent_voce_id
where im.intervento_id = i.id
  and attivita_norm(pv.attivita) = 'BONIFICHE EXTRA'
  and (
        i.committente     is distinct from 'italgas'
     or i.intervento_tipo is distinct from 'BONIFICHE EXTRA'
     or i.gruppo_attivita is distinct from 'BONIFICHE EXTRA'
  );
