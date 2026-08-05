-- Ponte staff <-> utenza di login (app operatore): ogni operatore puo' avere UNA
-- utenza auth collegata. UNIQUE perche' un'utenza serve un solo operatore;
-- ON DELETE SET NULL perche' cancellare l'utenza (area Utenze, admin_plus) non deve
-- toccare l'anagrafica: l'operatore resta, si scollega soltanto.
-- Migration ADDITIVA: sicura prima del deploy (nessun drop, nessuna riga toccata).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
