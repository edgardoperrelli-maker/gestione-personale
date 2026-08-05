-- ============================================================================
-- Le AZIONI di una voce, dove il modulo del padre è GIÀ quello giusto: congelarle.
-- ============================================================================
--
-- IL CONTESTO, in breve — per esteso sta nella 20260804120000, che ripara il danno vero.
-- `rapportino_voci.campi_snapshot` è la fotografia delle azioni di una voce; chi la rilegge usa i
-- campi DELLA VOCE e, se sono vuoti, RIPIEGA su `rapportini.campi_snapshot`, cioè sul modulo del
-- PIANO. Il campo è comparso il 20/07 (20260720210000_rapportino_voci_flusso) e tutto ciò che è
-- nato prima non l'ha mai avuto.
--
-- QUESTO FILE NON RIPARA NIENTE, ed è importante saperlo prima di applicarlo: tocca 5.171 voci non
-- manuali per cui il modulo del rapportino padre è GIÀ esattamente quello che il flusso del loro
-- (committente, gruppo attività) prescrive. Copia sulla voce, VERBATIM, lo snapshot del padre —
-- cioè gli stessi identici byte che il ripiego restituisce già oggi. Impatto visivo: ZERO, per
-- costruzione. Nessun esito si muove, nessuna riga «Lavorazioni svolte» compare, nessun export
-- guadagna colonne, perché non entra in gioco nessuna chiave nuova.
--
-- È UNA MISURA DIFENSIVA, e questo è il suo unico scopo. Finché la voce resta NULL, ciò che
-- l'ufficio vedrà DOMANI dipende da `rapportini.campi_snapshot` e da `rapportini.template_id`:
-- basta che qualcuno riassegni il modulo del rapportino, o che una voce di un altro committente
-- entri lì dentro dal "+", e voci storiche già consegnate cambiano faccia. Congelare elimina la
-- dipendenza da uno stato mutabile: sono voci «giuste per coincidenza» che diventano «giuste per
-- costruzione». Sta in un file suo proprio, e va applicato DOPO la 20260804120000, perché essendo
-- a impatto nullo deve poter essere revertito da solo senza toccare la bonifica vera.
--
-- SI COPIA IL PADRE, NON I CAMPI ODIERNI DEL TEMPLATE. Non è un dettaglio: lo snapshot del
-- rapportino è congelato alla creazione mentre i template sono stati editati dopo, e per migliaia
-- di queste voci il contenuto del template OGGI è già diverso da quello con cui l'operatore ha
-- compilato. Copiare il template qui riscriverebbe la storia; copiare il padre la rende immutabile.
-- Per la stessa ragione questo file non ha bisogno di nessun gate sull'esito: byte identici,
-- esito identico. Il gate serve alla 20260804120000, dove i campi cambiano davvero.
--
-- COME SI RISOLVE IL FLUSSO (replica di lib/rapportini/flussiGruppo.ts).
-- `risolviFlussoPerGruppo`: candidati = template `active`, NON `solo_manuale`, con
-- `gruppo_committente` valorizzato e almeno un gruppo che, normalizzato, coincide con quello
-- dell'intervento. Vince chi copre MENO gruppi, a pari merito il nome.
-- `committenteEquivalente`: lower+trim, e `lim_massive` → `acea` («marcatore di canale, non un
-- committente»). `chiaveTassonomia` = collassa spazi → trim → NFD → toglie i diacritici →
-- MAIUSCOLO; U+0300–U+036F è il blocco «Combining Diacritical Marks», la trascrizione ASCII del
-- `/[̀-ͯ]/g` del TypeScript. LIMITE: l'APOSTROFO non viene rimosso, quindi «ATTIVITÀ ALLA
-- CLIENTELA» e «ATTIVITA' ALLA CLIENTELA» restano gruppi DIVERSI — oggi in `interventi` esistono 9
-- sole forme di `gruppo_attivita`, tutte canoniche, ma un import futuro potrebbe romperlo.
-- Si scarta comunque ogni voce con più di un candidato: mai indovinare fra due flussi.
--
-- COSA NON SI TOCCA. Le voci MANUALI (compilate su un modulo `solo_manuale` che
-- `risolviFlussoPerGruppo` non restituisce mai, e il cui `campi_snapshot IS NULL` è oggi l'unico
-- marcatore che le distingue: vanno bonificate insieme al fix di `buildVoceManuale`); le voci senza
-- `intervento_id` o con l'intervento a `gruppo_attivita` NULL, per cui non esiste una coppia da cui
-- risolvere; le voci il cui padre è DIVERSO dal flusso, che sono il perimetro dell'altro file;
-- `rapportini.campi_snapshot` e `rapportini.template_id`, che non si toccano mai; `risposte` e
-- qualunque riga di `interventi`.
--
-- IL TRIGGER. `rapportino_voci_set_updated_at` fa `new.updated_at = now()` incondizionato, e
-- `updated_at` NON è un campo tecnico: è l'ora reale di compilazione, ed è la sorgente di
-- `chiuso_at` dell'intervento in `invia/route.ts` e `risincronizza/route.ts`. Lasciarlo attivo su
-- 5.171 UPDATE porterebbe l'ora di compilazione di mezzo storico all'istante di questa migration, e
-- il primo ricalcolo per data timbrerebbe `chiuso_at` = 04/08 su interventi chiusi a giugno.
-- Si disabilita e si riabilita dentro il DO. Non serve una rete: il DO è UNA SOLA istruzione SQL,
-- quindi se solleva, tutto ciò che contiene torna indietro — l'ALTER compreso, perché in Postgres
-- il DDL è transazionale. Il trigger non può restare spento, qualunque runner applichi il file.
-- QUANDO APPLICARLO: `ALTER TABLE ... DISABLE TRIGGER` prende un lock SHARE ROW EXCLUSIVE che resta
-- fino al commit, cioè per tutta la durata del blocco. Le LETTURE non sono toccate, le SCRITTURE su
-- `rapportino_voci` sì: va lanciato fuori dall'orario di compilazione dei rapportini.
--
-- IDEMPOTENTE: l'UPDATE filtra sullo stato di PARTENZA (`campi_snapshot` null o array vuoto),
-- quindi alla seconda esecuzione trova 0 righe. Il backup usa `create table if not exists` e
-- conserva la fotografia del PRIMA.
-- ============================================================================


