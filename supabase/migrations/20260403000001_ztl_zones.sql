-- Zone ZTL (Zone a Traffico Limitato)
CREATE TABLE IF NOT EXISTS ztl_zones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  cap_list    text[]      NOT NULL DEFAULT '{}',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Operatori autorizzati per zona
CREATE TABLE IF NOT EXISTS ztl_zone_operators (
  zone_id     uuid  NOT NULL REFERENCES ztl_zones(id) ON DELETE CASCADE,
  staff_id    text  NOT NULL,
  PRIMARY KEY (zone_id, staff_id)
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ztl_zones_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ztl_zones_ts
  BEFORE UPDATE ON ztl_zones
  FOR EACH ROW EXECUTE FUNCTION update_ztl_zones_ts();

-- Row Level Security
ALTER TABLE ztl_zones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ztl_zone_operators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read ztl_zones"
  ON ztl_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write ztl_zones"
  ON ztl_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read ztl_zone_operators"
  ON ztl_zone_operators FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write ztl_zone_operators"
  ON ztl_zone_operators FOR ALL TO authenticated USING (true) WITH CHECK (true);
