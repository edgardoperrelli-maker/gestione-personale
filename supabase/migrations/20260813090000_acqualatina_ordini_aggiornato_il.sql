-- `acqualatina_ordini.aggiornato_il` si muove anche sugli UPDATE, come sul registro ACEA.
--
-- COSA MANCAVA. La colonna nasce `not null default now()`, quindi la scrive l'INSERT e nessuno
-- la tocca più: una riga corretta dal sync (anagrafica difforme, adozione della matricola) o
-- dall'ufficio in cella restava col timestamp del giorno in cui era entrata. `acea_ordini` e
-- `acea_impianti` hanno il trigger dal 28/07 (`20260728133000`); questa tabella è stata creata
-- tre giorni dopo e non l'ha mai avuto.
--
-- PERCHÉ ORA. La cache offline del censimento AcquaLatina versiona su
-- `<righe>:<max(aggiornato_il)>`: senza il trigger, un sync di sole CORREZIONI (zero righe nuove)
-- lascia la versione identica, e il telefono continua a cercare sul dato vecchio senza accorgersene
-- — esattamente il buco che `template_master.updated_at` chiude sul file master.
--
-- Additiva e idempotente: nessuna riga viene riscritta qui dentro (il timestamp si muove al
-- prossimo UPDATE vero, non adesso), e rilanciarla non fa danni.

drop trigger if exists acqualatina_ordini_set_aggiornato_il on public.acqualatina_ordini;
create trigger acqualatina_ordini_set_aggiornato_il before update on public.acqualatina_ordini
  for each row execute function public.set_aggiornato_il();
