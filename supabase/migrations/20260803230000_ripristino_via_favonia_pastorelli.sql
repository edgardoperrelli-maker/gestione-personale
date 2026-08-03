-- Rimette a Pastorelli la lista di VIA FAVONIA del 03/08, e la riporta sul suo rapportino.
--
-- L'ERRORE DA RIPARARE
-- La 20260803200000 ha cancellato 30 interventi «assegnato» agganciati a un piano di cui il
-- loro operatore non faceva parte, classificandoli come irraggiungibili. Sul piano tecnico lo
-- erano; sul piano del lavoro no: erano la LISTA DI VIA FAVONIA di Pastorelli per il 03/08 —
-- mai eseguita, ma che il suo rapportino deve mostrare come «da fare». Cancellandola, il
-- rapportino è passato a 25 voci quando doveva mostrare l'intera giornata assegnata.
--
-- La condizione «l'operatore non è nel piano» descriveva un piano rotto, non un lavoro
-- inesistente: la conclusione giusta era riportare quel lavoro all'operatore, non rimuoverlo.
--
-- PERCHÉ SI PUÒ RICOSTRUIRE PER INTERO
-- `acqualatina_ordini` non è stato toccato: i 31 ordini di VIA FAVONIA (Terracina) sono tutti
-- ancora APERTI e nessuno di essi esiste oggi come intervento. Il registro è la fonte da cui
-- la pianificazione li pesca, e porta tutto ciò che serve: ODL, matricola, via/civico,
-- intestatario, recapito, impianto, attività.
--
-- Si ripristinano tutti e 31 gli ordini aperti della via, non 30: quale fosse il trentunesimo
-- rimasto fuori non è più distinguibile, e sono tutti lavoro reale della stessa via, assegnata
-- in esclusiva a Pastorelli.
--
-- COME
-- Gli interventi rinascono con `piano_id` nullo, come gli altri 25 superstiti di quel giorno:
-- il piano non esiste più e non va reinventato. Stato `assegnato`, nessuna data di chiusura —
-- non sono stati eseguiti e la ricostruzione non deve dire il contrario.
-- Le voci entrano in coda a quelle esistenti con `risposte` vuote: da compilare, non compilate.
--
-- Idempotente sull'ODL: se un intervento per quell'ODL e quel giorno esiste già, si salta.

do $$
declare
  v_rap_id   uuid := '16a11b44-7681-4337-936f-afa9ed70e2cd';
  v_staff_id text := '133f7437-3411-43e2-9f98-7e392c2c396c';
  v_data     date := '2026-08-03';
  v_template uuid := '0719c518-e5cc-4cbe-b7a0-b87c8a3b65ea';
  v_campi    jsonb;
  v_ordine   int;
  v_creati   int;
  v_voci     int;
begin
  if not exists (select 1 from rapportini where id = v_rap_id) then
    raise exception 'Rapportino % assente: ripristino annullato.', v_rap_id;
  end if;

  select campi_snapshot into v_campi from rapportini where id = v_rap_id;
  select coalesce(max(ordine), 0) into v_ordine from rapportino_voci where rapportino_id = v_rap_id;

  -- 1) Gli interventi, dal registro.
  with da_creare as (
    select a.odl, a.matricola, a.comune, a.nominativo, a.recapito, a.impianto,
           trim(coalesce(a.via, '') || ' ' || coalesce(a.civico, '')) as indirizzo
    from acqualatina_ordini a
    where a.via ilike '%FAVONIA%'
      and a.aperto
      and not exists (
        select 1 from interventi i
        where i.odl = a.odl and i.data = v_data and i.committente = 'acqualatina'
      )
  )
  insert into interventi (
    committente, odl, pdr, nominativo, recapito, matricola_contatore, indirizzo, comune,
    intervento_tipo, gruppo_attivita, data, staff_id, piano_id, stato,
    created_from_mappa, origine
  )
  select 'acqualatina', d.odl, d.impianto, d.nominativo, d.recapito, d.matricola, d.indirizzo, d.comune,
         'Sostituzione misuratore', 'SOSTITUZIONE MISURATORI', v_data, v_staff_id, null, 'assegnato',
         false, 'manuale'
  from da_creare d;

  get diagnostics v_creati = row_count;

  -- 2) Le voci, in coda a quelle già presenti e vuote: sono lavoro da fare.
  with nuove as (
    select i.*, row_number() over (order by i.indirizzo, i.odl) as pos
    from interventi i
    where i.staff_id = v_staff_id and i.data = v_data and i.committente = 'acqualatina'
      and i.indirizzo ilike '%FAVONIA%'
      and not exists (select 1 from rapportino_voci v where v.intervento_id = i.id)
  )
  insert into rapportino_voci (
    rapportino_id, intervento_id, task_id, ordine, odl, nominativo, matricola, pdr,
    via, comune, cap, recapito, attivita, fascia_oraria,
    raw_json, risposte, manuale, origine, template_id, campi_snapshot
  )
  select
    v_rap_id, n.id, 'rip-' || n.odl, v_ordine + n.pos,
    n.odl, n.nominativo, n.matricola_contatore, n.pdr,
    n.indirizzo, n.comune, n.cap, n.recapito, n.intervento_tipo, n.fascia_oraria,
    jsonb_build_object(
      'id', 'rip-' || n.odl, 'odl', n.odl, 'pdr', n.pdr, 'cap', coalesce(n.cap, ''),
      'citta', n.comune, 'indirizzo', n.indirizzo, 'matricola', n.matricola_contatore,
      'nominativo', n.nominativo, 'attivita', n.intervento_tipo,
      'gruppoFile', n.gruppo_attivita, 'ordine', v_ordine + n.pos, 'priorita', 0,
      'fascia_oraria', '', '_operatore', 'PASTORELLI',
      '_nuovo', false, '_annullato', false, '_ripristino', true
    ),
    '{}'::jsonb,             -- da fare: nessuna risposta inventata
    false, 'task', v_template, v_campi
  from nuove n;

  get diagnostics v_voci = row_count;
  raise notice 'VIA FAVONIA ripristinata: % interventi, % voci aggiunte al rapportino.', v_creati, v_voci;
end $$;
