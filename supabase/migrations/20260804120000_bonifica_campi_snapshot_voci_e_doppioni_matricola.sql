-- ============================================================================
-- Le AZIONI di una voce di rapportino: congelarle sulla voce, invece di
-- lasciarle ripiegare sul modulo del PIANO — e l'inventario dei doppioni.
-- ============================================================================
--
-- IL DIFETTO. `rapportino_voci.campi_snapshot` è la fotografia delle azioni con cui una voce
-- è stata (o andava) compilata. Chi rilegge una voce — Storico interventi, «Modifica voce»,
-- PDF, export — usa i campi DELLA VOCE e, se sono vuoti, RIPIEGA su `rapportini.campi_snapshot`,
-- cioè sul modello scelto per il piano. Finché in un rapportino c'è un committente solo, il
-- ripiego è invisibile; appena dentro lo stesso rapportino convivono lavori di committenti
-- diversi (il "+" dell'operatore lo consente per costruzione), un intervento Italgas si riapre
-- con le azioni di AcquaLatina. Il campo è comparso il 20/07 (20260720210000_rapportino_voci_flusso)
-- e tutto ciò che è nato prima non l'ha mai avuto: 9.475 voci su 12.739 (74,4%) ce l'hanno NULL,
-- e sono NULL vere — zero array vuoti, zero oggetti vuoti. Non è corruzione: è una colonna che
-- per due terzi della vita della tabella non è mai stata scritta.
--
-- COSA FA QUESTA MIGRATION, IN UNA RIGA: congela sulla voce le azioni che il flusso del suo
-- (committente, gruppo attività) prescrive — ma SOLO dove può dimostrare che così facendo non
-- cambia l'esito di un lavoro già chiuso. Dove non può dimostrarlo, lascia la voce vuota: il
-- ripiego di oggi è sbagliato ma è RICALCOLABILE, un campi_snapshot plausibile e sbagliato non
-- lo è più, perché il fallback non scatta e nessuno se ne accorge mai più.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COME SI RISOLVE IL FLUSSO (replica esatta di lib/rapportini/flussiGruppo.ts)
--
-- `risolviFlussoPerGruppo(committenteEquivalente(committente), gruppo_attivita, templates)`:
-- candidati = template `active`, NON `solo_manuale`, con `gruppo_committente` valorizzato e
-- almeno un gruppo in `gruppi_attivita` che, normalizzato, coincide col gruppo dell'intervento.
-- Vince chi copre MENO gruppi (il dedicato batte l'ibrido), a pari merito il nome.
--
-- `committenteEquivalente` (lib/attivita/tassonomia.ts): lower+trim, e `lim_massive` → `acea`
-- («lim_massive è un marcatore di canale, non un committente»). Senza questa mappatura la
-- risoluzione fallirebbe per 2.157 interventi, cioè per la fetta più grossa del danno.
--
-- `chiaveTassonomia` = `normalizzaAttivita(s).key` (lib/produzione/normalizzaAttivita.ts):
--   collassa gli spazi → trim → NFD → toglie i diacritici → MAIUSCOLO.
-- In SQL, alla lettera e nello stesso ordine:
--   upper(regexp_replace(normalize(btrim(regexp_replace(s,'\s+',' ','g')), NFD), U&'[\0300-\036F]', '', 'g'))
-- L'intervallo U+0300–U+036F è il blocco «Combining Diacritical Marks»: è la trascrizione ASCII
-- del `/[̀-ͯ]/g` del TypeScript, scritta così perché un file .sql con dentro dei
-- combining nudi è illeggibile e si rompe al primo copia-incolla.
-- ATTENZIONE, e vale per chiunque tocchi questa regola: l'APOSTROFO non viene rimosso, quindi
-- «ATTIVITÀ ALLA CLIENTELA» e «ATTIVITA' ALLA CLIENTELA» restano due gruppi DIVERSI. Oggi in
-- `interventi` esistono 9 sole forme di `gruppo_attivita`, tutte già canoniche, quindi il caso
-- non si presenta; se un import futuro scrivesse la forma accentata, quelle voci finirebbero in
-- silenzio nel gruppo «non risolvibile» invece di essere agganciate.
--
-- Il tie-break «meno gruppi, poi nome» oggi non viene MAI esercitato: ognuna delle 9 coppie
-- (committente, gruppo) presenti nei dati è coperta da UN SOLO template — verificato, zero
-- ambiguità, zero pareggi. È un equilibrio fragile e va detto: riattivare «Ibrido acea»
-- (acea, [LIMITAZIONI MASSIVE, DUNNING], oggi active=false) porterebbe 3.405 voci acea ad avere
-- due candidati, e allora la regola diventerebbe portante — con l'aggravante che il pareggio sul
-- nome usa `String.localeCompare` in JS e la collation del DB qui, che possono divergere.
-- Per questo la migration scarta per COSTRUZIONE ogni voce con più di un candidato (`n_cand = 1`):
-- se domani l'ambiguità comparisse, questa migration smetterebbe di toccare quelle righe invece
-- di indovinare.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- I DUE LOTTI, E PERCHÉ SONO DUE
--
-- LOTTO 1 — il modello del rapportino padre è GIÀ quello giusto (5.171 voci non manuali).
-- Qui si copia VERBATIM `rapportini.campi_snapshot`, non i campi odierni del template.
-- Il capitolato diceva «niente scritture dove il padre ha già il template giusto, è rumore
-- inutile», e lo si fa lo stesso: l'istruzione prevedeva l'eccezione, ed è questo il caso.
-- Due motivi, entrambi misurati.
--   1) Non è rumore, è la chiusura della falla. Finché la voce resta NULL, ciò che l'ufficio
--      vedrà domani dipende da `rapportini.campi_snapshot` e da `rapportini.template_id`: basta
--      che qualcuno riassegni il modello del rapportino, o che una voce di un altro committente
--      entri lì dentro dal "+", e voci storiche già consegnate cambiano faccia. Congelare
--      elimina la dipendenza da uno stato mutabile.
--   2) Copiare i campi ODIERNI del template qui sarebbe attivamente dannoso: lo snapshot del
--      rapportino è congelato alla creazione mentre i template sono stati editati dopo, e per
--      4.795 voci il contenuto del template oggi è già DIVERSO da quello con cui l'operatore ha
--      compilato. Copiare il padre verbatim è per costruzione a impatto visivo zero — sono gli
--      stessi identici byte che il ripiego restituisce adesso — e per la stessa ragione non ha
--      bisogno di nessun gate: byte identici, esito identico.
--
-- LOTTO 2 — il modello del padre è DIVERSO dal flusso risolto (1.442 voci non manuali, di 1.842
-- totali). Questo è il danno vero: la voce oggi si riapre con le azioni di un altro flusso.
-- Qui si scrivono i campi del template risolto, ma solo attraverso i due gate qui sotto.
-- I blocchi più grossi: 568 voci acea/DUNNING sotto «IBRIDO ITALGAS/ACEA» (che ha
-- `gruppo_committente` NULL: un modello che non appartiene a nessun committente e fa da ripiego
-- a due contemporaneamente), 500 italgas/ATTIVITA' ALLA CLIENTELA sotto lo stesso, 254
-- italgas/BONIFICHE EXTRA sotto il generico «ITALGAS», 48 voci P.I. che mostrano i 5 campi di
-- «ITALGAS» invece dei 5 di «P.I.».
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IL GATE, ED È LA PARTE CHE CONTA
--
-- Scrivere campi_snapshot non è un fatto cosmetico: `voceEsitoColore` (utils/rapportini/voceColore.ts)
-- calcola verde/rossa/neutro LEGGENDO QUEI CAMPI, e da lì discende tutto. Un esito che diventa
-- neutro blocca l'invio (`vociIncompleteInvio`, `invia/route.ts`) e, peggio, `patchInterventoLiveDaVoce`
-- traduce «neutro» in 'riapri' e riporta l'intervento a stato='assegnato', esito=null,
-- chiuso_at=null: lavoro fatto, fotografato e consegnato che torna «da fare» al primo
-- `POST /api/interventi/risincronizza` o alla prima apertura della modale «Modifica voce».
-- Nel verso opposto è anche peggio: un «Non fatto» che diventa positivo innesca `sweepDopoPositivi`
-- (revoca le voci aperte sullo stesso ODL, anche in piani futuri) e l'ingresso nei registri
-- misuratori — cioè si propaga a magazzino e riconciliazione.
--
-- Il criterio «le chiavi delle risposte sono contenute nel nuovo template» NON è sufficiente ed è
-- stato scartato dopo averlo misurato: lascia passare 177 flip su 385, perché AGGIUNGERE un campo
-- (una matricola obbligatoria, un campo note, un select che risulta positivo) non viola nessuna
-- inclusione di chiavi; e insieme ne scarta 489 che non sarebbero cambiate. Sembra prudente e non
-- lo è.
--
-- GATE 1 (esito) — l'unico onesto è quello diretto: si ricalcola il colore DUE volte, con i campi
-- che la voce vede oggi (il padre) e con quelli che vedrebbe dopo, e si scrive SOLO se coincidono.
-- `voceEsitoColore` è replicato qui sotto per intero: `esitoDichiarato` con l'ordine di scansione
-- e il return anticipato al primo segnale negativo, NEG_SELECT, NEG_SELECT_SENZA_NOTA, NEG_NAME,
-- ESITO_SELECT_NAME, `noteCompilate`, `matricoleObbligatorieCompilate`. Misura sui dati reali:
-- delle 1.442 del lotto 2, 1.282 passano e 160 vengono SALTATE (123 rossa→neutro, 37 verde→neutro,
-- zero flip nel verso positivo). Quelle 160 restano vuote e continuano a ripiegare: è esattamente
-- il caso «il nuovo template introdurrebbe un obbligo che le risposte salvate non soddisfano»
-- (P.I. e BONIFICHE EXTRA non dichiarano affatto un campo esito; ACQUALATINA pretende
-- `matricola_nuova`), e la consegna era di saltarle, non di forzarle.
--
-- GATE 2 (foto) — nessuna chiave `tipo='foto'` oggi valorizzata nelle risposte può sparire dal
-- nuovo template. Non è pignoleria: la modale «Storico → foto» legge SOLO le chiavi foto del
-- template della voce, e la DELETE di una voce raccoglie da lì i path da ripulire nello Storage.
-- Perdere una chiave significa una foto invisibile e, il giorno che si cancella la voce, un file
-- orfano nel bucket per sempre. Sul lotto 2 oggi blocca 0 voci: resta come rete per il futuro,
-- perché basta una modifica ai template perché smetta di essere 0.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COSA NON SI TOCCA, E PERCHÉ
--
-- • Le 2.594 voci MANUALI risolvibili (2.194 col padre già corretto + 400 col padre diverso).
--   Una voce del "+" NON è stata compilata sul flusso: `intervento-manuale/route.ts` risolve il
--   modello con `risolviTemplateCommittente`, che cerca fra i template `solo_manuale` — e
--   `risolviFlussoPerGruppo` per costruzione non restituisce MAI un solo_manuale. Scriverle col
--   flusso significa consegnare all'ufficio un modulo che l'operatore non ha mai visto. In più:
--   il `campi_snapshot IS NULL` di quelle righe è oggi l'UNICO marcatore che le distingue dalle
--   voci congelate correttamente; bruciarlo adesso rende impossibile la bonifica giusta, che
--   dovrà partire da `interventi_manuali.template_id` e arrivare insieme al fix di codice
--   (`buildVoceManuale` non dichiara né `template_id` né `campi_snapshot`, quindi ogni voce nata
--   dal "+" continua a nascere vuota: ~14 al giorno). Bonificarle prima di quel fix vorrebbe dire
--   rifarlo a ogni giro di rapportini.
-- • Le 268 voci non risolvibili: 267 non hanno `intervento_id` (l'aggancio per ODL/matricola/PDR
--   non ha trovato nulla) e 1 ha l'intervento con `gruppo_attivita` NULL. Non c'è una coppia
--   (committente, gruppo) da cui risolvere e non la si inventa. In particolare NON si usa il
--   territorio del piano come ripiego: il territorio non porta il gruppo attività, e sul solo
--   committente sbaglierebbe un terzo delle volte (2.113 disaccordi su 6.449 righe derivabili;
--   il territorio ACEA ospita acea, lim_massive e italgas insieme).
-- • Le 160 bloccate dal gate.
-- • `rapportini.campi_snapshot` e `rapportini.template_id`: il padre non si tocca mai.
-- • `risposte`, `updated_at`, e qualunque riga di `interventi`.
--
-- Bilancio: 6.453 voci scritte (5.171 + 1.282) su 9.475 vuote. Le altre 3.022 restano vuote e
-- continuano a ripiegare — la migration RIDUCE il problema, non lo chiude, e va detto qui invece
-- che scoprirlo dopo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IL TRIGGER, che è la trappola meno visibile
--
-- `rapportino_voci_set_updated_at` è BEFORE UPDATE FOR EACH ROW e fa `new.updated_at = now()`,
-- incondizionato. E `updated_at` della voce NON è un campo tecnico: è l'ora reale di compilazione,
-- ed è la sorgente di `chiuso_at` dell'intervento in `invia/route.ts` e in `risincronizza/route.ts`.
-- Lasciarlo attivo su 6.453 UPDATE porterebbe l'ora di compilazione di mezzo storico all'istante
-- di questa migration, e il primo ricalcolo per data timbrerebbe `chiuso_at` = 04/08 su interventi
-- chiusi a giugno. È la stessa classe di guasto già documentata nei commenti di `invia/route.ts`
-- (le 39 rimozioni del 31/07 finite a registro datate 03/08). Si disabilita dentro la transazione
-- e si riabilita subito: il DISABLE è transazionale, quindi un rollback lo ripristina da sé.
--
-- IDEMPOTENTE. Non c'è un commento che lo promette: sta nella WHERE. Ogni UPDATE filtra su
-- `campi_snapshot is null or (è un array e ha lunghezza 0)`, cioè sullo stato di PARTENZA: alla
-- seconda esecuzione non trova più nulla, aggiorna 0 righe e non fallisce. Le tabelle di backup
-- usano `create table if not exists ... as select`, quindi la seconda volta non vengono
-- ricreate e conservano la fotografia del PRIMA — che è tutto il punto di un backup.
--
-- PRECEDENTE CONTRARIO, da dichiarare invece che far finta di niente.
-- La 20260731110000_acqualatina_committente_odl_12380195 si è RIFIUTATA di fare questa cosa:
-- «NON si tocca template_id/campi_snapshot della voce (restano nulli/vuoti): sono la foto del
-- modulo COME È STATO COMPILATO in campo, e riempirli a posteriori col template AcquaLatina
-- inventerebbe una storia mai avvenuta». Quel principio resta valido e qui non viene contraddetto,
-- viene circoscritto: là si trattava di UNA voce manuale a cui si sarebbe cucito addosso un
-- modello diverso da quello compilato; qui il lotto 1 copia esattamente i campi che la voce già
-- mostra (nessuna storia nuova, solo la stessa storia resa immutabile) e il lotto 2 cambia il
-- modello unicamente dove è dimostrato che l'esito non si muove, saltando tutto il resto. Le voci
-- manuali — cioè proprio la famiglia di quella riga — restano fuori per intero.
-- ============================================================================


