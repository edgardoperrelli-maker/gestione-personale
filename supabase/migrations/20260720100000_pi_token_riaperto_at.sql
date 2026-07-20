-- Riapertura admin di un link P.I. tramite il toggle "Apri/Chiudi".
-- La validità del link resta governata da valido_al (Chiudi → valido_al=ieri → scaduto;
-- Apri → valido_al = data scelta). riaperto_at registra l'ultima riapertura (audit),
-- speculare a rapportini.riaperto_at. Additiva e retro-compatibile (null = mai riaperto).
alter table pi_token
  add column if not exists riaperto_at timestamptz;
