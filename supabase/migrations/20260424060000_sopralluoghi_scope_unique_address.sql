-- =====================================================
-- MODULO SOPRALLUOGHI - UNICITA INDIRIZZO PER TERRITORIO + ATTIVITA
-- =====================================================

-- Un civico puo comparire piu volte solo se cambia territorio e/o attivita e/o comune.
-- La microarea non rende valido un doppione nello stesso scope operativo.

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

CREATE TEMP TABLE tmp_sopralluoghi_civici_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY territorio_id, activity_id, comune, odonimo, civico
      ORDER BY
        (
          CASE WHEN latitudine IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN longitudine IS NOT NULL THEN 1 ELSE 0 END
        ) DESC,
        id ASC
    ) AS keeper_id
  FROM public.civici_napoli
  WHERE territorio_id IS NOT NULL
    AND activity_id IS NOT NULL
)
SELECT
  id AS source_id,
  keeper_id AS target_id
FROM ranked
WHERE id <> keeper_id;

DO $$
DECLARE
  merge_row RECORD;
  source_sopralluogo public.sopralluoghi%ROWTYPE;
  target_sopralluogo public.sopralluoghi%ROWTYPE;
  merged_note TEXT;
BEGIN
  FOR merge_row IN
    SELECT source_id, target_id
    FROM tmp_sopralluoghi_civici_merge_map
    ORDER BY target_id, source_id
  LOOP
    SELECT *
    INTO source_sopralluogo
    FROM public.sopralluoghi
    WHERE civico_id = merge_row.source_id
    LIMIT 1;

    IF source_sopralluogo.id IS NOT NULL THEN
      SELECT *
      INTO target_sopralluogo
      FROM public.sopralluoghi
      WHERE civico_id = merge_row.target_id
      LIMIT 1;

      IF target_sopralluogo.id IS NULL THEN
        UPDATE public.sopralluoghi
        SET civico_id = merge_row.target_id
        WHERE id = source_sopralluogo.id;
      ELSE
        merged_note := CASE
          WHEN NULLIF(BTRIM(target_sopralluogo.note), '') IS NULL THEN NULLIF(BTRIM(source_sopralluogo.note), '')
          WHEN NULLIF(BTRIM(source_sopralluogo.note), '') IS NULL THEN target_sopralluogo.note
          WHEN target_sopralluogo.note = source_sopralluogo.note THEN target_sopralluogo.note
          ELSE target_sopralluogo.note || E'\n' || source_sopralluogo.note
        END;

        UPDATE public.sopralluoghi
        SET
          territorio_id = COALESCE(target_sopralluogo.territorio_id, source_sopralluogo.territorio_id),
          data_sopralluogo = COALESCE(target_sopralluogo.data_sopralluogo, source_sopralluogo.data_sopralluogo),
          operatore_user_id = COALESCE(target_sopralluogo.operatore_user_id, source_sopralluogo.operatore_user_id),
          stato = CASE
            WHEN target_sopralluogo.stato = 'visitato' OR source_sopralluogo.stato = 'visitato' THEN 'visitato'
            WHEN target_sopralluogo.stato = 'programmato' OR source_sopralluogo.stato = 'programmato' THEN 'programmato'
            ELSE 'da_visitare'
          END,
          idoneo_risanamento = COALESCE(target_sopralluogo.idoneo_risanamento, FALSE) OR COALESCE(source_sopralluogo.idoneo_risanamento, FALSE),
          punti_gas = CASE
            WHEN target_sopralluogo.punti_gas IS NULL THEN source_sopralluogo.punti_gas
            WHEN source_sopralluogo.punti_gas IS NULL THEN target_sopralluogo.punti_gas
            ELSE GREATEST(target_sopralluogo.punti_gas, source_sopralluogo.punti_gas)
          END,
          note = merged_note,
          pdf_scansione_url = COALESCE(target_sopralluogo.pdf_scansione_url, source_sopralluogo.pdf_scansione_url),
          created_by = COALESCE(target_sopralluogo.created_by, source_sopralluogo.created_by)
        WHERE id = target_sopralluogo.id;

        DELETE FROM public.sopralluoghi
        WHERE id = source_sopralluogo.id;
      END IF;
    END IF;

    DELETE FROM public.civici_napoli
    WHERE id = merge_row.source_id;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.idx_civici_napoli_territorio_activity_unique;
DROP INDEX IF EXISTS public.idx_civici_napoli_territorio_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_civici_napoli_territorio_activity_unique
  ON public.civici_napoli(territorio_id, activity_id, comune, odonimo, civico);
