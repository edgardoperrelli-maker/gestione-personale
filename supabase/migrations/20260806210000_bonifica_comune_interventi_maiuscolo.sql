-- Bonifica: il `comune` degli interventi in MAIUSCOLO, come dice la regola di casa.
--
-- LA REGOLA C'ERA GIÀ. docs/superpowers/specs/2026-06-25-dati-maiuscolo-design.md: il testo
-- inserito da operatori e backoffice si salva sempre in MAIUSCOLO, su due livelli — il client
-- mentre si digita, il server prima di scrivere. La migrazione dello storico di quel giorno
-- ha coperto `rapportino_voci`, `rapportini`, `interventi_manuali`, i template e le anagrafiche
-- di configurazione. NON ha coperto `interventi`, che è la tabella canonica dove quei dati
-- finiscono: da lì è passato tutto quello che si vede qui sotto.
--
-- E il secondo livello non c'era: `lib/interventi/manuali/richiestaToIntervento.ts` si fermava al
-- trim. Il primo livello da solo non ha tenuto — misurato su 2.802 interventi manuali, nominativo,
-- matricola, ODL e PDR erano puliti al 100%, `comune` e `indirizzo` no. È esattamente il caso per
-- cui la spec ne vuole due.
--
-- QUANTO È COSTATO. Il registro ACEA massive confronta il comune con un uguale SECCO
-- (app/api/acea/ordini/route.ts) contro valori che `lib/acea/comuniMassive.ts` produce già
-- maiuscoli. Filtrare i «Chiusi» per ZAGAROLO tornava 2.488 righe invece di 2.738: 250 sparite,
-- con un conteggio coerente con sé stesso e quindi senza niente che lo denunciasse.
--
-- L'AMBITO. 330 righe, tre forme in tutto («Zagarolo» e due varianti italgas). Tutte, non le sole
-- massive: la regola non è della commessa ACEA, e lasciarne fuori sette perché stanno su un altro
-- committente vorrebbe dire ricreare lo stesso difetto in un altro angolo.
--
-- IL BACKUP, come il 25/06. `upper()` è irreversibile — la forma originale non si ricostruisce —
-- quindi la coppia (id, comune) di prima resta in `bak_maiusc_interventi_comune` e il rollback è
-- una riga di SQL. La tabella si droppa quando l'esito è confermato, come le `bak_maiusc_*`
-- dell'altra volta.

-- 1. Il prima, per poter tornare indietro.
create table if not exists public.bak_maiusc_interventi_comune as
select id, comune
from public.interventi
where comune is not null and comune <> upper(btrim(comune));

comment on table public.bak_maiusc_interventi_comune is
  'Backup di interventi.comune prima della bonifica MAIUSCOLO del 06/08/2026 (330 righe). '
  'Rollback: update interventi i set comune = b.comune from bak_maiusc_interventi_comune b '
  'where b.id = i.id. Droppabile a esito confermato.';

-- 2. La bonifica. `btrim` insieme a `upper` perché un uguale secco non perdona uno spazio più di
--    quanto non perdoni una minuscola, ed è la stessa coppia che ora applica `normalizza` nel
--    codice (trim, poi maiuscolo).
update public.interventi
set comune = upper(btrim(comune))
where comune is not null and comune <> upper(btrim(comune));
