import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveAssignableRole, resolveUserRole } from '@/lib/moduleAccess';
import { loadPerformanceBundle } from '@/lib/performance/load';
import PerformancePanel from '@/components/modules/performance/PerformancePanel';

export const dynamic = 'force-dynamic';

export default async function PerformancePage() {
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

  const bundle = await loadPerformanceBundle();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--brand-text-main)]">Performance operatori</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Cosa hanno fatto gli operatori: interventi completati, con produzione giornaliera e filtri indipendenti per ogni grafico.</p>
      </div>
      <PerformancePanel
        rows={bundle.rows}
        operatori={bundle.operatori}
        territori={bundle.territori}
        committenti={bundle.committenti}
        minDate={bundle.minDate}
      />
    </div>
  );
}
