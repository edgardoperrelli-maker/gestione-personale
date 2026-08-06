-- ============================================================================
-- Tassonomia: via «Regolarizzazione flusso idrico» da Italgas / BONIFICHE EXTRA.
-- ============================================================================
-- È un'attività ACEA del Dunning (dove esiste già, censita e usata: 433 interventi), finita
-- per errore anche nel blocco italgas del seed 20260720150000 — riga 108, in mezzo a
-- BONIFICHE / BONIFICHE EXTRA / PICARRO. Su Italgas non ha mai avuto un intervento e non
-- poteva averne: è acqua, e il committente distribuisce gas.
--
-- Finché il gruppo era solo un'etichetta della tassonomia la riga stava lì senza dare
-- fastidio. Da quando «Azioni operatori» mostra le attività dentro ogni gruppo, BONIFICHE
-- EXTRA si legge «BONIFICHE EXTRA · Regolarizzazione flusso idrico»: una voce che non
-- esiste in quella commessa, in mezzo a quelle vere.
--
-- Backup prima di cancellare: la riga è ricreabile in dieci secondi dalla UI, ma qui resta
-- comunque com'era, con il suo id.
--
-- Guardie (la migration resta corretta anche se rigirata su dati diversi):
--  1. solo il committente italgas — la riga ACEA del Dunning, che è quella buona, non si tocca;
--  2. solo se NESSUN intervento italgas la referenzia: una voce usata si disattiva, non si
--     cancella (è la stessa regola della DELETE di /api/admin/attivita-tassonomia).
create table if not exists public.bak_tassonomia_regolarizzazione_italgas_20260806 as
select *
from public.attivita_tassonomia
where lower(btrim(committente)) = 'italgas'
  and descrizione_norm = 'REGOLARIZZAZIONE FLUSSO IDRICO';

delete from public.attivita_tassonomia t
where lower(btrim(t.committente)) = 'italgas'
  and t.descrizione_norm = 'REGOLARIZZAZIONE FLUSSO IDRICO'
  and not exists (
    select 1
    from public.interventi i
    where i.intervento_tipo = t.descrizione
      and lower(btrim(coalesce(i.committente, ''))) = 'italgas'
  );
