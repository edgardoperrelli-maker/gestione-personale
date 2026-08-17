-- L'ODL 12384609 torna ad avere il suo intervento, e il registro può richiudersi.
--
-- IL DIFETTO
-- Il 14/08/2026 la pianificazione ha SPOSTATO l'intervento cf558e1f dell'ODL 12384609 da
-- PRATESI a LIBERATORI (`acea_operazioni`, azione `aggiornato`, 10:42). Lo spostamento è
-- corretto — è la regola «un ODL aperto si sposta, non si duplica» di `pianoPianificazione` —
-- ma `sincronizzaRapportiniAcea` non cancella mai una voce, di nessuna origine: la voce è
-- rimasta sul rapportino di PRATESI e una seconda è nata su quello di LIBERATORI. Due voci,
-- UN intervento solo dietro tutt'e due.
--
-- COSA COMPORTAVA
-- Lo Storico legge l'esecutore dallo staff del rapportino PADRE (`storico/esecutore.ts`),
-- quindi lo stesso ODL compariva sotto due nomi lo stesso giorno. Peggio: i due operatori
-- hanno esitato lo stesso intervento — LIBERATORI «SI» alle 13:18, PRATESI «NO» alle 13:27 —
-- e l'ultima scrittura ha vinto, cancellando il positivo di chi il lavoro l'aveva fatto.
--
-- Cancellando dallo Storico la riga di PRATESI, la DELETE ha eliminato l'intervento collegato
-- (`voce/[voceId]/route.ts`) senza accorgersi che la voce di LIBERATORI puntava allo STESSO
-- intervento: la FK `on delete set null` l'ha orfanata in silenzio (17/08 06:42:52).
-- Da lì il registro non ha più potuto chiudersi: `riconciliaChiusureAcqualatina` legge solo
-- `interventi` con `stato='completato'` e `ordine_id`, e l'ODL non ne aveva più nessuno.
-- Anzi, `idsSenzaConcluso` ha riportato la riga ad «APERTA» 17 secondi dopo (06:43:09), al
-- primo caricamento del Confronto esiti. Un lavoro fatto, con la matricola nuova già a
-- registro, che il registro dichiarava ancora da fare — e nessuna riesecuzione della
-- riconciliazione avrebbe potuto ripararlo: l'esito vive nella voce, il registro ascolta solo
-- gli interventi.
--
-- LA CORREZIONE
-- Si ricrea l'intervento mancante dalla voce superstite e dalla riga di registro, e lo si
-- riaggancia alla voce. Nient'altro: lo stato del registro NON si scrive qui — con
-- l'intervento al suo posto ci pensa la riconciliazione al primo giro, che è il percorso
-- normale e l'unico che sa applicare le regole della commessa.
--
-- L'id è quello ORIGINALE, e non è cosmesi: la voce conserva `task_id = 'acea:cf558e1f-…'`,
-- che `vociDaAggiungere` usa come seconda chiave di dedup proprio perché «sopravvive
-- all'azzeramento della FK». Con un id nuovo il `task_id` resterebbe a mentire su un
-- intervento inesistente.
--
-- GUARDIE: si scrive solo se l'ODL non ha già un intervento (idempotente: al secondo giro non
-- fa niente) e solo se la voce è ancora orfana. I valori non si ripetono a mano — scendono
-- dalla voce, dal suo rapportino e dalla riga di registro, che sono le tre fonti che li
-- avevano già.

do $$
declare
  v_intervento_id constant uuid := 'cf558e1f-15d4-4a31-b016-1ed680a0cdad';
  v_voce_id       constant uuid := 'f0fd79fa-808a-4872-8989-d65f5f832f28';
  v_creati        int;
begin
  if exists (select 1 from public.interventi where committente = 'acqualatina' and odl = '12384609') then
    raise notice 'ODL 12384609: intervento gia` presente, niente da riparare';
    return;
  end if;
  if not exists (select 1 from public.rapportino_voci where id = v_voce_id and intervento_id is null) then
    raise notice 'ODL 12384609: voce % non orfana (o assente), riparazione saltata', v_voce_id;
    return;
  end if;

  insert into public.interventi (
    id, committente, odl, ordine_id, data, staff_id, stato, esito,
    intervento_tipo, gruppo_attivita, matricola_contatore, matricola_nuova,
    pdr, nominativo, recapito, indirizzo, comune,
    piano_id, territorio_id, assegnato_at, chiuso_at
  )
  select
    v_intervento_id,
    'acqualatina',
    o.odl,
    o.id,
    r.data,
    r.staff_id,
    -- `completato` + `eseguito_positivo`: sono le due colonne che la riconciliazione legge
    -- (`stato='completato'`, poi `esitoRiga`) per portare la riga di registro a
    -- «CHIUSA — ESEGUITA». L'esito è quello che l'operatore ha scritto nella voce.
    'completato',
    'eseguito_positivo',
    'Sostituzione misuratore',
    'SOSTITUZIONE MISURATORI',
    o.matricola,
    v.risposte ->> 'matricola_nuova',
    o.impianto,
    o.nominativo,
    o.recapito,
    nullif(btrim(concat_ws(' ', o.via, o.civico)), ''),
    o.comune,
    -- Piano e territorio del rapportino che ospita la voce: è il piano su cui l'intervento
    -- sarebbe atterrato se non fosse mai stato cancellato.
    r.piano_id,
    (select i2.territorio_id
       from public.interventi i2
      where i2.piano_id = r.piano_id and i2.territorio_id is not null
      limit 1),
    -- La giornata è chiusa da un pezzo: le due marche temporali sono quelle del rapportino,
    -- non `now()` — un intervento del 14/08 non è stato assegnato oggi.
    r.submitted_at,
    r.submitted_at
  from public.rapportino_voci v
  join public.rapportini r on r.id = v.rapportino_id
  join public.acqualatina_ordini o on o.odl = v.odl
  where v.id = v_voce_id
    and v.risposte ->> 'eseguito' = 'SI';

  get diagnostics v_creati = row_count;
  if v_creati = 0 then
    raise notice 'ODL 12384609: nessuna riga sorgente utile, intervento non ricreato';
    return;
  end if;

  update public.rapportino_voci
     set intervento_id = v_intervento_id
   where id = v_voce_id;

  /*
    Il misuratore rimosso ha perso il filo nello stesso istante e per la stessa ragione:
    `acqualatina_misuratori_rimossi.intervento_id` è `on delete set null` (migration
    20260727150000) — e a differenza della gemella ACEA, che è `on delete cascade`, qui la riga
    sopravvive orfana invece di sparire. Il contatore 225165 è in deposito «da consegnare» e
    senza aggancio non risale più al suo intervento.

    Si riaggancia per rapportino + ODL + matricola: tre chiavi che insieme individuano UNA riga,
    perché l'unità di questa commessa è il contatore e il rapportino è quello che l'ha scaricato.
  */
  update public.acqualatina_misuratori_rimossi m
     set intervento_id = v_intervento_id
    from public.rapportino_voci v
   where m.intervento_id is null
     and v.id = v_voce_id
     and m.rapportino_id = v.rapportino_id
     and m.odl = v.odl
     and m.matricola = v.matricola;

  raise notice 'ODL 12384609: intervento % ricreato e riagganciato alla voce %', v_intervento_id, v_voce_id;
end $$;
