-- Ripristino del rapportino di PASTORELLI LUIGI del 2026-08-03, perso con la cancellazione
-- del suo piano ACQUA LATINA di quel giorno.
--
-- COSA È SUCCESSO
-- `rapportini.piano_id` è ON DELETE CASCADE: cancellata la riga `mappa_piani`, il rapportino e
-- tutte le sue `rapportino_voci` sono spariti con lei. `interventi.piano_id` è invece
-- ON DELETE SET NULL, quindi i 25 interventi della giornata sono sopravvissuti orfani —
-- 24 `completato`/`eseguito_positivo` chiusi tra le 05:59 e le 08:57 UTC.
--
-- COME SI RICOSTRUISCE
-- `acqualatina_misuratori_rimossi.rapportino_id` NON ha una foreign key verso `rapportini`:
-- ha attraversato il CASCADE intatto e conserva l'id del rapportino cancellato
-- (16a11b44-7681-4337-936f-afa9ed70e2cd). Ricreandolo con lo STESSO id, le 24 righe dei
-- misuratori rimossi tornano collegate da sole: nessun ricucito a mano.
--
-- Le voci si riderivano dagli interventi superstiti (una per intervento, ordinate per
-- `chiuso_at` = l'ordine reale di esecuzione) e si riagganciano via `intervento_id`.
--
-- COSA NON SI RICOSTRUISCE
-- `risposte` viveva solo nelle voci cancellate. L'unico valore deducibile con certezza è
-- ESEGUITO=SI sulle voci il cui intervento è `completato`/`eseguito_positivo`: è la risposta
-- che ha prodotto quell'esito. Gli altri campi (LETTURA VECCHIO, CODOLI, SARACINESCA, NOTE)
-- sono facoltativi e restano vuoti: inventarli sarebbe falsificare il rapportino.
-- MATRICOLA NUOVO MISURATORE non è un buco: è nata oggi (20260803160000) e i rapportini già
-- generati congelano le azioni in `campi_snapshot` — quello di Pastorelli, generato il 02/08,
-- non l'aveva. Per questo lo snapshot si copia da un rapportino gemello a 6 azioni dello
-- stesso giorno e template, non dal template corrente che ora ne ha 7.
--
-- Stato `in_corso` e non `inviato`: che avesse premuto INVIA non risulta da nessun dato
-- superstite, e segnarlo consegnato sarebbe un'affermazione non verificata. Resta all'ufficio
-- verificarlo e inviarlo.
--
-- Idempotente: se il rapportino esiste già, non tocca niente.

do $$
declare
  v_rap_id     uuid := '16a11b44-7681-4337-936f-afa9ed70e2cd';
  v_staff_id   text := '133f7437-3411-43e2-9f98-7e392c2c396c';
  v_staff_name text := 'PASTORELLI LUIGI';
  v_data       date := '2026-08-03';
  v_template   uuid := '0719c518-e5cc-4cbe-b7a0-b87c8a3b65ea';
  v_campi      jsonb;
  v_info       jsonb;
  v_expires    timestamptz;
  v_created    timestamptz;
  v_n_int      int;
  v_n_voci     int;
begin
  if exists (select 1 from rapportini where id = v_rap_id) then
    raise notice 'Rapportino % già presente: nessuna azione.', v_rap_id;
    return;
  end if;

  -- Un rapportino per lo stesso operatore/giorno renderebbe il ripristino un doppione.
  if exists (select 1 from rapportini where staff_id = v_staff_id and data = v_data) then
    raise exception 'Esiste già un rapportino per % del %: ripristino annullato.', v_staff_name, v_data;
  end if;

  select count(*) into v_n_int
  from interventi
  where staff_id = v_staff_id and data = v_data and piano_id is null and committente = 'acqualatina';

  if v_n_int = 0 then
    raise exception 'Nessun intervento orfano per % del %: niente da ripristinare.', v_staff_name, v_data;
  end if;

  -- Azioni congelate: si copiano da un gemello dello stesso giorno e template rimasto a 6
  -- azioni (pre-matricola_nuova), che è la forma che aveva il rapportino cancellato.
  select r.campi_snapshot, r.info_snapshot, r.expires_at
    into v_campi, v_info, v_expires
  from rapportini r
  where r.template_id = v_template
    and r.data = v_data
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and (select count(*) from jsonb_array_elements(r.campi_snapshot) e) = 6
    and not exists (
      select 1 from jsonb_array_elements(r.campi_snapshot) e where e->>'chiave' = 'matricola_nuova'
    )
  order by r.id
  limit 1;

  if v_campi is null then
    raise exception 'Nessun rapportino gemello a 6 azioni per il % : snapshot non ricostruibile.', v_data;
  end if;

  v_expires := coalesce(v_expires, (v_data + 1)::timestamptz + interval '22 hours');

  -- Nascita del rapportino = quando il piano generò i suoi interventi.
  select min(created_at) into v_created
  from interventi
  where staff_id = v_staff_id and data = v_data and piano_id is null and committente = 'acqualatina';

  insert into rapportini (
    id, piano_id, staff_id, staff_name, data, template_id,
    campi_snapshot, info_snapshot, token, stato, expires_at,
    submitted_at, riaperto_at, tipo, created_at, updated_at
  ) values (
    v_rap_id,
    null, -- il piano non esiste più: il rapportino resta agganciato solo a operatore e giorno
    v_staff_id, v_staff_name, v_data, v_template,
    v_campi, v_info,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'in_corso',
    v_expires,
    null, null, 'standard',
    coalesce(v_created, now()), now()
  );

  with ordinate as (
    select
      i.*,
      row_number() over (order by i.chiuso_at nulls last, i.odl) as pos
    from interventi i
    where i.staff_id = v_staff_id
      and i.data = v_data
      and i.piano_id is null
      and i.committente = 'acqualatina'
  )
  insert into rapportino_voci (
    rapportino_id, intervento_id, task_id, ordine, odl, nominativo, matricola, pdr,
    via, comune, cap, recapito, attivita, accessibilita, fascia_oraria,
    raw_json, risposte, manuale, origine, template_id, campi_snapshot
  )
  select
    v_rap_id,
    o.id,
    'rip-' || coalesce(o.odl, o.id::text),
    o.pos,
    o.odl, o.nominativo, o.matricola_contatore, o.pdr,
    o.indirizzo, o.comune, o.cap, o.recapito,
    o.intervento_tipo, null, o.fascia_oraria,
    jsonb_build_object(
      'id',           'rip-' || coalesce(o.odl, o.id::text),
      'odl',          o.odl,
      'pdr',          o.pdr,
      'cap',          coalesce(o.cap, ''),
      'citta',        o.comune,
      'indirizzo',    o.indirizzo,
      'matricola',    o.matricola_contatore,
      'nominativo',   o.nominativo,
      'attivita',     o.intervento_tipo,
      'gruppoFile',   o.gruppo_attivita,
      'ordine',       o.pos,
      'priorita',     0,
      'fascia_oraria', coalesce(o.fascia_oraria, ''),
      '_operatore',   'PASTORELLI',
      '_nuovo',       false,
      '_annullato',   false,
      -- marcatore di provenienza: questa voce è ricostruita, non compilata sul posto
      '_ripristino',  true
    ),
    case
      when o.stato = 'completato' and o.esito = 'eseguito_positivo'
        then jsonb_build_object('eseguito', 'SI')
      else '{}'::jsonb
    end,
    false, 'task', v_template, v_campi
  from ordinate o;

  get diagnostics v_n_voci = row_count;
  raise notice 'Ripristinato rapportino % — % voci su % interventi orfani.', v_rap_id, v_n_voci, v_n_int;
end $$;
