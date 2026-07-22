-- MODULO CONSUNTIVAZIONE — rapportini contenitore senza piano.
-- La foglietta "Nuovo ordine" crea un ordine chiuso dal backoffice: serve una voce
-- (rapportino_voci) collegata a un rapportini (rapportino_voci.rapportino_id è NOT NULL) così
-- che l'ordine confluisca in TUTTI i consumatori voce-driven (Storico, Misuratori rimossi,
-- export limitazioni massive, saracinesca/sigillo). Ma un ordine consuntivato NON appartiene a
-- un piano della Mappa: rendiamo rapportini.piano_id NULLABILE così un rapportino contenitore
-- backoffice è autonomo e resta INVISIBILE alle viste della pianificazione (che filtrano sempre
-- per piano_id non nullo). La UNIQUE(piano_id, staff_id) non ostacola: con piano_id NULL i
-- Postgres considera le righe distinte (NULL <> NULL), quindi più contenitori per lo stesso
-- operatore sono ammessi.
alter table rapportini alter column piano_id drop not null;

comment on column rapportini.piano_id is
  'Piano Mappa di appartenenza. NULL per i rapportini contenitore della Consuntivazione (ordini backoffice), esclusi dalle viste di pianificazione.';
