-- ============================================================================
-- MODULO ACQUA LATINA — la matricola del misuratore NUOVO diventa una colonna
-- ============================================================================
-- Richiesta: «matricola nuova» deve entrare nel modulo Interventi come colonna, ed essere
-- modificabile sia da lì sia dal modulo AcquaLatina, con le due tabelle allineate fra loro —
-- come già succede per PDR/impianto, nominativo, recapito.
--
-- Finora il dato viveva SOLO dentro `rapportino_voci.risposte.matricola_nuova` (la risposta al
-- campo del flusso «SOSTITUZIONE MISURATORI», migration 20260803160000): letto al volo per
-- decorare la griglia AcquaLatina (`matricolaNuovaPerChiave` in app/api/acea/ordini/route.ts),
-- mai scritto su `interventi` né su `acqualatina_ordini`, e in nessun punto modificabile dalla
-- griglia del registro.
--
-- Tre colonne nuove, stessa forma delle altre dell'anagrafica condivisa:
--  · interventi.matricola_nuova            — il valore canonico per intervento;
--  · acqualatina_ordini.matricola_nuova    — lo specchio a registro, editabile in griglia;
--  · acea_ordini.matricola_nuova           — sempre NULL: la select condivisa (`COLONNE` in
--    app/api/acea/ordini/route.ts) vale per le due tabelle, quindi la colonna deve esistere su
--    entrambe o la vista acqualatina cade con «column does not exist» (stesso contratto di
--    20260802140000 per nominativo/recapito).
--
-- La sorgente resta `rapportino_voci.risposte.matricola_nuova` per chi arriva dal campo
-- dell'operatore: il codice (non questa migration) la propaga da qui in poi verso `interventi`
-- e da lì verso `acqualatina_ordini`; un'edit dalla griglia AcquaLatina fa il percorso inverso.
-- Qui si backfilla solo lo storico, riempiendo i vuoti — mai sovrascrivendo un dato presente.

alter table public.interventi add column if not exists matricola_nuova text;
alter table public.acqualatina_ordini add column if not exists matricola_nuova text;
alter table public.acea_ordini add column if not exists matricola_nuova text;

comment on column public.interventi.matricola_nuova is
  'Matricola del misuratore INSTALLATO (sostituzione AcquaLatina), dalla risposta al campo '
  '«MATRICOLA NUOVO MISURATORE» del rapportino. Non è matricola_contatore, che è quello VECCHIO '
  'rimosso.';
comment on column public.acqualatina_ordini.matricola_nuova is
  'Specchio a registro di interventi.matricola_nuova, per la colonna «Matricola nuova» della '
  'griglia AcquaLatina — editabile da lì, propagata sull''intervento agganciato.';
comment on column public.acea_ordini.matricola_nuova is
  'Sempre NULL su ACEA: esiste per la forma della select condivisa col registro acqualatina.';

-- ─── Backfill 1: interventi ← la risposta già data dall'operatore ───────────
update public.interventi i
set matricola_nuova = nullif(trim(both from (v.risposte ->> 'matricola_nuova')), ''),
    updated_at = now()
from public.rapportino_voci v
where v.intervento_id = i.id
  and i.committente = 'acqualatina'
  and coalesce(i.matricola_nuova, '') = ''
  and coalesce(trim(both from (v.risposte ->> 'matricola_nuova')), '') <> '';

-- ─── Backfill 2: il registro CONVERGE dall'intervento, come già fa nominativo ───
update public.acqualatina_ordini o
set matricola_nuova = i.matricola_nuova,
    aggiornato_il = now()
from public.interventi i
where i.ordine_id = o.id
  and i.committente = 'acqualatina'
  and coalesce(i.matricola_nuova, '') <> ''
  and coalesce(o.matricola_nuova, '') = '';
