import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import TrasfertaAlert from '@/components/trasferta/TrasfertaAlert';
import ObjectHeader from '@/components/ui/ObjectHeader';
import ModuleLauncher from '@/components/modules/dashboard/ModuleLauncher';
import { resolveAssignableRole, getAllowedModulesForUser } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

/**
 * Hub = lanciatore dei moduli. I pannelli di cruscotto (stato rapportini, mappa
 * operatori di oggi, premialità Acea) sono stati rimossi il 2026-07-23: la
 * pagina serve a partire, non ad analizzare — i numeri vivono nei rispettivi
 * moduli. Con loro sono cadute anche le query che li alimentavano.
 */
export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user?.app_metadata, role);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <TrasfertaAlert />

      <ObjectHeader
        title="Dashboard"
        sub="I moduli a cui hai accesso."
      />

      <ModuleLauncher allowedModules={allowedModules} />
    </main>
  );
}
