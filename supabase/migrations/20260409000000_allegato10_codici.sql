CREATE TABLE IF NOT EXISTS public.allegato10_codici (
  codice          text        PRIMARY KEY,
  genera_allegato boolean     NOT NULL DEFAULT false,
  discovered_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed codici attivi di default
INSERT INTO public.allegato10_codici (codice, genera_allegato) VALUES
  ('S-AI-022', true),
  ('S-AI-021', true),
  ('S-AI-023', true),
  ('S-AI-049', true),
  ('S-AI-050', true),
  ('S-PR-007', true),
  ('S-AI-002', true),
  ('S-PR-077', true)
ON CONFLICT (codice) DO NOTHING;
