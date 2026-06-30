-- ============================================================================
-- Limitazioni massive — stato/esito per-matricola riportato dal master ACEA.
-- Separata dal ref di import (limitazione_misuratori_ref): qui il dato è DINAMICO,
-- aggiornato dall'agente ad ogni sync (upsert per committente+matricola_norm).
-- Serve al "+" per il blocco anti-duplicato (matricola già eseguita).
-- ============================================================================
create table if not exists limitazione_misuratori_stato (
  id bigserial primary key,
  committente text not null default 'acea',
  matricola text not null,
  matricola_norm text not null,         -- maiuscolo, solo A-Z0-9 (chiave di lookup)
  odl text,
  esito text,                           -- 'positivo' | 'negativo' | null
  stato_odl text,                       -- Descrizione Stato Ordine ACEA (es. COMPLETATO)
  comune text,
  esecutore text,
  aggiornato_il timestamptz not null default now()
);
create unique index if not exists uq_lim_stato_matr on limitazione_misuratori_stato (committente, matricola_norm);
create index if not exists idx_lim_stato_matr on limitazione_misuratori_stato (matricola_norm);

alter table limitazione_misuratori_stato enable row level security;
drop policy if exists lim_stato_all_auth on limitazione_misuratori_stato;
create policy lim_stato_all_auth on limitazione_misuratori_stato
  for all to authenticated using (true) with check (true);
