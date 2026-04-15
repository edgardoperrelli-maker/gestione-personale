-- Create mappa_piani table
CREATE TABLE mappa_piani (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  territorio TEXT NOT NULL,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'confermato')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create mappa_piani_operatori table
CREATE TABLE mappa_piani_operatori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  colore TEXT,
  km NUMERIC(8, 2),
  task_count INT,
  start_address TEXT,
  tasks JSONB,
  polyline JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices
CREATE INDEX idx_mappa_piani_data ON mappa_piani(data);
CREATE INDEX idx_mappa_piani_territorio ON mappa_piani(territorio);
CREATE INDEX idx_mappa_piani_operatori_piano_id ON mappa_piani_operatori(piano_id);
CREATE INDEX idx_mappa_piani_operatori_staff_id ON mappa_piani_operatori(staff_id);

-- Enable RLS
ALTER TABLE mappa_piani ENABLE ROW LEVEL SECURITY;
ALTER TABLE mappa_piani_operatori ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "mappa_piani_auth" ON mappa_piani FOR ALL TO authenticated USING (true);
CREATE POLICY "mappa_piani_operatori_auth" ON mappa_piani_operatori FOR ALL TO authenticated USING (true);
