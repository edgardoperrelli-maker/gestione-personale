-- Una voce di rapportino RIFIUTATA non tiene un intervento, e il database lo impedisce.
--
-- IL DIFETTO
-- L'auto-aggancio voce→intervento (`buildVoceInterventoLinker`) risolve per ODL → matricola →
-- PDR e gira in quattro punti: generazione, salvataggio operatore, invio del rapportino e
-- recupero d'ufficio. Nessuno dei quattro guardava `approvazione_stato`. Una voce rifiutata
-- restava quindi agganciabile, e la chiave che trova non è la sua: il suo ODL e la sua matricola
-- non esistono fra gli interventi (l'intervento non è mai stato creato, è il senso del rifiuto),
-- quindi la ricerca scivola sul PDR — che è del PUNTO, non del contatore, e due misuratori nello
-- stesso stabile lo condividono. La collisione che il risolutore sa scartare è quella fra DUE
-- interventi con la stessa chiave; qui l'intervento è uno solo, quindi il match è "certo" e il
-- collegamento si scrive senza esitazione.
--
-- COSA COMPORTAVA
-- Il 10/08/2026, VIA FOSSO DELLA CRETA 3, PDR 4000283762 (TREGU DANIEL, limitazioni massive):
-- due misuratori, richieste a 9 minuti di distanza. La prima (matricola 202015245108) approvata
-- alle 13:21, la seconda (202015276720) rifiutata per errore alle 13:29, senza motivo scritto.
-- Il rapportino viene riaperto per rifare la pratica, e la voce rifiutata finisce agganciata
-- all'intervento della PRIMA matricola. Da lì:
--   1. lo Storico legge la voce e attribuisce a quell'intervento un «ESEGUITO SI» su una
--      matricola che non è la sua (due voci, due contatori, un intervento solo);
--   2. `leggiVerdettoEsecuzione` — che legge le voci con `eseguito = SI` agganciate a un
--      intervento ACEA — dichiara la matricola 202015276720 «già eseguita». Verificato: quella
--      voce rifiutata era la ✱unica✱ riga a produrre il blocco, non esiste nessun intervento
--      positivo su quel contatore.
-- Risultato: la richiesta rifiutata BLOCCA il proprio rifacimento. In campo la ricerca risponde
-- «Intervento già eseguito su questo misuratore» e non offre «Procedi»; il POST del "+" risponde
-- 409 `matricola_gia_eseguita`. Un rifiuto per errore diventa definitivo.
--
-- Non è il caso isolato: al 10/08/2026 le voci rifiutate agganciate a un intervento sono 9, e
-- tutte e 9 condividono quell'intervento con un'altra voce.
--
-- LA CORREZIONE
-- 1. Il risolutore rifiuta di agganciare una voce `rifiutato`, e i quattro percorsi gli passano
--    il campo; `rifiuta/route.ts` azzera `intervento_id` sulla voce insieme allo stato; il
--    verdetto «già eseguita» non conta più le voci rifiutate (fix nel codice).
-- 2. Qui si scollegano le righe già scritte male. Solo `intervento_id`: la voce, il suo esito e
--    l'intervento restano dove sono — l'unica cosa che sparisce è un collegamento che non
--    doveva esistere.
-- 3. Un CHECK rende l'invariante self-enforcing, come già fa
--    `interventi_manuali_intervento_solo_deciso` sul lato richiesta.
--
-- GUARDIA: si scollega solo se l'intervento conserva almeno un'ALTRA voce non rifiutata, così
-- nessun intervento resta orfano di voce (regola «voci mai orfane», caso 957327236). Verificato
-- prima della stesura: tutte e 9 le righe soddisfano la condizione.

update public.rapportino_voci v
   set intervento_id = null
 where v.approvazione_stato = 'rifiutato'
   and v.intervento_id is not null
   and exists (
     select 1 from public.rapportino_voci a
      where a.intervento_id = v.intervento_id
        and a.id <> v.id
        and (a.approvazione_stato is null or a.approvazione_stato <> 'rifiutato')
   );

do $$
declare rimaste int;
begin
  select count(*) into rimaste
    from public.rapportino_voci
   where approvazione_stato = 'rifiutato' and intervento_id is not null;
  -- Se qui restasse qualcosa sarebbe una voce rifiutata SOLA sul suo intervento: scollegarla
  -- lascerebbe l'intervento senza voce, che è il danno opposto. Va guardata a mano, non
  -- sanata alla cieca — e il CHECK sotto non si può aggiungere finché esiste.
  if rimaste > 0 then
    raise notice 'voci rifiutate ancora agganciate (uniche sul loro intervento): % — CHECK non applicato', rimaste;
  else
    if not exists (
      select 1 from pg_constraint
       where conname = 'rapportino_voci_rifiutata_senza_intervento_check'
         and conrelid = 'public.rapportino_voci'::regclass
    ) then
      alter table public.rapportino_voci
        add constraint rapportino_voci_rifiutata_senza_intervento_check
        check (approvazione_stato is distinct from 'rifiutato' or intervento_id is null);
    end if;
  end if;
end $$;

comment on column public.rapportino_voci.approvazione_stato is
  'Stato della richiesta manuale che possiede la voce: in_attesa (compilazione bloccata), approvato, rifiutato. NULL sulle voci non manuali. Una voce rifiutata non ha mai intervento_id: il rifiuto dice che quel lavoro non va registrato, e un aggancio per ODL/matricola la legherebbe all''intervento di un altro misuratore.';
