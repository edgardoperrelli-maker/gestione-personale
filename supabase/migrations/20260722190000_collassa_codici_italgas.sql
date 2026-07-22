-- Collasso delle famiglie di codici italgas al SOLO codice nudo.
--
-- Ogni codice (DIS00N, S-AI-022, S-MR-002, S-MR-003, S-PR-001/003/004/007/009/019/077)
-- aveva più varianti a catalogo (nudo, forma lunga, A/B/C, Sonda, GN B/C): sono la
-- stessa attività e devono comparire come UNA sola in tutti gli elenchi. Canonica =
-- codice nudo. Le varianti diventano alias di scrittura (lib/attivita/aliasAttivita.ts).
--
-- Sicuro (verificato sui dati live): italgas non è valorizzato (0 interventi con voce,
-- nessun listino italgas), i flussi operatori dipendono dal GRUPPO non dal codice
-- (tutti 'ATTIVITA'' ALLA CLIENTELA'), 0 righe in DUNNING. L'unico effetto è la perdita
-- della distinzione A/B/C/Sonda/GN nel testo (voluta). Reversibile: backup completo.

-- 1) Backup catalogo + interventi che cambiano
create table if not exists public.bak_collassa_codici_cat_20260722 as
select * from public.attivita_tassonomia
where committente='italgas'
  and substring(descrizione_norm from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)') in
      ('S-PR-003','S-MR-002','S-PR-004','S-PR-077','S-PR-007','S-PR-001','DIS00N','S-PR-019','S-AI-022','S-PR-009','S-MR-003');

create table if not exists public.bak_collassa_codici_int_20260722 as
select id, committente, intervento_tipo, gruppo_attivita, voce, stato, updated_at
from public.interventi
where substring(public.attivita_norm(intervento_tipo) from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)') in
      ('S-PR-003','S-MR-002','S-PR-004','S-PR-077','S-PR-007','S-PR-001','DIS00N','S-PR-019','S-AI-022','S-PR-009','S-MR-003')
  and intervento_tipo is distinct from substring(public.attivita_norm(intervento_tipo) from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)');

-- 2) Crea le canoniche nude mancanti (S-PR-019, S-MR-003 non avevano il nudo)
insert into public.attivita_tassonomia (committente, descrizione, descrizione_norm, gruppo, attivo)
values
  ('italgas','S-PR-019','S-PR-019','ATTIVITA'' ALLA CLIENTELA', true),
  ('italgas','S-MR-003','S-MR-003','ATTIVITA'' ALLA CLIENTELA', true)
on conflict (committente, descrizione_norm) do update set attivo=true;

-- 3) Disattiva tutte le varianti non-nude delle 11 famiglie
update public.attivita_tassonomia
set attivo=false
where committente='italgas'
  and substring(descrizione_norm from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)') in
      ('S-PR-003','S-MR-002','S-PR-004','S-PR-077','S-PR-007','S-PR-001','DIS00N','S-PR-019','S-AI-022','S-PR-009','S-MR-003')
  and descrizione_norm <> substring(descrizione_norm from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)')
  and attivo is true;

-- 4) Backfill storico → codice nudo (gruppo/committente canonici)
update public.interventi i
set intervento_tipo = bc.base_code,
    gruppo_attivita = 'ATTIVITA'' ALLA CLIENTELA',
    committente = 'italgas',
    updated_at = now()
from (
  select id, substring(public.attivita_norm(intervento_tipo) from '^(DIS[0-9N]+|S-[A-Z]+-[0-9]+)') as base_code
  from public.interventi
) bc
where bc.id = i.id
  and bc.base_code in
      ('S-PR-003','S-MR-002','S-PR-004','S-PR-077','S-PR-007','S-PR-001','DIS00N','S-PR-019','S-AI-022','S-PR-009','S-MR-003')
  and i.intervento_tipo is distinct from bc.base_code;
