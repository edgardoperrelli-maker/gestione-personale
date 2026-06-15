-- Centro di costo dell'operatore: default fisso + override a periodo.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS cost_center text NULL;

CREATE TABLE IF NOT EXISTS staff_cost_center_ranges (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    text NOT NULL,
  cost_center text NOT NULL,
  valid_from  date NOT NULL,
  valid_to    date NULL,                 -- NULL = a tempo indeterminato da valid_from
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_cc_ranges_staff ON staff_cost_center_ranges (staff_id);

ALTER TABLE staff_cost_center_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_policy" ON staff_cost_center_ranges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
