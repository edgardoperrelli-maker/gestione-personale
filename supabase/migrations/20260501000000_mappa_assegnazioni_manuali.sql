-- Blocco A — Assegnazioni manuali nel modulo mappe (regole + lucchetti + preset)
CREATE TABLE IF NOT EXISTS mappa_assegnazioni_manuali (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id         UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id         TEXT NOT NULL,
  staff_name       TEXT,
  filtro_ods       TEXT[] NOT NULL DEFAULT '{}',
  filtro_indirizzo TEXT[] NOT NULL DEFAULT '{}',
  filtro_cap       TEXT[] NOT NULL DEFAULT '{}',
  filtro_attivita  TEXT[] NOT NULL DEFAULT '{}',
  max_interventi   INT,
  ordine           INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assegnazioni_piano ON mappa_assegnazioni_manuali(piano_id);
ALTER TABLE mappa_assegnazioni_manuali ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assegnazioni_all_authenticated" ON mappa_assegnazioni_manuali;
CREATE POLICY "assegnazioni_all_authenticated" ON mappa_assegnazioni_manuali
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mappa_piani_lucchetti (
  piano_id  UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id  TEXT NOT NULL,
  aperto    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (piano_id, staff_id)
);
ALTER TABLE mappa_piani_lucchetti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lucchetti_all_authenticated" ON mappa_piani_lucchetti;
CREATE POLICY "lucchetti_all_authenticated" ON mappa_piani_lucchetti
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mappa_assegnazioni_preset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  staff_id        TEXT,
  filtro_cap      TEXT[] NOT NULL DEFAULT '{}',
  filtro_attivita TEXT[] NOT NULL DEFAULT '{}',
  max_interventi  INT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mappa_assegnazioni_preset ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "preset_all_authenticated" ON mappa_assegnazioni_preset;
CREATE POLICY "preset_all_authenticated" ON mappa_assegnazioni_preset
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
