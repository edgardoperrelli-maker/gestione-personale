-- Colonna "Causa dello scostamento" ACEA sul portale snapshot.
-- Serve al SAL "pagato": ACEA remunera SOLO le causali che iniziano per "E"
-- (dunning: ECE2/EESM/EFRE/EFRI/EIES/EMMR/ETAA; massive: EANC/EIEA/EIES).
-- Le non-E (NMNT/NPRT/NNCT…) sono scostamenti a nostro carico → esclusi dal SAL.
-- Popolata dall'agente (export cruscotto) via /api/agente/report. Nullable:
-- finché è assente il SAL la include (fallback in scostamentoPagato).
alter table acea_portale_snapshot add column if not exists causa_scostamento text;
