-- =====================================================
-- MODULO SOPRALLUOGHI - CATALOGO DATASET CARICATI
-- =====================================================

-- Vista di servizio per elencare i dataset oggi presenti nel modulo,
-- raggruppati per territorio + attivita + comune.

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

COMMENT ON VIEW public.sopralluoghi_dataset_caricati IS 'Catalogo dataset Sopralluoghi attualmente caricati, raggruppati per territorio + attivita + comune';