-- ─── BACKUP, prima di qualsiasi cosa ────────────────────────────────────────
-- Riga intera, RLS attiva e nessuna policy, come tutte le bak_* dalla 20260725180000 in poi.
-- Si fotografano TUTTE le 9.475 voci vuote, non solo le 6.453 che verranno scritte: per poter
-- rispondere anche alla domanda «e quelle che avete lasciato stare com'erano?».

create table if not exists public.bak_campi_snapshot_20260804_voci as
select v.*
from public.rapportino_voci v
where v.campi_snapshot is null
   or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);

-- Lo stato dei template al momento della bonifica: senza questo, fra un mese non si saprà più
-- quali campi sono stati scritti, perché i template vengono editati e non esiste storico versioni
-- (l'unica tabella che somiglia a un backup, bak_maiusc_rapportino_template, è una-tantum).
create table if not exists public.bak_campi_snapshot_20260804_template as
select t.* from public.rapportino_template t;

alter table public.bak_campi_snapshot_20260804_voci     enable row level security;
alter table public.bak_campi_snapshot_20260804_template enable row level security;


-- ============================================================================
-- A) BACKFILL DI campi_snapshot
-- ============================================================================

do $$
declare
  n_flussi          int;
  n_vuote           int;
  n_risolte         int;
  n_manuali         int;
  n_lotto1          int;
  n_lotto2_cand     int;
  n_lotto2_scritte  int;
  n_bloccate_esito  int;
  n_bloccate_foto   int;
