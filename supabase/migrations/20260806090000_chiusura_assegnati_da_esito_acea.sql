-- supabase/migrations/20260806090000_chiusura_assegnati_da_esito_acea.sql
--
-- Interventi ACEA rimasti in ASSEGNATO il cui ordine ACEA ha però già chiuso (decisione utente
-- 2026-08-06: «chiudi quegli interventi che sono in affidato come riportato da ACEA»).
--
-- Sono il residuo che l'audit non segnalava più: dal 2026-08-05 un ordine archiviato NEGATIVO da
-- ACEA e non positivo da noi è «concorde» e tace (i 639). Giusto per il SAL — non c'è denaro da
-- reclamare — ma il nostro intervento restava aperto per sempre, e un assegnato del 22/07 che
-- nessuno chiuderà mai sporca le liste di lavoro e i conteggi degli aperti.
--
-- Al 2026-08-06 sono 101 interventi su 93 ODL, TUTTI con esito ACEA negativo (nessun positivo, e
-- nessuno con un positivo altrove sullo stesso ODL): NPRT 70, NMNT 16, NIAN 6, NICA/NCOP/NNCT 2
-- ciascuno, NCPT/NOFN/NAID 1. Si chiudono come li ha chiusi ACEA: `completato` + `esito NULL` +
-- motivazione con la causale — la stessa forma di una voce rossa nei rapportini.
--
-- Guardie (la migration resta corretta anche se rigirata su dati diversi):
--  1. solo `assegnato`, solo committenti ACEA, solo ODL valorizzato;
--  2. ACEA deve averlo chiuso: ultimo tentativo del registro `COMP` (max numero operazione) o
--     portale COMPLETATO;
--  3. l'esito ACEA deve essere NEGATIVO — esito non positivo E causale non pagabile (non `E%`).
--     Un positivo NON si chiude qui: varrebbe denaro e vuole il suo rapportino;
--  4. nessuna voce di rapportino che dichiari «eseguito = SI» (contraddirebbe la chiusura);
--  5. nessun `esito_motivo` già scritto: quello che c'è resta, non lo si sovrascrive.
with ultimo as (
  select distinct on (btrim(o.odl))
         btrim(o.odl) as odl,
         o.stato,
         coalesce(o.esito_positivo, false) as positivo,
         coalesce(btrim(o.causale), '') as causale,
         coalesce(btrim(o.causale_desc), '') as causale_desc,
         o.data_completamento::date as compl
  from acea_ordini o
  where btrim(coalesce(o.odl, '')) <> ''
  order by btrim(o.odl),
           (coalesce(nullif(regexp_replace(o.numero_operazione, '\D', '', 'g'), ''), '0'))::int desc
),
portale as (
  select distinct btrim(odl) as odl, stato_norm, coalesce(btrim(causa_scostamento), '') as causa
  from acea_portale_snapshot
)
update interventi i
set stato = 'completato',
    esito = null,
    esito_motivo = 'Chiuso da esito ACEA: '
      || coalesce(nullif(u.causale, ''), nullif(p.causa, ''), 'ordine chiuso senza causale')
      || case when coalesce(u.causale_desc, '') <> '' then ' — ' || u.causale_desc else '' end,
    chiuso_at = coalesce(
      i.chiuso_at,
      ((coalesce(u.compl, i.data)::date + time '18:00') at time zone 'Europe/Rome')
    )
from ultimo u
full join portale p on p.odl = u.odl
where btrim(coalesce(i.odl, '')) = coalesce(u.odl, p.odl)
  and i.stato = 'assegnato'
  and lower(btrim(coalesce(i.committente, ''))) in ('acea', 'lim_massive')
  and btrim(coalesce(i.odl, '')) <> ''
  and coalesce(btrim(i.esito_motivo), '') = ''
  -- ACEA lo ha chiuso…
  and (u.stato = 'COMP' or p.stato_norm = 'COMPLETATO')
  -- …e lo ha chiuso NEGATIVO (mai i positivi: quelli valgono denaro e vogliono il rapportino)
  and not coalesce(u.positivo, false)
  and coalesce(nullif(u.causale, ''), nullif(p.causa, ''), '') not like 'E%'
  and not exists (
    select 1 from rapportino_voci v
    where v.intervento_id = i.id
      and upper(btrim(coalesce(v.risposte->>'eseguito', ''))) = 'SI'
  );
