-- supabase/migrations/20260805100000_guardia_annullamento_voce_si.sql
--
-- GUARDIA: un intervento la cui voce di rapportino dichiara «eseguito = SI» non può passare ad
-- ANNULLATO senza una motivazione esplicita. Nasce dal caso dell'ODL 957276247 (2026-08-05):
-- 4 interventi con lavoro dichiarato SI — e pagato da ACEA nel SAL 1 — erano stati annullati
-- senza motivo, senza riferimento e senza traccia in audit; `annullato` è terminale, quindi il
-- SI della voce non poteva più chiuderli e il lavoro spariva da produzione, Esitato e pre-SAL
-- (ripristinati dalla migration 20260805090000).
--
-- La porta legittima resta aperta: i flussi dell'app che annullano un lavoro dichiarato
-- scrivono SEMPRE, nello stesso UPDATE, `esito_motivo` (annullamento motivato) oppure
-- `riconciliazione_rif_id` (doppio positivo, con l'originale come riferimento). Quello che il
-- trigger rifiuta è solo l'annullamento MUTO — che nessun flusso produce: se compare, è un
-- errore o un update manuale da fermare.
--
-- Solo sulla TRANSIZIONE verso annullato (old ≠ annullato): gli annullati storici restano
-- aggiornabili (backfill anagrafici, bonifiche) senza inciampare nel trigger.

create or replace function interventi_blocca_annullamento_voce_si()
returns trigger
language plpgsql
as $$
begin
  if new.stato = 'annullato'
     and coalesce(old.stato, '') <> 'annullato'
     and coalesce(btrim(new.esito_motivo), '') = ''
     and new.riconciliazione_rif_id is null
     and exists (
       select 1 from rapportino_voci v
       where v.intervento_id = new.id
         and upper(btrim(coalesce(v.risposte->>'eseguito', ''))) = 'SI'
     )
  then
    raise exception
      'Annullamento rifiutato: la voce di rapportino dell''intervento % dichiara «eseguito = SI». Serve una motivazione (esito_motivo) o un riferimento di riconciliazione nello stesso UPDATE.',
      new.id
      using errcode = 'P0001',
            hint = 'Lavoro dichiarato fatto sul campo: se va davvero annullato, scrivi il perché.';
  end if;
  return new;
end;
$$;

drop trigger if exists interventi_blocca_annullamento_voce_si on interventi;
create trigger interventi_blocca_annullamento_voce_si
  before update of stato on interventi
  for each row
  execute function interventi_blocca_annullamento_voce_si();
