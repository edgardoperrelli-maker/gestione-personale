-- Registro misuratori AcquaLatina: l'indice di unicità torna PIENO, come quello ACEA.
--
-- Il perché, trovato il 2026-08-03 con il registro a zero a fronte di 212 interventi positivi.
-- L'indice nasceva parziale:
--
--   CREATE UNIQUE INDEX ... ON (intervento_id) WHERE (intervento_id IS NOT NULL)
--
-- e un indice parziale NON può soddisfare `ON CONFLICT (intervento_id)`: Postgres risponde
-- «there is no unique or exclusion constraint matching the ON CONFLICT specification», perché
-- per agganciare un indice parziale la INSERT dovrebbe ripetere lo stesso predicato — cosa che
-- PostgREST (e quindi `.upsert({ onConflict: 'intervento_id' })`) non sa esprimere.
--
-- Conseguenza vera: l'upsert dentro il gancio dell'invio rapportino — l'UNICA porta d'ingresso
-- che questo registro avesse — falliva a ogni rapportino AcquaLatina chiuso, e falliva in
-- silenzio perché l'errore non veniva letto. Il registro non era «in attesa di riempirsi»:
-- era rotto.
--
-- Il predicato non serviva a niente: in un unique btree i NULL sono sempre DISTINTI fra loro,
-- quindi l'indice pieno ammette esattamente le stesse righe (n righe con intervento_id NULL,
-- una sola per ogni intervento_id valorizzato). Si perde il predicato, non un vincolo.
--
-- L'operazione è sicura anche a tabella piena: se ci fossero duplicati la CREATE fallirebbe e
-- la transazione lascerebbe in piedi il vecchio indice.

BEGIN;

DROP INDEX IF EXISTS public.acqualatina_misuratori_rimossi_intervento_key;

CREATE UNIQUE INDEX acqualatina_misuratori_rimossi_intervento_key
  ON public.acqualatina_misuratori_rimossi (intervento_id);

COMMENT ON INDEX public.acqualatina_misuratori_rimossi_intervento_key IS
  'Unicità per intervento: PIENO (non parziale) perché ON CONFLICT non aggancia gli indici parziali. I NULL restano distinti fra loro.';

COMMIT;
