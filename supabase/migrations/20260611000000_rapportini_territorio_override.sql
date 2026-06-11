-- Override per-rapportino del territorio: sposta un singolo operatore in un altro
-- gruppo nel Riepilogo (e, via API, anche interventi.territorio_id per Live).
-- NULL = nessun override (vale mappa_piani.territorio del piano).
ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS territorio_override TEXT NULL;
