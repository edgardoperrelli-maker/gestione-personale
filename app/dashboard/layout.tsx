import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';

function formatRole(role?: string | null) {
  if (!role) return 'Operatore';
  const map: Record<string, string> = {
    admin: 'Admin',
    operatore: 'Operatore',
    operator: 'Operatore',
    editor: 'Operatore',
    viewer: 'Operatore',
  };
  const key = role.toLowerCase();
  return map[key] ?? `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: async () => cookieStore });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .maybeSingle();

  const effectiveRole = resolveUserRole(profile?.role, user.app_metadata?.role);
  const roleLabel = formatRole(effectiveRole);
  const userName = profile?.username ?? user.email ?? undefined;
  const allowedModules = getAllowedModulesForUser(user.app_metadata, effectiveRole);

  return (
    <AppShell roleLabel={roleLabel} userName={userName} allowedModules={allowedModules}>
      {children}
    </AppShell>
  );
}