begin
  -- Prerequisito: le due colonne nascono insieme nella 20260720210000_rapportino_voci_flusso.
  -- Se manca anche solo una delle due si ferma qui, rumorosamente: scrivere i campi senza il
  -- template_id (o viceversa) lascerebbe la voce in uno stato che nessun lettore sa interpretare.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rapportino_voci'
                    and column_name = 'campi_snapshot')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'rapportino_voci'
                       and column_name = 'template_id') then
    raise exception 'rapportino_voci.campi_snapshot / template_id assenti: applicare prima 20260720210000_rapportino_voci_flusso.';
  end if;

  -- Il trigger che riscriverebbe updated_at (vedi testata). Riabilitato in fondo al blocco.
  alter table public.rapportino_voci disable trigger rapportino_voci_set_updated_at;

  -- ── I flussi candidati, uno per (template, gruppo coperto) ────────────────
  -- `active` e `not solo_manuale` replicano il filtro che il motore applica a monte
  -- (sincronizzaRapportini.ts carica i template con .eq('active', true) e risolviFlussoPerGruppo
  -- scarta i solo_manuale). `gruppo_committente is not null` + almeno un gruppo è `templateCollegato()`.
  -- I campi NON si filtrano qui di proposito: escludere subito un template senza azioni cambierebbe
  -- CHI vince il confronto «meno gruppi», mentre il motore prima sceglie e poi eventualmente
  -- rinuncia. Si sceglie con le stesse regole e si scarta il vincitore vuoto dopo.
  create temporary table _flussi on commit drop as
  select distinct
         t.id                                as template_id,
         t.nome                              as nome,
         t.campi                             as campi,
         t.gruppo_committente                as gruppo_committente,
         cardinality(t.gruppi_attivita)      as n_gruppi,
         upper(regexp_replace(
           normalize(btrim(regexp_replace(g, '\s+', ' ', 'g')), NFD),
           U&'[\0300-\036F]', '', 'g'))      as k_gruppo
  from public.rapportino_template t
  cross join lateral unnest(t.gruppi_attivita) as g
  where t.active
    and not t.solo_manuale
    and t.gruppo_committente is not null
    and coalesce(cardinality(t.gruppi_attivita), 0) > 0;

  select count(*) into n_flussi from _flussi;

  -- ── Le voci vuote, con la coppia (committente equivalente, chiave gruppo) ──
  -- La coppia si legge dall'INTERVENTO, non dalla voce: `interventi.gruppo_attivita` è già la
  -- forma canonica risolta dalla tassonomia, mentre `rapportino_voci.attivita` è NULL su un
  -- centinaio di righe e altrove porta forme non canoniche ('LIMITAZIONE MASSIVA', 'LIMITAZIONI')
  -- che andrebbero ri-normalizzate a mano.
  create temporary table _vuote on commit drop as
  select v.id                     as voce_id,
         v.rapportino_id          as rapportino_id,
         v.risposte               as risposte,
         (v.manuale or v.origine = 'manuale') as e_manuale,
         case when lower(btrim(i.committente)) = 'lim_massive' then 'acea'
              else lower(btrim(i.committente)) end as comm_eq,
         upper(regexp_replace(
           normalize(btrim(regexp_replace(coalesce(i.gruppo_attivita, ''), '\s+', ' ', 'g')), NFD),
           U&'[\0300-\036F]', '', 'g'))      as k_gruppo
  from public.rapportino_voci v
  join public.interventi i on i.id = v.intervento_id
  where v.campi_snapshot is null
     or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);

  select count(*) into n_vuote from _vuote;

  -- ── La risoluzione: si tiene SOLO chi ha esattamente un candidato ─────────
  create temporary table _risolte on commit drop as
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
  select vv.voce_id, vv.rapportino_id, vv.risposte, vv.e_manuale,
         c.template_id, c.campi as campi_nuovo
  from _vuote vv
  join cand c on c.voce_id = vv.voce_id and c.rn = 1
  where c.n_cand = 1                                    -- mai indovinare fra due flussi
    and jsonb_typeof(c.campi) = 'array'
    and jsonb_array_length(c.campi) > 0;                 -- un flusso senza azioni non è un flusso

  select count(*) into n_risolte from _risolte;
  select count(*) into n_manuali from _risolte where e_manuale;

  -- ══ LOTTO 1 — padre già corretto: copia verbatim del suo snapshot ═════════
  -- Attese: 5.171 righe (7.365 col padre corretto, meno 2.194 manuali escluse).
  -- Impatto visivo per costruzione ZERO: sono gli stessi byte che il ripiego restituisce oggi.
  -- Nessun gate, per lo stesso motivo. Il join su `rapportini` pretende uno snapshot padre non
  -- vuoto: se fosse vuoto non ci sarebbe niente da copiare (misurato: 0 casi).
  update public.rapportino_voci v
     set campi_snapshot = r.campi_snapshot,
         template_id    = r.template_id
  from _risolte s
  join public.rapportini r on r.id = s.rapportino_id
  where v.id = s.voce_id
    and not s.e_manuale
    and r.template_id = s.template_id
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and jsonb_array_length(r.campi_snapshot) > 0
    and (v.campi_snapshot is null
         or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0));

  get diagnostics n_lotto1 = row_count;

  -- ══ LOTTO 2 — padre diverso dal flusso: qui i gate ════════════════════════
  create temporary table _lotto2 on commit drop as
  select s.voce_id, s.risposte, s.template_id, s.campi_nuovo,
         r.campi_snapshot as campi_padre
  from _risolte s
  join public.rapportini r on r.id = s.rapportino_id
  where not s.e_manuale
    and r.template_id is distinct from s.template_id
    and jsonb_typeof(r.campi_snapshot) = 'array'
    and jsonb_array_length(r.campi_snapshot) > 0;

  select count(*) into n_lotto2_cand from _lotto2;

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

  get diagnostics n_lotto2_scritte = row_count;

  alter table public.rapportino_voci enable trigger rapportino_voci_set_updated_at;

  raise notice 'campi_snapshot: % flussi/gruppo, % voci vuote con intervento, % risolte (% manuali escluse); lotto1 (padre corretto) % scritte; lotto2 (padre diverso) % candidate → % scritte, % saltate dal gate esito, % dal gate foto.',
    n_flussi, n_vuote, n_risolte, n_manuali, n_lotto1, n_lotto2_cand, n_lotto2_scritte,
    n_bloccate_esito, n_bloccate_foto;
