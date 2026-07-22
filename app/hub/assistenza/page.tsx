import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import AssistenzaClient from '@/components/modules/assistenza/AssistenzaClient';

export const dynamic = 'force-dynamic';

export default async function AssistenzaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('assistenza')) redirect('/hub');

  return (
    <AuthGate>
      <AssistenzaClient />
    </AuthGate>
  );
}
