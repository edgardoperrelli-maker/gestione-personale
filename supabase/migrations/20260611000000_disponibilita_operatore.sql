-- Disponibilità / assenze operatore (fonte unica per Cronoprogramma ↔ Mappa).
-- Indipendente dal territorio: un'assenza è uno stato della persona.
CREATE TABLE IF NOT EXISTS disponibilita_operatore (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    text NOT NULL,                 -- convenzione progetto (no FK su schema base)
  data        date NOT NULL,
  tipo        text NOT NULL
              CHECK (tipo IN ('ferie','104','malattia','permesso','congedo','lutto')),
  modalita    text NOT NULL DEFAULT 'intera'
              CHECK (modalita IN ('intera','parziale')),
  ora_da      time NULL,                     -- inizio finestra DISPONIBILITÀ (null = da inizio giornata)
  ora_a       time NULL,                     -- fine finestra DISPONIBILITÀ   (null = fino a fine giornata)
  note        text NULL,
  created_by  uuid NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (staff_id, data)
);

CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_data
  ON disponibilita_operatore (data);
CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_staff_data
  ON disponibilita_operatore (staff_id, data);

ALTER TABLE disponibilita_operatore ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_policy" ON disponibilita_operatore
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