end $$;


-- ============================================================================
-- B) DOPPIONI DI VOCI MANUALI SULLA STESSA MATRICOLA
-- ============================================================================
--
-- IL PERIMETRO, misurato con la normalizzazione vera. `normMatricola`
-- (lib/limitazione/matricoleSimili.ts): `String(v).toUpperCase().replace(/[^A-Z0-9]/g,'')` —
-- MAIUSCOLO prima, strip dopo. In SQL: regexp_replace(upper(coalesce(x,'')), '[^A-Z0-9]', '', 'g').
-- Raggruppando per (rapportino, matricola normalizzata) ed escludendo le voci già rifiutate
-- escono 17 gruppi per 37 voci. Ma solo 5 sono doppioni veri, e la distinzione non è statistica,
-- è caso per caso:
--   • 9 gruppi sono coppie ACEA/DUNNING pianificate, stesso contatore, ODL DIVERSI e attività
--     complementari (limitazione/sospensione poi revoca/regolarizzazione): è il ciclo normale
--     sulla stessa utenza nella stessa giornata. Legittimi per costruzione.
--   • 1 gruppo ha matricola degenere ('0.' e '0'): due bonifiche a INDIRIZZI DIVERSI, interventi
--     diversi, foto diverse. Collisione su un campo non compilato, non un doppione.
--   • 1 gruppo (matricola '8 PG') è un rapportino ancora in_corso con due righe abbozzate, senza
--     intervento e senza risposte.
--   • 1 gruppo ha la stessa matricola ACEA su CINQUE utenze a cinque civici diversi, con cinque
--     ODL distinti: è sporcizia del file sorgente del committente, da segnalare a loro.
-- Per questo qui NON c'è nessuna DELETE guidata dal raggruppamento: ogni riga è nominata per
-- `id`. Una query di cleanup che cancellasse «i duplicati del gruppo» distruggerebbe 1+4
-- interventi validi in quei due gruppi.
--
-- I 5 DOPPIONI VERI, e come si sceglie la riga da tenere:
--   [1] 59d57f34 SERRA ALEX 24/07 MTSB032800618789 — due invii a 10 secondi, stesso parent, e le
--       foto sono BIT-IDENTICHE (stesso nome E stessa size). Doppio tap sul pulsante: si tiene
--       il primo (da3e8223), si rimuove a6f7f86c.
--   [2] 706a211e SERRA ALEX 23/07 SMGR034016495783 — 15 minuti di distanza ma di nuovo foto
--       bit-identiche: gli stessi file ricaricati, non un secondo intervento. Si tiene ed4d2be0,
--       si rimuove 85c3e820.
--   [3] d278c433 COMMERSO 03/07 FIOR034424051629 — qui il criterio non è l'orario ma il dato:
--       la prima ha il PDR valorizzato, la seconda ce l'ha NULL. Si tiene 1c2d688f, si rimuove
--       59522eb6. Da notare, perché è la lezione del caso: le due matricole grezze sono
--       'FIOR034424051629' e 'FIOR 0344 24051629' — differiscono per gli SPAZI. Un controllo di
--       unicità che confronta le stringhe come arrivano non intercetta questo doppione; deve
--       passare da normMatricola.
--   [4] 7edd4414 PASSERI 29/07 MTSB032800527167 — NON SI TOCCA. Le due righe sono indistinguibili
--       su ogni dimensione oggettiva: stesso PDR, stesso indirizzo, stesso parent, stesse chiavi
--       di risposta, 2 foto ciascuna, entrambi gli interventi chiusi, entrambe approvate. L'unica
--       differenza è che le foto hanno gli stessi NOMI ma size DIVERSE: sono due set di scatti
--       distinti a 4 minuti di distanza. L'ipotesi plausibile — il primo invio è venuto male e
--       l'operatore ha rifatto le foto — porterebbe a tenere la SECONDA, cioè l'opposto della
--       regola usata negli altri tre casi. Nei dati non c'è di che decidere, e applicare
--       comunque un «tieni la prima» qui butterebbe via il dato buono. Decide l'ufficio, dopo
--       aver guardato le due coppie di immagini o aver chiesto a PASSERI GIANLUCA.
--   [5] 5a3e7e62 TREGU 22/07 ODL 912350450 — NON SI TOCCA, e non perché sia dubbio: perché non è
--       un caso da DELETE, è un caso da MERGE. È l'unico doppione misto pianificata+manuale e
--       l'unico doppione su ODL di tutto il DB. Il contenuto operativo sta nella voce MANUALE
--       (5 foto, 3 risposte, esito valorizzato); l'identità contrattuale sta nella PIANIFICATA
--       (task_id del piano importato, committente `acea` corretto, template risolto,
--       campi_snapshot pieno). Cancellare la manuale butta l'evidenza fotografica; cancellare la
--       pianificata sgancia l'ODL dal piano ACEA. Serve portare risposte e foto sulla riga
--       pianificata, che è un'operazione di merito, non di pulizia. Nota a margine e indipendente
--       dai doppioni: su quella richiesta e sul suo intervento il committente è registrato come
--       'lim_massive' mentre la gemella pianificata dice 'acea' — qualunque conteggio per
--       committente su quell'intervento è già sbagliato oggi.
--
-- PERCHÉ SI CANCELLA IL TERZETTO E NON SOLO LA VOCE. Verificato riga per riga: in tutti e 17 i
-- gruppi ogni voce ha un `intervento_id` PROPRIO e distinto, e su ciascuno di quegli interventi
-- insiste esattamente 1 voce e 1 richiesta. Cancellare la sola voce lascerebbe quindi SEMPRE un
-- intervento 'completato' non più raggiungibile da nessun rapportino e una richiesta
-- `interventi_manuali` appesa nel vuoto — cioè esattamente ciò che non deve succedere. Si
-- rimuovono perciò insieme, nella stessa transazione: voce → richiesta → intervento.
-- Le dipendenze sono state controllate una per una prima di scrivere questo blocco:
-- `misuratori_rimossi`, `misuratori_riconsegna`, `acqualatina_misuratori_rimossi`,
-- `pi_contabilita_righe` e `rapportino_righe` non hanno righe per questi id (le prime quattro
-- cascaderebbero, e cancellare un misuratore di magazzino qui sarebbe un disastro silenzioso);
-- nessun intervento li usa come `riconciliazione_rif_id`; nessuna richiesta li usa come
-- `parent_voce_id`; nessuno dei tre interventi è consuntivato. Tutto questo è comunque
-- RIVERIFICATO a runtime dal blocco qui sotto, che si ferma con un'eccezione se una sola delle
-- condizioni non regge — meglio una migration che fallisce di una che cancella al buio.
--
-- QUELLO CHE RESTA FUORI DAL DB, e va detto: le foto stanno in `interventi_manuali_foto` legate
-- alla richiesta, e la FK è ON DELETE CASCADE — quindi le 6 righe spariscono con le richieste, ma
-- i 6 FILE nello Storage no, perché da SQL non si tocca il bucket. I loro `storage_path` sono
-- conservati per intero in bak_doppioni_matricola_20260804_foto: la ripulitura del bucket è un
-- passo manuale, ed è anche l'unica via di rollback completa se l'ufficio cambiasse idea.
--
-- LE VOCI RIFIUTATE NON SI TOCCANO. Ce ne sono 13, di cui 8 insistono su una matricola già
-- presente e attiva nello stesso rapportino, con motivo esplicito «MATRICOLA GIA CARICATA»: sono
-- doppioni che l'ufficio ha già gestito col rifiuto, e per costruzione non hanno intervento
-- (`rifiuta/route.ts` impone `intervento_id: null`, «un rifiuto non deve MAI lasciare o produrre
-- un intervento canonico agganciato»). Includerle nel raggruppamento porterebbe i gruppi da 17 a
-- 25 e rimetterebbe in gioco righe archiviate di proposito.
--
-- IDEMPOTENTE: i target si intersecano con ciò che ESISTE ancora. Alla seconda esecuzione le tre
-- voci non ci sono più, l'insieme è vuoto e non viene cancellato nulla — senza eccezioni, perché
-- «già fatto» e «non sicuro» sono distinti esplicitamente: si solleva solo se una riga c'è ANCORA
-- e non soddisfa le condizioni.

