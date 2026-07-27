import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole, resolveAssignableRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

// Stesso registro del modulo Misuratori (ACEA), su tabella e endpoint separati.
// Niente «Ricalcola»: quello ripesca dalla consuntivazione ACEA. Il registro
// AcquaLatina si popola da solo alla chiusura del rapportino (ESEGUITO = SI).
export default async function AcqualatinaMisuratoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('acqualatina')) redirect('/hub');
  const isAdminPlus = resolveAssignableRole(profile?.role, user.app_metadata?.role) === 'admin_plus';

  return (
    <AuthGate>
      <MisuratoriClient
        isAdminPlus={isAdminPlus}
        apiBase="/api/acqualatina/misuratori"
        titolo="Misuratori rimossi — AcquaLatina"
        sottotitolo="Contatori smontati in campo, dal deposito alla riconsegna al committente"
        mostraRicalcola={false}
        mostraPdr={false}
      />
    </AuthGate>
  );
}
