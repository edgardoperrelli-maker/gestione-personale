-- Correzione esecutore (segnalazione back office) sui due interventi del 12/06/2026
-- a ZAGAROLO, VIALE UNGHERIA 118 (LIMITAZIONI MASSIVE, entrambi eseguiti positivi):
--
--   ODL 912229326 — intervento ef0f0b97-05aa-4162-bb41-ec5240b79565, matricola 202015210662
--   ODL 912246906 — intervento 05e46c4b-ab94-4a52-892c-87515dd23756, matricola 202115330677
--
-- Risultavano a PICCININI FEDERICO; l'esecutore reale è CIARALLO SIMONE, come conferma
-- `acea_master_snapshot.esecutore` = 'CIARALLO' su entrambi gli ODL. La divergenza sta solo
-- nei nostri dati (acea_portale_snapshot.operatore riporta ancora PICCININI, ma è lo specchio
-- immutabile dell'export del portale e non si tocca).
--
-- Nello storico l'esecutore è lo staff del rapportino PADRE della voce, quindi la correzione
-- è uno spostamento, esattamente quello che fa il cambio esecutore della modale di modifica
-- (app/api/admin/interventi/storico/voce/[voceId], PATCH con esecutoreId):
--   1. le due voci passano dal rapportino di Piccinini (8adf9317…, 21 voci, le altre 19 restano
--      dove sono) a quello che Ciarallo ha per LO STESSO giorno e LO STESSO piano
--      (4538837d…, tipo standard e campi_snapshot identici al bit → risposte già compilate
--      restano leggibili), accodate dopo l'ultima voce esistente;
--   2. interventi.staff_id passa a CIARALLO SIMONE.
-- `interventi.esecutori` è [] su entrambi (la popola solo la consuntivazione) e resta tale;
-- nessuna riga in misuratori_rimossi per questi interventi: verificato, niente da riallineare.
--
-- Idempotente: ogni update è filtrato sullo stato di partenza (voci ancora sul rapportino di
-- Piccinini, interventi ancora con il suo staff_id), quindi una seconda esecuzione non fa nulla.

-- Backup di rollback: stato PRIMA della bonifica. RLS attiva senza policy, come le altre
-- tabelle bak_* (vedi 20260725180000): materiale di ripristino, non dati applicativi.
create table if not exists public.bak_esecutore_voci_20260727 as
select * from public.rapportino_voci
where id in ('18140558-6859-483d-a21a-8478abc31122', 'a4638568-28e2-4605-be42-83e49800ba6e');

create table if not exists public.bak_esecutore_int_20260727 as
select * from public.interventi
where id in ('ef0f0b97-05aa-4162-bb41-ec5240b79565', '05e46c4b-ab94-4a52-892c-87515dd23756');

alter table public.bak_esecutore_voci_20260727 enable row level security;
alter table public.bak_esecutore_int_20260727 enable row level security;

-- 1. Le due voci nel rapportino di CIARALLO SIMONE del 12/06/2026, in coda.
with coda as (
  select coalesce(max(ordine), 0) as ultimo
  from public.rapportino_voci
  where rapportino_id = '4538837d-50c3-43c9-9636-8510d3a98878'
)
update public.rapportino_voci v
set rapportino_id = '4538837d-50c3-43c9-9636-8510d3a98878',
    ordine = coda.ultimo + case when v.odl = '912229326' then 1 else 2 end,
    updated_at = now()
from coda
where v.id in ('18140558-6859-483d-a21a-8478abc31122', 'a4638568-28e2-4605-be42-83e49800ba6e')
  and v.rapportino_id = '8adf9317-2bb0-4e18-9cb2-7288f4466caa';

-- 2. Esecutore primario dell'intervento.
update public.interventi
set staff_id = '95b59ec2-e364-4e78-a045-b3ca460cd02f',
    updated_at = now()
where id in ('ef0f0b97-05aa-4162-bb41-ec5240b79565', '05e46c4b-ab94-4a52-892c-87515dd23756')
  and staff_id = 'b2330af0-0da9-41f2-9caa-6c7099f8a302'
  and stato <> 'annullato';
