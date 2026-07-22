-- Re-divisione dello STORAGE delle famiglie di codici italgas (annulla il collasso
-- storage di #159 / 20260722190000). Il dettaglio serve all'import dal file del
-- committente (che contiene S-PR-003 A, S-PR-003 B, …) e all'export/riconciliazione;
-- la UI mostrerà comunque il codice nudo unificato tramite un helper di sola
-- visualizzazione (attivitaUnificataDisplay). Gli alias ATLAS tornano di sola lettura,
-- quindi i nuovi import MEMORIZZANO il dettaglio.
--
-- Reversibile: backup dello stato attuale (collassato) in bak_ridividi_int_20260722;
-- ripristino dai backup del collasso (bak_collassa_codici_cat_/int_20260722).

-- 0) Backup dello stato attuale (collassato) per reversibilità di questa migration
create table if not exists public.bak_ridividi_int_20260722 as
select id, committente, intervento_tipo, gruppo_attivita, updated_at
from public.interventi
where id in (select id from public.bak_collassa_codici_int_20260722);

-- 1) Riattiva a catalogo le varianti (stato pre-#159). Le canoniche nude sintetizzate
--    in #159 (S-PR-019, S-MR-003) restano attive: servono da canonica di lettura/display
--    per la risoluzione (Performance) delle rispettive varianti.
update public.attivita_tassonomia t
set attivo = b.attivo
from public.bak_collassa_codici_cat_20260722 b
where t.id = b.id;

-- 2) Ripristina il dettaglio negli interventi (tipo/gruppo/committente originali)
update public.interventi i
set intervento_tipo = b.intervento_tipo,
    gruppo_attivita = b.gruppo_attivita,
    committente = b.committente,
    updated_at = now()
from public.bak_collassa_codici_int_20260722 b
where i.id = b.id
  and i.intervento_tipo is distinct from b.intervento_tipo;