-- ─── BACKUP, prima di qualsiasi cosa ────────────────────────────────────────
-- Si fotografano tutte e 37 le voci dei 17 gruppi (non solo le 3 rimosse) con i loro interventi,
-- richieste e foto: serve a poter ricostruire anche i casi lasciati aperti, e a dare all'ufficio
-- la lista su cui decidere per [4] e [5].
create table if not exists public.bak_doppioni_matricola_20260804_voci as
with g as (
  select rapportino_id,
         regexp_replace(upper(coalesce(matricola, '')), '[^A-Z0-9]', '', 'g') as mnorm
  from public.rapportino_voci
  where coalesce(approvazione_stato, '') <> 'rifiutato'
    and regexp_replace(upper(coalesce(matricola, '')), '[^A-Z0-9]', '', 'g') <> ''
  group by 1, 2
  having count(*) > 1
)
select v.*
from public.rapportino_voci v
join g on g.rapportino_id = v.rapportino_id
      and g.mnorm = regexp_replace(upper(coalesce(v.matricola, '')), '[^A-Z0-9]', '', 'g')
where coalesce(v.approvazione_stato, '') <> 'rifiutato';

create table if not exists public.bak_doppioni_matricola_20260804_int as
select i.* from public.interventi i
where i.id in (select b.intervento_id from public.bak_doppioni_matricola_20260804_voci b
               where b.intervento_id is not null);

