-- Pronto Intervento sul campo — modello dati
-- Spec: docs/superpowers/specs/2026-06-26-pronto-intervento-campo-design.md
-- Foglie territoriali (Firenze attiva; Lazio Centro/Est e Perugia predisposte),
-- link a scadenza condiviso per area+periodo, esecutore dai reperibili del
-- cronoprogramma con anomalia, contabilità su articoli a listino per area.
-- Convenzioni: staff_id = text; importi = numeric; RLS permissiva (authz reale
-- negli API guard). set_updated_at() è già definita in migrazioni precedenti.

-- ─────────────────────────────────────────────────────────────
-- 1) pi_aree: catalogo delle foglie territoriali (le aree sono DATI, non codice)
-- ─────────────────────────────────────────────────────────────
create table if not exists pi_aree (
  codice     text primary key,                 -- 'firenze' | 'lazio_centro_est' | 'perugia'
  label      text not null,
  attiva     boolean not null default false,   -- foglia operativa nella UI
  ordine     int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into pi_aree (codice, label, attiva, ordine) values
  ('firenze',          'Firenze',           true,  1),
  ('lazio_centro_est', 'Lazio Centro/Est',  false, 2),
  ('perugia',          'Perugia',           false, 3)
on conflict (codice) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2) pi_token: link "vuoto" a scadenza, condiviso per area + periodo
--    (pattern agenda_token; l'esecutore NON è il proprietario — vedi §8.1)
-- ─────────────────────────────────────────────────────────────
create table if not exists pi_token (
  id             uuid primary key default gen_random_uuid(),
  area_codice    text not null references pi_aree(codice),
  template_id    uuid references rapportino_template(id) on delete set null,
  campi_snapshot jsonb not null default '[]',  -- copia congelata di template.campi
  valido_dal     date not null,               -- X
  valido_al      date not null,               -- Y
  token          text not null unique,         -- randomBytes(32).hex (generaAgendaToken)
  note           text,                         -- es. "Reperibilità Firenze sett. 26"
  creato_da      uuid,                         -- utente ufficio (audit)
  revocato_at    timestamptz,                  -- revoca anticipata (null = attivo)
  created_at     timestamptz not null default now(),
  check (valido_al >= valido_dal)
);
create index if not exists pi_token_token_idx on pi_token(token);
create index if not exists pi_token_area_idx  on pi_token(area_codice);
-- un solo link per foglia + periodo
create unique index if not exists pi_token_area_periodo_idx
  on pi_token(area_codice, valido_dal, valido_al);

-- ─────────────────────────────────────────────────────────────
-- 3) interventi_manuali: riuso della coda di approvazione per le P.I.
--    (esecutore/data usano le colonne staff_id/staff_name/data già esistenti)
-- ─────────────────────────────────────────────────────────────
alter table interventi_manuali
  add column if not exists pi_token_id uuid references pi_token(id) on delete set null,
  add column if not exists area_codice text,
  add column if not exists fonte text not null default 'rapportino',
  add column if not exists anomalia_reperibilita boolean not null default false;

alter table interventi_manuali drop constraint if exists interventi_manuali_fonte_check;
alter table interventi_manuali add constraint interventi_manuali_fonte_check
  check (fonte in ('rapportino','pronto_intervento'));

create index if not exists idx_interventi_manuali_fonte_area
  on interventi_manuali(fonte, area_codice);

-- ─────────────────────────────────────────────────────────────
-- 4) interventi: estendi la whitelist origine con 'pronto_intervento'
--    (DROP+ADD del vincolo nominato: un ADD nudo fallirebbe col vecchio in piedi)
-- ─────────────────────────────────────────────────────────────
alter table interventi drop constraint if exists interventi_origine_check;
alter table interventi add constraint interventi_origine_check
  check (origine in ('pianificato','manuale','import','pronto_intervento'));

-- ─────────────────────────────────────────────────────────────
-- 5) pi_articoli: listino PER AREA (PK composita area+codice)
-- ─────────────────────────────────────────────────────────────
create table if not exists pi_articoli (
  area_codice     text not null references pi_aree(codice),
  codice          text not null,               -- es. 3085002 / 3186045 / 9999999
  descrizione     text,
  unita_misura    text,                         -- 'H' | 'CAD' | 'M' (testo libero)
  prezzo_unitario numeric(10,2) not null default 0,
  attivo          boolean not null default true,
  ordine          int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (area_codice, codice)
);

