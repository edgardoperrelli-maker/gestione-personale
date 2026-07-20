-- Invariante: un ODL con esito POSITIVO è definitivamente chiuso.
-- Un positivo non può ripetersi (né lo stesso giorno né nei giorni successivi) e dopo un
-- positivo l'ODL non è rilavorabile nemmeno come negativo; solo dopo un esito negativo la
-- riassegnazione resta permessa. Enforcement applicativo in lib/interventi/odlPositivi.ts
-- (pianificazione, generazione voci, chiusure); qui: bonifica dei dati storici + indice
-- unico parziale come garanzia finale a DB.

-- ─────────────────────────────────────────────────────────────
-- 1) Bonifica doppioni positivi: per ogni (committente, odl) con più righe
--    esito='eseguito_positivo' resta valido il PRIMO (chiuso_at/created_at più vecchio);
--    i successivi vengono annullati con motivazione e finiscono nella lista di
--    riconciliazione (/hub/interventi) con riferimento all'originale.
-- ─────────────────────────────────────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by committente, odl
           order by coalesce(chiuso_at, created_at) asc, created_at asc, id asc
         ) as rn,
         first_value(id) over (
           partition by committente, odl
           order by coalesce(chiuso_at, created_at) asc, created_at asc, id asc
         ) as primo_id,
         first_value(data) over (
           partition by committente, odl
           order by coalesce(chiuso_at, created_at) asc, created_at asc, id asc
         ) as primo_data
  from interventi
  where esito = 'eseguito_positivo' and odl is not null and btrim(odl) <> ''
)
update interventi i
set stato = 'annullato',
    esito = null,
    esito_motivo = 'DOPPIO POSITIVO (bonifica): ODL già eseguito positivo il '
                   || to_char(r.primo_data, 'DD/MM/YYYY'),
    da_riconciliare = true,
    riconciliazione_rif_id = r.primo_id
from ranked r
where r.id = i.id and r.rn > 1;

-- ─────────────────────────────────────────────────────────────
-- 1-bis) Interventi già ANNULLATI la cui voce di rapportino è compilata SI mentre l'ODL ha
--        il positivo su un ALTRO intervento (doppio positivo storico "sommerso"): vengono
--        portati in lista riconciliazione con riferimento all'originale. Nessun cambio di
--        stato: restano annullati.
-- ─────────────────────────────────────────────────────────────
with primi as (
  select distinct on (committente, odl) committente, odl, id as primo_id, data as primo_data
  from interventi
  where esito = 'eseguito_positivo' and odl is not null and btrim(odl) <> ''
  order by committente, odl, coalesce(chiuso_at, created_at) asc, created_at asc, id asc
)
update interventi i
set da_riconciliare = true,
    riconciliazione_rif_id = p.primo_id,
    esito_motivo = coalesce(nullif(i.esito_motivo, ''),
                            'DOPPIO POSITIVO (bonifica): ODL già eseguito positivo il '
                            || to_char(p.primo_data, 'DD/MM/YYYY'))
from primi p
where p.committente = i.committente
  and p.odl = i.odl
  and p.primo_id <> i.id
  and i.stato = 'annullato'
  and coalesce(i.da_riconciliare, false) = false
  and exists (
    select 1 from rapportino_voci v
    where v.intervento_id = i.id
      and lower(btrim(coalesce(v.risposte->>'eseguito', ''))) in ('si','sì','true','x','1','vero','y','yes','✓')
  );

-- ─────────────────────────────────────────────────────────────
-- 2) Interventi ancora APERTI (non terminali) su un ODL già positivo: la ripianificazione
--    non doveva avvenire → annullati, così non compaiono più in torre/agenda e non possono
--    essere lavorati di nuovo. Nessun flag riconciliazione: non c'è lavoro svolto.
-- ─────────────────────────────────────────────────────────────
update interventi i
set stato = 'annullato',
    esito_motivo = 'ODL già eseguito positivo: ripianificazione annullata (bonifica)'
from interventi p
where p.esito = 'eseguito_positivo'
  and p.odl is not null and btrim(p.odl) <> ''
  and i.committente = p.committente
  and i.odl = p.odl
  and i.id <> p.id
  and i.stato not in ('completato', 'annullato');

-- ─────────────────────────────────────────────────────────────
-- 3) Voci di rapportino NON compilate (risposte vuote, non manuali) di OGGI o future su un
--    ODL già positivo: eliminate, così il lavoro non viene riproposto all'operatore.
--    Le voci compilate non si toccano mai (registro di lavoro reale).
-- ─────────────────────────────────────────────────────────────
delete from rapportino_voci v
using rapportini r
where r.id = v.rapportino_id
  and v.manuale = false
  and coalesce(v.risposte, '{}'::jsonb) = '{}'::jsonb
  and r.data >= current_date
  and v.odl is not null and btrim(v.odl) <> ''
  and exists (
    select 1 from interventi p
    where p.esito = 'eseguito_positivo'
      and p.odl = v.odl
      and (v.intervento_id is null or p.id <> v.intervento_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 4) Doppioni di voce nello STESSO rapportino: stesso ODL, stesso esito compilato
--    (es. task duplicato da import file + template) → resta la prima voce (per ordine),
--    le copie identiche vengono eliminate. Voci con esiti divergenti NON si toccano.
-- ─────────────────────────────────────────────────────────────
with dup as (
  select v.id,
         row_number() over (
           partition by v.rapportino_id, btrim(v.odl), lower(coalesce(v.risposte->>'eseguito', ''))
           order by v.ordine asc, v.id asc
         ) as rn
  from rapportino_voci v
  where v.manuale = false
    and v.odl is not null and btrim(v.odl) <> ''
    and lower(coalesce(v.risposte->>'eseguito', '')) <> ''
)
delete from rapportino_voci v
using dup
where dup.id = v.id and dup.rn > 1;

-- ─────────────────────────────────────────────────────────────
-- 5) Garanzia a DB: mai due interventi positivi per lo stesso (committente, odl),
--    su qualsiasi data. L'indice esistente interventi_dedup_idx resta a coprire il
--    vincolo per-giorno; questo copre il doppio positivo cross-data.
-- ─────────────────────────────────────────────────────────────
create unique index if not exists interventi_odl_positivo_unico_idx
  on interventi (committente, odl)
  where esito = 'eseguito_positivo' and odl is not null and btrim(odl) <> '';
