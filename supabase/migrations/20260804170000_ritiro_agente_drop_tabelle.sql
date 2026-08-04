-- ============================================================================
-- Ritiro dell'agente Playwright — drop delle tabelle
-- Spec:  docs/superpowers/specs/2026-08-04-rimozione-agente-design.md
-- Piano: docs/superpowers/plans/2026-08-04-rimozione-agente.md (Task 8)
--
-- ⚠️ DISTRUTTIVA, e applicata DOPO il deploy — non prima. Il codice che leggeva queste
-- tabelle (`/hub/agente`, `/hub/assegnazione-ai`, 20 endpoint) è uscito dalla produzione
-- con la PR #229 (merge 10d24aa6): verificato che `/api/agente/tick` risponde 404 prima
-- di lanciare questa migration. L'ordine inverso avrebbe lasciato il codice vecchio a
-- leggere tabelle sparite — è già successo il 04/08 con la fusione cesta/pallet.
--
-- Lo storico dei giri (`agente_run`, 423 righe dal 17/06 al 03/08) è stato esportato
-- FUORI dal repository prima del drop: è storico operativo e questo repo è pubblico.
--
-- Niente `cascade`: se un drop fallisce per una dipendenza, quella dipendenza è
-- un'informazione da leggere, non qualcosa da travolgere in silenzio.
-- ============================================================================

drop table if exists agente_pianificabili;
drop table if exists agente_file_colonne;
drop table if exists agente_run;
drop table if exists agente_config;
drop table if exists acea_preassegnati;
