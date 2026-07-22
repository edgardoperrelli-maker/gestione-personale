-- Bonifica: annulla le pianificazioni da mappa senza descrizione attività.
--
-- 131 interventi 'assegnato' con intervento_tipo vuoto, residuo di
-- pianificazioni da mappa (giugno–luglio 2026, territorio PERUGIA/italgas)
-- mai eseguite: l'attività non è mai stata registrata (verificato: né sul
-- task d'origine del piano, né su voci/codice collegati) e non è deducibile
-- senza inventarla. Sono inerti (gruppo/voce NULL, non completate) ma
-- sporcano le viste di pianificazione. Il nuovo gate airtight impedisce che
-- se ne creino altre.
--
-- Solo stato 'assegnato' + descrizione vuota: le già-annullate (5) e la
-- singola completata (1, Firenze ODL 20043942334, esito "Assente") restano
-- invariate. Reversibile: backup completo prima dell'update.

create table if not exists public.bak_annul_pianif_vuote_20260722 as
select id, committente, stato, esito, esito_motivo, intervento_tipo, gruppo_attivita,
       data, piano_id, staff_id, updated_at
from public.interventi
where public.attivita_norm(coalesce(intervento_tipo,'')) = ''
  and stato = 'assegnato';

update public.interventi
set stato = 'annullato',
    esito_motivo = coalesce(esito_motivo, 'Pianificazione senza attività: annullata in bonifica tassonomia (2026-07-22)'),
    updated_at = now()
where public.attivita_norm(coalesce(intervento_tipo,'')) = ''
  and stato = 'assegnato';
