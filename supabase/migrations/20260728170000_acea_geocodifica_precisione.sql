-- Quanto è preciso il punto che abbiamo per una riga.
--
-- Non è un dettaglio contabile: decide se il gruppo si mostra come MISURATO o come STIMATO.
--
-- Serve ai ripieghi per gli indirizzi che i provider risolvono FUORI dal Lazio (omonimi di altre
-- regioni: «VIA ROMA 1» esiste ovunque). Invece di arrendersi si chiede meno — la via senza civico
-- a Roma, il solo comune altrove — e si ottiene un punto vero ma più grossolano. Quel punto fa
-- ereditare la microarea giusta, ma non dice dove sta il misuratore: va letto come «da queste
-- parti», e la tabella lo mostra smorzato con la tilde come gli altri gruppi stimati.
--
-- `civico` = l'indirizzo completo. `via` = strada senza numero. `comune` = un punto nel comune.

alter table acea_ordini
  add column if not exists geocodifica_precisione text
    check (geocodifica_precisione is null
           or geocodifica_precisione in ('civico', 'via', 'comune'));

-- Le righe già geocodificate lo erano sull'indirizzo completo: nessuna passava dai ripieghi,
-- che non esistevano.
update acea_ordini
set geocodifica_precisione = 'civico'
where geocodifica_esito = 'ok' and geocodifica_precisione is null;

comment on column acea_ordini.geocodifica_precisione is
  'civico | via | comune. Tutto ciò che non è «civico» produce un gruppo STIMATO, non misurato.';
