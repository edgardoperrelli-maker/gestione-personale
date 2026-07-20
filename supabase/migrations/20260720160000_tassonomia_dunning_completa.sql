-- supabase/migrations/20260720160000_tassonomia_dunning_completa.sql
-- Completamento tassonomia DUNNING: il seed iniziale veniva dallo STORICO LAVORATO
-- (8 attività), ma il master DUNNING reale ne contiene altre mai lavorate finora.
-- Senza queste righe il guardrail della mappa rifiuterebbe i file quotidiani DUNNING
-- che le contengono ("descrizione_sconosciuta"). Fonte: colonna "Operazione testo breve"
-- del master DUNNING reale (verificata 2026-07-20). Idempotente (on conflict do nothing).
insert into attivita_tassonomia (committente, descrizione, gruppo) values
  ('acea', 'Riapertura fornitura cessata morosità', 'DUNNING'),
  ('acea', 'Revoca limitazione Flusso', 'DUNNING'),
  ('acea', 'VERIFICA SIGILLI MANOMESSI', 'DUNNING'),
  ('acea', 'Rim Misuratore con cessazione contratt', 'DUNNING'),
  ('acea', 'Revoca Disattivazione cessata morosità', 'DUNNING'),
  ('acea', 'Riattivazione utenza urgente', 'DUNNING'),
  ('acea', 'Ripristino da morosità', 'DUNNING'),
  ('acea', 'Riapertura fornitura', 'DUNNING'),
  ('acea', 'Rim Mis/Mod radio con cessazione', 'DUNNING')
on conflict (committente, descrizione_norm) do nothing;
