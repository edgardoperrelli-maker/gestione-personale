-- ============================================================================
-- MODULO ACEA — registro degli ordini di commessa (Fase 1)
-- Piano: docs/superpowers/plans/2026-07-26-acea-modulo-fase1.md
-- Studio: docs/acea-modulo-fattibilita.md
-- ============================================================================
-- Quattro tabelle:
--   1) acea_ordini         — SPECCHIO dell'export del Cruscotto. Immutabile per l'app:
--                            scrive solo l'ingestione (service role). Nessun campo nostro.
--   2) acea_ordini_eventi  — change-log: solo i campi che cambiano davvero, per import.
--   3) acea_impianti       — punto di fornitura. UNICA tabella mista: l'indirizzo ACEA arriva
--                            dall'import, l'indirizzo verificato lo scrive l'ufficio.
--   4) acea_import         — registro degli import: hash del file, conteggi, finestra coperta.
--
-- Principio cardine (decisione 8 dello studio): il dato ACEA non è modificabile dall'app.
-- Le colonne nostre vivono altrove — la pianificazione in `interventi`, la verifica indirizzi
-- nelle sole colonne consentite di acea_impianti.
--
-- La CHIAVE è la coppia (odl, numero_operazione), non l'ODL: nell'export un ordine può avere
-- più operazioni fatturate separatamente (verificato: 3 ordini su 5.290, 163,48 € x 2).

