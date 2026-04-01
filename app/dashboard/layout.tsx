import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';

function formatRole(role?: string | null) {
  if (!role) return 'Operatore';
  const map: Record<string, string> = {
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
    operatore: 'Operatore',
    operator: 'Operatore',
  };
  const key = role.toLowerCase();
  return map[key] ?? `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient({ cookies });
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', session.user.id)
    .maybeSingle();

  const roleLabel = formatRole(profile?.role);
  const userName = profile?.username ?? session.user.email ?? undefined;

  return (
    <AppShell roleLabel={roleLabel} userName={userName}>
      {children}
    </AppShell>
  );
}
