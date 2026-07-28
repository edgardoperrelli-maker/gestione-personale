-- Ripara il trigger di `acea_ordini` e `acea_impianti`: ogni UPDATE su quelle due tabelle falliva.
--
-- COSA SUCCEDEVA. Le due tabelle sono state create con le colonne in italiano — `creato_il` e
-- `aggiornato_il` — ma con addosso il trigger `set_updated_at()`, che fa `new.updated_at = now()`.
-- Quella colonna lì non esiste, quindi Postgres rifiutava l'intera istruzione con
-- «record "new" has no field "updated_at"». Non un aggiornamento sbagliato: un UPDATE impossibile.
--
-- QUANTO PESAVA. Il registro si popola per upsert: l'INSERT di un ODL nuovo passava, ma il ramo di
-- aggiornamento di un ODL già presente no. Un ordine che cambiava stato in ACEA non poteva
-- aggiornarsi qui — e l'errore usciva a import in corso, non a schema.
--
-- Delle 19 tabelle che montano `set_updated_at()`, 17 hanno davvero `updated_at` e funzionano. Le
-- uniche due rotte sono le due battezzate in italiano: il difetto è nel trigger scelto, non nelle
-- tabelle.
--
-- PERCHÉ COSÌ. Si aggiunge una funzione gemella che scrive il nome giusto, invece di:
--   - rinominare `aggiornato_il` → `updated_at`, che tocca una tabella da 66 colonne e ogni query
--     che la nomina, per un problema che sta nel trigger;
--   - aggiungere una colonna `updated_at` accanto ad `aggiornato_il`, lasciando due timestamp con
--     lo stesso significato e due nomi diversi — cioè la prossima domanda «quale dei due è buono?».

create or replace function public.set_aggiornato_il()
returns trigger
language plpgsql
as $$
begin
  new.aggiornato_il = now();
  return new;
end;
$$;

comment on function public.set_aggiornato_il() is
  'Gemella di set_updated_at() per le tabelle con le colonne in italiano (acea_ordini, acea_impianti).';

drop trigger if exists acea_ordini_set_updated_at on public.acea_ordini;
create trigger acea_ordini_set_aggiornato_il before update on public.acea_ordini
  for each row execute function public.set_aggiornato_il();

drop trigger if exists acea_impianti_set_updated_at on public.acea_impianti;
create trigger acea_impianti_set_aggiornato_il before update on public.acea_impianti
  for each row execute function public.set_aggiornato_il();
