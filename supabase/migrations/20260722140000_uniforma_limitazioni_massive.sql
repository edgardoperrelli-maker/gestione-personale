-- Uniformazione della famiglia "Limitazioni massive" (audit tassonomia attività).
--
-- Problema: la stessa attività era spezzata su 3 righe canoniche di
-- attivita_tassonomia (LIMITAZIONI MASSIVE, LIMITAZIONE MASSIVA,
-- "Limitazione Massiva su Impianto") + un refuso (LIMITAZIONI MASSICE),
-- per ~3.7k interventi. L'anagrafica ACEA (acea_attivita_alias) le tratta
-- già tutte come un'unica voce 10 "Limitazione massiva".
--
-- Canonica scelta: **LIMITAZIONI MASSIVE** (gruppo LIMITAZIONI MASSIVE),
-- l'unica che resta attiva a catalogo. Le varianti diventano alias di
-- scrittura in lib/attivita/aliasAttivita.ts (LIMITAZIONE MASSIVA e
-- LIMITAZIONI MASSICE già presenti; questa migration aggiunge il backfill
-- dello storico e disattiva le righe-doppione; il commit di codice aggiunge
-- l'alias mancante "LIMITAZIONE MASSIVA SU IMPIANTO").
--
-- Sicurezza verificata sui consumer (mappa rischi):
--  - gruppo_attivita NON cambia (tutte già 'LIMITAZIONI MASSIVE'; solo il
--    refuso passa da NULL a 'LIMITAZIONI MASSIVE') → nessuna riga entra/esce
--    dall'ambito DUNNING del confronto esiti ACEA (0 righe in DUNNING);
--  - interventi.voce è NULL su tutta la famiglia → nessun KPI premialità
--    alterato (non si ricalcola voce);
--  - produzione economica: tutte le forme mappano alla stessa voce 10 in
--    acea_attivita_alias → riscrivere il testo è economicamente neutro;
--  - committente lasciato invariato (committenteEquivalente equipara già
--    lim_massive ad acea in lettura/scrittura).
-- Reversibile: backup completo delle righe toccate prima dell'update.

-- ---------------------------------------------------------------------------
-- 1) Backup delle righe che cambiano (reversibile)
-- ---------------------------------------------------------------------------
create table if not exists public.bak_uniforma_massive_20260722 as
select id, committente, intervento_tipo, gruppo_attivita, voce, stato, updated_at
from public.interventi
where public.attivita_norm(intervento_tipo) in
      ('LIMITAZIONE MASSIVA','LIMITAZIONE MASSIVA SU IMPIANTO','LIMITAZIONI MASSICE','LIMITAZIONI MASSIVE')
  and (intervento_tipo is distinct from 'LIMITAZIONI MASSIVE'
       or gruppo_attivita is distinct from 'LIMITAZIONI MASSIVE');

-- ---------------------------------------------------------------------------
-- 2) Backfill: tipo e gruppo alla forma canonica (voce e committente intatti)
-- ---------------------------------------------------------------------------
update public.interventi
set intervento_tipo = 'LIMITAZIONI MASSIVE',
    gruppo_attivita = 'LIMITAZIONI MASSIVE',
    updated_at = now()
where public.attivita_norm(intervento_tipo) in
      ('LIMITAZIONE MASSIVA','LIMITAZIONE MASSIVA SU IMPIANTO','LIMITAZIONI MASSICE','LIMITAZIONI MASSIVE')
  and (intervento_tipo is distinct from 'LIMITAZIONI MASSIVE'
       or gruppo_attivita is distinct from 'LIMITAZIONI MASSIVE');

-- ---------------------------------------------------------------------------
-- 3) Disattiva le righe-doppione del catalogo (la canonica resta attiva).
--    Non si eliminano: restano come storico/alias-target e il DELETE è
--    comunque vietato con utilizzo>0.
-- ---------------------------------------------------------------------------
update public.attivita_tassonomia
set attivo = false
where committente = 'acea'
  and descrizione_norm in ('LIMITAZIONE MASSIVA','LIMITAZIONE MASSIVA SU IMPIANTO')
  and attivo is true;
