-- ============================================================================
-- Adozione una-tantum dei piani commessa rimasti fermi.
-- ============================================================================
--
-- IL BUCO. L'adozione (§5b di sincronizzaRapportiniAcea) sana un piano solo quando qualcuno
-- preme «Genera rapportini» per quel giorno, e — fino al fix che viaggia con questa migration —
-- solo per gli operatori DENTRO la selezione. Risultato osservato in produzione il 04/08:
-- sul contenitore ACQUA LATINA la generazione mirata su PASTORELLI ha adottato lui (riga
-- operatore + 32 piano_id) e ha lasciato LIBERATORI con 38 interventi a piano_id NULL e
-- nessuna riga in mappa_piani_operatori: invisibile nella vista pianifica, rapportino esposto
-- a orphanRapportini alla prima rigenerazione. Stessa condizione sui contenitori ACEA del
-- 04/08 (3 rapportini, 0 righe) e del 05/08 (4 rapportini, 0 righe).
--
-- Il codice nuovo adotta TUTTI gli operatori del giorno a ogni generazione — ma per i giorni
-- già consegnati nessuno rigenererà mai. Questa migration fa una volta sola, in SQL, quello che
-- l'adozione avrebbe fatto: per ogni rapportino che punta a un piano commessa (territorio
-- 'ACQUA LATINA' o 'ACEA') il cui operatore non ha la riga,
--   1. backfill di interventi.piano_id (SOLO dove NULL) verso il piano del rapportino;
--   2. backfill di interventi.territorio_id (SOLO dove NULL) dal territorio omonimo;
--   3. riga operatore con i task acea:* nella STESSA forma di interventoToTask
--      (lib/acea/pianoCommessa.ts) — esclusi annullati, origine='manuale' (parità col motore
--      Excel: il lavoro dal "+" non è un task) e created_from_mappa=true;
--   4. nota-sentinella «Contenitore…» azzerata.
--
-- I task costruiti qui sono comunque provvisori nel senso buono: alla prossima generazione del
-- giorno il motore riscrive i task acea:* da zero (sincronizzaOperatorePiano), quindi ogni
-- divergenza residua di ordinamento si riassorbe da sola. Le righe operatore ESISTENTI non si
-- toccano: PASTORELLI e PRATESI restano come sono.
--
-- IDEMPOTENTE: gli update filtrano su NULL, gli insert su «riga mancante», la nota su «è la
-- sentinella». Il backup fotografa il PRIMA la prima volta e non viene ricreato.
-- ============================================================================


-- ─── BACKUP ─────────────────────────────────────────────────────────────────
create table if not exists public.bak_adozione_20260804_interventi as
select i.id, i.piano_id, i.territorio_id
from public.interventi i
where i.piano_id is null
  and i.committente in ('acqualatina', 'acea', 'lim_massive')
  and i.staff_id is not null;

alter table public.bak_adozione_20260804_interventi enable row level security;


do $$
declare
  n_piano int; n_terr int; n_righe int; n_note int;
begin
  -- Le coppie (rapportino, piano commessa) il cui operatore non ha la riga: il perimetro.
  create temporary table _adozioni on commit drop as
  select distinct r.staff_id, r.data, p.id as piano_id, upper(p.territorio) as territorio
  from public.rapportini r
  join public.mappa_piani p on p.id = r.piano_id
  where upper(p.territorio) in ('ACQUA LATINA', 'ACEA')
    and not exists (select 1 from public.mappa_piani_operatori o
                     where o.piano_id = p.id and o.staff_id = r.staff_id);

  -- 1. piano_id sugli interventi del giorno di quegli operatori (solo NULL, solo commessa).
  update public.interventi i
     set piano_id = a.piano_id
  from _adozioni a
  where i.staff_id = a.staff_id
    and i.data = a.data
    and i.piano_id is null
    and i.stato is distinct from 'annullato'
    and i.committente in ('acqualatina', 'acea', 'lim_massive');
  get diagnostics n_piano = row_count;

  -- 2. territorio_id dal territorio omonimo del piano (solo NULL).
  update public.interventi i
     set territorio_id = t.id
  from _adozioni a
  join public.territories t on upper(t.name) = a.territorio
  where i.staff_id = a.staff_id
    and i.data = a.data
    and i.piano_id = a.piano_id
    and i.territorio_id is null;
  get diagnostics n_terr = row_count;

  -- 3. La riga operatore, con i task nella forma di interventoToTask: jsonb_strip_nulls
  --    omette le chiavi NULL esattamente come `?? undefined` le omette dal JSON del motore;
  --    le chiavi con default '' (odl, indirizzo, cap, citta, fascia_oraria) restano stringhe.
  insert into public.mappa_piani_operatori
    (piano_id, staff_id, staff_name, colore, km, task_count, start_address, tasks, polyline)
  select a.piano_id, a.staff_id,
         coalesce(s.display_name, a.staff_id::text),
         '#2563EB', 0,
         coalesce(tk.n, 0), null,
         coalesce(tk.tasks, '[]'::jsonb), '[]'::jsonb
  from _adozioni a
  left join public.staff s on s.id::text = a.staff_id
  left join lateral (
    select count(*) as n,
           jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'id',            'acea:' || i.id,
               'odl',           btrim(coalesce(i.odl, '')),
               'pdr',           i.pdr,
               'indirizzo',     coalesce(i.indirizzo, ''),
               'cap',           coalesce(i.cap, ''),
               'citta',         coalesce(i.comune, ''),
               'priorita',      0,
               'fascia_oraria', coalesce(i.fascia_oraria, ''),
               'nominativo',    i.nominativo,
               'matricola',     i.matricola_contatore,
               'calibro',       i.diametro,
               'recapito',      i.recapito,
               'attivita',      i.intervento_tipo,
               'committente',   i.committente
             ))
             order by btrim(coalesce(i.odl, '')), coalesce(i.matricola_contatore, ''), i.id
           ) as tasks
    from public.interventi i
    where i.piano_id = a.piano_id
      and i.staff_id = a.staff_id
      and i.stato is distinct from 'annullato'
      and coalesce(i.origine, '') <> 'manuale'
      and i.created_from_mappa is distinct from true
  ) tk on true;
  get diagnostics n_righe = row_count;

  -- 4. La nota-sentinella non descrive più il piano: ora ha operatori veri.
  update public.mappa_piani p
     set note = null
  where p.id in (select piano_id from _adozioni)
    and p.note like 'Contenitore%';
  get diagnostics n_note = row_count;

  raise notice 'Adozione contenitori fermi: % interventi agganciati, % territori, % righe operatore, % note azzerate.',
    n_piano, n_terr, n_righe, n_note;
end $$;