-- ─────────────────────────────────────────────────────────────
-- 1) acea_ordini — specchio dell'export
-- ─────────────────────────────────────────────────────────────
create table if not exists public.acea_ordini (
  -- Chiave naturale: la coppia. `id` è un surrogato UNIQUE che serve solo come bersaglio della
  -- FK da interventi (una FK singola non può puntare a una PK composta).
  id                        uuid not null default gen_random_uuid() unique,
  odl                       text not null,
  numero_operazione         text not null,

  -- provenienza / integrità
  contratto                 text,
  fornitore                 text,
  import_id                 uuid,                    -- ultimo import che ha toccato la riga
  riga_hash                 text not null,           -- sha256 dei soli campi ACEA: "salta se identica"

  -- classificazione
  tipo_ordine               text,                    -- ALIM | AMOR | ARMO | ASTR | AVUF
  famiglia                  text not null
                              check (famiglia in ('dunning', 'massive')),
  denominazione             text,                    -- "Denominazione testo breve"
  attivita                  text,                    -- "Operazione testo breve" (l'attività VERA)
  chiave_testo              text,                    -- "Chiave testo standard"
  testo_ordine              text,                    -- "Testo breve Ordine" grezzo (audit del parsing)

  -- stato (Descrizione Stato Ordine e Stato Operazione sono lo stesso campo in due codifiche)
  stato                     text not null,           -- COMP | DAPI | RICE | ASGN | SOSP | ANNL
  stato_desc                text,
  aperto                    boolean not null default false,  -- DAPI/RICE/ASGN/SOSP

  -- date (Data documento e Data pubblicazione lavoro coincidono su tutte le righe)
  data_creazione            date not null,
  cardine_dal               date,
  cardine_al                date,                    -- scadenza contrattuale ACEA
  data_completamento        date,
  chiusura_tecnica          date,
  -- scadenza NOSTRA, calcolata in ingestione dalle funzioni pure testate:
  -- massive -> null (non scadono mai) · RIAT/REVO -> creazione + 1 · resto dunning -> creazione + 14
  scadenza                  date,

  -- operatore assegnato su ACEA
  cid                       text,
  operatore_cognome         text,
  operatore_nome            text,

  -- esito ACEA
  causale                   text,                    -- "Causa dello scostamento" (EIES, NMNT, …)
  causale_desc              text,
  esito_positivo            boolean,                 -- da "Icona causa scost." (LED_GREEN/LED_RED)
  testo_conferma            text,                    -- note libere dell'operatore su ACEA

  -- localizzazione
  via                       text,
  civico                    text,
  cap                       text,
  comune                    text,
  provincia                 text,
  frazione                  text,
  sede_tecnica              text,
  sede_tecnica_desc         text,

  -- misuratore: dalla colonna quando c'è, altrimenti dal parsing di "Testo breve Ordine"
  impianto                  text,
  matricola                 text,
  matricola_norm            text,                    -- maiuscolo, solo A-Z0-9
  origine_misuratore        text
                              check (origine_misuratore is null
                                     or origine_misuratore in ('colonna', 'testo')),
  -- il campo SAP è troncato a 40 caratteri: segnala i casi in cui la matricola tocca il limite
  sospetto_troncamento      boolean not null default false,

  -- economia
  valore_netto              numeric(10, 2),
  documento_acquisto        text,
  posizione_documento       text,
  documento_chiusura        text,
  wbs                       text,
  -- "Escludi OdM / Operazione dalla consuntivazione": le revoche figlie di un OdM padre
  -- non vanno contate due volte (53 righe REVO nell'export di riferimento).
  escludi_consuntivazione   boolean not null default false,
  odm_riferimento           text,
  odm_operazione_riferimento text,

  -- organizzazione
  codice_sla                text,                    -- NSLA | RIAT | REVO
  priorita                  text,
  priorita_testo            text,
  centro_lavoro             text,
  tam                       text,
  direttore_operativo       text,
  avviso                    text,
  codice_accesso            text,

  creato_il                 timestamptz not null default now(),
  aggiornato_il             timestamptz not null default now(),

  primary key (odl, numero_operazione)
);

create index if not exists acea_ordini_famiglia_stato_idx on public.acea_ordini (famiglia, stato);
create index if not exists acea_ordini_aperto_idx         on public.acea_ordini (aperto) where aperto;
create index if not exists acea_ordini_comune_idx         on public.acea_ordini (comune);
create index if not exists acea_ordini_creazione_idx      on public.acea_ordini (data_creazione);
create index if not exists acea_ordini_scadenza_idx       on public.acea_ordini (scadenza) where scadenza is not null;
create index if not exists acea_ordini_impianto_idx       on public.acea_ordini (impianto);
create index if not exists acea_ordini_matricola_idx      on public.acea_ordini (matricola_norm);
create index if not exists acea_ordini_odl_idx            on public.acea_ordini (odl);
create index if not exists acea_ordini_attivita_idx       on public.acea_ordini (attivita);

drop trigger if exists acea_ordini_set_updated_at on public.acea_ordini;
create trigger acea_ordini_set_updated_at before update on public.acea_ordini
  for each row execute function public.set_updated_at();

comment on table public.acea_ordini is
  'Specchio dell''export del Cruscotto ACEA. Immutabile per l''app: scrive solo l''ingestione '
  '(service role). La pianificazione vive in interventi, non qui.';

-- ─────────────────────────────────────────────────────────────
-- 2) acea_ordini_eventi — change-log dei soli cambiamenti
-- ─────────────────────────────────────────────────────────────
create table if not exists public.acea_ordini_eventi (
  id                uuid primary key default gen_random_uuid(),
  odl               text not null,
  numero_operazione text not null,
  import_id         uuid,
  tipo              text not null
                      check (tipo in ('creato', 'modificato', 'annullato', 'indirizzo_verificato')),
  campo             text,                            -- valorizzato su 'modificato'
  valore_prima      text,
  valore_dopo       text,
  attore            text,                            -- staff_id per gli eventi umani, null per l'import
  creato_il         timestamptz not null default now()
);

create index if not exists acea_ordini_eventi_ordine_idx on public.acea_ordini_eventi (odl, numero_operazione, creato_il desc);
create index if not exists acea_ordini_eventi_import_idx on public.acea_ordini_eventi (import_id);
create index if not exists acea_ordini_eventi_tipo_idx   on public.acea_ordini_eventi (tipo, creato_il desc);

comment on table public.acea_ordini_eventi is
  'Change-log: una riga per campo realmente cambiato. Niente archivio integrale degli import: '
  'nella pratica cambiano poche decine di righe per giro.';

-- ─────────────────────────────────────────────────────────────
-- 3) acea_impianti — punto di fornitura (unica tabella mista)
-- ─────────────────────────────────────────────────────────────
-- L'impianto è la chiave stabile: sopravvive alla sostituzione del contatore, la matricola no.
-- Verificato sull'export: 1.962 impianti distinti per 1.962 matricole distinte sulle massive,
-- sempre 10 cifre pulite, mentre le matricole hanno 26 forme di scrittura diverse.
create table if not exists public.acea_impianti (
  impianto              text primary key,

  -- da ACEA (import): non modificabili dall'app
  matricola             text,
  matricola_norm        text,
  comune                text,
  via_acea              text,
  civico_acea           text,
  cap_acea              text,

  -- nostri (ufficio): le UNICHE colonne scrivibili da authenticated
  indirizzo_verificato  text,
  verificato_da         text,                        -- staff_id (convenzione del progetto: text)
  verificato_il         timestamptz,
  note_verifica         text,

  creato_il             timestamptz not null default now(),
  aggiornato_il         timestamptz not null default now()
);

