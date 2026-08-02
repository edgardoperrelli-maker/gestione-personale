-- ============================================================================
-- MODULO ACQUA LATINA — l'anagrafica dell'UTENTE entra nel registro
-- ============================================================================
-- Segnalazione dall'ufficio, guardando /hub/acqualatina/pianificazione: «mancano dati nella
-- tabella — nome utente, recapito utente, codice fornitura che sarebbe l'impianto».
--
-- Sono tre buchi diversi, e vale la pena tenerli distinti perché hanno tre cause:
--
--  1. COD. FORNITURA (impianto). Il dato C'È: tutte e 4.196 le righe di `acqualatina_ordini`
--     ce l'hanno. Mancava solo la colonna in tabella — si sistema nel codice, non qui.
--     Ma NON viaggia: `/api/acea/pianifica` non lo copia sull'intervento, quindi le 25 righe
--     pianificate per il 03/08 sono nate con `pdr` vuoto e l'operatore apre il rapportino
--     senza il codice del punto. Il backfill in fondo le recupera.
--  2. NOME UTENTE. Non esiste da nessuna parte nel registro. Esisteva sugli interventi
--     entrati dal vecchio percorso (file di pianificazione dell'ufficio, colonna
--     «Nominativo»): 254 righe su 281 ce l'hanno, le 25+2 nate dal registro no. Da oggi la
--     colonna sta sul registro, arriva dal master e scende sull'intervento.
--  3. RECAPITO. Idem, ma non aveva una colonna nemmeno su `interventi` — solo su
--     `rapportino_voci`, dove ci arrivava dal percorso mappa (`Task.recapito`). Il percorso
--     registro non aveva modo di portarlo: gliene serviva una.
--
-- Le colonne finiscono anche su `acea_ordini` e restano NULL lì. È il contratto dichiarato
-- della select condivisa (20260731170000): «chi aggiunge una colonna a quella select deve
-- aggiungerla QUI E su acea_ordini, o la vista acqualatina cade con column does not exist».
-- Il costo è qualche byte a riga, l'alternativa era biforcare la select e ogni percorso che
-- la usa.
--
-- ⚠️ Il master di Terracina già caricato («Luglio», 4.196 righe) è entrato quando il parser
-- non conosceva queste due colonne: i nomi utente che si recuperano subito sono i 254 che
-- stanno sugli interventi. Gli altri arrivano ricaricando il file master, che ora il parser
-- legge intero — stesso gesto della migration 20260731 sull'impianto.

-- ─── 1. Il master conserva le due colonne che scartava ──────────────────────
alter table public.template_master_righe add column if not exists nominativo text;
alter table public.template_master_righe add column if not exists recapito   text;

comment on column public.template_master_righe.nominativo is
  'Intestatario della fornitura, dalla colonna NOME UTENTE / INTESTATARIO del file master.';
comment on column public.template_master_righe.recapito is
  'Recapito telefonico dell''utente, dalla colonna RECAPITO / TELEFONO del file master.';

-- ─── 2. Il registro della commessa ──────────────────────────────────────────
alter table public.acqualatina_ordini add column if not exists nominativo text;
alter table public.acqualatina_ordini add column if not exists recapito   text;

comment on column public.acqualatina_ordini.nominativo is
  'Intestatario della fornitura. Scende su interventi.nominativo alla pianificazione.';
comment on column public.acqualatina_ordini.recapito is
  'Recapito telefonico dell''utente. Scende su interventi.recapito alla pianificazione.';

-- ─── 3. La select condivisa vale su due tabelle: la forma deve combaciare ───
-- Su ACEA restano NULL: l'export del Cruscotto non porta l'anagrafica dell'utente (la sua
-- `denominazione` è la descrizione dell'ordine, non un intestatario, e sovrapporle
-- significherebbe due significati sulla stessa colonna secondo il committente).
alter table public.acea_ordini add column if not exists nominativo text;
alter table public.acea_ordini add column if not exists recapito   text;

comment on column public.acea_ordini.nominativo is
  'Sempre NULL su ACEA: esiste per la forma della select condivisa col registro acqualatina.';
comment on column public.acea_ordini.recapito is
  'Sempre NULL su ACEA: esiste per la forma della select condivisa col registro acqualatina.';

-- ─── 4. Il recapito arriva fino all'intervento ──────────────────────────────
-- `nominativo` e `pdr` c'erano già; il recapito no, e senza di lui il percorso registro non
-- poteva portarlo alla voce di rapportino — che invece la colonna ce l'ha da sempre.
alter table public.interventi add column if not exists recapito text;

comment on column public.interventi.recapito is
  'Recapito telefonico dell''utente, per la voce di rapportino (RECAPITO fra i campi info). '
  'Sul percorso mappa il dato viaggia con il Task e finisce diretto sulla voce; sul percorso '
  'registro passa di qui.';

-- ─── 5. Il nome utente che già conosciamo torna sul registro ────────────────
-- Direzione voluta: l'anagrafica CONVERGE sul registro, che è la sorgente della commessa.
-- I 254 nomi arrivati col vecchio percorso non si buttano solo perché il file master, quando
-- è stato caricato, veniva letto senza quella colonna.
update public.acqualatina_ordini o
set nominativo = i.nominativo,
    aggiornato_il = now()
from public.interventi i
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(i.nominativo, '') <> ''
  and coalesce(o.nominativo, '') = '';

-- ─── 6. …e ridiscende sugli interventi che ne sono privi ────────────────────
-- Le 25 righe del 03/08 (più le 2 di stamattina) sono nate dal registro senza `pdr` né
-- `nominativo`: il codice della pianificazione non li copiava. Da qui in poi lo fa; queste
-- erano già scritte e vanno recuperate a mano, o l'operatore le trova monche domani.
-- `coalesce(...) = ''` in ogni ramo: un dato corretto in ufficio non si sovrascrive mai.
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

-- ─── 7. Le voci di rapportino già generate ──────────────────────────────────
-- Una voce nasce dall'intervento e poi vive per conto suo: sistemare l'intervento non basta,
-- il rapportino di domani è già stato scritto. Stesso criterio della funzione
-- `allinea_impianti_da_master` (20260731): si riempie solo il vuoto, e `raw_json` si muove
-- con la colonna perché è lo specchio della riga — lasciarlo indietro creerebbe due verità
-- sullo stesso campo.
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
