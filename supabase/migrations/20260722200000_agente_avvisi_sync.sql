-- Avvisi salute OneDrive del PC-agente consegnati dal TICK orario (non solo dai giri):
-- il banner in /hub/agente resta fresco entro ~1h anche quando il giro serale è lontano.
-- Un tick sano consegna [] e spegne il banner da solo.
alter table public.agente_config
  add column if not exists avvisi_sync jsonb not null default '[]'::jsonb,
  add column if not exists avvisi_sync_il timestamptz;

comment on column public.agente_config.avvisi_sync is
  'Avvisi salute sincronizzazione OneDrive dal PC-agente (saluteSync.mjs), aggiornati a ogni tick.';
comment on column public.agente_config.avvisi_sync_il is
  'Istante dell''ultima consegna di avvisi_sync (tick).';
