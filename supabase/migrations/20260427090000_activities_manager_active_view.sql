CREATE OR REPLACE VIEW public.activities_renamed AS
SELECT
  id,
  name
FROM public.activities
WHERE active IS DISTINCT FROM false;

GRANT SELECT ON public.activities_renamed TO anon, authenticated;

COMMENT ON VIEW public.activities_renamed IS
  'Elenco attivita attive condiviso da cronoprogramma, mappa e sopralluoghi. Gestito da Impostazioni > Gruppo Attivita.';
