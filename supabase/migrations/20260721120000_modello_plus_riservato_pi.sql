-- Azioni operatori: modello del "+" univoco per committente + modelli riservati (2026-07-21).
--
-- 1) Colonna additiva riservato_pi: un modello riservato a un modulo dedicato (oggi il
--    Pronto Intervento, che api/admin/pi/token risolveva PER NOME) non alimenta il "+"
--    degli operatori né la Lista attesa; il suo committente serve solo a collocarlo
--    nell'albero del modulo Azioni operatori.
-- 2) Data fix "Pronto Intervento": committente=italgas (richiesta 2026-07-21),
--    scollegato dai gruppi (i solo_manuale non concorrono alla generazione per-voce:
--    collegato compariva sotto italgas/P.I. come fosse un flusso di generazione) e
--    marcato riservato. Sana anche lo stato in cui l'editor bloccava in silenzio
--    l'auto-save (manuale con committente NULL).
-- 3) Indice unico parziale: al più UN modello "+" attivo e non riservato per
--    committente — l'instradamento della modale "+" smette di dipendere
--    dall'ordine di ritorno delle query.
-- Idempotente: rieseguibile senza effetti collaterali.

alter table rapportino_template
  add column if not exists riservato_pi boolean not null default false;

update rapportino_template
set riservato_pi = true,
    committente = 'italgas',
    gruppo_committente = null,
    gruppi_attivita = null
where solo_manuale = true
  and attivita_norm(nome) = attivita_norm('Pronto Intervento')
  and (riservato_pi is distinct from true
       or committente is distinct from 'italgas'
       or gruppo_committente is not null
       or gruppi_attivita is not null);

create unique index if not exists rapportino_template_plus_univoco
  on rapportino_template (committente)
  where solo_manuale and active and not riservato_pi and committente is not null;
