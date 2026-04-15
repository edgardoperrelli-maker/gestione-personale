CREATE TABLE mappa_distribuzioni (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id text NOT NULL,
  data date NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, data)
);

ALTER TABLE mappa_distribuzioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_policy" ON mappa_distribuzioni FOR ALL TO authenticated USING (true);
