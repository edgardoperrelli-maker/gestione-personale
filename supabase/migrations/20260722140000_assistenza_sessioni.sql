-- Modulo Assistenza (co-browsing back office <-> operatore).
-- Traccia di AUDIT delle sessioni di assistenza. NON contiene dati del rapportino:
-- il co-browsing viaggia su Supabase Realtime broadcast (effimero). Qui salviamo solo
-- CHI ha assistito CHI e QUANDO, per tracciabilità.
--
-- Sicurezza: RLS abilitata SENZA policy permissive -> nessun accesso da anon/authenticated;
-- la tabella è scritta solo dal service role (route admin), coerente col resto dell'app.

create table if not exists public.assistenza_sessioni (
  id            uuid primary key default gen_random_uuid(),
  sid           text not null,                 -- HMAC del token (mai il token grezzo)
  staff_name    text,
  data          date,
  admin_id      uuid,                           -- auth.users.id dell'admin che assiste
  origine       text not null default 'backoffice'
                  check (origine in ('backoffice', 'operatore')),
  avviata_at    timestamptz not null default now(),
  terminata_at  timestamptz
);

create index if not exists idx_assistenza_sessioni_avviata on public.assistenza_sessioni (avviata_at desc);
create index if not exists idx_assistenza_sessioni_sid on public.assistenza_sessioni (sid);

alter table public.assistenza_sessioni enable row level security;
-- Nessuna policy: accesso consentito solo al service role (bypassa RLS).
