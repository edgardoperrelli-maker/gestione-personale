-- Aggiunge la config dell'intestazione (titolo) della voce al template rapportino.
-- titolo_campi = lista ordinata di chiavi InfoChiave; il titolo userà il primo campo non vuoto.
-- Additiva e retro-compatibile: il codice esistente la ignora.
alter table rapportino_template
  add column if not exists titolo_campi jsonb not null default '[]'::jsonb;