create index if not exists acea_impianti_matricola_idx on public.acea_impianti (matricola_norm);
create index if not exists acea_impianti_comune_idx    on public.acea_impianti (comune);
create index if not exists acea_impianti_verificati_idx on public.acea_impianti (verificato_il)
  where indirizzo_verificato is not null;

drop trigger if exists acea_impianti_set_updated_at on public.acea_impianti;
create trigger acea_impianti_set_updated_at before update on public.acea_impianti
  for each row execute function public.set_updated_at();

comment on column public.acea_impianti.indirizzo_verificato is
  'Indirizzo reale rilevato quando l''anagrafica ACEA è errata. Correggendolo una volta, ogni '
  'ordine futuro sullo stesso impianto nasce con l''indirizzo giusto.';

-- ─────────────────────────────────────────────────────────────
-- 4) acea_import — registro degli import
-- ─────────────────────────────────────────────────────────────
create table if not exists public.acea_import (
  id                 uuid primary key default gen_random_uuid(),
  sha256             text not null unique,           -- idempotenza visibile: "già caricato il …"
  nome_file          text,
  storage_path       text,                           -- xlsx originale archiviato (bucket acea-import)
  righe_totali       integer not null default 0,
  righe_nuove        integer not null default 0,
  righe_modificate   integer not null default 0,
  righe_invariate    integer not null default 0,
  righe_annullate    integer not null default 0,
  finestra_dal       date,                           -- min/max Data pubblicazione nel file
  finestra_al        date,
  -- dettagli non strutturati: annullati che erano pianificati, avvisi di parsing, colonne ignote
  esito              jsonb not null default '{}'::jsonb,
  caricato_da        text,
  caricato_il        timestamptz not null default now()
);

create index if not exists acea_import_caricato_idx on public.acea_import (caricato_il desc);

-- ─────────────────────────────────────────────────────────────
-- 5) RLS e privilegi — il dato ACEA è immutabile per l'app
-- ─────────────────────────────────────────────────────────────
alter table public.acea_ordini        enable row level security;
alter table public.acea_ordini_eventi enable row level security;
alter table public.acea_impianti      enable row level security;
alter table public.acea_import        enable row level security;

-- ATTENZIONE ai default di Supabase: al ruolo `authenticated` sono concessi anche TRUNCATE,
-- TRIGGER e REFERENCES. **TRUNCATE non è filtrato da RLS**: da solo basterebbe a svuotare il
-- registro. Per questo si azzera TUTTO con `revoke all` e si riconcede solo il minimo, invece
-- di revocare il solo trio insert/update/delete.
revoke all on table public.acea_ordini from authenticated, anon;
drop policy if exists acea_ordini_select_auth on public.acea_ordini;
create policy acea_ordini_select_auth on public.acea_ordini
  for select to authenticated using (true);
grant select on public.acea_ordini to authenticated;

-- change-log: sola lettura (lo scrive l'ingestione e le azioni server-side)
revoke all on table public.acea_ordini_eventi from authenticated, anon;
drop policy if exists acea_ordini_eventi_select_auth on public.acea_ordini_eventi;
create policy acea_ordini_eventi_select_auth on public.acea_ordini_eventi
  for select to authenticated using (true);
grant select on public.acea_ordini_eventi to authenticated;

-- impianti: lettura piena, scrittura consentita SOLO sulle colonne della verifica indirizzo.
-- Privilegi di COLONNA: nativi in Postgres, nessun trigger necessario.
revoke all on table public.acea_impianti from authenticated, anon;
drop policy if exists acea_impianti_select_auth on public.acea_impianti;
create policy acea_impianti_select_auth on public.acea_impianti
  for select to authenticated using (true);
drop policy if exists acea_impianti_update_auth on public.acea_impianti;
create policy acea_impianti_update_auth on public.acea_impianti
  for update to authenticated using (true) with check (true);
grant select on public.acea_impianti to authenticated;
grant update (indirizzo_verificato, verificato_da, verificato_il, note_verifica)
  on public.acea_impianti to authenticated;

-- import: sola lettura (il caricamento passa dalla route admin con service role)
revoke all on table public.acea_import from authenticated, anon;
drop policy if exists acea_import_select_auth on public.acea_import;
create policy acea_import_select_auth on public.acea_import
  for select to authenticated using (true);
grant select on public.acea_import to authenticated;
