-- =====================================================
-- MODULO SOPRALLUOGHI - SCOPE PER COMUNE
-- =====================================================

-- Il comune entra nello scope operativo:
-- territorio + attivita + comune.

ALTER TABLE public.civici_napoli
  ADD COLUMN IF NOT EXISTS activity_id UUID;

ALTER TABLE public.sopralluoghi_pdf_generati
  ADD COLUMN IF NOT EXISTS activity_id UUID;

ALTER TABLE public.civici_napoli
  ADD COLUMN IF NOT EXISTS comune TEXT DEFAULT '';

ALTER TABLE public.sopralluoghi_pdf_generati
  ADD COLUMN IF NOT EXISTS comune TEXT DEFAULT '';

UPDATE public.civici_napoli
SET comune = ''
WHERE comune IS NULL;

UPDATE public.sopralluoghi_pdf_generati
SET comune = ''
WHERE comune IS NULL;

CREATE INDEX IF NOT EXISTS idx_civici_comune
  ON public.civici_napoli(comune);

CREATE INDEX IF NOT EXISTS idx_pdf_comune
  ON public.sopralluoghi_pdf_generati(comune);

DROP INDEX IF EXISTS public.idx_civici_napoli_territorio_activity_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_civici_napoli_territorio_activity_unique
  ON public.civici_napoli(territorio_id, activity_id, comune, odonimo, civico);

DROP VIEW IF EXISTS public.microaree_stats;

CREATE VIEW public.microaree_stats AS
SELECT
  c.territorio_id,
  c.activity_id,
  a.name AS activity_name,
  c.comune,
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
GROUP BY c.territorio_id, c.activity_id, a.name, c.comune, c.microarea;

COMMENT ON COLUMN public.civici_napoli.comune IS 'Comune operativo di riferimento per il dataset importato';
COMMENT ON COLUMN public.sopralluoghi_pdf_generati.comune IS 'Comune operativo associato al PDF/Excel generato';
