-- Flusso sostitutivo dei template (modulo "Azioni operatori"):
-- le azioni che gli operatori eseguono sono collegate al GRUPPO ATTIVITA' della tassonomia,
-- secondo la gerarchia COMMITTENTE -> GRUPPO ATTIVITA' -> FLUSSO (gia' presente).
--
-- Il collegamento vive su rapportino_template come coppia:
--   gruppo_committente  = committente della gerarchia ('acea' | 'italgas' | 'acqualatina')
--   gruppi_attivita     = gruppi coperti dal flusso (un flusso puo' coprirne piu' d'uno,
--                         es. l'ibrido acea copre LIMITAZIONI MASSIVE + DUNNING)
-- NON tocca la colonna `committente`, che continua a instradare i flussi runtime
-- (risolviTemplateCommittente, modale "+" operatore): e' una dimensione nuova, solo di collegamento.

alter table rapportino_template
  add column if not exists gruppo_committente text,
  add column if not exists gruppi_attivita text[];

alter table rapportino_template drop constraint if exists rapportino_template_gruppo_committente_check;
alter table rapportino_template add constraint rapportino_template_gruppo_committente_check
  check (gruppo_committente is null or gruppo_committente = any (array['acea'::text, 'italgas'::text, 'acqualatina'::text]));

-- Coppia coerente: o collegato (committente + almeno un gruppo) o non collegato (entrambi null).
alter table rapportino_template drop constraint if exists rapportino_template_gruppo_coppia_check;
alter table rapportino_template add constraint rapportino_template_gruppo_coppia_check
  check ((gruppo_committente is null) = (gruppi_attivita is null or cardinality(gruppi_attivita) = 0));

-- Seed dei collegamenti dei flussi gia' presenti (idempotente: aggancia per nome e solo se
-- non gia' collegato; su un DB senza quei template e' un no-op).
-- I gruppi acea/italgas citati esistono in attivita_tassonomia; SOSTITUZIONE MISURATORI e' la
-- foglia acqualatina del flowchart (fuori tassonomia: il flusso risanamento non importa attivita').
update rapportino_template set gruppo_committente = 'acea', gruppi_attivita = array['LIMITAZIONI MASSIVE']
  where nome = 'RAPPORTINO LIMITAZIONI MASSIVE' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'acea', gruppi_attivita = array['DUNNING']
  where nome = 'LIMITAZIONI/SOSPENSIONI' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'acea', gruppi_attivita = array['LIMITAZIONI MASSIVE', 'DUNNING']
  where nome ilike 'IBRIDO ACEA' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'italgas', gruppi_attivita = array['ATTIVITA'' ALLA CLIENTELA', 'BONIFICHE']
  where nome = 'ITALGAS' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'italgas', gruppi_attivita = array['BONIFICHE EXTRA']
  where nome = 'BONIFICHE EXTRA' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'italgas', gruppi_attivita = array['P.I.']
  where nome ilike 'PRONTO INTERVENTO' and gruppo_committente is null;
update rapportino_template set gruppo_committente = 'acqualatina', gruppi_attivita = array['SOSTITUZIONE MISURATORI']
  where nome = 'RESINE' and gruppo_committente is null;
