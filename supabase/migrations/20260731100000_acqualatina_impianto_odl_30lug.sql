-- Impianto mancante sul giro AcquaLatina del 30/07/2026 (segnalazione back office).
--
-- Su AcquaLatina l'IMPIANTO è il numero di punto del committente: da noi vive nella
-- colonna `pdr` — è lo stesso slot, ed è per questo che la UI lo etichetta «PDR /
-- impianto» (OrdinePresenteForm, AnnuncioConsuntivazione). Il file di pianificazione
-- del 30/07 è arrivato senza quella colonna valorizzata: le 39 righe di quel giorno
-- sono entrate con `pdr` VUOTO — verificato sul prod, sono l'INTERO batch del 30/07,
-- tutte `origine='pianificato'`, tutte `stato='completato'`, ognuna con la sua voce di
-- rapportino agganciata (1 intervento ↔ 1 voce, nessuna collisione di ODL con altri
-- committenti). L'ufficio ha poi mandato l'associazione ODL → impianto: è la tabella
-- `coppie` qui sotto, trascritta dal file e non derivata.
--
-- Stesso intervento della bonifica del 30/07 (bak_odl_impianto_20260730_*), che aveva
-- rimesso in `pdr` gli impianti finiti per errore nella colonna ODL: si allineano
-- INSIEME la colonna `pdr` e `raw_json->>'pdr'` della voce. `raw_json` è lo specchio
-- della riga di pianificazione e da solo non si guarda mai, ma lasciarlo indietro
-- creerebbe due verità sullo stesso campo — la bonifica precedente lo ha allineato e
-- qui si tiene la stessa regola.
--
-- Restano fuori le 20 righe del 29/07 ancora senza `pdr`: non sono nel file, e senza
-- l'impianto dal committente non c'è modo di indovinarlo.
--
-- Idempotente: ogni update è filtrato su `pdr` ancora vuoto, quindi una seconda
-- esecuzione non tocca niente (e non sovrascrive un impianto corretto a mano nel
-- frattempo). I backup usano `create table if not exists`: conservano lo stato di
-- PARTENZA anche se la migration rigira.

-- ─── Coppie ODL → impianto dal file dell'ufficio ────────────────────────────
create temporary table _al_impianto (odl text primary key, impianto text not null);
insert into _al_impianto (odl, impianto) values
  ('12379743','19633002'), ('12385693','60489200'), ('12379750','80859806'),
  ('12380444','32212888'), ('12380881','27416846'), ('12385144','27063606'),
  ('12381088','27069464'), ('12380658','27114328'), ('12386135','27114631'),
  ('12381490','27164545'), ('12385954','27114833'), ('12381629','42908352'),
  ('12383723','27065424'), ('12382473','27115439'), ('12379080','27065828'),
  ('12382575','49880026'), ('12383944','27065626'), ('12381652','37268309'),
  ('12387242','43576238'), ('12379229','72127681'), ('12381643','72133745'),
  ('12384408','72133139'), ('12386644','72131826'), ('12386771','72130917'),
  ('12381217','72129705'), ('12380555','72124853'), ('12384377','72128893'),
  ('12383806','72123540'), ('12384745','74278859'), ('12381079','72126671'),
  ('12381589','72125661'), ('12380844','72129503'), ('12379652','72133341'),
  ('12379728','74313619'), ('12382130','72121823'), ('12387094','72124449'),
  ('12383409','72135765'), ('12382450','72124045'), ('12379789','72134452');

-- ─── Backup di rollback: stato PRIMA della bonifica ─────────────────────────
-- RLS attiva senza policy, come le altre bak_* (vedi 20260725180000): materiale di
-- ripristino, non dati applicativi.
create table if not exists public.bak_impianto_20260731_int as
select i.* from public.interventi i
join _al_impianto c on c.odl = i.odl
where i.committente = 'acqualatina';

create table if not exists public.bak_impianto_20260731_voci as
select v.* from public.rapportino_voci v
join public.interventi i on i.id = v.intervento_id
join _al_impianto c on c.odl = i.odl
where i.committente = 'acqualatina';

alter table public.bak_impianto_20260731_int  enable row level security;
alter table public.bak_impianto_20260731_voci enable row level security;

-- ─── 1. L'impianto sull'intervento ──────────────────────────────────────────
update public.interventi i
set pdr = c.impianto,
    updated_at = now()
from _al_impianto c
where i.odl = c.odl
  and i.committente = 'acqualatina'
  and coalesce(i.pdr, '') = '';

-- ─── 2. L'impianto sulla voce di rapportino (colonna + specchio raw_json) ───
update public.rapportino_voci v
set pdr = c.impianto,
    raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{pdr}', to_jsonb(c.impianto)),
    updated_at = now()
from public.interventi i
join _al_impianto c on c.odl = i.odl
where v.intervento_id = i.id
  and i.committente = 'acqualatina'
  and coalesce(v.pdr, '') = '';

drop table _al_impianto;
