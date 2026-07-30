-- Correzione della 20260730180000: il B-tree su `matricola` era peso morto.
--
-- MISURATO sul prod (4.196 righe AcquaLatina), non ipotizzato. Il pre-filtro della ricerca
-- dal campo è `matricola ilike '%q%'` — serve al caso del prefisso variabile del master,
-- dove si cerca A023041 e a catalogo c'è 99A023041 — e il wildcard INIZIALE rende un B-tree
-- inservibile. Il piano di esecuzione con il B-tree:
--
--   Index Scan using template_master_righe_master_idx
--     Filter: (matricola IS NOT NULL AND matricola <> '' AND matricola ~~* '%140622%')
--     Rows Removed by Filter: 4194          ← l'indice su matricola non compare
--   Execution Time: 5.923 ms
--
-- Nemmeno la query del campione lo usava (`order by matricola` → top-N heapsort, 9.9 ms).
-- Quindi l'indice costava scrittura a ogni import del master e non serviva a nessuna lettura.
--
-- pg_trgm 1.6 è già installato su questo progetto: un GIN trigram è l'indice che serve
-- davvero a '%q%'. Dopo:
--
--   Bitmap Index Scan on template_master_righe_matricola_trgm_idx
--     Index Cond: (matricola ~~* '%140622%')
--   Execution Time: 0.412 ms               ← 14x, e scala invece di filtrare tutto
--
-- Il costo di scrittura del GIN cade sull'import del master, che è un'operazione rara di
-- back office, non sul percorso del campo.
--
-- NB: si corregge con una migration nuova invece di riscrivere la 20260730180000, perché
-- quella è già stata applicata al prod — il B-tree è esistito davvero, e la storia lo dice.

drop index if exists template_master_righe_matricola_idx;

create index if not exists template_master_righe_matricola_trgm_idx
  on template_master_righe using gin (matricola gin_trgm_ops);
