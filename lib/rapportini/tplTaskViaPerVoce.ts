// lib/rapportini/tplTaskViaPerVoce.ts
// Flag `task_via` del flusso PER-VOCE, per la guardia di contenitoreTaskVia: una voce di un
// flusso non task-via non è mai un contenitore, anche sotto una testata task-via (rapportino
// misto o testata sbagliata — piano PERUGIA 2026-08-17). Best-effort: colonna `template_id`
// per-voce non ancora migrata, template cancellato o errore di lettura → mappa vuota/parziale,
// e per quelle voci vale la testata (comportamento storico).
import type { SupabaseClient } from '@supabase/supabase-js';

export async function tplTaskViaPerVoce(
  db: SupabaseClient,
  voci: Array<{ id: string; template_id?: string | null }>,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const tplIds = [...new Set(voci.map((v) => v.template_id).filter((x): x is string => Boolean(x)))];
  if (tplIds.length === 0) return out;
  const { data, error } = await db.from('rapportino_template').select('id, task_via').in('id', tplIds);
  if (error) return out;
  const flagByTpl = new Map(
    ((data ?? []) as Array<{ id: string; task_via?: boolean | null }>)
      .filter((t) => typeof t.task_via === 'boolean')
      .map((t) => [t.id, Boolean(t.task_via)]),
  );
  for (const v of voci) {
    if (v.template_id && flagByTpl.has(v.template_id)) out.set(v.id, flagByTpl.get(v.template_id)!);
  }
  return out;
}
