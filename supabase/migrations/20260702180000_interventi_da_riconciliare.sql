-- Flag "da riconciliare": chiusura Fatto/positiva su un intervento il cui odl ha GIÀ un altro
-- completato+positivo (es. pianificazione ha riassegnato un lavoro perché il master non
-- risultava ancora aggiornato). Non blocca l'operatore: chiude comunque, il backoffice
-- riconcilia da /hub/interventi. Vedi lib/interventi/rilevaDoppioPositivo.ts.
alter table interventi
  add column if not exists da_riconciliare boolean not null default false,
  add column if not exists riconciliazione_rif_id uuid references interventi(id);

create index if not exists interventi_da_riconciliare_idx
  on interventi (da_riconciliare)
  where da_riconciliare = true;
