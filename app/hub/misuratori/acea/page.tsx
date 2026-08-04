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
 * `mostraCesta`: la colonna c'era già come «pallet» ed è la stessa, rinominata il 2026-08-04
 * quando i due nomi si sono rivelati la stessa cosa — il contenitore numerato con cui la
 * riconsegna viaggia. Le due commesse hanno la stessa colonna, lo stesso filtro, la stessa
 * barra di assegnazione e la stessa cella scrivibile; a differenziarle resta CHI scrive il
 * numero (qui l'ufficio, di là l'operatore allo scarico). Il PDR è il solo campo che ACEA ha
 * e l'altra no: quello è del gas.
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
        mostraCesta
        // L'invariante per cui scrivere o togliere il numero dichiara anche lo scarico a
        // deposito resta SOLO di AcquaLatina (AGENTS.md §13): qui la cesta è un riferimento e
        // basta, e questo registro non accende quel flag — resta sul suo default spento.
        breadcrumb={
          <Breadcrumb items={[{ label: 'Misuratori', href: '/hub/misuratori' }, { label: 'ACEA' }]} />
        }
      />
    </AuthGate>
  );
}
