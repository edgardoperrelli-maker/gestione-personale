-- Template rapportino "Ibrido acea": un UNICO template che copre nello stesso rapportino sia
-- le LIMITAZIONI MASSIVE sia le LIMITAZIONI/SOSPENSIONI (commessa Acea). È il superset dei due
-- template esistenti (`RAPPORTINO LIMITAZIONI MASSIVE` + `LIMITAZIONI/SOSPENSIONI`) e mantiene
-- le "funzioni già settate" di entrambi, riconosciute dal codice PER NOME dei campi (nessuna
-- configurazione extra):
--   • esito `eseguito` con "NESSUN PASSAGGIO" → voce rossa diretta (utils/rapportini/voceColore.ts:
--     ESITO_SELECT_NAME /esegu|esito/, NEG_SELECT "nessun passaggio");
--   • valvola condizionale: `sostituzione_valvola` = SI ⇒ foto `sost_valvola` obbligatoria
--     (utils/rapportini/fotoCondizionali.ts: regola /valvol/i). Per questo `sost_valvola` NON è
--     `obbligatoria` in modo statico: lo diventa solo quando serve, come nel template massive.
-- Le altre 4 foto restano obbligatorie fisse; `sigillo` e `sostituzione_valvola` obbligatori
-- (versione massive, più completa: le sospensioni avevano valvola solo-"SI" facoltativa).
-- committente='acea' + is_default=false → non è default e non altera la risoluzione dei template
-- pianificati (il template si sceglie a mano in pianificazione). Additivo/idempotente: non crea
-- nulla se un template con questo nome esiste già, e non tocca i template esistenti.
-- NB: i flag `task_via`/`task_via_ibrido` restano al default (false) e NON sono elencati apposta:
-- `task_via` non è creata da nessuna migration del repo (esiste solo sul prod, e il codice la legge
-- in modo difensivo — app/r/[token]/page.tsx), quindi elencarla romperebbe la INSERT su un DB
-- ricostruito dalle sole migration. Ometterle è al contempo robusto e semanticamente corretto.
insert into rapportino_template
  (nome, committente, is_default, active, solo_manuale, tipo,
   campi, info_campi, titolo_campi)
select
  'Ibrido acea', 'acea', false, true, false, 'standard',
  '[
    {"chiave":"eseguito","etichetta":"ESEGUITO","tipo":"select","opzioni":["SI","NESSUN PASSAGGIO","NO"],"obbligatoria":true,"ordine":1},
    {"chiave":"sostituzione_valvola","etichetta":"SOSTITUZIONE VALVOLA","tipo":"select","opzioni":["SI","NO"],"obbligatoria":true,"ordine":2},
    {"chiave":"note","etichetta":"NOTE","tipo":"testo","ordine":3},
    {"chiave":"lettura","etichetta":"LETTURA","tipo":"testo","ordine":4},
    {"chiave":"sigillo","etichetta":"SIGILLO","tipo":"testo","obbligatoria":true,"ordine":5},
    {"chiave":"ante_panoramica","etichetta":"ANTE PANORAMICA","tipo":"foto","obbligatoria":true,"ordine":6},
    {"chiave":"inserimento_limitazione","etichetta":"INSERIMENTO LIMITAZIONE","tipo":"foto","obbligatoria":true,"ordine":7},
    {"chiave":"lettura_misuratore","etichetta":"LETTURA MISURATORE","tipo":"foto","obbligatoria":true,"ordine":8},
    {"chiave":"sigillatura","etichetta":"SIGILLATURA","tipo":"foto","obbligatoria":true,"ordine":9},
    {"chiave":"sost_valvola","etichetta":"SOST. VALVOLA","tipo":"foto","ordine":10}
  ]'::jsonb,
  '[
    {"chiave":"attivita","etichetta":"ATTIVITA","ordine":1},
    {"chiave":"matricola","etichetta":"MATRICOLA","ordine":2},
    {"chiave":"odl","etichetta":"ODS/ODL","ordine":3},
    {"chiave":"via","etichetta":"VIA","ordine":4},
    {"chiave":"comune","etichetta":"COMUNE","ordine":5},
    {"chiave":"cap","etichetta":"CAP","ordine":6},
    {"chiave":"coordinate","etichetta":"COORDINATE","ordine":7}
  ]'::jsonb,
  '["matricola","odl","via","comune","attivita"]'::jsonb
where not exists (select 1 from rapportino_template where nome = 'Ibrido acea');
