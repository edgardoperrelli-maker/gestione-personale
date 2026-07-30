-- Lookup INVERSO del master (matricola → ODL) e registrazione dell'assegnazione
-- sul sistema del committente.
--
-- (1) template_master_righe è nata per il verso opposto — si scrive l'ODS/ODL nel template
--     e il foglio Excel compila matricola/indirizzo/comune/CAP — quindi ha l'indice su `odl`
--     e nessuno su `matricola`. Il "+" AcquaLatina cerca per MATRICOLA: senza indice ogni
--     ricerca dal campo è una scansione delle righe del master.
--     Indice PARZIALE: `matricola` è nullable (solo `odl` è NOT NULL) e le righe senza
--     matricola non sono censimento — vanno fuori dall'indice e fuori dal lookup.
--
-- (2) assegnato_committente_at: l'assegnazione dell'ODL all'operatore sul sistema AcquaLatina
--     è un FATTO ESTERNO, non una decisione sulla richiesta → una colonna, non un valore in
--     più su `stato`. Nota: `interventi.stato` ha già 'da_assegnare', ma su un ALTRO ASSE —
--     lì significa "lavoro non ancora assegnato a un operatore, da fare", e OPEN_STATES /
--     STATI_APERTI lo contano come lavoro APERTO. Un intervento AcquaLatina già eseguito
--     messo in quello stato ricomparirebbe come «da fare» in torre, consuntivazione e sweep.
--     NULL su riga approvata = da assegnare. Valorizzata = registrata sul committente.
--
-- Convenzioni casa: additiva e idempotente, rieseguibile senza effetti collaterali.

-- ─── 1. Lookup per matricola sul master ─────────────────────────────────────
create index if not exists template_master_righe_matricola_idx
  on template_master_righe (matricola)
  where matricola is not null;

-- ─── 2. Registrazione dell'assegnazione sul sistema del committente ─────────
alter table interventi_manuali
  add column if not exists assegnato_committente_at timestamptz;

comment on column interventi_manuali.assegnato_committente_at is
  'Istante in cui l''ODL è stato assegnato all''operatore sul sistema del committente '
  '(AcquaLatina: assegnazione manuale, registrata con spunta massiva dal registro). '
  'NULL su una riga approvata = ordine da assegnare.';

-- Coda «da assegnare» del backoffice: gli approvati non ancora registrati.
create index if not exists interventi_manuali_da_assegnare_idx
  on interventi_manuali (data)
  where assegnato_committente_at is null;
