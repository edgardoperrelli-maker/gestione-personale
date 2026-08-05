-- ============================================================================
-- Le AZIONI di una voce del "+" (manuale), quando il flusso del suo GRUPPO ATTIVITÀ non è
-- quello del rapportino padre.
-- ============================================================================
--
-- IL DIFETTO, complementare a 20260804120000/20260804130000 (che hanno bonificato solo le voci
-- 'task'). `buildVoceManuale` non ha mai scritto `template_id`/`campi_snapshot`: OGNI voce nata
-- dal "+" operatore ripiega SEMPRE su `rapportini.campi_snapshot`, cioè sul modulo del PIANO —
-- comportamento voluto quando il "+" è dello STESSO committente/flusso del rapportino (es. un
-- "+" AcquaLatina in un rapportino AcquaLatina), sbagliato quando il gruppo attività della voce
-- ha un flusso proprio e il rapportino che la contiene è di un ALTRO committente. I rapportini
-- misti sono ammessi per costruzione (è il "+" stesso a consentirli): caso reale, un "+"
-- BONIFICHE EXTRA (Italgas, task-via) creato dentro un rapportino AcquaLatina ereditava la
-- MATRICOLA NUOVO MISURATORE di AcquaLatina come campo obbligatorio — un'azione senza senso su
-- un intervento Italgas, che blocca l'invio dell'intera giornata (`indiciVociIncomplete` non
-- esclude le voci manuali con esito dichiarato, e il "+" nasce sempre a esito positivo).
--
-- Il codice ora risolve e congela il flusso del gruppo alla creazione del "+"
-- (app/api/r/[token]/intervento-manuale/route.ts) e, quando manca ancora, alla sua approvazione
-- (app/api/admin/interventi-manuali/[id]/approva/route.ts — il "+" nasce spesso 'in_attesa'
-- SENZA `intervento_id`, quindi senza un gruppo da cui risolvere finché non è approvato). Questo
-- file bonifica lo STORICO: le voci manuali già scritte prima del fix, per cui un `intervento_id`
-- esiste già — quelle senza (ancora in attesa di revisione) si sistemeranno da sole
-- alla loro approvazione, col codice nuovo.
--
-- PERIMETRO DI QUESTO FILE: voci con `manuale = true` (o `origine = 'manuale'`), `campi_snapshot`
-- NULL/vuoto, agganciate a un `intervento_id` (corsia 'liberi', o 'normale' già approvata) — MAI
-- le voci ancora 'in_attesa' senza intervento, che il codice risolve da sé all'approvazione.
--
-- COME SI RISOLVE IL FLUSSO (replica di lib/rapportini/flussiGruppo.ts, stessa query di
-- 20260804120000/130000 — vedi quei file per il dettaglio di `chiaveTassonomia`/
-- `committenteEquivalente`/`risolviFlussoPerGruppo`).
--
-- STESSI DUE GATE di 20260804120000, applicati qui per lo stesso motivo (`voceEsitoColore` decide
-- verde/rossa/neutro leggendo i campi; un neutro che compare riapre un intervento consegnato):
-- GATE 1 (esito): scrive SOLO se il colore calcolato con i campi di oggi (ripiego dal rapportino)
-- coincide con quello dei campi nuovi (flusso del gruppo).
-- GATE 2 (foto): nessuna chiave `tipo='foto'` oggi valorizzata può sparire dal nuovo modulo.
--
-- COSA NON SI TOCCA: le voci 'task' (bonificate da 20260804120000/130000); le voci manuali SENZA
-- `intervento_id` (si sistemano da sole all'approvazione); le voci senza gruppo risolvibile (il
-- gruppo si legge da `interventi.gruppo_attivita`, che su un intervento manuale può essere NULL
-- se l'attività non è mai stata in tassonomia — nessuna invenzione); `rapportini.campi_snapshot`/
-- `template_id`; `risposte` e qualunque riga di `interventi`.
--
-- IL TRIGGER: stessa ragione di 20260804120000 — `rapportino_voci_set_updated_at` scriverebbe
-- `updated_at` = ora di questa migration, e da lì `chiuso_at` di interventi già chiusi. Disabilitato
-- e riabilitato dentro il DO (transazionale: se il DO solleva, torna tutto indietro).
--
-- IDEMPOTENTE: l'UPDATE filtra sullo stato di PARTENZA (`campi_snapshot` null o array vuoto).
--
-- ⚠️ NON ANCORA APPLICATA: le query di verifica sono in coda al file (commentate). Vanno lanciate
-- PRIMA su una copia/staging (o come SELECT qui sopra su prod) per misurare candidate/scritte/
-- bloccate — come fatto per 20260804120000 (1.442 candidate → 1.282 scritte) — prima di eseguire
-- il DO in produzione. Questa migration non è stata misurata contro il DB reale in questa sessione.
-- ============================================================================


-- ─── BACKUP ─────────────────────────────────────────────────────────────────
create table if not exists public.bak_campi_snapshot_20260805_manuali as
select v.*
from public.rapportino_voci v
where (v.manuale or v.origine = 'manuale')
  and (v.campi_snapshot is null
       or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

alter table public.bak_campi_snapshot_20260805_manuali enable row level security;


do $$
declare
  n_cand           int;
  n_scritte        int;
  n_bloccate_esito int;
  n_bloccate_foto  int;
begin
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
  create temporary table _flussi_man on commit drop as
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

  -- ── Le voci MANUALI vuote, con la coppia (committente equivalente, chiave gruppo) ──
  -- Committente/gruppo si leggono dall'INTERVENTO agganciato: solo le voci con `intervento_id`
  -- entrano qui (vedi testata — quelle senza si sistemano da sole all'approvazione).
  create temporary table _vuote_man on commit drop as
  select v.id                                 as voce_id,
         v.rapportino_id                      as rapportino_id,
         v.risposte                           as risposte,
         case when lower(btrim(i.committente)) = 'lim_massive' then 'acea'
              else lower(btrim(i.committente)) end as comm_eq,
         upper(regexp_replace(
           normalize(btrim(regexp_replace(coalesce(i.gruppo_attivita, ''), '\s+', ' ', 'g')), NFD),
           U&'[\0300-\036F]', '', 'g'))       as k_gruppo
  from public.rapportino_voci v
  join public.interventi i on i.id = v.intervento_id
  where (v.manuale or v.origine = 'manuale')
    and (v.campi_snapshot is null
         or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

  -- ── I candidati: padre (rapportino) DIVERSO dal flusso del gruppo della voce ──
  create temporary table _lotto_man on commit drop as
  with cand as (
    select vv.voce_id,
           f.template_id,
           f.campi,
           row_number() over (partition by vv.voce_id order by f.n_gruppi asc, f.nome asc) as rn,
           count(*)     over (partition by vv.voce_id)                                     as n_cand
    from _vuote_man vv
    join _flussi_man f
      on f.gruppo_committente = vv.comm_eq
     and f.k_gruppo           = vv.k_gruppo
    where vv.k_gruppo <> ''
  )
  select vv.voce_id, vv.risposte, c.template_id, c.campi as campi_nuovo,
         r.campi_snapshot as campi_padre
  from _vuote_man vv
  join cand c on c.voce_id = vv.voce_id and c.rn = 1
  join public.rapportini r on r.id = vv.rapportino_id
  where c.n_cand = 1                                    -- mai indovinare fra due flussi
    and jsonb_typeof(c.campi) = 'array'
    and jsonb_array_length(c.campi) > 0                 -- un flusso senza azioni non è un flusso
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and jsonb_array_length(r.campi_snapshot) > 0;

  select count(*) into n_cand from _lotto_man;

  -- ── GATE 1: replica di voceEsitoColore, valutata due volte per ogni voce ──
  create temporary table _colori_man on commit drop as
  with pool as (
    select voce_id, risposte, 'padre'::text as lato, campi_padre as campi from _lotto_man
    union all
    select voce_id, risposte, 'nuovo'::text,        campi_nuovo         from _lotto_man
  ),
  el as (
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
           (nomi ~* 'assent|non[[:space:]_-]*eseguit|negativ|\yko\y') as nome_neg,
           (nomi ~* 'esegu|esito')                                    as is_esito,
           (nomi ~* '^note')                                          as e_nota,
           case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else '' end as sval
    from el
  ),
  cls as (
    select voce_id, lato, ord,
      case
        when tipo = 'crocetta' and val = 'true'::jsonb then
          case when nome_neg then 'negativo' else 'positivo' end
        when tipo = 'select' and sval <> '' then
          case
            when is_esito and sval ~* '^(no|assente|negativ[[:alnum:]_]*|ko|nessun[[:space:]_-]*passagg[[:alnum:]_]*)$'
              then case when sval ~* '^nessun[[:space:]_-]*passagg[[:alnum:]_]*$'
                        then 'negativo_esplicito'
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
           bool_and(case when tipo = 'testo' and e_nota
                         then (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') <> '')
                         else true end) as note_ok,
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

  select count(*) into n_bloccate_esito from _colori_man where colore_oggi is distinct from colore_dopo;

  -- ── GATE 2: nessuna chiave foto valorizzata può sparire ───────────────────
  create temporary table _foto_perse_man on commit drop as
  select distinct l.voce_id
  from _lotto_man l
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

  select count(*) into n_bloccate_foto from _foto_perse_man;

  update public.rapportino_voci v
     set campi_snapshot = l.campi_nuovo,
         template_id    = l.template_id
  from _lotto_man l
  join _colori_man c on c.voce_id = l.voce_id
  where v.id = l.voce_id
    and c.colore_oggi = c.colore_dopo
    and not exists (select 1 from _foto_perse_man fp where fp.voce_id = l.voce_id)
    and (v.campi_snapshot is null
         or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

  get diagnostics n_scritte = row_count;

  alter table public.rapportino_voci enable trigger rapportino_voci_set_updated_at;

  raise notice 'campi_snapshot voci MANUALI (padre diverso dal flusso del gruppo): % candidate → % scritte, % bloccate dal gate esito, % dal gate foto.',
    n_cand, n_scritte, n_bloccate_esito, n_bloccate_foto;
end $$;


-- ============================================================================
-- QUERY DI VERIFICA (da lanciare PRIMA di applicare il DO qui sopra, o su una copia):
--
-- Quante voci manuali candidate (stesso perimetro di _lotto_man)?
--   -- vedi le CTE sopra: sostituire il DO con una SELECT count(*) da _lotto_man per misurare
--   -- senza scrivere, come fatto per 20260804120000 (misurato: 1.442 candidate, 1.282 scritte).
--
-- Diff PRIMA/DOPO su una singola voce nota (es. quella segnalata: BONIFICHE EXTRA con
-- MATRICOLA NUOVO MISURATORE obbligatoria ereditata da un rapportino AcquaLatina):
--   select v.id, v.attivita, v.manuale, v.intervento_id, i.committente, i.gruppo_attivita,
--          v.campi_snapshot, v.template_id
--   from rapportino_voci v join interventi i on i.id = v.intervento_id
--   where v.manuale and i.gruppo_attivita = 'BONIFICHE EXTRA'
--     and (v.campi_snapshot is null or jsonb_array_length(v.campi_snapshot) = 0);
-- ============================================================================
