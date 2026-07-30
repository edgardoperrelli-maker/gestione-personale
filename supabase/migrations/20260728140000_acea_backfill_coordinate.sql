-- Backfill delle coordinate ACEA da quello che è già stato geocodificato in passato.
--
-- Il registro nasce senza coordinate, ma NON siamo a zero: `geocoding_cache` ha 13.459 indirizzi
-- già risolti dal modulo interventi, e `interventi` stesso porta lat/lng sugli ODL già lavorati.
-- Ripartire da lì evita di richiedere ai provider gratuiti (1 richiesta al secondo) indirizzi per
-- cui la risposta è già in casa: sono ore di attesa risparmiate, e nessuna richiesta di rete.
--
-- ONE-SHOT: gira una volta e non si ripete. Per questo il riquadro del Lazio è ricopiato qui in
-- literal invece di essere importato — un backfill che non gira più non può divergere dalla
-- costante di `lib/acea/microaree.ts`, che resta l'unica fonte per il codice vivo.
--
-- Le coordinate fuori regione NON vengono scritte: sono l'omonimo di un'altra regione, cioè un
-- dato falso. Si marcano `fuori_regione` e restano senza gruppo (vedi lib/acea/microaree.ts).

-- Chiave normalizzata dell'indirizzo, nello stesso formato usato da `geocoding_cache.lookup_key`:
-- minuscolo, punteggiatura via, spazi compattati.
with norm as (
  select
    o.odl,
    o.numero_operazione,
    regexp_replace(
      regexp_replace(lower(trim(coalesce(o.via, '') || ' ' || coalesce(o.civico, ''))), '[.,;:]+', ' ', 'g'),
      '\s+', ' ', 'g') as ind,
    coalesce(o.cap, '') as cap,
    lower(trim(coalesce(o.comune, ''))) as citta
  from acea_ordini o
  where o.geocodifica_esito is null
),
-- Prima fonte: la cache degli indirizzi. È la più precisa, perché è per indirizzo esatto.
da_cache as (
  select n.odl, n.numero_operazione, c.lat, c.lng
  from norm n
  join geocoding_cache c on c.lookup_key = n.ind || '|' || n.cap || '|' || n.citta
  where c.lat is not null and c.lng is not null
),
-- Seconda fonte: gli interventi già lavorati su quell'ODL. Meno preciso della cache (la coordinata
-- è quella registrata sul giro, non ricalcolata sull'indirizzo), ma per un ODL già visitato è
-- l'informazione di chi c'è stato davvero.
da_interventi as (
  select distinct on (i.odl) i.odl, i.lat, i.lng
  from interventi i
  where i.committente in ('acea', 'lim_massive') and i.lat is not null and i.lng is not null
  order by i.odl, i.data desc
),
sorgente as (
  select n.odl, n.numero_operazione,
         coalesce(c.lat, v.lat) as lat,
         coalesce(c.lng, v.lng) as lng
  from norm n
  left join da_cache c on c.odl = n.odl and c.numero_operazione = n.numero_operazione
  left join da_interventi v on v.odl = n.odl
)
update acea_ordini o
set
  -- Il riquadro del Lazio: fuori, la coordinata non si scrive proprio.
  lat = case when s.lat between 40.70 and 42.92 and s.lng between 11.35 and 14.10 then s.lat end,
  lng = case when s.lat between 40.70 and 42.92 and s.lng between 11.35 and 14.10 then s.lng end,
  geocodifica_esito = case
    when s.lat between 40.70 and 42.92 and s.lng between 11.35 and 14.10 then 'ok'
    else 'fuori_regione'
  end,
  geocodifica_at = now(),
  geocodifica_chiave = upper(
    trim(coalesce(o.via, '') || ' ' || coalesce(o.civico, ''))
    || '|' || coalesce(o.cap, '') || '|' || coalesce(o.comune, ''))
from sorgente s
where o.odl = s.odl
  and o.numero_operazione = s.numero_operazione
  and s.lat is not null
  and o.geocodifica_esito is null;

-- Le righe senza via o senza comune non hanno niente da chiedere a un geocoder: si marcano ora,
-- altrimenti tornerebbero in cima a ogni blocco e il contatore non arriverebbe mai a zero.
update acea_ordini
set geocodifica_esito = 'senza_indirizzo', geocodifica_at = now()
where geocodifica_esito is null
  and (via is null or trim(via) = '' or comune is null or trim(comune) = '');
