-- supabase/migrations/20260710090000_acea_sal.sql
-- SAL ufficiali ACEA (file "SAL N.xlsx" nella cartella CONTABILITA' della commessa): storico
-- ordini pagati per SAL, letti dall'agente via il bottone «Leggi SAL» (/hub/agente). Chiave
-- naturale SAP (Documento acquisti + Posizione): un ODL può avere più posizioni sullo stesso
-- documento; il file può essere ricaricato/corretto da ACEA → delete+insert per sal_n assorbe
-- la correzione (vedi app/api/agente/report/route.ts).
create table if not exists acea_sal (
  sal_n              int not null,
  odl                text not null,
  doc_acquisti       text not null,
  posizione          text not null,
  valore             numeric(10, 2) not null default 0,  -- "Valore APS" (ufficiale ACEA)
  causa              text,                                -- "Causa scostamento"
  attivita           text,                                -- "Operazione testo breve"
  data_completamento date,
  data_registrazione date,
  raccolto_at        timestamptz not null default now(),
  run_id             uuid,
  primary key (sal_n, doc_acquisti, posizione)
);
create index if not exists acea_sal_odl_idx on acea_sal (odl);

alter table acea_sal enable row level security;
drop policy if exists acea_sal_all_auth on acea_sal;
create policy acea_sal_all_auth on acea_sal
  for all to authenticated using (true) with check (true);

-- flag one-shot "Leggi SAL" sul singleton agente_config (stesso pattern di forza_acea_stato).
alter table agente_config add column if not exists forza_acea_sal boolean not null default false;
