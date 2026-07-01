-- Listino per ATTIVITÀ (non più solo per le 4 voci KPI). Il DUNNING ha molte attività
-- (Limitazione, Sospensione, Rimozione, Regolarizzazione, Riapertura, Riattivazione, sonde, bonifiche…)
-- e ognuna può avere un prezzo. La voce KPI (EL/ES/ERC/ERA) resta come raggruppamento opzionale.
--
-- Additiva/sicura: il codice vecchio (che leggeva voce/kpi) continua a funzionare durante il deploy;
-- il nuovo prezza per `attivita`. La UI "Scopri attività" popola le righe dai dati reali.

alter table acea_listino add column if not exists attivita text;   -- chiave normalizzata (UPPER, senza accenti)
alter table acea_listino add column if not exists etichetta text;  -- come mostrarla in UI

-- voce/kpi diventano opzionali (una riga per attività può non avere una delle 4 voci KPI).
-- I CHECK esistenti su (voce,kpi) restano soddisfatti quando entrambe sono NULL (UNKNOWN → pass).
alter table acea_listino alter column voce drop not null;
alter table acea_listino alter column kpi drop not null;

-- rimuove le 4 righe seed placeholder (voce-based, attivita NULL, prezzo 0): sostituite dal listino per attività
delete from acea_listino where attivita is null and prezzo = 0;

-- una tariffa per (committente, attività, inizio validità)
create unique index if not exists acea_listino_attivita_idx
  on acea_listino (committente, attivita, valido_dal) where attivita is not null;