-- seed listino FIRENZE (dal foglio REGISTRO CHIAMATE)
insert into pi_articoli (area_codice, codice, descrizione, unita_misura, prezzo_unitario, ordine) values
  ('firenze','3085002','Compenso per interventi di ricerca dispersioni','H',89.66,1),
  ('firenze','3085003','Interventi di messa in sicurezza su tubazione interrata','CAD',110.43,2),
  ('firenze','3085006','Interventi di messa in sicurezza su tubazione aerea','CAD',54.12,3),
  ('firenze','3085004','Interventi di riparazione definitiva di durata fino a 4 ore su tubazione interrata','CAD',396.00,4),
  ('firenze','3085005','Interventi di riparazione definitiva per il tempo eccedente le 4 ore su tubazione interrata','H',79.20,5),
  ('firenze','3085007','Interventi di riparazione definitiva di durata fino a 4 ore su tubazione aerea','CAD',300.00,6),
  ('firenze','3085008','Interventi di riparazione definitiva per il tempo eccedente le 4 ore su tubazione aerea','H',59.40,7),
  ('firenze','3186045','Sovrapprezzo per lavori eseguiti in orario notturno e/o festivo su assegnazione o autorizzazione della Committente','CAD',1.00,8),
  ('firenze','3082024','Posa o sostituzione G.R.U. fino a 70 m3/h compatto','CAD',111.14,9),
  ('firenze','3188002','Sostituzione armadi metallici per G.R.U. da 70 m3/h','CAD',50.38,10),
  ('firenze','3182037','Formazione di tracce murarie - in murature di mattoni faccia vista o intonacate','M',32.00,11),
  ('firenze','9999999','Oneri della sicurezza','CAD',0.50,12)
on conflict (area_codice, codice) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 6) pi_contabilita_righe: righe di contabilità (quantità × prezzo congelato)
-- ─────────────────────────────────────────────────────────────
create table if not exists pi_contabilita_righe (
  id              uuid primary key default gen_random_uuid(),
  intervento_id   uuid references interventi(id) on delete cascade,
  area_codice     text not null,
  articolo_codice text not null,
  quantita        numeric(12,3) not null default 0,
  prezzo_snapshot numeric(10,2) not null,       -- congelato dal listino al salvataggio
  unita_misura    text,                          -- snapshot per export
  valore          numeric(12,2) generated always as (round(quantita * prezzo_snapshot, 2)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (area_codice, articolo_codice) references pi_articoli(area_codice, codice)
);
create index if not exists pi_contab_intervento_idx on pi_contabilita_righe(intervento_id);

-- ─────────────────────────────────────────────────────────────
-- 7) Trigger updated_at (set_updated_at già definita altrove)
-- ─────────────────────────────────────────────────────────────
drop trigger if exists pi_aree_set_updated_at on pi_aree;
create trigger pi_aree_set_updated_at before update on pi_aree
  for each row execute function public.set_updated_at();

drop trigger if exists pi_articoli_set_updated_at on pi_articoli;
create trigger pi_articoli_set_updated_at before update on pi_articoli
  for each row execute function public.set_updated_at();

drop trigger if exists pi_contabilita_righe_set_updated_at on pi_contabilita_righe;
create trigger pi_contabilita_righe_set_updated_at before update on pi_contabilita_righe
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8) RLS — pattern casa: permissiva per authenticated; authz reale negli API guard.
--    pi_token: RLS abilitata SENZA policy pubblica → raggiungibile solo via service
--    role (come agenda_token); il link pubblico passa SEMPRE da supabaseAdmin.
-- ─────────────────────────────────────────────────────────────
alter table pi_aree enable row level security;
drop policy if exists "pi_aree_all_auth" on pi_aree;
create policy "pi_aree_all_auth" on pi_aree for all to authenticated using (true) with check (true);

alter table pi_articoli enable row level security;
drop policy if exists "pi_articoli_all_auth" on pi_articoli;
create policy "pi_articoli_all_auth" on pi_articoli for all to authenticated using (true) with check (true);

alter table pi_contabilita_righe enable row level security;
drop policy if exists "pi_contabilita_righe_all_auth" on pi_contabilita_righe;
create policy "pi_contabilita_righe_all_auth" on pi_contabilita_righe for all to authenticated using (true) with check (true);

alter table pi_token enable row level security;
-- NESSUNA policy pubblica su pi_token: solo service role (supabaseAdmin).
