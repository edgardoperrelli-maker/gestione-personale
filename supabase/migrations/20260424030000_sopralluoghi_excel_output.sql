-- =====================================================
-- MODULO SOPRALLUOGHI - OUTPUT EXCEL AFFIANCATO AL PDF
-- =====================================================

ALTER TABLE public.sopralluoghi_pdf_generati
  ADD COLUMN IF NOT EXISTS excel_url TEXT;

COMMENT ON COLUMN public.sopralluoghi_pdf_generati.excel_url IS 'Percorso pubblico del file Excel generato con lo stesso layout operativo del PDF';
