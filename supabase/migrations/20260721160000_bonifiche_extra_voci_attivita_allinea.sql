-- supabase/migrations/20260721160000_bonifiche_extra_voci_attivita_allinea.sql
-- Allineamento storico dell'ATTIVITÀ dei "+" creati sotto un task-via (voce contenitore
-- BONIFICHE EXTRA). Regola di business: un intervento fatto sulla via-contenitore di un
-- task-via è SEMPRE BONIFICHE EXTRA.
--
-- La classificazione dell'INTERVENTO era già stata sistemata
-- (20260721150000_bonifiche_extra_figli_classificazione.sql), ma restavano disallineati:
--   1. la VOCE figlia del rapportino (rapportino_voci.attivita) conservava l'attività scelta
--      dall'operatore nella lista Italgas completa (bug della select, es. "S-PR-003 A") →
--      rapportino/PDF mostravano un'attività diversa dall'intervento creato;
--   2. il payload della richiesta (interventi_manuali.dati_correnti) conservava la stessa
--      attività → una futura approvazione l'avrebbe ri-scritta sulla voce e il pannello di
--      revisione mostrava il valore sbagliato pre-selezionato.
--
-- Qui riallineiamo entrambi a 'BONIFICHE EXTRA'. Il codice (route "+"/approvazione) ora forza
-- la stessa regola sui nuovi (server autorevole), quindi questa è una pulizia una-tantum.
-- Idempotente: agisce solo dove il valore differisce da 'BONIFICHE EXTRA'.

-- 1) Voce FIGLIA del "+" (interventi_manuali.voce_id): rapportino_voci.attivita → 'BONIFICHE EXTRA'.
update rapportino_voci cv
set attivita = 'BONIFICHE EXTRA'
from interventi_manuali im
join rapportino_voci pv on pv.id = im.parent_voce_id
where im.voce_id = cv.id
  and attivita_norm(pv.attivita) = 'BONIFICHE EXTRA'
  and attivita_norm(cv.attivita) is distinct from 'BONIFICHE EXTRA';

-- 2) Payload corrente della richiesta: dati_correnti->anagrafica->>attivita → 'BONIFICHE EXTRA'.
--    Guida approvazione + pannello di revisione. Solo dove anagrafica è un oggetto e differisce.
--    dati_operatore resta lo snapshot originale dell'operatore (audit), non lo tocchiamo.
update interventi_manuali im
set dati_correnti = jsonb_set(im.dati_correnti, '{anagrafica,attivita}', '"BONIFICHE EXTRA"', true)
from rapportino_voci pv
where pv.id = im.parent_voce_id
  and attivita_norm(pv.attivita) = 'BONIFICHE EXTRA'
  and jsonb_typeof(im.dati_correnti->'anagrafica') = 'object'
  and attivita_norm(im.dati_correnti->'anagrafica'->>'attivita') is distinct from 'BONIFICHE EXTRA';
