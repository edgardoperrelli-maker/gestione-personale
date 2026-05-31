-- Blocco B — Rapportini interattivi (template, rapportini, voci)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists rapportino_template (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  campi jsonb not null default '[]',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rapportini (
  id uuid primary key default gen_random_uuid(),
  piano_id uuid not null references mappa_piani(id) on delete cascade,
  staff_id text not null,
  staff_name text,
  data date not null,
  template_id uuid references rapportino_template(id) on delete set null,
  campi_snapshot jsonb not null default '[]',
  token text not null unique,
  stato text not null default 'in_corso',
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (piano_id, staff_id)
);
create index if not exists idx_rapportini_token on rapportini(token);
create index if not exists idx_rapportini_piano on rapportini(piano_id);
create index if not exists idx_rapportini_stato_data on rapportini(stato, data);

create table if not exists rapportino_voci (
  id uuid primary key default gen_random_uuid(),
  rapportino_id uuid not null references rapportini(id) on delete cascade,
  task_id text,
  ordine int not null default 0,
  nominativo text, matricola text, pdr text, odsin text,
  via text, comune text, cap text, recapito text,
  attivita text, accessibilita text, fascia_oraria text,
  raw_json jsonb not null default '{}',
  risposte jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists idx_voci_rapportino on rapportino_voci(rapportino_id);

drop trigger if exists rapportino_template_set_updated_at on rapportino_template;
create trigger rapportino_template_set_updated_at before update on rapportino_template for each row execute function public.set_updated_at();
drop trigger if exists rapportini_set_updated_at on rapportini;
create trigger rapportini_set_updated_at before update on rapportini for each row execute function public.set_updated_at();
drop trigger if exists rapportino_voci_set_updated_at on rapportino_voci;
create trigger rapportino_voci_set_updated_at before update on rapportino_voci for each row execute function public.set_updated_at();

alter table rapportino_template enable row level security;
drop policy if exists "tpl_all_auth" on rapportino_template;
create policy "tpl_all_auth" on rapportino_template for all to authenticated using (true) with check (true);
alter table rapportini enable row level security;
drop policy if exists "rap_all_auth" on rapportini;
create policy "rap_all_auth" on rapportini for all to authenticated using (true) with check (true);
alter table rapportino_voci enable row level security;
drop policy if exists "voci_all_auth" on rapportino_voci;
create policy "voci_all_auth" on rapportino_voci for all to authenticated using (true) with check (true);

insert into rapportino_template (nome, is_default, campi) values
('Standard', true, '[
  {"chiave":"att_cess","etichetta":"ATT/CESS","tipo":"crocetta","ordine":1},
  {"chiave":"cambio","etichetta":"CAMBIO","tipo":"crocetta","ordine":2},
  {"chiave":"mini_bag","etichetta":"MINI BAG","tipo":"crocetta","ordine":3},
  {"chiave":"rg_stop","etichetta":"RG STOP","tipo":"crocetta","ordine":4},
  {"chiave":"assente","etichetta":"ASSENTE","tipo":"crocetta","ordine":5},
  {"chiave":"note","etichetta":"Note","tipo":"testo","ordine":6}
]'::jsonb)
on conflict do nothing;
