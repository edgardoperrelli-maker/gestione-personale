import 'server-only';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveAssignableRole, resolveUserRole } from '@/lib/moduleAccess';

/** Gate FORTE del modulo KPI: solo admin_plus con il modulo 'performance' abilitato. */
export async function assertKpiAccess(): Promise<void> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const assignable = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (assignable !== 'admin_plus') redirect('/hub');
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('performance')) redirect('/hub');
}
