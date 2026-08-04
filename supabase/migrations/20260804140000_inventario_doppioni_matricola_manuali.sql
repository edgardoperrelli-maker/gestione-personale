-- ============================================================================
-- Doppioni di voci sulla stessa matricola: INVENTARIO, non bonifica.
-- ============================================================================
--
-- QUESTO FILE NON CANCELLA NIENTE, di proposito. Materializza in tre tabelle `bak_*` la
-- fotografia dei gruppi di voci che nello stesso rapportino insistono sulla stessa matricola, con
-- i loro interventi e le loro richieste, e si ferma lì. La decisione su cosa farne è dell'ufficio.
--
-- PERCHÉ SI È FERMATO QUI. Una versione precedente cancellava tre terzetti voce/richiesta/
-- intervento. Sono stati rimossi per tre ragioni, tutte misurate:
--   1. Le tre voci NON sono righe vuote: sono `manuale=true`, `approvazione_stato='approvato'`,
--      con l'intervento `stato='completato'` ed `esito='eseguito_positivo'`. In
--      `riepilogoRapportino` contano sia nei `totali` sia negli `eseguiti`. I tre rapportini sono
--      TUTTI in stato `inviato`, e dopo la cancellazione mostrerebbero un intervento in meno e un
--      eseguito in meno: 59d57f34 (SERRA ALEX 24/07) 18→17, 706a211e (SERRA ALEX 23/07) 19→18,
--      d278c433 (COMMERSO GIAMMARIA 03/07) 13→12. Tre PDF già consegnati a Italgas cambierebbero
--      numero. Per chi deve firmare, questa è LA domanda, e non può essere decisa qui.
--   2. In produzione i doppioni si sono SEMPRE gestiti col RIFIUTO, mai con la cancellazione: ci
--      sono 8 precedenti con motivo «MATRICOLA GIA CARICATA», e per costruzione non lasciano
--      orfani, perché `rifiuta/route.ts` impone `intervento_id: null` («un rifiuto non deve MAI
--      lasciare o produrre un intervento canonico agganciato»). Verificato: tutte e 8 hanno
--      `intervento_id` NULL. La via del rifiuto è chiusa solo perché quelle richieste sono già
--      'approvato' e la rotta ha il guard `.eq('stato','in_attesa')` — servirebbe una riapertura,
--      che è un percorso esistente e già testato, non una via impraticabile. Scegliere fra
--      «riapri + rifiuta» e «DELETE» è una decisione di dominio, non tecnica.
--   3. Le foto stanno in `interventi_manuali_foto` con FK ON DELETE CASCADE: le righe sparirebbero
--      con le richieste, ma i FILE nello Storage no, perché da SQL non si tocca il bucket. Il
--      rollback dal backup ricostruirebbe le righe e non i file. Sono 6 file, e la loro perdita va
--      accettata esplicitamente da chi risponde del dato, non subita.
--
-- COSA DEVE FARE L'UFFICIO PRIMA CHE SI TOCCHI QUALCOSA: dire (a) se quei tre positivi sono già
-- entrati in una fatturazione o in un dato consegnato al committente; (b) se si vuole la DELETE o
-- la riapertura+rifiuto, che conserva la riga e il motivo; (c) se i 6 file dello Storage possono
-- essere persi. Con quelle tre risposte si scrive la migration che esegue, e la si scrive per gli
-- `id` nominati uno per uno — mai per raggruppamento (vedi sotto).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IL PERIMETRO, misurato con la normalizzazione vera. `normMatricola`
-- (lib/limitazione/matricoleSimili.ts): `String(v).toUpperCase().replace(/[^A-Z0-9]/g,'')` —
-- MAIUSCOLO prima, strip dopo. In SQL: regexp_replace(upper(coalesce(x,'')), '[^A-Z0-9]', '', 'g').
-- Raggruppando per (rapportino, matricola normalizzata) ed escludendo le voci già rifiutate escono
-- 17 gruppi per 37 voci. Ma solo 5 sono doppioni veri, e la distinzione non è statistica:
--   • 9 gruppi sono coppie ACEA/DUNNING pianificate, stesso contatore, ODL DIVERSI e attività
--     complementari (limitazione/sospensione poi revoca/regolarizzazione): è il ciclo normale sulla
--     stessa utenza nella stessa giornata. Legittimi per costruzione.
--   • 1 gruppo ha matricola degenere ('0.' e '0'): due bonifiche a INDIRIZZI DIVERSI, interventi
--     diversi, foto diverse. Collisione su un campo non compilato, non un doppione.
--   • 1 gruppo (matricola '8 PG') è un rapportino ancora in_corso con due righe abbozzate, senza
--     intervento e senza risposte.
--   • 1 gruppo ha la stessa matricola ACEA su CINQUE utenze a cinque civici diversi, con cinque ODL
--     distinti: è sporcizia del file sorgente del committente, da segnalare a loro.
-- MAI CANCELLARE PER RAGGRUPPAMENTO: una query che rimuovesse «i duplicati del gruppo»
-- distruggerebbe 1+4 interventi validi in quei due ultimi casi. Ogni riga va nominata per `id`.
--
-- I 5 DOPPIONI VERI, con quel che si sa e quel che non si sa:
--   [1] 59d57f34 SERRA ALEX 24/07 MTSB032800618789 — due invii a 10 secondi, stesso parent, foto
--       BIT-IDENTICHE (stesso nome E stessa size). Doppio tap sul pulsante. La copia in più è
--       a6f7f86c, la prima è da3e8223.
--   [2] 706a211e SERRA ALEX 23/07 SMGR034016495783 — 15 minuti di distanza ma di nuovo foto
--       bit-identiche: gli stessi file ricaricati, non un secondo intervento. Copia in più
--       85c3e820, prima ed4d2be0.
--   [3] d278c433 COMMERSO 03/07 FIOR034424051629 — qui il criterio non è l'orario ma il dato: la
--       prima ha il PDR valorizzato, la seconda ce l'ha NULL. Copia in più 59522eb6, prima
--       1c2d688f. Da notare, perché è la lezione del caso: le due matricole grezze sono
--       'FIOR034424051629' e 'FIOR 0344 24051629' — differiscono per gli SPAZI. Un controllo di
--       unicità che confronta le stringhe come arrivano non intercetta questo doppione; deve
--       passare da normMatricola.
--   [4] 7edd4414 PASSERI 29/07 MTSB032800527167 — INDECIDIBILE DAI DATI. Le due righe sono
--       indistinguibili su ogni dimensione oggettiva: stesso PDR, stesso indirizzo, stesso parent,
--       stesse chiavi di risposta, 2 foto ciascuna, entrambi gli interventi completati e positivi,
--       entrambe approvate. L'unica differenza è che le foto hanno gli stessi NOMI ma size DIVERSE:
--       sono due set di scatti distinti a 4 minuti di distanza. L'ipotesi plausibile — il primo
--       invio è venuto male e l'operatore ha rifatto le foto — porterebbe a tenere la SECONDA,
--       cioè l'opposto della regola dei primi tre casi. Nei dati non c'è di che decidere, e
--       applicare comunque un «tieni la prima» qui butterebbe via il dato buono. Serve guardare le
--       due coppie di immagini o chiedere a PASSERI GIANLUCA.
--   [5] 5a3e7e62 TREGU 22/07 ODL 912350450 — NON è un caso da DELETE, è un caso da MERGE. È
--       l'unico doppione misto pianificata+manuale e l'unico doppione su ODL di tutto il DB. Il
--       contenuto operativo sta nella voce MANUALE c360cc18 (5 foto, esito `eseguito_positivo`);
--       l'identità contrattuale sta nella PIANIFICATA 101a1134 (task_id del piano importato,
--       committente `acea` corretto, template risolto, campi_snapshot pieno, ma esito NULL).
--       Cancellare la manuale butta l'evidenza fotografica; cancellare la pianificata sgancia
--       l'ODL dal piano ACEA. Serve portare risposte e foto sulla riga pianificata: operazione di
--       merito, non di pulizia. Nota indipendente dai doppioni: su quella richiesta e sul suo
--       intervento il committente è registrato come 'lim_massive' mentre la gemella pianificata
--       dice 'acea' — qualunque conteggio per committente su quell'intervento è già sbagliato oggi.
--
-- PERCHÉ UNA DELETE DOVRÀ TOCCARE IL TERZETTO E NON SOLO LA VOCE, quando si deciderà: verificato
-- riga per riga che in tutti e 17 i gruppi ogni voce ha un `intervento_id` PROPRIO e distinto, e su
-- ciascuno di quegli interventi insiste esattamente 1 voce e 1 richiesta. Cancellare la sola voce
-- lascerebbe SEMPRE un intervento 'completato' non più raggiungibile da nessun rapportino e una
-- richiesta appesa nel vuoto.
--
-- LE VOCI RIFIUTATE NON ENTRANO NELL'INVENTARIO. Ce ne sono 13, di cui 8 insistono su una matricola
-- già presente e attiva nello stesso rapportino: sono doppioni che l'ufficio ha già gestito col
-- rifiuto. Includerle porterebbe i gruppi da 17 a 25 e rimetterebbe in gioco righe archiviate di
-- proposito.
--
-- IDEMPOTENTE: le tre tabelle usano `create table if not exists ... as select`, quindi la seconda
-- esecuzione non le ricrea e conserva la fotografia del PRIMA.
-- ============================================================================


