-- Fase 4 — Corsia "Liberi".
-- Estende mappa_piani_lucchetti (creata in 20260501000000_mappa_assegnazioni_manuali.sql):
-- per ogni (piano_id, staff_id), se manuali_liberi=true gli interventi manuali di quell'operatore
-- in quel piano saltano l'approvazione admin (corsia 'liberi'). Additiva, idempotente.
alter table mappa_piani_lucchetti
  add column if not exists manuali_liberi boolean not null default false;
