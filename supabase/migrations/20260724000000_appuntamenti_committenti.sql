-- Committenti e territori DEGLI APPUNTAMENTI.
-- Dimensione separata dal master `territories` (che è il master della mappa:
-- ACEA, FIRENZE, PERUGIA, LAZIO CENTRO/EST, AURELIA, condiviso con
-- cronoprogramma e pianificazione). AcquaLatina/Terracina non appartiene a quel
-- mondo, quindi vive in tabelle proprie e non inquina i selettori della mappa.
-- Struttura a un livello: committente 1—N territori.

CREATE TABLE IF NOT EXISTS public.appuntamenti_committenti (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text        NOT NULL,
  attivo     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Univocità sul nome case-insensitive: «AcquaLatina» e «acqualatina» sono lo stesso.
CREATE UNIQUE INDEX IF NOT EXISTS appuntamenti_committenti_nome_key
  ON public.appuntamenti_committenti (lower(nome));

CREATE TABLE IF NOT EXISTS public.appuntamenti_territori (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  committente_id uuid       NOT NULL REFERENCES public.appuntamenti_committenti(id) ON DELETE CASCADE,
  nome          text        NOT NULL,
  attivo        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS appuntamenti_territori_committente_nome_key
  ON public.appuntamenti_territori (committente_id, lower(nome));
CREATE INDEX IF NOT EXISTS appuntamenti_territori_committente_idx
  ON public.appuntamenti_territori (committente_id);

-- La funzione set_updated_at() esiste già dalla migrazione 20260413000000_appointments.sql.
CREATE TRIGGER appuntamenti_committenti_updated_at
  BEFORE UPDATE ON public.appuntamenti_committenti
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER appuntamenti_territori_updated_at
  BEFORE UPDATE ON public.appuntamenti_territori
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Collega gli appuntamenti alla nuova dimensione. Il vecchio
-- `territorio_id → territories` resta INTATTO per retro-compatibilità (gli
-- appuntamenti già inseriti lo conservano); il form nuovo non lo scrive più.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS committente_id uuid
    REFERENCES public.appuntamenti_committenti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appuntamento_territorio_id uuid
    REFERENCES public.appuntamenti_territori(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_committente_idx
  ON public.appointments (committente_id);
CREATE INDEX IF NOT EXISTS appointments_appuntamento_territorio_idx
  ON public.appointments (appuntamento_territorio_id);

-- RLS: lettura a ogni utente autenticato; la scrittura passa dal service role
-- (le route admin), esattamente come per `territories`.
ALTER TABLE public.appuntamenti_committenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appuntamenti_territori   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appuntamenti_committenti_select" ON public.appuntamenti_committenti
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "appuntamenti_territori_select" ON public.appuntamenti_territori
  FOR SELECT TO authenticated USING (true);

-- Seed: AcquaLatina → Terracina (l'unico contratto/territorio previsto oggi).
-- WHERE NOT EXISTS invece di ON CONFLICT: evita di dipendere dal nome esatto
-- dell'indice d'espressione e rende la migrazione ripetibile senza errori.
INSERT INTO public.appuntamenti_committenti (nome)
  SELECT 'AcquaLatina'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.appuntamenti_committenti WHERE lower(nome) = lower('AcquaLatina')
  );
INSERT INTO public.appuntamenti_territori (committente_id, nome)
  SELECT c.id, 'Terracina'
  FROM public.appuntamenti_committenti c
  WHERE lower(c.nome) = lower('AcquaLatina')
    AND NOT EXISTS (
      SELECT 1 FROM public.appuntamenti_territori t
      WHERE t.committente_id = c.id AND lower(t.nome) = lower('Terracina')
    );
