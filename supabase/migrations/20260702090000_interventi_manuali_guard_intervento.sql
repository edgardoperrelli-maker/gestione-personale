-- Blinda l'invariante "una richiesta manuale rifiutata/annullata/in_attesa non ha mai un
-- intervento canonico agganciato". Fino ad ora l'invariante reggeva solo per costruzione
-- applicativa (check-and-set atomico su stato='in_attesa' prima di creare l'intervento in
-- approva/route.ts, sia lane rapportino sia P.I.); questo CHECK la rende self-enforcing anche
-- contro futuri bug applicativi. Verificato: 0 righe esistenti in violazione al 2026-07-02.
alter table interventi_manuali
  drop constraint if exists interventi_manuali_intervento_solo_deciso;
alter table interventi_manuali
  add constraint interventi_manuali_intervento_solo_deciso
  check (intervento_id is null or stato in ('approvato', 'auto_liberi'));
