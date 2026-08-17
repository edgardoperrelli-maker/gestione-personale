-- L'intervento torna all'operatore che il lavoro l'ha davvero fatto.
--
-- IL DIFETTO (chiuso nel codice dallo stesso PR)
-- `buildVoceInterventoLinker` aggancia una voce solo a un intervento dello STESSO operatore,
-- quindi una voce NASCE sempre allineata. A disallinearla è per forza una RIASSEGNAZIONE
-- successiva: `POST /api/interventi/assegna` spostava `interventi.staff_id` e lasciava la voce
-- sul rapportino di prima. Lo storico legge l'esecutore dal rapportino PADRE, e da lì in poi
-- accreditava il lavoro a chi non l'aveva fatto.
--
-- COSA DICONO I DATI (misura del 17/08/2026: 28 voci disallineate)
-- La prova di chi ha lavorato sta nelle risposte. Su otto ordini Italgas la voce dell'operatore
-- "ufficiale" è VUOTA e quella dell'altro porta l'esito — su sei di questi l'intervento è
-- `eseguito_positivo`, cioè il positivo viene dalla voce di chi a registro non risulta:
--
--   20044039195, 20044138045, 20044138835 → a registro COMMERSO/PASSERI (voce vuota),
--                                            l'esito «SI» è di SERRA
--   20044146070                          → a registro PASSERI (vuota), «SI» di TODINI
--   20044183804, 20044205182             → a registro PASSERI (vuota), «SI» di BRUNELLI
--   20043982812-1, 20044141856           → a registro BRUNELLI (vuota), «NO» di SERRA
--
-- Cancellare la voce "di troppo" — la prima idea — avrebbe lasciato sei interventi eseguiti
-- positivi con dietro una voce vuota: l'unica prova del lavoro distrutta. È esattamente il
-- danno dell'ODL 12384609, e va nella direzione opposta.
--
-- LA REGOLA, confermata dall'utente il 17/08/2026
-- «Chi ha la voce compilata è chi ci è andato.» Quindi si corregge l'INTERVENTO, non la voce.
--
-- Si applica SOLO dove è decisiva: l'intervento ha UNA sola voce compilata. Con due voci
-- compilate il criterio non discrimina — sono due operatori che hanno scritto entrambi — e
-- quelle sette restano intatte, da guardare a mano:
--   12378907, 12381983, 12386847, 20044145389, 20044281176, 20044266371, 951828484
--
-- COSA TOCCA
--   15 interventi cambiano esecutore (8 Italgas, 6 ACEA, 1 AcquaLatina);
--    6 interventi cambiano solo GIORNO (stesso operatore): 5 Italgas senza ODL 06/06 → 05/06,
--      e il 12385807 dal 03/08 al 31/07, che è il giorno del rapportino che lo ha eseguito;
--    8 voci VUOTE si eliminano: erano il doppione, e non contengono niente da perdere.
--
-- Lo stato del registro AcquaLatina non si scrive qui: `data_completamento` del 12385807 lo
-- risistema la riconciliazione, che è l'unica che sa applicare le regole della commessa.
--
-- REVERSIBILE: `bak_allinea_esecutore_20260817_int` conserva i valori di prima,
-- `bak_allinea_esecutore_20260817_voci` le righe intere delle voci eliminate.
-- IDEMPOTENTE: le tabelle di backup si creano solo se assenti e sono la SORGENTE degli id, così
-- una seconda esecuzione riapplica gli stessi valori invece di ricalcolarli sui dati già corretti.

-- 1) Chi cambia, e da cosa a cosa. Le tabelle bak_ sono il piano d'azione, non solo la copia.
create table if not exists public.bak_allinea_esecutore_20260817_int as
with compilate as (
  select v.intervento_id, r.staff_id as voce_staff, r.data as voce_data
    from public.rapportino_voci v
    join public.rapportini r on r.id = v.rapportino_id
   where v.intervento_id is not null
     and coalesce(btrim(v.risposte ->> 'eseguito'), '') <> ''
),
uniche as (
  select intervento_id from compilate group by intervento_id having count(*) = 1
)
select i.id,
       i.odl,
       i.committente,
       i.staff_id as staff_prima,
       i.data     as data_prima,
       c.voce_staff as staff_dopo,
       c.voce_data  as data_dopo
  from uniche u
  join compilate c on c.intervento_id = u.intervento_id
  join public.interventi i on i.id = u.intervento_id
 where i.staff_id <> c.voce_staff or i.data <> c.voce_data;

-- 2) Le voci VUOTE appese a quegli stessi interventi: il doppione senza contenuto.
--    `risposte - 'eseguito' = '{}'` e non solo la chiave vuota: una voce con altre risposte
--    dentro (una nota, una foto) non è vuota e non si tocca.
create table if not exists public.bak_allinea_esecutore_20260817_voci as
select v.*
  from public.rapportino_voci v
  join public.bak_allinea_esecutore_20260817_int b on b.id = v.intervento_id
 where coalesce(btrim(v.risposte ->> 'eseguito'), '') = ''
   and (v.risposte - 'eseguito') = '{}'::jsonb;

-- 3) La correzione.
update public.interventi i
   set staff_id = b.staff_dopo,
       data     = b.data_dopo
  from public.bak_allinea_esecutore_20260817_int b
 where b.id = i.id
   and (i.staff_id <> b.staff_dopo or i.data <> b.data_dopo);

delete from public.rapportino_voci
 where id in (select id from public.bak_allinea_esecutore_20260817_voci);

do $$
declare n_int int; n_staff int; n_data int; n_voci int;
begin
  select count(*), count(*) filter (where staff_prima <> staff_dopo), count(*) filter (where data_prima <> data_dopo)
    into n_int, n_staff, n_data from public.bak_allinea_esecutore_20260817_int;
  select count(*) into n_voci from public.bak_allinea_esecutore_20260817_voci;
  raise notice 'allineamento esecutore: % interventi (% esecutore, % giorno), % voci vuote rimosse',
    n_int, n_staff, n_data, n_voci;
end $$;
