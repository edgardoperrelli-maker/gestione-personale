-- =====================================================
-- MODULO SOPRALLUOGHI - UPGRADE SCHEMA TERRITORIO-AWARE
-- =====================================================

-- Questa migration aggiorna installazioni dove le tabelle
-- del modulo Sopralluoghi esistono gia senza i campi territorio_id.

ALTER TABLE public.civici_napoli
  ADD COLUMN IF NOT EXISTS territorio_id UUID;

ALTER TABLE public.sopralluoghi
  ADD COLUMN IF NOT EXISTS territorio_id UUID;

ALTER TABLE public.sopralluoghi_pdf_generati
  ADD COLUMN IF NOT EXISTS territorio_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'civici_napoli_territorio_id_fkey'
  ) THEN
    ALTER TABLE public.civici_napoli
      ADD CONSTRAINT civici_napoli_territorio_id_fkey
      FOREIGN KEY (territorio_id) REFERENCES public.territories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sopralluoghi_territorio_id_fkey'
  ) THEN
    ALTER TABLE public.sopralluoghi
      ADD CONSTRAINT sopralluoghi_territorio_id_fkey
      FOREIGN KEY (territorio_id) REFERENCES public.territories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sopralluoghi_pdf_generati_territorio_id_fkey'
  ) THEN
    ALTER TABLE public.sopralluoghi_pdf_generati
      ADD CONSTRAINT sopralluoghi_pdf_generati_territorio_id_fkey
      FOREIGN KEY (territorio_id) REFERENCES public.territories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Se i dati storici presenti sono quelli di Napoli, li riallineiamo
-- al territorio corrispondente cosi non vengono "persi" dopo l'upgrade.
DO $$
DECLARE
  napoli_territorio_id UUID;
BEGIN
  SELECT id
  INTO napoli_territorio_id
  FROM public.territories
  WHERE UPPER(name) = 'NAPOLI'
  ORDER BY name
  LIMIT 1;

  IF napoli_territorio_id IS NOT NULL THEN
    UPDATE public.civici_napoli
    SET territorio_id = napoli_territorio_id
    WHERE territorio_id IS NULL;

    UPDATE public.sopralluoghi
    SET territorio_id = napoli_territorio_id
    WHERE territorio_id IS NULL;

    UPDATE public.sopralluoghi_pdf_generati
    SET territorio_id = napoli_territorio_id
    WHERE territorio_id IS NULL;
  END IF;
END $$;

-- Rimuove il vincolo legacy che impedisce di avere lo stesso civico
-- su territori diversi.
ALTER TABLE public.civici_napoli
  DROP CONSTRAINT IF EXISTS civici_napoli_odonimo_civico_microarea_key;

DROP INDEX IF EXISTS public.civici_napoli_odonimo_civico_microarea_key;

CREATE INDEX IF NOT EXISTS idx_civici_territorio
  ON public.civici_napoli(territorio_id);

CREATE INDEX IF NOT EXISTS idx_sopralluoghi_territorio
  ON public.sopralluoghi(territorio_id);

CREATE INDEX IF NOT EXISTS idx_pdf_territorio
  ON public.sopralluoghi_pdf_generati(territorio_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_civici_napoli_territorio_unique
  ON public.civici_napoli(territorio_id, odonimo, civico, microarea);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sopralluoghi_civico_unique
  ON public.sopralluoghi(civico_id)
  WHERE civico_id IS NOT NULL;

DROP VIEW IF EXISTS public.microaree_stats;

CREATE VIEW public.microaree_stats AS
SELECT
  c.territorio_id,
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
LEFT JOIN public.sopralluoghi s ON c.id = s.civico_id
GROUP BY c.territorio_id, c.microarea;
