import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RigaReperibile } from './reperibili';

/** Territori associati a una foglia P.I. (vuoto = nessuna mappatura → tutti i territori). */
export async function territoriDellArea(areaCodice: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('pi_aree_territori')
    .select('territory_id')
    .eq('area_codice', areaCodice);
  return ((data ?? []) as Array<{ territory_id: string }>).map((r) => r.territory_id);
}

/**
 * Carica i reperibili del cronoprogramma nella finestra [dal, al] (YYYY-MM-DD):
 * assignments con reperibile=true, risolti alla data di calendario e al nome staff.
 * Se `territoryIds` è valorizzato, filtra ai soli territori della foglia.
 * Stesso schema del join in /api/export/assignments.
 */
export async function caricaReperibili(dal: string, al: string, territoryIds?: string[]): Promise<RigaReperibile[]> {
  const { data: days } = await supabaseAdmin
    .from('calendar_days')
    .select('id, day')
    .gte('day', dal)
    .lte('day', al);

  const dayMap = new Map<string, string>();
  const dayIds: string[] = [];
  for (const d of (days ?? []) as Array<{ id: string; day: string }>) {
    dayMap.set(d.id, d.day);
    dayIds.push(d.id);
  }
  if (dayIds.length === 0) return [];

  let q = supabaseAdmin
    .from('assignments')
    .select('day_id, staff_id, reperibile, territory_id, staff:staff_id ( display_name )')
    .in('day_id', dayIds)
    .eq('reperibile', true);
  if (territoryIds && territoryIds.length > 0) q = q.in('territory_id', territoryIds);
  const { data: asg } = await q;

  const out: RigaReperibile[] = [];
  for (const a of (asg ?? []) as Array<{
    day_id: string;
    staff_id: string | null;
    staff: { display_name?: string } | { display_name?: string }[] | null;
  }>) {
    const data = dayMap.get(a.day_id);
    if (!data || !a.staff_id) continue;
    const staff = Array.isArray(a.staff) ? a.staff[0] : a.staff;
    out.push({ data, staff_id: a.staff_id, staff_name: staff?.display_name ?? null });
  }
  return out;
}
