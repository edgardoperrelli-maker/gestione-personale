-- =====================================================
-- MODULO SOPRALLUOGHI - SCOPE PER TIPOLOGIA LAVORO
-- =====================================================

-- Gli indirizzi importati e i file generati vengono ora distinti
-- per territorio + attivita del cronoprogramma.

ALTER TABLE public.civici_napoli
  ADD COLUMN IF NOT EXISTS activity_id UUID;

ALTER TABLE public.sopralluoghi_pdf_generati
  ADD COLUMN IF NOT EXISTS activity_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'civici_napoli_activity_id_fkey'
  ) THEN
    ALTER TABLE public.civici_napoli
      ADD CONSTRAINT civici_napoli_activity_id_fkey
      FOREIGN KEY (activity_id) REFERENCES public.activities_renamed(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sopralluoghi_pdf_generati_activity_id_fkey'
  ) THEN
    ALTER TABLE public.sopralluoghi_pdf_generati
      ADD CONSTRAINT sopralluoghi_pdf_generati_activity_id_fkey
      FOREIGN KEY (activity_id) REFERENCES public.activities_renamed(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_civici_activity
  ON public.civici_napoli(activity_id);

CREATE INDEX IF NOT EXISTS idx_civici_territorio_activity_microarea
  ON public.civici_napoli(territorio_id, activity_id, microarea);

CREATE INDEX IF NOT EXISTS idx_pdf_activity
  ON public.sopralluoghi_pdf_generati(activity_id);

DROP INDEX IF EXISTS public.idx_civici_napoli_territorio_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_civici_napoli_territorio_activity_unique
  ON public.civici_napoli(territorio_id, activity_id, odonimo, civico, microarea);

DROP VIEW IF EXISTS public.microaree_stats;

CREATE VIEW public.microaree_stats AS
SELECT
  c.territorio_id,
  c.activity_id,
  a.name AS activity_name,
  c.microarea,
  COUNT(DISTINCT c.id) AS totale_civici,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'visitato') AS visitati,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'programmato') AS programmati,
  COUNT(DISTINCT s.id) FILTER (WHERE s.stato = 'da_visitare') AS da_visitare,
  COUNT(DISTINCT s.id) FILTER (WHERE s.idoneo_risanamento = true) AS idonei_risanamento,
  MIN(c.latitudine) AS lat_min,
  MAX(c.latitudine) AS lat_max,
  MIN(c.longitudine) AS lon_min,
  MAX(c.longitudine) AS lon_max,
  AVG(c.latitudine) AS lat_centro,
  AVG(c.longitudine) AS lon_centro
FROM public.civici_napoli c
LEFT JOIN public.activities_renamed a ON a.id = c.activity_id
LEFT JOIN public.sopralluoghi s ON c.id = s.civico_id
GROUP BY c.territorio_id, c.activity_id, a.name, c.microarea;

COMMENT ON COLUMN public.civici_napoli.activity_id IS 'Attivita del cronoprogramma a cui appartiene il dataset importato';
COMMENT ON COLUMN public.sopralluoghi_pdf_generati.activity_id IS 'Attivita del cronoprogramma associata al PDF/Excel generato';
