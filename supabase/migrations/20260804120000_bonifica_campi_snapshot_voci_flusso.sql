-- ============================================================================
-- Le AZIONI di una voce, dove oggi sono quelle di un ALTRO flusso.
-- ============================================================================
--
-- IL DIFETTO. `rapportino_voci.campi_snapshot` è la fotografia delle azioni con cui una voce è
-- stata compilata. Chi la rilegge — Storico interventi, «Modifica voce», PDF, export — usa i campi
-- DELLA VOCE e, se sono vuoti, RIPIEGA su `rapportini.campi_snapshot`, cioè sul modulo scelto per
-- il PIANO. Finché in un rapportino c'è un committente solo il ripiego è invisibile; appena dentro
-- lo stesso rapportino convivono lavori di committenti diversi (il "+" dell'operatore lo consente
-- per costruzione), un intervento Italgas si riapre con le azioni di AcquaLatina.
--
-- PERIMETRO DI QUESTO FILE: solo le voci in cui il ripiego è GIÀ OGGI SBAGLIATO — 1.442 voci non
-- manuali il cui rapportino padre ha un modulo DIVERSO da quello che il flusso del loro
-- (committente, gruppo attività) prescrive. Ne scrive 1.282; le altre 160 restano vuote perché il
-- gate non riesce a garantire che l'esito non si muova. Il congelamento difensivo delle voci il cui
-- padre è GIÀ corretto è un'operazione diversa, a impatto visivo nullo, e sta nel file successivo
-- (20260804130000): separata perché va poter essere revertita da sola.
--
-- COME SI RISOLVE IL FLUSSO (replica di lib/rapportini/flussiGruppo.ts). Candidati = template
-- `active`, NON `solo_manuale`, con `gruppo_committente` valorizzato e almeno un gruppo che,
-- normalizzato, coincide con quello dell'intervento; vince chi copre MENO gruppi, a pari merito il
-- nome. `committenteEquivalente` mappa `lim_massive` → `acea` («marcatore di canale, non un
-- committente»): senza, la risoluzione fallirebbe per la fetta più grossa del danno.
-- `chiaveTassonomia` = collassa spazi → trim → NFD → toglie i diacritici → MAIUSCOLO; U+0300–U+036F
-- è il blocco «Combining Diacritical Marks», cioè la trascrizione ASCII del `/[̀-ͯ]/g` del
-- TypeScript (un .sql con dentro combining nudi si rompe al primo copia-incolla).
-- LIMITE VERO: l'APOSTROFO non viene rimosso, quindi «ATTIVITÀ ALLA CLIENTELA» e «ATTIVITA' ALLA
-- CLIENTELA» restano gruppi DIVERSI. Oggi in `interventi` esistono 9 sole forme di
-- `gruppo_attivita`, tutte canoniche; se un import futuro scrivesse la forma accentata, quelle voci
-- finirebbero in silenzio fra le «non risolvibili» invece che agganciate. Si scarta comunque ogni
-- voce con più di un candidato: se l'ambiguità comparisse, la migration smetterebbe di toccare
-- quelle righe invece di indovinare.
--
-- IL GATE, ED È LA PARTE CHE CONTA. `voceEsitoColore` calcola verde/rossa/neutro LEGGENDO questi
-- campi, e da lì discende tutto: un esito che diventa neutro blocca l'invio e fa tradurre a
-- `patchInterventoLiveDaVoce` il neutro in 'riapri', riportando l'intervento ad assegnato/esito
-- null/chiuso_at null — lavoro consegnato che torna «da fare». Nel verso opposto è peggio: un «Non
-- fatto» che diventa positivo innesca `sweepDopoPositivi` e l'ingresso nei registri misuratori.
-- Il criterio «le chiavi delle risposte sono contenute nel nuovo modulo» è stato misurato e
-- SCARTATO: aggiungere un campo non viola nessuna inclusione di chiavi, quindi lascia passare la
-- maggior parte dei flip e insieme scarta centinaia di righe che non sarebbero cambiate.
-- GATE 1 (esito): si ricalcola il colore DUE volte — con i campi che la voce vede oggi e con quelli
-- che vedrebbe dopo — e si scrive SOLO se coincidono. Misurato: 1.282 passano, 160 saltate
-- (123 rossa→neutro, 37 verde→neutro, ZERO flip verso il positivo).
-- GATE 2 (foto): nessuna chiave `tipo='foto'` oggi valorizzata può sparire dal nuovo modulo. La
-- modale «Storico → foto» legge SOLO le chiavi foto del modulo della voce, e la DELETE di una voce
-- raccoglie da lì i path da ripulire nello Storage: perdere una chiave significa una foto
-- invisibile e, il giorno che si cancella la voce, un file orfano per sempre. Oggi blocca 0 voci:
-- resta come rete, perché basta una modifica ai template perché smetta di essere 0.
--
-- COSA CAMBIA PER L'UFFICIO, oltre agli esiti (che per costruzione non si muovono). Questo NON è
-- un intervento invisibile, e va detto qui perché chi rigenera un documento se ne accorgerà:
--   • `unioneCampi` (utils/rapportini/campiDiVoce.ts) costruisce le «Lavorazioni svolte» e le
--     colonne degli export unendo i campi del rapportino con quelli PER-VOCE. Scrivendo il lotto si
--     immettono nell'unione chiavi che prima non c'erano.
--   • Misurato: 7 rapportini — TUTTI in stato `inviato` — acquistano una riga «Lavorazioni svolte»
--     per la chiave `bonifica_semplice`, che nel PDF già consegnato non compare. Sono
--     f5401039 (PARADISI 26/06), a652e07b (BRUNELLI 06/07), 15a2685a (SERRA 17/07),
--     98be2499 (TODINI 17/07), 7c936bb3 (ANNACCARATO 17/07), 79751700 (COMMERSO 17/07),
--     58af8e52 (SERRA 20/07).
--   • Sempre misurato: 77 rapportini (75 dei quali `inviato`) guadagnano colonne negli export, per
--     8 chiavi complessive. Nessun esito cambia, ma un file rigenerato oggi non sarà identico a
--     quello consegnato al committente. Se l'immutabilità del consegnato è un requisito duro,
--     questo file va fermato e discusso, non applicato.
--
-- COSA NON SI TOCCA, E PERCHÉ
-- • Le voci MANUALI. Una voce del "+" NON è stata compilata sul flusso: `intervento-manuale`
--   risolve il modulo con `risolviTemplateCommittente`, che cerca fra i `solo_manuale` — e
--   `risolviFlussoPerGruppo` per costruzione non ne restituisce MAI uno. Scriverle col flusso
--   significa consegnare all'ufficio un modulo che l'operatore non ha mai visto. In più il loro
--   `campi_snapshot IS NULL` è oggi l'UNICO marcatore che le distingue dalle voci congelate bene, e
--   bruciarlo rende impossibile la bonifica giusta — che dovrà partire da
--   `interventi_manuali.template_id` e arrivare INSIEME al fix di `buildVoceManuale`, che oggi non
--   dichiara né `template_id` né `campi_snapshot` e fa nascere vuota ogni voce dal "+".
-- • Le voci non risolvibili: senza `intervento_id`, o con l'intervento a `gruppo_attivita` NULL.
--   Non c'è una coppia (committente, gruppo) da cui risolvere e non la si inventa. In particolare
--   NON si usa il territorio del piano come ripiego: non porta il gruppo attività e sul solo
--   committente sbaglierebbe un terzo delle volte (il territorio ACEA ospita acea, lim_massive e
--   italgas insieme).
-- • Le 160 bloccate dal gate: il ripiego di oggi è sbagliato ma è RICALCOLABILE, un campi_snapshot
--   plausibile e sbagliato non lo è più, perché il fallback non scatta e nessuno se ne accorge.
-- • `rapportini.campi_snapshot` e `rapportini.template_id`: il padre non si tocca mai.
-- • `risposte` e qualunque riga di `interventi`.
--
-- IL TRIGGER. `rapportino_voci_set_updated_at` è BEFORE UPDATE FOR EACH ROW e fa
-- `new.updated_at = now()`, incondizionato. E `updated_at` NON è un campo tecnico: è l'ora reale di
-- compilazione, ed è la sorgente di `chiuso_at` dell'intervento in `invia/route.ts` e in
-- `risincronizza/route.ts`. Lasciarlo attivo porterebbe l'ora di compilazione di mezzo storico
-- all'istante di questa migration, e il primo ricalcolo per data timbrerebbe `chiuso_at` = 04/08 su
-- interventi chiusi a giugno — la stessa classe di guasto già documentata in `invia/route.ts`.
-- Si disabilita e si riabilita dentro il DO. Non serve una rete: il DO è UNA SOLA istruzione SQL,
-- quindi se solleva, tutto ciò che contiene torna indietro — l'ALTER compreso, perché in Postgres
-- il DDL è transazionale. Il trigger non può restare spento, qualunque runner applichi il file.
-- QUANDO APPLICARLO: `ALTER TABLE ... DISABLE TRIGGER` prende un lock SHARE ROW EXCLUSIVE che
-- resta fino al commit, cioè per tutta la durata del blocco. Le LETTURE non sono toccate, le
-- SCRITTURE su `rapportino_voci` sì: va lanciato fuori dall'orario di compilazione dei rapportini.
--
-- IDEMPOTENTE. Non c'è un commento che lo promette: sta nella WHERE. L'UPDATE filtra sullo stato di
-- PARTENZA (`campi_snapshot` null o array vuoto), quindi alla seconda esecuzione trova 0 righe e
-- non fallisce. Il backup usa `create table if not exists`, quindi la seconda volta non viene
-- ricreato e conserva la fotografia del PRIMA — che è tutto il punto di un backup.
--
-- PRECEDENTE CONTRARIO, da dichiarare invece che far finta di niente. La
-- 20260731110000_acqualatina_committente_odl_12380195 si è RIFIUTATA di fare questa cosa: «NON si
-- tocca template_id/campi_snapshot della voce (restano nulli/vuoti): sono la foto del modulo COME
-- È STATO COMPILATO in campo, e riempirli a posteriori col template AcquaLatina inventerebbe una
-- storia mai avvenuta». Il principio resta valido e qui non viene contraddetto, viene circoscritto:
-- là si trattava di UNA voce manuale a cui si sarebbe cucito addosso un modulo diverso da quello
-- compilato; qui il modulo cambia unicamente dove è dimostrato che l'esito non si muove, e le voci
-- manuali — cioè proprio la famiglia di quella riga — restano fuori per intero.
-- ============================================================================


