-- 1. hotels
CREATE TABLE IF NOT EXISTS hotels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT,
  territory_id  UUID REFERENCES territories(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. hotel_room_prices
-- Prezzi "correnti" per ogni tipologia camera. Nessuna data di validita,
-- si modificano direttamente quando cambiano le tariffe.
CREATE TABLE IF NOT EXISTS hotel_room_prices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id                UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type               TEXT NOT NULL,
  price_per_night         NUMERIC(8,2) NOT NULL DEFAULT 0,
  dinner_price_per_person NUMERIC(8,2),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, room_type)
);

-- 3. home_territory_id su staff
-- NULL = operatore basato in Lazio (necessita hotel per ogni trasferta).
-- uuid = operatore residente in quel territorio (non necessita hotel li).
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS home_territory_id UUID REFERENCES territories(id) ON DELETE SET NULL;

-- 4. hotel_id su hotel_bookings (backward-compat, nullable)
ALTER TABLE hotel_bookings
  ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL;

-- Aggiunge anche territory_id (UUID) per join precisi nell'alert,
-- mantiene territory (text) per backward compat
ALTER TABLE hotel_bookings
  ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES territories(id) ON DELETE SET NULL;

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_room_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotels_select_all" ON hotels;
CREATE POLICY "hotels_select_all"
ON hotels FOR SELECT
USING (true);

DROP POLICY IF EXISTS "hotel_room_prices_select_all" ON hotel_room_prices;
CREATE POLICY "hotel_room_prices_select_all"
ON hotel_room_prices FOR SELECT
USING (true);
