-- Template di default per il Pronto Intervento (campi dinamici personalizzabili).
-- Spec §4.1/§8. committente=null + is_default=false → NON interferisce con la
-- risoluzione template del flusso manuale (risolviTemplateCommittente). solo_manuale=true
-- → compare nella scheda "Interventi manuali" dell'editor template.
-- Indirizzo→info 'via', Comune→info 'comune' (mappano su interventi.indirizzo/comune).

insert into rapportino_template (nome, committente, is_default, active, solo_manuale, info_campi, campi)
select
  'Pronto Intervento', null, false, true, true,
  '[
    {"chiave":"via","etichetta":"INDIRIZZO","ordine":1},
    {"chiave":"comune","etichetta":"COMUNE","ordine":2}
  ]'::jsonb,
  '[
    {"chiave":"n_segnalazione","etichetta":"N° SEGNALAZIONE","tipo":"testo","ordine":1},
    {"chiave":"ora_inizio","etichetta":"ORA INIZIO","tipo":"ora","ordine":2},
    {"chiave":"ora_fine","etichetta":"ORA FINE","tipo":"ora","ordine":3},
    {"chiave":"assistente_te","etichetta":"ASSISTENTE TE","tipo":"testo","ordine":4},
    {"chiave":"note","etichetta":"NOTE SVOLGIMENTO","tipo":"testo","ordine":5}
  ]'::jsonb
where not exists (select 1 from rapportino_template where nome = 'Pronto Intervento');
