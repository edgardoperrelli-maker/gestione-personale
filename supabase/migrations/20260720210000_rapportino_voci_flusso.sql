-- Rapportino per-attività: ogni voce generata da un task porta il flusso del SUO gruppo
-- attività (collegamento di 20260720190000): template_id per tracciabilità e campi_snapshot
-- con le azioni congelate alla generazione. NULL = la voce eredita lo snapshot del rapportino
-- (retro-compat totale: rapportini storici e attività senza flusso collegato).
alter table rapportino_voci
  add column if not exists template_id uuid references rapportino_template(id) on delete set null,
  add column if not exists campi_snapshot jsonb;
