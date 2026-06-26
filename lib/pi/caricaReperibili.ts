import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RigaReperibile } from './reperibili';

/**
 * Carica i reperibili del cronoprogramma nella finestra [dal, al] (YYYY-MM-DD):
 * assignments con reperibile=true, risolti alla data di calendario e al nome staff.
 * Stesso schema del join in /api/export/assignments.
 */
export async function caricaReperibili(dal: string, al: string): Promise<RigaReperibile[]> {
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

  const { data: asg } = await supabaseAdmin
    .from('assignments')
    .select('day_id, staff_id, reperibile, staff:staff_id ( display_name )')
    .in('day_id', dayIds)
    .eq('reperibile', true);

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
