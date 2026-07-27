-- ============================================================================
-- MODULO ACEA — operazioni in blocco con annullamento
-- Piano: docs/superpowers/plans/2026-07-26-acea-modulo-fase1.md (Task 5.3)
-- ============================================================================
-- L'annullamento dell'ultima azione in blocco è un cancello di collaudo: senza, assegnare 200
-- righe all'operatore sbagliato non è rimediabile se non riga per riga. Per ripristinare serve
-- sapere com'era PRIMA ogni riga toccata — è quello che sta in `dettaglio`.
--
-- Una sola tabella con jsonb invece di operazione + righe: un'operazione tocca al massimo qualche
-- centinaio di righe, il documento resta piccolo, e l'annullamento è atomico per costruzione.

create table if not exists public.acea_operazioni (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('pianifica')),
  attore       text,
  creato_il    timestamptz not null default now(),
  annullata_il timestamptz,
  annullata_da text,
  -- { data, staff_id, azioni: [{ odl, numero_operazione, azione, intervento_id, prima }] }
  dettaglio    jsonb not null default '{}'::jsonb
);

create index if not exists acea_operazioni_recenti_idx
  on public.acea_operazioni (creato_il desc);

alter table public.acea_operazioni enable row level security;
-- Come per il registro: `revoke all` e non il solo insert/update/delete, perché i default di
-- Supabase concedono anche TRUNCATE, che RLS non intercetta.
revoke all on table public.acea_operazioni from authenticated, anon;
drop policy if exists acea_operazioni_select_auth on public.acea_operazioni;
create policy acea_operazioni_select_auth on public.acea_operazioni
  for select to authenticated using (true);
grant select on public.acea_operazioni to authenticated;

comment on table public.acea_operazioni is
  'Operazioni in blocco (assegnazione operatore/giorno) con lo stato precedente delle righe '
  'toccate, per l''annullamento dell''ultima azione.';
