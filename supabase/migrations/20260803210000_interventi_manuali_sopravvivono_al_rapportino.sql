-- Le richieste manuali dal «+» non muoiono più col rapportino.
--
-- IL DIFETTO
-- `interventi_manuali.rapportino_id` nasce (20260606000000) con ON DELETE CASCADE, unico fra i
-- suoi pari nella stessa CREATE TABLE: `voce_id`, `intervento_id`, `piano_id` e `template_id`
-- sono tutti ON DELETE SET NULL. Anche le altre tabelle che registrano lavoro svolto —
-- `misuratori_rimossi`, `risanamento_misuratori_archivio` — puntano al rapportino in SET NULL.
-- È l'anomalia, e si comporta come tale.
--
-- COSA COMPORTAVA
-- `interventi_manuali` NON è parte del rapportino: è la RICHIESTA dell'operatore, con un ciclo
-- suo (`stato`, `corsia`, `preso_in_carico_da`, `deciso_da`, `motivo_rifiuto`). Col CASCADE,
-- cancellare un rapportino cancellava anche tutte le richieste che l'operatore aveva fatto dal
-- «+» — domande, approvazioni e rifiuti spariti senza lasciare riga.
--
-- Il 03/08 è successo a PASTORELLI LUIGI: eliminato il piano, il CASCADE su `rapportini` si è
-- portato via il rapportino, e da lì un secondo CASCADE le sue richieste manuali. Il rapportino
-- si è potuto ricostruire dagli interventi superstiti; le richieste no, perché di quelle non
-- resta traccia da nessuna parte — nemmeno per sapere se ci fossero.
--
-- LA CORREZIONE
-- SET NULL come i suoi pari: la richiesta sopravvive, orfana ma leggibile, e resta
-- riagganciabile al rapportino ricostruito tramite `intervento_id`. La colonna è già nullable
-- e 37 richieste su 2616 hanno già `rapportino_id` nullo, quindi nessuna riga da sistemare.
--
-- Non si tocca `rapportino_voci`/`rapportino_righe`: quelle il CASCADE ce l'hanno giusto,
-- perché le voci SONO il rapportino e senza di lui non significano niente.

alter table public.interventi_manuali
  drop constraint if exists interventi_manuali_rapportino_id_fkey;

alter table public.interventi_manuali
  add constraint interventi_manuali_rapportino_id_fkey
  foreign key (rapportino_id) references public.rapportini(id) on delete set null;

comment on column public.interventi_manuali.rapportino_id is
  'Rapportino su cui è nata la richiesta. ON DELETE SET NULL: la richiesta è un atto dell''operatore e sopravvive al rapportino, altrimenti cancellarlo cancella anche lo storico di cosa era stato chiesto e deciso.';
