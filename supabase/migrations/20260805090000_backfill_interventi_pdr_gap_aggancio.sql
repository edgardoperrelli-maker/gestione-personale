-- ============================================================================
-- MODULO ACQUA LATINA — il PDR/impianto mancante sugli interventi già agganciati
-- ============================================================================
-- Segnalazione: dall'estrazione ESECUZIONI del committente, interventi acqualatina già
-- eseguiti (molti COMPLETATI) risultano senza «impianto» (= `interventi.pdr`), pur avendo
-- il dato correttamente valorizzato su `acqualatina_ordini.impianto`.
--
-- Root cause, in due parti:
--
--  1. TIMING. Il backfill una tantum del 02/08 (20260802140000) ha riempito `interventi.pdr`
--     da `acqualatina_ordini.impianto` per JOIN su `ordine_id` — ma in quel momento centinaia
--     di interventi avevano ancora `ordine_id = NULL`, perché la FK errata (corretta due ore
--     dopo con 20260802120000) e il meccanismo che ripara gli agganci orfani
--     (`agganciPerOdl`/`riconciliaChiusureAcqualatina`, arrivato solo il 04/08) non esistevano
--     ancora. Quel backfill non poteva raggiungerli: `ordine_id` era NULL, quindi il JOIN non
--     produceva nessuna riga da aggiornare.
--
--  2. BUG. Il codice che ripara l'aggancio mancante (`ordine_id`) sugli interventi «sciolti»
--     scrive SOLO `ordine_id` — non ha MAI portato dietro l'anagrafica (pdr, nominativo,
--     recapito, indirizzo, comune, cap, matricola). Da qui in poi lo fa (vedi
--     `lib/acqualatina/chiusuraRegistro.ts` — `patchAggancioAnagrafica` — e
--     `lib/acqualatina/riconciliaRegistro.ts`), ma le righe agganciate PRIMA di questo fix
--     sono rimaste con `ordine_id` corretto e `pdr` ancora vuoto: nessun meccanismo le
--     avrebbe più toccate, perché la propagazione del sync (`ordini/sync/route.ts`) parte da
--     una CORREZIONE rilevata in quel giro, non da «riempi ciò che manca».
--
-- Questo backfill ripete lo stesso gesto di 20260802140000, oggi: ora che la riconciliazione
-- ha riparato molti più `ordine_id` nel frattempo, raggiunge le righe che allora restavano
-- fuori. Vale ANCHE per i completati/annullati (a differenza della propagazione del sync, che
-- li esclude apposta): qui non si sta correggendo un valore già scritto — si sta riempiendo un
-- vuoto che non ha mai avuto una fotografia, quindi non c'è niente da falsificare.
--
-- `coalesce(...) = ''` in ogni ramo: un dato già presente (da qualunque percorso sia arrivato)
-- non si sovrascrive mai.

-- ─── 1. interventi: il "primo scatto" per le righe rimaste indietro ─────────
update public.interventi i
set pdr = o.impianto,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.impianto, '') <> ''
  and coalesce(i.pdr, '') = '';

update public.interventi i
set nominativo = o.nominativo,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.nominativo, '') <> ''
  and coalesce(i.nominativo, '') = '';

update public.interventi i
set recapito = o.recapito,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.recapito, '') <> ''
  and coalesce(i.recapito, '') = '';

update public.interventi i
set indirizzo = nullif(trim(both ' ' from coalesce(o.via, '') || ' ' || coalesce(o.civico, '')), ''),
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and (coalesce(o.via, '') <> '' or coalesce(o.civico, '') <> '')
  and coalesce(i.indirizzo, '') = '';

update public.interventi i
set comune = o.comune,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.comune, '') <> ''
  and coalesce(i.comune, '') = '';

update public.interventi i
set cap = o.cap,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.cap, '') <> ''
  and coalesce(i.cap, '') = '';

update public.interventi i
set matricola_contatore = o.matricola,
    updated_at = now()
from public.acqualatina_ordini o
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(o.matricola, '') <> ''
  and coalesce(i.matricola_contatore, '') = '';

-- ─── 2. rapportino_voci: l'estrazione Storico legge da qui, non da interventi ───
-- Stesso criterio di 20260731120000 (`allinea_impianti_da_master`) e di 20260802140000: si
-- riempie solo il vuoto, e `raw_json` si muove con la colonna perché è lo specchio della riga.
update public.rapportino_voci v
set pdr = i.pdr,
    raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{pdr}', to_jsonb(i.pdr)),
    updated_at = now()
from public.interventi i
where v.intervento_id = i.id
  and i.committente = 'acqualatina'
  and coalesce(i.pdr, '') <> ''
  and coalesce(v.pdr, '') = '';

update public.rapportino_voci v
set nominativo = i.nominativo,
    raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{nominativo}', to_jsonb(i.nominativo)),
    updated_at = now()
from public.interventi i
where v.intervento_id = i.id
  and i.committente = 'acqualatina'
  and coalesce(i.nominativo, '') <> ''
  and coalesce(v.nominativo, '') = '';

update public.rapportino_voci v
set recapito = i.recapito,
    raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{recapito}', to_jsonb(i.recapito)),
    updated_at = now()
from public.interventi i
where v.intervento_id = i.id
  and i.committente = 'acqualatina'
  and coalesce(i.recapito, '') <> ''
  and coalesce(v.recapito, '') = '';
