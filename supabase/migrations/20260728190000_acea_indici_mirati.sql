-- Indici MIRATI, scelti misurando i piani e verificati dopo averli creati.
--
-- Il contesto conta: le tabelle di questa commessa hanno 5-12 mila righe, dimensioni per cui
-- Postgres quasi mai fatica. Misurato con EXPLAIN ANALYZE, la query principale della tabella
-- ordini (famiglia + aperto, ordinata, primi 300) sta in 2,6 ms e usa gia` gli indici esistenti:
-- non ha bisogno di niente, e dargliene uno sarebbe stato lavoro apparente.
--
-- Ne restano tre, e ciascuno ha un numero dietro.

-- 1. Gli ordini di sostituzione saracinesca: erano 18,4 ms di scansione sequenziale per tenerne
--    267 su 5.227, e girano a ogni caricamento della tabella. Con il trigram: 1,6 ms, undici
--    volte piu` veloce, verificato sul piano.
--
--    Serve un GIN trigram e non un btree perche` il filtro arriva come `ilike '%SARACINESC%'`: un
--    btree non puo` servire un LIKE che comincia con il jolly, e un indice parziale scritto con
--    `upper(...) like ...` non verrebbe riconosciuto equivalente a `ilike` dal planner.
create index if not exists acea_ordini_attivita_trgm_idx
  on acea_ordini using gin (attivita gin_trgm_ops);

-- 2. La scadenza, che e` l'ordinamento predefinito della vista dunning: 162 usi nelle prime ore
--    di vita dell'indice. Parziale perche` le massive non scadono mai, e mezzo registro con
--    `scadenza is null` in un indice sarebbe peso inutile.
create index if not exists acea_ordini_scadenza_idx
  on acea_ordini (scadenza) where scadenza is not null;

-- 3. Il comune, su cui si ordina e si filtra per pianificare le zone. Con questo il piano passa a
--    Index Scan + Incremental Sort invece di ordinare tutto.
create index if not exists acea_ordini_comune_idx on acea_ordini (comune);

-- NON creati, e vale la pena scriverlo: due indici sulle espressioni JSON di `rapportino_voci`
-- (`risposte->>'sostituzione_valvola'` e `->>'sost_valvola'`). Creati, misurati, ZERO usi: il
-- planner preferisce la scansione sequenziale, che su quella tabella costa 6 ms, perche` un quinto
-- delle righe soddisfa comunque il filtro. Sono stati rimossi invece di lasciarli li` a costare
-- scritture a ogni rapportino chiuso per un guadagno che non c'e`.
