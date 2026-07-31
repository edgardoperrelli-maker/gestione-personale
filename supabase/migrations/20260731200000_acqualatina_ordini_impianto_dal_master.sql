-- L'impianto arriva anche sul registro AcquaLatina: 4.196 ordini lo avevano vuoto.
--
-- La 20260731170000 dichiara `impianto` una colonna ACEA «senza significato qui», che resta
-- NULL. Era VERO quando è stata scritta: il master AcquaLatina non aveva impianti, perché
-- l'import li scartava (non esisteva la colonna in `template_master_righe`, né un pattern
-- che la riconoscesse). Da allora sono cambiate due cose:
--   1. la 20260731120000 ha aggiunto `template_master_righe.impianto`;
--   2. si è scoperto come si chiama la colonna nell'estrazione del committente —
--      **COD_FORNITURA** — e il parser ora la legge.
-- Ricaricato il master, le 4.196 righe hanno tutte l'impianto. Su AcquaLatina quel numero è
-- il codice del punto: lo stesso che vive in `interventi.pdr` e che la UI etichetta
-- «PDR / impianto». Sul registro la colonna quindi un significato ce l'ha, ed è questo.
--
-- Che COD_FORNITURA sia davvero l'impianto NON è un'ipotesi: le 39 coppie ODL → impianto
-- mandate a mano dall'ufficio combaciano 39 su 39 con quanto il parser ha letto dal file,
-- zero divergenze.
--
-- L'aggancio è la coppia (ODL, matricola) — l'identità di dominio del registro, protetta
-- dall'indice unico `acqualatina_ordini_odl_matricola_idx`. L'ODL da solo non basta: nel
-- master di Terracina 109 ODL coprono da 2 a 5 contatori (condomìni). Verificato prima di
-- scrivere: 4.196 ordini, 4.196 righe master, nessuna riga senza matricola da nessuna delle
-- due parti, nessuna coppia duplicata, nessuna coppia con impianti discordi → 4.196 agganci
-- puliti, uno a uno.
--
-- NON si toccano `master_id` / `master_riga_id`, che puntano ancora al master del 30/07:
-- ripuntarli è lavoro del sync «Aggiorna dal master», non di una bonifica dati. Non sono
-- foreign key (verificato: l'unica FK della tabella è `pianificato_a_bozza`), quindi non
-- trascinano niente.
--
-- ⚠️ Questa migration chiude il PASSATO, non il futuro: `ordiniDaMaster.ts` è additivo per
-- costruzione (restituisce solo le righe NUOVE, le presenti non si toccano mai) e il suo
-- `NuovoOrdine` non porta l'impianto. Finché quella mappatura non include il campo, gli
-- ordini che entreranno ai prossimi sync nasceranno di nuovo senza.
--
-- Idempotente e non distruttiva: filtra `coalesce(impianto,'') = ''`, quindi non sovrascrive
-- mai un impianto già presente e una seconda esecuzione non fa nulla.

-- ─── Backup di rollback: stato PRIMA della bonifica ─────────────────────────
-- RLS attiva senza policy, come le altre bak_* (vedi 20260725180000).
create table if not exists public.bak_acqualatina_ordini_impianto_20260731 as
select o.*
from public.acqualatina_ordini o
join (
  select r.odl, r.matricola, min(r.impianto) as impianto
  from public.template_master_righe r
  join public.template_master m on m.id = r.master_id
  where m.committente = 'acqualatina' and m.attivo
    and coalesce(r.impianto, '') <> '' and coalesce(r.matricola, '') <> ''
  group by r.odl, r.matricola
  having count(distinct r.impianto) = 1
) c on c.odl = o.odl and c.matricola = o.matricola
where coalesce(o.impianto, '') = '';

alter table public.bak_acqualatina_ordini_impianto_20260731 enable row level security;

-- ─── L'impianto sul registro ────────────────────────────────────────────────
-- La sorgente sono i master ATTIVI del committente che portano l'impianto (un master spento
-- è fuori dal lookup, e deve restare fuori anche da qui). `having count(distinct …) = 1`
-- salta le coppie a cui due master attivi darebbero impianti diversi: un dato del genere è
-- rotto e va sistemato in ufficio, non indovinato — stesso criterio di
-- `allinea_impianti_da_master()` e dell'esito 'ambiguo' di `lookupMaster`.
update public.acqualatina_ordini o
set impianto = c.impianto,
    aggiornato_il = now()
from (
  select r.odl, r.matricola, min(r.impianto) as impianto
  from public.template_master_righe r
  join public.template_master m on m.id = r.master_id
  where m.committente = 'acqualatina' and m.attivo
    and coalesce(r.impianto, '') <> '' and coalesce(r.matricola, '') <> ''
  group by r.odl, r.matricola
  having count(distinct r.impianto) = 1
) c
where c.odl = o.odl
  and c.matricola = o.matricola
  and coalesce(o.impianto, '') = '';
