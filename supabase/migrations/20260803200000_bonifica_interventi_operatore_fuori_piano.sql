-- Bonifica: interventi assegnati a un operatore che nel piano non c'è.
--
-- COME NASCONO
-- `PUT /api/mappa/piani` riscrive la lista operatori del piano (delete + insert) ma non tocca i
-- loro interventi. Togliere un operatore dalla lista e salvare lascia quindi i suoi interventi
-- attaccati al piano, mentre il sync che segue gli cancella il rapportino come "orfano": il
-- lavoro resta assegnato a lui, in un piano dove non esiste più, senza un rapportino da cui
-- eseguirlo. Irraggiungibile.
--
-- Il 03/08 è successo a PASTORELLI LUIGI: 30 sostituzioni misuratori di VIA FAVONIA
-- (Terracina), assegnategli alle 09:22 dentro il piano di altri due operatori.
--
-- PERCHÉ SI POSSONO CANCELLARE
-- Non si perde lavoro: sono `assegnato` mai iniziati (né `iniziato_at` né `chiuso_at`), senza
-- voci di rapportino e senza misuratori, contabilità o riconsegne collegati. Gli ODL restano
-- nel registro `acqualatina_ordini`, che è la fonte da cui la pianificazione li ripesca: dopo
-- questa bonifica VIA FAVONIA torna semplicemente "da pianificare".
--
-- Le condizioni sono nella WHERE, non nei commenti: la migration si autolimita e su un
-- database dove quel lavoro fosse stato nel frattempo eseguito non cancellerebbe nulla.
-- Gli interventi TERMINALI (completato/annullato) non sono toccati in nessun caso: quelli
-- sono lavoro vero e restano, anche se il loro operatore è uscito dal piano.
--
-- La causa a monte è chiusa in `PUT /api/mappa/piani`, che ora rimuove gli interventi non
-- ancora iniziati degli operatori che toglie. Questa migration ripulisce solo il pregresso.

with orfani as (
  select i.id
  from interventi i
  where i.piano_id is not null
    and i.stato = 'assegnato'
    and i.iniziato_at is null
    and i.chiuso_at is null
    -- il suo operatore non è (più) nel piano
    and not exists (
      select 1 from mappa_piani_operatori o
      where o.piano_id = i.piano_id and o.staff_id = i.staff_id
    )
    -- e nessuno ci ha appoggiato niente sopra
    and not exists (select 1 from rapportino_voci v where v.intervento_id = i.id)
    and not exists (select 1 from acqualatina_misuratori_rimossi m where m.intervento_id = i.id)
    and not exists (select 1 from misuratori_rimossi m where m.intervento_id = i.id)
    and not exists (select 1 from misuratori_riconsegna m where m.intervento_id = i.id)
    and not exists (select 1 from pi_contabilita_righe c where c.intervento_id = i.id)
    and not exists (select 1 from interventi_manuali im where im.intervento_id = i.id)
    and not exists (select 1 from interventi x where x.riconciliazione_rif_id = i.id)
)
delete from interventi where id in (select id from orfani);
