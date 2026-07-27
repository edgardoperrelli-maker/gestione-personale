-- Commessa ACQUALATINA (Terracina) — apertura del committente e del suo unico flusso.
-- Territorio 'ACQUA LATINA' già presente in `territories` (valido 2026-07-29 → 2027-07-31).
--
-- La commessa ha UNA sola attività, la sostituzione del misuratore. Le due lavorazioni
-- accessorie NON sono attività a sé: sono crocette della stessa voce di rapportino —
-- CODOLI (compresi nel prezzo, servono al conteggio materiale) e SARACINESCA (extra a
-- prezzo proprio). Il calibro NON entra nel prezzo: viaggia nella colonna CALIBRO del
-- template di import e finisce su `interventi.diametro` (default DN15 se la cella è vuota).
--
-- Gli interventi nascono dalla PIANIFICAZIONE DALLA MAPPA: `taskToIntervento` deriva il
-- committente reale dalla tassonomia, quindi basta censire la descrizione qui sotto perché
-- il giro funzioni end-to-end. Idempotente: rieseguibile senza effetti collaterali.

-- ─── 1. Il committente entra nei vincoli delle tabelle operative ────────────────
-- `rapportino_template.gruppo_committente` accetta già 'acqualatina' (20260720190000).

alter table attivita_tassonomia drop constraint if exists attivita_tassonomia_committente_check;
alter table attivita_tassonomia add constraint attivita_tassonomia_committente_check
  check (committente = any (array['acea'::text, 'italgas'::text, 'altro'::text, 'acqualatina'::text]));

alter table interventi drop constraint if exists interventi_committente_check;
alter table interventi add constraint interventi_committente_check
  check (committente = any (array['acea'::text, 'italgas'::text, 'altro'::text, 'lim_massive'::text, 'acqualatina'::text]));

alter table interventi_manuali drop constraint if exists interventi_manuali_committente_check;
alter table interventi_manuali add constraint interventi_manuali_committente_check
  check (committente = any (array['acea'::text, 'italgas'::text, 'altro'::text, 'lim_massive'::text, 'acqualatina'::text]));

-- ─── 2. Tassonomia: descrizioni canoniche → gruppo SOSTITUZIONE MISURATORI ──────
-- Il gate di import (`validaImport`) è rigoroso sulle descrizioni: si censiscono sia il
-- singolare sia il plurale perché l'ufficio incolla dall'elenco del committente.
-- `descrizione_norm` la valorizza il trigger trg_attivita_tassonomia_norm.

insert into attivita_tassonomia (committente, descrizione, descrizione_norm, gruppo, attivo)
select 'acqualatina', d.descrizione, attivita_norm(d.descrizione), 'SOSTITUZIONE MISURATORI', true
from (values ('Sostituzione misuratore'), ('Sostituzione misuratori')) as d(descrizione)
where not exists (
  select 1 from attivita_tassonomia a
  where a.committente = 'acqualatina' and a.descrizione_norm = attivita_norm(d.descrizione)
);

-- ─── 3. Flusso "Azioni operatori" del gruppo ───────────────────────────────────
-- tipo='standard' OBBLIGATORIO: `risolviTemplateRisanamento` (lib/risanamento/
-- templateRisanamento.ts) prende il PRIMO template attivo con tipo='risanamento' in
-- ordine alfabetico — un flusso 'risanamento' chiamato ACQUALATINA… dirotterebbe il
-- risanamento colonne Italgas. `committente` resta NULL come gli altri flussi collegati:
-- il routing runtime passa da gruppo_committente + gruppi_attivita.
--
-- Nota sul motore esiti (utils/rapportini/voceColore.ts):
--   · 'eseguito' è riconosciuto come SELECT D'ESITO (/esegu|esito/) → "NO" = voce negativa;
--   · 'motivo_non_eseguito' matcha NEG_NAME (/non[\s_-]*eseguit/) → se valorizzato rende
--     la voce negativa a prescindere dal valore scelto (comportamento voluto);
--   · con esito negativo il campo 'note' diventa obbligatorio perché la voce si chiuda
--     (stessa meccanica del flusso ITALGAS).

insert into rapportino_template
  (nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo,
   is_default, active, solo_manuale, task_via, task_via_ibrido,
   gruppo_committente, gruppi_attivita)
select
  'ACQUALATINA SOSTITUZIONE MISURATORI',
  null,
  '[
     {"chiave":"eseguito","etichetta":"ESEGUITO","tipo":"select","opzioni":["SI","NO"],"obbligatoria":true,"ordine":1},
     {"chiave":"motivo_non_eseguito","etichetta":"MOTIVO NON ESEGUITO","tipo":"select","opzioni":["CONTATORE NON TROVATO","ACCESSO NEGATO","UTENTE ASSENTE","IMPIANTO NON CONFORME","RINVIATO SU RICHIESTA UTENTE","ALTRO"],"ordine":2},
     {"chiave":"lettura_vecchio","etichetta":"LETTURA VECCHIO","tipo":"numero","ordine":3},
     {"chiave":"codoli","etichetta":"CODOLI","tipo":"crocetta","ordine":4},
     {"chiave":"saracinesca","etichetta":"SARACINESCA","tipo":"crocetta","ordine":5},
     {"chiave":"note","etichetta":"NOTE","tipo":"testo","ordine":6}
   ]'::jsonb,
  '[
     {"chiave":"matricola","etichetta":"MATRICOLA","ordine":1},
     {"chiave":"diametro","etichetta":"CALIBRO","ordine":2},
     {"chiave":"odl","etichetta":"ODS/ODL","ordine":3},
     {"chiave":"via","etichetta":"VIA","ordine":4},
     {"chiave":"comune","etichetta":"COMUNE","ordine":5},
     {"chiave":"cap","etichetta":"CAP","ordine":6},
     {"chiave":"attivita","etichetta":"ATTIVITA","ordine":7}
   ]'::jsonb,
  '["via", "comune"]'::jsonb,
  '[]'::jsonb,
  'standard',
  false, true, false, false, false,
  'acqualatina', array['SOSTITUZIONE MISURATORI']
where not exists (
  select 1 from rapportino_template t
  where t.gruppo_committente = 'acqualatina'
    and 'SOSTITUZIONE MISURATORI' = any (t.gruppi_attivita)
);
