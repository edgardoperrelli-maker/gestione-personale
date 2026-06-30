-- Produzione economica ACEA — listino tariffe + snapshot per audit/SAL
-- Piano: ~/.claude/plans/devo-progettare-un-upgrade-quiet-parnas.md
--
-- Tre tabelle:
--  1) acea_listino          — tariffa € per voce ACEA (EL/ES/ERC/ERA) con validità temporale.
--                             Il valore di un ordine = prezzo della sua voce alla data dell'intervento.
--  2) acea_portale_snapshot — stato CORRENTE per ODL dal portale ACEA (export "Descrizione Stato
--                             Ordine"): base del SAL (consuntivato = COMPLETATO) e dell'audit.
--  3) acea_master_snapshot  — stato CORRENTE per ODL letto dal master DUNNING: altra gamba dell'audit
--                             a tre vie (DB ↔ master ↔ portale, agganciato per ODL).
--
-- Convenzioni casa: importi numeric, RLS permissiva authenticated (authz reale negli API guard),
-- set_updated_at() già definita in migrazioni precedenti. Modello: 20260626000000_pronto_intervento.sql.

-- ─────────────────────────────────────────────────────────────
-- 1) acea_listino: tariffa per voce con validità temporale
--    (committente per estensibilità futura; per ora solo 'acea')
-- ─────────────────────────────────────────────────────────────
create table if not exists acea_listino (
  id          uuid primary key default gen_random_uuid(),
  committente text not null default 'acea',
  voce        smallint not null check (voce in (10, 11, 12, 6)), -- 10=EL 11=ES 12=ERC 6=ERA
  kpi         text not null,
  prezzo      numeric(10, 2) not null default 0,
  valido_dal  date not null,
  valido_al   date,                                              -- null = aperto
  attivo      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- coerenza voce↔kpi (evita drift tra le due colonne)
  check (
    (voce = 10 and kpi = 'EL')  or
    (voce = 11 and kpi = 'ES')  or
    (voce = 12 and kpi = 'ERC') or
    (voce = 6  and kpi = 'ERA')
  ),
  check (valido_al is null or valido_al >= valido_dal)
);
create index if not exists acea_listino_voce_idx on acea_listino (committente, voce, valido_dal);

-- seed: una riga per voce a prezzo 0 (le tariffe reali si impostano dalla UI editor)
insert into acea_listino (committente, voce, kpi, prezzo, valido_dal, note) values
  ('acea', 10, 'EL',  0, date '2026-01-01', 'Limitazione erogazione (EL) — impostare tariffa'),
  ('acea', 11, 'ES',  0, date '2026-01-01', 'Sospensione erogazione (ES) — impostare tariffa'),
  ('acea', 12, 'ERC', 0, date '2026-01-01', 'Rimozione contatore (ERC) — impostare tariffa'),
  ('acea', 6,  'ERA', 0, date '2026-01-01', 'Rimozione abusi (ERA) — impostare tariffa')
on conflict do nothing;

drop trigger if exists acea_listino_set_updated_at on acea_listino;
create trigger acea_listino_set_updated_at before update on acea_listino
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) acea_portale_snapshot: stato corrente per ODL dal portale (SAL/audit)
--    upsert onConflict 'odl' (foto corrente, come acea_preassegnati)
-- ─────────────────────────────────────────────────────────────
create table if not exists acea_portale_snapshot (
  odl         text primary key,
  stato       text not null,            -- "Descrizione Stato Ordine" grezzo dall'export
  stato_norm  text,                     -- normalizzato (es. COMPLETATO, ASSEGNATO, …)
  operatore   text,                     -- "Cognome C.I.D." (+ nome), se presente
  raccolto_at timestamptz not null default now(),
  run_id      uuid
);
create index if not exists acea_portale_snapshot_stato_idx on acea_portale_snapshot (stato_norm);

alter table acea_portale_snapshot enable row level security;
drop policy if exists acea_portale_snapshot_all_auth on acea_portale_snapshot;
create policy acea_portale_snapshot_all_auth on acea_portale_snapshot
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 3) acea_master_snapshot: stato corrente per ODL dal master DUNNING (audit)
-- ─────────────────────────────────────────────────────────────
create table if not exists acea_master_snapshot (
  odl         text primary key,
  attivita    text,                     -- "Operazione testo breve" (input per la voce)
  voce        smallint,                 -- derivata da attivita (voceDaAttivita), null se non risolta
  esecutore   text,
  data_raw    text,
  stato_op    text,                     -- "Stato Operazione" del master
  matricola   text,
  comune      text,
  raccolto_at timestamptz not null default now(),
  run_id      uuid
);
create index if not exists acea_master_snapshot_voce_idx on acea_master_snapshot (voce);

alter table acea_master_snapshot enable row level security;
drop policy if exists acea_master_snapshot_all_auth on acea_master_snapshot;
create policy acea_master_snapshot_all_auth on acea_master_snapshot
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 4) RLS listino — permissiva authenticated (authz reale negli API guard)
-- ─────────────────────────────────────────────────────────────
alter table acea_listino enable row level security;
drop policy if exists acea_listino_all_auth on acea_listino;
create policy acea_listino_all_auth on acea_listino
  for all to authenticated using (true) with check (true);
