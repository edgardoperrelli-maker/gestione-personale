-- «Chiusi» ordinato per quando il lavoro è finito davvero.
--
-- IL DIFETTO. Sulla scheda «Chiusi» delle massive l'ordinamento canonico è `scadenza` crescente,
-- con `data_creazione` crescente come spareggio. Su questa popolazione la scadenza è NULL su
-- TUTTE le righe — verificato: 0 su 2.078 fra quelle con ordine, e le 1.317 dal «+» ce l'hanno
-- NULL per costruzione — quindi la chiave primaria non ordina niente e decide tutto lo spareggio:
-- il più VECCHIO in cima, su una scheda che si apre per vedere cosa si è chiuso di recente.
--
-- Le righe dal «+» sono le più nuove (4/6–31/7 contro 22/5–25/6 di quelle con ordine): finivano
-- tutte in coda, la prima alla posizione 1.402 di 3.395, cioè alla quinta pagina da 300. Erano
-- nel conteggio e nella vista — la migration 20260806140000 le aveva messe apposta in «Chiusi» —
-- e non le trovava nessuno.
--
-- PERCHÉ UNA COLONNA E NON UN ORDER BY DIVERSO. «Quando è finito» è scritto in due posti diversi
-- nelle due metà della vista:
--
--   riga con ordine   `data_completamento`, il giorno in cui ACEA ha registrato l'esecuzione.
--                     Presente sul 100% delle 2.078.
--   riga dal «+»      `data_completamento` resta NULL DI PROPOSITO (vedi 20260806140000: quel
--                     lavoro ACEA non l'ha eseguito né registrato, e riempirlo direbbe una cosa
--                     falsa su chi ha fatto cosa). Il giorno vero è quello dell'intervento.
--
-- Non esiste nessuna colonna già presente che valga per entrambe: ordinando per una qualsiasi,
-- una delle due popolazioni va in fondo in blocco — che è il difetto di partenza, specchiato.
-- `concluso_il` è il `coalesce` delle due, e serve SOLO a ordinare: non si mostra in tabella, non
-- entra negli export, non sostituisce `data_completamento` — che resta la colonna «Esecuzione
-- ACEA» e deve continuare a dire il vero, cioè restare vuota dove ACEA non ha registrato niente.
--
-- Misurato con la chiave nuova, ordinando decrescente: nel primo quarto dell'elenco 252 righe dal
-- «+» e 597 con ordine, dal 4 agosto a ritroso. Le due metà si intrecciano per data invece di
-- impilarsi una dopo l'altra.
--
-- `create or replace view` aggiunge la colonna IN CODA senza toccare le altre — è il solo modo in
-- cui Postgres lo consente, ed è il motivo per cui `concluso_il` sta dopo `sola_lettura` invece
-- che accanto alle altre date. I grant restano quelli di prima.

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
    false       as sola_lettura,
    -- Il giorno in cui l'ordine si è concluso. `data_creazione` come ripiego non è un ripiego
    -- teorico: sulle massive la copertura di `data_completamento` è del 100%, quindi in pratica
    -- non si usa mai — sta qui perché una riga senza nessuna delle due finirebbe in fondo in
    -- silenzio, e in fondo ci deve andare per una ragione, non per un buco.
    coalesce(o.data_completamento, o.data_creazione) as concluso_il
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
    true                                                as sola_lettura,
    -- Qui la data del lavoro È la conclusione: l'intervento entra in questa vista solo da
    -- `stato = 'completato'` (vedi il `where` in fondo), quindi il giorno in cui ci siamo stati
    -- è il giorno in cui la cosa è finita.
    i.data                                              as concluso_il
  from public.interventi i
  where i.committente in ('acea', 'lim_massive')
    and coalesce(i.gruppo_attivita, '') = 'LIMITAZIONI MASSIVE'
    and i.stato = 'completato'
    and (i.odl is null or btrim(i.odl) = '');

comment on view public.acea_registro_massive is
  'Registro massive: ordini ACEA più gli interventi completati senza ODL (aperti a mano dal «+»), '
  'che nel registro non comparivano. Le righe con sola_lettura = true non hanno un ordine su cui '
  'scrivere pianificazione o appunti. `concluso_il` è la chiave di ordinamento della scheda '
  '«Chiusi»: unisce la data di esecuzione ACEA e quella del nostro intervento, che vivono in due '
  'colonne diverse nelle due metà della vista.';

-- Solo il servizio: la vista attraversa `interventi`, e non deve diventare una via laterale per
-- leggerli aggirando le loro policy.
revoke all on public.acea_registro_massive from anon, authenticated;
grant select on public.acea_registro_massive to service_role;
