-- Priorità identificativi per il nome delle foto, configurabile per template.
-- Array ordinato di: 'pdr' | 'matricola' | 'odl' | 'indirizzo'. Vuoto = ordine storico (PDR → matricola → ODL → indirizzo).
ALTER TABLE rapportino_template
  ADD COLUMN IF NOT EXISTS foto_id_priority jsonb NOT NULL DEFAULT '[]'::jsonb;
