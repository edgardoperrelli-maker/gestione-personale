-- Le riaperture (dette anche attivazioni) come colonna del registro.
--
-- Perché una colonna e non un filtro scritto nella query: PostgREST sa ordinare per COLONNA, non
-- per espressione. E ordinare serve — è il motivo per cui questa migration esiste.
--
-- Il problema misurato sul registro vero: le riaperture aperte sono 14 su 924 ordini di dunning
-- aperti, e nell'ordinamento predefinito (scadenza crescente) cadono alle righe 491-548. Cioè in
-- mezzo alla tabella, dove non le vede nessuno. Non è un caso: hanno UN giorno di tempo contro i
-- quattordici del resto, quindi una riapertura nata oggi scade domani, mentre una limitazione di
-- maggio è scaduta da due mesi e sta sopra. L'ordinamento per scadenza mette il più VECCHIO in
-- cima, e il più urgente in mezzo.
--
-- `coalesce` prima dell'IN: senza, un `codice_sla` nullo darebbe NULL invece di false, e una
-- colonna che dovrebbe rispondere sì/no risponderebbe «non so» su ogni riga senza SLA.
alter table public.acea_ordini
  add column if not exists riapertura boolean
  generated always as (coalesce(codice_sla, '') in ('RIAT', 'REVO')) stored;

comment on column public.acea_ordini.riapertura is
  'Riapertura/attivazione (SLA RIAT o REVO): cardine contrattuale a 1 giorno. Generata da codice_sla.';

-- Indice parziale: le riaperture sono 466 su 5.831 righe (8%), e le uniche interrogazioni che
-- toccano questa colonna le CERCANO. Un indice su tutta la tabella spenderebbe spazio per
-- indicizzare i 5.365 `false` che nessuno chiede mai.
create index if not exists acea_ordini_riapertura_idx
  on public.acea_ordini (scadenza, data_creazione)
  where riapertura;

-- L'ordinamento predefinito della tabella diventa «riaperture in cima, poi scadenza»: questo
-- indice serve quel piano senza far ordinare 5.831 righe a ogni caricamento.
create index if not exists acea_ordini_riapertura_scadenza_idx
  on public.acea_ordini (riapertura desc, scadenza asc, data_creazione asc);
