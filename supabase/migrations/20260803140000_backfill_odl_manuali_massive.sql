-- ============================================================================
-- LIMITAZIONI MASSIVE — l'ODL sugli interventi entrati «a mano» dal "+"
-- ============================================================================
-- IL BUCO. Il "+" del rapportino riconosce un misuratore cercandolo per matricola, e fino a oggi
-- lo cercava solo in `limitazione_misuratori_ref` — la tabella che l'agente riempiva dai master
-- SharePoint, ferma a ZAGAROLO e LABICO. Un paese importato nel registro nuovo (RIANO: 1.106
-- ordini massive) lì non c'è: la ricerca non trovava niente, l'operatore inseriva la sola
-- matricola, e l'intervento nasceva SENZA ODL.
--
-- Senza ODL il modulo Limitazioni massive non ha nulla a cui agganciarlo: registro e `interventi`
-- si incrociano per ODL e basta (`app/api/acea/ordini/route.ts`), e ogni intervento senza quel
-- numero viene saltato in silenzio. Il 31/07 a RIANO sono stati 19 eseguiti su 20 — lavoro fatto,
-- fotografato e consegnato, che nel modulo non compare da nessuna parte e lascia i suoi ordini
-- «aperti, senza esecutore».
--
-- La ricerca ora interroga anche il registro (lib/acea/caricaCensitiMassive.ts), quindi da qui in
-- avanti l'ODL c'è alla nascita. Questa migration ripara il passato.
--
-- LA REGOLA, ed è stretta di proposito: si aggancia un intervento SOLO se la sua matricola
-- corrisponde a un unico ODL del registro massive. Le matricole lunghe le tronca l'export ACEA
-- (SETA a 16 caratteri sul contatore, 15 nel registro: 233 righe di RIANO portano
-- `sospetto_troncamento`) e più ordini finiscono a condividere lo stesso troncone: là il numero
-- giusto non è deducibile da qui, e scriverne uno a caso su un lavoro fatto è peggio che lasciarlo
-- senza — si finisce a discutere con ACEA di un ordine mai lavorato. Quelli restano scoperti, e la
-- ricerca del "+" ora li fa scegliere all'operatore, che l'indirizzo ce l'ha davanti.
--
-- Il confronto è sulla matricola NORMALIZZATA (maiuscolo, solo A-Z0-9), la stessa regola di
-- `normMatricola`. L'`ordine_id` va alla prima operazione dell'ordine, come il backfill per-ODL
-- descritto in 20260727092000: `interventi` non porta il numero operazione, e le operazioni dello
-- stesso ordine sono lo stesso passaggio sul posto.
--
-- L'ODL si scrive anche sulla VOCE del rapportino: è la colonna che legge lo storico interventi
-- (`voceToRigaStorico`) e quella su cui si cerca un lavoro a posteriori. Solo dove è vuota: una
-- voce che un ODL ce l'ha già non si tocca.
--
-- IL SECONDO TAGLIO: `interventi_dedup_idx`, l'indice unico su (committente, odl, data) per gli
-- ODL non nulli. Sette agganci (ZAGAROLO, 15-16 giugno) finirebbero sopra un intervento che quel
-- giorno su quell'ODL c'è già: sono uscite registrate due volte, e assegnare l'ODL non le
-- unirebbe — le farebbe collidere, facendo fallire tutto il backfill per un pugno di righe che
-- vanno guardate a mano. Si saltano, dichiarandolo nella notice.
--
-- Idempotente: girata due volte, la seconda non trova più interventi senza ODL e non fa niente.
-- ---------------------------------------------------------------------------

do $$
declare
  n_interventi int;
  n_voci int;
  n_saltati int;
begin
  create temporary table _agganci_massive on commit drop as
  with primo_ordine as (
    -- Una riga per ODL, deterministica: la prima operazione.
    select distinct on (odl) odl, id, matricola_norm
      from public.acea_ordini
     where famiglia = 'massive'
     order by odl, numero_operazione
  ),
  matricola_univoca as (
    -- Solo le matricole che nel registro massive puntano a UN ordine solo.
    select matricola_norm
      from primo_ordine
     where coalesce(matricola_norm, '') <> ''
     group by matricola_norm
    having count(distinct odl) = 1
  )
  select i.id as intervento_id, p.odl, p.id as ordine_id,
         -- L'aggancio farebbe collidere due interventi sullo stesso (committente, odl, giorno):
         -- è un'uscita registrata due volte, e va guardata a mano, non fusa da qui.
         exists (
           select 1 from public.interventi x
            where x.committente = i.committente and x.odl = p.odl and x.data = i.data
              and x.id <> i.id
         ) as duplicato
    from public.interventi i
    join matricola_univoca u
      on u.matricola_norm = upper(regexp_replace(coalesce(i.matricola_contatore, ''), '[^A-Za-z0-9]', '', 'g'))
    join primo_ordine p
      on p.matricola_norm = u.matricola_norm
   where i.committente = 'lim_massive'
     and i.gruppo_attivita = 'LIMITAZIONI MASSIVE'
     and (i.odl is null or i.odl = '')
     and coalesce(i.matricola_contatore, '') <> '';

  select count(*) into n_saltati from _agganci_massive where duplicato;
  delete from _agganci_massive where duplicato;

  update public.interventi i
     set odl = a.odl,
         ordine_id = a.ordine_id
    from _agganci_massive a
   where i.id = a.intervento_id;
  get diagnostics n_interventi = row_count;

  update public.rapportino_voci v
     set odl = a.odl
    from _agganci_massive a
   where v.intervento_id = a.intervento_id
     and (v.odl is null or v.odl = '');
  get diagnostics n_voci = row_count;

  raise notice 'backfill ODL massive: % interventi agganciati, % voci di rapportino aggiornate, % saltati (doppioni su stesso ODL e giorno)',
    n_interventi, n_voci, n_saltati;
end $$;
