-- Pronto Intervento — attivazione foglia Lazio Centro/Est (test) e flag contabilità.
-- Le foglie senza contabilità su articoli (Lazio, Perugia) mostrano solo la tabella
-- riepilogativa modificabile; Firenze mantiene listino + contabilità.

alter table pi_aree
  add column if not exists usa_contabilita boolean not null default true;

update pi_aree set usa_contabilita = false where codice in ('lazio_centro_est', 'perugia');
update pi_aree set attiva = true where codice = 'lazio_centro_est';