-- ─── BACKUP ─────────────────────────────────────────────────────────────────
-- Riga intera, RLS attiva e nessuna policy, come tutte le bak_* dalla 20260725180000 in poi.
-- Fotografa le voci ancora vuote AL MOMENTO DI QUESTO FILE, cioè dopo la 20260804120000: è quindi
-- la base di rollback di questo file soltanto, e non rimette in gioco ciò che ha scritto l'altro.
create table if not exists public.bak_campi_snapshot_20260804_lotto1 as
select v.*
from public.rapportino_voci v
where v.campi_snapshot is null
   or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);

alter table public.bak_campi_snapshot_20260804_lotto1 enable row level security;


do $$
declare
  n_cand    int;
  n_scritte int;
begin
  -- Prerequisito: le due colonne nascono insieme nella 20260720210000_rapportino_voci_flusso.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rapportino_voci'
                    and column_name = 'campi_snapshot')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'rapportino_voci'
                       and column_name = 'template_id') then
    raise exception 'rapportino_voci.campi_snapshot / template_id assenti: applicare prima 20260720210000_rapportino_voci_flusso.';
  end if;

  alter table public.rapportino_voci disable trigger rapportino_voci_set_updated_at;

  -- ── I flussi candidati, uno per (template, gruppo coperto) ────────────────
  -- I campi NON si filtrano qui di proposito: escludere subito un template senza azioni
  -- cambierebbe CHI vince il confronto «meno gruppi», mentre il motore prima sceglie e poi
  -- eventualmente rinuncia.
  create temporary table _flussi on commit drop as
  select distinct
         t.id                           as template_id,
         t.nome                         as nome,
         t.campi                        as campi,
         t.gruppo_committente           as gruppo_committente,
         cardinality(t.gruppi_attivita) as n_gruppi,
         upper(regexp_replace(
           normalize(btrim(regexp_replace(g, '\s+', ' ', 'g')), NFD),
           U&'[\0300-\036F]', '', 'g')) as k_gruppo
  from public.rapportino_template t
  cross join lateral unnest(t.gruppi_attivita) as g
  where t.active
    and not t.solo_manuale
    and t.gruppo_committente is not null
    and coalesce(cardinality(t.gruppi_attivita), 0) > 0;

  -- ── Le voci vuote, con la coppia (committente equivalente, chiave gruppo) ──
  -- La coppia si legge dall'INTERVENTO: `interventi.gruppo_attivita` è già la forma canonica
  -- risolta dalla tassonomia, mentre `rapportino_voci.attivita` è NULL su un centinaio di righe.
  create temporary table _vuote on commit drop as
  select v.id                                 as voce_id,
         v.rapportino_id                      as rapportino_id,
         (v.manuale or v.origine = 'manuale') as e_manuale,
         case when lower(btrim(i.committente)) = 'lim_massive' then 'acea'
              else lower(btrim(i.committente)) end as comm_eq,
         upper(regexp_replace(
           normalize(btrim(regexp_replace(coalesce(i.gruppo_attivita, ''), '\s+', ' ', 'g')), NFD),
           U&'[\0300-\036F]', '', 'g'))       as k_gruppo
  from public.rapportino_voci v
  join public.interventi i on i.id = v.intervento_id
  where v.campi_snapshot is null
     or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);

  -- ── I candidati di questo file: padre GIÀ uguale al flusso risolto ────────
  create temporary table _lotto1 on commit drop as
  with cand as (
    select vv.voce_id,
           f.template_id,
           f.campi,
           row_number() over (partition by vv.voce_id order by f.n_gruppi asc, f.nome asc) as rn,
           count(*)     over (partition by vv.voce_id)                                     as n_cand
    from _vuote vv
    join _flussi f
      on f.gruppo_committente = vv.comm_eq
     and f.k_gruppo           = vv.k_gruppo
    where vv.k_gruppo <> ''
  )
  select vv.voce_id, c.template_id, r.campi_snapshot as campi_padre
  from _vuote vv
  join cand c on c.voce_id = vv.voce_id and c.rn = 1
  join public.rapportini r on r.id = vv.rapportino_id
  where c.n_cand = 1                                   -- mai indovinare fra due flussi
    and jsonb_typeof(c.campi) = 'array'
    and jsonb_array_length(c.campi) > 0                -- un flusso senza azioni non è un flusso
    and not vv.e_manuale                               -- le manuali restano fuori (vedi testata)
    and r.template_id = c.template_id                  -- ← è questo che definisce il lotto
    -- se lo snapshot del padre fosse vuoto non ci sarebbe niente da copiare (misurato: 0 casi)
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and jsonb_array_length(r.campi_snapshot) > 0;

  select count(*) into n_cand from _lotto1;

  -- Attese: 5.171 righe. Nessun gate: si copiano gli stessi byte che il ripiego serve già oggi.
  update public.rapportino_voci v
     set campi_snapshot = l.campi_padre,
         template_id    = l.template_id
  from _lotto1 l
  where v.id = l.voce_id
    and (v.campi_snapshot is null
         or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

  get diagnostics n_scritte = row_count;

  alter table public.rapportino_voci enable trigger rapportino_voci_set_updated_at;

  raise notice 'campi_snapshot (padre già corretto): % candidate → % congelate verbatim dal padre.',
    n_cand, n_scritte;
end $$;
