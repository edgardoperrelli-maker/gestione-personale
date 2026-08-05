-- supabase/migrations/20260805150000_riaggancio_voci_orfane_e_positivi_persi.sql
--
-- Caso scoperto dall'ODL 957327236 (2026-08-05): la voce di rapportino del 23/06 dichiara
-- «ESEGUITO SI» ma ha `intervento_id NULL` — orfana. Senza aggancio il SI non è mai arrivato
-- all'intervento (rimasto `assegnato`), il motore economico lo leggeva negativo e l'ODL finiva
-- fra i «completati ACEA senza rapportino», mentre lo Storico (che legge la voce) mostrava SI.
--
-- Origini delle orfane: il fallback FK-race della generazione (insert con intervento_id NULL
-- «da ricollegare alla generazione successiva» che per i giri già lavorati non arriva mai) e le
-- voci compilate prima che l'auto-aggancio al salvataggio esistesse. Al 2026-08-05: 267 voci
-- orfane (79 con SI), di cui 54 ricollegabili con certezza, più 32 voci SI GIÀ collegate ma con
-- l'esito mai propagato (11 su annullati legittimi di bonifica: quelli non si toccano).
--
-- Tre livelli di aggancio, dal più forte: si scrive SOLO con candidato UNICO e non annullato.
--  T1. stesso ODL + stesso operatore + stessa data del rapportino;
--  T2. stesso ODL, unico in assoluto;
--  T3. stessa matricola + stesso operatore + stessa data (per voci senza ODL).
-- Poi i POSITIVI: ogni voce SI collegata il cui intervento non è annullato, senza esito, senza
-- motivazione e senza un ALTRO positivo sullo stesso ODL (invariante «un ODL un positivo»)
-- porta l'intervento a completato/eseguito_positivo — è ciò che la propagazione avrebbe fatto
-- al momento dell'invio. Una voce SI su intervento con motivo scritto resta materia umana.
-- Idempotente: ogni passo ha guardie che al secondo giro non trovano più nulla.

-- T1 · ODL + operatore + data
update rapportino_voci v
set intervento_id = c.int_id
from (
  select o.voce_id, (min(i.id::text))::uuid as int_id
  from (
    select v2.id as voce_id,
           nullif(btrim(coalesce(nullif(btrim(coalesce(v2.odl,'')),''), v2.raw_json->>'odl', v2.raw_json->>'odsin')),'') as odl,
           r2.staff_id::text as staff_id, r2.data
    from rapportino_voci v2
    join rapportini r2 on r2.id = v2.rapportino_id
    where v2.intervento_id is null
  ) o
  join interventi i
    on o.odl is not null
   and btrim(coalesce(i.odl,'')) = o.odl
   and coalesce(i.staff_id::text,'') = coalesce(o.staff_id,'')
   and i.data = o.data
   and i.stato <> 'annullato'
  group by o.voce_id
  having count(distinct i.id) = 1
) c
where v.id = c.voce_id and v.intervento_id is null;

-- T2 · ODL unico in assoluto (non annullato)
update rapportino_voci v
set intervento_id = c.int_id
from (
  select o.voce_id, (min(i.id::text))::uuid as int_id
  from (
    select v2.id as voce_id,
           nullif(btrim(coalesce(nullif(btrim(coalesce(v2.odl,'')),''), v2.raw_json->>'odl', v2.raw_json->>'odsin')),'') as odl
    from rapportino_voci v2
    where v2.intervento_id is null
  ) o
  join interventi i
    on o.odl is not null
   and btrim(coalesce(i.odl,'')) = o.odl
   and i.stato <> 'annullato'
  group by o.voce_id
  having count(distinct i.id) = 1
) c
where v.id = c.voce_id and v.intervento_id is null;

-- T3 · matricola + operatore + data (voci senza ODL)
update rapportino_voci v
set intervento_id = c.int_id
from (
  select o.voce_id, (min(i.id::text))::uuid as int_id
  from (
    select v2.id as voce_id,
           nullif(btrim(coalesce(nullif(btrim(coalesce(v2.odl,'')),''), v2.raw_json->>'odl', v2.raw_json->>'odsin')),'') as odl,
           nullif(btrim(coalesce(nullif(btrim(coalesce(v2.matricola,'')),''), v2.raw_json->>'matricola')),'') as matricola,
           r2.staff_id::text as staff_id, r2.data
    from rapportino_voci v2
    join rapportini r2 on r2.id = v2.rapportino_id
    where v2.intervento_id is null
  ) o
  join interventi i
    on o.odl is null
   and o.matricola is not null
   and btrim(coalesce(i.matricola_contatore,'')) = o.matricola
   and coalesce(i.staff_id::text,'') = coalesce(o.staff_id,'')
   and i.data = o.data
   and i.stato <> 'annullato'
  group by o.voce_id
  having count(distinct i.id) = 1
) c
where v.id = c.voce_id and v.intervento_id is null;

-- POSITIVI PERSI · voce SI collegata, intervento mai chiuso positivo.
-- `distinct on` sull'ODL (a parità, vince il rapportino più recente: l'ultimo tentativo fa
-- fede) così due voci SI sullo stesso ODL non violano l'indice unico parziale dei positivi;
-- gli interventi senza ODL non collassano fra loro (chiave di ripiego: l'id).
update interventi i
set stato = 'completato',
    esito = 'eseguito_positivo',
    chiuso_at = coalesce(i.chiuso_at, (best.rap_data::date + time '18:00') at time zone 'Europe/Rome')
from (
  select distinct on (coalesce(nullif(btrim(coalesce(i2.odl,'')),''), i2.id::text))
         i2.id, r.data as rap_data
  from rapportino_voci v
  join rapportini r on r.id = v.rapportino_id
  join interventi i2 on i2.id = v.intervento_id
  where upper(btrim(coalesce(v.risposte->>'eseguito',''))) = 'SI'
    and i2.stato <> 'annullato'
    and i2.esito is null
    and coalesce(btrim(i2.esito_motivo),'') = ''
    and not exists (
      select 1 from interventi o
      where btrim(coalesce(o.odl,'')) = btrim(coalesce(i2.odl,''))
        and coalesce(btrim(i2.odl),'') <> ''
        and o.id <> i2.id
        and o.esito = 'eseguito_positivo'
    )
  order by coalesce(nullif(btrim(coalesce(i2.odl,'')),''), i2.id::text), r.data desc
) best
where i.id = best.id;
