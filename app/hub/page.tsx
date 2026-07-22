import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import TrasfertaAlert from '@/components/trasferta/TrasfertaAlert';
import RapportiniKpi from '@/components/modules/dashboard/RapportiniKpi';
import DashboardTodayMap from '@/components/modules/dashboard/DashboardTodayMap';
import PremialitaPanel from '@/components/modules/dashboard/PremialitaPanel';
import FogliettaCard from '@/components/ui/FogliettaCard';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { canViewPremialita, resolveAssignableRole, getAllowedModulesForUser } from '@/lib/moduleAccess';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';
import { selectTodayOperators, type TodayAssignmentRow } from '@/lib/dashboard/todayOperators';
import { isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';
import { getPeriodoBimestrale } from '@/lib/interventi/periodoKpi';
import { aggregaConteggiKpi } from '@/lib/interventi/kpiAggregation';
import { valutaKpi, SOGLIA_MINIMA, type KpiResult } from '@/lib/premialita/acea';

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

/**
 * Calcola i KPI premialità Acea del bimestre corrente dagli interventi reali.
 * Finestra per DATA DI ASSEGNAZIONE (`assegnato_at`); denominatore = interventi
 * non annullati (inclusi gli aperti). Efficienza dichiarata in gara: da
 * `kpi_contratto` se presente, altrimenti soglia minima (banda prezzo neutra).
 */
async function loadKpiPremialita(
  supabase: ReturnType<typeof createServerComponentClient>,
  todayIso: string,
): Promise<KpiResult[]> {
  const periodo = getPeriodoBimestrale(todayIso);

  const { data: rows } = await supabase
    .from('interventi')
    .select('voce, esito, stato')
    .eq('committente', 'acea')
    .in('voce', [10, 11, 12, 6])
    .gte('assegnato_at', `${periodo.inizio}T00:00:00`)
    .lte('assegnato_at', `${periodo.fine}T23:59:59`);

  const conteggi = aggregaConteggiKpi(
    (rows ?? []) as Array<{ voce: number | null; esito: string | null; stato: string }>,
  );
  const totaleDovuti = conteggi.reduce((s, c) => s + c.assegnatiDovuti, 0);
  if (totaleDovuti === 0) return [];

  const { data: contratti } = await supabase
    .from('kpi_contratto')
    .select('kpi, efficienza_dichiarata')
    .eq('committente', 'acea')
    .eq('periodo_inizio', periodo.inizio);
  const dichiarataByKpi = new Map<string, number>(
    ((contratti ?? []) as Array<{ kpi: string; efficienza_dichiarata: number | null }>)
      .filter((c) => c.efficienza_dichiarata != null)
      .map((c) => [c.kpi, c.efficienza_dichiarata as number]),
  );

  return conteggi.map((c) =>
    valutaKpi({
      code: c.code,
      eseguitiPositivi: c.eseguitiPositivi,
      assegnatiDovuti: c.assegnatiDovuti,
      efficienzaDichiarata: dichiarataByKpi.get(c.code) ?? SOGLIA_MINIMA,
    }),
  );
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
  const allowedModules = getAllowedModulesForUser(user?.app_metadata, role);
  const showLivePromo = allowedModules.includes('live');

  const todayIso = fmtDay(new Date());
  const todayRows = await loadTodayOperators(supabase, todayIso);
  const operators = selectTodayOperators(todayRows);
  const kpis = showPremialita ? await loadKpiPremialita(supabase, todayIso) : undefined;

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <TrasfertaAlert />

      <ObjectHeader
        title="Dashboard"
        sub="Stato dei rapportini e operatori sul territorio per oggi."
      />

      {showLivePromo && (
        <FogliettaCard
          href="/hub/live"
          title="Live"
          description="Interventi del giorno in tempo reale · mappa e board per operatore"
          icon={MODULE_ICONS.live}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <RapportiniKpi />
          {showPremialita && <PremialitaPanel kpis={kpis} />}
        </div>
        <DashboardTodayMap operators={operators} />
      </div>
    </main>
  );
}
