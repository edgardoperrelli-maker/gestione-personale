-- ============================================================================
-- Backfill una-tantum: voci Consuntivazione finite in un rapportino "Senza territorio"
-- invece che nel rapportino vero dell'operatore.
-- ============================================================================
--
-- IL BUCO (bug del 05/08, gemello dell'adozione contenitori fermi del 04/08). Le route
-- /api/admin/consuntivazione/nuovo e /esita aprivano SEMPRE un nuovo rapportino "contenitore"
-- (piano_id null) per la voce backoffice, anche quando l'operatore aveva GIA' il rapportino vero
-- del giorno (la sua pianificazione mappa/ACEA). Risultato: LIBERATORI, TREGU e DE SANTIS si sono
-- trovati un secondo rapportino "Senza territorio" nel Riepilogo, gemello di quello con cui
-- stavano già lavorando. Il fix (trovaRapportinoOperatoreGiorno, lib/consuntivazione/rapportinoGiorno.ts)
-- fa sì che le prossime voci Consuntivazione si aggancino al rapportino esistente; questa
-- migration ripara le 4 voci già finite fuori posto oggi.
--
-- Sposta le voci `rapportino_voci` (UPDATE, non insert+delete: id, foto e storico restano intatti)
-- dal rapportino "Senza territorio" al rapportino vero dello stesso operatore/giorno, poi elimina
-- il contenitore ormai vuoto. Nessun'altra tabella referenzia questi rapportino_id (verificato:
-- misuratori_rimossi, rapportino_righe, risanamento_misuratori_archivio, interventi_manuali — 0
-- righe). `interventi.piano_id` NON si tocca: questi interventi restano, come da disegno della
-- Consuntivazione, fuori dalla pianificazione mappa — cambia solo il rapportino che ne ospita la voce.
--
-- IDEMPOTENTE: ogni update/delete è per id esplicito; a rapportino già spostato/eliminato non
-- trova più righe da toccare.
-- ============================================================================

do $$
declare
  n_spostate int;
  n_eliminati int;
begin
  -- LIBERATORI ADRIANO → rapportino ACEA del 05/08 (max ordine 20 → 21).
  update public.rapportino_voci
     set rapportino_id = '3a0a10de-1c42-410c-91ea-ee9da40bc18b', ordine = 21
   where id = '02a4c38b-bbe2-4ce0-82de-091be0e53cb8'
     and rapportino_id = 'e4ae7f23-8f4e-4739-a041-360a2fe393c7';

  -- TREGU DANIEL → rapportino ACEA del 05/08 (max ordine 22 → 23, 24; due voci, due contenitori).
  update public.rapportino_voci
     set rapportino_id = 'c94e2621-f995-4c5b-b61a-195ee50f0cd5', ordine = 23
   where id = '1714eb80-a10c-4900-8378-de5c723dec30'
     and rapportino_id = '6f812dd2-a085-40e7-98af-3498e9a44021';

  update public.rapportino_voci
     set rapportino_id = 'c94e2621-f995-4c5b-b61a-195ee50f0cd5', ordine = 24
   where id = '363ca0ca-1d90-4789-a7bb-26a13ea172c1'
     and rapportino_id = '76d2ff09-ffed-44eb-9c8a-8a17d477d0ca';

  -- DE SANTIS ALESSANDRO → rapportino LAZIO CENTRO del 05/08 (max ordine 27 → 28).
  update public.rapportino_voci
     set rapportino_id = 'cf017a4e-68ca-42a9-9788-b24e144090bb', ordine = 28
   where id = '9a61b914-5c58-40a4-93e9-af8ac2f531f1'
     and rapportino_id = 'ef1f7f55-27a3-4891-95af-84e5a5af0378';

  get diagnostics n_spostate = row_count;

  -- Contenitori "Senza territorio" ormai vuoti: eliminati solo se non hanno più voci (guardia
  -- extra oltre all'idempotenza degli update sopra — non elimina nulla che non sia il previsto).
  delete from public.rapportini r
  where r.id in (
    'e4ae7f23-8f4e-4739-a041-360a2fe393c7',
    '6f812dd2-a085-40e7-98af-3498e9a44021',
    '76d2ff09-ffed-44eb-9c8a-8a17d477d0ca',
    'ef1f7f55-27a3-4891-95af-84e5a5af0378'
  )
  and not exists (select 1 from public.rapportino_voci v where v.rapportino_id = r.id);
  get diagnostics n_eliminati = row_count;

  raise notice 'Backfill Consuntivazione senza territorio: % voci spostate, % rapportini contenitore eliminati.',
    n_spostate, n_eliminati;
end $$;
