-- Master ODL del template: l'attività di default diventa una SELEZIONE MULTIPLA
-- dal catalogo tassonomia (niente più testo libero: un refuso creava una
-- descrizione-doppione che l'import poi rifiutava).
--
-- `operazione_default text` → `operazioni_default text[]`. La tabella è nata con
-- la 20260730120000 nello stesso giro di sviluppo e non ha ancora dati reali:
-- drop+add è la forma più semplice e leggibile.
alter table template_master drop column if exists operazione_default;
alter table template_master add column if not exists operazioni_default text[];
