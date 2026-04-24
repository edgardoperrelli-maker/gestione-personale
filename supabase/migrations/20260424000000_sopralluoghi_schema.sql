-- =====================================================
-- MODULO SOPRALLUOGHI - RISANAMENTO COLONNE MONTANTI
-- =====================================================

-- Tabella anagrafica civici Napoli (da CSV ANNCSU)
CREATE TABLE IF NOT EXISTS public.civici_napoli (
  id BIGSERIAL PRIMARY KEY,
  territorio_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  activity_id UUID,
  comune TEXT NOT NULL DEFAULT '',
  odonimo TEXT NOT NULL,
  civico TEXT NOT NULL,
  microarea TEXT NOT NULL,
  latitudine DECIMAL(9,7),
  longitudine DECIMAL(9,7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX idx_civici_territorio ON public.civici_napoli(territorio_id);
CREATE INDEX idx_civici_activity ON public.civici_napoli(activity_id);
CREATE INDEX idx_civici_comune ON public.civici_napoli(comune);
CREATE INDEX idx_civici_microarea ON public.civici_napoli(microarea);
CREATE INDEX idx_civici_odonimo ON public.civici_napoli(odonimo);
CREATE INDEX idx_civici_geo ON public.civici_napoli(latitudine, longitudine);
CREATE UNIQUE INDEX idx_civici_napoli_territorio_activity_unique
  ON public.civici_napoli(territorio_id, activity_id, comune, odonimo, civico);

-- Tabella sopralluoghi (data entry manuale dopo PDF compilato)
CREATE TABLE IF NOT EXISTS public.sopralluoghi (
  id BIGSERIAL PRIMARY KEY,
  civico_id BIGINT UNIQUE REFERENCES public.civici_napoli(id) ON DELETE CASCADE,
  territorio_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  data_sopralluogo DATE,
  operatore_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stato TEXT NOT NULL CHECK (stato IN ('da_visitare', 'visitato', 'programmato')),
  idoneo_risanamento BOOLEAN DEFAULT FALSE,
  punti_gas INTEGER CHECK (punti_gas >= 0),
  note TEXT,
  pdf_scansione_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indici
CREATE INDEX idx_sopralluoghi_civico ON public.sopralluoghi(civico_id);
CREATE INDEX idx_sopralluoghi_stato ON public.sopralluoghi(stato);
CREATE INDEX idx_sopralluoghi_territorio ON public.sopralluoghi(territorio_id);
CREATE INDEX idx_sopralluoghi_data ON public.sopralluoghi(data_sopralluogo);

-- Trigger per updated_at
CREATE OR REPLACE FUNCTION update_sopralluoghi_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sopralluoghi_updated_at
  BEFORE UPDATE ON public.sopralluoghi
  FOR EACH ROW
  EXECUTE FUNCTION update_sopralluoghi_timestamp();

-- Tabella PDF generati per tracking
CREATE TABLE IF NOT EXISTS public.sopralluoghi_pdf_generati (
  id BIGSERIAL PRIMARY KEY,
  microarea TEXT NOT NULL,
  territorio_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  activity_id UUID,
  comune TEXT NOT NULL DEFAULT '',
  num_civici INTEGER NOT NULL,
  data_generazione TIMESTAMPTZ DEFAULT NOW(),
  stato_registrazione TEXT CHECK (stato_registrazione IN ('generato', 'in_lavorazione', 'completato')) DEFAULT 'generato',
  generato_da UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pdf_url TEXT,
  excel_url TEXT,
  note TEXT
);

CREATE INDEX idx_pdf_microarea ON public.sopralluoghi_pdf_generati(microarea);
CREATE INDEX idx_pdf_stato ON public.sopralluoghi_pdf_generati(stato_registrazione);
CREATE INDEX idx_pdf_activity ON public.sopralluoghi_pdf_generati(activity_id);
CREATE INDEX idx_pdf_comune ON public.sopralluoghi_pdf_generati(comune);

-- Vista aggregata per statistiche microaree
CREATE OR REPLACE VIEW public.microaree_stats AS
SELECT
  c.territorio_id,
  c.activity_id,
  a.name AS activity_name,
  c.comune,
  c.microarea,
  COUNT(DISTINCT c.id) as totale_civici,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'visitato') as visitati,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'programmato') as programmati,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'da_visitare') as da_visitare,
  COUNT(DISTINCT s.id) FILTER (WHERE s.idoneo_risanamento = true) as idonei_risanamento,
  MIN(c.latitudine) as lat_min,
  MAX(c.latitudine) as lat_max,
  MIN(c.longitudine) as lon_min,
  MAX(c.longitudine) as lon_max,
  AVG(c.latitudine) as lat_centro,
  AVG(c.longitudine) as lon_centro
