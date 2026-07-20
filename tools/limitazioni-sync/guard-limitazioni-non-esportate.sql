-- guard-limitazioni-non-esportate.sql
-- GUARD (monitoraggio) — "ACEA-pianificati non riportati dall'agente" (silent-drop).
--
-- CONTESTO: l'endpoint /api/export/limitazioni-massive (che alimenta l'agente lim-sync) include un
-- intervento SOLO se:  committente='lim_massive'  OPPURE  intervento_tipo ILIKE '%limitaz%' / '%massiv%'.
-- Se una limitazione ACEA viene importata con intervento_tipo = uno STATO ordine ACEA
-- (es. "Intervento Richiesto"), NON passa il filtro e l'agente non la riporta MAI nel master.
-- Caso reale: 73 record ZAGAROLO del 29/06/2026 (vedi commit/diagnosi).
--
-- USO: eseguire in Supabase (SQL Editor) periodicamente (es. settimanale) o DOPO ogni import ACEA.
-- ATTESO: 0 righe.
-- SE RITORNA RIGHE: sono limitazioni completate che l'agente sta perdendo. Dopo aver verificato che
-- siano davvero limitazioni (Operazione testo breve = "Limitazione Massiva..." nell'export ACEA),
-- correggerle con:
--    UPDATE interventi SET intervento_tipo='Limitazione Massiva su Impianto' WHERE id IN (...);
-- e lanciare un giro app-results dell'agente entro la finestra di 15 giorni dalla data lavoro.

-- STATI ordine ACEA noti: un intervento_tipo uguale a uno di questi è SEMPRE un import sbagliato
-- (lo stato dell'ordine finito nella colonna "attività" invece dell'attività vera).
with stati_acea(s) as (values
  ('Intervento Richiesto'), ('Assegnato'), ('Ricevuto'), ('In Viaggio'), ('Sul Posto'),
  ('Iniziato'), ('Sospensione'), ('Sospeso'), ('Annullato'), ('Completato'), ('Chiuso')
)
select
  i.committente,
  i.intervento_tipo,
  i.comune,
  count(*)                                        as completati,
  count(*) filter (where i.esito = 'eseguito_positivo') as positivi,
  min(i.data)                                     as data_min,
  max(i.data)                                     as data_max,
  string_agg(i.odl, ',' order by i.odl)           as odl
from interventi i
where i.stato = 'completato'
  and i.intervento_tipo in (select s from stati_acea)
  and not (
        i.committente = 'lim_massive'
     or i.intervento_tipo ilike '%limitaz%'
     or i.intervento_tipo ilike '%massiv%'
  )
group by 1, 2, 3
order by completati desc;

-- ── Guard 2 (dal 2026-07-20): completati NON classificati dalla tassonomia ──────────
-- Caso Labico 17/07: committente='acea' con intervento_tipo VUOTO → invisibile sia al
-- filtro export sia alla Guard 1 (che riconosce solo gli stati ordine ACEA). Qui si
-- flagga OGNI completato che la tassonomia non risolve: gruppo_attivita NULL.
-- ATTESO: 0 righe con data >= 2026-07-20 (lo storico pregresso non classificabile può
-- restare NULL: è stato censito dalla migration 20260720151000).
select i.committente, coalesce(i.intervento_tipo,'') as tipo, i.comune,
       count(*) as completati,
       count(*) filter (where i.esito = 'eseguito_positivo') as positivi,
       min(i.data) as data_min, max(i.data) as data_max
from interventi i
where i.stato = 'completato'
  and i.gruppo_attivita is null
  and i.data >= '2026-07-20'
group by 1, 2, 3
order by completati desc;
