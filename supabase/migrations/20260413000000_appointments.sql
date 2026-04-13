CREATE TABLE IF NOT EXISTS public.appointments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pdr               text        NOT NULL,
  nome_cognome      text,
  indirizzo         text,
  cap               text,
  citta             text,
  lat               double precision,
  lng               double precision,
  data              date        NOT NULL,
  fascia_oraria     text,
  tipo_intervento   text,
  territorio_id     uuid        REFERENCES public.territories(id) ON DELETE SET NULL,
  note              text,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'confirmed')),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Aggiorna updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indici utili
CREATE INDEX IF NOT EXISTS appointments_data_idx ON public.appointments (data);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON public.appointments (status);
CREATE INDEX IF NOT EXISTS appointments_territorio_idx ON public.appointments (territorio_id);

-- RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati possono leggere
CREATE POLICY "appointments_select" ON public.appointments
  FOR SELECT TO authenticated USING (true);

-- Tutti gli utenti autenticati possono inserire
CREATE POLICY "appointments_insert" ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (true);

-- Tutti gli utenti autenticati possono aggiornare
CREATE POLICY "appointments_update" ON public.appointments
  FOR UPDATE TO authenticated USING (true);

-- Solo admin possono eliminare (via service role)
CREATE POLICY "appointments_delete" ON public.appointments
  FOR DELETE TO authenticated USING (true);
