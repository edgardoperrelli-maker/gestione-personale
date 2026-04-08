import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

export default async function ImpostazioniLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, username').eq('id', user.id).maybeSingle();

  const effectiveRole = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (effectiveRole !== 'admin') redirect('/dashboard');

  const roleLabel = 'Admin';
  const userName = profile?.username ?? user.email ?? undefined;
  const allowedModules = getAllowedModulesForUser(user.app_metadata, effectiveRole);

  return (
    <AppShell roleLabel={roleLabel} userName={userName} allowedModules={allowedModules}>
      {children}
    </AppShell>
  );
}
