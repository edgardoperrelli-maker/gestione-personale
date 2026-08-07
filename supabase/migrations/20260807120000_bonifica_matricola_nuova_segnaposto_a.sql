-- ============================================================================
-- BONIFICA — il segnaposto «A» al posto della matricola del misuratore nuovo
-- ============================================================================
-- Seguito di 20260807110000, che ha ripulito i valori finiti FUORI da AcquaLatina quando il
-- modulo AcquaLatina è arrivato per ripiego sui giri di altri committenti. Qui il caso è
-- diverso e va detto con precisione: il lavoro È di AcquaLatina, il campo ci sta, ma il valore
-- non è una matricola — è una lettera sola, scritta per superare un obbligatorio.
--
-- Un solo blocco: rapportino di PRATESI MATTIA del 03/08/2026, 21 voci con
-- `risposte.matricola_nuova = 'A'`. Il segnaposto era sceso lungo tutta la catena di
-- `lib/acqualatina/matricolaNuova.ts` — 18 interventi agganciati e una riga di registro
-- (`acqualatina_ordini`, ODL 12380832), cioè la colonna «Matricola nuova» che l'ufficio vede
-- nella griglia AcquaLatina. Ripulirne uno solo avrebbe lasciato gli altri due a raccontare
-- una matricola che non esiste.
--
-- Perché azzerare invece di correggere: la matricola vera non è ricostruibile da qui. Il campo
-- vuoto è recuperabile — l'ufficio lo ricompila dalla griglia, e la propagazione inversa
-- (`propagaMatricolaNuovaAInterventi`) lo riporta su intervento e voce. Una lettera al posto
-- della matricola invece è indistinguibile da un dato buono per chi legge l'export.
--
-- Il rapportino è già INVIATO: si tocca il verbale di una consegna. È una scelta consapevole,
-- fatta perché 'A' non è un dato che valga la pena conservare.
--
-- Idempotente: alla seconda esecuzione non trova più righe da toccare.

-- ─── 1. Registro: la riga raggiunta dagli interventi di quelle voci ─────────
update public.acqualatina_ordini o
   set matricola_nuova = null,
       aggiornato_il = now()
  from public.interventi i, public.rapportino_voci v
 where i.ordine_id = o.id
   and v.intervento_id = i.id
   and trim(v.risposte ->> 'matricola_nuova') = 'A'
   and trim(o.matricola_nuova) = 'A';

-- ─── 2. Gli interventi agganciati a quelle voci ────────────────────────────
update public.interventi i
   set matricola_nuova = null,
       updated_at = now()
  from public.rapportino_voci v
 where v.intervento_id = i.id
   and trim(v.risposte ->> 'matricola_nuova') = 'A'
   and trim(i.matricola_nuova) = 'A';

-- ─── 3. Le voci: via la risposta segnaposto, il resto resta intatto ────────
update public.rapportino_voci
   set risposte = risposte - 'matricola_nuova'
 where trim(risposte ->> 'matricola_nuova') = 'A';
