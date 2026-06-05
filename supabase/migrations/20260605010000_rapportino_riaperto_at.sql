-- Riapertura admin di un rapportino inviato: istante di riapertura.
-- tokenStatus considera il rapportino valido per 48h da questo istante (data lavori intatta).
-- Additiva e retro-compatibile (null = mai riaperto).
alter table rapportini
  add column if not exists riaperto_at timestamptz;
