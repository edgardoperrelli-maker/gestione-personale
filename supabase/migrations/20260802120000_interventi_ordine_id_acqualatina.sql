-- ============================================================================
-- MODULO ACQUA LATINA — ordine_id anche per gli interventi Acqualatina
-- ============================================================================
-- `interventi.ordine_id` (20260727092000) doveva già essere il ponte verso il registro ordini,
-- ma il vincolo puntava solo ad `acea_ordini`: da quando `/api/acea/pianifica` scrive anche gli
-- interventi Acqualatina (dal 31/07, vedi lib/acea/famiglia.ts) ogni scrittura con
-- famiglia='acqualatina' fallisce con una violazione di foreign key, perché l'id arriva da
-- `acqualatina_ordini`. Prova: le 256+ righe `interventi` con committente='acqualatina' hanno
-- tutte `ordine_id` NULL — nessuna pianificazione Acqualatina è mai riuscita a scriverlo.
--
-- La colonna serve davvero anche lato lettura: `chiudiOrdiniAcqualatinaCompletati` in
-- app/api/acea/ordini/route.ts chiude le righe di `acqualatina_ordini` cercandole per
-- `ordine_id` (Acqualatina non manda un export di chiusura come ACEA — lo scrive il nostro
-- motore). Senza questa colonna popolata quella chiusura resta morta per sempre.
--
-- Postgres non ha FK polimorfe: una colonna sola non può referenziare due tabelle diverse a
-- seconda del committente. Si toglie quindi il vincolo rigido e si torna a un riferimento
-- LOGICO risolto da `committente` — la stessa scelta già fatta in questa tabella per
-- `activity_id` ("riferimento logico ad activities_renamed, no FK") e per `squadra_id`.

alter table public.interventi
  drop constraint if exists interventi_ordine_id_fkey;

comment on column public.interventi.ordine_id is
  'Ordine di provenienza, riferimento LOGICO risolto da committente (niente FK: due tabelle '
  'diverse secondo committente) — acea_ordini.id se committente in (acea, lim_massive), '
  'acqualatina_ordini.id se committente = acqualatina. NULL per gli interventi manuali o il cui '
  'ordine è stato rimosso dal registro.';
