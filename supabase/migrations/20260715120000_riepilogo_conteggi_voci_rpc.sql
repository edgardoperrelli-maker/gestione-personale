-- Perf: modulo "Riepilogo rapportini" (/hub/mappa?vista=riepilogo).
-- La route /api/mappa/rapportini/riepilogo scansionava rapportino_voci DUE volte
-- (una per contare le voci, una per contare le foto in sospeso col JSONB `risposte`),
-- paginando a 1000 righe e conteggiando in JS: ~6300 righe trasferite ×2 per una
-- finestra di 30gg → ~4,7s osservati. Questa RPC calcola entrambi i conteggi in
-- UNA passata lato DB (indice idx_voci_rapportino), senza trasferire i JSONB.
--
-- `foto_in_sospeso` replica esattamente la logica di
-- utils/rapportini/fotoInSospeso.ts (contaFotoInSospeso): conta i valori — scalari
-- o elementi di array di primo livello — che sono stringhe con prefisso
-- 'blob-locale:' seguito da almeno un carattere (segnaposto foto non ancora
-- caricata). Validata su dati reali: 0 righe discordanti vs l'implementazione JS.

create or replace function public.riepilogo_conteggi_voci(rap_ids uuid[])
returns table (rapportino_id uuid, n_voci bigint, foto_in_sospeso bigint)
language sql
stable
set search_path = ''
as $$
  select
    v.rapportino_id,
    count(*)::bigint as n_voci,
    coalesce(sum(
      -- valori scalari string che sono segnaposto
      (select count(*)
         from jsonb_each(coalesce(v.risposte, '{}'::jsonb)) as e(k, val)
         where jsonb_typeof(val) = 'string'
           and (val #>> '{}') like 'blob-locale:_%')
      -- elementi string di array di primo livello che sono segnaposto
      + (select count(*)
           from jsonb_each(coalesce(v.risposte, '{}'::jsonb)) as e(k, val)
           cross join lateral jsonb_array_elements(val) as ae(elem)
           where jsonb_typeof(val) = 'array'
             and jsonb_typeof(elem) = 'string'
             and (elem #>> '{}') like 'blob-locale:_%')
    ), 0)::bigint as foto_in_sospeso
  from public.rapportino_voci v
  where v.rapportino_id = any(rap_ids)
  group by v.rapportino_id;
$$;

grant execute on function public.riepilogo_conteggi_voci(uuid[]) to authenticated, service_role;
