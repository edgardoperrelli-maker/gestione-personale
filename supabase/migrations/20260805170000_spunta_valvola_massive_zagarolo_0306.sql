-- supabase/migrations/20260805170000_spunta_valvola_massive_zagarolo_0306.sql
--
-- Spunta «SOSTITUZIONE VALVOLA = SI» sulle tre limitazioni massive di Zagarolo del 03/06/2026
-- (ODL 912215538, 912230749, 912231679) — richiesta utente 2026-08-05.
--
-- Sono interventi NATI PRIMA che il template massive avesse il campo: il loro `campi_snapshot`
-- ha solo ESEGUITO e NOTE, e gli operatori (Piccinini, Pastorelli) hanno scritto la
-- sostituzione dove potevano — nelle note: «INSERIMENTO VALVOLA», con cinque foto extra a
-- riga. Senza la chiave `sostituzione_valvola` quel lavoro è invisibile a TUTTO ciò che legge
-- la dichiarazione: KPI «Sost. valvola» dello Storico, tabella saracinesche del modulo ACEA
-- (dichiarazioni, stato coperta/da richiedere), riga di produzione da 91,12 € e aggancio
-- madre→figlio del SAL (`figliSaracinescaPositivi`). Tre fonti concordi: note dell'operatore,
-- foto, e nel registro esistono già gli ordini figli di sostituzione sullo stesso impianto
-- (912355047 · 4000489519, 912355154 · 4000164269, 912355153 · 4000090969, tutti COMP positivi).
--
-- Si scrive in DUE punti, ed è la ragione per cui questa non è una semplice UPDATE di `risposte`:
--  1. `risposte.sostituzione_valvola = 'SI'` — la dichiarazione, che alimenta i processi;
--  2. `campi_snapshot` += il campo select — così la spunta si VEDE ed è correggibile nella
--     modale dello Storico come su ogni voce moderna (la modale costruisce i campi dallo
--     snapshot: senza, il valore resterebbe scritto ma invisibile e non più modificabile).
-- Il campo è un `select` puro, con la stessa forma degli snapshot moderni; nessun campo foto
-- viene aggiunto, quindi non nasce nessun obbligo fotografico su questi rapportini.
--
-- Le NOTE non si toccano: «INSERIMENTO VALVOLA» resta la traccia di come fu dichiarato allora.
-- Idempotente: al secondo giro entrambe le guardie non trovano più nulla.

-- 1 · la dichiarazione
update rapportino_voci v
set risposte = coalesce(v.risposte, '{}'::jsonb) || '{"sostituzione_valvola":"SI"}'::jsonb
where v.intervento_id in (
  select i.id from interventi i
  where btrim(coalesce(i.odl,'')) in ('912215538','912230749','912231679')
    and i.stato = 'completato'
    and i.esito = 'eseguito_positivo'
)
  and upper(btrim(coalesce(v.risposte->>'eseguito',''))) = 'SI'
  and v.risposte->>'sostituzione_valvola' is null
  and v.risposte->>'sost_valvola' is null;

-- 2 · il campo nello snapshot, perché la spunta sia visibile e correggibile in modale
update rapportino_voci v
set campi_snapshot = coalesce(v.campi_snapshot, '[]'::jsonb)
  || '[{"tipo":"select","chiave":"sostituzione_valvola","ordine":3,"opzioni":["SI","NO"],"etichetta":"SOSTITUZIONE VALVOLA"}]'::jsonb
where v.intervento_id in (
  select i.id from interventi i
  where btrim(coalesce(i.odl,'')) in ('912215538','912230749','912231679')
    and i.stato = 'completato'
    and i.esito = 'eseguito_positivo'
)
  and v.risposte->>'sostituzione_valvola' is not null
  and not exists (
    select 1 from jsonb_array_elements(coalesce(v.campi_snapshot, '[]'::jsonb)) c
    where c->>'chiave' in ('sostituzione_valvola', 'sost_valvola')
  );