-- ─── BACKUP ─────────────────────────────────────────────────────────────────
-- Riga intera, RLS attiva e nessuna policy, come tutte le bak_* dalla 20260725180000 in poi.
-- Si fotografano TUTTE le voci ancora vuote, non solo quelle che verranno scritte: per poter
-- rispondere anche alla domanda «e quelle che avete lasciato stare com'erano?».
create table if not exists public.bak_campi_snapshot_20260804_lotto2 as
select v.*
from public.rapportino_voci v
where v.campi_snapshot is null
   or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);

-- Lo stato dei template al momento della bonifica: senza questo, fra un mese non si saprà più quali
-- campi sono stati scritti, perché i template vengono editati e non esiste storico versioni.
create table if not exists public.bak_campi_snapshot_20260804_template as
select t.* from public.rapportino_template t;

alter table public.bak_campi_snapshot_20260804_lotto2   enable row level security;
alter table public.bak_campi_snapshot_20260804_template enable row level security;


do $$
declare
  n_cand           int;
  n_scritte        int;
  n_bloccate_esito int;
  n_bloccate_foto  int;
begin
  -- Prerequisito: le due colonne nascono insieme nella 20260720210000_rapportino_voci_flusso.
  -- Scrivere i campi senza il template_id (o viceversa) lascerebbe la voce in uno stato che nessun
  -- lettore sa interpretare.
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
  -- eventualmente rinuncia. Si sceglie con le stesse regole e si scarta il vincitore vuoto dopo.
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
  -- La coppia si legge dall'INTERVENTO, non dalla voce: `interventi.gruppo_attivita` è già la forma
  -- canonica risolta dalla tassonomia, mentre `rapportino_voci.attivita` è NULL su un centinaio di
  -- righe e altrove porta forme non canoniche ('LIMITAZIONE MASSIVA', 'LIMITAZIONI').
  create temporary table _vuote on commit drop as
  select v.id                                 as voce_id,
         v.rapportino_id                      as rapportino_id,
         v.risposte                           as risposte,
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

  -- ── I candidati di questo file: padre DIVERSO dal flusso risolto ──────────
  create temporary table _lotto2 on commit drop as
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
  select vv.voce_id, vv.risposte, c.template_id, c.campi as campi_nuovo,
         r.campi_snapshot as campi_padre
  from _vuote vv
  join cand c on c.voce_id = vv.voce_id and c.rn = 1
  join public.rapportini r on r.id = vv.rapportino_id
  where c.n_cand = 1                                    -- mai indovinare fra due flussi
    and jsonb_typeof(c.campi) = 'array'
    and jsonb_array_length(c.campi) > 0                 -- un flusso senza azioni non è un flusso
    and not vv.e_manuale                                -- le manuali restano fuori (vedi testata)
    and r.template_id is distinct from c.template_id    -- ← è questo che definisce il lotto
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and jsonb_array_length(r.campi_snapshot) > 0;

  select count(*) into n_cand from _lotto2;

  -- ── GATE 1: replica di voceEsitoColore, valutata due volte per ogni voce ──
  -- 'padre' = i campi che la voce vede OGGI via ripiego; 'nuovo' = quelli che vedrebbe dopo.
  create temporary table _colori on commit drop as
  with pool as (
    select voce_id, risposte, 'padre'::text as lato, campi_padre as campi from _lotto2
    union all
    select voce_id, risposte, 'nuovo'::text,        campi_nuovo         from _lotto2
  ),
  el as (
    -- `with ordinality` conserva l'ordine dell'array, che serve al return anticipato:
    -- esitoDichiarato esce al PRIMO segnale negativo che incontra scorrendo i campi.
    select p.voce_id, p.lato, e.ord,
           e.c ->> 'tipo'                                                    as tipo,
           p.risposte -> (e.c ->> 'chiave')                                  as val,
           coalesce(e.c ->> 'chiave', '') || ' ' || coalesce(e.c ->> 'etichetta', '') as nomi,
           e.c ->> 'obbligatoria'                                            as obbligatoria
    from pool p
    cross join lateral jsonb_array_elements(p.campi) with ordinality as e(c, ord)
  ),
  seg as (
    select voce_id, lato, ord, tipo, val, obbligatoria,
           -- NEG_NAME = /assent|non[\s_-]*eseguit|negativ|\bko\b/i  (\b → \y in Postgres)
           (nomi ~* 'assent|non[[:space:]_-]*eseguit|negativ|\yko\y') as nome_neg,
           -- ESITO_SELECT_NAME = /esegu|esito/i
           (nomi ~* 'esegu|esito')                                    as is_esito,
           -- NOTE_FIELD = /^note/i, testato su `${chiave} ${etichetta}`
           (nomi ~* '^note')                                          as e_nota,
           case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else '' end as sval
    from el
  ),
  cls as (
    select voce_id, lato, ord,
      case
        -- crocetta: conta solo `v === true` (booleano jsonb), come il TypeScript
        when tipo = 'crocetta' and val = 'true'::jsonb then
          case when nome_neg then 'negativo' else 'positivo' end
        when tipo = 'select' and sval <> '' then
          case
            -- NEG_SELECT: vale SOLO sul campo esito. Su un select secondario (es. «Sostituzione
            -- valvola» SI/NO) il NO è un attributo della lavorazione, non l'esito della voce.
            when is_esito and sval ~* '^(no|assente|negativ[[:alnum:]_]*|ko|nessun[[:space:]_-]*passagg[[:alnum:]_]*)$'
              then case when sval ~* '^nessun[[:space:]_-]*passagg[[:alnum:]_]*$'
                        then 'negativo_esplicito'   -- auto-esplicativo: la nota non serve
                        else 'negativo' end
            when nome_neg then 'negativo'
            else 'positivo'
          end
        else null
      end as segnale
    from seg
  ),
  dichiarato as (
    select voce_id, lato,
           (array_agg(segnale order by ord)
              filter (where segnale in ('negativo', 'negativo_esplicito')))[1] as primo_neg,
           bool_or(segnale = 'positivo')                                       as ha_positivo
    from cls group by voce_id, lato
  ),
  completezza as (
    select voce_id, lato,
           -- noteCompilate: nessun campo note ⇒ true; altrimenti tutti compilati
           bool_and(case when tipo = 'testo' and e_nota
                         then (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') <> '')
                         else true end) as note_ok,
           -- matricoleObbligatorieCompilate: solo tipo='matricola' con obbligatoria === true
           bool_and(case when tipo = 'matricola' and obbligatoria = 'true'
                         then (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') <> '')
                         else true end) as matricole_ok
    from seg group by voce_id, lato
  ),
  colore as (
    select d.voce_id, d.lato,
      case coalesce(d.primo_neg, case when d.ha_positivo then 'positivo' else 'nessuno' end)
        when 'negativo_esplicito' then 'rossa'
        when 'negativo'           then case when x.note_ok then 'rossa' else 'neutro' end
        when 'nessuno'            then 'neutro'
        else                           case when x.matricole_ok then 'verde' else 'neutro' end
      end as col
    from dichiarato d
    join completezza x on x.voce_id = d.voce_id and x.lato = d.lato
  )
  select a.voce_id, a.col as colore_oggi, b.col as colore_dopo
  from colore a
  join colore b on b.voce_id = a.voce_id and a.lato = 'padre' and b.lato = 'nuovo';

  select count(*) into n_bloccate_esito from _colori where colore_oggi is distinct from colore_dopo;

  -- ── GATE 2: nessuna chiave foto valorizzata può sparire ───────────────────
  create temporary table _foto_perse on commit drop as
  select distinct l.voce_id
  from _lotto2 l
  cross join lateral jsonb_array_elements(l.campi_padre) as e(c)
  where e.c ->> 'tipo' = 'foto'
    and (   (jsonb_typeof(l.risposte -> (e.c ->> 'chiave')) = 'string'
             and btrim((l.risposte -> (e.c ->> 'chiave')) #>> '{}') <> '')
         or (jsonb_typeof(l.risposte -> (e.c ->> 'chiave')) = 'array'
             and jsonb_array_length(l.risposte -> (e.c ->> 'chiave')) > 0))
    and not exists (
      select 1 from jsonb_array_elements(l.campi_nuovo) as n(c2)
      where n.c2 ->> 'tipo' = 'foto' and n.c2 ->> 'chiave' = e.c ->> 'chiave'
    );

  select count(*) into n_bloccate_foto from _foto_perse;

  -- Attese: 1.282 righe scritte su 1.442 candidate; 160 saltate dal gate esito
  -- (123 rossa→neutro, 37 verde→neutro) e 0 dal gate foto.
  update public.rapportino_voci v
     set campi_snapshot = l.campi_nuovo,
         template_id    = l.template_id
  from _lotto2 l
  join _colori c on c.voce_id = l.voce_id
  where v.id = l.voce_id
    and c.colore_oggi = c.colore_dopo
    and not exists (select 1 from _foto_perse fp where fp.voce_id = l.voce_id)
    and (v.campi_snapshot is null
         or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

  get diagnostics n_scritte = row_count;

  alter table public.rapportino_voci enable trigger rapportino_voci_set_updated_at;

  raise notice 'campi_snapshot (padre diverso dal flusso): % candidate → % scritte, % saltate dal gate esito, % dal gate foto.',
    n_cand, n_scritte, n_bloccate_esito, n_bloccate_foto;
end $$;
