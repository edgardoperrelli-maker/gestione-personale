-- Interventi (store canonico) + riconsegna misuratori + KPI premialità — data-model Acea
-- Spec: docs/superpowers/specs/2026-06-01-interventi-acea-datamodel-design.md
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ─────────────────────────────────────────────────────────────
-- interventi: store canonico (sostituisce a tendere le righe Excel volatili)
-- ─────────────────────────────────────────────────────────────
create table if not exists interventi (
  id uuid primary key default gen_random_uuid(),
  -- provenienza / identificazione
  committente text not null default 'acea' check (committente in ('acea','italgas','altro')),
  odl text,                     -- Ordinativo di Lavoro / ODS
  pdr text,
  nominativo text,
  contratto text,               -- targa identificativa al momento rimozione
  utenza text,
  -- misuratore
  matricola_contatore text,
  lettura text,
  diametro text,                -- ½" … 3"
  sigillo_numero text,
  sigillo_colore text check (sigillo_colore is null or sigillo_colore in ('blu','rosso')),
  -- localizzazione
  indirizzo text,
  comune text,
  municipio text,
  cap text,
  lat double precision,
  lng double precision,
  geocoded_at timestamptz,
  -- classificazione
  codice_servizio text,
  intervento_tipo text,         -- etichetta voce (vedi voce)
  voce smallint check (voce is null or voce between 1 and 13),
  territorio_id uuid references public.territories(id) on delete set null,
  activity_id uuid,             -- riferimento logico ad activities_renamed (no FK: schema base)
  fascia_oraria text,
  durata_stimata_min integer,
  richiede_due_operatori boolean not null default false,
  lotto smallint check (lotto is null or lotto in (1,2,3)),
  -- assegnazione
  data date not null,
  staff_id text,                -- convenzione del progetto (mappa_piani/rapportini usano text)
  squadra_id uuid,              -- Fase 3 (no FK: tabella squadre non ancora presente)
  ordine integer,
  -- ciclo di vita (stati OdL Acea)
  stato text not null default 'da_assegnare'
    check (stato in ('da_assegnare','assegnato','in_viaggio','sul_posto','in_esecuzione','completato','annullato')),
  esito text
    check (esito is null or esito in ('eseguito_positivo','accesso_negato','contatore_non_trovato','dati_ubicazione_insufficienti','accesso_a_vuoto','rinviato')),
  esito_motivo text,
  rif_esterno text,             -- nº pratica/riferimento committente
  assegnato_at timestamptz,
  iniziato_at timestamptz,
  chiuso_at timestamptz,
  -- ponti
  import_batch_id uuid,
  piano_id uuid references mappa_piani(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interventi_data_staff_idx on interventi (data, staff_id);
create index if not exists interventi_data_stato_idx on interventi (data, stato);
create index if not exists interventi_territorio_idx on interventi (territorio_id, data);
create index if not exists interventi_odl_idx on interventi (odl);
create index if not exists interventi_matricola_idx on interventi (matricola_contatore);
create unique index if not exists interventi_dedup_idx on interventi (committente, odl, data) where odl is not null;

-- ─────────────────────────────────────────────────────────────
-- misuratori_riconsegna: riconsegna settimanale dei contatori rimossi (DT §1.5/§1.9)
-- ─────────────────────────────────────────────────────────────
create table if not exists misuratori_riconsegna (
  id uuid primary key default gen_random_uuid(),
  intervento_id uuid references interventi(id) on delete set null,
  matricola text not null,
  contratto text,
  utenza text,
  odl text,
  con_codoli boolean not null default false,
  con_saracinesca boolean not null default false,
  batch_id uuid,                -- raggruppa la consegna settimanale (cesta)
  stato text not null default 'in_custodia'
    check (stato in ('in_custodia','in_riepilogo','consegnato','mancante')),
  data_rimozione date,
  data_consegna date,
  riepilogo_firmato boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists misuratori_riconsegna_batch_idx on misuratori_riconsegna (batch_id);
create index if not exists misuratori_riconsegna_stato_idx on misuratori_riconsegna (stato);
create unique index if not exists misuratori_riconsegna_matricola_idx on misuratori_riconsegna (matricola, data_rimozione);

-- ─────────────────────────────────────────────────────────────
-- kpi_contratto: contatori per finestra bimestrale (alimenta lib/premialita/acea.ts)
-- ─────────────────────────────────────────────────────────────
create table if not exists kpi_contratto (
  id uuid primary key default gen_random_uuid(),
  committente text not null default 'acea',
  lotto smallint check (lotto is null or lotto in (1,2,3)),
  periodo_inizio date not null,
  periodo_fine date not null,
  kpi text not null check (kpi in ('EL','ES','ERC','ERA')),
  eseguiti_positivi integer not null default 0,   -- al netto degli accessi a vuoto
  accessi_a_vuoto integer not null default 0,
  assegnati_dovuti integer not null default 0,
  efficienza_dichiarata numeric,                  -- % dichiarata in gara (65–85)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists kpi_contratto_periodo_idx
  on kpi_contratto (committente, lotto, periodo_inizio, kpi);

-- ─────────────────────────────────────────────────────────────
-- trigger updated_at
-- ─────────────────────────────────────────────────────────────
drop trigger if exists interventi_set_updated_at on interventi;
create trigger interventi_set_updated_at before update on interventi for each row execute function public.set_updated_at();
drop trigger if exists misuratori_riconsegna_set_updated_at on misuratori_riconsegna;
create trigger misuratori_riconsegna_set_updated_at before update on misuratori_riconsegna for each row execute function public.set_updated_at();
drop trigger if exists kpi_contratto_set_updated_at on kpi_contratto;
create trigger kpi_contratto_set_updated_at before update on kpi_contratto for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RLS (coerente con le altre tabelle del progetto)
-- ─────────────────────────────────────────────────────────────
alter table interventi enable row level security;
drop policy if exists "interventi_all_auth" on interventi;
create policy "interventi_all_auth" on interventi for all to authenticated using (true) with check (true);
alter table misuratori_riconsegna enable row level security;
drop policy if exists "misuratori_riconsegna_all_auth" on misuratori_riconsegna;
create policy "misuratori_riconsegna_all_auth" on misuratori_riconsegna for all to authenticated using (true) with check (true);
alter table kpi_contratto enable row level security;
drop policy if exists "kpi_contratto_all_auth" on kpi_contratto;
create policy "kpi_contratto_all_auth" on kpi_contratto for all to authenticated using (true) with check (true);
