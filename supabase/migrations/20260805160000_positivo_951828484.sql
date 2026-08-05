-- supabase/migrations/20260805160000_positivo_951828484.sql
--
-- ODL 951828484 (Rimozione impianto abusivo, Tivoli) a POSITIVO — decisione utente 2026-08-05.
--
-- Era una delle 2 «contraddizioni» lasciate all'ufficio dalla sanatoria 20260805150000:
-- l'intervento (17/06) portava «Nessun passaggio» dal primo giro, ma il riaggancio ha
-- ricollegato la voce di rapportino del 19/06 che dichiara «ESEGUITO SI» — lo stesso giorno in
-- cui il registro Cruscotto dà l'ordine ESEGUITO da Giosi (causale EIES, operazione 0030), poi
-- pagato da ACEA nel SAL 1. Tre fonti concordi: l'ultimo tentativo è positivo, il motivo
-- negativo apparteneva al passaggio precedente e si azzera.
--
-- Guardie (idempotente): esito ancora null, non annullato, la voce SI collegata esiste,
-- nessun altro positivo sull'ODL (invariante «un ODL un positivo»).
update interventi i
set stato = 'completato',
    esito = 'eseguito_positivo',
    esito_motivo = null,
    chiuso_at = coalesce(i.chiuso_at, (date '2026-06-19' + time '18:00') at time zone 'Europe/Rome')
where btrim(coalesce(i.odl,'')) = '951828484'
  and i.stato <> 'annullato'
  and i.esito is null
  and exists (
    select 1 from rapportino_voci v
    where v.intervento_id = i.id
      and upper(btrim(coalesce(v.risposte->>'eseguito',''))) = 'SI'
  )
  and not exists (
    select 1 from interventi o
    where btrim(coalesce(o.odl,'')) = '951828484'
      and o.id <> i.id
      and o.esito = 'eseguito_positivo'
  );
