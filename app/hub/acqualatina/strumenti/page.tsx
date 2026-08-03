import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ObjectHeader from '@/components/ui/ObjectHeader';
import ImportMasterCard from '@/components/modules/acqualatina/ImportMasterCard';

export const dynamic = 'force-dynamic';

/**
 * Strumenti della commessa AcquaLatina: il caricamento del master.
 *
 * Foglietta a sé come in ACEA (DESIGN.md §7bis), e per lo stesso motivo: si apre quando arriva
 * il file del mese, non mentre si pianifica. La commessa gemella aveva questa porta dal primo
 * giorno; qui il master si caricava solo dall'area di sistema, e il modulo non aveva un posto
 * dove dire «il file si mette qui».
 */
export default async function AcqualatinaStrumentiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('acqualatina')) redirect('/hub');

  return (
    <AuthGate>
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'AcquaLatina', href: '/hub/acqualatina' }, { label: 'Strumenti' }]} />
        <ObjectHeader
          title="Strumenti"
          sub="Il master del committente: si carica qui e il registro si allinea da sé."
        />
        <ImportMasterCard />
      </div>
    </AuthGate>
  );
}
