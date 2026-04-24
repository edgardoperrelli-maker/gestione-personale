-- =====================================================
-- MODULO SOPRALLUOGHI - PG / PUNTI GAS
-- =====================================================

ALTER TABLE public.sopralluoghi
  ADD COLUMN IF NOT EXISTS punti_gas INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sopralluoghi_punti_gas_check'
  ) THEN
    ALTER TABLE public.sopralluoghi
      ADD CONSTRAINT sopralluoghi_punti_gas_check
      CHECK (punti_gas IS NULL OR punti_gas >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.sopralluoghi.punti_gas IS 'Numero di punti gas presenti nello stabile per i civici idonei';
