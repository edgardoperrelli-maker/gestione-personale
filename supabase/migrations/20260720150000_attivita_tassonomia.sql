-- supabase/migrations/20260720150000_attivita_tassonomia.sql
-- Tassonomia attività: (committente, descrizione) -> gruppo. Fonte di verità unica per
-- import (validazione bloccante), inserimenti manuali (lista chiusa) e classificazione.
-- Spec: docs/superpowers/specs/2026-07-20-motore-gruppo-attivita-design.md

create extension if not exists unaccent with schema public;

-- Normalizzazione IDENTICA alla chiave TS di lib/produzione/normalizzaAttivita.ts:
-- maiuscolo, spazi collassati, senza accenti. IMMUTABLE: si usa la forma a due argomenti
-- di unaccent col dizionario esplicito (la forma a un argomento è solo STABLE).
create or replace function attivita_norm(s text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(public.unaccent('public.unaccent'::regdictionary, trim(coalesce(s, ''))), '\s+', ' ', 'g'))
$$;

create table if not exists attivita_tassonomia (
  id uuid primary key default gen_random_uuid(),
  committente text not null check (committente in ('acea', 'italgas', 'altro')),
  descrizione text not null,          -- forma CANONICA (quella che si scrive su interventi)
  descrizione_norm text not null,     -- attivita_norm(descrizione), popolata dal trigger sotto
  gruppo text not null,               -- es. 'LIMITAZIONI MASSIVE'
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (committente, descrizione_norm)
);

-- descrizione_norm sempre coerente con descrizione (anche su insert manuali future)
create or replace function attivita_tassonomia_norm_trigger()
returns trigger language plpgsql as $$
begin
  new.descrizione_norm := attivita_norm(new.descrizione);
  return new;
end $$;
create trigger trg_attivita_tassonomia_norm
  before insert or update of descrizione on attivita_tassonomia
  for each row execute function attivita_tassonomia_norm_trigger();

-- RLS come le altre tabelle di servizio: lettura autenticati, scrittura solo service role.
alter table attivita_tassonomia enable row level security;
create policy attivita_tassonomia_select on attivita_tassonomia
  for select to authenticated using (true);

-- Colonna sul bersaglio operativo. NULL = storico non classificato (i nuovi flussi la valorizzano).
alter table interventi add column if not exists gruppo_attivita text;

-- SEED: 60 descrizioni dal file di riferimento (canonica = variante più frequente nello storico).
insert into attivita_tassonomia (committente, descrizione, gruppo) values
  ('acea', 'Limitazione flusso idrico', 'DUNNING'),
  ('acea', 'Sospensione fornitura', 'DUNNING'),
  ('acea', 'Regolarizzazione flusso idrico', 'DUNNING'),
  ('acea', 'Rimozione misuratore per morosità', 'DUNNING'),
  ('acea', 'Riattivazione fornitura', 'DUNNING'),
  ('acea', 'Rimozione impianto abusivo', 'DUNNING'),
  ('acea', 'RESINE', 'DUNNING'),
  ('acea', 'Rim Mis/Mod radio per morosità', 'DUNNING'),
  ('acea', 'Limitazione Massiva su Impianto', 'LIMITAZIONI MASSIVE'),
  ('acea', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
  ('acea', 'LIMITAZIONE MASSIVA', 'LIMITAZIONI MASSIVE'),
  ('italgas', 'WFM LAVORI Attività lavori Impresa/coll', 'AGENDA AEREA'),
  ('italgas', 'S-PR-003 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS001 - Disattivazione primo passaggio', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-077 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'UT MOROSITA'' PRIMO PASSAGGIO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-001 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-022 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-019 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA GN B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-053 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'UT MOROSITA'' RIPASSO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-003 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS00N', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-049 - Verifica misuratore in campo', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - Sost prog cont attivo < G6 per Telelettura', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 - RIATTIVAZ. SERVIZIO SOSPESO PER MOROSITA''', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-009', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - Sost prog cont attivo < G6 per Telelettura GN C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-042 - Sostituzione mensola', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-003 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-001', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-019 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-077', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'BONIFICHE', 'BONIFICHE'),
  ('italgas', 'BONIFICHE EXTRA', 'BONIFICHE EXTRA'),
  ('italgas', 'Regolarizzazione flusso idrico', 'BONIFICHE EXTRA'),
  ('italgas', 'PICARRO', 'P.I.'),
  ('italgas', 'PRONTO INTERVENTO', 'P.I.')
on conflict (committente, descrizione_norm) do nothing;