create table if not exists public.bak_doppioni_matricola_20260804_voci as
with g as (
  select rapportino_id,
         regexp_replace(upper(coalesce(matricola, '')), '[^A-Z0-9]', '', 'g') as mnorm
  from public.rapportino_voci
  where coalesce(approvazione_stato, '') <> 'rifiutato'
    and regexp_replace(upper(coalesce(matricola, '')), '[^A-Z0-9]', '', 'g') <> ''
  group by 1, 2
  having count(*) > 1
)
select v.*
from public.rapportino_voci v
join g on g.rapportino_id = v.rapportino_id
      and g.mnorm = regexp_replace(upper(coalesce(v.matricola, '')), '[^A-Z0-9]', '', 'g')
where coalesce(v.approvazione_stato, '') <> 'rifiutato';

create table if not exists public.bak_doppioni_matricola_20260804_int as
select i.* from public.interventi i
where i.id in (select b.intervento_id from public.bak_doppioni_matricola_20260804_voci b
               where b.intervento_id is not null);

create table if not exists public.bak_doppioni_matricola_20260804_richieste as
select m.* from public.interventi_manuali m
where m.id in (select b.richiesta_id from public.bak_doppioni_matricola_20260804_voci b
               where b.richiesta_id is not null);

-- `storage_path` incluso: è l'unico modo per ritrovare (o ripulire) i file del bucket, che nessuna
-- istruzione SQL può toccare.
create table if not exists public.bak_doppioni_matricola_20260804_foto as
select f.* from public.interventi_manuali_foto f
where f.richiesta_id in (select b.richiesta_id from public.bak_doppioni_matricola_20260804_voci b
                         where b.richiesta_id is not null);

