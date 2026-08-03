-- Rimette sul rapportino di LIBERATORI ADRIANO le 9 voci del «+» che il motore ha cancellato.
--
-- COSA ERA SUCCESSO
-- È il difetto chiuso dalla 20260803220000, colto sul fatto. Le sue 9 richieste manuali del
-- 03/08 (commessa ACQUA LATINA) sono nate con `origine` al default 'task': alla rigenerazione
-- del piano `sincronizzaRapportini` le ha cancellate come voci proprie e non le ha ricreate,
-- perché quegli ODL non sono task del piano. Restano la richiesta (approvata) e l'intervento
-- (completato): sparita solo la voce, cioè l'unica cosa che il rapportino mostra.
--
-- PERCHÉ SI RICOSTRUISCE PER INTERO, RISPOSTE COMPRESE
-- `interventi_manuali.dati_correnti` conserva lo snapshot completo di ciò che l'operatore ha
-- dichiarato — `risposte` e `anagrafica` — ed è il dato che il backoffice ha approvato. Qui non
-- si deduce e non si inventa niente: si rimette in `rapportino_voci` quello che è già scritto
-- nella richiesta. È la differenza con il rapportino di Pastorelli, dove le richieste erano
-- state cancellate a cascata e delle risposte non restava nulla.
--
-- Le voci rinascono `manuale = true` e `origine = 'manuale'`: così il motore non le rivendica
-- più (ed è anche l'unica combinazione che il nuovo CHECK ammette per una voce manuale).
-- `richiesta_id` le riaggancia alla loro richiesta, ricucendo la catena richiesta → voce.
--
-- Idempotente: se la voce di quella richiesta è già tornata, non fa niente.

do $$
declare
  v_ordine int;
  v_voci   int;
begin
  select coalesce(max(ordine), 0) into v_ordine
  from rapportino_voci where rapportino_id = '93c51d25-8dd5-438d-83fb-b9262935772d';

  with da_ripristinare as (
    select m.*, i.matricola_contatore, i.pdr, i.cap, i.fascia_oraria, i.gruppo_attivita,
           row_number() over (order by m.created_at) as pos
    from interventi_manuali m
    left join interventi i on i.id = m.intervento_id
    where m.committente = 'acqualatina'
      and m.staff_name = 'LIBERATORI ADRIANO'
      and m.stato in ('approvato', 'auto_liberi')
      and not exists (select 1 from rapportino_voci v where v.richiesta_id = m.id)
      and not exists (
        select 1 from rapportino_voci v
        where m.intervento_id is not null and v.intervento_id = m.intervento_id
      )
  )
  insert into rapportino_voci (
    rapportino_id, richiesta_id, intervento_id, ordine, manuale, origine, approvazione_stato,
    odl, nominativo, matricola, pdr, via, comune, cap, recapito, attivita, fascia_oraria,
    raw_json, risposte
  )
  select
    d.rapportino_id,
    d.id,
    d.intervento_id,
    v_ordine + d.pos,
    true,
    'manuale',
    'approvato',
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'odl'), ''),
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'nominativo'), ''),
    coalesce(nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'matricola'), ''), d.matricola_contatore),
    coalesce(nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'pdr'), ''), d.pdr),
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'via'), ''),
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'comune'), ''),
    coalesce(nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'cap'), ''), d.cap),
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'recapito'), ''),
    nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'attivita'), ''),
    coalesce(nullif(trim(d.dati_correnti -> 'anagrafica' ->> 'fascia_oraria'), ''), d.fascia_oraria),
    jsonb_build_object('_nuovo', true, '_annullato', false, '_ripristino', true),
    coalesce(d.dati_correnti -> 'risposte', '{}'::jsonb)
  from da_ripristinare d;

  get diagnostics v_voci = row_count;
  raise notice 'LIBERATORI: % voci manuali rimesse sul rapportino.', v_voci;
end $$;
