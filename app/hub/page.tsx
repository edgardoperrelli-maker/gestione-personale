import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import TrasfertaAlert from '@/components/trasferta/TrasfertaAlert';
import RapportiniKpi from '@/components/modules/dashboard/RapportiniKpi';
import DashboardTodayMap from '@/components/modules/dashboard/DashboardTodayMap';
import PremialitaPanel from '@/components/modules/dashboard/PremialitaPanel';
import { canViewPremialita, resolveAssignableRole } from '@/lib/moduleAccess';
import { selectTodayOperators, type TodayAssignmentRow } from '@/lib/dashboard/todayOperators';
import { isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';

export const dynamic = 'force-dynamic';

function fmtDay(d: Date) {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type RawAssignmentRow = {
  day_id: string;
  staff: { id: string; display_name: string } | Array<{ id: string; display_name: string }> | null;
  territory:
    | { id: string; name: string; lat: number | null; lng: number | null }
    | Array<{ id: string; name: string; lat: number | null; lng: number | null }>
    | null;
};

async function loadTodayOperators(
  supabase: ReturnType<typeof createServerComponentClient>,
  todayIso: string,
): Promise<TodayAssignmentRow[]> {
  const [{ data: calendarDays }, { data: staffRaw }] = await Promise.all([
    supabase.from('calendar_days').select('id, day').eq('day', todayIso),
    supabase.from('staff').select('id, display_name, valid_from, valid_to'),
  ]);

  const dayIds = (calendarDays ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length === 0) return [];

  const staffById = new Map<string, Staff>();
  ((staffRaw ?? []) as Staff[]).forEach((s) => staffById.set(s.id, s));

  const { data } = await supabase
    .from('assignments')
    .select(`
      day_id,
      staff:staff_id ( id, display_name ),
      territory:territory_id ( id, name, lat, lng )
    `)
    .in('day_id', dayIds);

  return ((data ?? []) as RawAssignmentRow[])
    .map((row) => ({ staff: firstRelation(row.staff), territory: firstRelation(row.territory) }))
    .filter((a) => isStaffValidOnDay(a.staff ? staffById.get(a.staff.id) : null, todayIso, todayIso))
    .map((a) => ({
      staffId: a.staff?.id ?? '',
      displayName: a.staff?.display_name ?? '-',
      territoryName: a.territory?.name ?? null,
      lat: a.territory?.lat ?? null,
      lng: a.territory?.lng ?? null,
    }));
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const showPremialita = canViewPremialita(role);

  const todayIso = fmtDay(new Date());
  const todayRows = await loadTodayOperators(supabase, todayIso);
  const operators = selectTodayOperators(todayRows);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <TrasfertaAlert />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">Dashboard</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Stato dei rapportini e operatori sul territorio per oggi.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <RapportiniKpi />
          {showPremialita && <PremialitaPanel />}
        </div>
        <DashboardTodayMap operators={operators} />
      </div>
    </main>
  );
}
