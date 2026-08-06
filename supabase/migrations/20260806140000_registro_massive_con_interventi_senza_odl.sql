-- Registro massive = ordini ACEA + il lavoro fatto SENZA un ordine.
--
-- Le limitazioni massive si aprono anche a mano, dal «+» del modulo: nessun ODL, perché ACEA
-- quell'ordine non l'ha mai generato. Sono 1.317 interventi completati, e nel registro non
-- comparivano da nessuna parte — la tabella legge `acea_ordini`, e lì una riga senza ordine non
-- può esistere. Il risultato è che il registro delle massive non diceva tutto il lavoro fatto:
-- 803 di quegli interventi portano una saracinesca dichiarata, 797 delle quali mai chieste ad
-- ACEA per 72.622 €, e non c'era schermata da cui accorgersene.
--
-- Si unisce in una VISTA e non nel codice della route, ed è la scelta che tiene in piedi tutto il
-- resto: filtri, ordinamenti, paginazione e conteggi continuano a lavorare su UNA relazione. Unire
-- due query in memoria avrebbe voluto dire caricare entrambe le fonti intere a ogni pagina per
-- ordinare e contare senza mentire — cioè il difetto contro cui il modulo mette in guardia in tre
-- punti diversi (ordinare la pagina invece del registro, filtrare le righe scese invece di tutte).
--
-- Le righe che arrivano dagli interventi sono in SOLA LETTURA, e `sola_lettura` lo dichiara:
-- pianificazione, appunti e celle scrivono su `acea_ordini` per la coppia (odl, numero_operazione),
-- e senza ODL non c'è dove scrivere. Meglio una griglia che non lascia modificare che un
-- salvataggio che fallisce dopo.
--
-- Restano fuori gli ANNULLATI (127): non sono lavoro fatto, e nel registro ACEA non hanno
-- equivalente. «Chiusi» vuol dire concluso, non archiviato.

create or replace view public.acea_registro_massive
with (security_invoker = true) as

  select
    o.id,
    o.odl,
    o.numero_operazione,
    o.famiglia,
    o.tipo_ordine,
    o.attivita,
    o.denominazione,
    o.stato,
    o.stato_desc,
    o.aperto,
    o.data_creazione,
    o.cardine_al,
    o.scadenza,
    o.data_completamento,
    o.operatore_cognome,
    o.operatore_nome,
    o.causale,
    o.causale_desc,
    o.esito_positivo,
    o.via,
    o.civico,
    o.civico_num,
    o.cap,
    o.comune,
    o.provincia,
    o.microarea,
    o.microarea_stimata,
    o.impianto,
    o.matricola,
    o.matricola_norm,
    o.sospetto_troncamento,
    o.nominativo,
    o.recapito,
    o.valore_netto,
    o.escludi_consuntivazione,
    o.codice_sla,
    o.priorita_testo,
    o.testo_ordine,
    o.centro_lavoro,
    o.note,
    o.top,
    o.riapertura,
    null::uuid as intervento_id,
    false       as sola_lettura
  from public.acea_ordini o
  where o.famiglia = 'massive'

  union all

  select
    i.id,
    -- L'ODL è VUOTO, non inventato: è il fatto che quella riga racconta. La stringa vuota e non
    -- NULL perché la tabella lo tratta come testo e un null diventerebbe «null» a schermo.
    ''::text                                            as odl,
    -- La chiave di riga deve restare unica e stabile, o due pagine di seguito ripeterebbero o
    -- salterebbero righe: qui è l'identificativo dell'intervento.
    i.id::text                                          as numero_operazione,
    'massive'::text                                     as famiglia,
    null::text                                          as tipo_ordine,
    coalesce(i.intervento_tipo, i.gruppo_attivita)      as attivita,
    null::text                                          as denominazione,
    null::text                                          as stato,
    null::text                                          as stato_desc,
    -- Lavoro concluso: sta in «Chiusi», che è dove l'ufficio è andato a cercarlo senza trovarlo.
    false                                               as aperto,
    -- Il giorno in cui ci siamo stati. La colonna «Creazione» non è predefinita in questa vista,
    -- quindi non si legge come una data ACEA: serve a dare all'ordinamento canonico un appiglio
    -- vero invece di lasciare 1.317 righe tutte pari e in ordine casuale fra loro.
    i.data                                              as data_creazione,
    null::date                                          as cardine_al,
    null::date                                          as scadenza,
    -- «Esecuzione ACEA» resta VUOTA: quel lavoro ACEA non l'ha eseguito né registrato, e riempirla
    -- con la nostra data direbbe una cosa falsa su chi ha fatto cosa.
    null::date                                          as data_completamento,
    null::text                                          as operatore_cognome,
    null::text                                          as operatore_nome,
    null::text                                          as causale,
    null::text                                          as causale_desc,
    null::boolean                                       as esito_positivo,
    -- L'indirizzo dell'intervento è un campo solo: entra tutto in `via`, che è la colonna su cui
    -- il registro filtra e cerca. `civico` separato non esiste, e spezzarlo a indovinare
    -- sbaglierebbe su «via dei Mille 12/A» molto più spesso di quanto aiuti.
    i.indirizzo                                         as via,
    null::text                                          as civico,
    null::integer                                       as civico_num,
    i.cap                                               as cap,
    i.comune                                            as comune,
    null::text                                          as provincia,
    null::integer                                       as microarea,
    null::boolean                                       as microarea_stimata,
    -- L'impianto è di ACEA e nasce con l'ordine: senza ordine non esiste, e non è recuperabile —
    -- verificato su `acea_ordini`, `acea_impianti` (5.727 righe) e `template_master_righe`.
    null::text                                          as impianto,
    i.matricola_contatore                               as matricola,
    nullif(regexp_replace(upper(coalesce(i.matricola_contatore, '')), '[^A-Z0-9]', '', 'g'), '')
                                                        as matricola_norm,
    false                                               as sospetto_troncamento,
    null::text                                          as nominativo,
    null::text                                          as recapito,
    null::numeric                                       as valore_netto,
    false                                               as escludi_consuntivazione,
    null::text                                          as codice_sla,
    null::text                                          as priorita_testo,
    null::text                                          as testo_ordine,
    null::text                                          as centro_lavoro,
    null::text                                          as note,
    false                                               as top,
    false                                               as riapertura,
    i.id                                                as intervento_id,
    true                                                as sola_lettura
  from public.interventi i
  where i.committente in ('acea', 'lim_massive')
    and coalesce(i.gruppo_attivita, '') = 'LIMITAZIONI MASSIVE'
    and i.stato = 'completato'
    and (i.odl is null or btrim(i.odl) = '');

comment on view public.acea_registro_massive is
  'Registro massive: ordini ACEA più gli interventi completati senza ODL (aperti a mano dal «+»), '
  'che nel registro non comparivano. Le righe con sola_lettura = true non hanno un ordine su cui '
  'scrivere pianificazione o appunti.';

-- Solo il servizio: la vista attraversa `interventi`, e non deve diventare una via laterale per
-- leggerli aggirando le loro policy.
revoke all on public.acea_registro_massive from anon, authenticated;
grant select on public.acea_registro_massive to service_role;
