-- Tabella per cache persistente di indirizzi geocodificati manualmente
-- Si salva SOLO ciò che l'utente ha corretto manualmente
CREATE TABLE IF NOT EXISTS geocoding_cache (
  id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key    text             UNIQUE NOT NULL,
  indirizzo_raw text             NOT NULL,
  cap_raw       text             NOT NULL DEFAULT '',
  citta_raw     text             NOT NULL DEFAULT '',
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  created_at    timestamptz      NOT NULL DEFAULT now(),
  updated_at    timestamptz      NOT NULL DEFAULT now()
);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_geocoding_cache_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geocoding_cache_ts
  BEFORE UPDATE ON geocoding_cache
  FOR EACH ROW EXECUTE FUNCTION update_geocoding_cache_ts();

-- Row Level Security
ALTER TABLE geocoding_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read"   ON geocoding_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert" ON geocoding_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update" ON geocoding_cache FOR UPDATE TO authenticated USING (true);
