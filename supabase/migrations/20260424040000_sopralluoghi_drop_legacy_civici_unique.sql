-- =====================================================
-- MODULO SOPRALLUOGHI - RIMOZIONE VINCOLO LEGACY CIVICI
-- =====================================================

-- Alcune installazioni hanno ancora un vincolo storico su
-- (odonimo, civico) che blocca l'import su territori diversi.
-- Il modulo Sopralluoghi territorio-aware deve invece consentire
-- lo stesso civico su territori distinti.

ALTER TABLE public.civici_napoli
  DROP CONSTRAINT IF EXISTS civici_napoli_odonimo_civico_key;

DROP INDEX IF EXISTS public.civici_napoli_odonimo_civico_key;
