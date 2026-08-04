-- supabase/migrations/20260804090000_acea_attivita_da_import.sql
-- Riallineamento una-tantum di `interventi.intervento_tipo` all'attività che l'ordine ha OGGI
-- nell'export del Cruscotto ACEA (`acea_ordini.attivita` = "Operazione testo breve").
--
-- IL CASO. `intervento_tipo` fotografa il testo che l'attività aveva sulla mappa il giorno della
-- pianificazione, e lì resta: la rigenerazione del piano preserva gli interventi in stato
-- terminale e non ha un ramo di UPDATE (planInterventiForPiano / ensureInterventiForPiano).
-- Ma l'ordine cambia — il cliente moroso paga, ACEA riapre l'ODL e la rimozione misuratore
-- diventa una riattivazione fornitura — e da noi resta scritta la rimozione.
--
-- Non è un'etichetta: il registro «Misuratori Rimossi» decide su questo campo (isRimozioneTipo).
-- Il primo Ricalcola del motore condiviso, il 03/08, ha così portato a magazzino 5 riaperture
-- con la matricola di contatori mai staccati — impianti 4000551740, 4003925044, 4000145731,
-- 4003852681, 4004372214, tutte con `riapertura = true` sull'ordine.
--
-- Da qui in avanti lo fa l'import stesso (app/api/acea/import, passo 5-quater, logica pura in
-- lib/acea/attivitaDaImport.ts): questa migration recupera il pregresso con le STESSE regole.
--
--   • solo `committente = 'acea'`. `lim_massive` è un CANALE, non il catalogo DUNNING: la sua
--     canonica unica è una scelta deliberata (migration 20260722140000) e nell'export gli stessi
--     ODL portano il testo dell'ordine tecnico — riallinearli spezzerebbe il gruppo del modulo
--     su 86 interventi già lavorati. Stessa esclusione del backfill di tassonomia (spec §4.5);
--   • solo ODL le cui operazioni nel file DICONO LA STESSA COSA: con due attività diverse non
--     si sa quale riguardi la nostra uscita, e non si indovina;
--   • si scrive la forma CANONICA di tassonomia, mai il testo grezzo — con gli alias di
--     scrittura di aliasAttivita.ts (famiglia massive) applicati prima del lookup;
--   • `esito`, `matricola_contatore` e `voce` non si toccano: quelli li scrive chi è andato
--     sul posto, non SAP.
--
-- Reversibile: il backup è anche l'ELENCO delle modifiche, e ogni passo lo rilegge invece di
-- ricalcolare la selezione. Rilanciare la migration non ricalcola niente e non tocca niente.

-- ---------------------------------------------------------------------------
-- 1) Le righe da cambiare, con il prima e il dopo (backup + piano di lavoro)
-- ---------------------------------------------------------------------------
create table if not exists public.bak_attivita_da_import_20260804_int as
with norm as (
  select
    odl,
    -- alias di SCRITTURA, gli stessi di lib/attivita/aliasAttivita.ts
    case public.attivita_norm(attivita)
      when 'LIMITAZIONE MASSIVA'             then 'LIMITAZIONI MASSIVE'
      when 'LIMITAZIONE MASSIVA SU IMPIANTO' then 'LIMITAZIONI MASSIVE'
      when 'LIMITAZIONI MASSICE'             then 'LIMITAZIONI MASSIVE'
      else public.attivita_norm(attivita)
    end as chiave
  from public.acea_ordini
  where public.attivita_norm(attivita) <> ''
),
-- Un'attività sola per ordine: `min = max` è il modo SQL di dire "il file non si contraddice".
univoci as (
  select odl, min(chiave) as chiave from norm group by odl having min(chiave) = max(chiave)
),
attivita_odl as (
  select u.odl, t.descrizione, t.gruppo
  from univoci u
  join public.attivita_tassonomia t
    on t.committente = 'acea' and t.descrizione_norm = u.chiave and t.attivo
)
select i.id, i.committente, i.odl, i.pdr, i.data, i.esito, i.stato,
       i.intervento_tipo, i.gruppo_attivita, i.voce, i.updated_at,
       a.descrizione as tipo_nuovo, a.gruppo as gruppo_nuovo
from public.interventi i
join attivita_odl a on a.odl = i.odl
where i.committente = 'acea'
  and (i.intervento_tipo is distinct from a.descrizione
       or i.gruppo_attivita is distinct from a.gruppo);

-- ---------------------------------------------------------------------------
-- 2) Riallineamento, letto dal piano di lavoro qui sopra
-- ---------------------------------------------------------------------------
update public.interventi i
set intervento_tipo = b.tipo_nuovo,
    gruppo_attivita = b.gruppo_nuovo,
    updated_at = now()
from public.bak_attivita_da_import_20260804_int b
where b.id = i.id
  and (i.intervento_tipo is distinct from b.tipo_nuovo
       or i.gruppo_attivita is distinct from b.gruppo_nuovo);

-- ---------------------------------------------------------------------------
-- 3) Registro Misuratori Rimossi: escono le righe il cui intervento non è più
--    una rimozione. È il passo 1 del Ricalcola (righeMisuratoriDaRimuovere),
--    fatto qui perché il registro è derivato e non si riallinea da solo.
--
--    Il predicato è la trascrizione di `isRimozioneTipo`:
--      • esclusione ABUSIVO prima di tutto (mai a magazzino);
--      • \brimoz  → "rimozione"/"rimozioni";
--      • \brim\b  → l'abbreviazione ACEA "Rim Mis/Mod radio…".
--    In POSIX i \b si scrivono con le classi: (^|[^A-Z]) e ([^A-Z]|$) sulla forma
--    normalizzata (maiuscola, senza accenti).
--
--    Come nel motore, si esce A PRESCINDERE dallo stato logistico. Nessun guardrail
--    "insieme vuoto" serve qui: si cancella per id, non per differenza di insiemi.
-- ---------------------------------------------------------------------------
create table if not exists public.bak_attivita_da_import_20260804_reg as
select m.*
from public.misuratori_rimossi m
join public.interventi i on i.id = m.intervento_id
where public.attivita_norm(coalesce(i.intervento_tipo, '')) ~ 'ABUSIV'
   or not (public.attivita_norm(coalesce(i.intervento_tipo, ''))
           ~ '(^|[^A-Z])RIMOZ|(^|[^A-Z])RIM([^A-Z]|$)');

delete from public.misuratori_rimossi m
using public.bak_attivita_da_import_20260804_reg b
where b.id = m.id;

-- ---------------------------------------------------------------------------
-- 4) RLS sui due backup, come tutte le `bak_*` (lint 0013_rls_disabled_in_public,
--    migration 20260725180000). Attiva senza policy = nessun accesso per anon e
--    authenticated; `service_role` bypassa, quindi un eventuale ripristino resta
--    possibile dalle route server e dalle migration.
-- ---------------------------------------------------------------------------
alter table public.bak_attivita_da_import_20260804_int enable row level security;
alter table public.bak_attivita_da_import_20260804_reg enable row level security;
