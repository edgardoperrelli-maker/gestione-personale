-- Registro dei misuratori rimossi della commessa ACQUALATINA.
--
-- Tabella SEPARATA da `misuratori_rimossi` (ACEA) per scelta: i due registri hanno
-- committenti, cicli logistici e responsabili diversi, e mescolarli avrebbe costretto
-- ogni query ACEA esistente a crescere di un filtro. Gli stati logistici sono però gli
-- STESSI (types/misuratori.ts), così il modulo operativo è lo stesso codice.
--
-- Differenze rispetto al registro ACEA:
--   · niente `pdr` — un misuratore d'acqua non ha un punto di riconsegna gas;
--   · niente lettura del vecchio contatore e niente calibro: restano sul rapportino e
--     sull'intervento, al registro di magazzino non servono.
--
-- POPOLAMENTO: alla chiusura del rapportino, quando la voce risulta ESEGUITO = SI
-- (esito `eseguito_positivo`) e porta una matricola. Vedi app/api/r/[token]/invia.
-- L'unicità su `intervento_id` rende l'inserimento idempotente: un rapportino
-- rinviato non duplica la riga.

CREATE TABLE IF NOT EXISTS public.acqualatina_misuratori_rimossi (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id   uuid        REFERENCES public.interventi(id) ON DELETE SET NULL,
  rapportino_id   uuid,
  odl             text,
  data_esecuzione date        NOT NULL,
  esecutore       text,
  indirizzo       text,
  comune          text,
  matricola       text        NOT NULL,
  stato           text        NOT NULL DEFAULT 'da_consegnare_deposito',
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acqualatina_misuratori_rimossi_stato_check CHECK (stato = ANY (ARRAY[
    'da_consegnare_deposito'::text,
    'scaricato_deposito'::text,
    'verificato_deposito'::text,
    'in_consegna_committente'::text,
    'consegnato_committente'::text
  ]))
);

-- Chiave dell'idempotenza dell'upsert dal rapportino (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS acqualatina_misuratori_rimossi_intervento_key
  ON public.acqualatina_misuratori_rimossi (intervento_id)
  WHERE intervento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS acqualatina_misuratori_rimossi_data_idx
  ON public.acqualatina_misuratori_rimossi (data_esecuzione DESC);
CREATE INDEX IF NOT EXISTS acqualatina_misuratori_rimossi_stato_idx
  ON public.acqualatina_misuratori_rimossi (stato);

DROP TRIGGER IF EXISTS acqualatina_misuratori_rimossi_updated_at ON public.acqualatina_misuratori_rimossi;
CREATE TRIGGER acqualatina_misuratori_rimossi_updated_at
  BEFORE UPDATE ON public.acqualatina_misuratori_rimossi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: lettura agli autenticati, scrittura al solo service role (come il registro ACEA).
ALTER TABLE public.acqualatina_misuratori_rimossi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acqualatina_misuratori_rimossi_select ON public.acqualatina_misuratori_rimossi;
CREATE POLICY acqualatina_misuratori_rimossi_select ON public.acqualatina_misuratori_rimossi
  FOR SELECT TO authenticated USING (true);
