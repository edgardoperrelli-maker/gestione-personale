-- L'IMPIANTO entra nel master, e da lì si riversa da solo sugli ordini che ne sono privi.
--
-- Il buco: `template_master_righe` non ha mai avuto una colonna impianto e
-- `parseMasterUpload` non ha mai avuto un pattern per riconoscerla. Il master AcquaLatina
-- «Luglio» (4.196 righe) è quindi entrato SENZA impianti — verificato: dei due impianti noti
-- dal file dell'ufficio (19633002, 74278859) non c'è traccia in nessuna tabella del progetto.
-- Non è un problema di join: il dato è stato scartato al caricamento e non è mai arrivato.
--
-- Su AcquaLatina l'impianto vive in `interventi.pdr` / `rapportino_voci.pdr` — è lo stesso
-- slot, la UI lo etichetta «PDR / impianto». Con la colonna qui sotto, ricaricare il file
-- master diventa l'unico gesto necessario: la funzione allinea gli ordini che hanno il
-- campo VUOTO, senza che nessuno debba più mandare liste a mano.

alter table template_master_righe add column if not exists impianto text;

comment on column template_master_righe.impianto is
  'Codice impianto/PDR della riga master. Su AcquaLatina è il numero di punto del '
  'committente e alimenta interventi.pdr via allinea_impianti_da_master().';

-- ─── Allineamento automatico degli ordini dal master ────────────────────────
-- Chiamata dal POST di /api/admin/interventi/template-master subito dopo l'insert delle
-- righe: il caricamento del master È l'evento che porta il dato, quindi è lì che va
-- consumato. Fuori da quel percorso non serve a nessuno.
--
-- Tre garanzie, tutte volute:
--   1. NON SOVRASCRIVE. Filtra `coalesce(pdr,'') = ''`, quindi un impianto già presente —
--      arrivato dalla pianificazione o corretto a mano in ufficio — non viene toccato da
--      un ricaricamento del master. Ricaricare un file è un'operazione normale di back
--      office e non deve poter danneggiare dati buoni.
--   2. RESTA NEL COMMITTENTE del master. Gli ODL sono numerici e a otto cifre su più
--      committenti: senza questo filtro un master AcquaLatina potrebbe scrivere su un
--      ordine ACEA omonimo.
--   3. SALTA GLI ODL AMBIGUI. `having count(distinct impianto) = 1`: se il file associa
--      allo stesso ODL due impianti diversi, il dato è rotto e va sistemato in ufficio,
--      non indovinato qui (stesso criterio dell'esito 'ambiguo' di `lookupMaster`).
--
-- Master spento (`attivo=false`) = fuori dal lookup: nessun allineamento, come per il
-- censimento (vedi `masterAttivi` in lib/acqualatina/censimentoMaster.ts).
--
-- `raw_json` della voce si muove con la colonna: è lo specchio della riga di
-- pianificazione, e lasciarlo indietro creerebbe due verità sullo stesso campo (stessa
-- regola delle bonifiche 20260731100000 e 20260730 su `bak_odl_impianto_*`).
create or replace function public.allinea_impianti_da_master(p_master_id uuid)
returns table (interventi_aggiornati integer, voci_aggiornate integer)
language plpgsql
as $$
declare
  v_committente text;
  n_int  integer := 0;
  n_voci integer := 0;
begin
  select m.committente into v_committente
  from public.template_master m
  where m.id = p_master_id and m.attivo;

  if v_committente is null then
    return query select 0, 0;
    return;
  end if;

  with coppie as (
    select r.odl, min(r.impianto) as impianto
    from public.template_master_righe r
    where r.master_id = p_master_id and coalesce(r.impianto, '') <> ''
    group by r.odl
    having count(distinct r.impianto) = 1
  ), agg as (
    update public.interventi i
    set pdr = c.impianto,
        updated_at = now()
    from coppie c
    where i.odl = c.odl
      and i.committente = v_committente
      and coalesce(i.pdr, '') = ''
    returning 1
  )
  select count(*)::integer into n_int from agg;

  with coppie as (
    select r.odl, min(r.impianto) as impianto
    from public.template_master_righe r
    where r.master_id = p_master_id and coalesce(r.impianto, '') <> ''
    group by r.odl
    having count(distinct r.impianto) = 1
  ), agg as (
    update public.rapportino_voci v
    set pdr = c.impianto,
        raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{pdr}', to_jsonb(c.impianto)),
        updated_at = now()
    from public.interventi i, coppie c
    where v.intervento_id = i.id
      and i.odl = c.odl
      and i.committente = v_committente
      and coalesce(v.pdr, '') = ''
    returning 1
  )
  select count(*)::integer into n_voci from agg;

  return query select n_int, n_voci;
end;
$$;

-- La funzione SCRIVE su interventi e rapportino_voci: eseguibile solo dal service role
-- (l'API admin passa da supabaseAdmin). `execute` è concesso a PUBLIC per default in
-- Postgres: va revocato esplicitamente, come per i privilegi di tabella (20260727090500).
revoke all on function public.allinea_impianti_da_master(uuid) from public, anon, authenticated;
grant execute on function public.allinea_impianti_da_master(uuid) to service_role;
