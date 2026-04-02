import 'leaflet/dist/leaflet.css';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import MappaOperatoriClient, { type MappaStaffRow } from '@/components/modules/mappa/MappaOperatoriClient';

function fmtDay(d: Date) {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MappaPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: async () => cookieStore });

  const today = new Date();
  const dateFrom = fmtDay(addDays(today, -3));
  const dateTo = fmtDay(addDays(today, 4));

  const { data: territories } = await supabase
    .from('territories')
    .select('id, name, lat, lng')
    .order('name', { ascending: true });

  const { data: calendarDays } = await supabase
    .from('calendar_days')
    .select('id, day')
    .gte('day', dateFrom)
    .lte('day', dateTo)
    .order('day');

  const dayIdMap = new Map<string, string>();
  (calendarDays ?? []).forEach((d) => dayIdMap.set(d.id, d.day));

  const dayIds = (calendarDays ?? []).map((d) => d.id);

  type AssignmentRow = {
    day_id: string;
    reperibile: boolean;
    cost_center: string | null;
    staff: { id: string; display_name: string } | null;
    territory: { id: string; name: string; lat: number | null; lng: number | null } | null;
    activity: { id: string; name: string } | null;
  };

  type RawAssignmentRow = {
    day_id: string;
    reperibile: boolean;
    cost_center: string | null;
    staff: { id: string; display_name: string } | Array<{ id: string; display_name: string }> | null;
    territory:
      | { id: string; name: string; lat: number | null; lng: number | null }
      | Array<{ id: string; name: string; lat: number | null; lng: number | null }>
      | null;
    activity: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  };

  let assignments: AssignmentRow[] = [];
  if (dayIds.length) {
    const { data } = await supabase
      .from('assignments')
      .select(`
        id, day_id, reperibile, cost_center,
        staff:staff_id ( id, display_name ),
        territory:territory_id ( id, name, lat, lng ),
        activity:activity_id ( id, name )
      `)
      .in('day_id', dayIds);

    assignments = ((data ?? []) as RawAssignmentRow[]).map((row) => ({
      ...row,
      staff: firstRelation(row.staff),
      territory: firstRelation(row.territory),
      activity: firstRelation(row.activity),
    }));
  }

  const rows: MappaStaffRow[] = assignments.map((a) => ({
    staffId: a.staff?.id ?? '',
    displayName: a.staff?.display_name ?? '-',
    territoryId: a.territory?.id ?? null,
    territoryName: a.territory?.name ?? null,
    activityName: a.activity?.name ?? null,
    costCenter: a.cost_center ?? null,
    day: dayIdMap.get(a.day_id) ?? '',
    reperibile: !!a.reperibile,
    lat: a.territory?.lat ?? null,
    lng: a.territory?.lng ?? null,
  }));

  return (
    <MappaOperatoriClient
      rows={rows}
      territories={(territories ?? []) as Array<{ id: string; name: string; lat: number | null; lng: number | null }>}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  );
}
