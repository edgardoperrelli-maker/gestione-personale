-- Il registro della commessa AcquaLatina: la sostituzione misuratori di Terracina, con le
-- STESSE mani del registro ACEA (stessa select, stessa griglia, stesso motore rapportini).
--
-- Perché una TABELLA nuova e non righe dentro `acea_ordini`: quel registro è dichiarato «lo
-- specchio immutabile dell'export del Cruscotto ACEA» — infilarci un altro committente gli
-- cambierebbe il significato, e ogni suo invariante (famiglie, import, chiusure da export)
-- smetterebbe di essere vero. Qui la sorgente è il MASTER del committente (template_master),
-- la chiusura la scrivono i NOSTRI rapportini, e la tabella è dell'app: il service role la
-- scrive (sync dal master, bozze, chiusure), `authenticated` la legge e basta.
--
-- La FORMA delle colonne è quella della select condivisa del registro (`COLONNE` in
-- app/api/acea/ordini/route.ts): è ciò che permette a UNA query di servire tre famiglie.
-- ⚠️ Chi aggiunge una colonna a quella select deve aggiungerla QUI E su acea_ordini, o la
-- vista acqualatina cade con «column does not exist» — la select è dichiarata congelata
-- proprio per questo.
--
-- Colonne ACEA senza significato qui (scadenza, impianto, codice_sla, …) esistono e restano
-- NULL: il costo è qualche byte a riga, l'alternativa era biforcare la select e ogni percorso
-- che la usa. La chiave è (odl, numero_operazione) come su ACEA — nel master 109 ODL coprono
-- fino a 5 contatori (condomìni), e il numero operazione ('1','2',…) li distingue; l'identità
-- di dominio resta la coppia (odl, matricola), con indice unico a guardia del sync.

create table if not exists public.acqualatina_ordini (
  id                        uuid not null unique default gen_random_uuid(),
  odl                       text not null,
  numero_operazione         text not null,
  famiglia                  text not null default 'acqualatina'
                            check (famiglia = 'acqualatina'),
  tipo_ordine               text,
  attivita                  text,
  denominazione             text,
  stato                     text not null default 'APERTO',
  stato_desc                text,
  aperto                    boolean not null default true,
  data_creazione            date not null,
  cardine_al                date,
  scadenza                  date,
  data_completamento        date,
  operatore_cognome         text,
  operatore_nome            text,
  causale                   text,
  causale_desc              text,
  esito_positivo            boolean,
  via                       text,
  civico                    text,
  cap                       text,
  comune                    text,
  provincia                 text,
  microarea                 integer,
  microarea_stimata         boolean not null default false,
  impianto                  text,
  matricola                 text,
  matricola_norm            text,
  sospetto_troncamento      boolean not null default false,
  valore_netto              numeric,
  escludi_consuntivazione   boolean not null default false,
  codice_sla                text,
  priorita_testo            text,
  centro_lavoro             text,
  testo_ordine              text,
  note                      text,
  riapertura                boolean not null default false,
  -- Gli appunti di pianificazione, come su acea_ordini (migration 20260728*): la mezza
  -- pianificazione scritta in griglia, che il motore rapportini usa come cancello.
  pianificato_a_bozza       uuid references public.staff(id) on delete set null,
  pianificato_il_bozza      date,
  -- Il civico ordinabile, stessa espressione di acea_ordini (migration 20260730160000).
  civico_num                integer
                            generated always as (nullif(substring(civico from '^\d{1,8}'), '')::integer) stored,
  -- Provenienza: da quale master e da quale riga è entrata. Serve al sync additivo e a
  -- rispondere «da che file viene questo punto» quando i file mensili saranno più d'uno.
  master_id                 uuid,
  master_riga_id            uuid,
  creato_il                 timestamptz not null default now(),
  aggiornato_il             timestamptz not null default now(),
  primary key (odl, numero_operazione)
);

-- L'identità di dominio: un contatore per ODL una volta sola. È la guardia del sync additivo
-- (che dedup-lica sul normalizzato) contro doppi inserimenti concorrenti o file sporchi.
create unique index if not exists acqualatina_ordini_odl_matricola_idx
  on public.acqualatina_ordini (odl, matricola_norm);

-- L'ordinamento canonico della vista è la strada: via, poi civico numerico.
create index if not exists acqualatina_ordini_via_civico_idx
  on public.acqualatina_ordini (via, civico_num);

alter table public.acqualatina_ordini enable row level security;

-- Come acea_ordini: lettura agli autenticati, NESSUNA policy di scrittura — scrive solo il
-- service role (sync dal master, appunti di pianificazione, chiusure dai rapportini).
drop policy if exists acqualatina_ordini_select_auth on public.acqualatina_ordini;
create policy acqualatina_ordini_select_auth
  on public.acqualatina_ordini for select to authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- Gli indici unici di `interventi`, declinati per committente.
--
-- Le due guardie storiche assumono «un ODL = un lavoro»: vero per ACEA e Italgas, falso per
-- AcquaLatina, dove un ODL copre fino a cinque contatori — pianificarne due nello stesso giorno
-- (il caso NORMALE di un condominio) violava `interventi_dedup_idx`, e il secondo esito positivo
-- violava l'indice dei positivi facendo annullare lavoro vero come «doppio positivo».
--
-- La declinazione tiene le garanzie ESATTE per tutti gli altri committenti (stessi nomi: c'è
-- codice che riconosce `interventi_dedup_idx` nel messaggio d'errore — lib/interventi/spostaData)
-- e aggiunge la matricola alla chiave per il solo committente acqualatina, in coppia con
-- `chiavePositivo` in lib/interventi/odlPositivi.ts che fa lo stesso a livello applicativo.
-- ---------------------------------------------------------------------------------------------

drop index if exists public.interventi_dedup_idx;
create unique index interventi_dedup_idx
  on public.interventi (committente, odl, data)
  where odl is not null and committente <> 'acqualatina';
create unique index if not exists interventi_dedup_acqualatina_idx
  on public.interventi (committente, odl, data, (coalesce(matricola_contatore, '')))
  where odl is not null and committente = 'acqualatina';

drop index if exists public.interventi_odl_positivo_unico_idx;
create unique index interventi_odl_positivo_unico_idx
  on public.interventi (committente, odl)
  where esito = 'eseguito_positivo' and odl is not null and btrim(odl) <> ''
    and committente <> 'acqualatina';
create unique index if not exists interventi_odl_matr_positivo_unico_idx
  on public.interventi (committente, odl, (coalesce(matricola_contatore, '')))
  where esito = 'eseguito_positivo' and odl is not null and btrim(odl) <> ''
    and committente = 'acqualatina';
