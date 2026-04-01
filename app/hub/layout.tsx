import AppShell from '@/components/layout/AppShell';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', session.user.id)
    .maybeSingle();

  const roleLabel =
    profile?.role === 'admin' ? 'Admin' :
    profile?.role === 'editor' ? 'Editor' : 'Operatore';

  const userName = profile?.username ?? session.user.email ?? undefined;

  return (
    <AppShell roleLabel={roleLabel} userName={userName}>
      {children}
    </AppShell>
  );
}
