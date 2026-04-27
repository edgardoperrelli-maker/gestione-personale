import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { operatorNeedsHotelForTerritory } from '@/lib/trasferte';
import type { Territory } from '@/types';

type AssignmentStaffRelation = {
  id: string;
  display_name: string;
  home_territory_id?: string | null;
};

type AssignmentRow = {
  staff_id: string | null;
  territory_id: string | null;
  staff?: AssignmentStaffRelation | AssignmentStaffRelation[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const body = await req.json() as {
    from?: string;
    to?: string;
    territoryId?: string | null;
    territoryName?: string | null;
  };

  const from = String(body.from ?? '').trim();
  const to = String(body.to ?? from).trim();
  const territoryId = String(body.territoryId ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !territoryId) {
    return NextResponse.json({ error: 'Periodo o territorio non valido.' }, { status: 400 });
  }

  const [{ data: calendarDays, error: daysError }, { data: territoriesRaw, error: territoriesError }] = await Promise.all([
    supabaseAdmin
      .from('calendar_days')
      .select('id, day')
      .gte('day', from)
      .lte('day', to),
    supabaseAdmin
      .from('territories')
      .select('id, name, active')
      .order('name'),
  ]);

  const firstError = daysError ?? territoriesError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const dayIds = (calendarDays ?? []).map((day) => day.id);
  if (dayIds.length === 0) return NextResponse.json({ guests: [] });

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from('assignments')
    .select('staff_id, territory_id, staff:staff_id(id,display_name,home_territory_id)')
    .in('day_id', dayIds)
    .eq('territory_id', territoryId);

  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 500 });

  const territories = (territoriesRaw ?? []) as Territory[];
  const byStaff = new Map<string, { id: string; name: string; territory: string }>();
  for (const assignment of ((assignments ?? []) as AssignmentRow[])) {
    const staff = firstRelation(assignment.staff);
    if (!assignment.staff_id || !staff) continue;
    if (!operatorNeedsHotelForTerritory(staff.home_territory_id, territoryId, territories)) continue;
    byStaff.set(assignment.staff_id, {
      id: assignment.staff_id,
      name: staff.display_name,
      territory: body.territoryName ?? '',
    });
  }

  return NextResponse.json({ guests: [...byStaff.values()] });
}
