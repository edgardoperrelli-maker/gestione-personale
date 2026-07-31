-- Sette ordini del 29/07 portavano l'impianto di un ALTRO ordine, e il master vecchio si spegne.
--
-- ─── 1. Gli impianti scambiati ──────────────────────────────────────────────
-- Emerso dal confronto incrociato dopo l'allineamento del registro: su 196 interventi
-- AcquaLatina con impianto, 189 concordano col master del committente e 7 no. Non sono
-- numeri inventati — sono impianti che il master assegna a un ordine DIVERSO, e formano
-- catene: 12386811 porta 27412402 (di 12380751), che a sua volta porta 41253894 (di
-- 12384500). È uno slittamento di righe nel file di pianificazione del 29/07: tutti e
-- sette sono di quel giorno, tutti in VIA CALCATORE.
--
-- La fonte di verità è il master, e non per principio:
--   * le 39 coppie ODL → impianto mandate a mano dall'ufficio combaciano 39 su 39 con
--     quanto il parser ha letto da COD_FORNITURA, zero divergenze;
--   * il master conferma INDIPENDENTEMENTE 12 delle 13 righe della bonifica del 30/07
--     (bak_odl_impianto_20260730), fatta prima che l'impianto esistesse a catalogo.
--
-- ⚠️ Questa è la PRIMA scrittura di questo giro che SOVRASCRIVE un valore pieno: tutte le
-- altre riempivano solo campi vuoti. Sono lavori già chiusi, quindi ogni update è ancorato
-- alla TERNA (odl, valore sbagliato atteso, valore corretto): se una riga non è più nello
-- stato esatto qui verificato, l'update non la tocca invece di indovinare.
--
-- Le catene non sono un problema di ordine: un UPDATE singolo lavora su uno snapshot
-- coerente, quindi 12382227 riceve 40063020 (oggi su 12381473) mentre 12381473 riceve il
-- suo, nella stessa istruzione e senza pestarsi i piedi.
--
-- Colonna e specchio `raw_json` si muovono insieme, come nelle bonifiche precedenti:
-- verificato che su tutti e sette intervento, voce e raw_json portano lo STESSO valore
-- sbagliato, e ogni ODL ha una sola riga a master e una sola voce di rapportino.
--
-- NON si tocca l'ODL 12383261, che ha un'anomalia DIVERSA: l'impianto è giusto (19138100)
-- ma il master lo colloca in VIA PONTE ROSSO 33 con le matricole 444369/444367, mentre da
-- noi risulta VIA CALCATORE SNC con la 351008. Lì non torna l'abbinamento ODL↔contatore:
-- è una domanda per l'ufficio, non una bonifica.

create table if not exists public.bak_impianti_scambiati_20260731_int as
select * from public.interventi
where id in ('8ff9f11b-8206-41c4-8580-ddea99c24fae','dad2f33d-2ee0-4839-b587-fd62e5287e78',
             'ac3121f3-f36f-4c26-9031-ece8c32a7623','7599c7e2-e320-4214-86c8-ab4998a48fc3',
             'b945b021-c33d-4197-8cc3-364d50cece11','24c95ae7-e598-4c3b-8211-79d3457eee34',
             '2c77366f-eabf-4962-b885-a69013e6c062');

create table if not exists public.bak_impianti_scambiati_20260731_voci as
select * from public.rapportino_voci
where id in ('22322787-9ee8-42ef-839a-07006a185f2b','84f912c7-aa13-431f-9a7b-3ed3058f1c21',
             '594c8cfe-88d0-4a63-b52e-2557921092f7','2904c862-ae1f-4ab6-a0df-90919242d7ed',
             'f928aa92-0b53-4118-b32d-a841b6401cbe','3bfa635e-2a65-445f-82da-22d7a28676a5',
             'ec6594b6-9eaa-4141-ad73-6a7555adfc4f');

alter table public.bak_impianti_scambiati_20260731_int  enable row level security;
alter table public.bak_impianti_scambiati_20260731_voci enable row level security;

-- L'intervento: solo se porta ancora ESATTAMENTE il valore sbagliato verificato.
update public.interventi i
set pdr = t.giusto,
    updated_at = now()
from (values
  ('12378973','27417149','26918409'),
  ('12380751','41253894','27412402'),
  ('12381473','40063020','26868491'),
  ('12382227','37173632','40063020'),
  ('12382573','27415836','73521249'),
  ('12384500','27415533','41253894'),
  ('12386811','27412402','27163232')
) as t(odl, sbagliato, giusto)
where i.odl = t.odl
  and i.committente = 'acqualatina'
  and i.pdr = t.sbagliato;

-- La voce di rapportino: colonna + specchio raw_json, stesso ancoraggio.
update public.rapportino_voci v
set pdr = t.giusto,
    raw_json = jsonb_set(coalesce(v.raw_json, '{}'::jsonb), '{pdr}', to_jsonb(t.giusto)),
    updated_at = now()
from public.interventi i, (values
  ('12378973','27417149','26918409'),
  ('12380751','41253894','27412402'),
  ('12381473','40063020','26868491'),
  ('12382227','37173632','40063020'),
  ('12382573','27415836','73521249'),
  ('12384500','27415533','41253894'),
  ('12386811','27412402','27163232')
) as t(odl, sbagliato, giusto)
where v.intervento_id = i.id
  and i.odl = t.odl
  and i.committente = 'acqualatina'
  and v.pdr = t.sbagliato;

-- ─── 2. Il master del 30/07 si spegne ───────────────────────────────────────
-- Ricaricare il master AGGIUNGE un file, non lo sostituisce: dopo tre caricamenti il
-- censimento che gli operatori scaricano era a 12.588 righe invece di 4.196, con ogni
-- ODL ripetuto. Il doppione delle 07:51 è già spento; qui va via anche quello del 30/07,
-- l'ultimo senza impianti.
--
-- Si SPEGNE, non si cancella: `attivo=false` lo toglie dal lookup e dal censimento
-- lasciandone le righe al loro posto — è la semantica dell'interruttore in
-- /impostazioni/template-master, ed è reversibile con un clic.
--
-- Verificato prima di spegnere che il master nuovo copre tutto il suo: stessi 4.063 ODL
-- distinti, stesse coppie (ODL, matricola), ZERO righe perse. `acqualatina_ordini` porta
-- ancora `master_id`/`master_riga_id` di questo file, ma non sono foreign key (l'unica FK
-- della tabella è `pianificato_a_bozza`) e il registro non legge più gli impianti da qui:
-- li ha già sulle sue righe (20260731200000).
update public.template_master
set attivo = false, updated_at = now()
where id = '5f057a49-7f19-4620-ab70-9c9c072c7e54' and attivo;
