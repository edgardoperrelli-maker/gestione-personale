-- Allineamento dello storico interventi alla tassonomia (completa l'uniformazione).
--
-- Per ogni intervento la cui attività è riconosciuta a catalogo:
--   - intervento_tipo → forma canonica (fine varianti maiuscole/accento);
--   - gruppo_attivita → gruppo di catalogo (colma i null);
--   - committente → quello corretto SOLO per le righe mis-filed (attività
--     italgas salvate sotto 'acea'/'altro'), risolvendo come fa l'app
--     (committente proprio prima, poi l'altro — stessa semantica di
--     risolviGruppo('altro')).
--
-- NON tocca il committente 'lim_massive': è un marcatore di canale
-- volutamente distinto (usato da exportLimMassive e dagli esclusori
-- acea-preassegnati/assegnazioni); committenteEquivalente lo tratta già come
-- acea dove serve. Le sue righe massive sono già canoniche (migration
-- 20260722140000) e restano invariate.
--
-- Sicurezza (verificata sui dati live):
--   - nessuna riga ESCE da DUNNING; UNA sola vi ENTRA — 'Sostituzione
--     saracinesca o valvola' (ODL 957358129), che è attività DUNNING a
--     catalogo col gruppo semplicemente non persistito: correzione, non falso;
--   - la norma (attivita_norm) non cambia per le righe già a catalogo, quindi
--     voce, produzione economica (acea_attivita_alias) ed esiti restano stabili;
--   - i 2 singleton (apostrofo iniziale, S-AI-049 nudo) hanno voce NULL.
-- Reversibile: backup completo in bak_allinea_tassonomia_20260722.

-- ---------------------------------------------------------------------------
-- 1) Backup delle righe che cambiano
-- ---------------------------------------------------------------------------
create table if not exists public.bak_allinea_tassonomia_20260722 as
with base as (
  select i.id, i.committente, i.intervento_tipo, i.gruppo_attivita, i.voce, i.stato, i.updated_at,
    public.attivita_norm(coalesce(i.intervento_tipo,'')) as norm,
    lower(trim(coalesce(i.committente,''))) as comm_raw,
    case when lower(trim(coalesce(i.committente,'')))='lim_massive' then 'acea' else lower(trim(coalesce(i.committente,''))) end as comm_eq
  from public.interventi i
),
tgt as (
  select b.*,
    (select tt.descrizione from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as descr_t,
    (select tt.gruppo      from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as gruppo_t,
    (select tt.committente from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as comm_t,
    exists(select 1 from public.attivita_tassonomia s where s.attivo and s.committente=b.comm_eq and s.descrizione_norm=b.norm) as own_match
  from base b
)
select id, committente, intervento_tipo, gruppo_attivita, voce, stato, updated_at
from tgt
where (descr_t is not null and (
         intervento_tipo is distinct from descr_t
         or gruppo_attivita is distinct from gruppo_t
         or (comm_raw <> 'lim_massive' and not own_match and committente is distinct from comm_t)
      ))
   or norm in ('''UT MOROSITA'' PRIMO PASSAGGIO','S-AI-049');

-- ---------------------------------------------------------------------------
-- 2) Allineamento generale (canonica + gruppo + committente-se-errato)
-- ---------------------------------------------------------------------------
with base as (
  select i.id,
    public.attivita_norm(coalesce(i.intervento_tipo,'')) as norm,
    lower(trim(coalesce(i.committente,''))) as comm_raw,
    case when lower(trim(coalesce(i.committente,'')))='lim_massive' then 'acea' else lower(trim(coalesce(i.committente,''))) end as comm_eq,
    i.committente as committente_cur, i.intervento_tipo as tipo_cur, i.gruppo_attivita as gruppo_cur
  from public.interventi i
),
tgt as (
  select b.*,
    (select tt.descrizione from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as descr_t,
    (select tt.gruppo      from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as gruppo_t,
    (select tt.committente from public.attivita_tassonomia tt where tt.attivo and tt.committente in ('acea','italgas') and tt.descrizione_norm=b.norm order by case when tt.committente=b.comm_eq then 0 else 1 end limit 1) as comm_t,
    exists(select 1 from public.attivita_tassonomia s where s.attivo and s.committente=b.comm_eq and s.descrizione_norm=b.norm) as own_match
  from base b
)
update public.interventi i
set intervento_tipo = t.descr_t,
    gruppo_attivita = t.gruppo_t,
    committente = case when t.comm_raw <> 'lim_massive' and not t.own_match then t.comm_t else i.committente end,
    updated_at = now()
from tgt t
where t.id = i.id
  and t.descr_t is not null
  and ( t.tipo_cur is distinct from t.descr_t
        or t.gruppo_cur is distinct from t.gruppo_t
        or (t.comm_raw <> 'lim_massive' and not t.own_match and t.committente_cur is distinct from t.comm_t) );

-- ---------------------------------------------------------------------------
-- 3) Singleton non risolvibili con match diretto (voce NULL, verificato)
-- ---------------------------------------------------------------------------
-- Apostrofo iniziale (alias di scrittura già presente per i futuri import).
update public.interventi
set intervento_tipo = 'UT MOROSITA'' PRIMO PASSAGGIO',
    gruppo_attivita = 'ATTIVITA'' ALLA CLIENTELA',
    updated_at = now()
where public.attivita_norm(intervento_tipo) = '''UT MOROSITA'' PRIMO PASSAGGIO';

-- Codice ATLAS nudo → forma lunga di catalogo (committente corretto: italgas).
update public.interventi
set committente = 'italgas',
    intervento_tipo = 'S-AI-049 - Verifica misuratore in campo',
    gruppo_attivita = 'ATTIVITA'' ALLA CLIENTELA',
    updated_at = now()
where public.attivita_norm(intervento_tipo) = 'S-AI-049';
