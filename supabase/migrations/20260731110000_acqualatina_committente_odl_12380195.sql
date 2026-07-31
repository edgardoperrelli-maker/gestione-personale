-- Committente sbagliato sull'ODL 12380195 (segnalazione back office): è AcquaLatina, non ACEA.
--
--   intervento 543b4f86-050a-4b80-8b5d-5800a369c6f5 — voce 290d2fbd-5ef4-47ff-a56b-2dc587fdb98b
--   30/07/2026, TERRACINA, VIA CENTURIAZIONE N.0/PAN, matricola 350699, eseguito positivo
--
-- Che sia AcquaLatina lo dicono tre riscontri indipendenti, non solo la segnalazione:
--   1. l'ODL è nel master AcquaLatina «Luglio» (template_master_righe) con LA STESSA
--      matricola e LO STESSO indirizzo, e non compare né in `acea_ordini` né in
--      `acea_master_snapshot`: per ACEA quest'ordine non esiste;
--   2. è la 41ª riga del piano 9bf75f93-b3f1-473d-9bad-17b68917248e, dove le altre 40
--      sono tutte AcquaLatina — è l'unico fuori posto;
--   3. `intervento_tipo` era 'SOSTITUZIONE MISURATORI', che nel catalogo ACEA non esiste:
--      è il GRUPPO AcquaLatina, ed è per questo che `gruppo_attivita` è rimasto NULL
--      (`risolviGruppo` cerca fra le DESCRIZIONI del committente e non ha trovato niente).
--
-- Si porta la riga alla forma delle 40 sorelle, che è anche esattamente quella della
-- bonifica del 30/07 su 13 righe gemelle (bak_committente_manuali_20260730_*):
--   committente      acea → acqualatina
--   gruppo_attivita  NULL → 'SOSTITUZIONE MISURATORI'   (GRUPPO_SOSTITUZIONE_MISURATORI)
--   intervento_tipo  gruppo → 'Sostituzione misuratore' (ATTIVITA_SOSTITUZIONE_MISURATORE,
--                    al SINGOLARE: è la descrizione, e `risolviGruppo` cerca fra quelle —
--                    passargli il gruppo è il difetto che ha creato questa riga)
-- e sulla voce `attivita` + il suo specchio `raw_json->>'attivita'`.
--
-- NON si tocca `template_id`/`campi_snapshot` della voce (restano nulli/vuoti): sono la
-- foto del modulo COME È STATO COMPILATO in campo, e riempirli a posteriori col template
-- AcquaLatina inventerebbe una storia mai avvenuta. Le 13 righe del 30/07 sono state
-- lasciate così e vivono bene. `risposte` — {"eseguito":"SI"} — resta intatta.
--
-- Nessuna riga in `misuratori_rimossi` né in `acqualatina_misuratori_rimossi` per questo
-- intervento: verificato, non c'è nessun misuratore da spostare di registro.
--
-- Resta senza impianto (`pdr` NULL): non è fra le 39 coppie del file dell'ufficio
-- (20260731100000). Serve l'impianto dal committente.
--
-- Idempotente: gli update sono filtrati sullo stato di partenza, una seconda esecuzione
-- non fa nulla.

-- ─── Backup di rollback: stato PRIMA della bonifica ─────────────────────────
-- RLS attiva senza policy, come le altre bak_* (vedi 20260725180000).
create table if not exists public.bak_committente_12380195_20260731_int as
select * from public.interventi where id = '543b4f86-050a-4b80-8b5d-5800a369c6f5';

create table if not exists public.bak_committente_12380195_20260731_voci as
select * from public.rapportino_voci where id = '290d2fbd-5ef4-47ff-a56b-2dc587fdb98b';

alter table public.bak_committente_12380195_20260731_int  enable row level security;
alter table public.bak_committente_12380195_20260731_voci enable row level security;

-- ─── 1. L'intervento passa ad AcquaLatina, con gruppo e attività canonici ───
update public.interventi
set committente     = 'acqualatina',
    gruppo_attivita = 'SOSTITUZIONE MISURATORI',
    intervento_tipo = 'Sostituzione misuratore',
    updated_at      = now()
where id = '543b4f86-050a-4b80-8b5d-5800a369c6f5'
  and committente = 'acea';

-- ─── 2. L'attività sulla voce (colonna + specchio raw_json) ─────────────────
update public.rapportino_voci
set attivita = 'Sostituzione misuratore',
    raw_json = jsonb_set(coalesce(raw_json, '{}'::jsonb), '{attivita}', to_jsonb('Sostituzione misuratore'::text)),
    updated_at = now()
where id = '290d2fbd-5ef4-47ff-a56b-2dc587fdb98b'
  and attivita = 'SOSTITUZIONE MISURATORI';
