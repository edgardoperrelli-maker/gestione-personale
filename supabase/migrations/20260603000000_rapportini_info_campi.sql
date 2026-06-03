-- Rapportini: campi informativi dinamici per template + snapshot per rapportino
alter table rapportino_template
  add column if not exists info_campi jsonb not null default '[]';
alter table rapportini
  add column if not exists info_snapshot jsonb not null default '[]';

-- Seed: il template Standard mostra gli 11 campi nell'ordine attuale (comportamento invariato)
update rapportino_template
set info_campi = '[
  {"chiave":"nominativo","etichetta":"NOMINATIVO","ordine":1},
  {"chiave":"matricola","etichetta":"MATRICOLA","ordine":2},
  {"chiave":"pdr","etichetta":"PDR","ordine":3},
  {"chiave":"odsin","etichetta":"ODSIN","ordine":4},
  {"chiave":"via","etichetta":"VIA","ordine":5},
  {"chiave":"comune","etichetta":"COMUNE","ordine":6},
  {"chiave":"cap","etichetta":"CAP","ordine":7},
  {"chiave":"recapito","etichetta":"RECAPITO","ordine":8},
  {"chiave":"attivita","etichetta":"ATTIVITA","ordine":9},
  {"chiave":"accessibilita","etichetta":"ACCESSIBILITA","ordine":10},
  {"chiave":"fascia_oraria","etichetta":"FASCIA ORARIA","ordine":11}
]'::jsonb
where is_default = true and (info_campi is null or info_campi = '[]'::jsonb);
