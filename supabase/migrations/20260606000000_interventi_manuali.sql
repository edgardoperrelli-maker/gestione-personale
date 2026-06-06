-- Interventi manuali — richieste create dall'operatore sul rapportino e approvate dalla torre.
-- Fase 1: fondamenta + flusso core. Foto/realtime/corsia liberi: fasi successive.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ─────────────────────────────────────────────────────────────
-- interventi_manuali: richiesta + snapshot dati operatore/correnti
-- ─────────────────────────────────────────────────────────────
create table if not exists interventi_manuali (
  id uuid primary key default gen_random_uuid(),
  rapportino_id uuid references rapportini(id) on delete cascade,
  voce_id uuid references rapportino_voci(id) on delete set null,
  intervento_id uuid references interventi(id) on delete set null,
  piano_id uuid references mappa_piani(id) on delete set null,
  staff_id text,
  staff_name text,
  committente text not null check (committente in ('acea','italgas','altro')),
  template_id uuid references rapportino_template(id) on delete set null,
  data date,
  dati_operatore jsonb not null default '{}',
  dati_correnti jsonb not null default '{}',
  note text,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa','approvato','rifiutato','auto_liberi','annullato')),
  corsia text not null default 'normale' check (corsia in ('normale','liberi')),
  preso_in_carico_da uuid,
  preso_in_carico_at timestamptz,
  deciso_da uuid,
  deciso_at timestamptz,
  motivo_rifiuto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_interventi_manuali_stato on interventi_manuali (stato);
create index if not exists idx_interventi_manuali_rapportino on interventi_manuali (rapportino_id);
create index if not exists idx_interventi_manuali_data on interventi_manuali (data);
create index if not exists idx_interventi_manuali_staff_data on interventi_manuali (staff_id, data);

drop trigger if exists interventi_manuali_set_updated_at on interventi_manuali;
create trigger interventi_manuali_set_updated_at before update on interventi_manuali
  for each row execute function public.set_updated_at();

alter table interventi_manuali enable row level security;
drop policy if exists "interventi_manuali_all_auth" on interventi_manuali;
create policy "interventi_manuali_all_auth" on interventi_manuali
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- ALTER tabelle esistenti (additivi, retro-compatibili)
-- ─────────────────────────────────────────────────────────────
alter table rapportino_voci
  add column if not exists manuale boolean not null default false;
alter table rapportino_voci
  add column if not exists approvazione_stato text
    check (approvazione_stato is null or approvazione_stato in ('in_attesa','approvato','rifiutato'));
alter table rapportino_voci
  add column if not exists richiesta_id uuid references interventi_manuali(id) on delete set null;
create index if not exists idx_voci_richiesta on rapportino_voci (richiesta_id);

alter table interventi
  add column if not exists origine text not null default 'pianificato'
    check (origine in ('pianificato','manuale','import'));

alter table rapportino_template
  add column if not exists committente text
    check (committente is null or committente in ('acea','italgas','altro'));
