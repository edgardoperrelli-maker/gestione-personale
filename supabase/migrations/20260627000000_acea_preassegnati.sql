-- Pre-marcatura proattiva ACEA: assegnatario CORRENTE di ogni ODL sul portale, letto dal giro
-- "Richiedi stato ACEA" (Dunning) dall'export (colonna "Cognome C.I.D."). Serve all'anteprima per
-- pre-segnare gli ODL già assegnati alla risorsa giusta PRIMA di lanciare l'assegnazione.
create table if not exists acea_preassegnati (
  odl text primary key,
  assegnatario text not null,
  aggiornato_il timestamptz not null default now()
);

alter table acea_preassegnati enable row level security;
drop policy if exists acea_preassegnati_all_auth on acea_preassegnati;
create policy acea_preassegnati_all_auth on acea_preassegnati
  for all to authenticated using (true) with check (true);
