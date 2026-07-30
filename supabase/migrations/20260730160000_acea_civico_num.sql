-- Il civico ORDINABILE: la parte numerica iniziale del civico, come colonna generata.
--
-- Ordinare la colonna Indirizzo per sola `via` lasciava i civici in ordine casuale dentro la
-- stessa via; ordinarli come testo darebbe 1, 10, 2. PostgREST ordina solo colonne, non
-- espressioni: la colonna generata è il modo di far fare a Postgres un ordine che il testo non
-- sa dare. `stored` e non un indice funzionale: il registro è ~6.500 righe, l'ordinamento in
-- memoria è già istantaneo — serve solo che la colonna ESISTA per la `order` della query.
--
-- La parte numerica INIZIALE, non l'intero civico: «584 C» ordina come 584 e lo spareggio sul
-- testo (in query) mette C dopo B. Il tetto {1,8} evita l'overflow dell'integer su un civico
-- malformato. Un civico senza cifre iniziali (raro ma possibile) resta NULL e va in fondo,
-- come ogni valore assente.
--
-- Nessun grant nuovo: la colonna serve alle query del service role; `authenticated` resta con
-- i privilegi di colonna che ha (la tabella è dichiarata immutabile dall'app).
alter table public.acea_ordini
  add column if not exists civico_num integer
  generated always as (nullif(substring(civico from '^\d{1,8}'), '')::integer) stored;
