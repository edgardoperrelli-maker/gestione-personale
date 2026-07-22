-- MODULO CONSUNTIVAZIONE (task ATLAS)
-- Il back office carica ed esita interventi "come se" fossero chiusi dal rapportino di un
-- operatore, assegnando l'esecuzione a UNO o PIÙ operatori (squadra binaria/multipla).
-- Un intervento resta UNO per ODL (invariante "un positivo per ODL"): l'operatore primario
-- (interventi.staff_id) porta il valore economico UNA volta; la lista completa degli esecutori
-- vive in interventi.esecutori così che tutta la squadra risulti tra chi ha partecipato
-- (Performance operatori, misuratori). Marcatore di tracciabilità: consuntivato_da/at.

-- ─────────────────────────────────────────────────────────────
-- interventi: lista esecutori squadra + tracciabilità consuntivazione
-- ─────────────────────────────────────────────────────────────
alter table interventi
  -- Squadra che ha eseguito: array di { staff_id, staff_name }. Vuoto = attribuzione al solo
  -- staff_id (comportamento invariato per tutti gli ordini non consuntivati da backoffice).
  add column if not exists esecutori jsonb not null default '[]'::jsonb,
  -- Utente backoffice che ha consuntivato l'ordine (auth.users.id) + istante. Null = esitato
  -- dall'operatore via rapportino (o non ancora esitato).
  add column if not exists consuntivato_da uuid,
  add column if not exists consuntivato_at timestamptz;

comment on column interventi.esecutori is
  'Squadra esecutrice (consuntivazione): jsonb [{staff_id, staff_name}]. staff_id resta il primario.';
comment on column interventi.consuntivato_da is
  'auth.users.id del backoffice che ha esitato l''ordine dal modulo Consuntivazione (null = da rapportino).';

-- ─────────────────────────────────────────────────────────────
-- origine: nuovo valore 'consuntivo' per gli ordini creati+esitati dal modulo Consuntivazione
-- (foglietta "Nuovo ordine"). Gli ordini "Ordine presente" (già a sistema) mantengono la loro
-- origine e portano solo il marcatore consuntivato_da/at.
-- ─────────────────────────────────────────────────────────────
alter table interventi drop constraint if exists interventi_origine_check;
alter table interventi add constraint interventi_origine_check
  check (origine in ('pianificato','manuale','import','pronto_intervento','consuntivo'));

-- Indice per la lista "Ordine presente" e per filtrare gli ordini consuntivati dal backoffice.
create index if not exists interventi_consuntivato_idx on interventi (consuntivato_at)
  where consuntivato_at is not null;