create table if not exists public.bak_doppioni_matricola_20260804_richieste as
select m.* from public.interventi_manuali m
where m.id in (select b.richiesta_id from public.bak_doppioni_matricola_20260804_voci b
               where b.richiesta_id is not null);

-- `storage_path` incluso: è l'unico modo per ripulire (o recuperare) i file del bucket dopo.
create table if not exists public.bak_doppioni_matricola_20260804_foto as
select f.* from public.interventi_manuali_foto f
where f.richiesta_id in (select b.richiesta_id from public.bak_doppioni_matricola_20260804_voci b
                         where b.richiesta_id is not null);

alter table public.bak_doppioni_matricola_20260804_voci      enable row level security;
alter table public.bak_doppioni_matricola_20260804_int       enable row level security;
alter table public.bak_doppioni_matricola_20260804_richieste enable row level security;
alter table public.bak_doppioni_matricola_20260804_foto      enable row level security;


do $$
declare
  n_presenti   int;
  n_non_sicure int;
  n_voci       int;
  n_richieste  int;
  n_interventi int;
begin
  -- I tre terzetti da rimuovere, nominati uno per uno. `tenuta` è la riga buona del gruppo:
  -- sta qui perché la rimozione ha senso solo se la sopravvissuta c'è ancora.
  create temporary table _dedup (
    voce_id       uuid not null,
    richiesta_id  uuid not null,
    intervento_id uuid not null,
    tenuta        uuid not null,
    nota          text not null
  ) on commit drop;

  insert into _dedup (voce_id, richiesta_id, intervento_id, tenuta, nota) values
    ('a6f7f86c-d2a0-4b54-be2a-24e9bc47180b', '2c2169fd-fa27-434b-8c97-c095acb0819c',
     '44cd8b46-607e-406f-a5d3-985114bcc8a0', 'da3e8223-fb87-41ef-a90c-dcd36a8e0985',
     '59d57f34 MTSB032800618789 — reinvio a 10 secondi, foto bit-identiche'),
    ('85c3e820-0691-4ee4-84ff-bf878087eee9', 'b68100c3-a5cc-410a-a3f2-8a96b2086b86',
     'a88049b9-dc4f-4c71-b7c9-d49865e180e5', 'ed4d2be0-2fd3-490a-9754-a5cb36a969ac',
     '706a211e SMGR034016495783 — stessi file ricaricati 15 minuti dopo'),
    ('59522eb6-f23e-455e-af8d-46fdfa6e3b5b', '1f1a3521-ef5e-4c6d-9767-cf2062b5c7ff',
     'd8c1f904-273f-44eb-9f6c-d771bee762e8', '1c2d688f-2797-4a34-b2f9-fdf43093c98a',
     'd278c433 FIOR034424051629 — matricola con spazi, PDR mancante');

  select count(*) into n_presenti
  from _dedup d join public.rapportino_voci v on v.id = d.voce_id;

  -- Le condizioni sotto cui la rimozione è sicura. Sono le stesse verificate a mano prima di
  -- scrivere il blocco: se anche una sola non regge, la migration si ferma invece di cancellare.
  select count(*) into n_non_sicure
  from _dedup d
  join public.rapportino_voci v on v.id = d.voce_id
  -- `coalesce(..., false)` NON è cosmetico: senza, un NULL dentro la catena di AND (per esempio
  -- una voce che nel frattempo ha perso `intervento_id` — la FK è ON DELETE SET NULL) renderebbe
  -- `not(...)` a sua volta NULL, la riga non verrebbe contata come insicura e la DELETE
  -- procederebbe cancellando un intervento che quella voce non referenzia più. Il NULL qui deve
  -- valere «non lo so», e «non lo so» deve fermare tutto.
  where not coalesce(
        v.manuale
    and coalesce(v.approvazione_stato, '') = 'approvato'
    and v.intervento_id = d.intervento_id
    and v.richiesta_id  = d.richiesta_id
    -- la riga buona del gruppo deve esserci ancora: senza di lei non è un doppione, è l'unica copia
    and exists (select 1 from public.rapportino_voci k where k.id = d.tenuta)
    -- l'intervento non deve essere condiviso: cancellandolo non si sfila lavoro a nessun altro
    and (select count(*) from public.rapportino_voci x  where x.intervento_id = d.intervento_id) = 1
    and (select count(*) from public.interventi_manuali m where m.intervento_id = d.intervento_id) = 1
    -- nessuno punta alla voce come padre di un intervento figlio (task-via)
    and not exists (select 1 from public.interventi_manuali m where m.parent_voce_id = d.voce_id)
    -- niente contabilità a valle già maturata
    and exists (select 1 from public.interventi i
                 where i.id = d.intervento_id and i.consuntivato_at is null)
    -- niente registri di magazzino agganciati: quelle FK sono ON DELETE CASCADE e sparirebbero
    and not exists (select 1 from public.misuratori_rimossi r            where r.intervento_id = d.intervento_id)
    and not exists (select 1 from public.misuratori_riconsegna r         where r.intervento_id = d.intervento_id)
    and not exists (select 1 from public.acqualatina_misuratori_rimossi r where r.intervento_id = d.intervento_id)
    and not exists (select 1 from public.pi_contabilita_righe r          where r.intervento_id = d.intervento_id)
    and not exists (select 1 from public.interventi i where i.riconciliazione_rif_id = d.intervento_id)
    and not exists (select 1 from public.rapportino_righe r where r.voce_id = d.voce_id)
  , false);

  if n_non_sicure > 0 then
    raise exception 'Dedup doppioni: % righe su % non soddisfano più le condizioni di sicurezza (intervento condiviso, consuntivato, registri agganciati o riga da tenere assente). Nessuna cancellazione eseguita.',
      n_non_sicure, n_presenti;
  end if;

  -- Attese alla prima esecuzione: 3 voci, 3 richieste (+6 righe foto in cascata), 3 interventi.
  -- Alla seconda: 0 / 0 / 0, perché _dedup si interseca con ciò che esiste ancora.
  delete from public.rapportino_voci v
   using _dedup d
   where v.id = d.voce_id;
  get diagnostics n_voci = row_count;

  delete from public.interventi_manuali m
   using _dedup d
   where m.id = d.richiesta_id;
  get diagnostics n_richieste = row_count;

  delete from public.interventi i
   using _dedup d
   where i.id = d.intervento_id;
  get diagnostics n_interventi = row_count;

  raise notice 'Dedup doppioni: % voci, % richieste (foto in cascata), % interventi rimossi. Restano APERTI per decisione dell''ufficio: 7edd4414/MTSB032800527167 (righe indistinguibili) e 5a3e7e62/ODL 912350450 (da fondere, non da cancellare). I file Storage delle richieste rimosse vanno ripuliti a mano: i path sono in bak_doppioni_matricola_20260804_foto.',
    n_voci, n_richieste, n_interventi;
