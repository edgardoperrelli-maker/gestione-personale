-- supabase/migrations/20260804120000_acea_sal_origine.sql
-- I SAL ora entrano da DUE porte: il giro «Leggi SAL» dell'agente (cartella CONTABILITA' su un PC
-- in ufficio) e l'import del file dalla pagina Produzione economica. Sono la stessa tabella e la
-- stessa chiave, ma quando un numero non torna la prima domanda è «da dove è entrato questo SAL?»:
-- senza la colonna la risposta si può solo indovinare dal `run_id`, che l'import non ha.
--
-- Default 'agente' e non 'ignota': tutto ciò che c'è oggi in tabella è arrivato dall'agente, ed è
-- l'unica cosa vera da scrivere sulle righe già presenti.
alter table acea_sal add column if not exists origine text not null default 'agente';

comment on column acea_sal.origine is
  'Da dove è entrata la riga: ''agente'' (giro Leggi SAL) oppure ''import'' (file caricato dalla pagina Produzione economica).';
