-- Registro accessi e azioni — la base dati del modulo Impostazioni › Log accessi e azioni.
--
-- PERCHÉ
-- Il 03/08/2026 il rapportino di un operatore è sparito con il suo piano (CASCADE) e non è
-- stato possibile risalire a chi l'avesse cancellato: `audit_log` copre solo `calendar_days`,
-- i log Postgres di Supabase trattengono una decina di minuti e quelli Vercel non registrano
-- l'identità di chi chiama. Da qui in avanti ogni operazione distruttiva lascia una riga.
--
-- DUE FONTI, UN SOLO REGISTRO
-- 1. Accessi — `auth.audit_log_entries` li registra già da sé (login, logout, rinnovo e revoca
--    del token, modifiche utente) e risale a ottobre 2025. Non si duplica: si espone con una
--    vista, perché PostgREST serve solo lo schema `public`.
-- 2. Azioni — `audit_azioni`, scritta dall'app tramite `lib/audit/registra.ts`.
--
-- CHIUSURA
-- Entrambe restano leggibili al solo `service_role`: ci arrivano le API admin, mai il browser.
-- `audit_azioni` ha RLS attiva e nessuna policy (nega tutto salvo service_role, che la scavalca)
-- e in più si revocano i privilegi ad `anon`/`authenticated`, che Supabase concede in automatico
-- alle nuove tabelle di `public`.

create table if not exists public.audit_azioni (
  id           bigint generated always as identity primary key,
  occorso_il   timestamptz not null default now(),
  -- Chi: si conserva anche l'email perché l'utenza può essere cancellata e la riga di log
  -- deve restare leggibile (nessuna FK verso auth.users, che la porterebbe via con sé).
  utente_id    uuid,
  utente_email text,
  -- Cosa: nome puntato e stabile, es. 'piano.elimina', 'piano.operatore.rimuovi'.
  azione       text not null,
  entita       text,
  entita_id    text,
  esito        text not null default 'ok' check (esito in ('ok', 'errore')),
  stato_http   integer,
  metodo       text,
  percorso     text,
  -- Cosa è stato distrutto/toccato: conteggi e identificativi, non l'intero record.
  dettaglio    jsonb not null default '{}'::jsonb,
  ip           text,
  user_agent   text
);

comment on table public.audit_azioni is
  'Registro delle azioni applicative per utenza. Scritto da lib/audit/registra.ts, letto dal modulo Impostazioni › Log.';

-- La lettura del modulo è sempre "ultime N in ordine di tempo", con filtri opzionali.
create index if not exists audit_azioni_occorso_idx on public.audit_azioni (occorso_il desc);
create index if not exists audit_azioni_utente_idx  on public.audit_azioni (utente_id, occorso_il desc);
create index if not exists audit_azioni_azione_idx  on public.audit_azioni (azione, occorso_il desc);
-- "Cos'è successo a questo piano/rapportino": la domanda che oggi non aveva risposta.
create index if not exists audit_azioni_entita_idx  on public.audit_azioni (entita, entita_id, occorso_il desc);

alter table public.audit_azioni enable row level security;
revoke all on public.audit_azioni from anon, authenticated;
grant select, insert on public.audit_azioni to service_role;

-- Vista sugli accessi: `auth` non è esposto a PostgREST, e una vista in `public` gira con i
-- privilegi del proprietario (security_invoker resta off) quindi legge `auth.audit_log_entries`
-- senza aprire quello schema a nessuno.
create or replace view public.audit_accessi as
select
  e.id,
  e.created_at                        as occorso_il,
  (e.payload ->> 'actor_id')::uuid    as utente_id,
  e.payload ->> 'actor_username'      as utente_email,
  e.payload ->> 'action'              as azione,
  nullif(e.ip_address, '')            as ip,
  e.payload                           as dettaglio
from auth.audit_log_entries e;

comment on view public.audit_accessi is
  'Accessi delle utenze (login/logout/token/modifiche) da auth.audit_log_entries. Sola lettura, solo service_role.';

revoke all on public.audit_accessi from anon, authenticated;
grant select on public.audit_accessi to service_role;