end $$;


-- ============================================================================
-- VERIFICHE — da lanciare DOPO, in sola lettura
-- ============================================================================
--
-- V1. Quante voci restano senza azioni proprie, e perché. Atteso dopo la migration:
--     3.022 totali = 268 non risolvibili + 2.594 manuali (escluse di proposito) + 160 gate.
--
-- select count(*) as ancora_vuote,
--        count(*) filter (where v.intervento_id is null)                as senza_intervento,
--        count(*) filter (where v.manuale or v.origine = 'manuale')     as manuali,
--        count(*) filter (where i.gruppo_attivita is null and v.intervento_id is not null) as senza_gruppo
-- from rapportino_voci v
-- left join interventi i on i.id = v.intervento_id
-- where v.campi_snapshot is null
--    or (jsonb_typeof(v.campi_snapshot) = 'array' and jsonb_array_length(v.campi_snapshot) = 0);
--
--
-- V2. Coerenza delle righe toccate: `campi_snapshot` e `template_id` devono essere valorizzati
--     insieme o non esserlo affatto. Una voce con le azioni ma senza modello (o viceversa) è uno
--     stato che nessun lettore sa interpretare. Atteso: 0 e 0.
--
-- select
--   count(*) filter (where v.template_id is null
--                      and v.campi_snapshot is not null
--                      and jsonb_typeof(v.campi_snapshot) = 'array'
--                      and jsonb_array_length(v.campi_snapshot) > 0)  as campi_senza_modello,
--   count(*) filter (where v.template_id is not null
--                      and (v.campi_snapshot is null
--                           or (jsonb_typeof(v.campi_snapshot) = 'array'
--                               and jsonb_array_length(v.campi_snapshot) = 0))) as modello_senza_campi
-- from rapportino_voci v
-- join bak_campi_snapshot_20260804_voci b on b.id = v.id;
--
--
-- V3. Il colore delle voci toccate NON deve essere cambiato. Il modo pratico di verificarlo senza
--     rieseguire la replica: le voci del lotto 1 hanno campi_snapshot IDENTICO a quello del padre
--     (byte per byte), quindi qui l'atteso è 0 righe.
--
-- select count(*) as lotto1_divergenti
-- from rapportino_voci v
-- join bak_campi_snapshot_20260804_voci b on b.id = v.id
-- join rapportini r on r.id = v.rapportino_id
-- where v.template_id = r.template_id
--   and v.campi_snapshot is distinct from r.campi_snapshot;
--
--
-- V4. Le voci il cui modello è cambiato davvero (lotto 2), raggruppate per transizione: è la
--     lista di ciò che l'ufficio vedrà diverso. Atteso: 1.282 righe distribuite su ~16 transizioni,
--     le più grosse IBRIDO ITALGAS/ACEA → LIMITAZIONI/SOSPENSIONI e → ITALGAS.
--
-- select coalesce(tp.nome, '(padre senza modello)') as prima, tv.nome as adesso, count(*) as voci
-- from rapportino_voci v
-- join bak_campi_snapshot_20260804_voci b on b.id = v.id
-- join rapportini r  on r.id = v.rapportino_id
-- join rapportino_template tv on tv.id = v.template_id
-- left join rapportino_template tp on tp.id = r.template_id
-- where v.template_id is distinct from r.template_id
-- group by 1, 2 order by voci desc;
--
--
-- V5. Nessun intervento orfano e nessuna richiesta appesa dopo il dedup. Atteso: 0 e 0.
--     (Il primo conteggio guarda solo gli interventi nati dal "+": un intervento pianificato può
--     legittimamente non avere una voce, uno manuale no.)
--
-- select
--   (select count(*) from interventi i
--     where i.origine = 'manuale'
--       and not exists (select 1 from rapportino_voci v where v.intervento_id = i.id)
--       and not exists (select 1 from interventi_manuali m where m.intervento_id = i.id)) as interventi_orfani,
--   (select count(*) from interventi_manuali m
--     where m.voce_id is not null
--       and not exists (select 1 from rapportino_voci v where v.id = m.voce_id))          as richieste_appese;
--
--
-- V6. I due gruppi lasciati aperti di proposito, per chi deve deciderli. Atteso: 4 righe
--     (2 del rapportino 7edd4414 e 2 del 5a3e7e62).
--
-- select v.rapportino_id, r.staff_name, r.data, v.id as voce_id, v.ordine, v.manuale,
--        v.matricola, v.odl, v.intervento_id,
--        (select count(*) from interventi_manuali_foto f where f.richiesta_id = v.richiesta_id) as foto
-- from rapportino_voci v
-- join rapportini r on r.id = v.rapportino_id
-- where v.rapportino_id in ('7edd4414-9a63-4c2a-b1a1-bdaf66497980',
--                           '5a3e7e62-4670-48ce-8594-451caae680b6')
--   and regexp_replace(upper(coalesce(v.matricola, '')), '[^A-Z0-9]', '', 'g')
--       in ('MTSB032800527167', '17833805')
-- order by v.rapportino_id, v.ordine;
--
--
-- V7. Rollback del backfill, se servisse (NON idempotente, da lanciare una volta sola e a ragion
--     veduta): rimette le voci esattamente come stavano, trigger escluso.
--
-- alter table rapportino_voci disable trigger rapportino_voci_set_updated_at;
-- update rapportino_voci v set campi_snapshot = b.campi_snapshot, template_id = b.template_id
--   from bak_campi_snapshot_20260804_voci b where b.id = v.id;
-- alter table rapportino_voci enable trigger rapportino_voci_set_updated_at;