alter table public.bak_doppioni_matricola_20260804_voci      enable row level security;
alter table public.bak_doppioni_matricola_20260804_int       enable row level security;
alter table public.bak_doppioni_matricola_20260804_richieste enable row level security;
alter table public.bak_doppioni_matricola_20260804_foto      enable row level security;


-- ─── SEGNALAZIONE ───────────────────────────────────────────────────────────
-- La lista da portare in decisione. È commentata perché è una lettura, non un passo della
-- migration: si lancia a mano quando serve, e l'inventario qui sopra la rende ripetibile anche
-- dopo che i dati saranno cambiati.
--
-- select b.rapportino_id, r.data, r.staff_name, r.stato,
--        regexp_replace(upper(coalesce(b.matricola,'')),'[^A-Z0-9]','','g') as matricola_norm,
--        b.id as voce_id, b.ordine, b.manuale, b.approvazione_stato, b.odl, b.pdr,
--        b.intervento_id, i.stato as int_stato, i.esito, i.consuntivato_at,
--        (select count(*) from bak_doppioni_matricola_20260804_foto f
--          where f.richiesta_id = b.richiesta_id) as foto
-- from bak_doppioni_matricola_20260804_voci b
-- join rapportini r on r.id = b.rapportino_id
-- left join bak_doppioni_matricola_20260804_int i on i.id = b.intervento_id
-- where b.rapportino_id in ('59d57f34-67fe-47f4-bba7-a4c302ab1231',   -- [1] copia in più a6f7f86c
--                           '706a211e-3a5b-459f-aa8b-b4e0db374bad',   -- [2] copia in più 85c3e820
--                           'd278c433-cfa9-4ca2-ae28-0fcde0641256',   -- [3] copia in più 59522eb6
--                           '7edd4414-9a63-4c2a-b1a1-bdaf66497980',   -- [4] indecidibile
--                           '5a3e7e62-4670-48ce-8594-451caae680b6')   -- [5] da fondere
-- order by r.data, b.rapportino_id, b.ordine;
