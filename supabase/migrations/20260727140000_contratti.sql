-- Modulo CONTRATTI — anagrafica unica delle commesse.
--
-- Prima di questa migrazione «AcquaLatina» era scritto in tre posti scollegati:
-- `territories` (master mappa/cronoprogramma), `appuntamenti_committenti` (solo il
-- modulo Appuntamenti) e le stringhe `committente` sparse sulle tabelle operative.
-- Qui nasce la gerarchia unica:
--
--   committenti 1—N contratti 1—N contratto_territori
--
-- Il contratto È LA COMMESSA (nome, validità, territori di copertura, listino). Le
-- ATTIVITÀ del contratto non hanno una tabella propria: sono le righe di
-- `attivita_tassonomia` del committente, che restano l'unica fonte di verità per
-- import, classificazione e Azioni operatori.
--
-- Scelta di fondo: REGISTRO ADDITIVO. La stringa `committente` resta la chiave di
-- runtime su interventi/tassonomia/flussi — nessuna FK sullo storico, nessuna
-- migrazione dei dati operativi. `committenti.codice` è il ponte fra le due viste.

-- ─── 1. Anagrafica ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.committenti (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text        NOT NULL,
  -- Chiave di runtime ('acea' | 'italgas' | 'acqualatina'): collega il contratto alle
  -- righe operative. NULL per un committente ancora senza lavorazioni a sistema.
  codice     text,
  attivo     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS committenti_nome_key ON public.committenti (lower(nome));
CREATE UNIQUE INDEX IF NOT EXISTS committenti_codice_key
  ON public.committenti (codice) WHERE codice IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contratti (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  committente_id uuid        NOT NULL REFERENCES public.committenti(id) ON DELETE CASCADE,
  nome           text        NOT NULL,
  valido_dal     date,
  valido_al      date,
  attivo         boolean     NOT NULL DEFAULT true,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contratti_validita_check CHECK (valido_al IS NULL OR valido_dal IS NULL OR valido_al >= valido_dal)
);
CREATE UNIQUE INDEX IF NOT EXISTS contratti_committente_nome_key
  ON public.contratti (committente_id, lower(nome));
CREATE INDEX IF NOT EXISTS contratti_committente_idx ON public.contratti (committente_id);

-- Territori di copertura: nome del comune/zona + aggancio OPZIONALE al master
-- `territories` (quello che pilota cronoprogramma e mappa). L'aggancio è opzionale
-- perché un comune coperto non è per forza un territorio di pianificazione.
CREATE TABLE IF NOT EXISTS public.contratto_territori (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id uuid        NOT NULL REFERENCES public.contratti(id) ON DELETE CASCADE,
  nome         text        NOT NULL,
  territory_id uuid        REFERENCES public.territories(id) ON DELETE SET NULL,
  attivo       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contratto_territori_contratto_nome_key
  ON public.contratto_territori (contratto_id, lower(nome));
CREATE INDEX IF NOT EXISTS contratto_territori_contratto_idx
  ON public.contratto_territori (contratto_id);

-- set_updated_at() esiste dalla 20260413000000_appointments.sql.
DROP TRIGGER IF EXISTS committenti_updated_at ON public.committenti;
CREATE TRIGGER committenti_updated_at BEFORE UPDATE ON public.committenti
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS contratti_updated_at ON public.contratti;
CREATE TRIGGER contratti_updated_at BEFORE UPDATE ON public.contratti
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS contratto_territori_updated_at ON public.contratto_territori;
CREATE TRIGGER contratto_territori_updated_at BEFORE UPDATE ON public.contratto_territori
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. Assorbimento di appuntamenti_committenti / appuntamenti_territori ──────
-- Gli UUID vengono CONSERVATI: così `appointments.committente_id` e
-- `appointments.appuntamento_territorio_id` restano validi dopo il repuntamento
-- delle foreign key, senza toccare una sola riga di appointments.

INSERT INTO public.committenti (id, nome, attivo, created_at)
SELECT c.id, c.nome, c.attivo, c.created_at
FROM public.appuntamenti_committenti c
WHERE NOT EXISTS (SELECT 1 FROM public.committenti x WHERE lower(x.nome) = lower(c.nome));

-- Ogni committente assorbito ottiene il suo primo contratto (l'ufficio lo rinomina
-- dalla UI quando il capitolato ha un titolo proprio).
INSERT INTO public.contratti (committente_id, nome)
SELECT c.id, 'Commessa ' || c.nome
FROM public.committenti c
WHERE NOT EXISTS (SELECT 1 FROM public.contratti k WHERE k.committente_id = c.id);

INSERT INTO public.contratto_territori (id, contratto_id, nome, attivo, created_at)
SELECT t.id, k.id, t.nome, t.attivo, t.created_at
FROM public.appuntamenti_territori t
JOIN public.contratti k ON k.committente_id = t.committente_id
WHERE NOT EXISTS (SELECT 1 FROM public.contratto_territori x WHERE x.id = t.id);

-- Repuntamento delle FK di appointments sulla nuova anagrafica.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_committente_id_fkey,
  DROP CONSTRAINT IF EXISTS appointments_appuntamento_territorio_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_committente_id_fkey
    FOREIGN KEY (committente_id) REFERENCES public.committenti(id) ON DELETE SET NULL,
  ADD CONSTRAINT appointments_appuntamento_territorio_id_fkey
    FOREIGN KEY (appuntamento_territorio_id) REFERENCES public.contratto_territori(id) ON DELETE SET NULL;

DROP TABLE IF EXISTS public.appuntamenti_territori;
DROP TABLE IF EXISTS public.appuntamenti_committenti;

-- ─── 3. Codici di runtime + commesse già a sistema ────────────────────────────

UPDATE public.committenti SET codice = 'acqualatina'
  WHERE codice IS NULL AND lower(nome) IN ('acqualatina', 'acqua latina');

INSERT INTO public.committenti (nome, codice)
SELECT v.nome, v.codice
FROM (VALUES ('ACEA', 'acea'), ('Italgas', 'italgas')) AS v(nome, codice)
WHERE NOT EXISTS (
  SELECT 1 FROM public.committenti c
  WHERE c.codice = v.codice OR lower(c.nome) = lower(v.nome)
);

INSERT INTO public.contratti (committente_id, nome)
SELECT c.id, 'Commessa ' || c.nome
FROM public.committenti c
WHERE NOT EXISTS (SELECT 1 FROM public.contratti k WHERE k.committente_id = c.id);

-- Aggancio al master territori dove il nome coincide (ACEA). Per AcquaLatina il
-- territorio di pianificazione è 'ACQUA LATINA' mentre il comune coperto è 'Terracina':
-- è esattamente il caso per cui `territory_id` è separato da `nome`.
UPDATE public.contratto_territori ct SET territory_id = t.id
FROM public.territories t, public.contratti k, public.committenti c
WHERE ct.contratto_id = k.id AND k.committente_id = c.id
  AND ct.territory_id IS NULL
  AND c.codice = 'acqualatina' AND t.name = 'ACQUA LATINA';

INSERT INTO public.contratto_territori (contratto_id, nome, territory_id)
SELECT k.id, t.name, t.id
FROM public.committenti c
JOIN public.contratti k ON k.committente_id = c.id
JOIN public.territories t ON t.name = 'ACEA'
WHERE c.codice = 'acea'
  AND NOT EXISTS (SELECT 1 FROM public.contratto_territori x WHERE x.contratto_id = k.id);

-- Validità del contratto AcquaLatina dal territorio già censito dall'ufficio.
UPDATE public.contratti k
SET valido_dal = COALESCE(k.valido_dal, t.valid_from), valido_al = COALESCE(k.valido_al, t.valid_to)
FROM public.committenti c, public.territories t
WHERE k.committente_id = c.id AND c.codice = 'acqualatina' AND t.name = 'ACQUA LATINA';

-- ─── 4. `acea_listino` diventa il listino di TUTTI i contratti ────────────────
-- Il nome era già bugiardo: la tabella prezza per attività, non per committente.
-- La colonna `committente` resta (i 4 consumer del motore economico ACEA continuano a
-- filtrarci sopra, invariati); `contratto_id` è la dimensione nuova.

ALTER TABLE IF EXISTS public.acea_listino RENAME TO listino;

ALTER TABLE public.listino
  ADD COLUMN IF NOT EXISTS contratto_id uuid REFERENCES public.contratti(id) ON DELETE CASCADE,
  -- Extra fatturabile agganciato a un'AZIONE del rapportino (es. 'saracinesca').
  -- NULL = tariffa della voce base dell'attività.
  ADD COLUMN IF NOT EXISTS azione_chiave text;
CREATE INDEX IF NOT EXISTS listino_contratto_idx ON public.listino (contratto_id);

UPDATE public.listino l SET contratto_id = k.id
FROM public.committenti c JOIN public.contratti k ON k.committente_id = c.id
WHERE l.contratto_id IS NULL AND c.codice = l.committente;

-- Una tariffa per (contratto, attività, extra, inizio validità). Sostituisce
-- l'indice per committente: `coalesce` perché in SQL NULL non collide con NULL.
DROP INDEX IF EXISTS acea_listino_attivita_idx;
CREATE UNIQUE INDEX IF NOT EXISTS listino_contratto_attivita_idx
  ON public.listino (contratto_id, attivita, coalesce(azione_chiave, ''), valido_dal)
  WHERE attivita IS NOT NULL;

-- Righe AcquaLatina a PREZZO ZERO: le compila l'ufficio dal modulo Contratti.
-- La voce base copre la sostituzione; la saracinesca è l'unico extra a prezzo proprio
-- (i codoli sono compresi: la loro crocetta serve al conteggio materiale, non al conto).
INSERT INTO public.listino (committente, contratto_id, attivita, etichetta, azione_chiave, prezzo, valido_dal, note)
SELECT 'acqualatina', k.id, v.attivita, v.etichetta, v.azione, 0, COALESCE(k.valido_dal, current_date), v.note
FROM public.committenti c
JOIN public.contratti k ON k.committente_id = c.id
CROSS JOIN (VALUES
  ('SOSTITUZIONE MISURATORE', 'Sostituzione misuratore', NULL, 'Voce base della commessa (codoli compresi).'),
  ('SOSTITUZIONE MISURATORE', 'Sostituzione saracinesca', 'saracinesca', 'Extra: crocetta SARACINESCA del rapportino.')
) AS v(attivita, etichetta, azione, note)
WHERE c.codice = 'acqualatina'
  AND NOT EXISTS (
    SELECT 1 FROM public.listino l
    WHERE l.contratto_id = k.id AND l.attivita = v.attivita
      AND coalesce(l.azione_chiave, '') = coalesce(v.azione, '')
  );

-- ─── 5. RLS: lettura autenticati, scrittura service role (come territories) ────

ALTER TABLE public.committenti         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratti           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratto_territori ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS committenti_select ON public.committenti;
CREATE POLICY committenti_select ON public.committenti
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contratti_select ON public.contratti;
CREATE POLICY contratti_select ON public.contratti
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contratto_territori_select ON public.contratto_territori;
CREATE POLICY contratto_territori_select ON public.contratto_territori
  FOR SELECT TO authenticated USING (true);
