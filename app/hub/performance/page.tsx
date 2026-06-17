import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import {
  getAllowedModulesForUser,
  resolveAssignableRole,
  resolveUserRole,
} from '@/lib/moduleAccess';
import { loadPerformanceData, loadPerformanceFilterOptions } from '@/lib/performance/load';
import type { PerfFilters } from '@/lib/performance/shape';
import PerformanceFilters from '@/components/modules/performance/PerformanceFilters';
import PerformancePanel from '@/components/modules/performance/PerformancePanel';

export const dynamic = 'force-dynamic';

function todayRomaISO(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}
function monthStartISO(): string {
  const t = todayRomaISO();
  return `${t.slice(0, 7)}-01`;
}

type SP = Record<string, string | string[] | undefined>;
function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  // Gate FORTE: solo admin_plus (come il cruscotto premialità).
  const assignable = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (assignable !== 'admin_plus') redirect('/hub');
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('performance')) redirect('/hub');

  const sp = await searchParams;
  let dateFrom = pick(sp.dateFrom) ?? monthStartISO();
  let dateTo = pick(sp.dateTo) ?? todayRomaISO();
  if (dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];

  const filters: PerfFilters = {
    dateFrom,
    dateTo,
    staffId: pick(sp.staffId),
    territorioId: pick(sp.territorioId),
    committente: pick(sp.committente),
    macroAttivita: pick(sp.macro),
  };
  const selOperator = pick(sp.selOperator) ?? null;

  const [options, data] = await Promise.all([
    loadPerformanceFilterOptions(),
    loadPerformanceData(filters, selOperator),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--brand-text-main)]">Performance operatori</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Cosa hanno fatto gli operatori: interventi completati per operatore, periodo, attività, committente e territorio.</p>
      </div>
      <PerformanceFilters
        operatori={options.operatori}
        territori={options.territori}
        committenti={options.committenti}
        minDate={options.minDate}
      />
      <PerformancePanel data={data} selOperator={selOperator} />
    </div>
  );
}
