-- Azioni operatori: correzioni collegamenti attività → flussi (2026-07-21).
-- Contesto: le pianificazioni non scelgono più un template; ogni voce prende le azioni
-- dal flusso del gruppo attività del SUO intervento. Perché la copertura sia totale:
--   1) RESINE è un'attività ITALGAS con gruppo dedicato RISANAMENTO COLONNE
--      (l'associazione precedente acqualatina/SOSTITUZIONE MISURATORI era errata,
--      così come la riga tassonomia acea/RESINE → DUNNING).
--   2) Il flusso risanamento (tipo='risanamento', 7 azioni) si collega a
--      italgas / RISANAMENTO COLONNE.
--   3) Il gruppo italgas / P.I. (es. PICARRO pianificati dalla mappa) ottiene un flusso
--      CLASSICO clonando le azioni dal modello manuale "Pronto Intervento": i modelli
--      solo_manuale non concorrono alla generazione per-voce.
-- Idempotente: rieseguibile senza effetti collaterali.

-- 1a. Censisci RESINE sotto italgas / RISANAMENTO COLONNE (se manca).
insert into attivita_tassonomia (committente, descrizione, descrizione_norm, gruppo, attivo)
select 'italgas', 'RESINE', attivita_norm('RESINE'), 'RISANAMENTO COLONNE', true
where not exists (
  select 1 from attivita_tassonomia
  where committente = 'italgas' and descrizione_norm = attivita_norm('RESINE')
);

-- 1b. Normalizza la riga italgas/RESINE (gruppo e attivo) se preesisteva diversa.
update attivita_tassonomia
set gruppo = 'RISANAMENTO COLONNE', attivo = true
where committente = 'italgas' and descrizione_norm = attivita_norm('RESINE')
  and (gruppo is distinct from 'RISANAMENTO COLONNE' or attivo is distinct from true);

-- 1c. Rimuovi l'associazione errata acea/RESINE (→ DUNNING).
delete from attivita_tassonomia
where committente = 'acea' and descrizione_norm = attivita_norm('RESINE');

-- 2. Flusso risanamento → italgas / RISANAMENTO COLONNE.
update rapportino_template
set gruppo_committente = 'italgas', gruppi_attivita = array['RISANAMENTO COLONNE']
where tipo = 'risanamento'
  and (gruppo_committente is distinct from 'italgas'
       or gruppi_attivita is distinct from array['RISANAMENTO COLONNE']);

-- 3. Flusso classico per italgas / P.I. clonando le azioni di "Pronto Intervento".
insert into rapportino_template
  (nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo,
   is_default, active, solo_manuale, task_via, task_via_ibrido,
   gruppo_committente, gruppi_attivita)
select 'P.I.', null, src.campi, src.info_campi, src.titolo_campi, src.foto_id_priority, 'standard',
       false, true, false, false, false,
       'italgas', array['P.I.']
from rapportino_template src
where src.solo_manuale = true and attivita_norm(src.nome) = attivita_norm('Pronto Intervento')
  and not exists (
    select 1 from rapportino_template t
    where t.solo_manuale = false and t.active = true
      and t.gruppo_committente = 'italgas' and 'P.I.' = any(t.gruppi_attivita)
  )
limit 1;
