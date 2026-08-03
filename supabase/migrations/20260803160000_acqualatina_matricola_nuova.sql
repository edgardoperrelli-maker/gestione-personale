-- Commessa ACQUALATINA — azione nuova sul flusso operatore: la MATRICOLA DEL MISURATORE
-- INSTALLATO, da scansionare (codice a barre) o scrivere a mano, sulla voce del suo ODL.
--
-- Il tipo `matricola` nasce con questo rilascio: campo di testo con lo scanner accanto
-- (`CampoInput` → `ScannerMisuratore`). Le due vie scrivono lo stesso valore, quindi
-- obbligatorietà, export, PDF e riepiloghi lo trattano già come un campo di testo — nessun
-- consumatore va toccato.
--
-- CHIRURGICA sul jsonb `campi`, niente riscrittura dell'array intero: il flusso è già stato
-- corretto in produzione dopo la sua nascita (SARACINESCA da crocetta a select,
-- 20260727160000) e un `update campi = '[…]'` cancellerebbe quelle scelte.
--
-- Posizione: subito dopo LETTURA VECCHIO, che è l'ordine dei gesti sul posto — si legge il
-- vecchio, lo si stacca, si monta il nuovo e se ne prende la matricola. Le azioni successive
-- scalano di uno.
--
-- Obbligatoria SÌ, ma di fatto solo sulle voci positive: `campiObbligatoriMancantiVoci` salta
-- i campi obbligatori quando la voce ha esito negativo (ESEGUITO = NO, o MOTIVO NON ESEGUITO
-- valorizzato). Un misuratore non sostituito non ha una matricola nuova da scrivere, e
-- pretenderla bloccherebbe l'invio di una giornata legittima.
--
-- Sui rapportini GIÀ generati non cambia nulla: `rapportino_voci.campi_snapshot` congela le
-- azioni al momento della generazione. L'azione entra dai rapportini generati DOPO — cioè
-- quelli di domani, che è la richiesta.
--
-- Idempotente: se la chiave c'è già, non tocca niente.

with obiettivo as (
  select
    t.id,
    t.campi,
    -- Dopo LETTURA VECCHIO; se quel campo non c'è più, in fondo.
    coalesce(
      (select max((e->>'ordine')::int) + 1
         from jsonb_array_elements(t.campi) e
        where e->>'chiave' = 'lettura_vecchio'),
      (select max((e->>'ordine')::int) + 1 from jsonb_array_elements(t.campi) e),
      1
    ) as ordine
  from rapportino_template t
  where t.gruppo_committente = 'acqualatina'
    and jsonb_typeof(t.campi) = 'array'
    and exists (
      select 1 from unnest(coalesce(t.gruppi_attivita, '{}'::text[])) g
      where upper(g) = 'SOSTITUZIONE MISURATORI'
    )
    and not exists (
      select 1 from jsonb_array_elements(t.campi) e where e->>'chiave' = 'matricola_nuova'
    )
),
esteso as (
  select
    o.id,
    (select coalesce(
              jsonb_agg(
                case when (e->>'ordine')::int >= o.ordine
                     then jsonb_set(e, '{ordine}', to_jsonb((e->>'ordine')::int + 1))
                     else e end
              ),
              '[]'::jsonb)
       from jsonb_array_elements(o.campi) e)
    || jsonb_build_array(jsonb_build_object(
         'chiave', 'matricola_nuova',
         'etichetta', 'MATRICOLA NUOVO MISURATORE',
         'tipo', 'matricola',
         'obbligatoria', true,
         'obbligatoria_se', null,
         'ordine', o.ordine
       )) as campi
  from obiettivo o
),
ordinato as (
  -- L'array esce ordinato per `ordine` come lo scrive l'editor: l'app riordina comunque,
  -- ma un array coerente è quello che si legge in un dump senza doverlo ricomporre a mente.
  select x.id, (select jsonb_agg(e order by (e->>'ordine')::int)
                  from jsonb_array_elements(x.campi) e) as campi
  from esteso x
)
update rapportino_template t
   set campi = o.campi
  from ordinato o
 where t.id = o.id;
