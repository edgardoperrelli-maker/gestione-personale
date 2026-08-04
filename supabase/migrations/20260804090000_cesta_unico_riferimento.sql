-- Un solo riferimento di magazzino, e si chiama CESTA.
--
-- IL DIETROFRONT
-- Il modello a due gradini — si scarica in CESTA, a cesta piena si va su un PALLET — descriveva
-- un ciclo che il magazzino non fa: cesta e pallet sono la stessa cosa, lo stesso contenitore
-- numerato con cui la riconsegna al committente viaggia. Il pallet era un secondo nome per la
-- cesta, con una colonna, un filtro, una barra di assegnazione e una colonna PDF a duplicare
-- quelli veri. Da qui in avanti il riferimento è UNO.
--
-- PERCHÉ SI PUÒ FARE ADESSO, E A COSTO ZERO
-- Il pallet non è mai stato usato: 0 righe valorizzate su ENTRAMBI i registri (AcquaLatina
-- 0/293, ACEA 0/66) alla data di questa migration. La cesta invece ne ha 150, tutte AcquaLatina.
-- Non c'è niente da travasare: c'è da togliere un nome di troppo prima che qualcuno ci scriva
-- dentro e la fusione diventi una migrazione di dati.
--
-- LE DUE TABELLE PARTONO DA POSTI DIVERSI
--   • ACEA (`misuratori_rimossi`) ha `pallet` e non ha `cesta` → si RINOMINA, così la colonna
--     resta la stessa (e ACEA guadagna il riferimento col nome giusto).
--   • AcquaLatina (`acqualatina_misuratori_rimossi`) ha entrambe → `pallet` si ELIMINA, perché
--     `cesta` è quella scritta dagli operatori e non si tocca.

-- ─── ACEA: pallet diventa cesta ───────────────────────────────────────────────────────────
-- Idempotente e senza presupposti sullo stato di partenza: rinomina solo se c'è da rinominare,
-- e l'`add column if not exists` sotto copre il caso di un database dove non c'è mai stato né
-- l'uno né l'altro (ambiente nuovo, ripristino da backup vecchio).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'misuratori_rimossi' and column_name = 'pallet'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'misuratori_rimossi' and column_name = 'cesta'
  ) then
    alter table public.misuratori_rimossi rename column pallet to cesta;
  end if;
end $$;

alter table public.misuratori_rimossi
  add column if not exists cesta text;

comment on column public.misuratori_rimossi.cesta is
  'Cesta di magazzino: il contenitore numerato con cui la riconsegna viaggia. NULL = non ancora scaricato. TEXT perché è un RIFERIMENTO, non una quantità.';

-- La domanda dell'ufficio è «cosa c'è nella cesta 3?»: indice parziale come su AcquaLatina, le
-- righe ancora in furgone (cesta null) non hanno niente da dire a questa domanda.
create index if not exists misuratori_rimossi_cesta_idx
  on public.misuratori_rimossi (cesta)
  where cesta is not null;

-- ─── AcquaLatina: il pallet sparisce ──────────────────────────────────────────────────────
-- Guardia prima di distruggere: se fra la scrittura e l'applicazione di questa migration
-- qualcuno ha impallettato davvero, la migration si FERMA invece di buttare via i numeri.
-- Il messaggio dice cosa fare, perché un'eccezione senza istruzioni è solo un muro.
do $$
declare n integer;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'acqualatina_misuratori_rimossi'
       and column_name = 'pallet'
  ) then
    execute 'select count(*) from public.acqualatina_misuratori_rimossi where pallet is not null'
       into n;
    if n > 0 then
      raise exception
        'pallet valorizzato su % righe: travasarlo in cesta (update ... set cesta = pallet where cesta is null) prima di rilanciare', n;
    end if;
  end if;
end $$;

alter table public.acqualatina_misuratori_rimossi
  drop column if exists pallet;

comment on column public.acqualatina_misuratori_rimossi.cesta is
  'Cesta di magazzino: la dichiara l''OPERATORE all''invio del rapportino. NULL = ancora in furgone (e infatti si accompagna a da_consegnare_deposito).';
