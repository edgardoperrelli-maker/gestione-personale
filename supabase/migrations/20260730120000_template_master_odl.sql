-- Master ODL del template di import (upgrade template interventi).
--
-- Obiettivo: nel template Excel scaricabile l'ufficio scrive l'ODS/ODL e il file
-- compila da sé MATRICOLA / Indirizzo / COMUNE / DESCRIZIONE ATTIVITÀ, pescando da
-- un foglio di lookup ("MasterODL") costruito al download da DUE fonti:
--   1) i file master caricati a mano dagli admin (limitazioni massive per comune,
--      sostituzioni Acqua Latina): tabelle template_master + template_master_righe;
--   2) acea_master_snapshot, la foto del master DUNNING/ZAGAROLO che l'agente
--      invia già a ogni giro — a cui si aggiunge qui la colonna indirizzo.
--
-- "Spegnimento": template_master.attivo=false esclude il file dal lookup senza
-- cancellarne le righe (si riaccende se serve). Il DELETE resta possibile e
-- trascina le righe (on delete cascade).
--
-- Convenzioni casa: RLS permissiva authenticated (authz reale negli API guard con
-- requireAdmin), set_updated_at() già definita. Modello: 20260630130000.

-- ─── 1. File master caricati a mano ─────────────────────────────────────────
create table if not exists template_master (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,                    -- etichetta mostrata in UI (es. "Limitazioni massive Labico")
  committente  text not null default 'acea'
               check (committente in ('acea', 'italgas', 'acqualatina', 'altro')),
  attivo       boolean not null default true,    -- false = spento: fuori dal lookup del template
  file_nome    text,                             -- nome del file originale caricato
  -- attività applicata alle righe senza colonna/valore "operazione" nel file
  -- (es. il file Acqua Latina non ripete "Sostituzione misuratore" su ogni riga)
  operazione_default text,
  righe_totali integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists template_master_set_updated_at on template_master;
create trigger template_master_set_updated_at before update on template_master
  for each row execute function public.set_updated_at();

create table if not exists template_master_righe (
  id         uuid primary key default gen_random_uuid(),
  master_id  uuid not null references template_master(id) on delete cascade,
  odl        text not null,
  matricola  text,
  indirizzo  text,
  comune     text,
  operazione text                                -- testo grezzo dal file (canonicalizzato al build del template)
);
create index if not exists template_master_righe_master_idx on template_master_righe (master_id);
create index if not exists template_master_righe_odl_idx on template_master_righe (odl);

alter table template_master enable row level security;
drop policy if exists template_master_all_auth on template_master;
create policy template_master_all_auth on template_master
  for all to authenticated using (true) with check (true);

alter table template_master_righe enable row level security;
drop policy if exists template_master_righe_all_auth on template_master_righe;
create policy template_master_righe_all_auth on template_master_righe
  for all to authenticated using (true) with check (true);

-- ─── 2. Indirizzo nello snapshot del master DUNNING/ZAGAROLO ────────────────
-- L'agente legge già la colonna INDIRIZZO dal master (mappaRigheMaster) ma lo
-- snapshot la scartava; da qui in poi la porta fino all'app per il lookup del template.
alter table acea_master_snapshot add column if not exists indirizzo text;
