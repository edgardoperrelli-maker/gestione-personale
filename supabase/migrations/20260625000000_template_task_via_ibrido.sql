-- Template "ibrido": nello stesso rapportino convivono le attività CLASSICHE (con esito) e le
-- voci BONIFICHE EXTRA (task-via: contenitore a sola via con il tasto "+"). A differenza di
-- `task_via` (che rende task-via l'INTERO rapportino), `task_via_ibrido` discrimina per-voce:
-- solo le voci con attività "BONIFICHE EXTRA" diventano contenitori, le altre restano classiche.
-- Additivo e nullable-safe: i template esistenti restano invariati (default false).
alter table rapportino_template
  add column if not exists task_via_ibrido boolean not null default false;
