-- ============================================================================
-- Limitazioni massive — allarga i CHECK su `committente` per includere 'lim_massive'
-- ============================================================================
-- I tre vincoli auto-generati (acea/italgas/altro) bloccavano il nuovo committente:
--  - rapportino_template_committente_check → creazione/salvataggio template
--  - interventi_manuali_committente_check  → invio dell'intervento manuale
--  - interventi_committente_check          → approvazione (insert in interventi)
-- Drop + re-add idempotente (rieseguibile senza errori).

alter table rapportino_template drop constraint if exists rapportino_template_committente_check;
alter table rapportino_template add constraint rapportino_template_committente_check
  check (committente is null or committente in ('acea','italgas','altro','lim_massive'));

alter table interventi_manuali drop constraint if exists interventi_manuali_committente_check;
alter table interventi_manuali add constraint interventi_manuali_committente_check
  check (committente in ('acea','italgas','altro','lim_massive'));

alter table interventi drop constraint if exists interventi_committente_check;
alter table interventi add constraint interventi_committente_check
  check (committente in ('acea','italgas','altro','lim_massive'));
