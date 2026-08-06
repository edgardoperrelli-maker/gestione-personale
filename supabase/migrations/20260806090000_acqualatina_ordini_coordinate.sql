-- ============================================================================
-- AcquaLatina — le coordinate GPS del punto, dal file del committente.
-- ============================================================================
-- L'estrazione di Latina porta LATITUDINE/LONGITUDINE accanto a COD_FORNITURA: sono il
-- punto ESATTO del contatore, molto più affidabile della toponomastica del file (via e
-- civico dell'anagrafica sono spesso approssimativi, ed è il motivo per cui l'operatore
-- gira col telefono in mano cercando il numero civico giusto).
--
-- UNA colonna e non due: il valore si scrive già normalizzato «lat, lng» col punto
-- decimale (`parseLatLng`, la stessa delle coordinate committente del rapportino), che è
-- la forma che il link Maps vuole e quella che finisce nel `raw_json` della voce. Due
-- colonne numeriche avrebbero voluto dire ricomporle a ogni lettura, in tre posti diversi.
--
-- SOLO su acqualatina_ordini: la colonna NON va aggiunta alla select condivisa `COLONNE`
-- di app/api/acea/ordini/route.ts, che gira anche su acea_ordini — chi la mettesse lì
-- spegnerebbe il registro di TUTTE le famiglie appena il deploy precedesse la migration
-- (è già successo il 05/08 con `matricola_nuova`). Si legge a parte, con degradazione.
alter table public.acqualatina_ordini add column if not exists coordinate text;

comment on column public.acqualatina_ordini.coordinate is
  'Coordinate GPS del punto, «lat, lng» col punto decimale, dal file del committente '
  '(Strumenti → Coordinate dei punti). Alimentano il «Punto esatto» del rapportino; non '
  'entrano in geocoding, routing o mappa, che continuano a usare l''indirizzo.';