FROM public.civici_napoli c
LEFT JOIN public.activities_renamed a ON a.id = c.activity_id
LEFT JOIN public.sopralluoghi s ON c.id = s.civico_id
GROUP BY c.territorio_id, c.activity_id, a.name, c.comune, c.microarea;

CREATE OR REPLACE VIEW public.sopralluoghi_dataset_caricati AS
SELECT
  c.territorio_id,
  t.name AS territorio_name,
  c.activity_id,
  a.name AS activity_name,
  c.comune,
  COUNT(*)::BIGINT AS totale_civici,
  COUNT(DISTINCT c.microarea)::INTEGER AS totale_microaree,
  MIN(c.created_at) AS primo_caricamento,
  MAX(c.created_at) AS ultimo_caricamento,
  COALESCE((
    SELECT COUNT(*)::INTEGER
    FROM public.sopralluoghi_pdf_generati pdf
    WHERE pdf.territorio_id IS NOT DISTINCT FROM c.territorio_id
      AND pdf.activity_id IS NOT DISTINCT FROM c.activity_id
      AND pdf.comune = c.comune
  ), 0) AS pdf_generati
FROM public.civici_napoli c
LEFT JOIN public.territories t ON t.id = c.territorio_id
LEFT JOIN public.activities_renamed a ON a.id = c.activity_id
GROUP BY c.territorio_id, t.name, c.activity_id, a.name, c.comune;

-- RLS Policies
ALTER TABLE public.civici_napoli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sopralluoghi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sopralluoghi_pdf_generati ENABLE ROW LEVEL SECURITY;

-- Policy: tutti gli utenti autenticati possono leggere civici
CREATE POLICY "Civici visibili a utenti autenticati"
  ON public.civici_napoli FOR SELECT
  TO authenticated
  USING (true);

-- Policy: solo admin possono modificare sopralluoghi
CREATE POLICY "Admin possono gestire sopralluoghi"
  ON public.sopralluoghi FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: lettura sopralluoghi per tutti autenticati
CREATE POLICY "Sopralluoghi visibili a autenticati"
  ON public.sopralluoghi FOR SELECT
  TO authenticated
  USING (true);

-- Policy: PDF generati - solo admin
CREATE POLICY "Admin gestiscono PDF generati"
  ON public.sopralluoghi_pdf_generati FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Commenti
COMMENT ON TABLE public.civici_napoli IS 'Anagrafica civici Napoli da ANNCSU - 526 microaree, ~127k civici';
COMMENT ON TABLE public.sopralluoghi IS 'Registro sopralluoghi risanamento colonne montanti';
COMMENT ON TABLE public.sopralluoghi_pdf_generati IS 'Tracking PDF sopralluogo generati';
COMMENT ON VIEW public.sopralluoghi_dataset_caricati IS 'Catalogo dataset Sopralluoghi attualmente caricati, raggruppati per territorio + attivita + comune';
COMMENT ON COLUMN public.sopralluoghi.stato IS 'da_visitare | visitato | programmato';
COMMENT ON COLUMN public.civici_napoli.activity_id IS 'Attivita del cronoprogramma a cui appartiene il dataset importato';
COMMENT ON COLUMN public.civici_napoli.comune IS 'Comune operativo di riferimento per il dataset importato';
COMMENT ON COLUMN public.sopralluoghi_pdf_generati.activity_id IS 'Attivita del cronoprogramma associata al PDF/Excel generato';
COMMENT ON COLUMN public.sopralluoghi_pdf_generati.comune IS 'Comune operativo associato al PDF/Excel generato';
