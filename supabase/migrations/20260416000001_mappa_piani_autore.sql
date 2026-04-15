-- Add updated_by column to track who last modified a piano (plan)
ALTER TABLE public.mappa_piani
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
