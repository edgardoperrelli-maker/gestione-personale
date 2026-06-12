import AppShell from '@/components/layout/AppShell';
import { PageTransitionWrapper } from '@/components/layout/PageTransitionWrapper';
import { ASSIGNABLE_ROLE_LABELS, getAllowedModulesForUser, isAdminAssignableRole, resolveAssignableRole } from '@/lib/moduleAccess';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle();

  const effectiveRole = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  const roleLabel = ASSIGNABLE_ROLE_LABELS[effectiveRole];

  const userName = profile?.username ?? user.email ?? undefined;
  const allowedModules = getAllowedModulesForUser(user.app_metadata, effectiveRole);

  return (
    <AppShell roleLabel={roleLabel} userName={userName} allowedModules={allowedModules} isAdmin={isAdminAssignableRole(effectiveRole)}>
      <PageTransitionWrapper>{children}</PageTransitionWrapper>
    </AppShell>
  );
}
