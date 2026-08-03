import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole, resolveAssignableRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

/**
 * Il registro misuratori ACEA — il contenuto storico di `/hub/misuratori`, che ora è la
 * landing delle commesse. Il motore è il default di `MisuratoriClient` (endpoint
 * `/api/misuratori`, ricalcolo dal lavoro chiuso, colonna PDR); il breadcrumb passa da
 * dentro, perché la radice del client è full-screen e una riga fuori sfonderebbe la viewport.
 *
 * `mostraPallet` dal 2026-08-03: il pallet non era un fatto di AcquaLatina, era arrivato prima
 * di là. Il ciclo fisico è identico — si accumula in cesta, a cesta piena si scrive il numero
 * del pallet su tutti i misuratori che ci sono finiti dentro — e ora le due commesse hanno la
 * stessa colonna, lo stesso filtro, la stessa barra di assegnazione e la stessa cella
 * scrivibile. Il PDR resta il solo campo che ACEA ha e l'altra no: quello è del gas.
 */
export default async function MisuratoriAceaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('misuratori')) redirect('/hub');
  const isAdminPlus = resolveAssignableRole(profile?.role, user.app_metadata?.role) === 'admin_plus';

  return (
    <AuthGate>
      <MisuratoriClient
        isAdminPlus={isAdminPlus}
        titolo="Misuratori rimossi — ACEA"
        mostraPallet
        breadcrumb={
          <Breadcrumb items={[{ label: 'Misuratori', href: '/hub/misuratori' }, { label: 'ACEA' }]} />
        }
      />
    </AuthGate>
  );
}
