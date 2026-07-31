-- Configurazione della RIGA IN LISTA del rapportino (la schermata con tutti i task, quella
-- che l'operatore vede prima di aprire il dettaglio). Finora era cablata nel codice:
-- seconda riga = VIA · COMUNE, testo a destra del titolo = ATTIVITA · FASCIA ORARIA.
--
-- lista_campi = { "sub": [InfoChiave...], "meta": [InfoChiave...] }
--   chiave assente  → default storico (nessun flusso cambia aspetto con questa migration)
--   lista vuota []  → slot spento, scelto apposta dall'admin
--
-- Additiva e retro-compatibile: il codice che non la conosce la ignora.
alter table rapportino_template
  add column if not exists lista_campi jsonb not null default '{}'::jsonb;
