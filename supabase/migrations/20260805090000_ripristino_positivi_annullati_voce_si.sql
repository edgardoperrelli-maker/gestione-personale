-- supabase/migrations/20260805090000_ripristino_positivi_annullati_voce_si.sql
--
-- Caso scoperto dall'ODL 957276247 (segnalazione utente 2026-08-05): interventi ACEA in stato
-- ANNULLATO la cui voce di rapportino dichiara «eseguito = SI». La UI dello Storico mostra SI
-- (legge la voce); il motore economico legge `interventi.esito`, che è rimasto NULL → il lavoro
-- spariva da produzione, Esitato ACEA e pre-SAL, e l'ODL finiva tra i «completati sul portale
-- senza riscontro nei rapportini». ACEA intanto li ha COMPLETATI e pagati (SAL 1, causali E%).
--
-- Al 2026-08-05 sono 12 interventi, tutti con voce SI e stato annullato:
--  - 8 hanno il positivo su un ALTRO intervento dello stesso ODL: sono i doppi positivi della
--    bonifica `20260720130000_odl_positivo_definitivo` — GIUSTI così, non si toccano;
--  - 4 (ODL 957276247, 957288742, 957289090, 957289357) non hanno NESSUN positivo sull'ODL e
--    nessuna motivazione di annullamento (i flussi dell'app un motivo lo scrivono sempre):
--    lavoro fatto e pagato, annullato senza firma. Questi si ripristinano.
--
-- Guardie (tutte e tre, così un annullamento legittimo non viene mai resuscitato):
--  1. la voce di rapportino dichiara SI;
--  2. l'ODL non ha alcun altro intervento eseguito_positivo (l'indice unico parziale
--     dell'invariante «un ODL un positivo» resta rispettato);
--  3. l'annullamento è senza motivazione (esito_motivo vuoto) e senza riferimento di
--     riconciliazione (non è un «doppio positivo» firmato dalla bonifica o dall'invio).
update interventi i
set stato = 'completato',
    esito = 'eseguito_positivo',
    chiuso_at = coalesce(i.chiuso_at, (i.data::date + time '18:00') at time zone 'Europe/Rome')
where i.stato = 'annullato'
  and i.esito is null
  and coalesce(btrim(i.esito_motivo), '') = ''
  and i.riconciliazione_rif_id is null
  and lower(btrim(coalesce(i.committente, ''))) in ('acea', 'lim_massive')
  and exists (
    select 1 from rapportino_voci v
    where v.intervento_id = i.id
      and upper(btrim(coalesce(v.risposte->>'eseguito', ''))) = 'SI'
  )
  and not exists (
    select 1 from interventi o
    where btrim(coalesce(o.odl, '')) = btrim(coalesce(i.odl, ''))
      and btrim(coalesce(i.odl, '')) <> ''
      and o.id <> i.id
      and o.esito = 'eseguito_positivo'
  );
